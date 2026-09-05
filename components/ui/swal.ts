"use client";

/**
 * ครอบ SweetAlert2 ให้หน้าตาเข้ากับธีมของแอป (ใช้ CSS custom property ตรง ๆ
 * จาก globals.css เพื่อให้ตามสลับ light/dark อัตโนมัติเหมือนส่วนอื่นของแอป)
 *
 * ใช้แทน window.confirm()/window.alert() ของเบราว์เซอร์ (หน้าตาเป็นของระบบ
 * ปฏิบัติการ ปรับสไตล์ไม่ได้เลย ไม่เข้ากับแอป) และแทน error ที่โผล่แค่ใน console
 * ซึ่งคนใช้จริงมองไม่เห็น — ทุก error ที่คนต้องรู้ต้องมี toast ให้เห็นชัดเจน
 */

import Swal from "sweetalert2";

const modalBase = Swal.mixin({
  background: "var(--surface)",
  color: "var(--ink)",
  buttonsStyling: true,
  reverseButtons: true,
  customClass: {
    popup: "font-body rounded-[24px]",
    confirmButton: "font-display font-semibold",
    cancelButton: "font-display font-semibold",
  },
});

const toastBase = Swal.mixin({
  toast: true,
  position: "top",
  showConfirmButton: false,
  timer: 3500,
  timerProgressBar: true,
  customClass: {
    popup: "font-body rounded-[18px]",
  },
});

export interface ConfirmOptions {
  title: string;
  text?: string;
  confirmText: string;
  cancelText?: string;
  /** true = ปุ่มยืนยันเป็นสีคอรัล (การกระทำที่ย้อนกลับไม่ได้/กระทบคนอื่น) */
  danger?: boolean;
}

/** โมดัลยืนยันแทน window.confirm() — คืน true ถ้ากดยืนยัน */
export async function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  const res = await modalBase.fire({
    title: opts.title,
    text: opts.text,
    icon: opts.danger ? "warning" : undefined,
    showCancelButton: true,
    confirmButtonText: opts.confirmText,
    cancelButtonText: opts.cancelText ?? "ยกเลิก",
    confirmButtonColor: opts.danger ? "var(--coral)" : "var(--brand)",
    cancelButtonColor: "var(--fill-2)",
  });
  return res.isConfirmed;
}

/** toast แจ้ง error สั้น ๆ มุมบนจอ — ใช้แทนข้อความที่เคยโผล่แค่ใน console */
export function toastError(message: string): void {
  void toastBase.fire({
    icon: "error",
    title: message,
    background: "var(--coral-fill)",
    color: "var(--coral-ink)",
  });
}

/** toast แจ้งสำเร็จสั้น ๆ มุมบนจอ */
export function toastSuccess(message: string): void {
  void toastBase.fire({
    icon: "success",
    title: message,
    background: "var(--mint-fill)",
    color: "var(--mint-ink)",
  });
}
