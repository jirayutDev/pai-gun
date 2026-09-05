"use client";

import { useState } from "react";

/**
 * อวตาร 3D วงกลม — ที่มา Microsoft Fluent Emoji (สไตล์ 3D, สัญญาอนุญาต MIT)
 * ไฟล์อยู่ที่ /public/avatars/*.webp (แปลงเป็น WebP 160×160 ไว้แล้ว ไม่ใช่ 1024px
 * ย่อด้วย CSS เพราะ Vercel Hobby มีโควตา image optimization จำกัด)
 * ดู THIRD_PARTY_NOTICES.md สำหรับข้อความสัญญาอนุญาตเต็ม
 */
const AVATAR_FILES = [
  "person-default",
  "person-medium",
  "person-dark",
  "person-light",
  "person-medium-dark",
  "person-medium-light",
  "technologist",
  "artist",
  "student",
  "singer",
  "scientist",
  "astronaut",
] as const;

/** พื้นพาสเทลของวงกลมอักษรย่อตอน fallback — ใช้แค่ตกแต่ง ไม่ใช่สีสถานะ */
const PASTEL_FALLBACKS = [
  "bg-brand-fill text-brand-ink",
  "bg-sky-fill text-sky-ink",
  "bg-lavender-fill text-ink-2",
  "bg-lemon-fill text-ink-2",
  "bg-peach-fill text-ink-2",
];

/**
 * hash ง่าย ๆ แบบ deterministic — คนชื่อเดิมต้องได้อวตารเดิมเสมอ ทั้งฝั่งเซิร์ฟเวอร์
 * (ตอน render ครั้งแรก) และฝั่งเบราว์เซอร์ (ตอน hydrate) จึงห้ามใช้ Math.random ที่นี่
 */
function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h;
}

function initial(name: string): string {
  const trimmed = name.trim();
  return trimmed === "" ? "?" : trimmed[0]!.toUpperCase();
}

export interface AvatarProps {
  name: string;
  /** ขนาดจริงที่แสดง (px) — ดีฟอลต์ 64 ตามช่วง 64–96px ที่ตั้งใจไว้ */
  size?: number;
  className?: string;
}

export default function Avatar({ name, size = 64, className = "" }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const hash = hashName(name);

  if (broken) {
    const pastel = PASTEL_FALLBACKS[hash % PASTEL_FALLBACKS.length];
    return (
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center rounded-full font-display font-bold shrink-0 ${pastel} ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {initial(name)}
      </span>
    );
  }

  const file = AVATAR_FILES[hash % AVATAR_FILES.length];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ตั้งใจไม่ใช้ next/image
    // เพราะไฟล์ถูก resize ไว้แล้วที่ต้นทาง (160×160) ไม่ต้องพึ่งโควตา image optimization
    <img
      src={`/avatars/${file}.webp`}
      alt=""
      width={size}
      height={size}
      className={`rounded-full object-cover shrink-0 ${className}`}
      style={{ width: size, height: size }}
      onError={() => setBroken(true)}
    />
  );
}
