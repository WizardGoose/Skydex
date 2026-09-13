import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ItemTooltipContent, ItemTooltipInlineItem } from "../ItemTooltip";
import { itemStatsFromRecord, parseMinecraftText, positionItemTooltip, positionItemTooltipAtPointer, prepareItemLore, shouldInterceptTooltipClick, tooltipSurfacePointerEvents } from "../itemTooltipModel";
import { wikiArticleUrl } from "../wikiUrl";

describe("ItemTooltip", () => {
  it("uses base game lore for catalogue items while preserving captured and domain detail", async () => {
    const { loadItemLore } = await import("../../items/itemLore");
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      internalname: "TOOLTIP_LORE_TEST", displayname: "§aTest item", lore: ["§7Base game effect", "§a§lUNCOMMON ACCESSORY"],
    })));
    try {
      await loadItemLore("TOOLTIP_LORE_TEST");
      const props = { id: "TOOLTIP_LORE_TEST", name: "Test item", tier: "UNCOMMON" };
      const generic = renderToStaticMarkup(<ItemTooltipContent {...props} stats={[{ label: "Generic stat", value: "+1" }]} />);
      expect(generic).toContain("Base game effect");
      expect(generic).toContain("UNCOMMON ACCESSORY");
      expect(generic).not.toContain("Generic stat");
      const captured = renderToStaticMarkup(<ItemTooltipContent {...props} lore={["§6Captured upgrades"]} />);
      expect(captured).toContain("Captured upgrades");
      expect(captured).not.toContain("Base game effect");
      const domain = renderToStaticMarkup(<ItemTooltipContent {...props} sections={[{ lines: ["Exact entity effect"] }]} />);
      expect(domain).toContain("Exact entity effect");
      expect(domain).not.toContain("Base game effect");
    } finally { fetcher.mockRestore(); }
  });

  it("keeps detailed sections out of passive hover and available after pinning", () => {
    const render = (surfacePinned: boolean) => renderToStaticMarkup(<ItemTooltipContent name="Harpy Shard" surfacePinned={surfacePinned}
      sections={[{ title: "Tree Lurker", lines: ["Attribute effect"] }, { title: "Acquisition", collapsible: true, lines: ["Catch with Pocket Black Hole."] }]}
      skyDexSections={[{ title: "Rate assumptions", collapsible: true, lines: ["Uses captured equipment."] }]} />);
    expect(render(false)).toContain("Attribute effect");
    expect(render(false)).not.toContain("Acquisition");
    expect(render(false)).not.toContain("Rate assumptions");
    expect(render(true)).toContain("Catch with Pocket Black Hole.");
    expect(render(true)).toContain("Uses captured equipment.");
    expect(render(true)).toContain("<summary");
  });

  it("keeps the Hypixel hierarchy ahead of neutral item metadata", () => {
    const html = renderToStaticMarkup(<ItemTooltipContent
      id="ROOTED_BLOSSOM_BRACELET" name="Rooted Blossom Bracelet" tier="EPIC" count={1}
      stats={[{label:"Health",value:"+26",tone:"health"}]}
      sections={[{title:"Green Thumb II",tone:"ability",lines:["Grants Farming Fortune."]},{title:"Piece Bonus: Florist",tone:"bonus",lines:["Complete Garden Visitor Offers."]}]}
      interactionCues={["Right-click to equip!"]} soulbound="Co-op Soulbound" obtained="Mar 10, 2024"
      values={[{label:"Item Value",value:"9,681,921 Coins"}]}
      provenance="Hypixel API" />);
    const order = ["Health","Green Thumb II","Piece Bonus: Florist","Right-click to equip!","Co-op Soulbound","Obtained","Item Value","Source","ROOTED_BLOSSOM_BRACELET"].map(text=>html.indexOf(text));
    expect(order.every(index=>index>=0)).toBe(true);
    expect(order).toEqual([...order].sort((a,b)=>a-b));
    expect(html).not.toContain("SkyDex");
    expect(html).toContain('class="text-stat-red">❤ Health</span>');
  });

  it("renders sparse items without invented sections", () => {
    const html = renderToStaticMarkup(<ItemTooltipContent id="COBBLESTONE" name="Cobblestone" count={1}/>);
    expect(html).toContain("Cobblestone");
    expect(html).toContain("https://hypixelskyblock.minecraft.wiki/wiki/Cobblestone");
    expect(html).toContain("COBBLESTONE");
    expect(html).not.toContain("Enchantments");
    expect(html).not.toContain("Obtained");
    expect(html).not.toContain("Coins");
    expect(html).not.toContain("Count");
  });

  it("uses an entity's exact game colour for its tooltip identity", () => {
    const html = renderToStaticMarkup(<ItemTooltipContent
      name="Zombie"
      identityColor="#55ff55"
      metadata={[{ label: "Kills", value: "125" }]}
    />);
    expect(html).toContain('data-identity-color="true"');
    expect(html).toContain('--sd-item-tooltip-accent:#55ff55');
  });

  it("makes the item's actual display name the direct wiki action", () => {
    const html = renderToStaticMarkup(<ItemTooltipContent
      id="RIFT_NECKLACE"
      name="Shiny Rift Necklace"
      wikiName="Rift Necklace"
      tier="MYTHIC"
      tierIsDisplayed
      extra={{ recomb: true }}
      surfacePinned
    />);
    expect(html).toContain("Shiny Rift Necklace");
    expect(html).toContain("https://hypixelskyblock.minecraft.wiki/wiki/Rift_Necklace");
    expect(html).not.toContain("Open article");
    expect(html).toContain("text-rarity-mythic");
    expect(html).not.toContain("text-rarity-divine");
    expect(html).toContain("pointer-events-auto");
  });

  it("renders a compact truthful recipe from shared ingredient data", () => {
    const html = renderToStaticMarkup(<ItemTooltipContent
      id="BLOOD_DONOR_RING"
      name="Blood Donor Ring"
      recipe={{
        yields: 1,
        ingredients: [
          { id: "hemoglass", name: "Hemoglass", qty: 96 },
          { id: "blood_donor_talisman", name: "Blood Donor Talisman", qty: 1 },
        ],
      }}
    />);
    expect(html).toContain("Crafting recipe");
    expect(html).toContain("Hemoglass");
    expect(html).toContain("×96");
    expect(html).toContain("Blood Donor Talisman");
    expect(html).not.toContain("Loading ingredients");
  });

  it("renders pet progress, coloured ability text, and visual related items without nesting tooltips", () => {
    const html = renderToStaticMarkup(<ItemTooltipContent
      name="Frog Pet"
      tier="MYTHIC"
      tierIsDisplayed
      progress={{ label: "XP to max", value: "6.2M / 8.6M", current: 6_200_000, max: 8_600_000 }}
      sections={[
        { title: "Hop", tone: "ability", lines: ["§7Grants §6+80 Foraging Fortune§7."] },
        { title: "Held item", lines: [<ItemTooltipInlineItem id="GREEN_BANDANA" name="Green Bandana" tier="EPIC" key="held" />] },
      ]}
    />);

    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="6200000"');
    expect(html).toContain("width:72.09302325581395%");
    expect(html).toContain("text-stat-gold");
    expect(html).toContain("Green Bandana");
    expect(html).toContain("Green_Bandana.png");
    expect(html).not.toContain("data-item-tooltip-trigger");
  });

  it("removes Hypixel formatting placeholders before building wiki links", () => {
    expect(wikiArticleUrl("%%light_purple%%Rift Necklace"))
      .toBe("https://hypixelskyblock.minecraft.wiki/wiki/Rift_Necklace");
    expect(wikiArticleUrl("§dRift Necklace"))
      .toBe("https://hypixelskyblock.minecraft.wiki/wiki/Rift_Necklace");
    expect(wikiArticleUrl("Rift Necklace"))
      .toBe("https://hypixelskyblock.minecraft.wiki/wiki/Rift_Necklace");
  });

  it("parses Minecraft colours as text spans and extracts the final type line", () => {
    expect(parseMinecraftText("§7Health: §c+26")).toEqual([
      {text:"Health: ",className:"text-slate-300"},
      {text:"+26",className:"text-stat-red"},
    ]);
    expect(prepareItemLore(["§7A real line","","§d§lMYTHIC DUNGEON SWORD"],"MYTHIC")).toEqual({lines:["§7A real line"],typeLine:"MYTHIC DUNGEON SWORD"});
  });

  it("accepts only finite numeric resource stats", () => {
    expect(itemStatsFromRecord({HEALTH:26,FARMING_FORTUNE:33.8,note:"nope",bad:Infinity})).toEqual([
      {label:"Health",value:"+26",tone:"health"},
      {label:"Farming Fortune",value:"+33.8",tone:"fortune"},
    ]);
  });

  it("flips and clamps rich cards inside the viewport", () => {
    const trigger={top:10,left:2,right:42,bottom:50,width:40,height:40};
    expect(positionItemTooltip(trigger,{width:352,height:300},{width:375,height:640})).toMatchObject({placement:"bottom",left:8});
    const tall=positionItemTooltip({...trigger,top:300,bottom:340},{width:352,height:900},{width:375,height:640});
    expect(tall.placement).toBe("top");
    expect(tall.top).toBeGreaterThanOrEqual(8);
    expect(tall.maxHeight).toBeLessThan(900);
  });

  it("prefers a clear side beside dense-grid slots and flips to the other side", () => {
    const center = positionItemTooltip(
      { top:200, left:400, right:440, bottom:240, width:40, height:40 },
      { width:300, height:200 },
      { width:1000, height:800 }
    );
    expect(center).toMatchObject({ placement:"right", left:480 });

    const edge = positionItemTooltip(
      { top:200, left:900, right:940, bottom:240, width:40, height:40 },
      { width:300, height:200 },
      { width:1000, height:800 }
    );
    expect(edge.placement).toBe("left");
    expect(edge.left).toBe(560);
  });

  it("replaces Hypixel private-use stat icons with readable game fallbacks", () => {
    const rendered = parseMinecraftText("§a\uE008 Defense §6\uE051 Farming Fortune §e\uE016 Mining Spread §6\uE025 Treasure Chance §2\uE07E Mythological")
      .map((segment) => segment.text)
      .join("");
    expect(rendered).toBe("❈ Defense ☘ Farming Fortune ▚ Mining Spread ⛃ Treasure Chance ✿ Mythological");
    expect(rendered).not.toMatch(/[\uE000-\uF8FF]/u);
  });

  it("keeps Minecraft-style cursor cards beside the pointer and scrolls tall lore in place", () => {
    expect(positionItemTooltipAtPointer(
      { x:200, y:160 },
      { width:300, height:220 },
      { width:1000, height:800 }
    )).toMatchObject({ placement:"right", left:220, top:140 });

    const edge = positionItemTooltipAtPointer(
      { x:980, y:780 },
      { width:300, height:220 },
      { width:1000, height:800 }
    );
    expect(edge).toMatchObject({ placement:"left", left:660, top:572, maxHeight:220 });
    expect(edge.top + edge.maxHeight).toBeLessThanOrEqual(792);

    const tall = positionItemTooltipAtPointer(
      { x:80, y:255 },
      { width:352, height:900 },
      { width:729, height:958 }
    );
    expect(tall).toMatchObject({ placement:"right", left:100, top:50, maxHeight:900 });
  });

  it("keeps a bottom-edge pointer card entirely inside the visible page", () => {
    const position = positionItemTooltipAtPointer(
      { x:240, y:945 },
      { width:352, height:620 },
      { width:729, height:958 }
    );
    expect(position.top).toBe(330);
    expect(position.maxHeight).toBe(620);
    expect(position.top + position.maxHeight).toBeLessThanOrEqual(950);
  });

  it("clamps a collision-heavy card and preserves truthful hover versus pinned hit testing", () => {
    const crowded = positionItemTooltip(
      { top:300, left:190, right:230, bottom:340, width:40, height:40 },
      { width:350, height:900 },
      { width:400, height:600 }
    );
    expect(["top", "bottom"]).toContain(crowded.placement);
    expect(crowded.left).toBeGreaterThanOrEqual(8);
    expect(crowded.top).toBeGreaterThanOrEqual(8);
    expect(crowded.maxHeight).toBeLessThan(900);

    // Ordinary hover passes through, while a deliberately pinned card becomes
    // a selectable reading surface and blocks misleading hover underneath.
    expect(tooltipSurfacePointerEvents(false)).toBe("none");
    expect(tooltipSurfacePointerEvents(true)).toBe("auto");
    expect(shouldInterceptTooltipClick(true, "mouse")).toBe(false);
    expect(shouldInterceptTooltipClick(true, "touch")).toBe(false);
    expect(shouldInterceptTooltipClick(false, "touch")).toBe(false);
    expect(shouldInterceptTooltipClick(false, "mouse")).toBe(true);
    expect(shouldInterceptTooltipClick(true, null)).toBe(false);
    expect(shouldInterceptTooltipClick(false, null)).toBe(true);
  });});
