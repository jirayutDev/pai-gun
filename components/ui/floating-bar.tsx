import type { ReactNode } from "react";

/**
 * แคปซูลดำลอยเหนือเนื้อหา — sticky ติดล่างจอ กึ่งกลางแนวนอน
 * ใช้กับปุ่มบันทึกวันว่าง (fill-form) และแถบไอคอนนำทางของหน้าแรก
 *
 * ใช้โทนคงที่ `fixed-dark` เสมอ (ดู Pill) ไม่สลับตามธีม — เป็นองค์ประกอบตายตัวตาม
 * งานอ้างอิง ไม่ใช่พื้นผิวที่ควรกลับสีตามโหมดสว่าง/มืด
 */
export interface FloatingBarProps {
  children: ReactNode;
  className?: string;
}

export function FloatingBar({ children, className = "" }: FloatingBarProps) {
  return (
    <div
      className={`fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 pointer-events-none ${className}`}
    >
      <div className="bg-ink-fixed text-on-ink-fixed rounded-full shadow-lg shadow-black/30 px-2 py-2 flex items-center gap-1 pointer-events-auto max-w-full">
        {children}
      </div>
    </div>
  );
}
