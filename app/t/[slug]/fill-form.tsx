"use client";

/**
 * FillForm — หน้ากรอกวันว่างของเพื่อนแต่ละคน (หน้าที่คนเห็นมากที่สุดในแอป)
 *
 * เป้าหมายเดียวของไฟล์นี้คือ "ทำให้กรอกจบ" ทุกการตัดสินใจในนี้จึงยึดข้อนี้:
 *   1. ไม่มีล็อกอิน — ยืนยันตัวด้วย token ที่เก็บใน localStorage (คีย์ "paigun.me")
 *      ถ้ายังไม่มี token ให้ "แตะชื่อตัวเอง" ก่อน เพราะแตะง่ายกว่าพิมพ์
 *   2. ปุ่มบันทึกอยู่ติดขอบล่างจอตลอด (sticky) เพราะช่วงวันอาจยาวหลายเดือน
 *      ถ้าปุ่มอยู่ท้ายสุดคนจะเลื่อนไม่เจอแล้วปิดหน้าไปทั้ง ๆ ที่กรอกเสร็จแล้ว
 *   3. บันทึกไม่สำเร็จ ห้ามล้างค่าที่กรอกไว้ — คนทาปฏิทินมา 30 วันแล้วหายคือหายเลย
 *   4. บันทึกสำเร็จแล้วต้องยัดปุ่ม "ดูผลโหวต" ให้เห็นทันที เพราะการเห็นผล
 *      คือรางวัลที่ทำให้คนกลับมาอีกและไปเตือนเพื่อนที่ยังไม่ตอบ
 *
 * ⚠️ props ของ client component ถูก serialize ลงไปใน HTML ที่ทุกคนอ่านได้
 *    จึงรับได้แค่ `PublicTrip` ที่ไม่มี adminKey และไม่มี token ของคนอื่นเลย
 *    (ดูการ map ที่ page.tsx) token ของ "ตัวเอง" มาทาง initialMe เท่านั้น
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import PaintCalendar from "@/components/paint-calendar";
import { joinTripAction, saveAvailabilityAction, setAvatarAction } from "@/app/actions";
import { formatRange, formatShort } from "@/lib/dates";
import { MAX_COMMENT_LENGTH } from "@/lib/store";
import type { AvailState, TripStatus } from "@/lib/types";
import Avatar, { type AvatarKey } from "@/components/ui/avatar";
import AvatarPicker from "@/components/ui/avatar-picker";
import DayStatusCalendar from "@/components/ui/day-status-calendar";
import { FloatingBar } from "@/components/ui/floating-bar";
import { FloatingDots } from "@/components/ui/floating-dots";
import { Pill } from "@/components/ui/pill";
import { toastError } from "@/components/ui/swal";

/* -------------------------------------------------------------------------- */
/* ชนิดข้อมูลเวอร์ชัน "ปลอดภัยที่จะส่งลง client"                              */
/* -------------------------------------------------------------------------- */

/**
 * participant ที่ตัด token ออกแล้ว
 * `days` ของคนอื่นส่งมาได้ ไม่เป็นความลับ (หน้าผลโหวตแสดงอยู่แล้ว)
 * และเราต้องใช้มันเพื่อบอกว่าใครตอบแล้ว และเพื่อเติมค่าเริ่มต้นของตัวเอง
 */
export interface PublicParticipant {
  id: string;
  name: string;
  isKey: boolean;
  /** key ใน AVATAR_FILES ที่เลือกเอง — null = ยังไม่เลือก (hash จากชื่อแทน) */
  avatarKey: string | null;
  /** ความคิดเห็นสั้น ๆ ที่พิมพ์คู่กับวันว่าง — null = ไม่ได้เขียนไว้ */
  comment: string | null;
  /** null = ยังไม่เคยกดบันทึก */
  submittedAt: string | null;
  days: Record<string, AvailState>;
}

/** Trip ที่ตัด adminKey และ token ทั้งหมดออกแล้ว */
export interface PublicTrip {
  id: string;
  slug: string;
  title: string;
  note: string;
  rangeStart: string;
  rangeEnd: string;
  lengthDays: number;
  deadline: string | null;
  status: TripStatus;
  lockedStart: string | null;
  allowSelfJoin: boolean;
  participants: PublicParticipant[];
}

/** ตัวตนของ "ฉัน" บนเครื่องนี้ — เก็บใน localStorage ต่อ slug */
export interface MeRecord {
  token: string;
  participantId: string;
  name: string;
}

interface FillFormProps {
  trip: PublicTrip;
  /**
   * ตัวตนที่ยืนยันได้จากฝั่งเซิร์ฟเวอร์แล้ว (เปิดมาจากลิงก์ส่วนตัว `?t=...`)
   * มีค่าเมื่อ token ใน URL ตรงกับ participant จริงเท่านั้น
   */
  initialMe?: MeRecord | null;
}

/* -------------------------------------------------------------------------- */
/* localStorage                                                               */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = "paigun.me";

/** โครงที่เก็บจริง: slug -> ตัวตนของฉันในทริปนั้น */
type MeStore = Record<string, MeRecord>;

/** ตรวจรูปร่างข้อมูลที่อ่านจาก localStorage — ของในนั้นแก้มือได้ ห้ามเชื่อ */
function isMeRecord(v: unknown): v is MeRecord {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.token === "string" &&
    o.token !== "" &&
    typeof o.participantId === "string" &&
    typeof o.name === "string"
  );
}

function readStore(): MeStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: MeStore = {};
    for (const [slug, rec] of Object.entries(parsed as Record<string, unknown>)) {
      if (isMeRecord(rec)) out[slug] = rec;
    }
    return out;
  } catch {
    // โหมดส่วนตัว / ปิดคุกกี้ / JSON เพี้ยน — ถือว่ายังไม่รู้จักเครื่องนี้
    return {};
  }
}

function writeMe(slug: string, rec: MeRecord | null): void {
  try {
    const store = readStore();
    if (rec === null) delete store[slug];
    else store[slug] = rec;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* เขียนไม่ได้ก็ยังกรอกต่อได้ในรอบนี้ — ไม่ต้องรบกวนผู้ใช้ */
  }
}

/* -------------------------------------------------------------------------- */
/* ตัวช่วยเล็ก ๆ                                                              */
/* -------------------------------------------------------------------------- */

/** เทียบ map วันว่างสองชุด ใช้เช็กว่ามีอะไรยังไม่บันทึก */
function sameDays(a: Record<string, AvailState>, b: Record<string, AvailState>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}

/**
 * "1 ต.ค. เวลา 18:00" ตามเวลาไทย
 * ใช้ Intl แบบตัวเลขล้วน (en-CA / en-GB) เพราะผลลัพธ์คงที่ทั้งบน Node และเบราว์เซอร์
 * จึงไม่เกิด hydration mismatch เหมือนการ format ด้วย locale ไทย
 */
function deadlineText(ts: string): string | null {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${formatShort(ymd)} เวลา ${hm}`;
}

function daysOf(trip: PublicTrip, participantId: string): Record<string, AvailState> {
  const p = trip.participants.find((x) => x.id === participantId);
  return p === undefined ? {} : p.days;
}

function commentOf(trip: PublicTrip, participantId: string): string {
  const p = trip.participants.find((x) => x.id === participantId);
  return p?.comment ?? "";
}

const SHELL = "mx-auto w-full max-w-[30rem] md:max-w-[34rem] px-4";

/* -------------------------------------------------------------------------- */

export default function FillForm({ trip, initialMe = null }: FillFormProps): React.JSX.Element {
  /* ตัวตน — ถ้ามาจากลิงก์ส่วนตัว เซิร์ฟเวอร์ยืนยันมาให้แล้ว จึงตั้งค่าได้เลย
     (ค่านี้เท่ากันทั้งตอน SSR และตอน hydrate จึงไม่ mismatch) */
  const [me, setMe] = useState<MeRecord | null>(initialMe);
  /** อ่าน localStorage เสร็จหรือยัง — ก่อนเสร็จยังไม่รู้ว่าเป็นใคร ห้ามเดา */
  const [checked, setChecked] = useState<boolean>(initialMe !== null);

  const [value, setValue] = useState<Record<string, AvailState>>(() =>
    initialMe === null ? {} : daysOf(trip, initialMe.participantId),
  );
  /** ชุดที่บันทึกไว้ล่าสุด ใช้บอกว่า "ยังไม่บันทึก" */
  const [savedDays, setSavedDays] = useState<Record<string, AvailState>>(() =>
    initialMe === null ? {} : daysOf(trip, initialMe.participantId),
  );

  /** ความคิดเห็นสั้น ๆ คู่กับวันว่าง เช่น "ว่างแค่เสาร์-อาทิตย์" — พิมพ์คู่กับปฏิทิน บันทึกพร้อมกัน */
  const [comment, setComment] = useState<string>(() =>
    initialMe === null ? "" : commentOf(trip, initialMe.participantId),
  );
  /** ความคิดเห็นที่บันทึกไว้ล่าสุด ใช้บอกว่า "ยังไม่บันทึก" คู่กับ savedDays */
  const [savedComment, setSavedComment] = useState<string>(() =>
    initialMe === null ? "" : commentOf(trip, initialMe.participantId),
  );

  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  /** ชื่อที่ตอบไปแล้วซึ่งถูกแตะ — ต้องยืนยันก่อน กันสร้างชื่อซ้ำโดยไม่รู้ตัว */
  const [confirmName, setConfirmName] = useState<string | null>(null);
  const [typedName, setTypedName] = useState("");
  const [pending, startTransition] = useTransition();

  const slug = trip.slug;
  const polling = trip.status === "polling";

  /* ------------------------------------------------------------------ */
  /* รู้จักเครื่องนี้ไหม — อ่าน localStorage ได้ใน effect เท่านั้น       */
  /* ------------------------------------------------------------------ */

  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    if (initialMe !== null) {
      // เปิดจากลิงก์ส่วนตัว → จำไว้ในเครื่อง คราวหน้าเปิดลิงก์กลุ่มเฉย ๆ ก็ยังรู้ว่าเป็นใคร
      writeMe(slug, initialMe);
      return;
    }
    const rec = readStore()[slug];
    // ถ้าเจ้าภาพลบชื่อคนนี้ออกไปแล้ว token ที่เก็บไว้ใช้ไม่ได้อีก
    // ลืมมันทิ้งไปเลย ดีกว่าปล่อยให้กรอกจนเสร็จแล้วค่อยเด้ง error ตอนกดบันทึก
    const stillThere =
      rec !== undefined && trip.participants.some((p) => p.id === rec.participantId);
    if (rec !== undefined && !stillThere) writeMe(slug, null);
    if (rec !== undefined && stillThere) {
      setMe(rec);
      const days = daysOf(trip, rec.participantId);
      setValue(days);
      setSavedDays(days);
      const savedC = commentOf(trip, rec.participantId);
      setComment(savedC);
      setSavedComment(savedC);
    }
    setChecked(true);
    // ตั้งใจให้รันครั้งเดียวตอน mount — ถ้าผูกกับ trip จะทับค่าที่ผู้ใช้กำลังกรอก
    // ทุกครั้งที่ server action revalidate หน้านี้
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------------ */
  /* ข้อมูลสรุปหัวหน้า                                                  */
  /* ------------------------------------------------------------------ */

  const answeredCount = useMemo(
    () => trip.participants.filter((p) => p.submittedAt !== null).length,
    [trip.participants],
  );
  const waiting = useMemo(
    () => trip.participants.filter((p) => p.submittedAt === null),
    [trip.participants],
  );
  const answered = useMemo(
    () => trip.participants.filter((p) => p.submittedAt !== null),
    [trip.participants],
  );

  const freeCount = useMemo(
    () => Object.values(value).filter((v) => v === 2).length,
    [value],
  );
  const filledCount = Object.keys(value).length;
  const dirty = !sameDays(value, savedDays) || comment !== savedComment;

  /** ชื่อจริงจากเซิร์ฟเวอร์มาก่อนชื่อที่พิมพ์ไว้ (เผื่อถูกต่อท้ายเป็น "(2)") */
  const myName =
    me === null
      ? ""
      : (trip.participants.find((p) => p.id === me.participantId)?.name ?? me.name);

  const myAvatarKey =
    me === null ? null : (trip.participants.find((p) => p.id === me.participantId)?.avatarKey ?? null);

  const onChangeAvatar = useCallback(
    (key: AvatarKey) => {
      if (me === null) return;
      startTransition(async () => {
        const res = await setAvatarAction(slug, me.token, key);
        if (!res.ok) toastError(res.error);
      });
    },
    [slug, me],
  );

  const deadline = trip.deadline === null ? null : deadlineText(trip.deadline);

  /* ------------------------------------------------------------------ */
  /* ขั้นที่ 1: เคลมตัวตน                                               */
  /* ------------------------------------------------------------------ */

  const adopt = useCallback(
    (rec: MeRecord) => {
      writeMe(slug, rec);
      setMe(rec);
      const days = daysOf(trip, rec.participantId);
      setValue(days);
      setSavedDays(days);
      setConfirmName(null);
      setTypedName("");
      setError(null);
    },
    [slug, trip],
  );

  const claim = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (trimmed === "") {
        setError("ยังไม่ได้ใส่ชื่อ — ใส่ชื่อเล่นที่เพื่อนในกลุ่มเรียกคุณ");
        return;
      }
      setError(null);
      startTransition(async () => {
        const res = await joinTripAction(slug, trimmed);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        adopt({ token: res.data.token, participantId: res.data.participantId, name: trimmed });
      });
    },
    [slug, adopt],
  );

  const forgetMe = useCallback(() => {
    writeMe(slug, null);
    setMe(null);
    setValue({});
    setSavedDays({});
    setJustSaved(false);
    setError(null);
    setChecked(true);
  }, [slug]);

  /* ------------------------------------------------------------------ */
  /* ขั้นที่ 2: บันทึกวันว่าง                                            */
  /* ------------------------------------------------------------------ */

  const save = useCallback(() => {
    if (me === null) return;
    const token = me.token;
    const payload = value;
    setError(null);
    startTransition(async () => {
      const res = await saveAvailabilityAction(slug, token, payload, comment);
      if (!res.ok) {
        // ห้ามล้าง value เด็ดขาด — คนกรอกมาทั้งเดือนแล้วหายคือเลิกใช้แอป
        setError(res.error);
        return;
      }
      setSavedDays(payload);
      setSavedComment(comment);
      setJustSaved(true);
    });
  }, [me, slug, value, comment]);

  /* ------------------------------------------------------------------ */
  /* ชิ้นส่วนที่ใช้ซ้ำ                                                   */
  /* ------------------------------------------------------------------ */

  const errorBox =
    error === null ? null : (
      <p role="alert" className="rounded-[16px] bg-coral-fill px-4 py-3 text-[14px] text-coral-ink">
        {error}
      </p>
    );

  const resultLink = (
    <Link
      href={`/t/${slug}/result`}
      className="flex min-h-[52px] w-full items-center justify-center rounded-full bg-brand px-5 font-display font-semibold text-[16px] text-on-brand"
    >
      ดูผลโหวต →
    </Link>
  );

  const header = (
    // ฉากมืดตายตัว (--ink-fixed) แบบงานอ้างอิง — bleed เต็มขอบกล่อง SHELL ด้วย -mx-4
    // ที่หักลบ px-4 ของ SHELL เอง (ไม่ใช่ของ <main> ใน layout.tsx ชั้นนอก) จึงไม่ดันให้
    // หน้ากว้างเกินและไม่เกิดสโครลแนวนอนใหม่
    <header className="relative -mx-4 mb-4 overflow-hidden rounded-b-[2rem] bg-ink-fixed px-4 pt-7 pb-6">
      <FloatingDots />
      <h1 className="relative font-display font-bold text-[26px] md:text-[30px] text-on-ink-fixed">
        {trip.title}
      </h1>
      <p className="relative pt-1 text-[15px] text-on-ink-fixed/75">
        <span className="tnum">{formatRange(trip.rangeStart, trip.rangeEnd)}</span>
        {" · ทริปยาว "}
        <span className="tnum">{trip.lengthDays}</span>
        {" วัน"}
      </p>
      {trip.note !== "" && (
        <p className="relative pt-2 text-[14px] leading-relaxed text-on-ink-fixed/75">{trip.note}</p>
      )}
      <div className="relative flex flex-wrap gap-2 pt-3">
        {/* "ตอบแล้ว" ไม่ใช่สถานะว่าง/ไม่ว่าง จึงใช้โทนกลาง ไม่ใช้มิ้นต์/เหลือง/คอรัล */}
        <Pill tone="neutral">
          ตอบแล้ว <span className="tnum font-semibold text-ink">{answeredCount}</span> จาก{" "}
          <span className="tnum font-semibold text-ink">{trip.participants.length}</span> คน
        </Pill>
        {/* เตือนปิดรับ ไม่ใช่สถานะว่าง จึงใช้สีเน้นเดียวของแอป (brand) แทนเหลืองแดด */}
        {deadline !== null && <Pill tone="brand">ปิดรับ {deadline}</Pill>}
      </div>
    </header>
  );

  /* ------------------------------------------------------------------ */
  /* render                                                             */
  /* ------------------------------------------------------------------ */

  // โพลปิดแล้วและยังไม่รู้ว่าเป็นใคร — เคลมชื่อไปก็ทำอะไรไม่ได้ ส่งไปดูผลเลย
  if (!polling && me === null) {
    return (
      <main className={SHELL}>
        {header}
        {trip.status === "cancelled" ? (
          <p className="rounded-[16px] bg-coral-fill px-4 py-3 text-[14px] text-coral-ink">
            เจ้าภาพยกเลิกทริปนี้แล้ว
          </p>
        ) : (
          <p className="rounded-[16px] bg-sun-fill px-4 py-3 text-[14px] text-sun-ink">
            โพลปิดแล้ว — ดูได้แต่แก้ไม่ได้
          </p>
        )}
        <div className="pt-4 pb-10">{resultLink}</div>
      </main>
    );
  }

  // ยังอ่าน localStorage ไม่เสร็จ — ยังไม่รู้ว่าเป็นใคร จึงไม่แสดงอะไรที่ต้องเดา
  if (me === null && !checked) {
    return (
      <main className={SHELL}>
        {header}
        <p className="rounded-[16px] bg-fill px-4 py-3 text-[14px] text-ink-2">กำลังเปิดทริป…</p>
      </main>
    );
  }

  /* ---------------- ขั้นที่ 1: ฉันเป็นใคร ---------------- */
  if (me === null) {
    return (
      <main className={SHELL}>
        {header}

        <section className="pb-10">
          <h2 className="font-display font-bold text-[19px] text-ink">คุณคือใคร</h2>
          <p className="pt-1 pb-4 text-[14px] text-ink-2">
            แตะชื่อตัวเองเพื่อเริ่มกรอกวันว่าง ไม่ต้องสมัครสมาชิก
          </p>

          {errorBox}

          {/* ยืนยันก่อนเคลมชื่อที่ตอบไปแล้ว — ถ้าเดินหน้าต่อจะได้ชื่อใหม่ ไม่ใช่ของเดิม */}
          {confirmName !== null && (
            <div className="mt-3 rounded-[16px] bg-sun-fill px-4 py-4 text-[14px] text-sun-ink">
              <p className="font-display font-semibold">“{confirmName}” ตอบไปแล้ว</p>
              <p className="pt-1 leading-relaxed">
                ถ้านี่คือคุณ ให้เปิดจาก{" "}
                <strong>ลิงก์ส่วนตัวเดิม</strong> หรือเครื่องที่เคยกรอก คำตอบเดิมจะถูกแก้ได้ตรง ๆ
                {trip.allowSelfJoin
                  ? " — ถ้าคุณเป็นคนละคนที่ชื่อพ้องกัน กดต่อได้เลย ระบบจะสร้างชื่อใหม่ให้แยกจากคนเดิม"
                  : " — ถ้าคุณเป็นคนละคนที่ชื่อพ้องกัน ทักเจ้าภาพให้เพิ่มชื่อคุณเข้าไป"}
              </p>
              <div className="flex flex-wrap gap-2 pt-3">
                {trip.allowSelfJoin && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => claim(confirmName)}
                    className="min-h-[44px] rounded-full bg-brand px-5 font-display font-semibold text-[14px] text-on-brand disabled:opacity-60"
                  >
                    {pending ? "กำลังเข้าร่วม…" : "ฉันเป็นคนละคน กดต่อ"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmName(null)}
                  className="min-h-[44px] rounded-full bg-fill px-5 text-[14px] text-ink-2"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}

          {/* ทริปที่ไม่เปิดให้เพิ่มชื่อเอง: ยืนยันตัวได้ทางลิงก์ส่วนตัวทางเดียว
              จึงไม่ทำปุ่มให้กด เพราะกดไปก็ถูกเซิร์ฟเวอร์ปฏิเสธทุกครั้ง */}
          {!trip.allowSelfJoin ? (
            <>
              <p className="mt-3 rounded-[16px] bg-brand-fill px-4 py-4 text-[14px] leading-relaxed text-brand-ink">
                ทริปนี้ยืนยันตัวด้วย <strong>ลิงก์ส่วนตัว</strong> ที่เจ้าภาพส่งให้แต่ละคน
                เปิดลิงก์นั้นแล้วจะกรอกได้ทันที — ถ้าไม่มีลิงก์ หรือไม่เห็นชื่อตัวเองในรายชื่อข้างล่าง
                ทักเจ้าภาพให้เพิ่มชื่อและส่งลิงก์ให้
              </p>
              {trip.participants.length > 0 && (
                <ul className="flex flex-wrap gap-2 pt-4">
                  {trip.participants.map((p) => (
                    <li
                      key={p.id}
                      // "ตอบแล้ว" คือสถานะการตอบ ไม่ใช่สถานะว่าง จึงใช้ brand ไม่ใช่มิ้นต์
                      className={`flex min-h-[44px] items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-[13px] ${
                        p.submittedAt === null ? "bg-fill text-ink-2" : "bg-brand-fill text-brand-ink"
                      }`}
                    >
                      <Avatar name={p.name} avatarKey={p.avatarKey} size={28} />
                      {p.name}
                      {p.submittedAt === null ? " · ยังไม่ตอบ" : " · ตอบแล้ว"}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              {/* คนที่ยังไม่ตอบ — ปุ่มใหญ่ ๆ เต็มความกว้าง แตะพลาดยาก */}
              {waiting.length > 0 && (
                <ul className="grid gap-2 pt-3">
                  {waiting.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => claim(p.name)}
                        className="flex min-h-[56px] w-full items-center gap-3 rounded-[16px] bg-fill px-4 text-left disabled:opacity-60"
                      >
                        <Avatar name={p.name} avatarKey={p.avatarKey} size={40} />
                        <span className="flex-1 font-display font-semibold text-[17px] text-ink">
                          {p.name}
                        </span>
                        <span className="shrink-0 text-[13px] text-ink-3">
                          {p.isKey ? "คนสำคัญ · " : ""}นี่คือฉัน →
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* คนที่ตอบแล้ว — จาง ๆ แตะได้ แต่ต้องยืนยันก่อน */}
              {answered.length > 0 && (
                <div className="pt-4">
                  <p className="pb-2 text-[13px] text-ink-3">ตอบแล้ว</p>
                  <ul className="flex flex-wrap gap-2">
                    {answered.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setConfirmName(p.name)}
                          className="flex min-h-[44px] items-center gap-2 rounded-full bg-fill py-1 pl-1 pr-4 text-[14px] text-ink-3 disabled:opacity-60"
                        >
                          <Avatar name={p.name} avatarKey={p.avatarKey} size={32} className="opacity-90" />
                          <span>{p.name}</span>
                          {/* "ตอบแล้ว" ไม่ใช่สถานะว่าง จึงใช้ brand แทนมิ้นต์ */}
                          <span className="rounded-full bg-brand-fill px-2 py-0.5 text-[11px] text-brand-ink">
                            ตอบแล้ว
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ไม่มีชื่อตัวเองในลิสต์ — พิมพ์เพิ่มเองได้ */}
              <div className="mt-5 rounded-[16px] bg-surface px-4 py-4">
                <label
                  htmlFor="paigun-name"
                  className="block font-display font-semibold text-[15px] text-ink"
                >
                  ไม่มีชื่อคุณในรายชื่อ?
                </label>
                <p className="pt-0.5 pb-3 text-[13px] text-ink-3">
                  ใส่ชื่อเล่นที่เพื่อนในกลุ่มเรียกคุณ
                </p>
                <div className="flex gap-2">
                  <input
                    id="paigun-name"
                    type="text"
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        claim(typedName);
                      }
                    }}
                    placeholder="เช่น ฟ้า"
                    autoComplete="off"
                    enterKeyHint="go"
                    className="min-h-[44px] w-full flex-1 rounded-full bg-fill px-4 text-[15px] text-ink placeholder:text-ink-3 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={pending || typedName.trim() === ""}
                    onClick={() => claim(typedName)}
                    className="min-h-[44px] shrink-0 rounded-full bg-brand px-5 font-display font-semibold text-[15px] text-on-brand disabled:opacity-50"
                  >
                    {pending ? "…" : "เข้าร่วม"}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    );
  }

  /* ---------------- ขั้นที่ 2: กรอกวันว่าง ---------------- */
  return (
    <main className={SHELL}>
      {header}

      {/* ฉันคือใคร + ทางออกถ้าแตะชื่อผิดคน (เกิดบ่อยเวลาแชร์เครื่องกัน) */}
      <div className="flex flex-wrap items-center gap-2 pb-4">
        <span className="flex min-h-[44px] items-center gap-2 rounded-full bg-fill py-1 pl-1 pr-4 text-[14px] text-ink">
          <AvatarPicker name={myName} value={myAvatarKey as AvatarKey | null} onChange={onChangeAvatar} size={32} />
          คุณ: <span className="font-display font-semibold">{myName}</span>
        </span>
        <button
          type="button"
          onClick={forgetMe}
          className="min-h-[44px] rounded-full px-3 text-[13px] text-ink-3 underline decoration-ink-3/40"
        >
          ไม่ใช่ฉัน
        </button>
      </div>

      {!polling &&
        (trip.status === "cancelled" ? (
          <p className="rounded-[16px] bg-coral-fill px-4 py-3 text-[14px] text-coral-ink">
            เจ้าภาพยกเลิกทริปนี้แล้ว — แก้วันว่างไม่ได้อีก
          </p>
        ) : (
          <p className="rounded-[16px] bg-sun-fill px-4 py-3 text-[14px] text-sun-ink">
            โพลปิดแล้ว — ดูได้แต่แก้ไม่ได้
          </p>
        ))}

      {/* บันทึกสำเร็จ → ยัดปุ่มดูผลโหวตให้เห็นทันที นี่คือรางวัลของการกรอกจบ */}
      {justSaved && (
        <div className="rounded-[16px] bg-mint-fill px-4 py-4">
          <p className="font-display font-semibold text-[15px] text-mint-ink">
            บันทึกแล้ว — เพื่อนเห็นคำตอบของคุณในผลโหวตทันที
          </p>
          <div className="pt-3">{resultLink}</div>
        </div>
      )}

      <div className="pt-3">
        <PaintCalendar
          rangeStart={trip.rangeStart}
          rangeEnd={trip.rangeEnd}
          value={value}
          onChange={setValue}
          lengthDays={trip.lengthDays}
          disabled={!polling}
        />
      </div>

      {/* ความคิดเห็นสั้น ๆ คู่กับวันว่าง — บันทึกพร้อมกับปฏิทินตอนกดปุ่มเดียวกัน */}
      <div className="pt-4">
        <label htmlFor="comment" className="font-display font-semibold text-[0.9rem]">
          ความคิดเห็น (ถ้ามี)
        </label>
        <textarea
          id="comment"
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT_LENGTH))}
          disabled={!polling}
          rows={2}
          maxLength={MAX_COMMENT_LENGTH}
          placeholder="เช่น ว่างแค่เสาร์-อาทิตย์"
          className="mt-2 w-full resize-none rounded-[16px] bg-fill px-4 py-3 text-[14px] text-ink placeholder:text-ink-3 disabled:opacity-50"
        />
      </div>

      {/* ปฏิทินรวมของทุกคน — ก่อนหน้านี้เห็นได้แต่ในหน้าผลโหวตของเจ้าภาพเท่านั้น
          คนที่มากรอกเองก็ควรเห็นได้ว่าคนอื่นเลือกวันไหนไปแล้วบ้างเหมือนกัน */}
      <div className="pt-6">
        <h2 className="font-display font-semibold text-[1rem] pb-1">ปฏิทินความว่างทั้งหมด</h2>
        <p className="text-[0.78rem] text-ink-3 pb-3">
          ตัวเลขในช่อง = ว่างกี่คนจากทั้งหมด · แตะช่องไหนดูรายชื่อของวันนั้น
        </p>
        <DayStatusCalendar
          rangeStart={trip.rangeStart}
          rangeEnd={trip.rangeEnd}
          participants={trip.participants}
        />
      </div>

      {!polling && <div className="pt-4 pb-10">{resultLink}</div>}

      {polling && (
        <>
          {/* กันเนื้อหาถูกแคปซูลลอยด้านล่างบัง — แคปซูลเป็น fixed จึงไม่กินพื้นที่ในโฟลว์เอง */}
          <div
            className="pt-6"
            style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
          >
            <p className="text-center text-[13px] text-ink-3">
              {waiting.length > 0 ? (
                <>
                  ยังรออีก <span className="tnum">{waiting.length}</span> คน
                </>
              ) : (
                "ทุกคนตอบครบแล้ว"
              )}
            </p>
            {waiting.length > 0 && (
              <ul className="flex flex-wrap justify-center gap-2 pt-3">
                {waiting.map((p) => (
                  <li
                    key={p.id}
                    className="flex min-h-[40px] items-center gap-1.5 rounded-full bg-fill py-1 pl-1 pr-3 text-[13px] text-ink-2"
                  >
                    <Avatar name={p.name} avatarKey={p.avatarKey} size={26} />
                    {p.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* กล่อง error เต็มข้อความ — ลอยเหนือแคปซูลบันทึกเสมอ ไม่ว่าจะเลื่อนอยู่ตรงไหน
              เพราะข้อความ error อาจยาวเกินจะยัดลงบรรทัดเดียวในแคปซูลดำ */}
          {errorBox !== null && (
            <div
              className="fixed inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
              style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
            >
              <div className="pointer-events-auto max-w-full rounded-[16px] shadow-lg shadow-black/20">
                {errorBox}
              </div>
            </div>
          )}

          {/* แคปซูลดำลอย — ปุ่มบันทึกวันว่าง เอื้อมถึงได้ตลอดไม่ว่าจะเลื่อนปฏิทินไปไกลแค่ไหน */}
          <FloatingBar>
            <div className="min-w-0 flex-1 pl-3 pr-1">
              <p
                className={`truncate text-[12px] leading-tight ${
                  filledCount === 0 || dirty ? "font-semibold text-on-ink-fixed" : "text-on-ink-fixed/60"
                }`}
              >
                {filledCount === 0
                  ? "เลือกวันว่างก่อนอย่างน้อย 1 วัน"
                  : dirty
                    ? "ยังไม่บันทึก"
                    : "บันทึกไว้แล้ว"}
              </p>
              <p className="truncate text-[11px] leading-tight text-on-ink-fixed/50">
                เลือกไว้ <span className="tnum font-semibold text-on-ink-fixed/80">{freeCount}</span> วัน
              </p>
            </div>
            <button
              type="button"
              onClick={save}
              disabled={pending || filledCount === 0}
              className="min-h-[44px] md:min-h-[60px] shrink-0 whitespace-nowrap rounded-full bg-brand px-5 font-display font-semibold text-[15px] text-on-brand disabled:opacity-50"
            >
              {pending ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </FloatingBar>
        </>
      )}
    </main>
  );
}
