import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // เทสต์ตรรกะล้วน ไม่ต้องมี DOM
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
