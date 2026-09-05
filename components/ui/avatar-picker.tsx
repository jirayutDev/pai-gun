"use client";

/**
 * ตัวเลือกอวตาร — ปุ่มโชว์อวตารปัจจุบัน กดแล้วเด้งกริดให้เลือกหน้าตาเอง
 * แทนที่จะปล่อยให้ hash จากชื่ออย่างเดียว (ยังเป็นค่าเริ่มต้นถ้ายังไม่เคยเลือก)
 */

import { useEffect, useRef, useState } from "react";
import Avatar, { AVATAR_FILES, type AvatarKey } from "@/components/ui/avatar";

export interface AvatarPickerProps {
  name: string;
  value: AvatarKey | null;
  onChange: (key: AvatarKey) => void;
  size?: number;
}

export default function AvatarPicker({ name, value, onChange, size = 64 }: AvatarPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="เลือกหน้าตาอวตารของคุณเอง"
        aria-expanded={open}
        className="relative"
      >
        <Avatar name={name} avatarKey={value} size={size} />
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-brand text-on-brand text-[12px] ring-2 ring-surface"
        >
          ✎
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="เลือกอวตาร"
          className="absolute z-30 mt-2 w-[264px] rounded-[20px] border border-line bg-surface p-3 shadow-lg shadow-black/30"
        >
          <p className="pb-2 text-[12px] text-ink-3">เลือกหน้าตาที่ชอบ — คนอื่นเห็นแบบเดียวกัน</p>
          <div className="grid max-h-[260px] grid-cols-5 gap-2 overflow-y-auto">
            {AVATAR_FILES.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onChange(key);
                  setOpen(false);
                }}
                aria-pressed={value === key}
                className={`rounded-full p-0.5 ${value === key ? "ring-2 ring-brand" : ""}`}
              >
                <Avatar name={name} avatarKey={key} size={40} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
