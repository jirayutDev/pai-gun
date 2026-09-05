import type { Metadata } from "next";
import { redirect } from "next/navigation";

import AuthForm from "@/components/auth-form";
import { getSessionUser, safeNextPath } from "@/lib/auth/session";
import { BackButton } from "@/components/ui/back-button";

export const metadata: Metadata = {
  title: "สมัครสมาชิก · PaiGun",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RegisterPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);

  const user = await getSessionUser();
  if (user !== null) redirect(next);

  return (
    <div className="max-w-[24rem] mx-auto pt-4 pb-10">
      <BackButton className="-ml-3 mb-4" />
      <h1 className="font-display font-bold text-[1.9rem] tracking-tight text-center mb-2">
        สมัครบัญชีเจ้าภาพ
      </h1>
      <p className="text-[0.88rem] text-ink-2 text-center mb-6">
        ใช้สร้าง/ยกเลิก/แก้ทริปที่คุณเป็นเจ้าภาพเท่านั้น — เพื่อนที่กรอกวันว่างไม่ต้องมีบัญชี
      </p>
      <AuthForm mode="register" next={next} />
    </div>
  );
}
