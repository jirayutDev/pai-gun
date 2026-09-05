/**
 * PaiGun — รายชื่อไฟล์อวตาร 3D (ที่มา Microsoft Fluent Emoji, สัญญาอนุญาต MIT)
 * ดู THIRD_PARTY_NOTICES.md สำหรับข้อความสัญญาอนุญาตเต็ม
 *
 * แยกออกมาเป็นไฟล์เปล่า ๆ (ไม่มี "use client", ไม่มี React) โดยตั้งใจ — เพราะทั้ง
 * components/ui/avatar.tsx (client) และ app/actions.ts (server, ตรวจ avatarKey
 * ที่ผู้ใช้ส่งมาว่าอยู่ในรายการนี้จริงไหมก่อนบันทึก) ต้องใช้รายการเดียวกัน
 * ถ้า server action import จากไฟล์ที่มี "use client" จะชนขอบเขต client/server
 * bundle ของ Next โดยไม่จำเป็น
 */
export const AVATAR_FILES = [
  "person-default",
  "person-medium",
  "person-dark",
  "person-light",
  "person-medium-dark",
  "person-medium-light",
  "technologist",
  "artist",
  "student",
  "singer",
  "scientist",
  "astronaut",
  "woman-scientist",
  "woman-technologist",
  "woman-singer",
  "woman-student",
  "woman-pilot",
  "woman-farmer",
  "man-detective",
  "man-firefighter",
  "bear",
  "cat-face",
  "dog-face",
  "koala",
  "lion",
  "alien",
  "alien-monster",
  "ghost",
] as const;

export type AvatarKey = (typeof AVATAR_FILES)[number];

export function isAvatarKey(v: string): v is AvatarKey {
  return (AVATAR_FILES as readonly string[]).includes(v);
}
