/**
 * จุดคอนเฟตตีพาสเทลลอย — ตกแต่งพื้นดำของ hero/หน้าผลโหวต ตามงานอ้างอิง
 * CSS ล้วน (ดู @keyframes pg-float ใน globals.css) ไม่ใช้ไลบรารีแอนิเมชันใด ๆ
 *
 * ตำแหน่ง/ขนาด/สีตายตัวเป็น array คงที่ (ไม่ใช้ Math.random ตอน render) เพื่อไม่ให้
 * เซิร์ฟเวอร์กับเบราว์เซอร์ได้ผลลัพธ์ต่างกันจน hydration mismatch
 *
 * ใช้งาน: ใส่ในคอนเทนเนอร์ที่มี `position: relative` (หรือ `overflow-hidden`)
 * แล้ววาง <FloatingDots /> เป็นลูกแรก ๆ ให้ลอยอยู่หลังเนื้อหา
 */
interface Dot {
  top: string;
  left: string;
  size: number;
  color: string;
  delay: string;
  duration: string;
}

const DOTS: Dot[] = [
  { top: "8%", left: "12%", size: 10, color: "bg-mint", delay: "0s", duration: "6s" },
  { top: "18%", left: "78%", size: 14, color: "bg-lavender-fill", delay: "0.8s", duration: "7s" },
  { top: "40%", left: "20%", size: 8, color: "bg-sun", delay: "1.6s", duration: "5.5s" },
  { top: "55%", left: "88%", size: 12, color: "bg-coral", delay: "0.4s", duration: "6.5s" },
  { top: "70%", left: "8%", size: 9, color: "bg-lemon-fill", delay: "1.2s", duration: "7.5s" },
  { top: "82%", left: "60%", size: 11, color: "bg-sky", delay: "0.2s", duration: "6s" },
  { top: "25%", left: "48%", size: 7, color: "bg-peach-fill", delay: "2s", duration: "5s" },
];

export interface FloatingDotsProps {
  className?: string;
}

export function FloatingDots({ className = "" }: FloatingDotsProps) {
  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
    >
      {DOTS.map((d, i) => (
        <span
          key={i}
          className={`absolute rounded-full ${d.color} pg-float`}
          style={{
            top: d.top,
            left: d.left,
            width: d.size,
            height: d.size,
            animationDelay: d.delay,
            animationDuration: d.duration,
          }}
        />
      ))}
    </div>
  );
}
