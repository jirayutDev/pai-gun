/**
 * PaiGun — ชนิดข้อมูลกลางของทั้งแอป
 *
 * ทุกไฟล์ในโปรเจกต์นี้ใช้ชนิดข้อมูลจากไฟล์นี้เท่านั้น ห้ามประกาศซ้ำที่อื่น
 * วันที่ทุกที่เก็บเป็นสตริง "YYYY-MM-DD" (ไม่มีโซนเวลา) ตามที่ตกลงไว้ในแผน
 */

/** สถานะความว่างของคนหนึ่งในวันหนึ่ง */
export const BUSY = 0;
export const MAYBE = 1;
export const FREE = 2;

/** 0 = ไม่ว่าง, 1 = ว่างถ้าจำเป็น, 2 = ว่าง */
export type AvailState = 0 | 1 | 2;

/** สิ่งที่แปรงระบายสีทาลงไปได้ — null = ล้าง (ยังไม่ระบุ) */
export type Brush = AvailState | null;

/** การยืนยันไปเที่ยว ถามหลังล็อกวันเท่านั้น */
export type Rsvp = "going" | "maybe" | "out" | null;

/** cancelled = เจ้าภาพยกเลิกทริปนี้ (ไม่ลบข้อมูลทิ้ง แค่ปิดไม่ให้แก้/ดูต่อได้ตามปกติ) */
export type TripStatus = "polling" | "locked" | "done" | "cancelled";

/** สมาชิกในกลุ่มที่บันทึกไว้ใช้ซ้ำ */
export interface CrewMember {
  id: string;
  name: string;
  isKey: boolean;
}

export interface Crew {
  id: string;
  name: string;
  ownerKey: string;
  members: CrewMember[];
  createdAt: string;
}

export interface Participant {
  id: string;
  name: string;
  /** ลิงก์ส่วนตัวของคนนี้ — ใช้ยืนยันตัวตนแทนการล็อกอิน */
  token: string;
  /** คนที่ขาดไม่ได้ ถ้าคนนี้ไม่ว่าง ช่วงนั้นถูกตัดออก */
  isKey: boolean;
  /** key ใน AVATAR_FILES ที่เลือกเอง — null = ยังไม่เลือก (คอมโพเนนต์ Avatar จะ hash จากชื่อแทน) */
  avatarKey: string | null;
  /** "YYYY-MM-DD" -> AvailState — วันที่ไม่มีคีย์ถือว่ายังไม่ระบุ */
  days: Record<string, AvailState>;
  rsvp: Rsvp;
  /** พาแฟน/เพื่อนมาเพิ่มกี่คน นับหัวหารเงิน แต่ไม่มีสิทธิ์โหวตแยก */
  plusOnes: number;
  /** null = ยังไม่เคยกดบันทึก (ยังไม่ตอบ) */
  submittedAt: string | null;
  updatedAt: string;
}

/** บัญชีเจ้าภาพ — ต้องล็อกอินก่อนถึงสร้าง/ยกเลิก/แก้ทริปได้ */
export interface User {
  id: string;
  username: string;
  createdAt: string;
}

export interface Trip {
  id: string;
  /** โค้ดสั้นในลิงก์แชร์ /t/[slug] */
  slug: string;
  /** เจ้าของทริป (users.id) — แทน adminKey เดิมทั้งหมด ตรวจผ่าน session ไม่ใช่กุญแจใน URL */
  ownerId: string;
  title: string;
  note: string;
  /** ช่วงวันที่เปิดให้โหวต */
  rangeStart: string;
  rangeEnd: string;
  /** ทริปยาวกี่วันติดกัน */
  lengthDays: number;
  /** ISO timestamp ปิดโพล — null = ไม่กำหนด */
  deadline: string | null;
  status: TripStatus;
  /** วันแรกของช่วงที่ถูกล็อก */
  lockedStart: string | null;
  /** เปิดให้คนเพิ่มชื่อตัวเองจากลิงก์ได้ */
  allowSelfJoin: boolean;
  participants: Participant[];
  createdAt: string;
}

/** ผลของ "ช่วงหนึ่ง" ที่ยาว lengthDays วันติดกัน */
export interface TripWindow {
  /** วันแรกของช่วง "YYYY-MM-DD" */
  start: string;
  /** วันสุดท้ายของช่วง "YYYY-MM-DD" */
  end: string;
  /** ตำแหน่งใน eachDay(rangeStart, rangeEnd) */
  startIndex: number;
  score: number;
  /** คะแนนเต็มที่เป็นไปได้ ใช้แสดงเป็น "7.0 / 8.0" */
  maxScore: number;
  /** ชื่อคนที่ว่างเต็มทั้งช่วง */
  free: string[];
  /** ชื่อคนที่ว่างถ้าจำเป็น */
  maybe: string[];
  /** ชื่อคนที่ไม่ว่างอย่างน้อยหนึ่งวันในช่วง */
  busy: string[];
  /** ชื่อคนที่ยังไม่ระบุอย่างน้อยหนึ่งวันในช่วง (และไม่ได้ติดไม่ว่าง) */
  unknown: string[];
  /** จำนวนวันในช่วงที่เป็นเสาร์ อาทิตย์ หรือวันหยุดราชการ */
  offDays: number;
  /** รายชื่อวันหยุดราชการที่อยู่ในช่วงนี้ เช่น ["วันปิยมหาราช"] */
  holidays: string[];
  /** true = ถูกตัดออกเพราะคนสำคัญไม่ว่าง */
  disqualified: boolean;
  /** ชื่อคนสำคัญที่ทำให้ช่วงนี้ตกไป */
  blockingKeyPeople: string[];
}

export interface RankResult {
  /** ช่วงที่ผ่านเกณฑ์ เรียงดีที่สุดก่อน */
  windows: TripWindow[];
  /** ช่วงที่ถูกตัดเพราะคนสำคัญไม่ว่าง เรียงตามวันที่ */
  disqualified: TripWindow[];
  /** "เกือบได้" — ช่วงที่ผ่านเกณฑ์แต่ติดคนเดียว เรียงดีที่สุดก่อน */
  nearMiss: TripWindow[];
  /** จำนวนคนที่กดบันทึกแล้ว */
  answered: number;
  /** จำนวนคนที่ถูกชวนทั้งหมด */
  invited: number;
  /** ชื่อคนที่ยังไม่ตอบ */
  waitingFor: string[];
}

export interface CreateTripInput {
  /** ผู้ใช้ที่ล็อกอินอยู่ตอนกดสร้าง (จาก session ไม่ใช่ input ของฟอร์ม) */
  ownerId: string;
  title: string;
  note?: string;
  rangeStart: string;
  rangeEnd: string;
  lengthDays: number;
  deadline?: string | null;
  allowSelfJoin: boolean;
  /** ชื่อเล่นเพื่อนที่เจ้าภาพใส่ไว้ล่วงหน้า */
  members: { name: string; isKey: boolean }[];
}
