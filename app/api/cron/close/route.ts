/**
 * PaiGun — ปิดโพลอัตโนมัติเมื่อเลยเดดไลน์
 *
 * Vercel Cron เรียก route นี้วันละครั้ง (ดู vercel.json) พร้อมแนบ header
 * `Authorization: Bearer <CRON_SECRET>` มาให้เองถ้าตั้งค่า env var CRON_SECRET ไว้
 * (พฤติกรรมนี้เป็นของ Vercel Cron Jobs โดยตรง ไม่ต้องเขียนโค้ดฝั่งเรียกเอง)
 * เราจึงแค่เทียบ header นี้แบบ timing-safe ก่อนทำงาน กันคนนอกยิง route นี้มั่ว ๆ
 *
 * ทริปที่ยัง "polling" และเลยเดดไลน์ (deadline) มาแล้ว → ปิดเป็น "done" ทันที
 * (เจ้าภาพลืมกดล็อกวันทันเวลา — ต่างจาก lockDateAction ที่เจ้าภาพเลือกช่วงเอง)
 *
 * ⚠️ แพลน Hobby รัน cron ได้วันละครั้งเท่านั้น และเวลาที่รันจริงคลาดได้ ±59 นาที
 *    จากเวลาที่ตั้งใน vercel.json — ยอมรับได้สำหรับงานปิดโพลแบบนี้
 */

import { NextResponse } from "next/server";

import { listTrips, secretEquals, updateTrip } from "@/lib/store";

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/close] ไม่พบ CRON_SECRET ใน environment — ตั้งค่าก่อนใช้งาน route นี้");
    return NextResponse.json({ error: "CRON_SECRET ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์" }, { status: 500 });
  }

  const auth = request.headers.get("authorization") ?? "";
  if (!secretEquals(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const trips = await listTrips();
  const candidates = trips.filter(
    (t) => t.status === "polling" && t.deadline !== null && Date.parse(t.deadline) <= now,
  );

  let closed = 0;
  for (const trip of candidates) {
    try {
      await updateTrip(trip.slug, (current) => {
        // เช็กเงื่อนไขซ้ำด้วยข้อมูลสดจากทรานแซกชัน เผื่อเจ้าภาพเพิ่งล็อกวันไปพอดี
        // ระหว่างที่ listTrips() อ่านมาก่อนหน้านี้
        if (current.status !== "polling" || current.deadline === null) return current;
        if (Date.parse(current.deadline) > Date.now()) return current;
        return { ...current, status: "done" };
      });
      closed += 1;
    } catch (err) {
      console.error(`[cron/close] ปิดโพลทริป ${trip.slug} ไม่สำเร็จ:`, err);
    }
  }

  return NextResponse.json({ checked: candidates.length, closed });
}
