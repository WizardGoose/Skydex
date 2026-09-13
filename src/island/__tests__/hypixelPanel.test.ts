import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const panel = readFileSync(resolve(process.cwd(), "src/island/HypixelPanel.tsx"), "utf8");

describe("HypixelPanel hosted connection surface", () => {
  it("asks only for the Minecraft account and explains the Skydex boundary", () => {
    expect(panel).toContain("Minecraft username or UUID");
    expect(panel).toContain("api.skydex.ca");
    expect(panel).toContain("Forget account");
    expect(panel).not.toContain("readExpiry(");
    expect(panel).not.toContain("expiryDateForInstant(");
    expect(panel).not.toContain("Renew key");
    expect(panel).not.toContain("Hypixel keys live for 48 hours");
    expect(panel).not.toContain("A pasted key gets an exact 47-hour stamp");
    expect(panel).not.toContain("sets expiry at midnight");
    expect(panel).not.toContain("your Hypixel rate limit");
    expect(panel).not.toContain("CalendarClock");
  });
});
