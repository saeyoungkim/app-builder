import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // The suites share one Postgres instance and assert on audit rows.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
