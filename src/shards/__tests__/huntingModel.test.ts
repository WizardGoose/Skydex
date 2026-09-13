import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CALCULATION_PARAMS as defaults } from "../../constants";
import { CalculationService } from "../../services/calculationService";
import { applyHuntingAttributes, emptyHuntingEquipment, huntingItemStats, summarizeHuntingEquipment, type HuntingEquipment, type HuntingFishingSetup } from "../huntingEquipment";
import { acquisitionEstimateSections } from "../huntingEstimateContext";
import { blackHoleSeconds, estimateAcquisition, fishingCastSeconds, preparationSeconds } from "../huntingModel";
import type { MemberLoadouts } from "../../networth/parseItems";
import type { RawItem } from "../../networth/types";
import type { Shard } from "../../types/types";

const fusion = JSON.parse(readFileSync("public/fusion-data.json", "utf8"));
const rates = JSON.parse(readFileSync("public/rates.json", "utf8"));
const shard = (key: string): Shard => ({ ...fusion.shards[key], id: key });
const stats = () => emptyHuntingEquipment().combatStats;
const loadouts: MemberLoadouts = { armorSets: [], equipmentSets: [], wornEquipment: [null, null, null, null], loadouts: [], equippedArmorSetId: null, equippedEquipmentSetId: null };
const item = (name: string, lore: string[] = [], id = name.toUpperCase().replaceAll(" ", "_")): RawItem => ({ tag: { display: { Name: name, Lore: lore }, ExtraAttributes: { id } } });
const tools = (): HuntingEquipment => summarizeHuntingEquipment([
  item("Large Pocket Black Hole"), item("Turbo Fishing Net"), item("Prime Huntaxe"), item("Everstretch Lasso"),
], [], loadouts, [], []);
const fishing = (speed: number, scc = 100): HuntingFishingSetup => ({ name: "Test fishing set", stats: { ...stats(), fishingSpeed: speed, seaCreatureChance: scc }, lure: 5, quickBite: 5, flash: 0 });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("captured hunting equipment", () => {
  it("reads displayed stats once and does not turn ability lore into base damage", () => {
    const read = huntingItemStats(item("Test blade", ["Damage: +250 (+50)", "Strength: +100", "Item Ability: Boom", "Crit Damage: +999"]));
    expect(read.damage).toBe(250);
    expect(read.strength).toBe(100);
    expect(read.critDamage).toBe(0);
  });
  it("finds the strongest usable tool tier and one accessory upgrade", () => {
    const gear = summarizeHuntingEquipment([item("Basic Fishing Net"), item("Turbo Fishing Net"), item("Prime Huntaxe - Nex Titanum")], [item("Accretion Ring"), item("Accretion Artifact")], loadouts, [], []);
    expect(gear.net).toMatchObject({ tier: 3, pull: 50, fortune: 5 });
    expect(gear.huntaxe?.tier).toBe(5);
    expect(gear.accretion).toBeCloseTo(0.15);
  });
  it("chooses one armor set rather than adding the entire wardrobe", () => {
    const armor = (name: string, strength: number) => item(name, [`Strength: +${strength}`]);
    const gear = summarizeHuntingEquipment([], [], { ...loadouts, armorSets: [
      { id: 1, pieces: [armor("Better helmet", 100), null, null, null] },
      { id: 2, pieces: [armor("Other helmet", 80), null, null, null] },
    ] }, [armor("Worn helmet", 20)], []);
    expect(gear.combatStats.strength).toBe(100);
    expect(gear.combatArmor).toEqual(["Better helmet"]);
  });
  it("keeps Frog and Flying Fish as separate setups", () => {
    const gear = summarizeHuntingEquipment([item("Water rod", ["Fishing Speed: +100", "LEGENDARY FISHING ROD"])], [], loadouts, [], [
      { type: "FROG", tier: "LEGENDARY", exp: 1e9 }, { type: "FLYING_FISH", tier: "LEGENDARY", exp: 1e9 },
    ]);
    const frog = gear.fishingOptions.find((setup) => setup.frogLevel);
    expect(frog?.stats.fishingSpeed).toBe(140);
    expect(frog?.name).not.toContain("FLYING FISH");
    expect(gear.fishingOptions.some((setup) => setup.name.includes("FLYING FISH") && !setup.frogLevel)).toBe(true);
  });
  it("applies method and location attributes without mutating the captured equipment", () => {
    const captured = { ...tools(), fishing: fishing(100, 40), fishingOptions: [fishing(100, 40)], lavaFishing: fishing(100, 40) };
    const levels: Record<string, number> = { E17: 10, C11: 10, C14: 10, L5: 10, R53: 10, U21: 10, E9: 10 };
    const applied = applyHuntingAttributes(captured, (key) => levels[key] ?? 0, 1.3);
    expect(applied.net?.pull).toBe(60);
    expect(applied.fishing?.stats).toMatchObject({ fishingSpeed: 130, seaCreatureChance: 45, doubleHookChance: 0 });
    expect(applied.lavaFishing?.stats).toMatchObject({ fishingSpeed: 160, seaCreatureChance: 45, doubleHookChance: 5 });
    expect(applied.huntersFang).toBeCloseTo(0.13);
    expect(applied.huntersSuppress).toBeCloseTo(0.26);
    expect(captured.net?.pull).toBe(50);
    expect(captured.fishing?.stats.fishingSpeed).toBe(100);
  });
});

describe("method-local rates", () => {
  it("converts Python time reduction reciprocally and bounds saturated capture throughput", () => {
    expect(blackHoleSeconds("epic", 0, 0)).toBe(8);
    expect(blackHoleSeconds("epic", 0.5, 0)).toBe(4);
    expect(blackHoleSeconds("epic", 0.65, 0.15)).toBeCloseTo(2.38);
    const estimate = estimateAcquisition(shard("E33"), 10_000, { ...defaults, huntingEquipment: tools(), pythonLevel: 10 });
    expect(estimate.ceiling).toBeCloseTo(900 * 1.05);
    expect(estimate.rate).toBeLessThan(estimate.ceiling!);
    expect(estimate.assumptions.join(" ")).toContain("20%");
  });
  it("does not boost Black Hole captures with Frog or apply Cobra to nets", () => {
    const base = { ...defaults, huntingEquipment: tools(), hunterFortune: 100 };
    expect(estimateAcquisition(shard("E33"), 850, { ...base, frogBonus: true }).rate).toBe(estimateAcquisition(shard("E33"), 850, base).rate);
    expect(estimateAcquisition(shard("U20"), 1050, { ...base, kingCobraLevel: 10 }).rate).toBe(estimateAcquisition(shard("U20"), 1050, base).rate);
  });
  it("nets respond to Pull and enforce the target's minimum net tier", () => {
    const basic = { ...tools(), net: { name: "Basic Fishing Net", tier: 1, pull: 5, fortune: 0 } };
    const turbo = tools();
    expect(estimateAcquisition(shard("U20"), 1050, { ...defaults, huntingEquipment: turbo }).rate).toBeGreaterThan(estimateAcquisition(shard("U20"), 1050, { ...defaults, huntingEquipment: basic }).rate!);
    expect(estimateAcquisition(shard("U41"), 100, { ...defaults, huntingEquipment: basic }).rate).toBe(0);
    expect(estimateAcquisition(shard("U41"), 100, { ...defaults, huntingEquipment: basic }).alternatives[0].assumptions.join(" ")).toContain("Medium");
  });
  it("preserves explicit overrides as pre-bonus rates, without an extra downtime reduction", () => {
    const gear = tools();
    const estimate = estimateAcquisition(shard("U20"), 100, { ...defaults, hunterFortune: 100, customRates: { U20: 100 }, huntingEquipment: gear });
    expect(estimate.rate).toBeCloseTo(205);
    expect(estimate.quality).toBe("override");
    expect(estimateAcquisition(shard("U38"), 0, { ...defaults, customRates: { U38: 0 }, huntingEquipment: { ...gear, lavaFishing: fishing(300) } }).rate).toBe(0);
  });
  it("includes fishing approach time even at capped speed", () => {
    expect(fishingCastSeconds(fishing(300))).toBeCloseTo(2.375);
    expect(fishingCastSeconds(fishing(600))).toBe(fishingCastSeconds(fishing(300)));
    expect(fishingCastSeconds(fishing(100))).toBeGreaterThan(fishingCastSeconds(fishing(300)));
  });
  it("scales target fishing supply with speed without assuming every cast gives that shard", () => {
    const rate = (speed: number) => estimateAcquisition(shard("U20"), 1050, { ...defaults, huntingEquipment: { ...tools(), net: null, fishing: fishing(speed), fishingOptions: [fishing(speed)] } });
    expect(rate(300).method).toBe("Fishing");
    expect(rate(100).rate).toBeLessThan(rate(200).rate!);
    expect(rate(200).rate).toBeLessThan(rate(300).rate!);
    expect(rate(300).rate).toBeLessThan(3600 / fishingCastSeconds(fishing(300)) * 0.8);
  });
  it("replaces the hunting equipment subtotal when a fishing setup is used", () => {
    const gear = { ...tools(), lavaFishing: { ...fishing(300), equipmentFortune: 5 } };
    const params = { ...defaults, hunterFortune: 150, hunterEquipmentFortune: 50, pythonLevel: 10, huntingEquipment: gear };
    const estimate = estimateAcquisition(shard("U38"), 10, params);
    expect(estimate.method).toBe("Fish + Black Hole");
    expect(estimate.ceiling).toBeCloseTo(3600 / 2 * 2.1);
    expect(estimate.assumptions.join(" ")).toContain("110 effective Hunting Fortune");
  });
  it("compares Stridersurfer fishing supply against natural spawns instead of assuming every cast is a creature", () => {
    const slow = estimateAcquisition(shard("U38"), 600, { ...defaults, pythonLevel: 10, huntingEquipment: { ...tools(), lavaFishing: fishing(0, 20) } });
    const fast = estimateAcquisition(shard("U38"), 600, { ...defaults, pythonLevel: 10, huntingEquipment: { ...tools(), lavaFishing: fishing(300) } });
    expect(slow.method).toBe("Black Hole");
    expect(fast.method).toBe("Fish + Black Hole");
    expect(fast.rate).toBeGreaterThan(slow.rate!);
    expect(fast.rate).toBeLessThan(fast.ceiling!);
  });
  it("keeps passive trap wait and unknown salt rates separate from active grinding", () => {
    const estimate = estimateAcquisition(shard("U20"), 1050, { ...defaults, huntingEquipment: { ...tools(), trap: { name: "Astral Huntrap", tier: 5, fortune: 0, pull: 0 } } });
    const trap = estimate.alternatives.find((option) => option.method === "Traps");
    expect(trap?.rate).toBeNull();
    expect(trap?.assumptions.join(" ")).toContain("5.0–7.5 hours");
    expect(estimateAcquisition(shard("E33"), 850, defaults).alternatives.find((option) => option.method === "Charm")?.rate).toBeNull();
    expect(estimateAcquisition(shard("E6"), 4, defaults).rate).toBe(0);
    expect(estimateAcquisition(shard("E6"), 4, { ...defaults, customRates: { E6: 4 } }).rate).toBeGreaterThan(0);
  });
  it("tells unknown equipment apart from a verified tool", () => {
    const estimate = estimateAcquisition(shard("E33"), 850, { ...defaults, huntingEquipment: emptyHuntingEquipment() });
    expect(estimate.rate).toBeGreaterThan(0);
    expect(estimate.assumptions.join(" ")).toContain("assumed, not verified");
  });
  it("does not give fusion-only goals an irrelevant unavailable acquisition tooltip", () => {
    const estimate = estimateAcquisition(shard("C1"), 0, defaults);
    expect(acquisitionEstimateSections(estimate)).toEqual([]);
    expect(acquisitionEstimateSections(estimateAcquisition(shard("E33"), 850, { ...defaults, huntingEquipment: { ...tools(), blackHole: null } }))[0].title).toBe("Direct acquisition");
  });
});

describe("combat preparation heuristics", () => {
  const combatGear = (damage: number): HuntingEquipment => {
    const weapon = { name: "Test sword", stats: { ...stats(), damage, strength: 100, critDamage: 100 } };
    return { ...tools(), combat: weapon, weaponCandidates: [weapon], combatStats: { ...stats(), strength: 500, critDamage: 500, critChance: 100 }, combatLevel: 50 };
  };
  it("considers sword openings plus an axe finish for Ghosts", () => {
    const result = preparationSeconds("E33", combatGear(1000));
    expect(result?.notes.join(" ")).toContain("sword hits");
    expect(result?.notes.join(" ")).toContain("swap");
  });
  it("rejects a lethal opening and ordinary sword damage against Glacite Walkers", () => {
    expect(preparationSeconds("U18", combatGear(1000))?.notes.join(" ")).toContain("no lethal sword");
    expect(preparationSeconds("R6", combatGear(1000))?.notes.join(" ")).toContain("Huntaxe hits");
    expect(preparationSeconds("R6", combatGear(1000))?.notes.join(" ")).not.toContain("Preparation estimate: 1 sword");
  });
});

describe("optimizer integration", () => {
  it("uses equipment-dependent rates in real Grove routes", () => {
    const service = CalculationService.getInstance();
    const slowGear = { ...tools(), net: { name: "Basic Fishing Net", tier: 1, pull: 5, fortune: 0 } };
    const fastGear = { ...tools(), lavaFishing: fishing(300), accretion: 0.15 };
    const slowParams = { ...defaults, huntingEquipment: slowGear, pythonLevel: 10 };
    const fastParams = { ...defaults, huntingEquipment: fastGear, pythonLevel: 10 };
    const slow = service.buildData(fusion, rates, slowParams);
    const fast = service.buildData(fusion, rates, fastParams);
    const a = service.computeMinCosts(slow, slowParams);
    const b = service.computeMinCosts(fast, fastParams);
    expect(b.minCosts.get("C1")).toBeLessThan(a.minCosts.get("C1")!);
    expect(fast.shards.U38.acquisition?.method).toBe("Fish + Black Hole");
  });
  it("does not reuse time rates as prices or reuse old equipment in its cache", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.includes("fusion-data") ? fusion : rates)));
    const service = CalculationService.getInstance();
    const params = { ...defaults, hunterFortune: 123.456, customRates: { U20: 101 } };
    const time = await service.parseData(params);
    const coins = await service.parseData({ ...params, rateAsCoinValue: true });
    expect(time.shards.U20.rate).not.toBe(coins.shards.U20.rate);
    expect(coins.shards.U20.rate).toBe(101);
    expect(coins.shards.U20.acquisition).toBeUndefined();
    expect(service.buildData(fusion, rates, { ...defaults, customRates: { L15: 0 } }).shards.L15.rate).toBe(0);
    const geared = await service.parseData({ ...params, huntingEquipment: tools() });
    expect(geared.shards.U20.rate).not.toBe(time.shards.U20.rate);
    vi.unstubAllGlobals();
  });
});
