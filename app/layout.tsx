import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import "sweetalert2/dist/sweetalert2.min.css";

import { destroySession, getSessionUser } from "@/lib/auth/session";

/**
 * ฟอนต์: Anuphan (หัวเรื่อง) · IBM Plex Sans Thai (เนื้อความ) · IBM Plex Mono (ตัวเลข)
 *
 * โหลดด้วย <link> ตรง ๆ ไม่ใช้ next/font/google โดยตั้งใจ
 * เหตุผล: next/font ดึงไฟล์ฟอนต์ตอน build ถ้าเครื่องที่ build เข้า fonts.googleapis.com
 * ไม่ได้ (หลังพร็อกซี, ออฟไลน์, หรือ Google ล่มตอน deploy) build จะล้มทั้งงาน
 * แลกกับการเสีย self-hosting ไปเล็กน้อย แต่ได้ build ที่ไม่พึ่งเน็ต
 *
 * ถ้าอยาก self-host ทีหลัง: ดาวน์โหลด woff2 ใส่ /public/fonts แล้วใช้ next/font/local
 * (ชื่อ family ใน globals.css ไม่ต้องแก้ เพราะอ้างชื่อ family ตรง ๆ อยู่แล้ว)
 */
const FONT_CSS =
  "https://fonts.googleapis.com/css2" +
  "?family=Anuphan:wght@400;500;600;700" +
  "&family=IBM+Plex+Sans+Thai:wght@400;500;600" +
  "&family=IBM+Plex+Mono:wght@400;500" +
  "&display=swap";

export const metadata: Metadata = {
  title: {
    default: "PaiGun · นัดวันเที่ยวให้ลงตัว",
    template: "%s · PaiGun",
  },
  description:
    "โหวตหาวันว่างร่วมของกลุ่มเพื่อน คิดเป็นช่วงวันติดกัน ไม่ใช่วันเดี่ยว ๆ ระบายนิ้วทาบทีเดียวจบ เพื่อนกรอกวันว่างไม่ต้องสมัครสมาชิก",
  applicationName: "PaiGun",
};

/** ผู้ใช้เกือบทั้งหมดอยู่บนมือถือและไอแพด */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // ไม่ล็อก maximumScale เพราะคนสายตาไม่ดีต้องซูมได้
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8ff" },
    { media: "(prefers-color-scheme: dark)", color: "#120e24" },
  ],
};

/**
 * server action แบบฝังในตัว (inline "use server") ใช้เป็น action ของฟอร์มออกจากระบบ
 * ตรง ๆ ไม่ต้องมี client component ครอบ — คืน void เพราะ <form action> ต้องการแค่นี้
 * ต่างจาก loginAction/registerAction ที่ต้องคืนผลลัพธ์ให้ client อ่านสถานะ error
 */
async function logout(): Promise<void> {
  "use server";
  await destroySession();
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();

  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONT_CSS} />
      </head>
      <body className="font-body">
        <div className="min-h-dvh flex flex-col">
          <header className="px-4 md:px-8 pt-5 pb-3 flex items-center justify-between gap-3">
            <Link
              href="/"
              className="font-display font-bold text-[1.15rem] tracking-tight text-ink inline-flex items-center gap-2"
            >
              <span
                aria-hidden="true"
                className="w-7 h-7 rounded-[9px] bg-brand text-on-brand grid place-items-center text-[0.78rem] font-mono"
              >
                ไป
              </span>
              PaiGun
            </Link>

            {/* ล็อกอินอยู่ = โชว์ชื่อ + ปุ่มออกจากระบบ (server action ตรง ๆ ไม่ต้องมี
                client component) ยังไม่ล็อกอิน = ลิงก์ไปหน้าล็อกอิน */}
            {user !== null ? (
              <form action={logout} className="flex items-center gap-2">
                <span className="text-[0.8rem] text-ink-3 hidden sm:inline">@{user.username}</span>
                <button
                  type="submit"
                  className="min-h-[36px] px-3 rounded-full bg-fill text-ink-2 text-[0.8rem] font-medium"
                >
                  ออกจากระบบ
                </button>
              </form>
            ) : (
              <Link
                href="/login"
                className="min-h-[36px] px-3 rounded-full bg-fill text-ink-2 text-[0.8rem] font-medium inline-flex items-center"
              >
                ล็อกอินเจ้าภาพ
              </Link>
            )}
          </header>

          <main className="flex-1 px-4 md:px-8 pb-16">{children}</main>

          <footer className="px-4 md:px-8 py-6 text-[0.75rem] text-ink-3">
            PaiGun · นัดวันเที่ยวให้ลงตัว · เพื่อนกรอกวันว่างไม่ต้องสมัครสมาชิก
          </footer>
        </div>
      </body>
    </html>
  );
}
