"use client";

/**
 * CreateTripForm — วิซาร์ดตั้งตี้ 3 ขั้นในหน้าเดียว
 *
 * ทำไมไม่แยกเป็น 3 route:
 * เจ้าภาพเกือบทั้งหมดอยู่บนมือถือ ถ้าเปลี่ยน route ทุกขั้น การกดปุ่มย้อนกลับ
 * ของเบราว์เซอร์จะพาออกจากฟอร์มและกินคำตอบที่กรอกไว้หายทั้งหมด
 * เก็บทุกอย่างเป็น state ก้อนเดียวในหน้าเดียวจึงย้อนกลับไปแก้ได้ฟรี
 *
 * เรื่องที่ต้องระวังที่สุดในไฟล์นี้มีสองข้อ
 * 1. hydration — `todayBangkok()` บนเซิร์ฟเวอร์กับในเบราว์เซอร์ให้คนละค่าได้
 *    (เซิร์ฟเวอร์อยู่โซนอื่น หรือข้ามเที่ยงคืนไทยระหว่างส่งหน้า) จึงห้ามเรียก
 *    ตอน render ครั้งแรกเด็ดขาด — ต้องตั้งค่าใน useEffect หลัง mount เท่านั้น
 * 2. adminKey — ถ้าเจ้าภาพทำลิงก์แอดมินหาย จะแก้ทริปตัวเองไม่ได้อีกเลย
 *    จึงต้องเขียนลง localStorage ให้เสร็จ "ก่อน" เปลี่ยนหน้า
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createTripAction } from "@/app/actions";
import Avatar from "@/components/ui/avatar";
import DatePicker from "@/components/ui/date-picker";
import {
  addDays,
  daysBetween,
  formatShort,
  fromISO,
  isISODate,
  toISO,
  todayBangkok,
} from "@/lib/dates";
import type { CreateTripInput } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/* ค่าคงที่ — ต้องตรงกับที่ lib/store.ts ตรวจฝั่งเซิร์ฟเวอร์                   */
/* -------------------------------------------------------------------------- */

/** ช่วงโหวตกว้างได้ไม่เกินเท่านี้ (เซิร์ฟเวอร์ปฏิเสธถ้าเกิน) */
const MAX_RANGE_DAYS = 90;
/** ทริปยาวได้ไม่เกินเท่านี้ */
const MAX_LENGTH_DAYS = 14;
const MAX_TITLE_LENGTH = 80;
const MAX_NOTE_LENGTH = 500;
const MAX_NAME_LENGTH = 40;
const MAX_MEMBERS = 50;

/** ปุ่มแคปซูลจำนวนวัน — 2 กับ 3 พบบ่อยสุด ค่าเริ่มต้นจึงเป็น 3 */
const LENGTH_CHOICES = [1, 2, 3, 4, 5, 6, 7] as const;
const DEFAULT_LENGTH = 3;

/** ช่วงเริ่มต้น = วันนี้ถึงอีกสองเดือน (60 วัน) กว้างพอมีตัวเลือก แต่ยังกรอกจบ */
const DEFAULT_RANGE_DAYS = 60;

/* -------------------------------------------------------------------------- */
/* ชนิดข้อมูลภายใน                                                            */
/* -------------------------------------------------------------------------- */

interface DraftMember {
  /** ไอดีชั่วคราวสำหรับ React key เท่านั้น ไม่ได้ส่งไปเซิร์ฟเวอร์ */
  id: number;
  name: string;
  isKey: boolean;
}

type StepNo = 1 | 2 | 3;

/* -------------------------------------------------------------------------- */
/* ตัวช่วยเล็ก ๆ                                                              */
/* -------------------------------------------------------------------------- */

/** วันแรกของเดือนที่ห่างจาก iso ไป offset เดือน */
function monthStart(iso: string, offset: number): string {
  const d = fromISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() + offset, 1, 12));
}

/** วันสุดท้ายของเดือนที่ห่างจาก iso ไป offset เดือน (วันที่ 0 ของเดือนถัดไป) */
function monthEnd(iso: string, offset: number): string {
  const d = fromISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() + offset + 1, 0, 12));
}

/** จำนวนวันในช่วง (รวมปลายสองข้าง) — 0 ถ้าวันที่ยังไม่ครบหรือกลับลำดับ */
function rangeLength(start: string, end: string): number {
  if (!isISODate(start) || !isISODate(end)) return 0;
  const span = daysBetween(start, end);
  return span < 0 ? 0 : span + 1;
}

/**
 * แยกข้อความที่วางมาเป็นหลายชื่อ
 * คนก็อปรายชื่อจากกลุ่ม LINE มาวางทีเดียว จะได้มาทั้งแบบคอมมาและแบบขึ้นบรรทัดใหม่
 */
function splitNames(raw: string): string[] {
  return raw
    .split(/[,\n\r;]+/)
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter((s) => s !== "");
}

/* -------------------------------------------------------------------------- */
/* คลาสที่ใช้ซ้ำ                                                              */
/* -------------------------------------------------------------------------- */

/**
 * คลาสของช่องกรอก — ไม่มีความกว้างอยู่ในนี้โดยเจตนา
 * Tailwind ตัดสิน utility ที่ชนกันจากลำดับใน stylesheet ไม่ใช่ลำดับใน class
 * ถ้าใส่ w-full ไว้ตรงนี้แล้วไปเติม w-24 ทับที่จุดใช้งาน ผลจะเดาไม่ได้
 *
 * รูปแคปซูล (rounded-full) บนพื้น bg-fill ตามงานอ้างอิง — ปิดลูกศรสปินเนอร์ของ
 * ช่อง number ด้วย เพราะโผล่ชิดขอบโค้งแล้วดูเบี้ยว (ยังพิมพ์/ใช้ปุ่มขึ้นลงคีย์บอร์ดได้ปกติ)
 */
const INPUT_CLASS =
  "min-h-[44px] md:min-h-[52px] rounded-full bg-fill px-5 text-[16px] text-ink " +
  "outline-none placeholder:text-ink-3 " +
  "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const CHIP_CLASS = "min-h-[44px] rounded-full bg-fill px-4 text-[13px] text-ink-2";

const LABEL_CLASS = "block pb-1.5 text-[13px] font-semibold text-ink-2";

const CARD_CLASS = "rounded-[24px] bg-surface px-4 py-5 md:px-6 md:py-6";

const QUESTION_CLASS = "font-display font-bold text-[1.3rem] tracking-tight text-ink";

/* -------------------------------------------------------------------------- */

export default function CreateTripForm(): React.JSX.Element {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState<StepNo>(1);

  // ── ขั้น 1 ────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  /**
   * เริ่มเป็นสตริงว่างทั้งคู่ แล้วเติมค่าใน useEffect ข้างล่าง
   * ถ้าเรียก todayBangkok() ตอนนี้ HTML จากเซิร์ฟเวอร์กับของเบราว์เซอร์
   * อาจได้วันไม่ตรงกัน → hydration mismatch
   */
  const [today, setToday] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");

  // ── ขั้น 2 ────────────────────────────────────────────────
  /** เก็บเป็นสตริงเพราะช่อง number ให้ผู้ใช้ลบจนว่างได้ — แปลงเป็นเลขตอนตรวจ */
  const [lengthDraft, setLengthDraft] = useState(String(DEFAULT_LENGTH));
  const [deadline, setDeadline] = useState("");

  // ── ขั้น 3 ────────────────────────────────────────────────
  const [members, setMembers] = useState<DraftMember[]>([]);
  const [nameDraft, setNameDraft] = useState("");
  const [nameHint, setNameHint] = useState("");
  const [allowSelfJoin, setAllowSelfJoin] = useState(true);

  const [error, setError] = useState("");

  const nextIdRef = useRef(1);

  /**
   * ตั้งค่าเริ่มต้นที่ขึ้นกับ "วันนี้" — ทำหลัง mount ครั้งเดียว
   * (dependency ว่างโดยเจตนา: ค่าเริ่มต้นตั้งครั้งเดียว ไม่ทับที่ผู้ใช้แก้ไปแล้ว)
   */
  useEffect(() => {
    // จุดเดียวในไฟล์นี้ที่เรียก todayBangkok() ได้ — ต้องหลัง mount เท่านั้น
    const t = todayBangkok();
    setToday(t);
    setRangeStart(t);
    setRangeEnd(addDays(t, DEFAULT_RANGE_DAYS - 1));
  }, []);

  /* ---------------------------------------------------------------------- */
  /* ค่าที่คำนวณต่อ                                                          */
  /* ---------------------------------------------------------------------- */

  const rangeDays = useMemo(() => rangeLength(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const rangeTooWide = rangeDays > MAX_RANGE_DAYS;

  const lengthDays = useMemo(() => {
    const n = Number.parseInt(lengthDraft, 10);
    return Number.isInteger(n) ? n : Number.NaN;
  }, [lengthDraft]);

  const rangeLabel = useMemo(() => {
    if (!isISODate(rangeStart) || !isISODate(rangeEnd)) return "";
    return `${formatShort(rangeStart)} – ${formatShort(rangeEnd)}`;
  }, [rangeStart, rangeEnd]);

  /* ---------------------------------------------------------------------- */
  /* ตรวจความถูกต้องรายขั้น                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * คืนรายการสิ่งที่ยังขาดของขั้นนั้น — ว่าง = ผ่าน
   * ปุ่ม "ต่อไป" ใช้ค่านี้ทั้งตัดสินว่า disabled และเป็นข้อความบอกว่าขาดอะไร
   * (กดแล้วเงียบคือกับดักที่ทำให้คนเลิกกรอกกลางทาง)
   */
  const issuesFor = useCallback(
    (s: StepNo): string[] => {
      const out: string[] = [];
      if (s === 1) {
        const t = title.trim();
        if (t === "") out.push("ยังไม่ได้ตั้งชื่อทริป");
        else if (t.length > MAX_TITLE_LENGTH) {
          out.push(`ชื่อทริปยาว ${t.length} ตัว — ย่อให้ไม่เกิน ${MAX_TITLE_LENGTH} ตัว`);
        }
        if (note.length > MAX_NOTE_LENGTH) {
          out.push(`รายละเอียดยาวเกิน ${MAX_NOTE_LENGTH} ตัว`);
        }
        if (!isISODate(rangeStart) || !isISODate(rangeEnd)) {
          out.push("ยังไม่ได้เลือกช่วงวันที่เปิดโหวตให้ครบทั้งสองช่อง");
        } else if (daysBetween(rangeStart, rangeEnd) < 0) {
          out.push("วันสิ้นสุดอยู่ก่อนวันเริ่ม — สลับสองวันนี้ให้ถูกลำดับ");
        } else if (rangeDays > MAX_RANGE_DAYS) {
          out.push(
            `ช่วงกว้าง ${rangeDays} วัน เกิน ${MAX_RANGE_DAYS} วันที่ระบบรับได้ — หุบให้แคบลง`,
          );
        }
        return out;
      }
      if (s === 2) {
        if (!Number.isInteger(lengthDays)) out.push("ใส่จำนวนวันของทริปเป็นตัวเลข");
        else if (lengthDays < 1 || lengthDays > MAX_LENGTH_DAYS) {
          out.push(`ทริปยาวได้ 1 ถึง ${MAX_LENGTH_DAYS} วัน`);
        } else if (rangeDays > 0 && rangeDays < lengthDays) {
          out.push(
            `ช่วงที่เปิดโหวตมีแค่ ${rangeDays} วัน แต่ทริปยาว ${lengthDays} วัน — ` +
              "ย้อนกลับไปขยายช่วง หรือลดจำนวนวันลง",
          );
        }
        if (deadline !== "" && !isISODate(deadline)) out.push("วันปิดโพลไม่ถูกรูปแบบ");
        return out;
      }
      if (members.length > MAX_MEMBERS) {
        out.push(`ใส่ชื่อได้ไม่เกิน ${MAX_MEMBERS} คนต่อทริป`);
      }
      // ข้อความสั้น เพราะรายละเอียดเต็ม ๆ อยู่ในกล่องคอรัลในการ์ดขั้น 3 แล้ว
      if (!allowSelfJoin && members.length === 0) {
        out.push("ยังไม่มีใครกรอกได้ — ใส่ชื่อเพื่อน หรือเปิดให้เพิ่มชื่อเอง");
      }
      return out;
    },
    [title, note, rangeStart, rangeEnd, rangeDays, lengthDays, deadline, members, allowSelfJoin],
  );

  const currentIssues = issuesFor(step);
  const blocked = currentIssues.length > 0;

  /* ---------------------------------------------------------------------- */
  /* ปุ่มลัดช่วงวันที่                                                        */
  /* ---------------------------------------------------------------------- */

  /**
   * ตั้งช่วงพร้อมหุบปลายให้ไม่เกิน MAX_RANGE_DAYS
   * "สามเดือนข้างหน้า" ตกได้ถึง 92 วันตามความยาวเดือนจริง ซึ่งเซิร์ฟเวอร์
   * จะปฏิเสธ — หุบที่นี่ดีกว่าปล่อยให้ผู้ใช้ไปเจอ error ตอนกดสร้าง
   */
  const applyRange = useCallback((start: string, end: string) => {
    const capped = daysBetween(start, end) + 1 > MAX_RANGE_DAYS
      ? addDays(start, MAX_RANGE_DAYS - 1)
      : end;
    setRangeStart(start);
    setRangeEnd(capped);
  }, []);

  const rangeShortcuts = useMemo(() => {
    if (today === "") return [];
    return [
      { label: "เดือนนี้", start: today, end: monthEnd(today, 0) },
      { label: "เดือนหน้า", start: monthStart(today, 1), end: monthEnd(today, 1) },
      { label: "สองเดือนข้างหน้า", start: today, end: monthEnd(today, 1) },
      { label: "สามเดือนข้างหน้า", start: today, end: monthEnd(today, 2) },
    ];
  }, [today]);

  /* ---------------------------------------------------------------------- */
  /* สมาชิก                                                                  */
  /* ---------------------------------------------------------------------- */

  const addNames = useCallback(() => {
    const parts = splitNames(nameDraft);
    if (parts.length === 0) {
      setNameHint("พิมพ์ชื่อเล่นก่อนกดเพิ่ม");
      return;
    }
    const tooLong = parts.filter((n) => n.length > MAX_NAME_LENGTH);
    const usable = parts.filter((n) => n.length <= MAX_NAME_LENGTH);

    // คำนวณทุกอย่างนอก updater — setMembers((prev) => ...) ถูกเรียกซ้ำได้ใน
    // StrictMode ถ้าใส่ side effect (setNameHint / เดินเลข id) ไว้ข้างในจะเพี้ยน
    const room = Math.max(MAX_MEMBERS - members.length, 0);
    const taken = usable.slice(0, room);

    const notes: string[] = [];
    if (tooLong.length > 0) {
      notes.push(`ข้ามชื่อที่ยาวเกิน ${MAX_NAME_LENGTH} ตัว ${tooLong.length} ชื่อ`);
    }
    if (usable.length > taken.length) {
      notes.push(`ใส่ได้ไม่เกิน ${MAX_MEMBERS} คน จึงข้าม ${usable.length - taken.length} ชื่อ`);
    }
    setNameHint(notes.join(" · "));

    if (taken.length > 0) {
      const base = nextIdRef.current;
      nextIdRef.current = base + taken.length;
      const added = taken.map<DraftMember>((name, i) => ({
        id: base + i,
        name,
        isKey: false,
      }));
      setMembers((prev) => [...prev, ...added]);
    }
    setNameDraft("");
  }, [nameDraft, members.length]);

  const toggleKey = useCallback((id: number) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, isKey: !m.isKey } : m)));
  }, []);

  const removeMember = useCallback((id: number) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }, []);

  /* ---------------------------------------------------------------------- */
  /* ส่ง                                                                     */
  /* ---------------------------------------------------------------------- */

  const submit = useCallback(() => {
    // ตรวจซ้ำทุกขั้น ไม่ใช่แค่ขั้นที่อยู่ — ผู้ใช้อาจย้อนไปแก้ขั้น 1 ให้เสียทีหลัง
    const all = [...issuesFor(1), ...issuesFor(2), ...issuesFor(3)];
    if (all.length > 0) {
      setError(all[0]);
      return;
    }

    const input: Omit<CreateTripInput, "ownerId"> = {
      title: title.trim(),
      note: note.trim(),
      rangeStart,
      rangeEnd,
      lengthDays,
      // สิ้นวันตามเวลาไทย ไม่ใช่เที่ยงคืน UTC — ไม่งั้นโพลปิดก่อนเวลาที่ตั้งไว้ 7 ชั่วโมง
      deadline: deadline === "" ? null : new Date(`${deadline}T23:59:59+07:00`).toISOString(),
      allowSelfJoin,
      members: members.map((m) => ({ name: m.name, isKey: m.isKey })),
    };

    setError("");
    startTransition(async () => {
      // ownerId มาจาก session ฝั่งเซิร์ฟเวอร์เอง (ดู createTripAction) ไม่ต้องส่งจากที่นี่
      const res = await createTripAction(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // ไม่ต้องเก็บลิงก์แอดมินลง localStorage อีกแล้ว — ความเป็นเจ้าของอยู่ที่บัญชี
      // ที่ล็อกอินอยู่ (session คุกกี้) หน้า "ทริปของฉัน" ดึงจาก listTripsByOwner ตรง ๆ
      router.push(`/t/${res.data.slug}/result`);
    });
  }, [
    issuesFor,
    title,
    note,
    rangeStart,
    rangeEnd,
    lengthDays,
    deadline,
    allowSelfJoin,
    members,
    router,
  ]);

  const handlePrimary = useCallback(() => {
    if (blocked) return;
    setError("");
    if (step === 3) {
      submit();
      return;
    }
    setStep(step === 1 ? 2 : 3);
    // เลื่อนขึ้นบนสุด ไม่งั้นบนมือถือขั้นใหม่จะเริ่มกลางคำถาม
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [blocked, step, submit]);

  const handleBack = useCallback(() => {
    setError("");
    setStep((s) => (s === 3 ? 2 : 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  /* ---------------------------------------------------------------------- */
  /* render                                                                  */
  /* ---------------------------------------------------------------------- */

  return (
    <form
      className="font-body"
      onSubmit={(e) => {
        e.preventDefault();
        handlePrimary();
      }}
    >
      {/* แถบบอกขั้น — สามขีดเรียบ ๆ อ่านได้ในเสี้ยววินาที ไม่ต้องมีตัวเลขในวงกลม */}
      <div className="pb-5">
        <div className="flex gap-1.5" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`h-[5px] flex-1 rounded-full ${n <= step ? "bg-brand" : "bg-fill-2"}`}
            />
          ))}
        </div>
        <p className="pt-2 text-[13px] text-ink-3" aria-live="polite">
          ขั้นที่ {step} จาก 3
        </p>
      </div>

      {/* ═══ ขั้น 1 ═══════════════════════════════════════════ */}
      {step === 1 && (
        <div className={CARD_CLASS}>
          <h2 className={QUESTION_CLASS}>ทริปนี้ชื่ออะไร ไปช่วงไหน</h2>
          <p className="pt-1 pb-5 text-[14px] leading-relaxed text-ink-2">
            ช่วงวันที่นี้คือกรอบให้เพื่อนระบายวันว่าง ยังไม่ใช่วันไปจริง
          </p>

          <div className="pb-4">
            <label htmlFor="trip-title" className={LABEL_CLASS}>
              ชื่อทริป
            </label>
            <input
              id="trip-title"
              name="title"
              type="text"
              value={title}
              maxLength={MAX_TITLE_LENGTH}
              autoComplete="off"
              enterKeyHint="next"
              placeholder="เกาะกูด 3 วัน"
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full ${INPUT_CLASS}`}
            />
            {title.length > MAX_TITLE_LENGTH - 15 && (
              <p className="pt-1 text-[12px] text-ink-3 tnum">
                {title.length} / {MAX_TITLE_LENGTH} ตัวอักษร
              </p>
            )}
          </div>

          <div className="pb-5">
            <label htmlFor="trip-note" className={LABEL_CLASS}>
              รายละเอียดเพิ่มเติม <span className="font-normal text-ink-3">(ไม่ใส่ก็ได้)</span>
            </label>
            <textarea
              id="trip-note"
              name="note"
              rows={3}
              value={note}
              maxLength={MAX_NOTE_LENGTH}
              placeholder="รายละเอียดเพิ่มเติม เช่น งบต่อคน รถใครขับ"
              onChange={(e) => setNote(e.target.value)}
              className="w-full min-h-[88px] rounded-[22px] bg-fill px-5 py-3.5 text-[16px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
            />
          </div>

          <fieldset>
            <legend className={LABEL_CLASS}>ช่วงวันที่เปิดโหวต</legend>
            {/* ปฏิทินสไตล์เอง (components/ui/date-picker.tsx) ไม่ใช่ input type=date
                ดิบ ๆ ของเบราว์เซอร์ เพราะปฏิทินของระบบกำหนดสีเองไม่ได้เลย ไม่เข้ากับธีม */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label htmlFor="range-start" className="block pb-1 text-[12px] text-ink-3">
                  เริ่ม
                </label>
                <DatePicker
                  id="range-start"
                  value={rangeStart}
                  min={today}
                  onChange={setRangeStart}
                />
              </div>
              <div>
                <label htmlFor="range-end" className="block pb-1 text-[12px] text-ink-3">
                  ถึง
                </label>
                <DatePicker
                  id="range-end"
                  value={rangeEnd}
                  min={rangeStart}
                  onChange={setRangeEnd}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-[6px] pt-3">
              {rangeShortcuts.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => applyRange(s.start, s.end)}
                  className={CHIP_CLASS}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </fieldset>

          {rangeDays > 0 && (
            <div className="pt-4">
              <p className="text-[14px] text-ink-2">
                <span className="tnum font-semibold text-ink">{rangeDays}</span> วัน
                {rangeLabel !== "" && <span className="text-ink-3"> · {rangeLabel}</span>}
              </p>
              {rangeTooWide && (
                <p className="mt-2 rounded-[16px] bg-coral-fill px-4 py-3 text-[13px] leading-relaxed text-coral-ink">
                  ช่วงกว้างเกิน {MAX_RANGE_DAYS} วันจะไม่มีใครกรอกจบ ลองแคบลง
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ ขั้น 2 ═══════════════════════════════════════════ */}
      {step === 2 && (
        <div className={CARD_CLASS}>
          <h2 className={QUESTION_CLASS}>ทริปยาวกี่วัน ปิดโพลเมื่อไหร่</h2>
          <p className="pt-1 pb-5 text-[14px] leading-relaxed text-ink-2">
            {title.trim() === "" ? "ทริปนี้" : `“${title.trim()}”`} ใช้เวลากี่วันติดกัน
          </p>

          <fieldset className="pb-5">
            <legend className={LABEL_CLASS}>ทริปยาวกี่วัน</legend>
            <div role="group" aria-label="จำนวนวันของทริป" className="grid grid-cols-7 gap-[5px]">
              {LENGTH_CHOICES.map((n) => {
                const active = lengthDays === n;
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setLengthDraft(String(n))}
                    className={[
                      "min-h-[44px] rounded-full font-display font-semibold tracking-tight",
                      "text-[15px] tnum",
                      active ? "bg-brand text-on-brand" : "bg-fill text-ink-2",
                    ].join(" ")}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            <p className="pt-2 text-[13px] leading-relaxed text-ink-3">
              ระบบจะหาช่วง{" "}
              <span className="tnum">{Number.isInteger(lengthDays) ? lengthDays : "?"}</span> วันที่
              ติดกัน ไม่ใช่วันเดี่ยว ๆ
            </p>

            <div className="flex items-center gap-3 pt-3">
              <label htmlFor="length-custom" className="text-[13px] text-ink-2">
                ยาวกว่านั้น
              </label>
              <input
                id="length-custom"
                name="lengthDays"
                type="number"
                min={1}
                max={MAX_LENGTH_DAYS}
                step={1}
                inputMode="numeric"
                value={lengthDraft}
                onChange={(e) => setLengthDraft(e.target.value)}
                className={`${INPUT_CLASS} w-24 tnum`}
              />
              <span className="text-[13px] text-ink-3">วัน (ไม่เกิน {MAX_LENGTH_DAYS})</span>
            </div>
          </fieldset>

          <fieldset>
            <legend className={LABEL_CLASS}>
              ปิดโพลวันไหน <span className="font-normal text-ink-3">(ไม่กำหนดก็ได้)</span>
            </legend>
            <DatePicker
              id="trip-deadline"
              value={deadline}
              min={today}
              onChange={setDeadline}
              aria-describedby="deadline-help"
            />
            <div className="flex flex-wrap gap-[6px] pt-3">
              {[
                { label: "อีก 3 วัน", days: 3 },
                { label: "อีก 1 สัปดาห์", days: 7 },
                { label: "อีก 2 สัปดาห์", days: 14 },
              ].map((s) => (
                <button
                  key={s.label}
                  type="button"
                  disabled={today === ""}
                  onClick={() => setDeadline(addDays(today, s.days))}
                  className={CHIP_CLASS}
                >
                  {s.label}
                </button>
              ))}
              {deadline !== "" && (
                <button type="button" onClick={() => setDeadline("")} className={CHIP_CLASS}>
                  ล้าง
                </button>
              )}
            </div>
            <p id="deadline-help" className="pt-2 text-[13px] leading-relaxed text-ink-3">
              {deadline !== "" && isISODate(deadline)
                ? `โพลปิดสิ้นวัน ${formatShort(deadline)} ตามเวลาไทย`
                : "ไม่กำหนดก็ได้ — แต่มีเดดไลน์แล้วคนตอบเร็วขึ้นเยอะ"}
            </p>
          </fieldset>
        </div>
      )}

      {/* ═══ ขั้น 3 ═══════════════════════════════════════════ */}
      {step === 3 && (
        <div className={CARD_CLASS}>
          <h2 className={QUESTION_CLASS}>ชวนใคร</h2>
          <p className="pt-1 pb-5 text-[14px] leading-relaxed text-ink-2">
            ใส่ชื่อเล่นไว้ก่อนก็ได้ หรือข้ามไปเลยแล้วให้เพื่อนกดเพิ่มชื่อตัวเองจากลิงก์
          </p>

          <div className="pb-4">
            <label htmlFor="member-name" className={LABEL_CLASS}>
              ชื่อเล่นเพื่อน
            </label>
            <div className="flex gap-2">
              <input
                id="member-name"
                name="memberName"
                type="text"
                value={nameDraft}
                autoComplete="off"
                enterKeyHint="done"
                placeholder="เบส, ฟ้า, ตูน"
                onChange={(e) => {
                  setNameDraft(e.target.value);
                  setNameHint("");
                }}
                onKeyDown={(e) => {
                  // กด Enter = เพิ่มชื่อ ไม่ใช่ส่งฟอร์ม
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addNames();
                  }
                }}
                className={`${INPUT_CLASS} flex-1`}
              />
              {/* ต้องมีปุ่มด้วย เพราะคีย์บอร์ดไทยบางตัวบนมือถือไม่มีปุ่ม Enter ที่เห็นชัด */}
              <button
                type="button"
                onClick={addNames}
                className="min-h-[44px] shrink-0 rounded-full bg-brand-fill px-5 font-display font-semibold text-[14px] text-brand-ink md:min-h-[52px]"
              >
                + เพิ่ม
              </button>
            </div>
            <p className="pt-1.5 text-[12px] leading-relaxed text-ink-3">
              {nameHint !== ""
                ? nameHint
                : "ก็อปรายชื่อจากกลุ่ม LINE มาวางทีเดียวได้ — คั่นด้วยคอมมาหรือขึ้นบรรทัดใหม่"}
            </p>
          </div>

          {members.length > 0 && (
            <>
              <ul className="flex flex-col gap-1.5 pb-2">
                {members.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-2 rounded-full bg-fill py-2 pl-2 pr-3"
                  >
                    {/* อวตาร 3D วงกลมจริง (ไม่ใช่แค่ตัวอักษรย่อ) ตามงานอ้างอิง —
                        เลือกรูปตาม hash ของชื่อ คนชื่อเดิมได้หน้าเดิมทุกครั้ง */}
                    <Avatar name={m.name} size={40} />
                    <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{m.name}</span>
                    <button
                      type="button"
                      aria-pressed={m.isKey}
                      onClick={() => toggleKey(m.id)}
                      className={[
                        "min-h-[44px] shrink-0 rounded-full px-3.5 text-[13px] font-semibold",
                        m.isKey ? "bg-brand text-on-brand" : "bg-surface text-ink-2",
                      ].join(" ")}
                    >
                      ขาดไม่ได้
                    </button>
                    <button
                      type="button"
                      aria-label={`ลบ ${m.name} ออกจากรายชื่อ`}
                      onClick={() => removeMember(m.id)}
                      className="min-h-[44px] w-11 shrink-0 rounded-full text-[16px] text-ink-3"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              {/* อธิบายครั้งเดียวใต้รายการ ไม่ใช่ทุกแถว */}
              <p className="pb-5 text-[12px] leading-relaxed text-ink-3">
                “ขาดไม่ได้” = ถ้าคนนี้ไม่ว่าง ช่วงนั้นจะถูกตัดออกทั้งช่วง
              </p>
            </>
          )}

          {/* เปิดไว้เป็นค่าเริ่มต้น — เจ้าภาพลืมใส่ชื่อคนเป็นเรื่องปกติที่สุด */}
          <button
            type="button"
            role="switch"
            aria-checked={allowSelfJoin}
            onClick={() => setAllowSelfJoin((v) => !v)}
            className="flex w-full min-h-[44px] items-center gap-3 rounded-[20px] bg-fill px-3 py-2 text-left"
          >
            <span
              aria-hidden="true"
              className={`flex h-7 w-12 shrink-0 items-center rounded-full px-[3px] ${
                allowSelfJoin ? "bg-brand" : "bg-fill-2"
              }`}
            >
              <span
                className={`h-[22px] w-[22px] rounded-full bg-surface transition-transform ${
                  allowSelfJoin ? "translate-x-[20px]" : "translate-x-0"
                }`}
              />
            </span>
            <span className="text-[14px] leading-snug text-ink">
              ให้คนอื่นเพิ่มชื่อตัวเองจากลิงก์ได้ — เผื่อลืมใส่ใคร
            </span>
          </button>

          {!allowSelfJoin && members.length === 0 && (
            <p className="mt-3 rounded-[16px] bg-coral-fill px-4 py-3 text-[13px] leading-relaxed text-coral-ink">
              ยังไม่มีชื่อใครเลย และปิดไม่ให้เพิ่มชื่อเอง — จะไม่มีใครกรอกวันว่างได้เลย
              ใส่ชื่อเพื่อนอย่างน้อยหนึ่งคน หรือเปิดสวิตช์ข้างบนไว้
            </p>
          )}
        </div>
      )}

      {/* ═══ ข้อผิดพลาดจากเซิร์ฟเวอร์ ═════════════════════════ */}
      {error !== "" && (
        <p
          role="alert"
          className="mt-4 rounded-[16px] bg-coral-fill px-4 py-3 text-[14px] leading-relaxed text-coral-ink"
        >
          {error}
        </p>
      )}

      {/* ═══ แถบปุ่ม ═══════════════════════════════════════════ */}
      <div className="pt-5">
        {/* บอกว่าขาดอะไรก่อนกด ไม่ปล่อยให้กดปุ่มที่ดับแล้วเงียบ */}
        {blocked && (
          <p className="pb-2 text-[13px] leading-relaxed text-ink-2">{currentIssues[0]}</p>
        )}
        <div className="flex gap-2">
          {step > 1 && (
            <button
              type="button"
              onClick={handleBack}
              disabled={isPending}
              className="min-h-[52px] shrink-0 rounded-full bg-fill px-6 font-display font-semibold text-[15px] text-ink-2 disabled:text-ink-3"
            >
              ย้อนกลับ
            </button>
          )}
          <button
            type="submit"
            disabled={blocked || isPending}
            className="min-h-[52px] flex-1 rounded-full bg-brand px-6 font-display font-semibold text-[16px] tracking-tight text-on-brand disabled:bg-fill-2 disabled:text-ink-3"
          >
            {step === 3 ? (isPending ? "กำลังสร้าง…" : "สร้างทริปและรับลิงก์") : "ต่อไป"}
          </button>
        </div>
      </div>
    </form>
  );
}

