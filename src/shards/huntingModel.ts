import { NO_FORTUNE_SHARDS, WOODEN_BAIT_SHARDS } from "../constants";
import type { CalculationParams, Shard } from "../types/types";
import { acquisitionFor, acquisitionMethods } from "./acquisition";
import { addHuntingStats, meleeHit, type HuntingEquipment, type HuntingFishingSetup } from "./huntingEquipment";

export interface AcquisitionOption {
  method: string;
  rate: number | null;
  ceiling: number | null;
  assumptions: string[];
}
export interface AcquisitionEstimate extends AcquisitionOption {
  quality: "estimated" | "override" | "unavailable";
  alternatives: AcquisitionOption[];
}

// Heuristics are deliberately separate from the game's mechanics. They are
// exposed in the rate tooltip, and never described as measured player rates.
// Mechanics: hypixelskyblock.minecraft.wiki/w/{Black_Holes,Huntaxes,
// Fishing_Nets,Fishing_Speed,Frog_Pet,Huntraps}. Legacy rates.json has no
// measured reference loadout. Its supply / 50-Pull calibration is a heuristic,
// not source-verified benchmark equipment; keep that limitation in the UI.
const UTILIZATION = 0.8;
const CAPTURE_DOWNTIME_SECONDS = 0.5;
const SWAP_SECONDS = 0.35;
// Legacy fishing rates have no reference gear. Treat them as a best-cast
// benchmark, then scale down for the selected setup, rather than assuming
// every cast gives the requested shard. This calibration remains an estimate.
const REFERENCE_CAST_SECONDS = 2.375;
const RARITY_RANK = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };
const MOB_STATS: Record<string, { hp: number; defense: number; sword: boolean }> = {
  E33: { hp: 1_000_000, defense: 0, sword: true },
  U38: { hp: 20_000, defense: 0, sword: true },
  U18: { hp: 10_000, defense: 0, sword: true },
  R6: { hp: 888, defense: 1_000, sword: false },
};

/** Python reduces time, not the reciprocal rate by the same percentage. */
export function blackHoleSeconds(rarity: Shard["rarity"], pythonReduction: number, accretionReduction: number): number {
  // Conservative multiplicative stacking until additive stacking is verified.
  return 2 * RARITY_RANK[rarity] * (1 - Math.min(0.65, Math.max(0, pythonReduction))) * (1 - Math.min(0.15, Math.max(0, accretionReduction)));
}

/** Expected cast duration. The approach animation survives the Fishing Speed cap. */
export function fishingCastSeconds(setup: HuntingFishingSetup, cap = 300): number {
  const speed = Math.min(cap, Math.max(0, setup.stats.fishingSpeed));
  const lureReduction = Math.min(1, Math.max(0, setup.lure) * 0.05);
  const approach = 2.5 * (1 - Math.min(0.25, Math.max(0, setup.quickBite) * 0.05));
  // Flash's proc chance is not reconstructed here. Ignoring it is conservative.
  return (15 - 5 * lureReduction) * (1 - speed / cap) + approach + 0.5;
}

export function preparationSeconds(key: string, equipment: HuntingEquipment): { seconds: number; notes: string[] } | null {
  const mob = MOB_STATS[key];
  const axe = equipment.huntaxe;
  if (!mob || !axe || !equipment.combat) return null;
  const combatLevel = equipment.combatLevel ?? 0;
  const character = { ...equipment.combatStats, critChance: equipment.combatStats.critChance + combatLevel * 0.5 };
  const defenseMultiplier = 100 / (100 + mob.defense);
  const swordDamage = mob.sword ? meleeHit(addHuntingStats(character, equipment.combat.stats), combatLevel) * defenseMultiplier : 0;
  const maxSwordDamage = mob.sword ? meleeHit({ ...addHuntingStats(character, equipment.combat.stats), critChance: 100 }, combatLevel) * defenseMultiplier : 0;
  const absorption = axe.tier * 0.05 + Math.min(0.13, equipment.huntersFang ?? 0);
  const cap = [0.15, 0.2, 0.25, 0.33, 0.5][axe.tier - 1] ?? 0.15;
  // Evaluate every owned sword as an absorbed stat donor independently of the
  // sword used for opening hits. The best direct sword need not be the best donor.
  let axeDamage = 0;
  for (const weapon of equipment.weaponCandidates) {
    const donor = { ...weapon.stats, attackSpeed: 0, fishingSpeed: 0, seaCreatureChance: 0, doubleHookChance: 0 };
    for (const stat of ["damage", "strength", "critDamage", "critChance"] as const) donor[stat] *= absorption;
    // Lore may already include an absorbed weapon. Use only the donor subtotal
    // here rather than adding a second absorbed item through the axe's lore.
    axeDamage = Math.max(axeDamage, Math.min(mob.hp * cap, meleeHit(addHuntingStats(character, donor), combatLevel) * defenseMultiplier));
  }
  if (axeDamage <= 0) return null;
  // Stop strictly below 10%, not exactly on the threshold. Sword openings are
  // accepted only while they cannot kill the target under this estimate.
  const thresholdDamage = mob.hp * 0.9 + 1;
  const swordHits = swordDamage > 0 && maxSwordDamage < mob.hp ? Math.min(Math.ceil(thresholdDamage / swordDamage), Math.ceil(mob.hp / maxSwordDamage) - 1) : 0;
  const axeOnlyHits = Math.ceil(thresholdDamage / axeDamage);
  const finishHits = Math.max(0, Math.ceil((thresholdDamage - swordHits * swordDamage) / axeDamage));
  const swingSeconds = Math.max(0.25, 0.5 / (1 + Math.min(100, Math.max(0, character.attackSpeed)) / 100));
  const axeOnlyTime = axeOnlyHits * swingSeconds;
  const swappedTime = swordHits > 0 ? (swordHits + finishHits) * swingSeconds + (finishHits > 0 ? SWAP_SECONDS : 0) : Infinity;
  const useSword = swappedTime < axeOnlyTime;
  return {
    seconds: Math.min(axeOnlyTime, swappedTime),
    notes: [
      `${equipment.combat.name}; ${Math.round(character.strength + equipment.combat.stats.strength)} gear Strength, ${Math.round(character.critDamage + equipment.combat.stats.critDamage)} gear Crit Damage.`,
      useSword ? `Preparation estimate: ${swordHits} sword hits${finishHits ? `, swap, ${finishHits} Huntaxe hits` : ""}.` : `Preparation estimate: ${axeOnlyHits} Huntaxe hits; no lethal sword opening assumed.`,
      `Assumes the best owned donor is usable and stored in ${axe.name}. Gear-only estimate excludes accessory power, axe reforges, conditional pet/set bonuses and most enchantments; actual preparation may be faster.`,
    ],
  };
}

export function estimateAcquisition(shard: Shard, baseRate: number, params: CalculationParams): AcquisitionEstimate {
  const equipment = params.huntingEquipment;
  const overridden = Object.hasOwn(params.customRates, shard.id);
  const echo = 1 + 0.02 * params.seaSerpentLevel * (1 + 0.05 * params.tiamatLevel);
  const rarityFortune = { common: params.newtLevel * 2, uncommon: params.salamanderLevel * 2, rare: params.lizardKingLevel, epic: params.leviathanLevel, legendary: 0 }[shard.rarity];
  const baseFortune = params.hunterFortune + rarityFortune;
  const hasFortune = !NO_FORTUNE_SHARDS.includes(shard.id);
  const yieldFor = (toolFortune = 0, blackHole = false) => hasFortune
    ? 1 + ((baseFortune + toolFortune) * (blackHole ? 1 + params.kingCobraLevel * 0.01 * echo : 1)) / 100
    : 1;
  const options: AcquisitionOption[] = [];
  const methods = acquisitionMethods(shard.id);
  const canAssumeTool = overridden || !equipment?.available;
  const unavailable = (method: string, tool: string) => options.push({ method, rate: null, ceiling: null, assumptions: [`${tool} not found in captured gear. This does not prove you do not own one.`] });
  const defaultNote = overridden ? "Custom pre-bonus rate; not a measured final yield." : "Catalogue rate used as a supply benchmark, not a measured rate for this profile.";
  const baitFactor = params.noWoodenBait && WOODEN_BAIT_SHARDS.includes(shard.id) ? shard.id === "L23" ? 0.1 : 0.05 : 1;

  if (methods.includes("Black Hole")) {
    if (!equipment?.blackHole && !canAssumeTool) unavailable("Black Hole", "Pocket Black Hole");
    else {
      const seconds = blackHoleSeconds(shard.rarity, params.pythonLevel * 0.05 * echo, equipment?.accretion ?? 0);
      const dropYield = yieldFor(equipment?.blackHole?.fortune ?? 0, true);
      const ceiling = 3600 / seconds * dropYield;
      const prep = equipment ? preparationSeconds(shard.id, equipment) : null;
      const preparation = prep?.seconds ?? 0;
      const captureRate = 3600 / Math.max(seconds + CAPTURE_DOWNTIME_SECONDS, preparation);
      const assumptions = [
        `${equipment?.blackHole?.name ?? "Black Hole tier unknown"}; ${seconds.toFixed(2)} seconds capture animation, ${CAPTURE_DOWNTIME_SECONDS}s estimated post-capture delay.`,
        `${Math.round(ceiling).toLocaleString()} / hour saturated ceiling: continuously prepared targets, no downtime.`,
        `${Math.round((dropYield - 1) * 1000) / 10} effective Hunting Fortune, including rarity, tool and Hunter's Grasp.`,
        ...(equipment?.accretion ? ["Accretion and Hunter's Pressure use conservative multiplicative timing; stacking is not confirmed."] : []),
        ...(prep?.notes ?? ["Mob preparation speed is not available; the catalogue supply benchmark is used."]),
      ];
      options.push({ method: "Black Hole", ceiling, rate: Math.min(captureRate, baseRate * baitFactor) * dropYield * (overridden ? 1 : UTILIZATION), assumptions: [...assumptions, defaultNote, ...(baitFactor < 1 ? ["Without Wooden Bait, the target supply benchmark is reduced."] : [])] });
      if (shard.id === "U38" && !overridden) {
        const fishing = equipment?.lavaFishing;
        if (fishing) {
          const supplied = 3600 / fishingCastSeconds(fishing) * Math.min(1, fishing.stats.seaCreatureChance / 100) * (1 + Math.min(100, fishing.stats.doubleHookChance) / 100);
          const fishingFortune = params.hunterEquipmentFortune === undefined ? 0 : (fishing.equipmentFortune ?? 0) - params.hunterEquipmentFortune;
          const fishingYield = yieldFor((equipment?.blackHole?.fortune ?? 0) + fishingFortune, true);
          const fishingCeiling = 3600 / seconds * fishingYield;
          options.push({
            method: "Fish + Black Hole", ceiling: fishingCeiling,
            rate: Math.min(captureRate, supplied) * fishingYield * UTILIZATION,
            assumptions: [assumptions[0], `${Math.round(fishingCeiling).toLocaleString()} / hour saturated ceiling: continuously prepared targets, no downtime.`, `${Math.round((fishingYield - 1) * 1000) / 10} effective Hunting Fortune with the fishing set, tool and Hunter's Grasp.`, ...assumptions.slice(3), fishing.name, `Estimated ${Math.round(supplied)} Stridersurfers / hour before capture from ${Math.round(fishing.stats.fishingSpeed)} Fishing Speed, ${Math.round(fishing.stats.seaCreatureChance)}% Sea Creature Chance.`, "Assumes Stride-Ember Fissure, the Stridersurfer-only creature pool. Fishing/preparation can overlap capture; no Flash procs or party supply assumed."],
          });
        } else unavailable("Fish + Black Hole", "Lava-capable fishing rod");
      }
    }
  }
  if (methods.includes("Fishing Net")) {
    const minimumTier = /^(?:Flipflopper|Seashine)$/i.test(shard.name) ? 2 : /^(?:Spike|Watersnake|Water Snake)$/i.test(shard.name) ? 3 : 1;
    const net = equipment?.net;
    if ((!net || net.tier < minimumTier) && !canAssumeTool) unavailable("Fishing Net", minimumTier === 3 ? "Turbo Fishing Net or better" : minimumTier === 2 ? "Medium Fishing Net or better" : "Fishing Net");
    else {
      // Reeling time scales with Pull; a fixed handling portion does not.
      // 50 Pull is a declared calibration assumption for the legacy benchmark.
      const referenceSeconds = baseRate > 0 ? 3600 / baseRate : Infinity;
      const pull = net?.pull ?? 50;
      const interval = overridden ? referenceSeconds : 1 + Math.max(0, referenceSeconds - 1) * 50 / pull;
      options.push({ method: "Fishing Net", ceiling: null, rate: 3600 / interval * yieldFor(net?.fortune ?? 0) * (overridden ? 1 : UTILIZATION), assumptions: [net ? `${net.name}: ${pull} Pull, +${net.fortune} Water Hunting Fortune.` : "Net tier unknown; 50 Pull assumed.", defaultNote, "Heuristic calibration: catalogue benchmark at 50 Pull, 1s handling per catch; remaining reeling time scales with Pull. Target movement and stamina are not simulated."] });
    }
  }
  if (methods.includes("Lasso")) {
    if (!equipment?.lasso && !canAssumeTool) unavailable("Lasso", "Lasso");
    else {
      const suppress = Math.min(0.26, equipment?.huntersSuppress ?? 0);
      const interval = baseRate > 0 ? 3600 / baseRate : Infinity;
      const adjusted = overridden ? interval : 1 + Math.max(0, interval - 1) / (1 + suppress);
      options.push({ method: "Lasso", ceiling: null, rate: 3600 / adjusted * yieldFor(equipment?.lasso?.fortune ?? 0) * (overridden ? 1 : UTILIZATION), assumptions: [equipment?.lasso ? `${equipment.lasso.name}: +${equipment.lasso.fortune} Forest Hunting Fortune.` : "Lasso tier unknown.", defaultNote, `Hunter's Suppress: +${Math.round(suppress * 100)}% stamina depletion. Heuristic assumes 1s handling per capture; only the remaining interval benefits. Movement and stamina layers use the catalogue benchmark, not a measured catch time.`] });
    }
  }
  if (methods.includes("Fishing") || methods.includes("Star Bait")) {
    const location = acquisitionFor(shard.id).filter((line) => line.startsWith("Caught by Fishing")).join(" ");
    const foraging = /Galatea|Moonglade|Murkwater|Tomb Floodway|Lotus Atoll|Overgrowth/i.test(location);
    const fishingCap = /Backwater Bayou/i.test(location) ? 200 : /Lotus Atoll/i.test(location) ? 250 : 300;
    const candidates = equipment?.fishingOptions?.length ? equipment.fishingOptions : equipment?.fishing ? [equipment.fishing] : [];
    const fishingCandidates = candidates.map((setup) => foraging ? { ...setup, stats: { ...setup.stats, fishingSpeed: setup.stats.fishingSpeed + (equipment?.foragingFishingSpeed ?? 0) } } : setup);
    const frogMultiplier = (setup?: HuntingFishingSetup) => params.frogBonus && setup?.frogLevel ? 1 + (0.5 + 0.495 * setup.frogLevel) / 100 : 1;
    const referenceChance = Math.min(1, baseRate * REFERENCE_CAST_SECONDS / 3600);
    const targetSupply = (setup: HuntingFishingSetup) => 3600 / fishingCastSeconds(setup, fishingCap) * Math.min(1, referenceChance * frogMultiplier(setup) * baitFactor);
    const fishing = [...fishingCandidates].sort((a, b) => targetSupply(b) - targetSupply(a))[0];
    if (!fishing && !canAssumeTool) unavailable("Fishing", "Fishing rod");
    else {
      const frog = frogMultiplier(fishing) === 1 && !equipment?.available && params.frogBonus ? 1.5 : frogMultiplier(fishing);
      const supply = overridden ? baseRate * frog * baitFactor : fishing ? targetSupply(fishing) : 3600 / REFERENCE_CAST_SECONDS * Math.min(1, referenceChance * frog * baitFactor);
      const fishingFortune = fishing && params.hunterEquipmentFortune !== undefined ? (fishing.equipmentFortune ?? 0) - params.hunterEquipmentFortune : 0;
      options.push({ method: methods.includes("Star Bait") ? "Star Bait" : "Fishing", ceiling: null, rate: supply * yieldFor(fishingFortune) * (overridden ? 1 : UTILIZATION), assumptions: [fishing?.name ?? "Fishing equipment unknown.", defaultNote, ...(!overridden ? ["Heuristic: catalogue target rates use a 2.375s reference cast, scaled down for this setup. Target probability is estimated, not verified; weather, nearby players and Flash procs are not assumed."] : []), ...(params.hunterEquipmentFortune !== undefined && fishing ? [`Uses ${Math.round(baseFortune + fishingFortune)} Hunting Fortune with this fishing equipment, not both fishing and hunting sets at once.`] : []), ...(frog > 1 ? ["Frog applies to Water shards from fishing only, using that pet's own stats."] : [])] });
    }
  }
  if (methods.includes("Traps")) {
    const trap = equipment?.trap;
    const reduction = trap ? [0, 0.1, 0.2, 0.35, 0.5][trap.tier - 1] : 0;
    const minHours = (6 + 2 * RARITY_RANK[shard.rarity]) * (1 - reduction);
    options.push({ method: "Traps", rate: null, ceiling: null, assumptions: [`${trap?.name ?? "Small Huntrap assumed"}: ${minHours.toFixed(1)}–${(minHours * 1.5).toFixed(1)} hours per passive collection before location modifiers.`, "The target's trap roll probability is not known, so this wait is not treated as an active shards/hour rate or automatically ranked."] });
  }
  if (methods.includes("Salts") && (!overridden || methods.includes("Black Hole"))) options.push({ method: "Salts", rate: null, ceiling: null, assumptions: ["Charm chance, kill supply and salt supply are not mapped; not ranked without a custom rate."] });
  if (methods.includes("Charm") && (!overridden || methods.includes("Black Hole"))) options.push({ method: "Charm", rate: null, ceiling: null, assumptions: ["Charm chance and target supply are not mapped; not ranked without a custom rate."] });
  if (!options.some((option) => option.rate !== null) && !methods.some((method) => ["Black Hole", "Fishing Net", "Fishing", "Star Bait", "Lasso"].includes(method)) && (baseRate > 0 || overridden)) {
    const method = methods.find((name) => name !== "Traps" && (!["Salts", "Charm"].includes(name) || overridden)) ?? (methods.length === 0 ? "Gather" : null);
    if (method) options.push({ method, ceiling: null, rate: baseRate * (method === "Critter Capsule" ? 1 : yieldFor()) * (overridden || method === "Kuudra" ? 1 : UTILIZATION), assumptions: [defaultNote, "Method-specific equipment effects are not mapped for this source; no combat, net or Frog bonuses are applied.", ...(method === "Critter Capsule" ? ["Safari catalogue benchmark: outside-profile Hunting Fortune is not applied; Safari equipment is not mapped."] : [])] });
  }
  for (const method of methods) if (!options.some((option) => option.method === method)) {
    options.push({ method, rate: null, ceiling: null, assumptions: ["No separate timing or supply estimate is available for this method; it is not automatically ranked."] });
  }
  const ranked = options.filter((option) => option.rate !== null && option.rate > 0).sort((a, b) => Math.abs(b.rate! - a.rate!) < 1e-8 ? 0 : b.rate! - a.rate!);
  const best = ranked[0];
  if (!best || params.excludeChameleon && shard.id === "L4") return { method: "Unavailable", rate: 0, ceiling: null, quality: "unavailable", assumptions: ["No eligible timed source with the captured equipment and route rules."], alternatives: options };
  return { ...best, quality: overridden ? "override" : "estimated", assumptions: [...best.assumptions, ...(!overridden && best.method !== "Kuudra" ? ["Planning rate includes 20% estimated downtime, not uninterrupted perfect play."] : []), ...(!equipment?.available ? ["Profile gear is unavailable. Method equipment is assumed, not verified."] : [])], alternatives: options.filter((option) => option !== best) };
}
