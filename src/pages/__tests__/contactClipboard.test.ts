import { describe, expect, it, vi } from "vitest";
import { copyContactValue } from "../ContactPage";

describe("Contact clipboard acknowledgement", () => {
  it("reports success only after the clipboard accepts the handle", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(copyContactValue("campionn", { writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("campionn");
  });

  it("keeps the existing silent failure path when the clipboard rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));

    await expect(copyContactValue("xkapy", { writeText })).resolves.toBe(false);
    expect(writeText).toHaveBeenCalledWith("xkapy");
  });
});
