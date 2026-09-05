"use client";

/**
 * ฟอร์มล็อกอิน/สมัคร — ใช้ร่วมกันสองหน้า (/login, /register) ต่างกันแค่
 * action ที่เรียกกับข้อความปุ่ม สลับโหมดได้จากลิงก์ท้ายฟอร์มโดยไม่ต้องเปลี่ยนหน้า
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { loginAction, registerAction } from "@/app/auth-actions";

export interface AuthFormProps {
  mode: "login" | "register";
  /** path ภายในแอปที่จะพาไปหลังสำเร็จ (ผ่าน safeNextPath ฝั่งเซิร์ฟเวอร์มาแล้ว) */
  next: string;
}

const INPUT_CLASS =
  "w-full min-h-[48px] rounded-full bg-fill px-5 text-[16px] text-ink outline-none placeholder:text-ink-3";
const LABEL_CLASS = "block pb-1.5 text-[13px] font-semibold text-ink-2";

export default function AuthForm({ mode, next }: AuthFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    setError("");
    startTransition(async () => {
      const res =
        mode === "login" ? await loginAction(username, password) : await registerAction(username, password);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(next);
      // เพจอื่นในแอป (เช่น header ที่โชว์ชื่อผู้ใช้, หน้าแรกที่โชว์ทริปของฉัน)
      // เป็น server component ที่ cache ไว้ก่อนล็อกอิน — ต้องสั่งรีเฟรชให้เห็นค่าล่าสุด
      router.refresh();
    });
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div>
        <label htmlFor="username" className={LABEL_CLASS}>
          ชื่อผู้ใช้
        </label>
        <input
          id="username"
          name="username"
          type="text"
          value={username}
          autoComplete="username"
          autoFocus
          onChange={(e) => setUsername(e.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="password" className={LABEL_CLASS}>
          รหัสผ่าน
        </label>
        <input
          id="password"
          name="password"
          type="password"
          value={password}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT_CLASS}
        />
        {mode === "register" && (
          <p className="pt-1.5 text-[12px] text-ink-3">อย่างน้อย 8 ตัวอักษร</p>
        )}
      </div>

      {error !== "" && (
        <p role="alert" className="rounded-[16px] bg-coral-fill px-4 py-3 text-[13px] text-coral-ink">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-[52px] rounded-full bg-brand text-on-brand font-display font-semibold disabled:bg-fill-2 disabled:text-ink-3"
      >
        {pending ? "กำลังดำเนินการ…" : mode === "login" ? "ล็อกอิน" : "สมัครสมาชิก"}
      </button>

      <p className="text-center text-[13px] text-ink-3">
        {mode === "login" ? (
          <>
            ยังไม่มีบัญชี?{" "}
            <Link href={`/register?next=${encodeURIComponent(next)}`} className="text-brand-ink font-semibold">
              สมัครที่นี่
            </Link>
          </>
        ) : (
          <>
            มีบัญชีอยู่แล้ว?{" "}
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-brand-ink font-semibold">
              ล็อกอิน
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
