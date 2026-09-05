"use client";

/**
 * ปฏิทินสรุปว่าใครว่างวันไหน (อ่านอย่างเดียว) — ตอบคำถาม "ใครเลือกวันไหนอะไรไป"
 * ตรงตัวโดยไม่ต้องกดเข้าไปทีละคน แตะช่องวันไหนเห็นรายชื่อ+สถานะของวันนั้นทั้งหมด
 *
 * ไม่ใช้ตารางกริดแบบ When2meet (คนเป็นแถว วันเป็นคอลัมน์) เพราะช่วงโหวตยาวได้ถึง
 * 90 วัน คอลัมน์จะเยอะเกินจอมือถือ (เหตุผลเดียวกับที่ paint-calendar.tsx เลือกใช้
 * ปฏิทินรายเดือนแทน) — ใช้ปฏิทินรายเดือนแบบเดียวกัน แต่ละช่องวันโชว์ "ว่างกี่/ทั้งหมด"
 * ทาสีตามสถานะข้างมากของวันนั้น แล้วให้รายชื่อจริงไปอยู่ในโมดัลตอนแตะแทน
 *
 * เป็นคอมโพเนนต์คนละตัวจาก paint-calendar.tsx (อ่านอย่างเดียว ไม่มีการลาก/ทาสี)
 * ไม่แตะไฟล์นั้นเลยตามกฎ
 */

import { useState } from "react";
import { THAI_DOW_SHORT, formatShort, monthGrids } from "@/lib/dates";
import type { AvailState } from "@/lib/types";
import Swal from "sweetalert2";

export interface DayParticipant {
  name: string;
  isKey: boolean;
  days: Record<string, AvailState>;
}

export interface DayStatusCalendarProps {
  rangeStart: string;
  rangeEnd: string;
  participants: DayParticipant[];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STATUS_LABEL: Record<AvailState, string> = { 2: "ว่าง", 1: "ว่างถ้าจำเป็น", 0: "ไม่ว่าง" };
const STATUS_TONE: Record<AvailState, string> = { 2: "mint", 1: "sun", 0: "coral" };

/** เปิดโมดัลรายชื่อ+สถานะของวันหนึ่ง เรียงว่างก่อน แล้วค่อยว่างถ้าจำเป็น/ไม่ว่าง/ยังไม่ตอบ */
function openDayDetail(iso: string, participants: DayParticipant[]): void {
  const rows = participants
    .map((p) => {
      const state = p.days[iso];
      const label = state === undefined ? "ยังไม่ตอบ" : STATUS_LABEL[state];
      const tone = state === undefined ? null : STATUS_TONE[state];
      const badgeStyle =
        tone !== null
          ? `background:var(--${tone}-fill);color:var(--${tone}-ink);`
          : "background:var(--fill);color:var(--ink-3);";
      const keyTag = p.isKey
        ? '<span style="font-size:11px;color:var(--brand-ink);margin-left:6px;">ขาดไม่ได้</span>'
        : "";
      return {
        sortKey: state === undefined ? 3 : 2 - state,
        html: `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 2px;">
          <span style="font-weight:600;font-size:14px;">${escapeHtml(p.name)}${keyTag}</span>
          <span style="${badgeStyle}padding:2px 10px;border-radius:999px;font-size:12px;font-weight:500;white-space:nowrap;">${label}</span>
        </div>`,
      };
    })
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((r) => r.html)
    .join("");

  void Swal.fire({
    title: formatShort(iso),
    html: `<div style="text-align:left;max-height:60vh;overflow-y:auto;">${rows}</div>`,
    background: "var(--surface)",
    color: "var(--ink)",
    confirmButtonText: "ปิด",
    confirmButtonColor: "var(--brand)",
    customClass: { popup: "font-body rounded-[24px]", confirmButton: "font-display font-semibold" },
  });
}

export default function DayStatusCalendar({
  rangeStart,
  rangeEnd,
  participants,
}: DayStatusCalendarProps) {
  const [grids] = useState(() => monthGrids(rangeStart, rangeEnd));
  const total = participants.length;

  function cellInfo(iso: string): { free: number; maybe: number; busy: number; tone: string } {
    let free = 0;
    let maybe = 0;
    let busy = 0;
    for (const p of participants) {
      const s = p.days[iso];
      if (s === 2) free++;
      else if (s === 1) maybe++;
      else if (s === 0) busy++;
    }
    const max = Math.max(free, maybe, busy);
    const tone = max === 0 ? "bg-fill text-ink-3" : free === max ? "bg-mint-fill text-mint-ink" : maybe === max ? "bg-sun-fill text-sun-ink" : "bg-coral-fill text-coral-ink";
    return { free, maybe, busy, tone };
  }

  if (total === 0) return null;

  return (
    <div>
      {grids.map((grid) => (
        <section key={`${grid.year}-${grid.month}`} className="pb-5">
          <h3 className="font-display font-bold tracking-tight text-[15px] text-ink pb-2">
            {grid.label}
          </h3>
          <div className="grid grid-cols-7 gap-[5px] pb-1" aria-hidden="true">
            {THAI_DOW_SHORT.map((name, i) => (
              <div
                key={name + i}
                className={`text-center text-[10px] leading-5 ${i === 0 || i === 6 ? "text-coral-ink" : "text-ink-3"}`}
              >
                {name}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-[5px]">
            {Array.from({ length: grid.leading }, (_, i) => (
              <div key={`lead-${i}`} aria-hidden="true" />
            ))}
            {grid.days.map((iso, i) => {
              if (iso === null) return <div key={`empty-${i}`} aria-hidden="true" />;
              const { free, tone } = cellInfo(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => openDayDetail(iso, participants)}
                  aria-label={`${formatShort(iso)} — ว่าง ${free} จาก ${total} คน แตะดูรายชื่อ`}
                  className={`flex aspect-square min-h-[44px] md:min-h-[60px] flex-col items-center justify-center rounded-[10px] leading-none ${tone}`}
                >
                  <span className="tnum font-display font-semibold text-[12px]">{i + 1}</span>
                  <span className="tnum text-[10px] opacity-80">
                    {free}/{total}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
