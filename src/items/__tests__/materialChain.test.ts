import { describe, expect, it } from "vitest";
import { parseMaterialChainInfobox } from "../materialChain";

describe("material-chain infobox comments", () => {
  it("ignores commented fields and strips inline comments before reading materials", () => {
    const wikitext = `{{Infobox Item
<!-- |mat_cost_bazaar = *999 Wrong Material-->
|mat_cost_bazaar = *160 Ruby Veilshroom<!-- one enchanted item -->
|raw_materials = *25600 Ruby Veilshroom
}}`;

    expect(parseMaterialChainInfobox(wikitext)).toEqual([
      { id: "ruby_veilshroom", name: "Ruby Veilshroom", qty: 160 },
    ]);
  });

  it("keeps every bullet in a multiline material field", () => {
    const wikitext = `{{Infobox Item
|mat_cost_bazaar =
*26912 Sea Lumies
*104 Flexbone
*160 Sturdy Bone
*32 Sublime Silk
*1 Reinforced Netting
|raw_materials = *999 Wrong Material
}}`;

    expect(parseMaterialChainInfobox(wikitext)).toEqual([
      { id: "sea_lumies", name: "Sea Lumies", qty: 26_912 },
      { id: "flexbone", name: "Flexbone", qty: 104 },
      { id: "sturdy_bone", name: "Sturdy Bone", qty: 160 },
      { id: "sublime_silk", name: "Sublime Silk", qty: 32 },
      { id: "reinforced_netting", name: "Reinforced Netting", qty: 1 },
    ]);
  });
});
