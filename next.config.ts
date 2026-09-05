import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // เก็บ store ไฟล์ไว้ใน .data/ ตอน dev — ดู lib/store.ts
  },
};

export default nextConfig;
