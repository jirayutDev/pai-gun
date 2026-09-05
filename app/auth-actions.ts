"use server";

/**
 * PaiGun — Server Actions สำหรับสมัคร/ล็อกอิน/ล็อกเอาต์
 *
 * แยกจาก app/actions.ts (เรื่องทริป) โดยตั้งใจ — คนละโดเมนกัน
 * รูปแบบผลลัพธ์เดียวกับ actions.ts: คืน ActionResult เสมอ ไม่ throw ออกไป
 */

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { createUser, findUserForLogin, validatePassword, validateUsername } from "@/lib/auth/users";
import { InputError } from "@/lib/store";

export type AuthActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function ok<T>(data: T): AuthActionResult<T> {
  return { ok: true, data };
}

function fail<T>(error: string): AuthActionResult<T> {
  return { ok: false, error };
}

function toUserError(err: unknown, fallback: string): string {
  if (err instanceof InputError) return err.message;
  console.error("[auth-actions] ข้อผิดพลาดที่ไม่คาดคิด:", err);
  return fallback;
}

/**
 * ใช้ตอนหา user ไม่เจอ — ยังต้องรัน verifyPassword ทับข้อมูลปลอมนี้เหมือนกัน
 * (ไม่ short-circuit คืน error ทันที) กัน timing attack เดาได้ว่า username ไหนมีจริง
 * รูปแบบต้องผ่านการเช็กความยาวใน verifyPassword ได้ (salt 16 ไบต์, hash 64 ไบต์)
 * ถึงจะรัน scrypt จริงให้เวลาใกล้เคียงกับเส้นทางที่ user มีจริง
 */
const DUMMY_PASSWORD_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

export async function registerAction(
  username: string,
  password: string,
): Promise<AuthActionResult<{ username: string }>> {
  try {
    const cleanUsername = validateUsername(username);
    const cleanPassword = validatePassword(password);
    const passwordHash = await hashPassword(cleanPassword);
    const user = await createUser(cleanUsername, passwordHash);
    await createSession(user.id);
    return ok({ username: user.username });
  } catch (err) {
    return fail(toUserError(err, "สมัครไม่สำเร็จเพราะระบบมีปัญหา — ลองอีกครั้ง"));
  }
}

export async function loginAction(
  username: string,
  password: string,
): Promise<AuthActionResult<{ username: string }>> {
  try {
    const trimmedUsername = typeof username === "string" ? username.trim() : "";
    if (trimmedUsername === "" || typeof password !== "string" || password === "") {
      throw new InputError("กรอกชื่อผู้ใช้และรหัสผ่านให้ครบ");
    }

    const found = await findUserForLogin(trimmedUsername);
    const verified = await verifyPassword(password, found?.passwordHash ?? DUMMY_PASSWORD_HASH);

    if (found === null || !verified) {
      throw new InputError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    }

    await createSession(found.id);
    return ok({ username: found.username });
  } catch (err) {
    return fail(toUserError(err, "ล็อกอินไม่สำเร็จเพราะระบบมีปัญหา — ลองอีกครั้ง"));
  }
}

