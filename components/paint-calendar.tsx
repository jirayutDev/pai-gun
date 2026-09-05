"use client";

/**
 * PaintCalendar — ปฏิทิน "แปรงระบายสี"
 *
 * ทำไมต้องเป็นแปรง ไม่ใช่แตะวนสถานะทีละวัน:
 * ถ้าให้แตะวนสถานะ การกรอกช่วง 30 วันคือ 30–90 ครั้ง แทบไม่มีใครกรอกจบ
 * เราจึงแยก "เลือกสี" ออกจาก "ทาสี" — เลือกแปรงหนึ่งครั้ง แล้วลากนิ้วทาบ
 * ทีเดียวได้ทั้งสัปดาห์ ทั้งเดือน
 *
 * เป็น controlled component: ค่าจริงอยู่ที่ parent (prop `value`)
 * ทุกการเปลี่ยนแปลงส่ง object ใหม่กลับผ่าน onChange (immutable)
 * ภายในเก็บเองแค่ แปรงที่เลือกอยู่ · กองย้อนกลับ · สถานะกำลังลาก
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AvailState, Brush } from "@/lib/types";
import {
  THAI_DOW_SHORT,
  addDays,
  eachDay,
  formatShort,
  isWeekend,
  monthGrids,
} from "@/lib/dates";
import { holidayName } from "@/lib/holidays";

export interface PaintCalendarProps {
  rangeStart: string;
  rangeEnd: string;
  value: Record<string, AvailState>;
  onChange: (next: Record<string, AvailState>) => void;
  /** ทริปยาวกี่วัน ใช้แสดงคำใบ้เท่านั้น */
  lengthDays?: number;
  /** โพลปิดแล้ว — อ่านได้แก้ไม่ได้ */
  disabled?: boolean;
}

/* -------------------------------------------------------------------------- */
/* ตารางแปรงและคำไทยของแต่ละสถานะ                                             */
/* -------------------------------------------------------------------------- */

interface BrushDef {
  /** คีย์สตริง เพราะ Brush มีค่า null ใช้เป็น React key ตรง ๆ ไม่ได้ */
  key: string;
  brush: Brush;
  label: string;
  /** คลาสตอนถูกเลือก — พื้นสีเข้มเต็มปุ่ม ตัวหนังสือขาว */
  onClass: string;
  /** สีจุดเล็กบนปุ่มที่ยังไม่ถูกเลือก */
  dotClass: string;
}

const BRUSHES: readonly BrushDef[] = [
  // มิ้นต์/เหลือง/คอรัลเป็นสีสว่างในทั้งสองธีม ตัวหนังสือขาวอ่านไม่ออก (คอนทราสต์ต่ำกว่า 3:1)
  // จึงใช้ text-ink-fixed (เกือบดำ ไม่สลับตามธีม) ซึ่งให้คอนทราสต์ 7–12:1 กับสีพวกนี้เสมอ
  { key: "free", brush: 2, label: "ว่าง", onClass: "bg-mint text-ink-fixed", dotClass: "bg-mint" },
  { key: "maybe", brush: 1, label: "ถ้าจำเป็น", onClass: "bg-sun text-ink-fixed", dotClass: "bg-sun" },
  { key: "busy", brush: 0, label: "ไม่ว่าง", onClass: "bg-coral text-ink-fixed", dotClass: "bg-coral" },
  // ล้าง ใช้คู่สีคงที่ (ไม่สลับตามธีม) เพราะ bg-ink-2 กลับความสว่างข้ามธีม
  // (มืดในโหมดสว่าง แต่สว่างในโหมดมืด) ทำให้ text-white ใช้ได้แค่ธีมเดียว
  { key: "clear", brush: null, label: "ล้าง", onClass: "bg-ink-fixed text-on-ink-fixed", dotClass: "bg-ink-3" },
];

const FREE: AvailState = 2;

function stateWord(s: Brush): string {
  if (s === 2) return "ว่าง";
  if (s === 1) return "ว่างถ้าจำเป็น";
  if (s === 0) return "ไม่ว่าง";
  return "ยังไม่ระบุ";
}

/** อ่านสถานะของวันหนึ่งจาก map — วันที่ไม่มีคีย์คือ "ยังไม่ระบุ" (null) */
function getState(map: Record<string, AvailState>, iso: string): Brush {
  const v: AvailState | undefined = map[iso];
  return v === undefined ? null : v;
}

/**
 * สีพื้น/สีอักษรของช่องวัน — เลือกแล้วต้องเข้มเต็มช่อง เพราะมือถือกลางแดดต้องเห็นชัด
 * ใช้ text-ink-fixed (เกือบดำ ไม่สลับตามธีม) แทน text-white เพราะมิ้นต์/เหลือง/คอรัล
 * เป็นสีสว่างในทั้งสองธีม ตัวหนังสือขาวคอนทราสต์ต่ำกว่า 3:1 (อ่านยากกลางแดดพอดี
 * ซึ่งขัดกับเหตุผลที่สลับมาเป็น dark-first ตั้งแต่แรก)
 */
function cellTone(s: Brush, isHoliday: boolean): string {
  if (s === 2) return "bg-mint text-ink-fixed";
  if (s === 1) return "bg-sun text-ink-fixed";
  if (s === 0) return "bg-coral text-ink-fixed";
  return isHoliday ? "bg-brand-fill text-brand-ink" : "bg-fill text-ink-2";
}

const UNDO_LIMIT = 30;

/* -------------------------------------------------------------------------- */

export default function PaintCalendar({
  rangeStart,
  rangeEnd,
  value,
  onChange,
  lengthDays,
  disabled = false,
}: PaintCalendarProps): React.JSX.Element {
  const readOnly = disabled;

  const [brush, setBrush] = useState<Brush>(FREE);
  const [undoStack, setUndoStack] = useState<Record<string, AvailState>[]>([]);

  const allDays = useMemo(() => eachDay(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const grids = useMemo(() => monthGrids(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const inRange = useMemo(() => new Set(allDays), [allDays]);
  const holidays = useMemo(() => {
    const m: Record<string, string> = {};
    for (const iso of allDays) {
      const name = holidayName(iso);
      if (name !== null) m[iso] = name;
    }
    return m;
  }, [allDays]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  /**
   * กระจกเงาของ value และ brush ที่อ่านได้จาก event handler
   *
   * ระหว่างลากเร็ว ๆ pointermove อาจยิงหลายครั้งก่อน React จะ commit รอบใหม่
   * ถ้าอ่านจาก prop ตรง ๆ ช่องที่ทาไปก่อนหน้าจะหายไป (คำนวณจากฐานเก่า)
   * จึงอัปเดต valueRef เองทันทีที่ทา แล้วให้ useEffect ซิงก์กับค่าจริงจาก parent
   */
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const brushRef = useRef<Brush>(brush);
  useEffect(() => {
    brushRef.current = brush;
  }, [brush]);

  /* ---------------------------------------------------------------------- */
  /* undo                                                                    */
  /* ---------------------------------------------------------------------- */

  /**
   * เก็บสแนปช็อต "ก่อนแก้" ลงกอง
   *
   * สำคัญ: ต้องเรียกหนึ่งครั้งต่อหนึ่งการกระทำ — สำหรับการลากคือเรียกที่
   * pointerdown เท่านั้น ไม่ใช่ทุกช่องที่นิ้วผ่าน มิฉะนั้นการลากยาว 20 ช่อง
   * จะดันกอง 20 ชั้น แล้วปุ่มย้อนกลับต้องกด 20 ครั้งจึงจะกลับไปก่อนลาก
   * ซึ่งพังเจตนาของฟีเจอร์ทั้งอัน
   */
  const pushUndo = useCallback(() => {
    const snap = valueRef.current;
    setUndoStack((prev) => {
      const next = prev.length >= UNDO_LIMIT ? prev.slice(prev.length - UNDO_LIMIT + 1) : prev.slice();
      next.push(snap);
      return next;
    });
  }, []);

  /** เขียนค่าใหม่ทั้งก้อน (ใช้กับปุ่มลัด) — บันทึก undo ก่อนเสมอ */
  const commit = useCallback(
    (next: Record<string, AvailState>) => {
      pushUndo();
      valueRef.current = next;
      onChange(next);
    },
    [pushUndo, onChange],
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const snap = undoStack[undoStack.length - 1];
    valueRef.current = snap;
    setUndoStack((prev) => prev.slice(0, -1));
    onChange(snap);
  }, [undoStack, onChange]);

  /* ---------------------------------------------------------------------- */
  /* ทาสีหนึ่งช่อง                                                          */
  /* ---------------------------------------------------------------------- */

  const paintDay = useCallback(
    (iso: string) => {
      const cur = valueRef.current;
      const b = brushRef.current;
      // ถ้าช่องนี้เป็นสีเดียวกับแปรงอยู่แล้วก็ข้าม ไม่เรียก onChange
      // กัน re-render รัว ๆ ตอนลากผ่านช่องที่ทาไปแล้ว
      if (getState(cur, iso) === b) return;
      const next = { ...cur };
      if (b === null) delete next[iso];
      else next[iso] = b;
      valueRef.current = next;
      onChange(next);
    },
    [onChange],
  );

  /* ---------------------------------------------------------------------- */
  /* pointer: แตะ = ทาช่องเดียว · ลาก = ทาไปเรื่อย ๆ                        */
  /* ---------------------------------------------------------------------- */

  const handleDayPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>, iso: string) => {
      if (readOnly) return;
      pushUndo(); // หนึ่งครั้งต่อหนึ่งลาก — ดูคำอธิบายที่ pushUndo
      draggingRef.current = true;
      const el = containerRef.current;
      if (el) {
        try {
          // จับ pointer ไว้ที่ container เพื่อให้ pointermove ยังยิงเข้ามา
          // แม้นิ้วจะเลื่อนออกนอกปุ่มที่กดเริ่ม — บางเบราว์เซอร์โยน error
          el.setPointerCapture(e.pointerId);
        } catch {
          /* ไม่รองรับก็ไม่เป็นไร ยังได้ pointermove ตามปกติ */
        }
      }
      paintDay(iso);
    },
    [readOnly, pushUndo, paintDay],
  );

  const handleContainerPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (readOnly || !draggingRef.current) return;
      /**
       * ต้องใช้ elementFromPoint หาช่องใต้นิ้วเอง
       *
       * บนทัชสกรีน pointer ถูก "ล็อก" ไว้กับ element ที่เริ่มแตะ
       * (implicit pointer capture) จึงไม่มี pointerenter/pointerover ยิงกับ
       * ช่องอื่นระหว่างลากเลย ถ้ารอ event จาก element ปลายทางจะทาได้ช่องเดียว
       * ตลอดกาล — วิธีเดียวที่ใช้ได้จริงคือถามพิกัดว่าตรงนี้มีช่องอะไรอยู่
       */
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      if (!hit) return;
      const cell = hit.closest<HTMLElement>("[data-day]");
      const iso = cell?.dataset.day;
      if (iso) paintDay(iso);
    },
    [readOnly, paintDay],
  );

  // จบการลากที่ window เพราะผู้ใช้ปล่อยนิ้วนอกปฏิทินได้ (และ pointercancel
  // จะยิงเมื่อเบราว์เซอร์ตัดสินว่าท่านี้คือการเลื่อนหน้าแนวตั้ง)
  useEffect(() => {
    if (readOnly) return;
    const end = (e: PointerEvent) => {
      draggingRef.current = false;
      const el = containerRef.current;
      if (el) {
        try {
          if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
        } catch {
          /* เงียบไว้ */
        }
      }
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [readOnly]);

  /**
   * คีย์บอร์ด: Enter/Space บนปุ่มยิง click ที่ detail === 0
   * ส่วน click จากนิ้ว/เมาส์มี detail >= 1 ซึ่ง pointerdown ทาไปแล้ว
   * จึงข้ามทิ้ง ไม่ให้ทาซ้ำและไม่ให้ดัน undo สองชั้นต่อการแตะครั้งเดียว
   */
  const handleDayClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, iso: string) => {
      if (readOnly || e.detail !== 0) return;
      pushUndo();
      paintDay(iso);
    },
    [readOnly, pushUndo, paintDay],
  );

  /* ---------------------------------------------------------------------- */
  /* ปุ่มลัด                                                                */
  /* ---------------------------------------------------------------------- */

  const fillWeekends = useCallback(() => {
    const next = { ...valueRef.current };
    for (const iso of allDays) if (isWeekend(iso)) next[iso] = FREE;
    commit(next);
  }, [allDays, commit]);

  const fillLongWeekends = useCallback(() => {
    const next = { ...valueRef.current };
    for (const iso of allDays) {
      if (holidays[iso] === undefined) continue;
      next[iso] = FREE;
      // วันติดกัน ±1 ถ้าเป็นเสาร์หรืออาทิตย์ก็ว่างด้วย → ได้หยุดยาวโดยไม่ต้องลา
      for (const step of [-1, 1]) {
        const nb = addDays(iso, step);
        if (inRange.has(nb) && isWeekend(nb)) next[nb] = FREE;
      }
    }
    commit(next);
  }, [allDays, holidays, inRange, commit]);

  const fillAll = useCallback(() => {
    const next: Record<string, AvailState> = {};
    for (const iso of allDays) next[iso] = FREE;
    commit(next);
  }, [allDays, commit]);

  const clearAll = useCallback(() => {
    commit({});
  }, [commit]);

  /* ---------------------------------------------------------------------- */
  /* ตัวนับ                                                                 */
  /* ---------------------------------------------------------------------- */

  const stats = useMemo(() => {
    let free = 0;
    let maybe = 0;
    let busy = 0;
    for (const iso of allDays) {
      const s = getState(value, iso);
      if (s === 2) free++;
      else if (s === 1) maybe++;
      else if (s === 0) busy++;
    }
    return { free, maybe, busy, unset: allDays.length - free - maybe - busy };
  }, [allDays, value]);

  /* ---------------------------------------------------------------------- */
  /* render                                                                  */
  /* ---------------------------------------------------------------------- */

  const chip = "rounded-full bg-fill text-ink-2 px-4 py-2 text-[13px] min-h-[40px]";

  return (
    <div className="font-body">
      {/* แถบเลือกแปรง — sticky เพราะช่วงวันอาจยาวหลายเดือน ต้องเลื่อนดู
          แต่แปรงต้องเอื้อมถึงได้ตลอดโดยไม่ต้องเลื่อนกลับขึ้นบน */}
      {!readOnly && (
        <div className="sticky top-0 z-10 bg-surface rounded-[16px] px-2 py-2">
          <div role="group" aria-label="เลือกแปรง" className="grid grid-cols-4 gap-[5px]">
            {BRUSHES.map((b) => {
              const active = brush === b.brush;
              return (
                <button
                  key={b.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setBrush(b.brush)}
                  className={[
                    "min-h-[44px] rounded-[13px] px-2 py-2",
                    "font-display font-semibold tracking-tight text-[13px] md:text-[14px]",
                    "flex items-center justify-center gap-1.5",
                    active ? b.onClass : "bg-fill text-ink-2",
                  ].join(" ")}
                >
                  {!active && (
                    <span
                      aria-hidden="true"
                      className={`inline-block h-2 w-2 shrink-0 rounded-full ${b.dotClass}`}
                    />
                  )}
                  <span>{b.label}</span>
                </button>
              );
            })}
          </div>
          <p className="px-1 pt-1.5 text-[12px] leading-snug text-ink-3">
            เลือกสีแล้วแตะหรือลากนิ้วทาบบนปฏิทินได้ทีเดียวหลายวัน
          </p>
        </div>
      )}

      {/* ปุ่มลัด — กรอกทั้งเดือนจบในกดเดียว */}
      {!readOnly && (
        <div className="flex flex-wrap gap-[6px] pt-3">
          <button type="button" onClick={fillWeekends} className={chip}>
            ว่างทุกเสาร์-อาทิตย์
          </button>
          <button type="button" onClick={fillLongWeekends} className={chip}>
            ว่างช่วงวันหยุดยาว
          </button>
          <button type="button" onClick={fillAll} className={chip}>
            ว่างทั้งช่วง
          </button>
          <button type="button" onClick={clearAll} className={chip}>
            ล้างทั้งหมด
          </button>
          {/* ปุ่มย้อนกลับจำเป็นมาก การลากพลาดเกิดขึ้นเสมอ
              ถ้าแก้คืนยาก คนจะเลิกกรอกกลางทาง */}
          <button
            type="button"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className={`${chip} disabled:text-ink-3`}
          >
            ↺ ย้อนกลับ
          </button>
        </div>
      )}

      {/* ปฏิทินรายเดือน — ไม่ใช้ตารางกริดแบบ When2meet เพราะจอมือถือแคบเกิน */}
      <div
        ref={containerRef}
        onPointerMove={readOnly ? undefined : handleContainerPointerMove}
        className="select-none pt-4"
        style={{
          /**
           * pan-y = ลากแนวนอนเป็นการระบาย · ปัดแนวตั้งยังเลื่อนหน้าได้ปกติ
           * ห้ามเปลี่ยนเป็น none เด็ดขาด เพราะจะยึดท่าทางทั้งหมดไว้ที่ปฏิทิน
           * ผู้ใช้จะเลื่อนหน้าไม่ได้เลยเมื่อนิ้วอยู่บนปฏิทิน (ซึ่งกินจอเกือบหมด)
           */
          touchAction: "pan-y",
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
      >
        {grids.map((grid) => (
          <section key={`${grid.year}-${grid.month}`} className="pb-6">
            <h3 className="font-display font-bold tracking-tight text-[17px] text-ink pb-2">
              {grid.label}
            </h3>

            <div className="grid grid-cols-7 gap-[5px] pb-1" aria-hidden="true">
              {THAI_DOW_SHORT.map((name, i) => (
                <div
                  key={name}
                  className={`text-center text-[11px] leading-6 ${
                    i === 0 || i === 6 ? "text-coral-ink" : "text-ink-3"
                  }`}
                >
                  {name}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-[5px]">
              {/* ช่องว่างนำหน้าให้วันที่ 1 ตกคอลัมน์ที่ถูกต้อง */}
              {Array.from({ length: grid.leading }, (_, i) => (
                <div key={`lead-${i}`} aria-hidden="true" className="aspect-square" />
              ))}

              {grid.days.map((iso, i) => {
                const dayNum = i + 1;

                // วันที่อยู่นอกช่วงโหวต: ยังแสดงให้เห็นแบบจาง ๆ แต่กดไม่ได้
                // ไม่ทำเป็นช่องว่างเปล่า เพราะคนต้องเห็นว่าวันนั้นมีอยู่จริง
                // เพียงแต่เจ้าภาพไม่ได้เปิดให้โหวต
                if (iso === null) {
                  return (
                    <div
                      key={`out-${dayNum}`}
                      aria-hidden="true"
                      className="pointer-events-none flex aspect-square min-h-[44px] md:min-h-[60px] items-center justify-center rounded-[13px] bg-fill text-[13px] text-ink-3 opacity-45 tnum"
                    >
                      {dayNum}
                    </div>
                  );
                }

                const state = getState(value, iso);
                const hName = holidays[iso];
                const isHoliday = hName !== undefined;
                const label = `${formatShort(iso)}${isHoliday ? ` ${hName}` : ""}: ${stateWord(state)}`;

                return (
                  <button
                    key={iso}
                    type="button"
                    data-day={iso}
                    disabled={readOnly}
                    aria-label={label}
                    onPointerDown={readOnly ? undefined : (e) => handleDayPointerDown(e, iso)}
                    onClick={readOnly ? undefined : (e) => handleDayClick(e, iso)}
                    className={[
                      "flex aspect-square min-h-[44px] md:min-h-[60px] flex-col items-center justify-center",
                      "rounded-[13px] leading-none",
                      cellTone(state, isHoliday),
                      // วันหยุดราชการมีขอบม่วงทุกกรณี ไม่ว่าจะทาสีอะไรทับ
                      // คนจะเห็นทันทีว่าช่วงไหนน่าไป ไม่ต้องเปิดปฏิทินอีกแอปมาเทียบ
                      isHoliday ? "ring-2 ring-brand ring-inset" : "",
                    ].join(" ")}
                  >
                    <span className="tnum font-display font-semibold text-[15px] md:text-[17px]">
                      {dayNum}
                    </span>
                    {isHoliday && (
                      <span className="pt-[3px] text-[9px] md:text-[10px] opacity-90">หยุด</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* ตัวนับ — ให้รู้ว่ากรอกครบหรือยัง */}
      <div className="rounded-[16px] bg-fill px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
          <span className="text-ink">
            <span aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 rounded-full bg-mint" />
            ว่าง <span className="tnum font-semibold">{stats.free}</span> วัน
          </span>
          <span className="text-ink">
            <span aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 rounded-full bg-sun" />
            ถ้าจำเป็น <span className="tnum font-semibold">{stats.maybe}</span> วัน
          </span>
          <span className="text-ink">
            <span aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 rounded-full bg-coral" />
            ไม่ว่าง <span className="tnum font-semibold">{stats.busy}</span> วัน
          </span>
        </div>
        <p className="pt-1 text-[13px] text-ink-2">
          {stats.unset > 0 ? (
            <>
              เหลือ <span className="tnum font-semibold">{stats.unset}</span> วันที่ยังไม่ระบุ
            </>
          ) : (
            "ระบุครบทุกวันแล้ว"
          )}
        </p>
        {lengthDays !== undefined && (
          <p className="pt-0.5 text-[12px] text-ink-3">
            ทริปยาว <span className="tnum">{lengthDays}</span> วัน — เลือกให้ครบช่วงที่ไปได้
          </p>
        )}
      </div>
    </div>
  );
}
