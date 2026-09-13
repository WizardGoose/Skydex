import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  chestIsExpanded,
  defaultChestDisclosureState,
  readChestDisclosureState,
  toggleChestDisclosure,
  writeChestDisclosureState,
} from "../storageDisclosure";

const storage = readFileSync(resolve(process.cwd(), "src/pages/StoragePage.tsx"), "utf8");

describe("storage chest disclosure controls", () => {
  it("opens chests by default and supports exact collapse-all and expand-all states", () => {
    expect(storage).toContain("readChestDisclosureState(persistenceScope)");
    expect(storage).toContain("setDisclosure({ openByDefault: false");
    expect(storage).toContain("setDisclosure({ openByDefault: true");
    expect(storage).toContain('className={`storage-disclosure-all ${FOCUS}`}');
    expect(storage).toContain("onClick={anyOpen ? collapseAll : expandAll}");
    expect(storage).toContain('{anyOpen ? "Collapse all" : "Expand all"}');
    expect(storage).toContain("expanded={isExpanded(chestKey(chest))}");
  });

  it("restores each chest state inside the current player and profile scope", () => {
    const values = new Map<string, string>();
    const memory = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const changed = toggleChestDisclosure(defaultChestDisclosureState(), "19:101:29");
    writeChestDisclosureState("player-a:pomegranate", changed, memory);

    const restored = readChestDisclosureState("player-a:pomegranate", memory);
    expect(chestIsExpanded(restored, "19:101:29")).toBe(false);
    expect(chestIsExpanded(restored, "19:100:26")).toBe(true);
    expect(chestIsExpanded(readChestDisclosureState("player-a:pear", memory), "19:101:29")).toBe(true);
  });

  it("falls back to the open default when saved bytes are corrupt", () => {
    const memory = {
      getItem: () => "nope",
      setItem: () => undefined,
    };
    expect(chestIsExpanded(readChestDisclosureState("player:profile", memory), "0:0:0")).toBe(true);
  });

  it("keeps the useful chest totals in the Island Chests heading", () => {
    expect(storage).toContain('className="storage-section-metrics"');
    expect(storage).toContain("summary.occupiedSlots.toLocaleString()");
    expect(storage).toContain("summary.itemTypes.toLocaleString()");
    expect(storage).toContain("summary.itemUnits.toLocaleString()");
  });

  it("gates chest rendering on the connected snapshot identity", () => {
    expect(storage).toContain("checkStorageIdentity(snapshot");
    expect(storage).toContain("const trustedSnapshot = showSnapshot ? snapshot : null;");
    expect(storage).toContain('state: "absent", source: null, at: null');
    expect(storage).toContain("chests={trustedSnapshot.chests}");
  });
});
