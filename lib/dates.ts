/**
 * PaiGun — เครื่องมือจัดการวันที่
 *
 * กฎเหล็ก: วันที่ในระบบนี้เป็นสตริง "YYYY-MM-DD" เสมอ ไม่มีโซนเวลา
 * ทุกครั้งที่ต้องใช้ Date เราสร้างด้วย new Date(y, m-1, d) ซึ่งเป็นเวลาท้องถิ่น
 * จึงไม่มีปัญหาวันเคลื่อนข้ามโซนเวลาแบบที่เกิดกับ new Date("2026-10-23")
 */

export const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

export const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** อา จ อ พ พฤ ศ ส — index ตรงกับ Date.getDay() */
export const THAI_DOW_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
export const THAI_DOW_FULL = [
  "อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์",
];

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(s: string): boolean {
  return ISO_RE.test(s);
}

/** แปลง "YYYY-MM-DD" เป็น Date เวลาท้องถิ่นเที่ยงวัน (กัน DST ขยับวัน) */
export function fromISO(iso: string): Date {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`รูปแบบวันที่ไม่ถูกต้อง: ${iso}`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** จำนวนวันจาก a ถึง b (b - a) — 0 ถ้าวันเดียวกัน */
export function daysBetween(a: string, b: string): number {
  const ms = fromISO(b).getTime() - fromISO(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** รายการวันทั้งหมดตั้งแต่ start ถึง end (รวมปลายทั้งสองข้าง) */
export function eachDay(start: string, end: string): string[] {
  const n = daysBetween(start, end);
  if (n < 0) return [];
  const out: string[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) out[i] = addDays(start, i);
  return out;
}

/** 0 = อาทิตย์ ... 6 = เสาร์ */
export function dow(iso: string): number {
  return fromISO(iso).getDay();
}

export function isWeekend(iso: string): boolean {
  const d = dow(iso);
  return d === 0 || d === 6;
}

/** "23 ต.ค." */
export function formatShort(iso: string): string {
  const d = fromISO(iso);
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]}`;
}

/** "23 ต.ค. 2026" */
export function formatShortYear(iso: string): string {
  return `${formatShort(iso)} ${fromISO(iso).getFullYear()}`;
}

/** "ศุกร์ 23 ต.ค." */
export function formatWithDow(iso: string): string {
  return `${THAI_DOW_FULL[dow(iso)]} ${formatShort(iso)}`;
}

/** "23–25 ต.ค." ถ้าเดือนเดียวกัน ไม่งั้น "30 ต.ค. – 1 พ.ย." */
export function formatRange(start: string, end: string): string {
  const a = fromISO(start);
  const b = fromISO(end);
  if (start === end) return formatShort(start);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()}–${b.getDate()} ${THAI_MONTHS_SHORT[b.getMonth()]}`;
  }
  return `${formatShort(start)} – ${formatShort(end)}`;
}

/** "ศุกร์–อาทิตย์" */
export function formatDowRange(start: string, end: string): string {
  if (start === end) return THAI_DOW_FULL[dow(start)];
  return `${THAI_DOW_FULL[dow(start)]}–${THAI_DOW_FULL[dow(end)]}`;
}

/** วันนี้ตามเวลาไทย ในรูป "YYYY-MM-DD" — ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์ */
export function todayBangkok(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts; // en-CA ให้รูปแบบ YYYY-MM-DD
}

/**
 * แบ่งช่วงวันเป็นเดือน ๆ สำหรับวาดปฏิทินหลายเดือน
 * คืนค่าเดือนที่มีวันอยู่ในช่วง พร้อมช่องว่างนำหน้าให้ตรงคอลัมน์วันอาทิตย์
 */
export interface MonthGrid {
  year: number;
  /** 0 = มกราคม */
  month: number;
  label: string;
  /** จำนวนช่องว่างก่อนวันที่ 1 ของเดือน */
  leading: number;
  /** วันในเดือนนี้ที่อยู่ในช่วง — วันอื่นเป็น null เพื่อคงตำแหน่งคอลัมน์ */
  days: (string | null)[];
}

export function monthGrids(rangeStart: string, rangeEnd: string): MonthGrid[] {
  const all = eachDay(rangeStart, rangeEnd);
  if (all.length === 0) return [];
  const inRange = new Set(all);
  const grids: MonthGrid[] = [];
  let cursor = fromISO(all[0]);
  const last = fromISO(all[all.length - 1]);

  while (
    cursor.getFullYear() < last.getFullYear() ||
    (cursor.getFullYear() === last.getFullYear() && cursor.getMonth() <= last.getMonth())
  ) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const first = new Date(y, m, 1, 12);
    const dim = new Date(y, m + 1, 0, 12).getDate();
    const days: (string | null)[] = [];
    for (let d = 1; d <= dim; d++) {
      const iso = toISO(new Date(y, m, d, 12));
      days.push(inRange.has(iso) ? iso : null);
    }
    grids.push({
      year: y,
      month: m,
      label: `${THAI_MONTHS_FULL[m]} ${y}`,
      leading: first.getDay(),
      days,
    });
    cursor = new Date(y, m + 1, 1, 12);
  }
  return grids;
}
