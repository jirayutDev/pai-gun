/**
 * PaiGun — จัดอันดับช่วงวันที่ดีที่สุด
 *
 * หัวใจของแอปอยู่ในไฟล์นี้: รับทริปหนึ่งใบ แล้วบอกว่าช่วงไหนน่าไปที่สุด
 *
 * ─── วิธีคิดคะแนน ─────────────────────────────────────────────────────────
 * น้ำหนักคน   คนสำคัญ = 3, คนทั่วไป = 1
 * หมวดของคนต่อหนึ่งช่วง (ตรวจตามลำดับนี้เท่านั้น)
 *   1. unknown  ยังไม่กดบันทึกเลย (submittedAt === null) — ไม่ต้องดูวันด้วย
 *   2. busy     มีวันใดในช่วงเป็น 0 หรือ "ไม่มีคีย์" (undefined)
 *               คนที่บันทึกแล้วแต่ปล่อยวันว่าง = เขาไม่ได้บอกว่าว่าง ถือว่าไม่ว่าง
 *   3. maybe    ไม่เข้าข้อ 2 และมีวันใดในช่วงเป็น 1
 *   4. free     ที่เหลือ (ทุกวันเป็น 2)
 * ค่าคะแนน    free 1.0, maybe 0.5, busy 0, unknown 0.25
 * ตัดออก      มีคนสำคัญที่หมวด busy → disqualified
 *             คนสำคัญที่ unknown ไม่ทำให้ตัดออก เพราะเรายังไม่รู้คำตอบเขา
 *
 * ─── ประสิทธิภาพ ──────────────────────────────────────────────────────────
 * ผู้ใช้พิมพ์แล้วต้องคำนวณใหม่ทันทีในเบราว์เซอร์ จึงต้องไม่วนซ้ำวันในช่วง
 * วิธีที่เลือก: prefix count ต่อคน — เก็บผลรวมสะสมของ "จำนวนวัน busy" และ
 * "จำนวนวัน maybe" ตั้งแต่ต้นช่วงถึงวันที่ i แล้วถามช่วงใดก็ลบกันครั้งเดียว
 * (O(1) ต่อคนต่อช่วง) รวมทั้งหมดเป็น O(วัน × คน) ไม่ขึ้นกับ lengthDays
 * เทียบกับ sliding-window minimum แบบ deque แล้ววิธีนี้ตรงไปตรงมากว่า และ
 * ให้ทั้งจำนวน busy และ maybe ในคราวเดียว ซึ่งเราต้องใช้ทั้งสองอย่าง
 */

import { addDays, eachDay, isWeekend } from "./dates";
import { holidayName } from "./holidays";
import type { Participant, RankResult, Trip, TripWindow } from "./types";

/** หมวดของคนหนึ่งเทียบกับช่วงหนึ่ง */
export type PersonState = "free" | "maybe" | "busy" | "unknown";

/** ค่าคะแนนของแต่ละหมวด */
export const STATE_VALUE: Record<PersonState, number> = {
  free: 1,
  maybe: 0.5,
  busy: 0,
  unknown: 0.25,
};

/** คนสำคัญนับเป็น 3 เสียง */
export function weightOf(p: Participant): number {
  return p.isKey ? 3 : 1;
}

/** คะแนนเต็มที่เป็นไปได้ = ผลรวมน้ำหนักของทุกคน */
export function maxScoreOf(participants: readonly Participant[]): number {
  let sum = 0;
  for (const p of participants) sum += weightOf(p);
  return sum;
}

/**
 * หาหมวดของคนหนึ่งในช่วงที่กำหนด — เขียนตรงตามกฎเพื่ออ่านและเทสต์ได้ง่าย
 * rankWindows ไม่เรียกฟังก์ชันนี้ (ใช้ prefix count เพื่อความเร็ว) แต่ทั้งสอง
 * ต้องให้ผลเหมือนกันเสมอ — มีเทสต์คุมไว้
 */
export function personStateInWindow(
  p: Participant,
  windowDays: readonly string[],
): PersonState {
  // 1. ยังไม่ตอบเลย — ไม่ต้องดูวัน
  if (p.submittedAt === null) return "unknown";

  let sawMaybe = false;
  for (const day of windowDays) {
    const st = p.days[day];
    // 2. ไม่ว่าง หรือ "ไม่ได้ระบุ" ก็ถือว่าไม่ว่าง (เขาบันทึกแล้วแต่ไม่ทาวันนี้)
    if (st === undefined || st === 0) return "busy";
    if (st === 1) sawMaybe = true;
  }
  // 3. / 4.
  return sawMaybe ? "maybe" : "free";
}

/** เรียงช่วงที่ดีที่สุดก่อน: score → free มาก → วันหยุดมาก → วันต้น ๆ ก่อน */
function compareBest(a: TripWindow, b: TripWindow): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.free.length !== a.free.length) return b.free.length - a.free.length;
  if (b.offDays !== a.offDays) return b.offDays - a.offDays;
  return a.startIndex - b.startIndex;
}

/** เรียงตามลำดับวันในปฏิทิน */
function compareByStart(a: TripWindow, b: TripWindow): number {
  return a.startIndex - b.startIndex;
}

/**
 * จัดอันดับทุกช่วงยาว lengthDays วันติดกันที่อยู่ใน rangeStart..rangeEnd
 *
 * @param lengthDaysOverride ถ้าส่งมา ใช้แทน trip.lengthDays (สำหรับปุ่มลองปรับ
 *        ความยาวทริปในหน้าผลลัพธ์ โดยไม่ต้องแก้ข้อมูลทริป)
 */
export function rankWindows(
  trip: Trip,
  lengthDaysOverride?: number,
): RankResult {
  const participants = trip.participants;

  // ข้อมูลสรุปคนตอบ/ไม่ตอบ ต้องถูกต้องเสมอ แม้จะไม่มีช่วงใดคำนวณได้เลย
  const waitingFor: string[] = [];
  for (const p of participants) {
    if (p.submittedAt === null) waitingFor.push(p.name);
  }
  const invited = participants.length;
  const answered = invited - waitingFor.length;
  const maxScore = maxScoreOf(participants);

  const days = eachDay(trip.rangeStart, trip.rangeEnd);
  const rawLength = lengthDaysOverride ?? trip.lengthDays;
  const lengthDays = Math.floor(rawLength);

  // ช่วงยาวเกินช่วงที่เปิดโหวต (หรือความยาวไม่สมเหตุสมผล) → ไม่มีช่วงใดคำนวณได้
  const windowCount =
    lengthDays >= 1 && lengthDays <= days.length
      ? days.length - lengthDays + 1
      : 0;

  if (windowCount === 0) {
    return { windows: [], disqualified: [], nearMiss: [], answered, invited, waitingFor };
  }

  // ─── วันหยุด/วันหยุดสุดสัปดาห์: prefix count เหมือนกัน ───────────────────
  // offPrefix[i] = จำนวนวันหยุดใน days[0..i-1], nameAt[i] = ชื่อวันหยุดของวันนั้น
  const offPrefix = new Int32Array(days.length + 1);
  const nameAt: (string | null)[] = new Array(days.length);
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const name = holidayName(day);
    nameAt[i] = name;
    offPrefix[i + 1] = offPrefix[i] + (isWeekend(day) || name !== null ? 1 : 0);
  }

  // ─── prefix count ต่อคน ────────────────────────────────────────────────
  // busyPrefix[k][i] = จำนวนวัน busy ของคนที่ k ใน days[0..i-1] (เช่นเดียวกับ maybe)
  // คนที่ยังไม่ตอบไม่ต้องสร้างตาราง เพราะเป็น unknown ทุกช่วงอยู่แล้ว
  const stride = days.length + 1;
  const busyPrefix = new Int32Array(participants.length * stride);
  const maybePrefix = new Int32Array(participants.length * stride);
  for (let k = 0; k < participants.length; k++) {
    const p = participants[k];
    const base = k * stride;
    if (p.submittedAt === null) continue;
    for (let i = 0; i < days.length; i++) {
      const st = p.days[days[i]];
      const isBusy = st === undefined || st === 0;
      busyPrefix[base + i + 1] = busyPrefix[base + i] + (isBusy ? 1 : 0);
      maybePrefix[base + i + 1] = maybePrefix[base + i] + (st === 1 ? 1 : 0);
    }
  }

  const all: TripWindow[] = new Array(windowCount);

  for (let s = 0; s < windowCount; s++) {
    const e = s + lengthDays; // ขอบขวาแบบ exclusive สำหรับ prefix
    const start = days[s];

    const free: string[] = [];
    const maybe: string[] = [];
    const busy: string[] = [];
    const unknown: string[] = [];
    const blockingKeyPeople: string[] = [];
    let score = 0;

    for (let k = 0; k < participants.length; k++) {
      const p = participants[k];
      let state: PersonState;
      if (p.submittedAt === null) {
        state = "unknown";
      } else {
        const base = k * stride;
        if (busyPrefix[base + e] - busyPrefix[base + s] > 0) state = "busy";
        else if (maybePrefix[base + e] - maybePrefix[base + s] > 0) state = "maybe";
        else state = "free";
      }

      switch (state) {
        case "free":
          free.push(p.name);
          break;
        case "maybe":
          maybe.push(p.name);
          break;
        case "busy":
          busy.push(p.name);
          // คนสำคัญที่ไม่ว่าง = ตัดช่วงนี้ออก (แต่ unknown ไม่ตัด)
          if (p.isKey) blockingKeyPeople.push(p.name);
          break;
        case "unknown":
          unknown.push(p.name);
          break;
      }
      score += weightOf(p) * STATE_VALUE[state];
    }

    // ชื่อวันหยุดในช่วง (ไม่ซ้ำ เรียงตามวัน) — ช่วงยาวไม่กี่วัน วนตรง ๆ พอ
    const holidays: string[] = [];
    for (let i = s; i < e; i++) {
      const name = nameAt[i];
      if (name !== null && !holidays.includes(name)) holidays.push(name);
    }

    all[s] = {
      start,
      end: addDays(start, lengthDays - 1),
      startIndex: s,
      score,
      maxScore,
      free,
      maybe,
      busy,
      unknown,
      offDays: offPrefix[e] - offPrefix[s],
      holidays,
      disqualified: blockingKeyPeople.length > 0,
      blockingKeyPeople,
    };
  }

  const windows = all.filter((w) => !w.disqualified).sort(compareBest);
  const disqualified = all.filter((w) => w.disqualified).sort(compareByStart);
  // "เกือบได้" — ผ่านเกณฑ์แต่ติดคนเดียว ชวนคนนั้นคุยอีกทีอาจไปได้
  const nearMiss = windows.filter((w) => w.busy.length === 1);

  return { windows, disqualified, nearMiss, answered, invited, waitingFor };
}
