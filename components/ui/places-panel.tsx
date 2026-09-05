"use client";

/**
 * PlacesPanel — สถานที่ที่จะไป: สมาชิกทุกคนเสนอ+โหวตได้ อยู่คนละมิติกับวันว่าง
 * ใช้ร่วมกันทั้งหน้ากรอกวันว่าง (fill-form.tsx) และหน้าผลโหวต (result-view.tsx)
 * ผ่านแท็บ "สถานที่" ของทั้งสองหน้า
 */

import { useCallback, useState, useTransition } from "react";

import { addPlaceAction, removePlaceAction, votePlaceAction } from "@/app/actions";
import {
  MAX_PLACE_LOCATION_LENGTH,
  MAX_PLACE_NAME_LENGTH,
  MAX_PLACE_NOTE_LENGTH,
  MAX_PLACE_PRICE_LENGTH,
  MAX_PLACE_URL_LENGTH,
} from "@/lib/store";
import type { Place } from "@/lib/types";
import { toastError } from "@/components/ui/swal";

export interface PlacesPanelProps {
  slug: string;
  places: Place[];
  /** ตัวตนของฉันในทริปนี้ — null ถ้ายังไม่เคลมชื่อ (ดูได้แต่เสนอ/โหวตไม่ได้) */
  me: { token: string; participantId: string } | null;
  /** เจ้าภาพลบสถานที่ของใครก็ได้ — auth ผ่าน session ไม่ต้องมี token */
  isOwner: boolean;
}

function sortedPlaces(places: Place[]): Place[] {
  return [...places].sort((a, b) => {
    if (b.votes.length !== a.votes.length) return b.votes.length - a.votes.length;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function VoteButton({
  place,
  voted,
  disabled,
  onVote,
}: {
  place: Place;
  voted: boolean;
  disabled: boolean;
  onVote: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onVote}
      className={`flex shrink-0 min-h-[40px] items-center gap-1.5 rounded-full px-3.5 font-display font-semibold text-[13px] disabled:opacity-50 ${
        voted ? "bg-mint text-ink-fixed" : "bg-fill text-ink-2"
      }`}
    >
      {voted ? "โหวตแล้ว" : "โหวต"}
      <span className="tnum">{place.votes.length}</span>
    </button>
  );
}

function PlaceCard({
  place,
  slug,
  me,
  canRemove,
}: {
  place: Place;
  slug: string;
  me: { token: string; participantId: string } | null;
  canRemove: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const voted = me !== null && place.votes.includes(me.participantId);

  const vote = useCallback(() => {
    if (me === null) return;
    startTransition(async () => {
      const res = await votePlaceAction(slug, me.token, place.id);
      if (!res.ok) toastError(res.error);
    });
  }, [slug, me, place.id]);

  const remove = useCallback(() => {
    startTransition(async () => {
      const res = await removePlaceAction(slug, me?.token ?? "", place.id);
      if (!res.ok) toastError(res.error);
    });
  }, [slug, me, place.id]);

  return (
    <li className="rounded-[16px] bg-surface border border-line px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-[16px] text-ink break-words">{place.name}</p>
          <p className="pt-0.5 text-[12px] text-ink-3">เพิ่มโดย {place.addedByName}</p>
        </div>
        <VoteButton place={place} voted={voted} disabled={me === null || pending} onVote={vote} />
      </div>

      {(place.location !== null || place.price !== null) && (
        <div className="flex flex-wrap gap-2 pt-2">
          {place.location !== null && (
            <span className="rounded-full bg-fill px-2.5 py-1 text-[12px] text-ink-2">
              📍 {place.location}
            </span>
          )}
          {place.price !== null && (
            <span className="rounded-full bg-fill px-2.5 py-1 text-[12px] text-ink-2">
              💰 {place.price}
            </span>
          )}
        </div>
      )}

      {place.note !== null && (
        <p className="pt-2 text-[13px] leading-relaxed text-ink-2 break-words">{place.note}</p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-2">
        {place.url !== null && (
          <a
            href={place.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] font-semibold text-brand-ink underline decoration-brand-ink/40"
          >
            เปิดลิงก์ →
          </a>
        )}
        {canRemove && (
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="text-[12px] text-ink-3 underline decoration-ink-3/40 disabled:opacity-50"
          >
            ลบ
          </button>
        )}
      </div>
    </li>
  );
}

function AddPlaceForm({
  slug,
  me,
  onAdded,
}: {
  slug: string;
  me: { token: string; participantId: string };
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [location, setLocation] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = useCallback(() => {
    if (name.trim() === "") {
      toastError("ใส่ชื่อสถานที่ก่อน");
      return;
    }
    startTransition(async () => {
      const res = await addPlaceAction(slug, me.token, { name, url, location, price, note });
      if (!res.ok) {
        toastError(res.error);
        return;
      }
      setName("");
      setUrl("");
      setLocation("");
      setPrice("");
      setNote("");
      setOpen(false);
      onAdded();
    });
  }, [slug, me, name, url, location, price, note, onAdded]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[16px] bg-fill font-display font-semibold text-[14px] text-ink-2"
      >
        + เสนอสถานที่
      </button>
    );
  }

  return (
    <div className="rounded-[16px] bg-surface border border-line px-4 py-4">
      <div className="grid gap-2.5">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_PLACE_NAME_LENGTH}
          placeholder="ชื่อสถานที่ (จำเป็น)"
          autoFocus
          className="min-h-[44px] w-full rounded-[12px] bg-fill px-3.5 text-[14px] text-ink placeholder:text-ink-3 focus:outline-none"
        />
        <input
          type="text"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          maxLength={MAX_PLACE_URL_LENGTH}
          placeholder="ลิงก์ (ถ้ามี) เช่น https://..."
          className="min-h-[44px] w-full rounded-[12px] bg-fill px-3.5 text-[14px] text-ink placeholder:text-ink-3 focus:outline-none"
        />
        <div className="flex gap-2.5">
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={MAX_PLACE_LOCATION_LENGTH}
            placeholder="โลเคชั่น"
            className="min-h-[44px] w-1/2 rounded-[12px] bg-fill px-3.5 text-[14px] text-ink placeholder:text-ink-3 focus:outline-none"
          />
          <input
            type="text"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            maxLength={MAX_PLACE_PRICE_LENGTH}
            placeholder="ราคา เช่น 500-800/คน"
            className="min-h-[44px] w-1/2 rounded-[12px] bg-fill px-3.5 text-[14px] text-ink placeholder:text-ink-3 focus:outline-none"
          />
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={MAX_PLACE_NOTE_LENGTH}
          rows={2}
          placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
          className="w-full resize-none rounded-[12px] bg-fill px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-3 focus:outline-none"
        />
      </div>
      <div className="flex gap-2 pt-3">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="min-h-[44px] flex-1 rounded-full bg-brand font-display font-semibold text-[14px] text-on-brand disabled:opacity-60"
        >
          {pending ? "กำลังเพิ่ม…" : "เพิ่มสถานที่"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-[44px] rounded-full bg-fill px-5 text-[14px] text-ink-2"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

export function PlacesPanel({ slug, places, me, isOwner }: PlacesPanelProps) {
  const sorted = sortedPlaces(places);

  return (
    <div className="grid gap-3">
      {me !== null ? (
        <AddPlaceForm slug={slug} me={me} onAdded={() => {}} />
      ) : (
        <p className="rounded-[16px] bg-fill px-4 py-3 text-[13px] text-ink-2">
          เลือกชื่อตัวเองก่อนถึงจะเสนอ/โหวตสถานที่ได้ — ดูรายการที่เพื่อนเสนอไว้ได้เลยตอนนี้
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="rounded-[16px] bg-fill px-4 py-6 text-center text-[14px] text-ink-3">
          ยังไม่มีใครเสนอสถานที่ — เป็นคนแรกได้เลย
        </p>
      ) : (
        <ul className="grid gap-2.5">
          {sorted.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              slug={slug}
              me={me}
              canRemove={isOwner || (me !== null && place.addedByParticipantId === me.participantId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
