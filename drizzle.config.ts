import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit รันนอก Next.js จึงไม่โหลด .env.local ให้อัตโนมัติเหมือน `next dev`
config({ path: ".env.local" });

// `generate` แค่อ่าน schema ไม่ต่อ DB จริง จึงไม่บังคับ DATABASE_URL ตรงนี้
// ส่วน `migrate` ต้องมีค่าจริงถึงจะรันได้ — ถ้าไม่มีจะ error ตอนนั้นแทน (ข้อความจาก drizzle-kit เอง)
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
