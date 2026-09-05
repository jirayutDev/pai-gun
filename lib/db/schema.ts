/**
 * PaiGun — Drizzle schema (Neon Postgres)
 *
 * ตารางแมปตรงกับชนิดข้อมูลใน lib/types.ts:
 *   trips <-> Trip, participants <-> Participant, availability <-> Participant.days
 *   crews / crew_members เตรียมไว้สำหรับ Crew (ยังไม่มีหน้าจอใช้งาน)
 *
 * กฎที่ต้องคงไว้: วันที่ (rangeStart/rangeEnd/lockedStart/availability.day) เป็น
 * Postgres `date` (mode "string") ล้วน ไม่ใช้ timestamp — เพื่อคง "YYYY-MM-DD"
 * ไม่มีโซนเวลาตามที่ตกลงไว้ทั้งระบบ
 */

import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  /** ใช้ล็อกอิน — เก็บคู่กับ usernameKey (พิมพ์เล็กล้วน) เพื่อกันชนกันแค่ตัวพิมพ์ต่าง */
  username: text("username").notNull(),
  usernameKey: text("username_key").notNull().unique(),
  /** ผลลัพธ์ของ hashPassword() ใน lib/auth/password.ts — "salt:hash" hex ล้วน */
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const sessions = pgTable(
  "sessions",
  {
    /**
     * เก็บ "แฮชของ token" ไม่ใช่ token ตรง ๆ (เหมือนรหัสผ่าน) — คุกกี้ในเบราว์เซอร์
     * ถือ token ดิบ ถ้า DB รั่วออกไป คนร้ายเอาแถวนี้ไปสวมรอย session ต่อไม่ได้ทันที
     * ดู lib/auth/session.ts
     */
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    /** เจ้าของทริป — ต้องล็อกอินก่อนถึงสร้าง/ยกเลิก/แก้ทริปได้ (แทน adminKey เดิมทั้งหมด) */
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    note: text("note").notNull().default(""),
    rangeStart: date("range_start", { mode: "string" }).notNull(),
    rangeEnd: date("range_end", { mode: "string" }).notNull(),
    lengthDays: integer("length_days").notNull(),
    /**
     * ปิดโพล — null = ไม่กำหนด
     *
     * ตั้งใจ "ไม่" ใช้ mode:"string" สำหรับคอลัมน์เวลา (ต่างจากคอลัมน์วันที่ล้วนด้านบน)
     * เพราะ driver คืนค่า timestamptz เป็นข้อความรูปแบบของ Postgres เอง
     * (เช่น "2026-09-05 10:00:00+00") ไม่ใช่ ISO8601 ที่แอปใช้ทุกที่ ("...T...Z")
     * จึงให้ drizzle คืนเป็น `Date` แล้วชั้น store แปลงเป็น `.toISOString()` เองทีเดียว
     * ที่จุดประกอบ Trip — ผลลัพธ์จึงเป็น ISO8601 เดียวกับที่แอปเคยได้จากไฟล์ JSON เสมอ
     */
    deadline: timestamp("deadline", { withTimezone: true }),
    status: text("status", { enum: ["polling", "locked", "done", "cancelled"] })
      .notNull()
      .default("polling"),
    lockedStart: date("locked_start", { mode: "string" }),
    allowSelfJoin: boolean("allow_self_join").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    /**
     * ใช้ทำ optimistic concurrency ใน updateTrip (lib/store.ts) — ไม่ใช่ข้อมูลของแอป
     * จึงไม่ปรากฏใน `Trip` ที่ lib/types.ts เลย ดูเหตุผลเต็มที่ persistTrip ใน store.ts
     */
    version: integer("version").notNull().default(0),
  },
  (t) => [index("trips_owner_id_idx").on(t.ownerId)],
);

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** ลิงก์ส่วนตัว — เทียบด้วย secretEquals เท่านั้น ห้าม `===` */
    token: text("token").notNull(),
    isKey: boolean("is_key").notNull().default(false),
    rsvp: text("rsvp", { enum: ["going", "maybe", "out"] }),
    plusOnes: integer("plus_ones").notNull().default(0),
    /** ดูหมายเหตุเรื่อง mode ที่คอลัมน์ deadline ของตาราง trips ด้านบน */
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("participants_trip_id_idx").on(t.tripId)],
);

export const availability = pgTable(
  "availability",
  {
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    /** "YYYY-MM-DD" ล้วน — ห้ามเปลี่ยนเป็น timestamptz */
    day: date("day", { mode: "string" }).notNull(),
    value: smallint("value").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.participantId, t.day] }),
    index("availability_participant_id_idx").on(t.participantId),
  ],
);

/* ------------------------------------------------------------------ *
 * Crew — โครงเตรียมไว้ตาม lib/types.ts (Crew / CrewMember) ยังไม่มีหน้าจอ
 * ------------------------------------------------------------------ */

export const crews = pgTable("crews", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  ownerKey: text("owner_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const crewMembers = pgTable(
  "crew_members",
  {
    id: uuid("id").primaryKey(),
    crewId: uuid("crew_id")
      .notNull()
      .references(() => crews.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isKey: boolean("is_key").notNull().default(false),
  },
  (t) => [index("crew_members_crew_id_idx").on(t.crewId)],
);
