import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StorageSelector } from "../../../island/StorageSelector";
import { InventoryHoldingsDrawer } from "../InventoryHoldingsDrawer";

describe("shared holdings manager", () => {
  it("opens the item-holdings experience and never the shard/attributes tab editor", () => {
    const drawerSource = readFileSync(resolve(process.cwd(), "src/components/common/InventoryHoldingsDrawer.tsx"), "utf8");
    expect(drawerSource).toContain('import { createPortal } from "react-dom"');
    expect(drawerSource).toContain("createPortal(drawer, document.body)");

    const markup = renderToStaticMarkup(
      <InventoryHoldingsDrawer open items={{}} onClose={() => undefined} />
    );
    expect(markup).toContain(">Inventory<");
    expect(markup).toContain("Use in planners");
    expect(markup).toContain("storage-tab-inventory");
    expect(markup).toContain("text-cyan-300");
    expect(markup).toContain("focus-visible:ring-cyan-300/90");
    expect(markup).toContain("accent-cyan-400");
    expect(markup).not.toContain("accent-emerald-400");
    expect(markup).not.toContain("Manage Inventory");
    expect(markup).not.toContain(">Shards<");
    expect(markup).not.toContain(">Attributes<");
  });

  it("keeps one planner holdings surface and cyan selector focus", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/common/ManagedInventoryPanel.tsx"), "utf8");
    expect(source).not.toContain("Manage Inventory");
    expect(source).toContain('label="Use inventory"');
    expect(source).toContain("headerExtra");
    const plannerSource = readFileSync(resolve(process.cwd(), "src/greenhouse/pages/PlannerPage.tsx"), "utf8");
    expect(plannerSource).toContain("focus:border-cyan-500");
    expect(plannerSource).not.toContain("focus:border-emerald-500");

    const markup = renderToStaticMarkup(
      <StorageSelector
        items={[
          {
            id: "inventory",
            label: "Inventory",
            summary: "Captured",
            state: "captured",
            icon: { name: "Chest", id: "CHEST" },
          },
        ]}
        active="inventory"
        onSelect={() => undefined}
        panelId="planner-storage-panel"
        ariaLabel="Planner holdings sources"
      />
    );
    expect(markup).toContain("focus-visible:ring-cyan-300/90");
    expect(markup).toContain("border-cyan-400/45");
    expect(markup).not.toContain("border-emerald-400/45");
  });

  it("keeps holdings management off Recipes and starts Forge holdings compact", () => {
    const crafting = readFileSync(resolve(process.cwd(), "src/pages/ItemsPage.tsx"), "utf8");
    const forge = readFileSync(resolve(process.cwd(), "src/pages/ForgePage.tsx"), "utf8");
    expect(crafting).not.toContain("ManagedInventoryPanel");
    expect(forge).toMatch(/<ManagedInventoryPanel\s+items=\{itemIndex\}\s+defaultOpen=\{false\}/);
  });
});
