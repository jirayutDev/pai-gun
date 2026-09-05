/**
 * PaiGun — session แบบคุกกี้ + ตาราง sessions (แทน adminKey เดิมทั้งหมด)
 *
 * คุกกี้เก็บ token ดิบ (httpOnly กันอ่านจาก JS ฝั่งเบราว์เซอร์) ส่วน DB เก็บแค่
 * แฮชของ token — เทียบหลักการเดียวกับรหัสผ่านใน lib/auth/password.ts
 *
 * ⚠️ createSession/destroySession เขียนคุกกี้ได้เฉพาะใน Server Action /
 * Route Handler เท่านั้น (ข้อจำกัดของ Next) — เรียกได้แค่จาก app/auth-actions.ts
 * ส่วน getSessionUser อ่านอย่างเดียว เรียกได้ทั้งใน Server Component และ Server Action
 */

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";

const COOKIE_NAME = "paigun_session";
const SESSION_DAYS = 30;

export interface SessionUser {
  id: string;
  username: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** สร้าง session ใหม่ให้ userId แล้วตั้งคุกกี้ให้เลย — เรียกตอนสมัคร/ล็อกอินสำเร็จ */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    createdAt: now,
    expiresAt,
  });

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** ลบ session ปัจจุบันทั้งใน DB และคุกกี้ — เรียกตอนล็อกเอาต์ */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  jar.delete(COOKIE_NAME);
}

/** อ่านผู้ใช้ที่ล็อกอินอยู่จากคุกกี้ — คืน null ถ้าไม่ได้ล็อกอินหรือ session หมดอายุ */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const rows = await db
    .select({ id: users.id, username: users.username, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;

  return { id: row.id, username: row.username };
}

/**
 * กันเปิด redirect ไปโดเมนอื่น (open redirect) — รับแค่ path ภายในแอปเรา
 * ที่ขึ้นต้นด้วย "/" ตัวเดียว ไม่ใช่ "//evil.com" (protocol-relative URL) หรือ
 * "https://evil.com" — ใช้กับ ?next= ของหน้า /login และ /register
 */
export function safeNextPath(raw: string | string[] | undefined): string {
  const v = typeof raw === "string" ? raw : "";
  if (v.startsWith("/") && !v.startsWith("//") && !v.includes("://")) return v;
  return "/";
}
