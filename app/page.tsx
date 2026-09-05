import Link from "next/link";
import MyTrips from "@/components/my-trips";
import { FloatingDots } from "@/components/ui/floating-dots";
import { getSessionUser } from "@/lib/auth/session";
import { listTripsByOwner } from "@/lib/store";

export default async function Home() {
  const user = await getSessionUser();
  const hostedTrips = user
    ? (await listTripsByOwner(user.id)).map((t) => ({
        slug: t.slug,
        title: t.title,
        createdAt: t.createdAt,
      }))
    : [];

  return (
    <div className="max-w-[34rem] mx-auto">
      {/* relative + overflow-hidden ให้จุดคอนเฟตตีลอยอิงตำแหน่งกับส่วนนี้ (inset-0)
          และไม่ล้นออกไปนอกส่วนหัว — ห่อเนื้อหาเดิมด้วย div ที่ position: relative
          อีกชั้น เพื่อให้มันวาดทับจุดลอยที่อยู่ก่อนหน้าใน DOM เสมอ (อ่านง่ายกว่าใส่
          relative แยกทีละ element) */}
      <section className="relative overflow-hidden pt-6">
        <FloatingDots />
        <div className="relative">
          <div className="flex flex-wrap gap-2">
            <span className="bg-brand-fill text-brand-ink text-[0.78rem] font-medium px-3 py-1.5 rounded-full">
              เพื่อนกรอกวันว่างไม่ต้องสมัคร
            </span>
            <span className="bg-mint-fill text-mint-ink text-[0.78rem] font-medium px-3 py-1.5 rounded-full">
              ระบายนิ้วทีเดียวจบ
            </span>
          </div>

          <h1 className="font-display font-bold text-[2.6rem] md:text-[3.2rem] leading-[1.05] tracking-[-0.04em] mt-5">
            นัดวันเที่ยว
            <br />
            ให้ลงตัว
          </h1>

          <p className="text-ink-2 mt-4 text-[1.03rem] leading-relaxed">
            PaiGun หาช่วง <strong className="font-medium text-ink">วันติดกัน</strong> ที่เพื่อนว่างมากที่สุด
            ไม่ใช่วันเดี่ยว ๆ เพราะทริปไม่ได้ไปวันเดียว แล้วบอกด้วยว่าถ้าติดใครคนเดียว
            ควรโทรถามใคร
          </p>

          <Link
            href="/new"
            className="mt-6 bg-brand text-on-brand rounded-full min-h-[52px] px-7 font-display font-semibold text-[1rem] inline-flex items-center justify-center w-full md:w-auto"
          >
            ตั้งตี้ใหม่
          </Link>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display font-semibold text-[1.1rem] mb-3">ทริปของฉัน</h2>
        <MyTrips hostedTrips={hostedTrips} />
      </section>

      <section className="relative mt-10 overflow-hidden rounded-[24px]">
        <FloatingDots />
        <div className="relative grid gap-2">
          <h2 className="font-display font-semibold text-[1.1rem] mb-1">ทำงานอย่างไร</h2>

          <div className="bg-surface rounded-[20px] px-4 py-4 flex gap-3">
            <span
              aria-hidden="true"
              className="w-7 h-7 shrink-0 rounded-full bg-brand-fill text-brand-ink grid place-items-center font-display font-bold text-[0.82rem]"
            >
              1
            </span>
            <div>
              <h3 className="font-display font-semibold text-[0.98rem]">ตั้งตี้แล้วแปะลิงก์ในกลุ่ม</h3>
              <p className="text-[0.87rem] text-ink-2">
                เลือกช่วงวันที่ให้โหวต บอกว่าทริปยาวกี่วัน ใส่ชื่อเล่นเพื่อน แล้วก็อปลิงก์ไปวางในกลุ่ม LINE
              </p>
            </div>
          </div>

          <div className="bg-surface rounded-[20px] px-4 py-4 flex gap-3">
            <span
              aria-hidden="true"
              className="w-7 h-7 shrink-0 rounded-full bg-mint-fill text-mint-ink grid place-items-center font-display font-bold text-[0.82rem]"
            >
              2
            </span>
            <div>
              <h3 className="font-display font-semibold text-[0.98rem]">เพื่อนระบายวันว่าง</h3>
              <p className="text-[0.87rem] text-ink-2">
                เลือกสีครั้งเดียวแล้วลากนิ้วทาบ ได้ทั้งสัปดาห์ในหนึ่งลาก หรือกดปุ่มลัด
                ว่างทุกเสาร์-อาทิตย์ ก็จบทั้งเดือน
              </p>
            </div>
          </div>

          <div className="bg-surface rounded-[20px] px-4 py-4 flex gap-3">
            <span
              aria-hidden="true"
              className="w-7 h-7 shrink-0 rounded-full bg-sun-fill text-sun-ink grid place-items-center font-display font-bold text-[0.82rem]"
            >
              3
            </span>
            <div>
              <h3 className="font-display font-semibold text-[0.98rem]">ได้คำตอบพร้อมเหตุผล</h3>
              <p className="text-[0.87rem] text-ink-2">
                เห็นช่วงที่ดีที่สุด ใครว่างใครไม่ว่าง มีวันหยุดราชการให้ไม่ต้องลาไหม
                และช่วงที่เกือบได้แต่ติดคนเดียว
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
