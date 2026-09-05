"use server";

/**
 * PaiGun — Server Actions ทั้งหมดของแอป
 *
 * หลักการของไฟล์นี้
 * 1. ทุก action คืน `ActionResult` เสมอ ไม่ throw ออกไปให้ผู้ใช้เห็น stack
 *    ฟอร์มจึงเขียนแบบ `const r = await action(...); if (!r.ok) setError(r.error)`
 *    ได้เลย ไม่ต้อง try/catch และไม่มีหน้า error ของ Next เด้งขึ้นมา
 * 2. ห้ามเชื่อ input จาก client เลยแม้แต่นิด — ทุกค่าถูกตรวจใหม่ที่นี่
 *    (ฝั่ง client ตรวจเพื่อ UX ฝั่งนี้ตรวจเพื่อความถูกต้อง)
 * 3. ตัวตนของผู้เข้าร่วม (แขก) = token ในลิงก์ ไม่ต้องล็อกอิน
 *    ตัวตนของเจ้าภาพ = session คุกกี้ (ดู lib/auth/session.ts) แทน adminKey เดิม
 *    ทุก action ของเจ้าภาพจึงเช็ก getSessionUser() ก่อนทำงานทุกครั้ง
 * 4. การอ่าน-แก้-เขียน ทำผ่าน `updateTrip` ของ store เพื่อให้อยู่ในคิวเดียวกัน
 *    (กันสองคนกดบันทึกพร้อมกันแล้วทับกันหาย)
 *
 * ⚠️ actions เหล่านี้แตะไฟล์ผ่าน lib/store.ts จึงต้องรันบน Node runtime
 *    (ค่าเริ่มต้นของ Next อยู่แล้ว — อย่าไปตั้ง `runtime = "edge"` ในหน้าที่เรียก)
 */

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/auth/session";
import { addDays, daysBetween, eachDay, isISODate } from "@/lib/dates";
import { makeId, makeToken } from "@/lib/ids";
import {
  InputError,
  MAX_MEMBERS,
  MAX_NAME_LENGTH,
  createTrip,
  findParticipantByToken,
  nameKey,
  uniqueName,
  updateTrip,
} from "@/lib/store";
import type { AvailState, CreateTripInput, Participant, Rsvp, Trip } from "@/lib/types";

/** ผลลัพธ์มาตรฐานของทุก action — discriminated union ให้ฟอร์มแยกกรณีได้ตรง ๆ */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** จำนวนคีย์สูงสุดที่ยอมรับใน payload ของ days — กันคนยิง object ยักษ์เข้ามา */
const MAX_DAY_KEYS = 400;
/** พาเพื่อน/แฟนมาเพิ่มได้สูงสุดกี่คน */
const MAX_PLUS_ONES = 10;

/* ------------------------------------------------------------------ *
 * เครื่องมือภายใน (ไม่ export — ไฟล์ "use server" export ได้แต่ async function)
 * ------------------------------------------------------------------ */

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

function fail<T>(error: string): ActionResult<T> {
  return { ok: false, error };
}

/**
 * แปลง error ที่จับได้เป็นข้อความสำหรับผู้ใช้
 *
 * `InputError` = ผู้ใช้อ่านแล้วแก้ได้ → ส่งข้อความนั้นออกไปตรง ๆ
 * อย่างอื่น = บั๊กหรือปัญหาระบบ (ดิสก์เต็ม สิทธิ์ไฟล์ ฯลฯ) → log ไว้ฝั่งเซิร์ฟเวอร์
 * แล้วส่งข้อความกลาง ๆ ออกไป ไม่รั่ว path หรือ stack ให้ผู้ใช้เห็น
 */
function toUserError(err: unknown, fallback: string): string {
  if (err instanceof InputError) return err.message;
  console.error("[actions] ข้อผิดพลาดที่ไม่คาดคิด:", err);
  return fallback;
}

/** ล้าง cache ของหน้าที่ได้รับผลกระทบจากการแก้ทริปหนึ่ง */
function revalidateTrip(slug: string): void {
  revalidatePath(`/t/${slug}`);
  revalidatePath(`/t/${slug}/result`);
}

/**
 * ตรวจว่าผู้ใช้ที่ล็อกอินอยู่ (จาก session คุกกี้) เป็นเจ้าของทริปนี้จริง
 * โยน InputError ถ้าไม่ผ่าน — ใช้แทน assertAdmin/adminKey เดิมทั้งหมด
 */
function assertOwner(trip: Trip, userId: string | null): void {
  if (userId === null) {
    throw new InputError("ต้องล็อกอินก่อนถึงจะแก้ทริปนี้ได้");
  }
  if (trip.ownerId !== userId) {
    throw new InputError("บัญชีนี้ไม่ใช่เจ้าของทริปนี้");
  }
}

/** ตรวจ token แล้วคืน participant คนนั้น — โยน InputError ถ้าไม่ตรงใคร */
async function requireParticipant(trip: Trip, token: string): Promise<Participant> {
  if (typeof token !== "string" || token === "") {
    throw new InputError("ลิงก์ส่วนตัวไม่ครบ — เปิดจากลิงก์ที่เจ้าภาพส่งให้อีกครั้ง");
  }
  const me = await findParticipantByToken(trip, token);
  if (me === null) {
    throw new InputError(
      "ลิงก์ส่วนตัวนี้ใช้ไม่ได้แล้ว — อาจถูกเจ้าภาพลบชื่อออก ลองขอลิงก์ใหม่จากเจ้าภาพ",
    );
  }
  return me;
}

/** แทน participant หนึ่งคนในทริป (คืน Trip ใหม่ ไม่แก้ของเดิม) */
function replaceParticipant(trip: Trip, updated: Participant): Trip {
  return {
    ...trip,
    participants: trip.participants.map((p) => (p.id === updated.id ? updated : p)),
  };
}

/* ------------------------------------------------------------------ *
 * สร้างทริป
 * ------------------------------------------------------------------ */

/**
 * เจ้าภาพสร้างทริปใหม่ — ต้องล็อกอินก่อนเท่านั้น (ดู lib/auth/session.ts)
 * คืน slug (ใช้ทำลิงก์แชร์) — ไม่มี adminKey อีกต่อไป ความเป็นเจ้าของอยู่ที่บัญชี
 * ที่ล็อกอินอยู่ ไม่ใช่กุญแจลับใน URL
 */
export async function createTripAction(
  input: Omit<CreateTripInput, "ownerId">,
): Promise<ActionResult<{ slug: string }>> {
  try {
    const user = await getSessionUser();
    if (user === null) {
      throw new InputError("ต้องล็อกอินก่อนถึงจะสร้างทริปได้");
    }
    const trip = await createTrip({ ...input, ownerId: user.id });
    revalidateTrip(trip.slug);
    revalidatePath("/");
    return ok({ slug: trip.slug });
  } catch (err) {
    return fail(
      toUserError(err, "สร้างทริปไม่สำเร็จเพราะระบบมีปัญหาในการบันทึกข้อมูล — ลองกดสร้างอีกครั้ง"),
    );
  }
}

/* ------------------------------------------------------------------ *
 * เข้าร่วมทริปเอง (จากลิงก์แชร์)
 * ------------------------------------------------------------------ */

/**
 * คนที่ได้ลิงก์แชร์มาเพิ่มชื่อตัวเองเข้าทริป
 *
 * ทำได้เฉพาะเมื่อเจ้าภาพเปิด allowSelfJoin และโพลยังเปิดอยู่
 *
 * กรณี "มาเคลมช่องที่เจ้าภาพจองชื่อไว้": ถ้าชื่อตรงกับคนที่มีอยู่แล้วและคนนั้น
 * ยังไม่เคยกดบันทึก (submittedAt === null) เราคืน token ของคนนั้นให้เลย
 * ไม่สร้างชื่อซ้ำ — เพราะเจ้าภาพมักพิมพ์ชื่อเพื่อนไว้ก่อนแล้วแชร์ลิงก์กลุ่ม
 * ถ้าคนนั้นบันทึกไปแล้ว ถือว่าเป็นคนละคนชื่อพ้องกัน → ต่อท้ายเป็น "(2)"
 */
export async function joinTripAction(
  slug: string,
  name: string,
): Promise<ActionResult<{ token: string; participantId: string }>> {
  try {
    let claimed: { token: string; participantId: string } | null = null;

    await updateTrip(slug, (trip) => {
      if (trip.allowSelfJoin !== true) {
        throw new InputError(
          "ทริปนี้ไม่เปิดให้เพิ่มชื่อเอง — ขอลิงก์ส่วนตัวของคุณจากเจ้าภาพโดยตรง",
        );
      }
      if (trip.status !== "polling") {
        throw new InputError(
          trip.status === "locked"
            ? "ทริปนี้ล็อกวันไปแล้ว จึงเพิ่มชื่อเองไม่ได้ — ทักเจ้าภาพให้เพิ่มให้"
            : trip.status === "cancelled"
              ? "ทริปนี้ถูกยกเลิกไปแล้ว — เพิ่มชื่อเองไม่ได้"
              : "ทริปนี้ปิดจบไปแล้ว — ถ้ายังอยากไป ทักเจ้าภาพให้เปิดทริปใหม่",
        );
      }

      const trimmed = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
      if (trimmed === "") {
        throw new InputError("ยังไม่ได้ใส่ชื่อ — ใส่ชื่อเล่นที่เพื่อนในกลุ่มเรียกคุณ");
      }
      if (trimmed.length > MAX_NAME_LENGTH) {
        throw new InputError(
          `ชื่อยาวเกิน ${MAX_NAME_LENGTH} ตัวอักษร — ใช้ชื่อเล่นสั้น ๆ พอให้เพื่อนรู้ว่าใคร`,
        );
      }

      const key = nameKey(trimmed);
      const existing = trip.participants.find((p) => nameKey(p.name) === key);

      // มาเคลมช่องที่ยังไม่มีใครตอบ → ใช้ token ของช่องนั้นเลย
      if (existing !== undefined && existing.submittedAt === null) {
        claimed = { token: existing.token, participantId: existing.id };
        return trip;
      }

      if (trip.participants.length >= MAX_MEMBERS) {
        throw new InputError(
          `ทริปนี้มีคนครบ ${MAX_MEMBERS} คนแล้ว จึงเพิ่มชื่อไม่ได้ — ทักเจ้าภาพให้จัดการ`,
        );
      }

      const taken = new Set(trip.participants.map((p) => nameKey(p.name)));
      const now = new Date().toISOString();
      const participant: Participant = {
        id: makeId(),
        // ชื่อพ้องกับคนที่ตอบแล้ว → ต่อท้ายให้แยกออก เช่น "เบส (2)"
        name: uniqueName(trimmed, taken),
        token: makeToken(),
        // คนที่เข้ามาเองไม่ถือเป็นคนสำคัญโดยปริยาย — เจ้าภาพติ๊กให้ทีหลังได้
        isKey: false,
        days: {},
        rsvp: null,
        plusOnes: 0,
        submittedAt: null,
        updatedAt: now,
      };
      claimed = { token: participant.token, participantId: participant.id };
      return { ...trip, participants: [...trip.participants, participant] };
    });

    if (claimed === null) {
      // ไปไม่ถึงจุดนี้ — ทุกเส้นทางข้างบนตั้งค่า claimed หรือ throw ไปแล้ว
      throw new InputError("เข้าร่วมไม่สำเร็จ — ลองกดอีกครั้ง");
    }

    revalidateTrip(slug);
    return ok(claimed);
  } catch (err) {
    return fail(toUserError(err, "เข้าร่วมทริปไม่สำเร็จเพราะระบบมีปัญหา — ลองกดอีกครั้ง"));
  }
}

/* ------------------------------------------------------------------ *
 * บันทึกวันว่าง
 * ------------------------------------------------------------------ */

/**
 * บันทึกวันว่างของคนหนึ่ง (ทับทั้งชุด — client ส่งสถานะปัจจุบันของปฏิทินมาทั้งหมด)
 *
 * ไม่เชื่อ client: วันที่อยู่นอกช่วง rangeStart..rangeEnd และค่าที่ไม่ใช่ 0/1/2
 * จะถูกทิ้งเงียบ ๆ ไม่ทำให้บันทึกล้มเหลว (ผู้ใช้ไม่ได้ทำอะไรผิด)
 */
export async function saveAvailabilityAction(
  slug: string,
  token: string,
  days: Record<string, AvailState>,
): Promise<ActionResult<null>> {
  try {
    await updateTrip(slug, async (trip) => {
      // โพลปิดแล้วแก้ไม่ได้ — ไม่งั้นผลที่ล็อกไปแล้วจะเปลี่ยนหลังบ้าน
      if (trip.status !== "polling") {
        throw new InputError(
          trip.status === "locked"
            ? "โพลปิดแล้วเพราะเจ้าภาพล็อกวันไปแล้ว — แก้วันว่างไม่ได้ ถ้าติดปัญหาให้ทักเจ้าภาพ"
            : trip.status === "cancelled"
              ? "ทริปนี้ถูกยกเลิกไปแล้ว — แก้วันว่างไม่ได้"
              : "ทริปนี้ปิดจบไปแล้ว — แก้วันว่างไม่ได้",
        );
      }

      const me = await requireParticipant(trip, token);

      if (typeof days !== "object" || days === null) {
        throw new InputError("ข้อมูลวันว่างที่ส่งมาไม่ถูกรูปแบบ — รีเฟรชหน้าแล้วลองใหม่");
      }
      const entries = Object.entries(days);
      if (entries.length > MAX_DAY_KEYS) {
        throw new InputError("ข้อมูลวันว่างมากเกินไป — รีเฟรชหน้าแล้วเลือกวันใหม่อีกครั้ง");
      }

      // กรองให้เหลือเฉพาะวันในช่วงจริงและค่าที่ถูกต้อง
      const allowed = new Set(eachDay(trip.rangeStart, trip.rangeEnd));
      const clean: Record<string, AvailState> = {};
      for (const [iso, value] of entries) {
        if (!allowed.has(iso)) continue;
        if (value === 0 || value === 1 || value === 2) clean[iso] = value;
      }

      const now = new Date().toISOString();
      return replaceParticipant(trip, {
        ...me,
        days: clean,
        // ตั้งครั้งแรกที่กดบันทึกเท่านั้น — ค่านี้คือ "ตอบแล้ว" ไม่ใช่ "แก้ล่าสุด"
        submittedAt: me.submittedAt ?? now,
        updatedAt: now,
      });
    });

    revalidateTrip(slug);
    return ok(null);
  } catch (err) {
    return fail(
      toUserError(err, "บันทึกวันว่างไม่สำเร็จเพราะระบบมีปัญหา — ลองกดบันทึกอีกครั้ง"),
    );
  }
}

/* ------------------------------------------------------------------ *
 * ล็อกวัน (เจ้าภาพ)
 * ------------------------------------------------------------------ */

/**
 * เจ้าภาพเลือกช่วงที่จะไปจริง — ล็อกแล้วโพลปิด และหน้าจะเปลี่ยนไปถาม RSVP
 * `start` คือวันแรกของช่วง ปลายช่วงคำนวณจาก lengthDays
 *
 * ล็อกซ้ำได้ (เปลี่ยนใจย้ายวันก่อนไปจริง) แต่ถ้าทริป done แล้วจะแก้ไม่ได้
 */
export async function lockDateAction(
  slug: string,
  start: string,
): Promise<ActionResult<null>> {
  try {
    const user = await getSessionUser();
    await updateTrip(slug, (trip) => {
      assertOwner(trip, user?.id ?? null);

      if (trip.status === "done") {
        throw new InputError("ทริปนี้ปิดจบไปแล้ว — ย้ายวันไม่ได้");
      }
      if (trip.status === "cancelled") {
        throw new InputError("ทริปนี้ถูกยกเลิกไปแล้ว — ล็อกวันไม่ได้");
      }
      const day = typeof start === "string" ? start.trim() : "";
      if (!isISODate(day)) {
        throw new InputError("วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD — เลือกช่วงจากตารางผลลัพธ์อีกครั้ง");
      }
      if (daysBetween(trip.rangeStart, day) < 0 || daysBetween(day, trip.rangeEnd) < 0) {
        throw new InputError(
          `วันที่เลือกอยู่นอกช่วงของทริป (${trip.rangeStart} ถึง ${trip.rangeEnd}) — เลือกวันในช่วงนี้`,
        );
      }
      const end = addDays(day, trip.lengthDays - 1);
      if (daysBetween(end, trip.rangeEnd) < 0) {
        throw new InputError(
          `ทริปยาว ${trip.lengthDays} วัน ถ้าเริ่ม ${day} จะจบวันที่ ${end} ซึ่งเลยช่วงที่เปิดโหวต ` +
            `(สิ้นสุด ${trip.rangeEnd}) — เลือกวันเริ่มที่เร็วกว่านี้`,
        );
      }

      return { ...trip, status: "locked", lockedStart: day };
    });

    revalidateTrip(slug);
    return ok(null);
  } catch (err) {
    return fail(toUserError(err, "ล็อกวันไม่สำเร็จเพราะระบบมีปัญหา — ลองกดอีกครั้ง"));
  }
}

/* ------------------------------------------------------------------ *
 * ยืนยันไปเที่ยว (RSVP)
 * ------------------------------------------------------------------ */

/**
 * ตอบยืนยันว่าไปไหม และพาใครมาเพิ่มกี่คน
 * ถามได้เฉพาะหลังล็อกวันแล้ว — ก่อนล็อกยังไม่รู้จะไปวันไหน ตอบไปก็ไม่มีความหมาย
 */
export async function setRsvpAction(
  slug: string,
  token: string,
  rsvp: Rsvp,
  plusOnes: number,
): Promise<ActionResult<null>> {
  try {
    await updateTrip(slug, async (trip) => {
      if (trip.status !== "locked") {
        throw new InputError(
          trip.status === "polling"
            ? "ยังไม่ได้ล็อกวัน — ตอนนี้กรอกได้แค่วันว่าง รอเจ้าภาพเลือกวันก่อนแล้วค่อยยืนยัน"
            : trip.status === "cancelled"
              ? "ทริปนี้ถูกยกเลิกไปแล้ว — เปลี่ยนคำตอบไม่ได้"
              : "ทริปนี้ปิดจบไปแล้ว — เปลี่ยนคำตอบไม่ได้",
        );
      }

      const me = await requireParticipant(trip, token);

      if (rsvp !== null && rsvp !== "going" && rsvp !== "maybe" && rsvp !== "out") {
        throw new InputError("คำตอบไม่ถูกต้อง — เลือกอย่างใดอย่างหนึ่งจากปุ่มที่ให้ไว้");
      }
      if (!Number.isInteger(plusOnes)) {
        throw new InputError("จำนวนคนที่พามาต้องเป็นจำนวนเต็ม เช่น 0 หรือ 1");
      }
      if (plusOnes < 0 || plusOnes > MAX_PLUS_ONES) {
        throw new InputError(`พามาเพิ่มได้ 0 ถึง ${MAX_PLUS_ONES} คน — ใส่จำนวนในช่วงนี้`);
      }

      return replaceParticipant(trip, {
        ...me,
        rsvp,
        // ไม่ไปก็พาใครมาไม่ได้ — บังคับเป็น 0 กันยอดหัวเพี้ยนตอนหารเงิน
        plusOnes: rsvp === "going" || rsvp === "maybe" ? plusOnes : 0,
        updatedAt: new Date().toISOString(),
      });
    });

    revalidateTrip(slug);
    return ok(null);
  } catch (err) {
    return fail(toUserError(err, "บันทึกคำตอบไม่สำเร็จเพราะระบบมีปัญหา — ลองกดอีกครั้ง"));
  }
}

/* ------------------------------------------------------------------ *
 * ลบคนออก (เจ้าภาพ)
 * ------------------------------------------------------------------ */

/**
 * เจ้าภาพลบคนออกจากทริป
 * มีไว้เพราะลิงก์แชร์หลุดง่าย — คนแปลกหน้าหรือคนกดเข้ามาผิดทริปต้องเอาออกได้
 * ลบแล้ว token ของคนนั้นใช้ไม่ได้ทันที (หา participant ไม่เจอ)
 */
export async function removeParticipantAction(
  slug: string,
  participantId: string,
): Promise<ActionResult<null>> {
  try {
    const user = await getSessionUser();
    await updateTrip(slug, (trip) => {
      assertOwner(trip, user?.id ?? null);

      const id = typeof participantId === "string" ? participantId : "";
      const target = trip.participants.find((p) => p.id === id);
      if (target === undefined) {
        throw new InputError("ไม่พบคนนี้ในทริป — อาจถูกลบไปแล้ว ลองรีเฟรชหน้า");
      }

      return {
        ...trip,
        participants: trip.participants.filter((p) => p.id !== id),
      };
    });

    revalidateTrip(slug);
    return ok(null);
  } catch (err) {
    return fail(toUserError(err, "ลบคนออกไม่สำเร็จเพราะระบบมีปัญหา — ลองกดอีกครั้ง"));
  }
}

/* ------------------------------------------------------------------ *
 * ยกเลิกทริป (เจ้าภาพ)
 * ------------------------------------------------------------------ */

/**
 * เจ้าภาพยกเลิกทริปนี้ทั้งอัน — ไม่ลบข้อมูลทิ้ง (คนที่ตอบไว้แล้วยังอยู่ในระบบ
 * เผื่อเจ้าภาพอยากดูย้อนหลัง) แค่เปลี่ยนสถานะเป็น "cancelled" ปิดไม่ให้แก้/ล็อก/
 * ยืนยันต่อได้อีก — action อื่น ๆ ทั้งหมดเช็กสถานะนี้แล้วคืน error ที่บอกชัดว่ายกเลิกไปแล้ว
 *
 * ยกเลิกซ้ำไม่ได้ และยกเลิกทริปที่ "done" (จบไปแล้วจริง) ไม่ได้เหมือนกัน —
 * ไม่มีเหตุผลจะยกเลิกทริปที่จบไปแล้ว
 */
export async function cancelTripAction(slug: string): Promise<ActionResult<null>> {
  try {
    const user = await getSessionUser();
    await updateTrip(slug, (trip) => {
      assertOwner(trip, user?.id ?? null);

      if (trip.status === "cancelled") {
        throw new InputError("ทริปนี้ถูกยกเลิกไปแล้ว");
      }
      if (trip.status === "done") {
        throw new InputError("ทริปนี้ปิดจบไปแล้ว — ยกเลิกไม่ได้อีก");
      }

      return { ...trip, status: "cancelled" };
    });

    revalidateTrip(slug);
    return ok(null);
  } catch (err) {
    return fail(toUserError(err, "ยกเลิกทริปไม่สำเร็จเพราะระบบมีปัญหา — ลองกดอีกครั้ง"));
  }
}
