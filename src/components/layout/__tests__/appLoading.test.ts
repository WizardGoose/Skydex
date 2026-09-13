import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("route loading fallback", () => {
  it("uses the Skydex cyan accent rather than the emerald semantic token", () => {
    expect(app).toContain("border-sky-500/20 border-t-sky-500");
    expect(app).not.toContain("border-emerald-500/20 border-t-emerald-500");
  });
});
