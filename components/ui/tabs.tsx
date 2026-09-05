"use client";

/**
 * แถบแท็บแบบ segmented control — ใช้แบ่งหน้าที่ข้อมูลเยอะออกเป็นหมวดที่กดดูทีละหมวด
 * (แทนที่จะยัดทุกอย่างลงหน้าเดียวยาว ๆ) ไม่ผูกกับ routing ใด ๆ — ควบคุมด้วย state
 * ของ parent ล้วน (value/onChange) เพื่อให้ parent ตัดสินใจเองว่าจะจำแท็บที่เลือกไว้
 * ใน URL/localStorage หรือไม่ก็ได้
 */
export interface TabItem {
  value: string;
  label: string;
  /** ตัวเลขเด่น ๆ ต่อท้ายชื่อแท็บ เช่น จำนวนสถานที่ที่เสนอไว้ — ไม่ใส่ก็ได้ */
  badge?: number;
}

export function Tabs({
  items,
  value,
  onChange,
  className = "",
}: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`flex gap-1 rounded-full bg-fill p-1 ${className}`}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={`flex-1 min-h-[40px] rounded-full px-3 font-display font-semibold text-[13px] transition-colors ${
              active ? "bg-surface text-ink shadow-sm" : "text-ink-3"
            }`}
          >
            {item.label}
            {item.badge !== undefined && item.badge > 0 ? (
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] tnum ${
                  active ? "bg-brand-fill text-brand-ink" : "bg-surface text-ink-3"
                }`}
              >
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
