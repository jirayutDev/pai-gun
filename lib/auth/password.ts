/**
 * PaiGun — แฮชรหัสผ่านด้วย Node built-in ล้วน (ไม่มี dependency ภายนอก)
 *
 * ใช้ scrypt (`node:crypto`) แทน bcrypt/argon2 จากแพ็กเกจนอก เพราะ scrypt เป็น
 * adaptive hash ที่ปลอดภัยพอสำหรับสเกลแอปนี้ และ Node มีให้ในตัวอยู่แล้ว
 * — เหตุผลเดียวกับที่ lib/ids.ts เลือกใช้ node:crypto ล้วนสำหรับ token/adminKey เดิม
 *
 * รูปแบบที่เก็บ: "<salt hex>:<hash hex>" เก็บลงคอลัมน์ users.password_hash เดียว
 */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  return key as Buffer;
}

/** สร้าง "salt:hash" ใหม่จากรหัสผ่านดิบ — เรียกตอนสมัคร/เปลี่ยนรหัสผ่าน */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

/**
 * เทียบรหัสผ่านดิบกับ "salt:hash" ที่เก็บไว้ — ใช้ timingSafeEqual เสมอ
 * (เหมือน secretEquals ใน lib/store.ts) ไม่ใช้ `===` กับความลับ
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const sep = stored.indexOf(":");
  if (sep < 0) return false;
  const saltHex = stored.slice(0, sep);
  const hashHex = stored.slice(sep + 1);

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (salt.length !== SALT_BYTES || expected.length !== KEY_LENGTH) return false;

  const actual = await derive(password, salt);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
