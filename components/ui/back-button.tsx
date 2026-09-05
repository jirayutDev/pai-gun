"use client";

import { useRouter } from "next/navigation";

/**
 * ปุ่มย้อนกลับหน้าที่แล้ว — ใช้ history ของเบราว์เซอร์ (router.back()) ไม่ใช่ลิงก์ตายตัว
 * เพราะ "หน้าที่แล้ว" ขึ้นกับว่าผู้ใช้มาจากไหนจริง ๆ (จากลิสต์ทริป, จากลิงก์แชร์,
 * จากหน้าผลโหวต ฯลฯ) ตายตัวไปที่เดียวจะผิดบริบทได้ง่าย
 */
export function BackButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="ย้อนกลับ"
      className={`flex min-h-[40px] items-center gap-1 rounded-full px-3 text-[13px] text-ink-2 ${className}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M15 18L9 12L15 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      ย้อนกลับ
    </button>
  );
}
