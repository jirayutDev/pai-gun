import type { ReactNode } from "react";

/**
 * แคปซูล/พิลล์มาตรฐานของแอป — ใช้แทนที่ทุกที่ที่เคยเขียน `rounded-full px-3 py-1.5 ...` มือ
 *
 * โทน "status" (mint/sun/coral) สงวนไว้สื่อสถานะว่าง/ว่างถ้าจำเป็น/ไม่ว่างเท่านั้น
 * ตามกฎสีใน globals.css — อย่าใช้โทนพวกนี้ไปแปะป้ายอย่างอื่นที่ไม่เกี่ยวกับความว่าง
 */
export type PillTone = "neutral" | "brand" | "mint" | "sun" | "coral" | "sky" | "fixed-dark";

const TONE_CLASSES: Record<PillTone, string> = {
  neutral: "bg-fill text-ink-2",
  brand: "bg-brand-fill text-brand-ink",
  mint: "bg-mint-fill text-mint-ink",
  sun: "bg-sun-fill text-sun-ink",
  coral: "bg-coral-fill text-coral-ink",
  sky: "bg-sky-fill text-sky-ink",
  // เกือบดำเสมอไม่ว่าจะธีมไหน — ใช้กับป้ายที่ลอยอยู่บนพื้นผิวหลากสี เช่น บนรูปอวตาร
  "fixed-dark": "bg-ink-fixed text-on-ink-fixed",
};

export interface PillProps {
  children: ReactNode;
  tone?: PillTone;
  className?: string;
}

export function Pill({ children, tone = "neutral", className = "" }: PillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.78rem] font-medium leading-none ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
