import type { Metadata } from "next";
import { redirect } from "next/navigation";

import CreateTripForm from "./create-trip-form";
import Avatar from "@/components/ui/avatar";
import { BackButton } from "@/components/ui/back-button";
import { FloatingDots } from "@/components/ui/floating-dots";
import { Pill } from "@/components/ui/pill";
import { getSessionUser } from "@/lib/auth/session";

/**
 * หน้า "ตั้งตี้ใหม่" ของเจ้าภาพ
 *
 * ไฟล์นี้เป็น server component บาง ๆ โดยเจตนา — ทำแค่จัดกรอบหน้า หัวเรื่อง
 * และ metadata ส่วนวิซาร์ดทั้งหมดอยู่ใน create-trip-form.tsx ซึ่งเป็น
 * client component เพราะทุกขั้นตอนเป็น state ในเครื่องผู้ใช้ล้วน ๆ
 * ไม่มีอะไรต้องดึงจากเซิร์ฟเวอร์ก่อนวาดหน้า
 *
 * โครงหน้าตามงานอ้างอิง (การ์ดตั้งค่าคอร์สแบบ "My Peers"):
 * ฉากบนใช้ --ink-fixed/--on-ink-fixed (เกือบดำ-เกือบขาวเสมอ ไม่สลับตามธีม)
 * มีคลัสเตอร์อวตารตกแต่ง + จุดคอนเฟตตีลอย ส่วนวิซาร์ดทั้งก้อนอยู่ใน
 * "บอตทอมชีต" มุมบนโค้งกว้างที่ยกคาบเกี่ยวฉากมืดเล็กน้อย (bg-surface ซึ่ง
 * เป็นขาวในโหมดสว่างและเข้มกว่าพื้นหลังเล็กน้อยในโหมดมืด)
 */

export const metadata: Metadata = {
  title: "ตั้งตี้ใหม่ · PaiGun",
  description: "ตั้งชื่อตี้ เลือกช่วงวันที่เปิดโหวต แล้วส่งลิงก์ให้เพื่อนกรอกวันว่าง",
};

export default async function NewTripPage(): Promise<React.JSX.Element> {
  // ต้องล็อกอินก่อนถึงจะสร้างทริปได้ (ดู createTripAction) — เช็กตั้งแต่ระดับหน้า
  // กันไม่ให้แม้แต่เห็นฟอร์มถ้ายังไม่ได้ล็อกอิน
  const user = await getSessionUser();
  if (user === null) redirect("/login?next=/new");

  return (
    // เดิมพยายามให้ชีตยืดเต็มพื้นที่ด้วย h-full/flex-1 ไล่ตาม <main> ของ layout.tsx
    // แต่ไม่นิ่ง (พึ่งความสูงจริงของ ancestor หลายชั้นที่ไม่ได้ตั้งใจให้ยืดแบบนี้)
    // และไม่ได้แก้ปัญหาจริงที่ถูกทักมา: "เป็นบอตทอมชีตแต่หน้ายังเลื่อนรวมทั้งหน้า
    // เหมือนเดิม" — ของจริง (iOS/Android bottom sheet) ฉากบนอยู่นิ่ง ส่วนชีตคือ
    // เนื้อหาที่เลื่อนผ่านมันไป จึงเปลี่ยนมาใช้ `sticky` กับฉากบนแทน: ทำงานถูกต้อง
    // ที่ทุกความสูงจอโดยไม่ต้องคำนวณความสูงเอง (responsive โดยไม่ต้องทำอะไรเพิ่ม)
    // ตอนเนื้อหาสั้นกว่าจอ ฉากบนอยู่ตำแหน่งเดิมเป๊ะเหมือนไม่มี sticky เลย
    // ตอนเนื้อหายาวกว่าจอ (ขั้น 3 มีชื่อเพื่อนเยอะ) เลื่อนแล้วฉากบนจะ "ค้าง" ติดขอบบน
    // ส่วนชีตเลื่อนผ่านมันไปเหมือนบอตทอมชีตจริง ๆ
    <main className="mx-auto w-full max-w-[560px] pb-28 md:max-w-[680px]">
      <BackButton className="-ml-3 mb-1" />
      {/* -mx ชดเชย padding ของ <main> ใน layout.tsx (px-4 md:px-8) ให้ฉากมืด
          เต็มขอบจอจริง ๆ เหมือนงานอ้างอิง ไม่ใช่แค่เต็มขอบคอลัมน์เนื้อหา
          sticky top-0 ต้องไม่มี ancestor ไหนใน chain นี้ตั้ง overflow: hidden/scroll
          ไว้ ไม่งั้น sticky จะอ้างอิงกับ ancestor นั้นแทนวิวพอร์ตจริง — เช็คแล้วไม่มี */}
      <header className="sticky top-0 z-10 -mx-4 overflow-hidden bg-ink-fixed px-4 pt-8 pb-14 md:-mx-8 md:px-8 md:pt-12 md:pb-16">
        <FloatingDots />
        {/* คลัสเตอร์อวตารตกแต่งอย่างเดียว ไม่ใช่ข้อมูลทริปจริง — ตั้งใจใช้ชื่อคงที่
            (ไม่ใช่ชื่อเพื่อนที่ผู้ใช้กรอก) เพราะ Avatar เลือกรูปจาก hash ของชื่อ
            ต้องได้ผลเดิมทุกครั้งทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์กัน hydration mismatch */}
        <div aria-hidden="true" className="relative flex justify-center pb-9">
          <div className="flex -space-x-5">
            <Avatar name="เอ" size={56} className="ring-4 ring-ink-fixed" />
            <Avatar name="บี" size={68} className="z-10 ring-4 ring-ink-fixed" />
            <Avatar name="ซี" size={56} className="ring-4 ring-ink-fixed" />
          </div>
          {/* bottom-0 (ไม่ใช่ค่าติดลบ) กันไม่ให้แคปซูลยื่นเลย padding ของกล่องนี้
              ลงไปทับหัวข้อ h1 ที่ตามมา — เคยเกิดปัญหาตัวหนังสือทับกันมาแล้วรอบหนึ่ง */}
          <span className="absolute bottom-0 left-1/2 z-20 -translate-x-1/2">
            <Pill tone="fixed-dark" className="shadow-sm">
              @{user.username}
            </Pill>
          </span>
        </div>
        <h1 className="relative mt-2 text-center font-display text-[1.75rem] font-bold tracking-tight text-on-ink-fixed md:text-[2.15rem]">
          ตั้งตี้ใหม่
        </h1>
        <p className="relative pt-1 text-center text-[14px] leading-relaxed text-on-ink-fixed/75 md:text-[15px]">
          ตอบสามคำถามสั้น ๆ แล้วได้ลิงก์ไปส่งในกลุ่มเลย เพื่อนกรอกวันว่างไม่ต้องสมัครอะไร
        </p>
      </header>

      {/* บอตทอมชีต — เต็มขอบจอเหมือนฉากมืดด้านบน (ใช้ -mx ชดเชย padding เดียวกัน)
          มุมบนโค้งกว้างแบบงานอ้างอิง ยกขึ้นคาบเกี่ยวฉากมืดด้านบนเล็กน้อยให้เห็นขอบโค้งลอยเด่น
          z-0 ให้อยู่ใต้ฉากบนตอน sticky ค้าง (กันรอยต่อโผล่ทับฉากบนตอนเลื่อน)
          pb ท้ายชีตกันปุ่มสุดท้าย ("ต่อไป") ไปชิดขอบล่างเกินไป */}
      <div className="relative z-0 -mx-4 -mt-6 rounded-t-[2.5rem] bg-surface px-4 pt-6 pb-10 md:-mx-8 md:-mt-8 md:px-8 md:pt-8 md:pb-14 md:rounded-t-[3rem]">
        <CreateTripForm />
      </div>
    </main>
  );
}
