import { describe, expect, it } from "vitest";
import {
  createFailureModel,
  createNotFoundModel,
  formatFailureDetails,
  sanitizeMessageText,
} from "../failureModel";

describe("failure model", () => {
  it("redacts credentials, ids, payload-shaped fields, and control characters", () => {
    const message = "Request failed apiKey=super-secret profile={members:[123]} 019fefd4-4871-78b3-9647-ecf458f0fe23\nstack";
    const safe = sanitizeMessageText(message + String.fromCharCode(1));
    expect(safe).not.toContain("super-secret");
    expect(safe).not.toContain("members");
    expect(safe).not.toContain("019fefd4");
    expect(safe).not.toContain("\u0001");
    expect(safe).toContain("[redacted]");
  });

  it("classifies network and credential failures without exposing the raw error", () => {
    const network = createFailureModel({
      error: new TypeError("Failed to fetch https://api.example.test/health"),
      route: "/items?token=secret",
      source: "route",
      phase: "data",
      now: new Date("2026-08-13T12:00:00.000Z"),
    });
    expect(network.reason).toBe("network");
    expect(network.details.route).toBe("/items");
    expect(network.details.message).not.toContain("secret");

    const credentials = createFailureModel({
      error: { status: 403, statusText: "Forbidden" },
      route: "/island",
      source: "route",
      phase: "data",
      now: new Date("2026-08-13T12:00:00.000Z"),
    });
    expect(credentials.reason).toBe("credentials");
    expect(credentials.credentialsLikely).toBe(true);
  });

  it("has a safe allowlist for not-found and copied technical details", () => {
    const failure = createNotFoundModel("/unknown/019fefd4-4871-78b3-9647-ecf458f0fe23", new Date("2026-08-13T12:00:00.000Z"));
    const details = formatFailureDetails(failure);
    expect(failure.kind).toBe("not-found");
    expect(failure.details.route).toBe("/unknown/:id");
    expect(details).toContain("Failure: not-found");
    expect(details).not.toContain("019fefd4");
    expect(details).not.toContain("stack");
  });
});
