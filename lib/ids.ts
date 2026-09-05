/**
 * PaiGun — ตัวสร้างรหัสสุ่มทั้งหมดของระบบ
 *
 * กฎเหล็ก: ที่นี่ใช้ CSPRNG (`node:crypto`) เท่านั้น ห้ามใช้ Math.random เด็ดขาด
 * เพราะ token ของผู้เข้าร่วมและ adminKey ของเจ้าภาพ "คือ" การล็อกอินของแอปนี้
 * ใครเดาได้ = สวมรอยเป็นคนนั้นได้ทันที
 *
 * ไม่มี dependency ภายนอก ใช้ Node built-in ล้วน
 */

import { randomBytes, randomInt, randomUUID } from "node:crypto";

/**
 * ตัวอักษรของ slug — a-z0-9 แต่ตัดตัวที่คนอ่านสับสนออก: 0 o 1 l i
 * เหลือ 31 ตัว (พยัญชนะ 23 + เลข 2–9 อีก 8)
 * เพราะ slug คือสิ่งที่คนต้องอ่านออกเสียงบอกกันทางโทรศัพท์หรือพิมพ์ตามจากรูป
 */
const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

const SLUG_LENGTH = 6;

/**
 * สุ่มสตริง url-safe (base64url: A–Z a–z 0–9 - _) ความยาวตามต้องการ
 *
 * base64url ของ Node ไม่ใส่ padding "=" อยู่แล้ว จึงเอาไปต่อใน URL ได้ตรง ๆ
 * เผื่อไบต์ไว้เกินหนึ่งตัวแล้วค่อยตัด กันกรณีหารไม่ลงตัว
 */
function randomUrlSafe(length: number): string {
  const byteCount = Math.ceil((length * 6) / 8) + 1;
  return randomBytes(byteCount).toString("base64url").slice(0, length);
}

/**
 * โค้ดสั้นในลิงก์แชร์ /t/[slug] — 6 ตัวจากชุดอักษร 31 ตัว
 *
 * พื้นที่รหัส 31^6 ≈ 887 ล้านค่า พอสำหรับสเกลของแอปนี้ และ `createTrip`
 * ยังตรวจซ้ำกับข้อมูลที่มีอยู่อีกชั้นก่อนใช้จริง
 *
 * ใช้ `randomInt` (ไม่ใช่ `randomBytes % n`) เพราะ randomInt ทำ rejection
 * sampling ให้แล้ว จึงกระจายเท่ากันจริง ไม่เอียงไปทางตัวอักษรต้น ๆ
 */
export function makeSlug(): string {
  let out = "";
  for (let i = 0; i < SLUG_LENGTH; i++) {
    out += SLUG_ALPHABET[randomInt(0, SLUG_ALPHABET.length)];
  }
  return out;
}

/**
 * ลิงก์ส่วนตัวของผู้เข้าร่วมหนึ่งคน — 22 ตัว url-safe (≈ 132 บิต)
 * นี่คือสิ่งที่ใช้แทนรหัสผ่าน ห้ามเอาไปโชว์ในหน้าที่คนอื่นเห็น
 */
export function makeToken(): string {
  return randomUrlSafe(22);
}

/**
 * กุญแจเจ้าภาพ — 32 ตัว url-safe (≈ 192 บิต)
 * ยาวกว่า token เพราะสิทธิ์ใหญ่กว่า (ล็อกวัน / ลบคนออกได้)
 */
export function makeAdminKey(): string {
  return randomUrlSafe(32);
}

/** รหัสภายในของ record (trip / participant) — ไม่ได้ใช้เป็นความลับ */
export function makeId(): string {
  return randomUUID();
}
