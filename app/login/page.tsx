import type { Metadata } from "next";
import { redirect } from "next/navigation";

import AuthForm from "@/components/auth-form";
import { getSessionUser, safeNextPath } from "@/lib/auth/session";
import { BackButton } from "@/components/ui/back-button";

export const metadata: Metadata = {
  title: "ล็อกอิน · PaiGun",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);

  // ล็อกอินอยู่แล้ว — ไม่ต้องเห็นฟอร์มซ้ำ พาไปที่ที่ตั้งใจจะไปเลย
  const user = await getSessionUser();
  if (user !== null) redirect(next);

  return (
    <div className="max-w-[24rem] mx-auto pt-4 pb-10">
      <BackButton className="-ml-3 mb-4" />
      <h1 className="font-display font-bold text-[1.9rem] tracking-tight text-center mb-2">
        ล็อกอินเจ้าภาพ
      </h1>
      <p className="text-[0.88rem] text-ink-2 text-center mb-6">
        ต้องล็อกอินก่อนถึงจะสร้าง/ยกเลิก/แก้ทริปได้ — เพื่อนที่กรอกวันว่างไม่ต้องมีบัญชี
      </p>
      <AuthForm mode="login" next={next} />
    </div>
  );
}
