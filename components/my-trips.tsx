"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Avatar from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { fromISO, isISODate, formatShort, THAI_MONTHS_SHORT } from "@/lib/dates";

/**
 * "ทริปของฉัน" — รวมสองแหล่ง:
 * - ทริปที่เราเป็นเจ้าภาพ: มาจาก session ของบัญชีที่ล็อกอินอยู่ (server component
 *   ต้นทางดึงผ่าน listTripsByOwner แล้วส่งเป็น prop `hostedTrips` มาให้ที่นี่)
 *   ไม่ใช้ localStorage อีกต่อไปตั้งแต่สลับไปใช้บัญชีล็อกอินแทน adminKey
 * - ทริปที่เราไปร่วมกรอก (guest, ไม่ต้องล็อกอิน): ยังอ่านจาก localStorage คีย์
 *   "paigun.me" เหมือนเดิม เพราะฝั่งแขกไม่มีบัญชีให้ผูกกับ — ต้องอ่านใน useEffect
 *   เท่านั้น (localStorage ไม่มีตอน render ฝั่งเซิร์ฟเวอร์ กัน hydration mismatch)
 *
 * สไตล์การ์ด: เรียงแนวนอนแบบเลื่อนได้ ล้นออกไปถึงขอบจอทั้งสองข้าง (ดูมีชีวิตชีวา
 * ตามงานอ้างอิง) — ตัวคอนเทนเนอร์ที่เลื่อนมี overflow-x ของตัวเองเท่านั้น
 * ไม่ทำให้ทั้งหน้ากว้างเกินจอ
 */

/** ทริปที่เราเป็นเจ้าภาพ — ไม่มีข้อมูลลับ (ไม่มี ownerId) ปลอดภัยจะส่งเป็น prop */
export interface HostedTripSummary {
  slug: string;
  title: string;
  createdAt: string;
}

export interface MyTripsProps {
  hostedTrips: HostedTripSummary[];
}

interface JoinedRow {
  slug: string;
  token: string;
  name: string;
}

interface TripRow {
  slug: string;
  title: string;
  /** ลิงก์ที่ควรพาไป — เจ้าภาพไปหน้าผลโหวต คนร่วมไปหน้ากรอก */
  href: string;
  role: "host" | "guest";
  who?: string;
  /** มีเฉพาะทริปที่เราเป็นเจ้าภาพ (guest ไม่มีข้อมูลนี้เก็บไว้) */
  createdAt?: string;
}

function isJoinedRow(v: unknown): v is JoinedRow {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.token === "string" && typeof r.name === "string";
}

/**
 * เอาทริปหนึ่งออกจากรายการฝั่ง guest (localStorage คีย์ "paigun.me")
 *
 * ใช้ตอนการ์ดพาไปเจอ 404 (ทริปถูกลบ/ไม่มีอยู่จริงแล้วที่เซิร์ฟเวอร์) — localStorage
 * เป็นแคชฝั่งเครื่องเราเอง ไม่รู้ตัวเลยว่าทริปฝั่งเซิร์ฟเวอร์หายไปแล้ว จึงต้องมีทาง
 * ให้ผู้ใช้ล้างการ์ดค้างแบบนี้ออกเองได้ (ไม่ใช่แค่ตั้งตี้ใหม่ถึงจะหายไป)
 */
function removeGuestTrip(slug: string): void {
  try {
    const raw = localStorage.getItem("paigun.me");
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return;
    const next = { ...(parsed as Record<string, unknown>) };
    delete next[slug];
    localStorage.setItem("paigun.me", JSON.stringify(next));
  } catch {
    /* เก็บไม่ได้ก็ปล่อยไป — อย่างน้อย state ในหน่วยความจำยังอัปเดตให้แล้ว */
  }
}

/** ทริปที่เราไปร่วมกรอก (guest) — อ่านจาก localStorage เท่านั้น ไม่ต้องล็อกอิน */
function readGuestTrips(): TripRow[] {
  const rows: TripRow[] = [];
  try {
    const raw = localStorage.getItem("paigun.me");
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        for (const [slug, value] of Object.entries(parsed)) {
          if (!isJoinedRow(value)) continue;
          rows.push({
            slug,
            title: slug,
            href: `/t/${slug}?t=${encodeURIComponent(value.token)}`,
            role: "guest",
            who: value.name,
          });
        }
      }
    }
  } catch {
    // โหมดส่วนตัวหรือผู้ใช้ปิดการเก็บข้อมูล — ถือว่าไม่มีรายการ
  }
  return rows.reverse(); // ใหม่สุดขึ้นก่อน
}

/** ตัวเลขวันที่ + ชื่อเดือนย่อ จาก createdAt (ISO timestamp) — คืน null ถ้ารูปแบบผิดปกติ */
function hostBadge(createdAt: string): { day: number; month: string } | null {
  const dateOnly = createdAt.slice(0, 10);
  if (!isISODate(dateOnly)) return null;
  const d = fromISO(dateOnly);
  return { day: d.getDate(), month: THAI_MONTHS_SHORT[d.getMonth()] };
}

function hostFooterText(createdAt: string): string {
  const dateOnly = createdAt.slice(0, 10);
  if (!isISODate(dateOnly)) return "ตั้งไว้แล้ว";
  return `ตั้งไว้เมื่อ ${formatShort(dateOnly)}`;
}

/** อักษรย่อ 2 ตัวจากชื่อทริป — ใช้เป็น badge แทนตัวเลขวันที่ตอนไม่มีข้อมูลวันที่จริง (guest) */
function initials(title: string): string {
  const t = title.trim();
  return t === "" ? "?" : t.slice(0, 2).toUpperCase();
}

/**
 * แถบสีพาสเทลท้ายการ์ด — สลับวนไปเรื่อย ๆ ตามลำดับการ์ด ใช้ตกแต่งล้วน ๆ
 * ไม่ผูกกับสถานะหรือบทบาทใด ๆ (ทริปในหน้านี้ไม่มีข้อมูลสถานะว่าง/ไม่ว่างให้ใช้)
 */
const FOOTER_TONES = [
  { fill: "bg-brand-fill", ink: "text-brand-ink" },
  { fill: "bg-mint-fill", ink: "text-mint-ink" },
  { fill: "bg-sun-fill", ink: "text-sun-ink" },
  { fill: "bg-coral-fill", ink: "text-coral-ink" },
  { fill: "bg-sky-fill", ink: "text-sky-ink" },
  { fill: "bg-lavender-fill", ink: "text-ink-2" },
  { fill: "bg-lemon-fill", ink: "text-ink-2" },
];

export default function MyTrips({ hostedTrips }: MyTripsProps) {
  /** null = ยังไม่ได้อ่าน localStorage ของฝั่ง guest (กัน flash ของข้อความ "ยังไม่มีทริป") */
  const [guestRows, setGuestRows] = useState<TripRow[] | null>(null);

  useEffect(() => {
    setGuestRows(readGuestTrips());
  }, []);

  function handleRemoveGuest(slug: string) {
    removeGuestTrip(slug);
    setGuestRows((prev) => (prev ? prev.filter((r) => r.slug !== slug) : prev));
  }

  if (guestRows === null) {
    return <div className="h-6" aria-hidden="true" />;
  }

  const hostRows: TripRow[] = hostedTrips.map((t) => ({
    slug: t.slug,
    title: t.title,
    href: `/t/${t.slug}/result`,
    role: "host",
    createdAt: t.createdAt,
  }));
  const rows = [...hostRows, ...guestRows];

  if (rows.length === 0) {
    return (
      <p className="text-[0.88rem] text-ink-3">
        ยังไม่มีทริปในเครื่องนี้ — ตั้งตี้ใหม่ หรือเปิดลิงก์ที่เพื่อนแชร์มาในกลุ่ม
      </p>
    );
  }

  return (
    // เลื่อนล้นถึงขอบจอ: ยกเลิก padding ของ <main> ด้วย margin ลบ แล้วคืน padding
    // เท่ากันให้ <ul> ข้างใน จุด overflow-x-auto อยู่ที่กล่องนี้กล่องเดียว
    // ไม่ทำให้ทั้งหน้ากว้างเกินจอ (ดูกฎห้ามเลื่อนแนวนอนทั้งหน้า)
    <div className="-mx-4 md:-mx-8 overflow-x-auto">
      <ul className="flex gap-3 px-4 md:px-8 pb-1 snap-x snap-mandatory">
        {rows.map((row, i) => {
          const badge = row.createdAt ? hostBadge(row.createdAt) : null;
          const footerText = row.createdAt
            ? hostFooterText(row.createdAt)
            : "กรอก/แก้วันว่างได้ตลอด";
          const tone = FOOTER_TONES[i % FOOTER_TONES.length];
          const avatarSeed = row.role === "guest" && row.who ? row.who : row.title;
          const subtitle =
            row.role === "host"
              ? "คุณเป็นเจ้าภาพ · ดูผลโหวต"
              : `กรอกในชื่อ ${row.who} · แก้ได้`;

          return (
            <li key={row.slug} className="relative shrink-0 snap-start w-[210px] sm:w-[230px]">
              {/* เอาออกจากรายการได้เฉพาะการ์ด guest (มาจาก localStorage เครื่องนี้)
                  เพราะการ์ด host มาจาก DB ตรง ๆ เสมอ ไม่มีทางค้างเป็นข้อมูลเก่าได้
                  อยู่นอก <Link> (เป็น sibling ไม่ใช่ลูก) กันปุ่มซ้อนใน a ซึ่งผิดกติกา HTML
                  และกันกดแล้วเผลอลิงก์ไปด้วย */}
              {row.role === "guest" && (
                <button
                  type="button"
                  aria-label={`เอาทริป ${row.title} ออกจากรายการ`}
                  onClick={(e) => {
                    e.preventDefault();
                    handleRemoveGuest(row.slug);
                  }}
                  className="absolute top-1 right-1 z-10 w-11 h-11 rounded-full bg-ink-fixed/70 text-on-ink-fixed grid place-items-center text-[15px] backdrop-blur-sm"
                >
                  ✕
                </button>
              )}
              <Link
                href={row.href}
                className="flex flex-col h-full min-h-[288px] bg-surface rounded-[24px] overflow-hidden"
              >
                <div className="flex-1 p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    {badge ? (
                      <div className="leading-none">
                        <div className="font-mono font-black text-[2.1rem] tnum text-ink">
                          {badge.day}
                        </div>
                        <div className="text-[0.66rem] font-medium text-ink-3 uppercase tracking-wide">
                          {badge.month}
                        </div>
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-[14px] bg-lavender-fill text-ink-2 grid place-items-center font-display font-black text-[1.05rem]">
                        {initials(row.title)}
                      </div>
                    )}
                    <Avatar name={avatarSeed} size={64} className="shrink-0" />
                  </div>

                  <div className="mt-auto">
                    {/* brand/sky เท่านั้น — mint/sun/coral สงวนไว้สื่อสถานะว่างในปฏิทิน
                        เท่านั้น ห้ามเอามาแปะป้ายบทบาทแบบนี้ */}
                    <Pill tone={row.role === "host" ? "brand" : "sky"} className="mb-2">
                      {row.role === "host" ? "เจ้าภาพ" : "ผู้ร่วมทริป"}
                    </Pill>
                    <h3 className="font-display font-bold text-[1.05rem] leading-snug line-clamp-2">
                      {row.title}
                    </h3>
                    <p className="text-[0.76rem] text-ink-3 mt-1 line-clamp-1">{subtitle}</p>
                  </div>
                </div>

                <div
                  className={`flex items-center gap-1.5 px-4 py-2.5 font-medium text-[0.78rem] ${tone.fill} ${tone.ink}`}
                >
                  <span aria-hidden="true">🕒</span>
                  <span className="truncate">{footerText}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
