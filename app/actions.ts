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
import { isAvatarKey } from "@/lib/avatars";
import { addDays, daysBetween, eachDay, isISODate } from "@/lib/dates";
import { makeId, makeToken } from "@/lib/ids";
import {
  InputError,
  MAX_COMMENT_LENGTH,
  MAX_LENGTH_DAYS,
  MAX_MEMBERS,
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_RANGE_DAYS,
  MAX_TITLE_LENGTH,
  createTrip,
  findParticipantByToken,
  getTrip,
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
 * แก้ไขข้อมูลพื้นฐานของทริป (เจ้าภาพ)
 * ------------------------------------------------------------------ */

export interface EditTripInput {
  title: string;
  note: string;
  rangeStart: string;
  rangeEnd: string;
  lengthDays: number;
  deadline: string | null;
  allowSelfJoin: boolean;
}

/**
 * เจ้าภาพแก้ชื่อ/โน้ต/ช่วงวันที่เปิดโหวต/ทริปยาวกี่วัน/เดดไลน์/allowSelfJoin
 * ทำได้เฉพาะตอนโพลยัง "polling" อยู่ — ล็อกวันไปแล้วแปลว่าตัดสินใจแล้ว เปลี่ยน
 * ช่วงวันตอนนั้นจะสับสน (ให้ยกเลิกแล้วตั้งใหม่แทนถ้าอยากเปลี่ยนหลังล็อก)
 *
 * ไม่แตะ participants เลย — เพิ่ม/ลบคนใช้ joinTripAction/removeParticipantAction
 * ถ้าช่วงวันใหม่แคบกว่าเดิมจนบางวันที่มีคนตอบไว้หลุดจากช่วง ข้อมูลวันนั้นไม่ถูกลบทิ้ง
 * แค่ไม่ถูกใช้คำนวณอีกต่อไป (lib/schedule.ts วนตาม eachDay(rangeStart, rangeEnd)
 * ปัจจุบันเท่านั้น) — ถ้าขยายช่วงกลับมาครอบคลุมอีกครั้ง ข้อมูลเดิมจะกลับมาใช้ได้เอง
 */
export async function editTripAction(
  slug: string,
  input: EditTripInput,
): Promise<ActionResult<null>> {
  try {
    const user = await getSessionUser();
    await updateTrip(slug, (trip) => {
      assertOwner(trip, user?.id ?? null);

      if (trip.status !== "polling") {
        throw new InputError(
          "แก้ไขข้อมูลพื้นฐานได้เฉพาะตอนโพลยังเปิดอยู่ — ถ้าล็อกวันไปแล้วอยากเปลี่ยน ให้ยกเลิกทริปนี้แล้วตั้งใหม่",
        );
      }

      const title = typeof input.title === "string" ? input.title.trim() : "";
      if (title === "") {
        throw new InputError("ยังไม่ได้ตั้งชื่อทริป — ใส่ชื่อสั้น ๆ ที่เพื่อนเห็นแล้วรู้เรื่อง");
      }
      if (title.length > MAX_TITLE_LENGTH) {
        throw new InputError(`ชื่อทริปยาวเกินไป — ย่อให้ไม่เกิน ${MAX_TITLE_LENGTH} ตัวอักษร`);
      }

      const note = typeof input.note === "string" ? input.note.trim() : "";
      if (note.length > MAX_NOTE_LENGTH) {
        throw new InputError(`รายละเอียดยาวเกินไป — ย่อให้ไม่เกิน ${MAX_NOTE_LENGTH} ตัวอักษร`);
      }

      const rangeStart = typeof input.rangeStart === "string" ? input.rangeStart.trim() : "";
      const rangeEnd = typeof input.rangeEnd === "string" ? input.rangeEnd.trim() : "";
      if (!isISODate(rangeStart) || !isISODate(rangeEnd)) {
        throw new InputError("วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD — เลือกวันจากปฏิทินอีกครั้ง");
      }
      const span = daysBetween(rangeStart, rangeEnd);
      if (Number.isNaN(span) || span < 0) {
        throw new InputError("วันสิ้นสุดต้องอยู่หลังวันเริ่ม — สลับสองวันนี้ให้ถูกลำดับ");
      }
      const rangeDays = span + 1;
      if (rangeDays > MAX_RANGE_DAYS) {
        throw new InputError(`ช่วงกว้าง ${rangeDays} วัน เกิน ${MAX_RANGE_DAYS} วันที่ระบบรับได้`);
      }

      const lengthDays = typeof input.lengthDays === "number" ? input.lengthDays : Number.NaN;
      if (!Number.isInteger(lengthDays) || lengthDays < 1 || lengthDays > MAX_LENGTH_DAYS) {
        throw new InputError(`ทริปยาวได้ 1 ถึง ${MAX_LENGTH_DAYS} วัน`);
      }
      if (rangeDays < lengthDays) {
        throw new InputError(
          `ช่วงที่เลือกมีแค่ ${rangeDays} วัน แต่ทริปยาว ${lengthDays} วัน — ขยายช่วงวันหรือลดจำนวนวันลง`,
        );
      }

      let deadline: string | null = null;
      if (typeof input.deadline === "string" && input.deadline.trim() !== "") {
        const raw = input.deadline.trim();
        if (Number.isNaN(Date.parse(raw))) {
          throw new InputError("อ่านวันปิดโพลไม่ออก — เลือกวันใหม่ หรือเว้นว่างไว้ถ้าไม่กำหนด");
        }
        deadline = raw;
      }

      return {
        ...trip,
        title,
        note,
        rangeStart,
        rangeEnd,
        lengthDays,
        deadline,
        allowSelfJoin: input.allowSelfJoin === true,
      };
    });

    revalidateTrip(slug);
    return ok(null);
  } catch (err) {
    return fail(toUserError(err, "แก้ไขทริปไม่สำเร็จเพราะระบบมีปัญหา — ลองอีกครั้ง"));
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
        avatarKey: null,
        comment: null,
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
 * กลับไปแก้คำตอบเดิมจากลิงก์กลุ่ม (ไม่ใช่ลิงก์ส่วนตัว)
 * ------------------------------------------------------------------ */

/**
 * แตะชื่อที่ "ตอบแล้ว" ในหน้าเลือกตัวตน → คืน token ของคนนั้นให้เลยไม่ต้องยืนยันอะไรเพิ่ม
 *
 * ⚠️ ตั้งใจไม่เช็กว่าใครเป็นคนกด — ทริปนี้ใช้ในกลุ่มเพื่อนที่รู้จักกันอยู่แล้ว
 * เจ้าของแอปเลือกความง่ายในการกลับมาแก้ไข (แม้เปิดจากเบราว์เซอร์/เครื่องอื่นก็แก้ได้)
 * เหนือการกันชื่อปลอม ถ้าอยากกันสวมรอยจริงจังต้องกลับไปใช้ลิงก์ส่วนตัวเท่านั้น
 */
export async function claimExistingParticipantAction(
  slug: string,
  participantId: string,
): Promise<ActionResult<{ token: string; participantId: string; name: string }>> {
  try {
    const trip = await getTrip(slug);
    if (trip === null) {
      throw new InputError("ไม่พบทริปนี้ — ลิงก์อาจผิดหรือทริปถูกลบไปแล้ว");
    }
    const id = typeof participantId === "string" ? participantId : "";
    const target = trip.participants.find((p) => p.id === id);
    if (target === undefined) {
      throw new InputError("ไม่พบคนนี้ในทริป — อาจถูกลบไปแล้ว ลองรีเฟรชหน้า");
    }
    return ok({ token: target.token, participantId: target.id, name: target.name });
  } catch (err) {
    return fail(toUserError(err, "เปิดคำตอบเดิมไม่สำเร็จเพราะระบบมีปัญหา — ลองอีกครั้ง"));
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
  comment: string,
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

      const trimmedComment = typeof comment === "string" ? comment.trim() : "";
      if (trimmedComment.length > MAX_COMMENT_LENGTH) {
        throw new InputError(
          `ความคิดเห็นยาวเกิน ${MAX_COMMENT_LENGTH} ตัวอักษร — ย่อให้สั้นลง`,
        );
      }

      const now = new Date().toISOString();
      return replaceParticipant(trip, {
        ...me,
        days: clean,
        comment: trimmedComment === "" ? null : trimmedComment,
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
 * เลือกอวตารเอง
 * ------------------------------------------------------------------ */

/**
 * ผู้เข้าร่วมเลือกหน้าตาอวตารของตัวเอง (จาก AVATAR_FILES ใน lib/avatars.ts)
 * ตรวจ token เหมือน saveAvailabilityAction — ไม่ล็อกด้วยสถานะโพล เพราะเปลี่ยน
 * หน้าตาไม่กระทบผลโหวตเลย ทำได้ตลอดแม้ทริปจะล็อก/จบ/ยกเลิกไปแล้วก็ตาม
 */
export async function setAvatarAction(
  slug: string,
  token: string,
  avatarKey: string,
): Promise<ActionResult<null>> {
  try {
    if (!isAvatarKey(avatarKey)) {
      throw new InputError("อวตารนี้ไม่มีในระบบ — เลือกจากรายการที่มีให้เท่านั้น");
    }
    await updateTrip(slug, async (trip) => {
      const me = await requireParticipant(trip, token);
      return replaceParticipant(trip, { ...me, avatarKey, updatedAt: new Date().toISOString() });
    });

    revalidateTrip(slug);
    return ok(null);
  } catch (err) {
    return fail(toUserError(err, "เปลี่ยนอวตารไม่สำเร็จเพราะระบบมีปัญหา — ลองอีกครั้ง"));
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
 * ลิงก์ส่วนตัวของคนหนึ่งในทริป (เจ้าภาพเท่านั้น)
 * ------------------------------------------------------------------ */

/**
 * เจ้าภาพขอ token ของคนคนหนึ่งเพื่อคัดลอกลิงก์ส่วนตัวไปส่งซ้ำให้
 * (เผื่อคนนั้นลิงก์เดิมหาย หรือเปลี่ยนเครื่อง/เบราว์เซอร์แล้ว localStorage ไม่มี)
 *
 * ⚠️ ต้องเช็ก assertOwner ก่อนคืน token เสมอ — token ของแต่ละคนคือกุญแจแก้ไข
 * คำตอบแทนคนนั้นได้เลย ห้ามให้ใครนอกจากเจ้าภาพของทริปนี้เห็นเด็ดขาด และต้องคืน
 * เฉพาะตอนถูกเรียกจริง (ไม่ใช่ฝังมากับข้อมูลทริปตั้งแต่โหลดหน้า) กันหลุดไปให้
 * ผู้ชมทริปคนอื่นที่ไม่ใช่เจ้าภาพเห็นโดยไม่ตั้งใจ
 */
export async function getParticipantLinkAction(
  slug: string,
  participantId: string,
): Promise<ActionResult<{ token: string }>> {
  try {
    const user = await getSessionUser();
    const trip = await getTrip(slug);
    if (trip === null) {
      throw new InputError("ไม่พบทริปนี้ — ลิงก์อาจผิดหรือทริปถูกลบไปแล้ว");
    }
    assertOwner(trip, user?.id ?? null);

    const id = typeof participantId === "string" ? participantId : "";
    const target = trip.participants.find((p) => p.id === id);
    if (target === undefined) {
      throw new InputError("ไม่พบคนนี้ในทริป — อาจถูกลบไปแล้ว ลองรีเฟรชหน้า");
    }

    return ok({ token: target.token });
  } catch (err) {
    return fail(toUserError(err, "หาลิงก์ส่วนตัวไม่สำเร็จเพราะระบบมีปัญหา — ลองอีกครั้ง"));
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
