/**
 * /t/[slug] — หน้ากรอกวันว่าง (ลิงก์ที่เพื่อนกดจากกลุ่ม LINE)
 *
 * server component ทำแค่สามอย่าง
 *   1. โหลดทริปจาก store
 *   2. ตัดความลับออกก่อนส่งลง client
 *   3. ถ้าเปิดมาจากลิงก์ส่วนตัว `?t=...` ให้ยืนยัน token ที่ฝั่งเซิร์ฟเวอร์
 *      แล้วส่งเฉพาะตัวตนของ "คนที่ถือลิงก์นั้น" ลงไป
 *
 * ⚠️ props ของ client component ถูก serialize ลงไปใน HTML ที่ใครเปิดลิงก์ก็อ่านได้
 *    ห้ามส่ง `trip` ดิบ ๆ เด็ดขาด:
 *      - adminKey หลุด = ใครก็ล็อกวัน/ลบคนได้
 *      - token ของคนอื่นหลุด = แก้คำตอบแทนกันได้
 *    จึง map ทีละฟิลด์ (ไม่ใช้ spread) เพื่อให้ฟิลด์ความลับที่เพิ่มมาในอนาคต
 *    ไม่หลุดตามไปเองโดยไม่มีใครรู้
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { findParticipantByToken, getTrip } from "@/lib/store";
import FillForm, { type MeRecord, type PublicTrip } from "./fill-form";

interface PageProps {
  /** Next 16: params และ searchParams เป็น Promise */
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** ค่าแรกของ query — `?t=a&t=b` ให้ใช้ตัวแรก */
function firstParam(v: string | string[] | undefined): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return "";
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const trip = await getTrip(slug);
  if (trip === null) {
    return { title: "ไม่พบทริปนี้" };
  }
  return {
    title: `${trip.title} · PaiGun`,
    description: `กรอกวันว่างของคุณสำหรับทริป “${trip.title}” แตะเลือกวันที่ไปได้ ไม่ต้องสมัครสมาชิก`,
    // ลิงก์นี้ถูกแชร์ในกลุ่มแชท ไม่ควรถูกดัชนีโดยเครื่องมือค้นหา
    robots: { index: false, follow: false },
  };
}

export default async function TripFillPage({
  params,
  searchParams,
}: PageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const trip = await getTrip(slug);
  if (trip === null) notFound();

  const sp = await searchParams;
  // รองรับทั้ง ?t= (สั้น ใช้ในลิงก์จริง) และ ?token= เผื่อคนพิมพ์เอง
  const token = firstParam(sp.t) || firstParam(sp.token);

  // ยืนยัน token ที่ฝั่งเซิร์ฟเวอร์ก่อน — ส่งลงไปได้เฉพาะตัวตนของคนที่ถือลิงก์นี้
  // (token นี้อยู่ในแถบที่อยู่ของเขาเองอยู่แล้ว จึงไม่ใช่การเปิดเผยอะไรใหม่)
  let initialMe: MeRecord | null = null;
  if (token !== "") {
    const p = await findParticipantByToken(trip, token);
    if (p !== null) {
      initialMe = { token: p.token, participantId: p.id, name: p.name };
    }
  }

  const safeTrip: PublicTrip = {
    id: trip.id,
    slug: trip.slug,
    title: trip.title,
    note: trip.note,
    rangeStart: trip.rangeStart,
    rangeEnd: trip.rangeEnd,
    lengthDays: trip.lengthDays,
    deadline: trip.deadline,
    status: trip.status,
    lockedStart: trip.lockedStart,
    allowSelfJoin: trip.allowSelfJoin,
    // ไม่ส่ง token · ส่ง days ได้ (หน้าผลโหวตแสดงอยู่แล้ว ไม่เป็นความลับ)
    participants: trip.participants.map((p) => ({
      id: p.id,
      name: p.name,
      isKey: p.isKey,
      submittedAt: p.submittedAt,
      days: p.days,
    })),
  };

  return <FillForm trip={safeTrip} initialMe={initialMe} />;
}
