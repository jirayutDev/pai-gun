"use client";

/**
 * DatePicker — ปฏิทินเลือกวันเดียวแบบกำหนดสไตล์เอง (ไม่ใช่ input type=date ของเบราว์เซอร์)
 *
 * ทำไมไม่ใช้ input type=date ตรง ๆ: ปฏิทินที่เด้งขึ้นมาเป็นของระบบปฏิบัติการ/เบราว์เซอร์
 * ล้วน ๆ กำหนดสีหรือหน้าตาเองไม่ได้เลย (แค่ปุ่มเปิดพอคุมสไตล์ได้) ทำให้ไม่เข้ากับธีม
 * ของแอป — คอมโพเนนต์นี้วาดปฏิทินเองทั้งหมด ใช้ตรรกะเดือน/สัปดาห์จาก lib/dates.ts
 * ชุดเดียวกับที่ paint-calendar.tsx ใช้ (ไม่คิดเลขวันที่ซ้ำเอง)
 *
 * ค่าที่คืนยังเป็น "YYYY-MM-DD" ล้วนเหมือนเดิมทุกที่ในระบบ
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  THAI_DOW_SHORT,
  daysBetween,
  formatShortYear,
  fromISO,
  isISODate,
  monthGrids,
  todayBangkok,
  toISO,
} from "@/lib/dates";

function monthFirst(iso: string): string {
  const d = fromISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1, 12));
}

function monthLast(iso: string): string {
  const d = fromISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
}

function shiftMonth(iso: string, delta: number): string {
  const d = fromISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() + delta, 1, 12));
}

export interface DatePickerProps {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
  /** วันต่ำสุดที่เลือกได้ (รวมวันนั้น) — ปล่อยว่างถ้าไม่จำกัด */
  min?: string;
  placeholder?: string;
  className?: string;
  "aria-describedby"?: string;
}

export default function DatePicker({
  id,
  value,
  onChange,
  min,
  placeholder = "เลือกวันที่",
  className = "",
  ...rest
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  // "" = ยังไม่เคยเปิด — คำนวณเดือนที่จะแสดงตอนเปิดจริงเท่านั้น (ไม่ใช่ตอน render
  // ครั้งแรก) เพราะ todayBangkok() ต้องรอ mount เหมือนที่อื่นในไฟล์นี้กัน hydration mismatch
  const [view, setView] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function handleToggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setView(monthFirst(isISODate(value) ? value : todayBangkok()));
    setOpen(true);
  }

  const grid = useMemo(() => {
    if (view === "") return null;
    return monthGrids(view, monthLast(view))[0] ?? null;
  }, [view]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        id={id}
        onClick={handleToggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        {...rest}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-full bg-fill px-5 text-left text-[16px] outline-none md:min-h-[52px]"
      >
        <span className={isISODate(value) ? "text-ink" : "text-ink-3"}>
          {isISODate(value) ? formatShortYear(value) : placeholder}
        </span>
        <span aria-hidden="true" className="shrink-0 text-ink-3">
          📅
        </span>
      </button>

      {open && grid && (
        <div
          role="dialog"
          aria-label="เลือกวันที่"
          className="absolute z-30 mt-2 w-[280px] rounded-[20px] border border-line bg-surface p-3 shadow-lg shadow-black/30"
        >
          <div className="flex items-center justify-between pb-2">
            <button
              type="button"
              onClick={() => setView((v) => shiftMonth(v, -1))}
              aria-label="เดือนก่อนหน้า"
              className="grid min-h-[36px] min-w-[36px] place-items-center rounded-full text-[16px] text-ink-2"
            >
              ‹
            </button>
            <p className="font-display font-semibold text-[14px] text-ink">{grid.label}</p>
            <button
              type="button"
              onClick={() => setView((v) => shiftMonth(v, 1))}
              aria-label="เดือนถัดไป"
              className="grid min-h-[36px] min-w-[36px] place-items-center rounded-full text-[16px] text-ink-2"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 pb-1" aria-hidden="true">
            {THAI_DOW_SHORT.map((d, i) => (
              <div
                key={d + i}
                className="text-center text-[11px] leading-6 text-ink-3"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: grid.leading }, (_, i) => (
              <div key={`lead-${i}`} aria-hidden="true" />
            ))}
            {grid.days.map((iso, i) => {
              if (iso === null) return <div key={`empty-${i}`} aria-hidden="true" />;
              const dayNum = i + 1;
              const disabled = min !== undefined && min !== "" && daysBetween(min, iso) < 0;
              const selected = iso === value;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                  className={[
                    "aspect-square min-h-[36px] rounded-full text-[13px] tnum",
                    selected
                      ? "bg-brand font-semibold text-on-brand"
                      : disabled
                        ? "text-ink-3 opacity-40"
                        : "text-ink",
                  ].join(" ")}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
