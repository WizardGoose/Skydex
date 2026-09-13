import DATA from "./acquisitionData.generated.json";

const guidance = DATA as Record<string, string[]>;

export const acquisitionFor = (shardKey: string): readonly string[] => guidance[shardKey] ?? [];

// Official August 24 patch notes: Pangolins spawn only in Pangolin Hideaways.
// Keep location prose separate from method/rate inference.
// https://hypixel.net/threads/august-24-skyblock-patch-notes.6142558/
// Canyon caves: https://hypixel.net/threads/july-29-skyblock-0-27-release-candidate.6131044/
export const acquisitionGuidanceFor = (shardKey: string): readonly string[] => shardKey === "R88"
  ? ["Found in Pangolin Hideaways, the caves around Torrhus Canyon. Catch from a distance."]
  : shardKey === "L15" ? ["Obtain Kraken Shards from Kuudra reward chests after completing the fight."]
  // https://hypixel-skyblock.fandom.com/wiki/Ghost
  : shardKey === "E33" ? ["Find Ghosts in The Mist in the Dwarven Mines. Capture them with a Pocket Black Hole."] : acquisitionFor(shardKey);

export const acquisitionSummary = (shardKey: string): string => {
  const lines = acquisitionFor(shardKey);
  if (lines.length < 2) return lines[0] ?? "Location not yet mapped";
  const methods = lines.map((line) => {
    if (line.startsWith("Fusing ")) return "Fusion";
    if (line.startsWith("Charm ")) return "Charm";
    if (line.includes("Critter Capsule")) return "Critter Capsule";
    if (line.startsWith("Place Hunting Traps")) return "Hunting Traps";
    if (line.includes("while using Salts")) return "Salts";
    if (line.includes("Tree Gifts")) return "Tree Gifts";
    if (line.startsWith("Caught by Fishing")) return "Fishing";
    return line.replace(/^Catch with (?:a )?/, "").replace(/\.$/, "");
  });
  return [...new Set(methods)].join(" · ");
};

export const hasDirectAcquisition = (shardKey: string, defaultRate = 0): boolean =>
  defaultRate > 0 || shardKey === "L15";

/** Acquisition options, not a ranking: the catalogue has no per-method timings. */
export const acquisitionMethods = (shardKey: string): string[] => [...new Set(acquisitionFor(shardKey)
  .filter((line) => !line.startsWith("Fusing "))
  .map((line) => {
    if (line.includes("Pocket Black Hole")) return "Black Hole";
    if (line.startsWith("Charm ")) return "Charm";
    if (line.includes("Critter Capsule")) return "Critter Capsule";
    if (line.includes("Hunting Traps")) return "Traps";
    if (line.includes("while using Salts")) return "Salts";
    if (line.includes("Fishing Net")) return "Fishing Net";
    if (line.includes("Lasso")) return "Lasso";
    if (line.includes("Caught by Fishing")) return "Fishing";
    if (line.includes("Tree Gifts")) return "Tree Gifts";
    if (line.includes("Kuudra")) return "Kuudra";
    if (line.includes("Star Bait")) return "Star Bait";
    if (line.includes("Shop") || line.startsWith("Purchased ")) return "Shop";
    return "Gather";
  }))];
