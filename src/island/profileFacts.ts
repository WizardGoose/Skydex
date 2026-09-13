/**
 * The plain-JSON facts on a profile member that the profile viewer states:
 * skill experience, when the profile was first joined, fairy souls.
 *
 * Read here, once, at the same moment the networth pull already has the member
 * in hand, rather than by a second request. Everything is optional and absent
 * stays absent: a member with no `player_data.experience` yields an empty map,
 * not a map of zeros, because "Hypixel did not say" and "level zero" are
 * different sentences and this site never trades one for the other.
 *
 * Supported field locations are pinned by the parser tests: experience lives
 * at `player_data.experience` keyed
 * `SKILL_FARMING` style, first join at `profile.first_join` (ms epoch), fairy
 * souls at `fairy_soul.total_collected`.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export interface ProfileTreeNodeFact {
  /** Level exactly as Hypixel states it. */
  level: number;
  /** The matching `toggle_<node>` value, or null when the API has no toggle. */
  enabled: boolean | null;
}

export interface ProfileSkillTreeFacts {
  /** Player-supplied preset name when the active tree has one. */
  customName: string | null;
  /** Total tree experience for this progression system. */
  experience: number | null;
  /** Tokens spent in the active tree. */
  tokensSpent: number | null;
  /** Selected active ability key, when the tree exposes one. */
  selectedAbility: string | null;
  /** Active-tree nodes keyed by the API's own future-safe node IDs. */
  nodes: Record<string, ProfileTreeNodeFact>;
}

export interface ProfileFacts {
  /**
   * Total skill experience by the payload's own key (`SKILL_FARMING`), only
   * for keys the payload actually states, only finite non-negative numbers.
   */
  skillXp: Record<string, number>;
  /** ms epoch of the member's first join, or null when unstated. */
  firstJoin: number | null;
  /** Fairy souls collected, or null when unstated. Null is not zero. */
  fairySouls: number | null;
  /**
   * SkyBlock leveling experience (`leveling.experience`), or null when the
   * payload does not state it. The game's own arithmetic is fixed: every
   * level costs 100 XP, so level = floor(xp / 100) and the remainder is the
   * progress into the current level. Verified against
   * the synthetic fixtures in this module's tests.
   */
  levelXp: number | null;
  /**
   * Accessory tuning allocations, `accessory_bag_storage.tuning.slot_N`:
   * slot key to stat key to points, numbers only, exactly as stated. The
   * loadout cards read these through `tuning_points_slot`. Empty when the
   * payload has none; a slot's absence is not zeros.
   */
  tuning: Record<string, Record<string, number>>;
  /** `accessory_bag_storage.selected_power`, the worn power stone, or null. */
  selectedPower: string | null;
  /** The selected Heart of the Mountain tree name, exactly as Hypixel states it. */
  hotmName: string | null;
  /** The selected Heart of the Forest tree name, exactly as Hypixel states it. */
  hotfName: string | null;
  /** The active Heart of the Mountain allocation, when shared. */
  hotmTree: ProfileSkillTreeFacts | null;
  /** The active Heart of the Forest allocation, when shared. */
  hotfTree: ProfileSkillTreeFacts | null;
  /** Hypixel's currently selected Heart of the Mountain preset slot. */
  hotmSelectedSlot?: number | null;
  /** Hypixel's currently selected Heart of the Forest preset slot. */
  hotfSelectedSlot?: number | null;
  /** Every shared Heart of the Mountain preset, keyed by its one-based slot. */
  hotmTrees?: Record<number, ProfileSkillTreeFacts>;
  /** Every shared Heart of the Forest preset, keyed by its one-based slot. */
  hotfTrees?: Record<number, ProfileSkillTreeFacts>;
}

export const EMPTY_FACTS: ProfileFacts = {
  skillXp: {},
  firstJoin: null,
  fairySouls: null,
  levelXp: null,
  tuning: {},
  selectedPower: null,
  hotmName: null,
  hotfName: null,
  hotmTree: null,
  hotfTree: null,
  hotmSelectedSlot: null,
  hotfSelectedSlot: null,
  hotmTrees: {},
  hotfTrees: {},
};

const finiteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const positiveInteger = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;

type TreeKey = "mining" | "foraging";
type TokenKey = "mountain" | "forest";

const presetKey = (base: TreeKey | TokenKey, slot: number): string =>
  slot === 1 ? base : `${base}_${slot}`;

const readTree = (
  skillTree: Record<string, unknown> | undefined,
  treeKey: TreeKey,
  tokenKey: TokenKey,
  slot: number,
): ProfileSkillTreeFacts | null => {
  if (!skillTree) return null;
  const storedTreeKey = presetKey(treeKey, slot);
  const storedTokenKey = presetKey(tokenKey, slot);
  const names = isRecord(skillTree[storedTreeKey]) ? skillTree[storedTreeKey] : undefined;
  const nodeSets = isRecord(skillTree.nodes) ? skillTree.nodes : undefined;
  const rawNodes = nodeSets && isRecord(nodeSets[storedTreeKey]) ? nodeSets[storedTreeKey] : undefined;
  const experience = isRecord(skillTree.experience) ? finiteNumber(skillTree.experience[treeKey]) : null;
  const tokensSpent = isRecord(skillTree.tokens_spent) ? finiteNumber(skillTree.tokens_spent[storedTokenKey]) : null;
  const selectedAbility = isRecord(skillTree.selected_ability) && typeof skillTree.selected_ability[storedTreeKey] === "string"
    ? skillTree.selected_ability[storedTreeKey] as string
    : null;
  const customName = names && typeof names.custom_name === "string" && names.custom_name.trim()
    ? names.custom_name
    : null;
  const nodes: Record<string, ProfileTreeNodeFact> = {};

  if (rawNodes) {
    for (const [key, value] of Object.entries(rawNodes)) {
      if (key.startsWith("toggle_")) continue;
      const level = finiteNumber(value);
      if (level === null || level < 0) continue;
      const toggle = rawNodes[`toggle_${key}`];
      nodes[key] = { level, enabled: typeof toggle === "boolean" ? toggle : null };
    }
  }

  if (!customName && experience === null && tokensSpent === null && !selectedAbility && Object.keys(nodes).length === 0) {
    return null;
  }
  return { customName, experience, tokensSpent, selectedAbility, nodes };
};

const readTreePresets = (
  skillTree: Record<string, unknown> | undefined,
  treeKey: TreeKey,
  tokenKey: TokenKey,
  selectedSlot: number | null,
): Record<number, ProfileSkillTreeFacts> => {
  if (!skillTree) return {};
  const slots = new Set<number>([1]);
  if (selectedSlot !== null) slots.add(selectedSlot);

  const collect = (value: unknown, base: TreeKey | TokenKey) => {
    if (!isRecord(value)) return;
    const pattern = new RegExp(`^${base}(?:_(\\d+))?$`);
    for (const key of Object.keys(value)) {
      const match = pattern.exec(key);
      if (!match) continue;
      const slot = match[1] ? Number(match[1]) : 1;
      if (Number.isInteger(slot) && slot > 0) slots.add(slot);
    }
  };

  collect(skillTree, treeKey);
  collect(skillTree.nodes, treeKey);
  collect(skillTree.selected_ability, treeKey);
  collect(skillTree.tokens_spent, tokenKey);

  const presets: Record<number, ProfileSkillTreeFacts> = {};
  for (const slot of [...slots].sort((left, right) => left - right)) {
    const tree = readTree(skillTree, treeKey, tokenKey, slot);
    if (tree) presets[slot] = tree;
  }
  return presets;
};

export const readProfileFacts = (member: unknown): ProfileFacts => {
  if (!isRecord(member)) return EMPTY_FACTS;

  const skillXp: Record<string, number> = {};
  const experience = isRecord(member.player_data) ? member.player_data.experience : undefined;
  if (isRecord(experience)) {
    for (const [key, value] of Object.entries(experience)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) skillXp[key] = value;
    }
  }

  const profile = isRecord(member.profile) ? member.profile : undefined;
  const firstJoin =
    profile && typeof profile.first_join === "number" && Number.isFinite(profile.first_join) && profile.first_join > 0
      ? profile.first_join
      : null;

  const fairy = isRecord(member.fairy_soul) ? member.fairy_soul : undefined;
  const fairySouls =
    fairy && typeof fairy.total_collected === "number" && Number.isFinite(fairy.total_collected)
      ? fairy.total_collected
      : null;

  const leveling = isRecord(member.leveling) ? member.leveling : undefined;
  const levelXp =
    leveling && typeof leveling.experience === "number" && Number.isFinite(leveling.experience) && leveling.experience >= 0
      ? leveling.experience
      : null;

  const bag = isRecord(member.accessory_bag_storage) ? member.accessory_bag_storage : undefined;
  const tuning: Record<string, Record<string, number>> = {};
  if (bag && isRecord(bag.tuning)) {
    for (const [slot, value] of Object.entries(bag.tuning)) {
      // Only the slot_N objects are allocations; siblings like
      // `highest_unlocked_slot` and `refund_2` are bookkeeping.
      if (!slot.startsWith("slot_") || !isRecord(value)) continue;
      const stats: Record<string, number> = {};
      for (const [stat, points] of Object.entries(value)) {
        // Hypixel stores the slot purchase timestamp beside the allocation.
        // It is bookkeeping, not a tunable SkyBlock stat.
        if (stat === "purchase_ts") continue;
        if (typeof points === "number" && Number.isFinite(points)) stats[stat] = points;
      }
      tuning[slot] = stats;
    }
  }
  const selectedPower = bag && typeof bag.selected_power === "string" && bag.selected_power ? bag.selected_power : null;

  const skillTree = isRecord(member.skill_tree) ? member.skill_tree : undefined;
  const selectedSlots = skillTree && isRecord(skillTree.selected_skill_tree_slot)
    ? skillTree.selected_skill_tree_slot
    : undefined;
  const hotmSelectedSlot = positiveInteger(selectedSlots?.mining);
  const hotfSelectedSlot = positiveInteger(selectedSlots?.foraging);
  const hotmTrees = readTreePresets(skillTree, "mining", "mountain", hotmSelectedSlot);
  const hotfTrees = readTreePresets(skillTree, "foraging", "forest", hotfSelectedSlot);
  const hotmTree = hotmTrees[hotmSelectedSlot ?? 1] ?? null;
  const hotfTree = hotfTrees[hotfSelectedSlot ?? 1] ?? null;
  const hotmName = hotmTree?.customName ?? null;
  const hotfName = hotfTree?.customName ?? null;

  return {
    skillXp,
    firstJoin,
    fairySouls,
    levelXp,
    tuning,
    selectedPower,
    hotmName,
    hotfName,
    hotmTree,
    hotfTree,
    hotmSelectedSlot,
    hotfSelectedSlot,
    hotmTrees,
    hotfTrees,
  };
};
