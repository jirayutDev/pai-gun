/**
 * PaiGun — ชั้นเก็บข้อมูล (Phase 2: Neon Postgres ผ่าน Drizzle)
 *
 * ส่วนที่เหลือของแอปเห็นแค่ฟังก์ชันที่ export ท้ายไฟล์นี้ (signature เดิมทุกตัว
 * จาก Phase 1 — ไม่มีใครนอกไฟล์นี้แตะ SQL ตรง ๆ):
 *   getTrip / saveTrip / createTrip / listTrips / findParticipantByToken / updateTrip
 *
 * โครงสร้างข้อมูลจริงอยู่คนละตาราง (trips / participants / availability — ดู
 * lib/db/schema.ts) แต่แอปทั้งหมดยังคุยกันด้วยรูปทรงเดียวคือ `Trip` ที่มี
 * `participants[].days` ฝังอยู่ข้างใน (ดู lib/types.ts) — ไฟล์นี้จึงมีหน้าที่
 * "ประกอบ" แถวจากหลายตารางให้เป็น Trip ตอนอ่าน และ "สลาย" Trip กลับเป็นแถว
 * ตอนเขียน
 *
 * ⚠️ ไฟล์นี้รันบน Node runtime เท่านั้น (ใช้ lib/db/client.ts ซึ่งต่อ Neon
 *    ผ่าน @neondatabase/serverless) ห้าม import จาก edge runtime หรือ client component
 */

import { timingSafeEqual } from "node:crypto";

import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { daysBetween, isISODate } from "@/lib/dates";
import { db } from "@/lib/db/client";
import { availability, participants, trips } from "@/lib/db/schema";
import { makeId, makeSlug, makeToken } from "@/lib/ids";
import type { AvailState, CreateTripInput, Participant, Rsvp, Trip, TripStatus } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * ค่าคงที่ / ขอบเขตที่ยอมรับ
 * ------------------------------------------------------------------ */

/** ช่วงวันกว้างสุดที่เปิดให้โหวต — กว้างกว่านี้ไม่มีใครกรอกจบ */
export const MAX_RANGE_DAYS = 90;
/** ทริปยาวสุดที่รองรับ */
export const MAX_LENGTH_DAYS = 14;
/** จำนวนคนสูงสุดต่อทริป */
export const MAX_MEMBERS = 50;
/** ความยาวชื่อคนสูงสุด */
export const MAX_NAME_LENGTH = 40;
/** ความยาวชื่อทริปสูงสุด */
export const MAX_TITLE_LENGTH = 80;
/** ความยาวโน้ตสูงสุด */
export const MAX_NOTE_LENGTH = 500;
/** ความยาวความคิดเห็นของผู้เข้าร่วมสูงสุด (สั้นกว่าโน้ตของทริป เพราะตั้งใจให้พิมพ์เร็ว) */
export const MAX_COMMENT_LENGTH = 200;

/**
 * ข้อผิดพลาดที่ "ผู้ใช้อ่านแล้วแก้ได้" — ข้อความเป็นภาษาไทยและบอกวิธีแก้
 * app/actions.ts ใช้ชนิดนี้แยกว่าอันไหนเอาไปโชว์ผู้ใช้ได้ อันไหนเป็นบั๊กที่ต้องซ่อน
 */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

/* ------------------------------------------------------------------ *
 * ประกอบแถว DB -> Trip / สลาย Trip -> แถว DB
 * ------------------------------------------------------------------ */

type TripRow = typeof trips.$inferSelect;
type ParticipantRow = typeof participants.$inferSelect;
type AvailabilityRow = typeof availability.$inferSelect;

/** แปลง Date | null เป็น ISO8601 string | null — ดูหมายเหตุที่ lib/db/schema.ts */
function isoOrNull(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

function rowsToParticipant(row: ParticipantRow, dayRows: AvailabilityRow[]): Participant {
  const days: Record<string, AvailState> = {};
  for (const d of dayRows) {
    const v = d.value;
    if (v === 0 || v === 1 || v === 2) days[d.day] = v;
  }
  return {
    id: row.id,
    name: row.name,
    token: row.token,
    isKey: row.isKey,
    avatarKey: row.avatarKey,
    comment: row.comment,
    days,
    rsvp: row.rsvp as Rsvp,
    plusOnes: row.plusOnes,
    submittedAt: isoOrNull(row.submittedAt),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowsToTrip(
  row: TripRow,
  participantRows: ParticipantRow[],
  availRowsByParticipant: Map<string, AvailabilityRow[]>,
): Trip {
  return {
    id: row.id,
    slug: row.slug,
    ownerId: row.ownerId,
    title: row.title,
    note: row.note,
    rangeStart: row.rangeStart,
    rangeEnd: row.rangeEnd,
    lengthDays: row.lengthDays,
    deadline: isoOrNull(row.deadline),
    status: row.status as TripStatus,
    lockedStart: row.lockedStart,
    allowSelfJoin: row.allowSelfJoin,
    participants: participantRows.map((p) =>
      rowsToParticipant(p, availRowsByParticipant.get(p.id) ?? []),
    ),
    createdAt: row.createdAt.toISOString(),
  };
}

/** จัดกลุ่มแถว availability ตาม participantId ให้หาไวตอนประกอบ Trip */
function groupAvailByParticipant(rows: AvailabilityRow[]): Map<string, AvailabilityRow[]> {
  const map = new Map<string, AvailabilityRow[]>();
  for (const r of rows) {
    const arr = map.get(r.participantId);
    if (arr) arr.push(r);
    else map.set(r.participantId, [r]);
  }
  return map;
}

/**
 * โหลด Trip เต็ม (ทุกตาราง) จาก slug — คืน null ถ้าไม่พบ
 *
 * ⚠️ neon-http (`@neondatabase/serverless` แบบ HTTP) ไม่รองรับ `db.transaction()`
 * เลย (throw เสมอ) — รองรับแค่ `db.batch([...])` ซึ่งเป็น "รายการคำสั่งที่ตายตัว
 * ไว้ล่วงหน้า" ไม่ใช่ transaction แบบอ่าน-แล้ว-ตัดสินใจต่อได้ จึงอ่านด้วยฟังก์ชันนี้
 * แบบธรรมดา (ไม่ล็อกแถว) แล้วพึ่ง compare-and-swap ด้วยคอลัมน์ `version` แทน
 * ดูรายละเอียดที่ `updateTrip` ด้านล่าง
 */
async function loadTripBySlug(
  slug: string,
): Promise<{ row: TripRow; participantRows: ParticipantRow[]; availRows: AvailabilityRow[] } | null> {
  const tripRows = await db.select().from(trips).where(eq(trips.slug, slug)).limit(1);
  const row = tripRows[0];
  if (row === undefined) return null;

  const participantRows = await db
    .select()
    .from(participants)
    .where(eq(participants.tripId, row.id));

  const availRows =
    participantRows.length === 0
      ? []
      : await db
          .select()
          .from(availability)
          .where(
            inArray(
              availability.participantId,
              participantRows.map((p) => p.id),
            ),
          );

  return { row, participantRows, availRows };
}

/** ฟิลด์ระดับ Trip (ไม่รวม participants/availability) ที่ต้องเขียนกลับ DB เสมอ */
function tripFieldsToSet(trip: Trip) {
  return {
    title: trip.title,
    note: trip.note,
    rangeStart: trip.rangeStart,
    rangeEnd: trip.rangeEnd,
    lengthDays: trip.lengthDays,
    deadline: trip.deadline === null ? null : new Date(trip.deadline),
    status: trip.status,
    lockedStart: trip.lockedStart,
    allowSelfJoin: trip.allowSelfJoin,
  };
}

/**
 * ประกอบรายการคำสั่งเขียน participants/availability ให้ตรงกับ `trip.participants`
 * ทั้งหมด (upsert ผู้เข้าร่วมที่ยังอยู่ + ลบคนที่หายไปจากก้อนใหม่ ซึ่ง cascade ลบ
 * availability ของคนนั้นไปด้วย + upsert/ลบ availability ทีละคนตามช่องที่ต่างไปจากเดิม
 * — "ต่างไปจากเดิม" คือต่างจากที่ `trip` ส่งมา ไม่ใช่ลบทั้งชุดของ participant นั้นแล้วเขียนใหม่)
 *
 * คืนค่าเป็น "รายการคำสั่งที่ยังไม่ได้รัน" (แต่ละอันเป็น query builder ของ drizzle)
 * ให้ผู้เรียกเอาไปยิงเองผ่าน `db.batch([...])` — ไม่รันในฟังก์ชันนี้ตรง ๆ เพราะ
 * neon-http (@neondatabase/serverless แบบ HTTP) ไม่รองรับ `db.transaction()` เลย
 * (throw "No transactions support in neon-http driver" เสมอ) รองรับแค่ `db.batch()`
 * ซึ่งต้องได้ array ของคำสั่งที่สร้างไว้ล่วงหน้าทั้งชุดก่อนส่งไปรันเป็นก้อนเดียว
 */
function buildParticipantWrites(tripId: string, trip: Trip): BatchItem<"pg">[] {
  const writes: BatchItem<"pg">[] = [];
  const keepIds = trip.participants.map((p) => p.id);

  // ลบผู้เข้าร่วมที่ไม่อยู่ในก้อนใหม่แล้ว (ON DELETE CASCADE จัดการ availability ให้)
  writes.push(
    db.delete(participants).where(
      keepIds.length === 0
        ? eq(participants.tripId, tripId)
        : and(eq(participants.tripId, tripId), notInArray(participants.id, keepIds)),
    ),
  );

  for (const p of trip.participants) {
    writes.push(
      db
        .insert(participants)
        .values({
          id: p.id,
          tripId,
          name: p.name,
          token: p.token,
          isKey: p.isKey,
          avatarKey: p.avatarKey,
          comment: p.comment,
          rsvp: p.rsvp,
          plusOnes: p.plusOnes,
          submittedAt: p.submittedAt === null ? null : new Date(p.submittedAt),
          updatedAt: new Date(p.updatedAt),
        })
        .onConflictDoUpdate({
          target: participants.id,
          set: {
            name: p.name,
            token: p.token,
            isKey: p.isKey,
            avatarKey: p.avatarKey,
            comment: p.comment,
            rsvp: p.rsvp,
            plusOnes: p.plusOnes,
            submittedAt: p.submittedAt === null ? null : new Date(p.submittedAt),
            updatedAt: new Date(p.updatedAt),
          },
        }),
    );

    const days = Object.entries(p.days);

    // ลบเฉพาะวันที่ไม่ได้อยู่ในก้อนใหม่ของคนนี้ — ไม่ใช่ลบทั้งชุดแล้วเขียนใหม่
    writes.push(
      db.delete(availability).where(
        days.length === 0
          ? eq(availability.participantId, p.id)
          : and(
              eq(availability.participantId, p.id),
              notInArray(
                availability.day,
                days.map(([iso]) => iso),
              ),
            ),
      ),
    );

    if (days.length > 0) {
      writes.push(
        db
          .insert(availability)
          .values(days.map(([day, value]) => ({ participantId: p.id, day, value })))
          .onConflictDoUpdate({
            // ตอน upsert หลายแถวพร้อมกัน ใช้ค่าที่ "พยายามจะแทรก" ของแถวนั้น ๆ เป็นค่าใหม่
            target: [availability.participantId, availability.day],
            set: { value: sql`excluded.value` },
          }),
      );
    }
  }

  return writes;
}

/** ส่ง writes ที่ประกอบไว้ไปรันเป็นก้อนอะตอมมิกเดียวผ่าน db.batch() ถ้ามีอะไรให้ทำ */
async function runBatch(writes: BatchItem<"pg">[]): Promise<void> {
  if (writes.length === 0) return;
  await db.batch(writes as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
}

/* ------------------------------------------------------------------ *
 * เครื่องมือเล็ก ๆ ที่ชั้นบน (actions) ใช้ร่วม
 * ------------------------------------------------------------------ */

/**
 * เทียบความลับแบบไม่รั่วข้อมูลผ่านเวลาที่ใช้เปรียบเทียบ
 * ใช้กับ token และ adminKey — ไม่ควรใช้ `===` กับความลับ
 */
export function secretEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  // ความยาวไม่เท่ากันก็รู้ได้จากเวลาอยู่แล้ว ไม่ใช่ข้อมูลที่มีค่า
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** คีย์เทียบชื่อ — ตัดช่องว่างหัวท้าย ยุบช่องว่างซ้ำ และไม่สนตัวพิมพ์ */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * ทำให้ชื่อไม่ซ้ำกับที่มีอยู่ โดยต่อท้ายเป็น "(2)" "(3)" ...
 * เช่น มี "เบส" อยู่แล้ว ใส่ "เบส" อีกคน → "เบส (2)"
 *
 * `taken` เป็นเซ็ตของ nameKey() ที่ถูกใช้แล้ว — ฟังก์ชันนี้ไม่แก้ taken ให้
 * ผู้เรียกต้อง add ผลลัพธ์เข้าไปเองถ้าจะเรียกซ้ำหลายรอบ
 */
export function uniqueName(desired: string, taken: ReadonlySet<string>): string {
  const base = desired.trim().replace(/\s+/g, " ");
  if (!taken.has(nameKey(base))) return base;
  for (let n = 2; n <= MAX_MEMBERS + 1; n++) {
    const candidate = `${base} (${n})`;
    if (!taken.has(nameKey(candidate))) return candidate;
  }
  // ไปไม่ถึงจุดนี้ในทางปฏิบัติ (คนต่อทริปจำกัดไว้แล้ว) แต่ต้องไม่วนไม่จบ
  return `${base} (${makeId().slice(0, 4)})`;
}

/* ------------------------------------------------------------------ *
 * API ของ store — ส่วนที่แอปทั้งหมดเห็น (signature คงเดิมจาก Phase 1)
 * ------------------------------------------------------------------ */

export async function getTrip(slug: string): Promise<Trip | null> {
  if (!slug) return null;
  const loaded = await loadTripBySlug(slug);
  if (loaded === null) return null;
  return rowsToTrip(loaded.row, loaded.participantRows, groupAvailByParticipant(loaded.availRows));
}

/** ประกอบ Trip เต็มจากแถว trips หลายแถวพร้อมกัน — ใช้ร่วมกันโดย listTrips/listTripsByOwner */
async function assembleTrips(tripRows: TripRow[]): Promise<Trip[]> {
  if (tripRows.length === 0) return [];

  const tripIds = tripRows.map((t) => t.id);
  const participantRows = await db.select().from(participants).where(inArray(participants.tripId, tripIds));

  const participantIds = participantRows.map((p) => p.id);
  const availRows =
    participantIds.length === 0
      ? []
      : await db.select().from(availability).where(inArray(availability.participantId, participantIds));
  const availByParticipant = groupAvailByParticipant(availRows);

  const participantsByTrip = new Map<string, ParticipantRow[]>();
  for (const p of participantRows) {
    const arr = participantsByTrip.get(p.tripId);
    if (arr) arr.push(p);
    else participantsByTrip.set(p.tripId, [p]);
  }

  return tripRows.map((t) => rowsToTrip(t, participantsByTrip.get(t.id) ?? [], availByParticipant));
}

export async function listTrips(): Promise<Trip[]> {
  const tripRows = await db.select().from(trips).orderBy(sql`${trips.createdAt} desc`);
  return assembleTrips(tripRows);
}

/** ทริปทั้งหมดที่ userId เป็นเจ้าของ ใหม่สุดขึ้นก่อน — ใช้ทำหน้า "ทริปของฉัน" */
export async function listTripsByOwner(ownerId: string): Promise<Trip[]> {
  const tripRows = await db
    .select()
    .from(trips)
    .where(eq(trips.ownerId, ownerId))
    .orderBy(sql`${trips.createdAt} desc`);
  return assembleTrips(tripRows);
}

/**
 * เขียน Trip ทับทั้งก้อน — ใช้ตอนมี Trip ที่อ่านมาสด ๆ (เช่นจาก getTrip)
 * แล้วต้องการบันทึกกลับตรง ๆ โดยไม่ผ่าน mutate callback ของ updateTrip
 *
 * upsert แถว trips ด้วย id (สร้างใหม่ถ้ายังไม่มี, ทับถ้ามีอยู่แล้ว) เหมือนพฤติกรรม
 * เดิมสมัยไฟล์ JSON (`db.trips[trip.slug] = trip`) แล้วค่อย sync participants/availability
 *
 * ⚠️ ไม่ได้เช็ก version เหมือน updateTrip — ถ้าการแก้ไขต้องอ้างค่าล่าสุดของ DB
 * (เช่นเช็กเพดานจำนวนคน) หรือมีคนแก้พร้อมกันได้ ให้ใช้ updateTrip แทน
 */
export async function saveTrip(trip: Trip): Promise<void> {
  if (!trip.slug) throw new InputError("บันทึกไม่ได้เพราะทริปนี้ไม่มี slug");

  const fields = tripFieldsToSet(trip);
  await db
    .insert(trips)
    .values({ id: trip.id, slug: trip.slug, ownerId: trip.ownerId, createdAt: new Date(trip.createdAt), ...fields })
    .onConflictDoUpdate({ target: trips.id, set: fields });

  await runBatch(buildParticipantWrites(trip.id, trip));
}

/**
 * อ่าน-แก้-เขียนแบบ optimistic concurrency (compare-and-swap ด้วยคอลัมน์ `version`
 * ของแถว trips) แทนที่คิว Promise เดิมในโปรเซสเดียว
 *
 * ทำไมไม่ใช่ `db.transaction()`: neon-http (@neondatabase/serverless แบบ HTTP)
 * ไม่รองรับเลย — throw "No transactions support in neon-http driver" เสมอ เพราะ
 * เป็น driver ที่ยิงทีละ fetch() ไม่มี session ต่อเนื่องข้ามคำขอให้ทำ
 * `SELECT ... FOR UPDATE` ค้างรอได้ ของจริงที่ driver นี้รองรับคือ `db.batch([...])`
 * ซึ่งต้องได้รายการคำสั่งที่ตัดสินใจไว้ล่วงหน้าทั้งหมดก่อนส่งไปรันเป็นก้อนอะตอมมิกเดียว
 * — ใช้ "อ่านแล้วตัดสินใจต่อ" กลางทางไม่ได้เหมือน transaction ทั่วไป
 *
 * จึงแยกเป็น 2 ช่วงต่อการพยายามหนึ่งครั้ง:
 *  1. UPDATE แถว trips แบบ compare-and-swap (`WHERE id = ? AND version = ?`)
 *     — เป็น statement เดียวโดด ๆ จึงอะตอมมิกในตัวเองอยู่แล้วโดยไม่ต้องพึ่งอะไรเพิ่ม
 *     ถ้าไม่มีแถวไหนถูกอัปเดตเลย แปลว่ามีคนอื่นเขียนทับทริปนี้ไปก่อนระหว่างที่เรา
 *     กำลังตัดสินใจอยู่ (race) — วนอ่านสด ๆ ใหม่ทั้งหมดแล้วรัน mutate ซ้ำ
 *  2. ถ้า CAS ผ่าน ค่อย sync participants/availability ทั้งชุดผ่าน `db.batch()`
 *     (อะตอมมิกร่วมกันในขั้นนี้ — แยกจากขั้น 1 เพราะรายการคำสั่งขึ้นกับผลของ mutate()
 *     ซึ่งต้องรู้ก่อนว่า CAS จะผ่านไหมถึงจะคุ้มที่จะสร้าง)
 *
 * ต่างจากคิว Promise เดิมที่กันได้แค่ภายในโปรเซสเดียว วิธีนี้ปลอดภัยข้ามอินสแตนซ์
 * serverless จริง ๆ (คุมด้วยแถวใน DB ไม่ใช่หน่วยความจำของเครื่องใดเครื่องหนึ่ง)
 */
const MAX_UPDATE_ATTEMPTS = 8;

export async function updateTrip(
  slug: string,
  mutate: (trip: Trip) => Trip | Promise<Trip>,
): Promise<Trip> {
  for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt++) {
    const loaded = await loadTripBySlug(slug);
    if (loaded === null) {
      throw new InputError("ไม่พบทริปนี้ — ลิงก์อาจผิดหรือทริปถูกลบไปแล้ว");
    }
    const { row, participantRows, availRows } = loaded;

    const current = rowsToTrip(row, participantRows, groupAvailByParticipant(availRows));
    const next = await mutate(current);
    const withSlug: Trip = { ...next, slug };

    const cas = await db
      .update(trips)
      .set({ ...tripFieldsToSet(withSlug), version: row.version + 1 })
      .where(and(eq(trips.id, row.id), eq(trips.version, row.version)))
      .returning({ id: trips.id });

    if (cas.length === 0) continue; // แพ้ race — อ่านสด ๆ ใหม่แล้วลองทั้งรอบอีกครั้ง

    await runBatch(buildParticipantWrites(row.id, withSlug));
    return withSlug;
  }

  throw new InputError(
    "บันทึกไม่สำเร็จเพราะมีคนแก้ทริปนี้พร้อมกันถี่เกินไป — รีเฟรชหน้าแล้วลองอีกครั้ง",
  );
}

/** หาผู้เข้าร่วมจาก token ส่วนตัว — คืน null ถ้าไม่ตรงใครเลย */
export async function findParticipantByToken(
  trip: Trip,
  token: string,
): Promise<Participant | null> {
  if (!token) return null;
  for (const p of trip.participants) {
    if (secretEquals(p.token, token)) return p;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * createTrip — ประตูเดียวที่ Trip ใหม่เกิดขึ้นได้ จึงตรวจ input ที่นี่
 * ------------------------------------------------------------------ */

/**
 * ตรวจ input แล้วสร้าง Trip ใหม่
 *
 * ทุกข้อผิดพลาดเป็น `InputError` ข้อความภาษาไทยที่บอกด้วยว่าต้องแก้อะไร
 * เพราะข้อความนี้จะไปโชว์ในฟอร์มตรง ๆ
 */
export async function createTrip(input: CreateTripInput): Promise<Trip> {
  const clean = validateCreateTripInput(input);
  const now = new Date();

  // สร้าง slug ที่ยังไม่ซ้ำ — ลองใหม่ได้ถึง 10 ครั้ง โดยพึ่ง unique constraint
  // ของ DB ตัดสินแพ้ชนะ (กันคนละ request แข่งกันสร้าง slug เดียวกันพอดี)
  //
  // ไม่ต้องใช้ db.transaction()/db.batch() ตรงนี้ — เป็น id สุ่มใหม่ที่ยังไม่มีใคร
  // อ้างถึง จึงไม่มี request อื่นมาแก้แถวนี้แข่งกันได้ (ต่างจาก updateTrip ที่แก้ทริป
  // ที่มีอยู่แล้วซึ่งอาจมีคนอื่นแก้พร้อมกัน) ถ้า insert participants ไม่สำเร็จหลัง
  // insert trip ผ่านแล้ว จะเหลือทริปที่ยังไม่มีใครเลย — ทริปเปล่าไม่เสียหายอะไร
  // (ไม่มีใครถือลิงก์ไปกรอกอะไรได้อยู่แล้วถ้าไม่มี participant)
  const id = makeId();
  let row: TripRow | undefined;
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = makeSlug();
    const inserted = await db
      .insert(trips)
      .values({
        id,
        slug: candidate,
        ownerId: clean.ownerId,
        title: clean.title,
        note: clean.note,
        rangeStart: clean.rangeStart,
        rangeEnd: clean.rangeEnd,
        lengthDays: clean.lengthDays,
        deadline: clean.deadline === null ? null : new Date(clean.deadline),
        status: "polling",
        lockedStart: null,
        allowSelfJoin: clean.allowSelfJoin,
        createdAt: now,
      })
      .onConflictDoNothing({ target: trips.slug })
      .returning();
    if (inserted.length > 0) {
      row = inserted[0];
      break;
    }
  }
  if (row === undefined) {
    throw new InputError(
      "สร้างรหัสลิงก์ไม่สำเร็จ (สุ่มชนกัน 10 ครั้งติด) — ลองกดสร้างอีกครั้ง",
    );
  }

  const participantRows: ParticipantRow[] = clean.members.map((m) => ({
    id: makeId(),
    tripId: id,
    name: m.name,
    // ทุกคนได้ token ของตัวเอง — นี่คือลิงก์ส่วนตัวที่เจ้าภาพจะส่งให้แต่ละคน
    token: makeToken(),
    isKey: m.isKey,
    // ยังไม่เลือกหน้าตาเอง — Avatar component จะ hash จากชื่อแทน
    avatarKey: null,
    comment: null,
    rsvp: null,
    plusOnes: 0,
    // null = ยังไม่เคยกดบันทึก จึงยังนับเป็น "รอตอบ"
    submittedAt: null,
    updatedAt: now,
  }));

  if (participantRows.length > 0) {
    await db.insert(participants).values(participantRows);
  }

  return rowsToTrip(row, participantRows, new Map());
}

interface CleanTripInput {
  ownerId: string;
  title: string;
  note: string;
  rangeStart: string;
  rangeEnd: string;
  lengthDays: number;
  deadline: string | null;
  allowSelfJoin: boolean;
  members: { name: string; isKey: boolean }[];
}

/**
 * ตรวจและทำความสะอาด input ของ createTrip
 * แยกออกมาเป็นฟังก์ชันเดี่ยวเพื่อให้ Phase 2 ยกไปใช้ซ้ำได้ไม่ต้องแก้
 */
function validateCreateTripInput(input: CreateTripInput): CleanTripInput {
  // ── เจ้าของ ──────────────────────────────────────────────
  // มาจาก session ฝั่งเซิร์ฟเวอร์เท่านั้น (ดู createTripAction) ไม่ใช่ input จากฟอร์ม
  // แต่ยังตรวจรูปแบบไว้กันเรียก createTrip ผิดที่ไม่ผ่าน action
  const ownerId = typeof input.ownerId === "string" ? input.ownerId.trim() : "";
  if (ownerId === "") {
    throw new InputError("ต้องล็อกอินก่อนถึงจะสร้างทริปได้");
  }

  // ── ชื่อทริป ──────────────────────────────────────────────
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title === "") {
    throw new InputError("ยังไม่ได้ตั้งชื่อทริป — ใส่ชื่อสั้น ๆ ที่เพื่อนเห็นแล้วรู้เรื่อง เช่น “เชียงใหม่ปีใหม่”");
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new InputError(
      `ชื่อทริปยาวเกินไป (${title.length} ตัวอักษร) — ย่อให้ไม่เกิน ${MAX_TITLE_LENGTH} ตัวอักษร`,
    );
  }

  // ── โน้ต ─────────────────────────────────────────────────
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > MAX_NOTE_LENGTH) {
    throw new InputError(
      `รายละเอียดยาวเกินไป (${note.length} ตัวอักษร) — ย่อให้ไม่เกิน ${MAX_NOTE_LENGTH} ตัวอักษร`,
    );
  }

  // ── ช่วงวันที่ ────────────────────────────────────────────
  const rangeStart = typeof input.rangeStart === "string" ? input.rangeStart.trim() : "";
  const rangeEnd = typeof input.rangeEnd === "string" ? input.rangeEnd.trim() : "";
  if (!isISODate(rangeStart) || !isISODate(rangeEnd)) {
    throw new InputError("วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD เช่น 2026-10-23 — เลือกวันจากปฏิทินอีกครั้ง");
  }
  const span = daysBetween(rangeStart, rangeEnd);
  if (Number.isNaN(span)) {
    throw new InputError("อ่านวันที่ที่เลือกไม่ออก — เลือกวันเริ่มและวันสิ้นสุดใหม่อีกครั้ง");
  }
  if (span < 0) {
    throw new InputError("วันสิ้นสุดอยู่ก่อนวันเริ่ม — สลับสองวันนี้ให้ถูกลำดับ");
  }
  const rangeDays = span + 1;
  if (rangeDays > MAX_RANGE_DAYS) {
    throw new InputError(
      `ช่วงที่เลือกกว้าง ${rangeDays} วัน ซึ่งเกิน ${MAX_RANGE_DAYS} วัน — ` +
        `กว้างเกินไปเพื่อนจะกรอกไม่จบ ลองหุบให้แคบลงเหลือช่วงที่มีโอกาสไปจริง`,
    );
  }

  // ── ทริปยาวกี่วัน ─────────────────────────────────────────
  const lengthDays = typeof input.lengthDays === "number" ? input.lengthDays : Number.NaN;
  if (!Number.isInteger(lengthDays)) {
    throw new InputError("จำนวนวันของทริปต้องเป็นจำนวนเต็ม เช่น 3");
  }
  if (lengthDays < 1 || lengthDays > MAX_LENGTH_DAYS) {
    throw new InputError(
      `ทริปยาวได้ตั้งแต่ 1 ถึง ${MAX_LENGTH_DAYS} วัน — ใส่ค่าในช่วงนี้ (ที่ใส่มาคือ ${lengthDays})`,
    );
  }
  if (rangeDays < lengthDays) {
    throw new InputError(
      `ช่วงที่เลือกมีแค่ ${rangeDays} วัน แต่ทริปยาว ${lengthDays} วัน — ` +
        `ขยายช่วงวันให้กว้างขึ้น หรือลดจำนวนวันของทริปลง`,
    );
  }

  // ── เดดไลน์ปิดโพล (ไม่บังคับ) ─────────────────────────────
  let deadline: string | null = null;
  if (typeof input.deadline === "string" && input.deadline.trim() !== "") {
    const raw = input.deadline.trim();
    if (Number.isNaN(Date.parse(raw))) {
      throw new InputError("อ่านวันปิดโพลไม่ออก — เลือกวันใหม่ หรือเว้นว่างไว้ถ้าไม่กำหนดเดดไลน์");
    }
    deadline = raw;
  }

  // ── รายชื่อเพื่อน ─────────────────────────────────────────
  const rawMembers = Array.isArray(input.members) ? input.members : [];
  if (rawMembers.length > MAX_MEMBERS) {
    throw new InputError(
      `ใส่ชื่อมา ${rawMembers.length} คน ซึ่งเกิน ${MAX_MEMBERS} คนต่อทริป — ` +
        `ตัดให้เหลือไม่เกิน ${MAX_MEMBERS} คน หรือแยกเป็นสองทริป`,
    );
  }

  const taken = new Set<string>();
  const members: { name: string; isKey: boolean }[] = [];
  for (const m of rawMembers) {
    const rawName = typeof m?.name === "string" ? m.name.trim() : "";
    if (rawName === "") {
      throw new InputError("มีช่องชื่อเพื่อนที่ปล่อยว่างอยู่ — ใส่ชื่อให้ครบ หรือลบช่องนั้นออก");
    }
    if (rawName.length > MAX_NAME_LENGTH) {
      throw new InputError(
        `ชื่อ “${rawName.slice(0, 12)}…” ยาวเกิน ${MAX_NAME_LENGTH} ตัวอักษร — ใช้ชื่อเล่นสั้น ๆ พอให้เพื่อนรู้ว่าใคร`,
      );
    }
    // ชื่อซ้ำไม่ใช่ error — ต่อท้ายให้แยกออกอัตโนมัติ เช่น "เบส" → "เบส (2)"
    // เพราะกลุ่มเพื่อนมีชื่อเล่นซ้ำกันเป็นเรื่องปกติ ไม่ควรบล็อกเจ้าภาพ
    const name = uniqueName(rawName, taken);
    taken.add(nameKey(name));
    members.push({ name, isKey: m?.isKey === true });
  }

  return {
    ownerId,
    title,
    note,
    rangeStart,
    rangeEnd,
    lengthDays,
    deadline,
    allowSelfJoin: input.allowSelfJoin === true,
    members,
  };
}
