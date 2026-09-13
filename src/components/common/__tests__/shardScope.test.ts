import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const calculator = readFileSync(resolve(process.cwd(), "src/pages/CalculatorPage.tsx"), "utf8");
const calculatorForm = readFileSync(resolve(process.cwd(), "src/components/forms/CalculatorForm.tsx"), "utf8");
const modal = readFileSync(resolve(process.cwd(), "src/components/modals/InventoryManagementModal.tsx"), "utf8");

describe("Shards inventory scope", () => {
  it("keeps generic holdings management off the Shards page", () => {
    expect(calculator).not.toContain("ManagedInventoryPanel");
    expect(calculator).not.toContain("SHARED_HOLDINGS_ITEMS");
    expect(calculator).toContain('title="Shard quantities"');
    expect(calculator).toContain("Edit shard quantities");
    expect(calculatorForm).toContain(">Use Inventory<");
    expect(calculatorForm).toContain(">Materials Only<");
  });

  it("keeps the shard drawer limited to shard quantities and attributes", () => {
    expect(modal).toContain(">Shard quantities</h2>");
    expect(modal).toMatch(/\bShards\b/);
    expect(modal).toMatch(/\bAttributes\b/);
    expect(modal).not.toContain(">Inventory<");
    expect(modal).not.toContain("Manage item holdings");
  });
});
