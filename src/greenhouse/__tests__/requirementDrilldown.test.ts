import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = readFileSync(resolve(process.cwd(), "src/greenhouse/GreenhouseWorkspace.tsx"), "utf8");

describe("greenhouse mutation requirement summary", () => {
  it("shows holdings while keeping directly requested production outstanding", () => {
    expect(workspace).toContain("{mutationNeeds.map((need) => {");
    expect(workspace).toContain("need.missing === 0 ? \"greenhouse-need-row is-covered\"");
    expect(workspace).toContain("{need.missing > 0 && (");
    expect(workspace).toContain("directGoalMutations.has(id)");
    expect(workspace).toContain("goalWorkRemaining(");
    expect(workspace).not.toContain("target.qty - Math.floor(targetHolding.count)");
    expect(workspace).toContain('aria-label={`Open the growing plan for ${need.name}`}');
    expect(workspace).toContain('"Not found in captured storage"');
  });

  it("moves a missing requirement into a separate phase breakdown", () => {
    expect(workspace).toContain("openRequirementDetail(need.id)");
    expect(workspace).toContain('label: `Phase ${cycle.index + 1}`');
    expect(workspace).toContain('className="greenhouse-requirement-detail-groups"');
    expect(workspace).toContain('scrollIntoView({ block: "start", behavior: "smooth" })');
  });
});
