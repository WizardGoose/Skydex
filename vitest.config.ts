import { defineConfig } from "vitest/config";

/**
 * Unit tests for the island data layer.
 *
 * Node environment, no jsdom. Everything under test here is pure data work -
 * gzip, base64url, structural validation, aggregation - and the two web APIs it
 * leans on (`CompressionStream`, `atob`) have been global in Node since 18. A
 * DOM would add seconds to every run and prove nothing extra.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    /*
     * Many solver tests run real searches under WALL-CLOCK budgets, and the
     * whole suite runs those files in parallel. Under that contention several
     * tests sized for an idle machine land at 5.0-5.1s, and vitest's 5s
     * default read each one as a failure - a flake that says nothing about
     * the code (three different files drew it across five gate runs). The
     * honest per-test ceiling is generous; genuinely hung tests still die.
     */
    testTimeout: 30_000,
  },
});
