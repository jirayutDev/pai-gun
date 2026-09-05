/**
 * PaiGun — บัญชีเจ้าภาพ (สมัคร/ล็อกอิน)
 *
 * แยกจาก lib/store.ts โดยตั้งใจ — ไฟล์นั้นมีสัญญาที่เอกสารไว้ชัดว่าคุยเรื่อง Trip
 * เท่านั้น (getTrip/saveTrip/createTrip/listTrips/findParticipantByToken/updateTrip)
 * เรื่องบัญชีผู้ใช้เป็นคนละโดเมน จึงมีไฟล์ของตัวเอง
 */

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { makeId } from "@/lib/ids";
import type { User } from "@/lib/types";
import { InputError, nameKey as normalizeKey } from "@/lib/store";

/** ความยาว username ที่ยอมรับ */
export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 32;
/** ความยาวรหัสผ่านขั้นต่ำ — ไม่บังคับซับซ้อน (ตัวเลข/ตัวพิมพ์ใหญ่ ฯลฯ) แค่ยาวพอ */
export const MIN_PASSWORD_LENGTH = 8;

function rowToUser(row: typeof users.$inferSelect): User {
  return { id: row.id, username: row.username, createdAt: row.createdAt.toISOString() };
}

/** ตรวจรูปแบบ username — เรียกก่อน hash รหัสผ่านเสมอกันเสียเวลา hash ถ้า username ผิดรูป */
export function validateUsername(username: unknown): string {
  const trimmed = typeof username === "string" ? username.trim() : "";
  if (trimmed.length < MIN_USERNAME_LENGTH || trimmed.length > MAX_USERNAME_LENGTH) {
    throw new InputError(
      `ชื่อผู้ใช้ต้องยาว ${MIN_USERNAME_LENGTH}-${MAX_USERNAME_LENGTH} ตัวอักษร`,
    );
  }
  if (!/^[a-zA-Z0-9_.]+$/.test(trimmed)) {
    throw new InputError("ชื่อผู้ใช้ใช้ได้แค่ a-z, 0-9, จุด (.) และขีดล่าง (_) เท่านั้น");
  }
  return trimmed;
}

export function validatePassword(password: unknown): string {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new InputError(`รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`);
  }
  return password;
}

/**
 * สร้างบัญชีใหม่ — คืน InputError ถ้าชื่อผู้ใช้ถูกใช้ไปแล้ว
 * `passwordHash` ต้องเป็นผลลัพธ์ของ hashPassword() ใน lib/auth/password.ts แล้ว
 * (ไฟล์นี้ไม่แตะรหัสผ่านดิบเลย เพื่อให้เห็นชัดว่า hash เกิดที่ไหน)
 */
export async function createUser(username: string, passwordHash: string): Promise<User> {
  const usernameKey = normalizeKey(username);
  const now = new Date();

  const inserted = await db
    .insert(users)
    .values({ id: makeId(), username, usernameKey, passwordHash, createdAt: now })
    .onConflictDoNothing({ target: users.usernameKey })
    .returning();

  const row = inserted[0];
  if (row === undefined) {
    throw new InputError(`ชื่อผู้ใช้ "${username}" มีคนใช้แล้ว — ลองชื่ออื่น`);
  }
  return rowToUser(row);
}

/** หาผู้ใช้ตอนล็อกอิน — คืน passwordHash ด้วยเพื่อให้ action เทียบรหัสผ่านต่อได้ */
export async function findUserForLogin(
  username: string,
): Promise<{ id: string; username: string; passwordHash: string } | null> {
  const usernameKey = normalizeKey(username);
  const rows = await db.select().from(users).where(eq(users.usernameKey, usernameKey)).limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  return { id: row.id, username: row.username, passwordHash: row.passwordHash };
}
