/**
 * PaiGun — Neon Postgres client
 *
 * ใช้ driver แบบ HTTP (`@neondatabase/serverless` + `drizzle-orm/neon-http`)
 * ไม่ใช้ node-postgres หรือ Pool แบบ WebSocket เพราะ:
 * - แพลนฟรีของ Neon หยุด compute เองหลังไม่มีคนใช้ ~5 นาที การเปิด pool ค้างไว้
 *   ไม่ช่วยอะไร (ยังโดน suspend เหมือนเดิม) แถมเสี่ยงถือ connection ที่ตายไปแล้ว
 * - แต่ละ request บน Vercel serverless อาจสุ่มไปคนละอินสแตนซ์ การเปิด pool ต่อ
 *   instance ไม่มีประโยชน์ระยะยาว — driver แบบ HTTP ยิงเป็น fetch() ทีละคำขอ
 *   ไม่ต้องมี connection ให้ดูแลเลย
 *
 * สร้าง client แบบ lazy (เข้าถึง env และเรียก neon()/drizzle() ตอนใช้งานจริงครั้งแรก
 * เท่านั้น) ไม่ใช่ตอน import โมดูลนี้ — เพราะ `next build` โหลด (import) ทุกโมดูลที่
 * route มาถึงเพื่อ bundle แม้ route จะ render แบบ dynamic ตอน request จริงก็ตาม
 * ถ้าอ่าน DATABASE_URL ตอน import ทันที คนที่ยังไม่ตั้งค่า .env.local จะ build ไม่ผ่าน
 * ทั้งที่ไม่มี route ไหนถูกเรียกจริงเลย
 *
 * ⚠️ ไฟล์นี้รันบน Node runtime เท่านั้น (เช่นเดียวกับ lib/store.ts เดิม)
 */

import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "@/lib/db/schema";

type Schema = typeof schema;

let cached: NeonHttpDatabase<Schema> | null = null;

function getDb(): NeonHttpDatabase<Schema> {
  if (cached) return cached;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "ไม่พบ DATABASE_URL — ตั้งค่าใน .env.local (ดูขั้นตอนขอมาจาก Neon ใน README หัวข้อ " +
        '"ต่อ Neon Postgres")',
    );
  }

  cached = drizzle(neon(url), { schema });
  return cached;
}

/**
 * proxy ที่ forward ทุก property ไปยัง client จริงซึ่งสร้างตอนเข้าถึงครั้งแรก
 * ที่เหลือของโค้ดเรียกใช้ `db.select()` / `db.transaction()` ฯลฯ ได้เหมือน client ปกติทุกประการ
 */
export const db: NeonHttpDatabase<Schema> = new Proxy({} as NeonHttpDatabase<Schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
