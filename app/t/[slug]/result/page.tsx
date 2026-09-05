import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getTrip } from "@/lib/store";
import ResultView, { type PublicTrip } from "./result-view";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const trip = await getTrip(slug);
  if (!trip) return { title: "ไม่พบทริปนี้" };
  return {
    title: `ผลโหวต ${trip.title}`,
    description: `ช่วงวันที่เพื่อนว่างมากที่สุดสำหรับทริป ${trip.title}`,
    // ลิงก์นี้แชร์กันในกลุ่มแชท ไม่ควรถูก search engine เก็บ
    robots: { index: false, follow: false },
  };
}

export default async function ResultPage({ params }: PageProps) {
  const { slug } = await params;
  const trip = await getTrip(slug);
  if (!trip) notFound();

  // เจ้าของทริปมาจาก session คุกกี้ ไม่ใช่กุญแจใน URL อีกต่อไป (ดู lib/auth/session.ts)
  const user = await getSessionUser();
  const isOwner = user !== null && user.id === trip.ownerId;

  // ถอด ownerId และ token ของทุกคนออกก่อนส่งลง client
  // props ของ client component ถูก serialize ลงใน HTML ที่ใครก็อ่านได้
  const publicTrip: PublicTrip = {
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
    createdAt: trip.createdAt,
    participants: trip.participants.map((p) => ({
      id: p.id,
      name: p.name,
      isKey: p.isKey,
      avatarKey: p.avatarKey,
      comment: p.comment,
      days: p.days,
      rsvp: p.rsvp,
      plusOnes: p.plusOnes,
      submittedAt: p.submittedAt,
      updatedAt: p.updatedAt,
    })),
  };

  // ประกอบ URL แชร์จาก header จริง เพื่อให้ก็อปไปวางในกลุ่มแล้วใช้ได้เลย
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const shareUrl = `${proto}://${host}/t/${trip.slug}`;

  return <ResultView trip={publicTrip} isOwner={isOwner} shareUrl={shareUrl} />;
}
