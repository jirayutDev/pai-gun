/**
 * OG image สำหรับ /t/[slug] — การ์ดพรีวิวตอนแปะลิงก์ในแชท LINE
 *
 * แอปนี้ไม่มีระบบแจ้งเตือนเลย (ไม่มีอีเมล ไม่มี push) รูปนี้คือสิ่งเดียวที่ทำหน้าที่
 * "เห้ย มีโพลทริป เข้าไปดูสิ" ตอนมีคนแปะลิงก์ในกลุ่ม จึงต้องอ่านออกในตัวเอง
 * ไม่ต้องกดเข้าไปก่อนถึงจะรู้ว่านี่คือทริปอะไร ตอบกันไปกี่คนแล้ว
 *
 * Satori (เอนจินหลัง ImageResponse) อ่าน CSS variable ไม่ได้และโหลดฟอนต์ระบบไม่ได้
 * จึงต้อง hardcode ค่าสีจาก :root ใน app/globals.css (โหมดสว่าง) ตรงนี้ และโหลด
 * ไฟล์ฟอนต์ไทยจริงมาฝังให้ทุก text node แทน — ไม่งั้นภาษาไทยจะกลายเป็นสี่เหลี่ยม (tofu)
 *
 * ⚠️ ห้ามอ่าน/ส่ง adminKey หรือ participants[].token ลงมาที่นี่เด็ดขาด — trip ที่โหลด
 * มาจาก getTrip() มีทั้งสองอย่างติดมาด้วย จึงหยิบใช้เฉพาะฟิลด์ที่ต้องใช้จริง ๆ เท่านั้น
 * (title, rangeStart, rangeEnd, participants[].submittedAt/.length) ไม่ spread ทั้งก้อน
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

import { formatRange } from "@/lib/dates";
import { getTrip } from "@/lib/store";

// อ่านไฟล์ระบบตอน request จริง (ไม่ใช่ edge) — ต้องบังคับ Node runtime
export const runtime = "nodejs";

export const alt = "การ์ดพรีวิวทริป";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FONT_PATH = path.join(process.cwd(), "public/fonts/IBMPlexSansThai-Bold.ttf");
const FONT_FAMILY = "IBM Plex Sans Thai";

// สีคัดจาก :root ของ app/globals.css (โหมดสว่าง) — Satori วาดตามค่านี้ตรง ๆ ไม่ผ่าน CSS
const COLOR = {
  paper: "#faf8ff",
  surface: "#ffffff",
  ink: "#1b1340",
  ink2: "#655c8c",
  brand: "#6d48ff",
  mint: "#00875c", // --mint-ink — ใช้เป็นตัวหนังสือบนพื้น mint-fill
  mintFill: "#d2f6e8", // --mint-fill
  line: "#eae4fb",
};

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<ImageResponse> {
  const { slug } = await params;
  const [trip, fontData] = await Promise.all([getTrip(slug), readFile(FONT_PATH)]);

  const fonts = [
    { name: FONT_FAMILY, data: fontData, style: "normal" as const, weight: 700 as const },
  ];

  if (trip === null) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: COLOR.paper,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: 1040,
              height: 470,
              background: COLOR.surface,
              border: `1px solid ${COLOR.line}`,
              borderRadius: 32,
            }}
          >
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: 56,
                fontWeight: 700,
                color: COLOR.ink,
              }}
            >
              ไม่พบทริปนี้
            </div>
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: 30,
                fontWeight: 700,
                color: COLOR.ink2,
                marginTop: 20,
              }}
            >
              ลิงก์นี้อาจพิมพ์ผิด หรือทริปถูกลบไปแล้ว
            </div>
          </div>
        </div>
      ),
      { ...size, fonts }
    );
  }

  const total = trip.participants.length;
  const answered = trip.participants.filter((p) => p.submittedAt !== null).length;
  const dateLabel = formatRange(trip.rangeStart, trip.rangeEnd);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: COLOR.paper,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 1080,
            height: 470,
            background: COLOR.surface,
            border: `1px solid ${COLOR.line}`,
            borderRadius: 32,
            padding: 64,
          }}
        >
          {/* eyebrow — แบรนด์ */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontFamily: FONT_FAMILY,
              fontSize: 28,
              fontWeight: 700,
              color: COLOR.brand,
              letterSpacing: -0.5,
            }}
          >
            PaiGun
          </div>

          {/* ชื่อทริป */}
          <div
            style={{
              display: "flex",
              fontFamily: FONT_FAMILY,
              fontSize: 64,
              fontWeight: 700,
              color: COLOR.ink,
              lineHeight: 1.2,
              marginTop: 20,
              // ตัดไม่เกิน 2 บรรทัด กันชื่อยาวล้นการ์ด
              maxHeight: 160,
              overflow: "hidden",
            }}
          >
            {trip.title}
          </div>

          {/* ช่วงวันที่ */}
          <div
            style={{
              display: "flex",
              fontFamily: FONT_FAMILY,
              fontSize: 34,
              fontWeight: 700,
              color: COLOR.ink2,
              marginTop: 20,
            }}
          >
            {dateLabel}
          </div>

          {/* สถานะตอบแล้ว — ใช้คู่สีมิ้นต์เดียวกับที่หน้าอื่นในแอปใช้บอกว่า "ตอบแล้ว/ว่าง" */}
          <div
            style={{
              display: "flex",
              marginTop: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: COLOR.mintFill,
                color: COLOR.mint,
                borderRadius: 999,
                padding: "16px 32px",
                fontFamily: FONT_FAMILY,
                fontSize: 30,
                fontWeight: 700,
              }}
            >
              {`ตอบแล้ว ${answered} จาก ${total} คน`}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
