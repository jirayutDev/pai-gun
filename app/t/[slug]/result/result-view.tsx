"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { cancelTripAction, editTripAction, lockDateAction } from "@/app/actions";
import { formatDowRange, formatRange, isISODate } from "@/lib/dates";
import { rankWindows } from "@/lib/schedule";
import type { Participant, Trip, TripWindow } from "@/lib/types";
import Avatar from "@/components/ui/avatar";
import DatePicker from "@/components/ui/date-picker";
import DayStatusCalendar from "@/components/ui/day-status-calendar";
import { Pill } from "@/components/ui/pill";
import { FloatingDots } from "@/components/ui/floating-dots";
import { confirmDialog, toastError, toastSuccess } from "@/components/ui/swal";

/** trip เวอร์ชันที่ปลอดภัยจะส่งลง client — ไม่มี ownerId และไม่มี token ของใคร */
export type PublicParticipant = Omit<Participant, "token">;
export type PublicTrip = Omit<Trip, "ownerId" | "participants"> & {
  participants: PublicParticipant[];
};

export interface ResultViewProps {
  trip: PublicTrip;
  /** true เฉพาะเมื่อ session ที่ล็อกอินอยู่เป็นเจ้าของทริปนี้จริง (ตรวจฝั่งเซิร์ฟเวอร์แล้ว) */
  isOwner: boolean;
  /** URL เต็มของลิงก์แชร์ ใช้กดคัดลอกไปวางในกลุ่ม */
  shareUrl: string;
}

const LENGTH_CHOICES = [1, 2, 3, 4, 5, 6, 7];

/**
 * สีพาสเทลตกแต่งของวงกลมอันดับในลิสต์ "ตัวเลือกสำรอง" — สลับตามลำดับ (index % length)
 * ล้วนเป็นพาสเทลตกแต่งเท่านั้น ไม่เกี่ยวกับความหมายสถานะว่าง/ไม่ว่าง
 * (คู่สีเดียวกับ fallback ของ Avatar เพื่อให้ภาษาภาพของแอปสอดคล้องกัน)
 */
const RANK_PASTELS = [
  "bg-brand-fill text-brand-ink",
  "bg-sky-fill text-sky-ink",
  "bg-lavender-fill text-ink-2",
  "bg-lemon-fill text-ink-2",
  "bg-peach-fill text-ink-2",
];

/** เติมฟิลด์ที่ถอดออกไปตอน serialize กลับเข้าไป เพื่อให้ rankWindows รับได้ตามชนิด */
function toRankable(trip: PublicTrip): Trip {
  return {
    ...trip,
    ownerId: "",
    participants: trip.participants.map((p) => ({ ...p, token: "" })),
  };
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyButton({
  text,
  label,
  className = "",
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copy(text)) {
          setDone(true);
          window.setTimeout(() => setDone(false), 2000);
        }
      }}
      className={`min-h-[44px] md:min-h-[60px] px-4 rounded-full font-display font-semibold text-[0.88rem] ${
        done ? "bg-mint text-ink-fixed" : "bg-fill text-ink-2"
      } ${className}`}
    >
      {done ? "คัดลอกแล้ว" : label}
    </button>
  );
}

/** แถบสัดส่วน ว่าง / ถ้าจำเป็น / ไม่ว่าง ของช่วงหนึ่ง */
function Bar({ w, total }: { w: TripWindow; total: number }) {
  if (total === 0) return null;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="h-2 rounded-full bg-fill-2 overflow-hidden flex mt-3">
      <i className="block h-full bg-mint" style={{ width: pct(w.free.length) }} />
      <i className="block h-full bg-sun" style={{ width: pct(w.maybe.length) }} />
      <i className="block h-full bg-coral" style={{ width: pct(w.busy.length) }} />
    </div>
  );
}

function whoLine(w: TripWindow): string {
  const bits: string[] = [`${w.free.length} คนว่าง`];
  if (w.maybe.length) bits.push(`${w.maybe.length} คนว่างถ้าจำเป็น`);
  if (w.busy.length) bits.push(`ติด ${w.busy.join(", ")}`);
  if (w.unknown.length) bits.push(`ยังไม่ตอบ ${w.unknown.length} คน`);
  return bits.join(" · ");
}

function offLine(w: TripWindow): string {
  if (w.holidays.length > 0) {
    return `${formatDowRange(w.start, w.end)} · ${w.holidays.join(", ")} ไม่ต้องลา`;
  }
  if (w.offDays > 0) {
    return `${formatDowRange(w.start, w.end)} · หยุดอยู่แล้ว ${w.offDays} วัน`;
  }
  return `${formatDowRange(w.start, w.end)} · ต้องลาทั้งช่วง`;
}

export default function ResultView({ trip, isOwner, shareUrl }: ResultViewProps) {
  const [length, setLength] = useState(trip.lengthDays);
  const [pending, startTransition] = useTransition();

  // ── แก้ไขข้อมูลพื้นฐานของทริป (เจ้าภาพ, เฉพาะตอนโพลยังเปิดอยู่) ──────────
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(trip.title);
  const [editNote, setEditNote] = useState(trip.note);
  const [editRangeStart, setEditRangeStart] = useState(trip.rangeStart);
  const [editRangeEnd, setEditRangeEnd] = useState(trip.rangeEnd);
  const [editLength, setEditLength] = useState(trip.lengthDays);
  const [editDeadline, setEditDeadline] = useState(trip.deadline ? trip.deadline.slice(0, 10) : "");
  const [editAllowSelfJoin, setEditAllowSelfJoin] = useState(trip.allowSelfJoin);

  const rankable = useMemo(() => toRankable(trip), [trip]);
  const rank = useMemo(() => rankWindows(rankable, length), [rankable, length]);

  const top = rank.windows[0] ?? null;
  const alternatives = rank.windows.slice(1, 4);
  const nearMiss = rank.nearMiss.filter((w) => w.start !== top?.start).slice(0, 2);
  const isCancelled = trip.status === "cancelled";
  const isLocked = trip.status !== "polling";
  // ล็อก/ยกเลิกทำต่อไม่ได้ทั้งคู่ถ้าทริปถูกยกเลิกหรือปิดจบไปแล้ว
  const canHostAct = isOwner && trip.status !== "cancelled" && trip.status !== "done";

  /** ข้อความทวงที่เจ้าภาพก็อปไปวางในกลุ่มได้เลย — แทนระบบแจ้งเตือนทั้งหมด */
  const nudge = useMemo(() => {
    const names = rank.waitingFor.join(" ");
    return `${names} ยังไม่กรอกวันว่างทริป "${trip.title}" นะ กดลิงก์นี้เลย ${shareUrl}`;
  }, [rank.waitingFor, trip.title, shareUrl]);

  function onLock(start: string) {
    if (!isOwner) return;
    startTransition(async () => {
      const res = await lockDateAction(trip.slug, start);
      if (!res.ok) toastError(res.error);
    });
  }

  async function onCancel() {
    if (!isOwner) return;
    // ยกเลิกทริปกระทบทุกคนที่กรอกไว้แล้ว ให้เจ้าภาพยืนยันอีกชั้นก่อนจริง ๆ
    const sure = await confirmDialog({
      title: `ยกเลิกทริป "${trip.title}" ใช่ไหม`,
      text: "เพื่อนที่กรอกไว้จะแก้ต่อไม่ได้อีก",
      confirmText: "ยกเลิกทริปนี้",
      cancelText: "ไม่ยกเลิก",
      danger: true,
    });
    if (!sure) return;
    startTransition(async () => {
      const res = await cancelTripAction(trip.slug);
      if (!res.ok) toastError(res.error);
    });
  }

  function onSaveEdit() {
    if (!isOwner) return;
    startTransition(async () => {
      const res = await editTripAction(trip.slug, {
        title: editTitle,
        note: editNote,
        rangeStart: editRangeStart,
        rangeEnd: editRangeEnd,
        lengthDays: editLength,
        // input type=date คืนแค่วันที่ล้วน ต่อเวลาสิ้นวันตามเวลาไทยเหมือนตอนสร้างทริป
        deadline: editDeadline === "" ? null : new Date(`${editDeadline}T23:59:59+07:00`).toISOString(),
        allowSelfJoin: editAllowSelfJoin,
      });
      if (!res.ok) {
        toastError(res.error);
        return;
      }
      toastSuccess("บันทึกแล้ว");
      setEditing(false);
    });
  }

  return (
    <div className="max-w-[32rem] md:max-w-[36rem] mx-auto">
      {/* ---------- หัวหน้า ---------- */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.8rem] text-ink-3">
            {formatRange(trip.rangeStart, trip.rangeEnd)} · ตอบแล้ว {rank.answered} จาก{" "}
            {rank.invited} คน
          </p>
          <h1 className="font-display font-bold text-[1.9rem] tracking-[-0.03em] mt-1">
            {trip.title}
          </h1>
          {trip.note ? <p className="text-[0.88rem] text-ink-2 mt-1">{trip.note}</p> : null}
        </div>
        {canHostAct && trip.status === "polling" ? (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="shrink-0 min-h-[40px] px-4 rounded-full bg-fill text-ink-2 font-display font-semibold text-[0.82rem]"
          >
            {editing ? "ปิดฟอร์ม" : "แก้ไขทริป"}
          </button>
        ) : null}
      </header>

      {/* ---------- ฟอร์มแก้ไขข้อมูลพื้นฐาน (เจ้าภาพ, เฉพาะตอนโพลยังเปิดอยู่) ---------- */}
      {editing && canHostAct && trip.status === "polling" ? (
        <div className="bg-surface border border-line rounded-[20px] p-4 mt-4 grid gap-3">
          <div>
            <label htmlFor="edit-title" className="block pb-1 text-[12px] text-ink-3">
              ชื่อทริป
            </label>
            <input
              id="edit-title"
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full min-h-[44px] rounded-full bg-fill px-4 text-[15px] text-ink outline-none"
            />
          </div>

          <div>
            <label htmlFor="edit-note" className="block pb-1 text-[12px] text-ink-3">
              รายละเอียดเพิ่มเติม
            </label>
            <textarea
              id="edit-note"
              rows={2}
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              className="w-full rounded-[16px] bg-fill px-4 py-2.5 text-[14px] text-ink outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="edit-range-start" className="block pb-1 text-[12px] text-ink-3">
                เริ่ม
              </label>
              <DatePicker id="edit-range-start" value={editRangeStart} onChange={setEditRangeStart} />
            </div>
            <div>
              <label htmlFor="edit-range-end" className="block pb-1 text-[12px] text-ink-3">
                ถึง
              </label>
              <DatePicker
                id="edit-range-end"
                value={editRangeEnd}
                min={editRangeStart}
                onChange={setEditRangeEnd}
              />
            </div>
          </div>

          <div>
            <p className="pb-1 text-[12px] text-ink-3">ทริปยาวกี่วัน</p>
            <div role="group" aria-label="ทริปยาวกี่วัน" className="flex gap-1 bg-fill p-1 rounded-full overflow-x-auto">
              {LENGTH_CHOICES.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={n === editLength}
                  onClick={() => setEditLength(n)}
                  className={`shrink-0 min-h-[40px] px-3.5 rounded-full font-display font-semibold text-[0.84rem] ${
                    n === editLength ? "bg-brand text-on-brand" : "text-ink-2"
                  }`}
                >
                  {n} วัน
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="edit-deadline" className="block pb-1 text-[12px] text-ink-3">
              ปิดโพลวันไหน (ไม่กำหนดก็ได้)
            </label>
            <DatePicker
              id="edit-deadline"
              value={editDeadline}
              onChange={setEditDeadline}
              placeholder="ไม่กำหนด"
            />
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={editAllowSelfJoin}
            onClick={() => setEditAllowSelfJoin((v) => !v)}
            className="flex w-full min-h-[44px] items-center gap-3 rounded-[16px] bg-fill px-3 py-2 text-left"
          >
            <span
              aria-hidden="true"
              className={`flex h-7 w-12 shrink-0 items-center rounded-full px-[3px] ${
                editAllowSelfJoin ? "bg-brand" : "bg-fill-2"
              }`}
            >
              <span
                className={`h-[22px] w-[22px] rounded-full bg-surface transition-transform ${
                  editAllowSelfJoin ? "translate-x-[20px]" : "translate-x-0"
                }`}
              />
            </span>
            <span className="text-[13px] leading-snug text-ink">ให้คนอื่นเพิ่มชื่อตัวเองจากลิงก์ได้</span>
          </button>

          <button
            type="button"
            disabled={pending || !isISODate(editRangeStart) || !isISODate(editRangeEnd) || editTitle.trim() === ""}
            onClick={onSaveEdit}
            className="min-h-[48px] rounded-full bg-brand text-on-brand font-display font-semibold disabled:opacity-60"
          >
            {pending ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}
          </button>
        </div>
      ) : null}

      {isCancelled ? (
        <div className="bg-coral-fill text-coral-ink rounded-[20px] px-4 py-3 mt-4 text-[0.9rem]">
          <strong className="font-display font-semibold">ทริปนี้ถูกยกเลิกแล้ว</strong> —
          เจ้าภาพยกเลิกไป แก้วันว่างหรือล็อกวันต่อไม่ได้อีก
        </div>
      ) : isLocked && trip.lockedStart ? (
        <div className="bg-mint-fill text-mint-ink rounded-[20px] px-4 py-3 mt-4 text-[0.9rem]">
          <strong className="font-display font-semibold">ล็อกวันแล้ว</strong> —{" "}
          {formatRange(trip.lockedStart, trip.lockedStart)} เป็นต้นไป รวม {trip.lengthDays} วัน
          · โพลปิดแล้ว แก้วันว่างไม่ได้อีก
        </div>
      ) : null}

      {/* ---------- ลิงก์แชร์ ---------- */}
      <div className="bg-surface border border-line rounded-[20px] p-4 mt-4">
        <p className="text-[0.8rem] text-ink-3 mb-2">แปะลิงก์นี้ในกลุ่ม LINE</p>
        <p className="font-mono text-[0.8rem] text-ink break-all bg-fill rounded-[10px] px-3 py-2">
          {shareUrl}
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <CopyButton text={shareUrl} label="คัดลอกลิงก์" />
          {rank.waitingFor.length > 0 ? (
            <CopyButton text={nudge} label={`คัดลอกข้อความทวง ${rank.waitingFor.length} คน`} />
          ) : null}
        </div>
      </div>

      {/* ---------- ตัวเลือกความยาวทริป ---------- */}
      <div className="mt-6">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h2 className="font-display font-semibold text-[1.05rem]">ทริปยาวกี่วัน</h2>
          <span className="text-[0.78rem] text-ink-3">เปลี่ยนแล้วคำตอบเปลี่ยนทั้งชุด</span>
        </div>
        <div
          role="group"
          aria-label="ความยาวทริป"
          className="flex gap-1 bg-fill p-1 rounded-full overflow-x-auto"
        >
          {LENGTH_CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={n === length}
              onClick={() => setLength(n)}
              className={`shrink-0 min-h-[44px] md:min-h-[60px] px-4 rounded-full font-display font-semibold text-[0.88rem] ${
                n === length ? "bg-brand text-on-brand" : "text-ink-2"
              }`}
            >
              {n} วัน
            </button>
          ))}
        </div>
      </div>

      {/* ---------- คำตอบอันดับหนึ่ง ---------- */}
      {top ? (
        <section className="relative overflow-hidden bg-surface border border-line rounded-[34px] shadow-[0_12px_36px_-16px_rgba(0,0,0,0.45)] pt-8 pb-5 px-5 mt-4">
          <FloatingDots />
          <div className="relative flex flex-col items-center text-center">
            <p className="font-mono text-[0.72rem] tracking-[0.08em] uppercase text-mint-ink">
              ช่วงที่ดีที่สุด 🏆
            </p>
            <div className="relative mt-3">
              <span
                aria-hidden="true"
                className="absolute -top-4 left-1/2 -translate-x-1/2 text-[1.7rem] leading-none rotate-[-8deg]"
              >
                👑
              </span>
              <Avatar name={trip.title} size={96} />
            </div>
            <p className="font-display font-bold text-[1.7rem] leading-[1.08] tracking-[-0.03em] text-ink mt-3">
              {formatRange(top.start, top.end)}
            </p>
            <p className="text-[0.84rem] text-ink-2 mt-1">{offLine(top)}</p>
            <Pill tone="mint" className="mt-3">
              {whoLine(top)}
            </Pill>
          </div>

          <div className="relative mt-4">
            <Bar w={top} total={trip.participants.length} />
            <p className="font-mono text-[0.74rem] text-ink-3 text-center mt-2">
              คะแนน {top.score.toFixed(1)} จากเต็ม {top.maxScore.toFixed(1)}
            </p>
          </div>

          {canHostAct && !isLocked ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => onLock(top.start)}
              className="relative mt-4 w-full min-h-[52px] md:min-h-[60px] rounded-full bg-brand text-on-brand font-display font-semibold disabled:opacity-60"
            >
              {pending ? "กำลังล็อก…" : `ล็อกวัน ${formatRange(top.start, top.end)}`}
            </button>
          ) : null}
        </section>
      ) : (
        <section className="bg-sun-fill text-sun-ink rounded-[24px] p-5 mt-4">
          <p className="font-display font-bold text-[1.2rem]">ยังไม่มีช่วงที่ลงตัว</p>
          <p className="text-[0.88rem] mt-1">
            {rank.invited === 0
              ? "ยังไม่มีใครอยู่ในทริปนี้ ลองแชร์ลิงก์ให้เพื่อนก่อน"
              : rank.answered === 0
                ? "ยังไม่มีใครกรอกวันว่างเลย แปะลิงก์ในกลุ่มแล้วรอสักครู่"
                : `ไม่มีช่วง ${length} วันติดกันที่คนสำคัญว่าง — ลองเปลี่ยนความยาวทริป หรือถามคนสำคัญว่าขยับได้ไหม`}
          </p>
        </section>
      )}

      {/* ---------- ตัวเลือกสำรอง ---------- */}
      {alternatives.length > 0 ? (
        <section className="mt-6">
          <h2 className="font-display font-semibold text-[1.05rem] mb-2">ตัวเลือกสำรอง</h2>
          <ul className="grid gap-2">
            {alternatives.map((w, i) => (
              <li key={w.start} className="bg-fill border border-line rounded-[16px] px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display font-semibold text-[1.02rem] tracking-tight">
                      {formatRange(w.start, w.end)}
                    </p>
                    <p className="text-[0.82rem] text-ink-2">{whoLine(w)}</p>
                    <p className="text-[0.78rem] text-ink-3">{offLine(w)}</p>
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <span
                      aria-label={`อันดับที่ ${i + 2}`}
                      className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-display font-bold text-[0.82rem] ${
                        RANK_PASTELS[i % RANK_PASTELS.length]
                      }`}
                    >
                      {i + 2}
                    </span>
                    <span className="font-display font-bold text-[0.95rem] tnum text-ink-2">
                      {w.score.toFixed(1)}
                    </span>
                  </div>
                </div>
                {canHostAct && !isLocked ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onLock(w.start)}
                    className="mt-2 min-h-[44px] md:min-h-[60px] px-4 rounded-full bg-fill-2 text-ink font-display font-semibold text-[0.84rem] disabled:opacity-60"
                  >
                    ล็อกช่วงนี้แทน
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---------- เกือบได้ ---------- */}
      {nearMiss.length > 0 ? (
        <section className="mt-6">
          <h2 className="font-display font-semibold text-[1.05rem] mb-2">เกือบได้ — ติดคนเดียว</h2>
          <ul className="grid gap-2">
            {nearMiss.map((w) => (
              <li
                key={w.start}
                className="flex items-start gap-3 bg-sun-fill text-sun-ink rounded-[16px] px-4 py-3"
              >
                <Avatar name={w.busy[0]} size={40} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-display font-semibold text-[1.02rem] tracking-tight">
                    {formatRange(w.start, w.end)}
                  </p>
                  <p className="text-[0.84rem]">
                    ถ้า <strong className="font-display font-semibold">{w.busy[0]}</strong> ขยับได้
                    จะไปกันได้ {w.free.length + w.maybe.length + 1} คน — โทรถามคนเดียวเร็วกว่าหาวันใหม่
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---------- ตัดออกเพราะคนสำคัญ ---------- */}
      {rank.disqualified.length > 0 ? (
        <section className="mt-6">
          <h2 className="font-display font-semibold text-[1.05rem] mb-2">
            ตัดออกเพราะคนสำคัญไม่ว่าง · {rank.disqualified.length} ช่วง
          </h2>
          <p className="text-[0.84rem] text-ink-2">
            {rank.disqualified
              .slice(0, 6)
              .map((w) => formatRange(w.start, w.end))
              .join(" · ")}
            {rank.disqualified.length > 6
              ? ` · และอีก ${rank.disqualified.length - 6} ช่วง`
              : ""}
          </p>
        </section>
      ) : null}

      {/* ---------- ปฏิทินความว่างทั้งหมด — แตะช่องวันดูว่าใครว่าง/ไม่ว่างวันนั้น ---------- */}
      <section className="mt-6">
        <h2 className="font-display font-semibold text-[1.05rem] mb-1">ปฏิทินความว่างทั้งหมด</h2>
        <p className="text-[0.78rem] text-ink-3 mb-3">
          ตัวเลขในช่อง = ว่างกี่คนจากทั้งหมด · แตะช่องไหนดูรายชื่อของวันนั้น
        </p>
        <DayStatusCalendar
          rangeStart={trip.rangeStart}
          rangeEnd={trip.rangeEnd}
          participants={trip.participants}
        />
      </section>

      {/* ---------- ใครตอบแล้ว ---------- */}
      <section className="mt-6">
        <h2 className="font-display font-semibold text-[1.05rem] mb-2">ใครตอบแล้ว</h2>
        <ul className="grid gap-1.5">
          {trip.participants.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 bg-surface border border-line rounded-[13px] px-3 py-2"
            >
              <Avatar name={p.name} avatarKey={p.avatarKey} size={32} className="shrink-0" />
              <span className="font-display font-semibold text-[0.9rem] flex-1 min-w-0 truncate">
                {p.name}
                {p.isKey ? (
                  <span className="ml-2 font-mono text-[0.62rem] text-brand-ink">ขาดไม่ได้</span>
                ) : null}
              </span>
              <Pill tone={p.submittedAt ? "mint" : "neutral"} className="shrink-0">
                {p.submittedAt ? "ตอบแล้ว" : "ยังไม่ตอบ"}
              </Pill>
            </li>
          ))}
        </ul>
      </section>

      <Link
        href={`/t/${trip.slug}`}
        className="mt-6 inline-flex items-center justify-center w-full min-h-[52px] md:min-h-[60px] rounded-full bg-fill text-ink font-display font-semibold"
      >
        {isLocked ? "ดูวันว่างที่กรอกไว้" : "ไปกรอก / แก้วันว่างของฉัน"}
      </Link>

      {/* ---------- ยกเลิกทริป (เจ้าภาพเท่านั้น) ---------- */}
      {canHostAct ? (
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="mt-3 inline-flex items-center justify-center w-full min-h-[44px] md:min-h-[60px] rounded-full bg-coral-fill text-coral-ink font-display font-semibold text-[0.88rem] disabled:opacity-60"
        >
          ยกเลิกทริปนี้
        </button>
      ) : null}
    </div>
  );
}
