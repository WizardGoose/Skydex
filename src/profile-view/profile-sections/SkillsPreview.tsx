import React, { useMemo, useState } from "react";
import type { ParsedItems } from "../../networth/profileNetworth";
import {
  rawToGearItem,
  recombTier,
  tierFromGearLore,
} from "../../networth/gear";
import type { RawItem } from "../../networth/types";
import {
  resourceCategoryFor,
  resourceNameFor,
  resourceTierFor,
} from "../../items/itemResource";
import {
  gearBonuses,
  type ProfileGearBonusView,
  type ProfileGearItemView,
  type ProfileSkillView,
  type ProfileViewModel,
} from "../../profile/profileViewModel";
import { ItemIcon } from "../../ui/ItemIcon";
import { ItemTooltip } from "../../ui/ItemTooltip";
import { rarityTileClass } from "../../ui/kit";
import "./skills-preview.css";

type HighlightSkillKey = "MINING" | "FORAGING" | "FARMING" | "FISHING" | "ENCHANTING" | "HUNTING";

interface HighlightSkillSpec {
  key: HighlightSkillKey;
  label: string;
  fallbackIcon: string;
  statTerms: readonly string[];
  armourKeywords: readonly string[];
  itemKeywords: readonly string[];
}

interface SkillContextSpec {
  key: string;
  label: string;
  requiredKeywords?: readonly string[];
  requiredStats?: readonly string[];
  excludedKeywords?: readonly string[];
}

interface ArmourCandidate {
  key: string;
  name: string;
  items: readonly ProfileGearItemView[];
}

interface SkillGearContext {
  key: string;
  label: string;
  armour: ArmourCandidate | null;
  armourBonuses: readonly ProfileGearBonusView[];
  gear: readonly ProfileGearItemView[];
}

const SKILL_SPECS: readonly HighlightSkillSpec[] = [
  {
    key: "MINING",
    label: "Mining",
    fallbackIcon: "Diamond Pickaxe",
    statTerms: ["Mining Fortune", "Mining Speed", "Pristine"],
    armourKeywords: ["divan", "sorrow", "glacite", "mineral", "yog", "goblin", "miner"],
    itemKeywords: ["drill", "pickaxe", "mining", "gemstone gauntlet", "titanium", "divan"],
  },
  {
    key: "FORAGING",
    label: "Foraging",
    fallbackIcon: "Oak Sapling",
    statTerms: ["Foraging Fortune", "Foraging Speed"],
    armourKeywords: ["foraging", "lumberjack", "growth", "galatea"],
    itemKeywords: ["treecapitator", "jungle axe", "foraging", "sweep", "axe"],
  },
  {
    key: "FARMING",
    label: "Farming",
    fallbackIcon: "Golden Hoe",
    statTerms: ["Farming Fortune", "Bonus Pest Chance"],
    armourKeywords: ["fermento", "squash", "cropie", "melon", "farm suit", "farm armor"],
    itemKeywords: ["hoe", "melon dicer", "coco chopper", "fungi cutter", "cactus knife", "vacuum", "farming"],
  },
  {
    key: "FISHING",
    label: "Fishing",
    fallbackIcon: "Fishing Rod",
    statTerms: ["Fishing Speed", "Sea Creature Chance", "Trophy Fish Chance"],
    armourKeywords: ["angler", "salmon", "sponge", "shark", "diver", "magma lord", "thunder", "hunter"],
    itemKeywords: ["fishing rod", "rod", "fishing", "hook", "chumcap", "fillet"],
  },
  {
    key: "ENCHANTING",
    label: "Enchanting",
    fallbackIcon: "Enchanting Table",
    statTerms: ["Enchanting Wisdom"],
    armourKeywords: ["enchanting"],
    itemKeywords: ["enchanting", "experimentation"],
  },
  {
    key: "HUNTING",
    label: "Hunting",
    fallbackIcon: "Hunting Box",
    statTerms: ["Hunting Fortune", "Hunting Wisdom"],
    armourKeywords: ["hunting", "hunter"],
    itemKeywords: ["huntaxe", "hunting", "tracker", "trap", "lure"],
  },
];

const DEFAULT_CONTEXT: readonly SkillContextSpec[] = [{ key: "default", label: "Best owned setup" }];
const FISHING_CONTEXTS: readonly SkillContextSpec[] = [
  {
    key: "water",
    label: "Water fishing",
    excludedKeywords: ["magma lord", "lava", "trophy hunter", "bronze hunter", "silver hunter", "gold hunter", "diamond hunter"],
  },
  {
    key: "lava",
    label: "Lava fishing",
    requiredKeywords: ["magma lord", "lava", "thunder", "hellfire", "inferno", "moogma", "slug"],
  },
  {
    key: "trophy",
    label: "Trophy fishing",
    requiredKeywords: ["trophy", "bronze hunter", "silver hunter", "gold hunter", "diamond hunter"],
    requiredStats: ["Trophy Fish Chance"],
  },
];

const fold = (value: string): string => value
  .replace(/§[0-9a-fk-or]/gi, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const itemText = (item: ProfileGearItemView): string => fold([
  item.id,
  item.name,
  ...(item.lore ?? []),
].join(" "));

const hasAny = (text: string, terms: readonly string[]): boolean => {
  const haystack = ` ${fold(text)} `;
  return terms.some((term) => haystack.includes(` ${fold(term)} `));
};

const statValue = (item: ProfileGearItemView, terms: readonly string[]): number => {
  let total = 0;
  for (const rawLine of item.lore ?? []) {
    const line = rawLine.replace(/§[0-9a-fk-or]/gi, "").trim();
    if (!hasAny(fold(line), terms)) continue;
    const match = /[+-]?\d[\d,]*(?:\.\d+)?/.exec(line);
    if (!match) continue;
    const value = Number(match[0].replace(/,/g, ""));
    if (Number.isFinite(value)) total += Math.abs(value);
  }
  return total;
};

const armourName = (items: readonly ProfileGearItemView[]): string => {
  const bases = items.map((item) => {
    const name = item.name.replace(/[✦✪]+/gu, "").trim();
    const namedFor = /\b(?:helmet|chestplate|leggings|boots)\s+of\s+(.+)$/i.exec(name);
    return (namedFor?.[1] ?? name.replace(/(?:\s+|(?<=[a-z]))(?:helmet|chestplate|leggings|boots|mail|hat|cap|trousers|striders)$/i, "")).trim();
  });
  const unique = [...new Set(bases)];
  return unique.length === 1 ? `${unique[0]} armour` : "Mixed armour";
};

const rawItemView = (entry: unknown): ProfileGearItemView | null => {
  const item = rawToGearItem(entry as RawItem);
  if (!item) return null;
  const loreTier = tierFromGearLore(item.lore);
  const catalogueTier = resourceTierFor(item.id) ?? resourceTierFor(item.name);
  return {
    id: item.id,
    name: item.name,
    wikiName: (resourceNameFor(item.id) ?? item.name).replace(/\s+[✦✪]+$/u, "").trim(),
    count: item.count,
    rarity: loreTier ?? recombTier(catalogueTier, item.extra?.recomb === true),
    ...(item.extra ? { extra: item.extra } : {}),
    ...(item.lore ? { lore: item.lore } : {}),
  };
};

const armourCandidates = (model: ProfileViewModel): ArmourCandidate[] => {
  const candidates: ArmourCandidate[] = [];
  const add = (key: string, pieces: readonly (ProfileGearItemView | null)[]) => {
    const items = pieces.filter((item): item is ProfileGearItemView => item !== null);
    if (items.length === 0) return;
    candidates.push({ key, name: armourName(items), items });
  };
  add("equipped", model.loadout.armour);
  for (const slot of model.loadout.armourWardrobe.slots) {
    if (slot.state === "occupied") add(`wardrobe-${slot.id ?? slot.label}`, slot.pieces);
  }
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const signature = candidate.items.map((item) => item.id).join("|");
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
};

const NON_GEAR_CATEGORIES = new Set(["armor", "wardrobe", "museum", "pets", "accessories", "sacks", "essence"]);
const GEAR_CATEGORY = /\b(?:armor|helmet|chestplate|leggings|boots|necklace|cloak|belt|gloves|bracelet|gauntlet|equipment|fishing rod|pickaxe|drill|axe|hoe|shovel|tool|weapon|sword|bow|wand)\b/;
const GEAR_NAME = /\b(?:rod|pickaxe|drill|gauntlet|hoe|axe|vacuum|knife|cutter|chopper|dicer|necklace|cloak|belt|gloves|bracelet|huntaxe|tracker|trap|lure)\b/;

const ownedGearItems = (parsed: ParsedItems | null): ProfileGearItemView[] => {
  if (!parsed) return [];
  const out: ProfileGearItemView[] = [];
  for (const [category, entries] of Object.entries(parsed)) {
    if (NON_GEAR_CATEGORIES.has(category) || !Array.isArray(entries)) continue;
    for (const entry of entries) {
      const item = rawItemView(entry);
      if (!item) continue;
      const categoryName = fold(resourceCategoryFor(item.id) ?? "");
      const text = itemText(item);
      if (/\b(?:helmet|chestplate|leggings|boots)\b/.test(`${categoryName} ${text}`)) continue;
      if (categoryName && !GEAR_CATEGORY.test(categoryName)) continue;
      if (!categoryName && !GEAR_NAME.test(text)) continue;
      out.push(item);
    }
  }
  return out;
};

const contextMatches = (text: string, context: SkillContextSpec): boolean => {
  if (context.excludedKeywords && hasAny(text, context.excludedKeywords)) return false;
  if (!context.requiredKeywords?.length && !context.requiredStats?.length) return true;
  return hasAny(text, context.requiredKeywords ?? []) || hasAny(text, context.requiredStats ?? []);
};

const relevanceScore = (
  item: ProfileGearItemView,
  spec: HighlightSkillSpec,
  context: SkillContextSpec,
): number => {
  const text = itemText(item);
  const stats = statValue(item, spec.statTerms);
  const keyword = hasAny(text, spec.itemKeywords) || hasAny(text, spec.armourKeywords);
  if (stats <= 0 && !keyword) return 0;
  const contextual = hasAny(text, [...(context.requiredKeywords ?? []), ...(context.requiredStats ?? [])]);
  return stats * 10 + (keyword ? 100 : 0) + (contextual ? 10_000 : 0);
};

const bestArmour = (
  candidates: readonly ArmourCandidate[],
  spec: HighlightSkillSpec,
  context: SkillContextSpec,
): ArmourCandidate | null => {
  let winner: { candidate: ArmourCandidate; score: number } | null = null;
  for (const candidate of candidates) {
    const text = fold(candidate.items.map(itemText).join(" "));
    if (!contextMatches(text, context)) continue;
    const relevance = candidate.items.reduce((sum, item) => sum + relevanceScore(item, spec, context), 0);
    if (relevance <= 0) continue;
    const score = relevance + (candidate.items.length === 4 ? 250 : 0);
    if (winner && winner.score >= score) continue;
    winner = { candidate, score };
  }
  return winner?.candidate ?? null;
};

const bestGear = (
  items: readonly ProfileGearItemView[],
  spec: HighlightSkillSpec,
  context: SkillContextSpec,
): ProfileGearItemView[] => {
  const byId = new Map<string, { item: ProfileGearItemView; score: number }>();
  for (const item of items) {
    if (context.excludedKeywords && hasAny(itemText(item), context.excludedKeywords)) continue;
    const score = relevanceScore(item, spec, context);
    if (score <= 0) continue;
    const key = `${item.id}:${fold(item.name)}`;
    const existing = byId.get(key);
    if (!existing || score > existing.score) byId.set(key, { item, score });
  }
  return [...byId.values()]
    .sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name))
    .slice(0, 8)
    .map(({ item }) => item);
};

const buildSkillGearContexts = (
  model: ProfileViewModel,
  parsed: ParsedItems | null,
  spec: HighlightSkillSpec,
): SkillGearContext[] => {
  const armour = armourCandidates(model);
  const items = ownedGearItems(parsed);
  const contexts = spec.key === "FISHING" ? FISHING_CONTEXTS : DEFAULT_CONTEXT;
  return contexts.map((context) => {
    const selectedArmour = bestArmour(armour, spec, context);
    return {
      key: context.key,
      label: context.label,
      armour: selectedArmour,
      armourBonuses: selectedArmour ? gearBonuses(selectedArmour.items) : [],
      gear: bestGear(items, spec, context),
    };
  });
};

const exactNumber = (value: number | undefined): string =>
  value === undefined ? "Unavailable" : value.toLocaleString("en-US", { maximumFractionDigits: 3 });

const skillFor = (skills: readonly ProfileSkillView[], spec: HighlightSkillSpec): ProfileSkillView | null =>
  skills.find((skill) => fold(skill.key) === fold(spec.key) || fold(skill.name) === fold(spec.label)) ?? null;

const ARMOUR_SLOT_LABELS = ["Helmet", "Chestplate", "Leggings", "Boots"] as const;

const armourSlotLabel = (item: ProfileGearItemView, index: number): string => {
  const match = /\b(helmet|chestplate|leggings|boots)\b/i.exec(item.name);
  if (match) return match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
  return ARMOUR_SLOT_LABELS[index] ?? "Armour";
};

const SkillStatList: React.FC<{
  bonuses: readonly ProfileGearBonusView[];
  label: string;
  emptyLabel?: string;
}> = ({ bonuses, label, emptyLabel = "No item stats available" }) => {
  if (bonuses.length === 0) return <span className="profile-skill-empty profile-skill-empty--stats">{emptyLabel}</span>;
  return (
    <span className="profile-skill-stat-list" aria-label={label}>
      {bonuses.map((bonus) => (
        <span
          className={`profile-gear-bonus profile-skill-stat ${bonus.colorClass}`}
          aria-label={`${bonus.value} ${bonus.name}`}
          key={bonus.name}
        >
          <span className="profile-gear-bonus-glyph" aria-hidden>{bonus.glyph}</span>
          <span className="profile-gear-bonus-name">{bonus.name}</span>
          <strong className="profile-number">{bonus.value}</strong>
        </span>
      ))}
    </span>
  );
};

const SkillItemIcon: React.FC<{
  item: ProfileGearItemView;
  kind: "armour" | "gear";
  slotLabel?: string;
}> = ({ item, kind, slotLabel }) => {
  const armour = kind === "armour";
  const bonuses = gearBonuses([item]);
  const icon = <ItemIcon name={item.wikiName} id={item.id} hypixelId={item.id} size={armour ? 38 : 42} fallback="blank" />;
  return (
    <ItemTooltip
      id={item.id}
      name={item.name}
      wikiName={item.wikiName}
      icon={icon}
      count={item.count}
      tier={item.rarity}
      tierIsDisplayed={Boolean(item.rarity)}
      extra={item.extra}
      lore={item.lore}
      ariaLabel={item.name}
      wrapperClassName={armour ? "profile-skill-armour-item-wrap" : "profile-skill-gear-item-wrap"}
      interactive
    >
      <button
        type="button"
        className={`${armour ? "profile-skill-armour-item" : "profile-skill-gear-item"} ${rarityTileClass(item.rarity)}`}
        data-profile-item-tier={item.rarity?.toLowerCase().replace(/_/g, "-") ?? "unknown"}
        {...(armour ? { "data-profile-skill-armour-piece": slotLabel ?? "Armour" } : { "data-profile-skill-gear-item": item.id })}
      >
        <span className="profile-skill-item-icon" aria-hidden>{icon}</span>
        <span className="profile-skill-item-copy">
          {armour && <small>{slotLabel}</small>}
          <strong>{item.name}</strong>
          {armour ? (
            <small className="profile-skill-item-rarity">{item.rarity?.replace(/_/g, " ") ?? "Owned"}</small>
          ) : (
            <SkillStatList bonuses={bonuses} label={`${item.name} stats`} />
          )}
        </span>
      </button>
    </ItemTooltip>
  );
};

const SkillContextCard: React.FC<{ context: SkillGearContext; spec: HighlightSkillSpec }> = ({ context, spec }) => (
  <section className="profile-skill-context" aria-label={context.label}>
    <header>
      <strong>{context.label}</strong>
    </header>
    <div className="profile-skill-context-body">
      <section className="profile-skill-armour">
        <div className="profile-skill-section-heading">
          <small>Best owned armour</small>
          {context.armour && <strong>{context.armour.name}</strong>}
        </div>
        {context.armour ? (
          <div className="profile-skill-armour-detail">
            <div className="profile-skill-armour-items" data-profile-skill-armour-layout="vertical">
              {context.armour.items.map((item, index) => (
                <SkillItemIcon
                  item={item}
                  kind="armour"
                  slotLabel={armourSlotLabel(item, index)}
                  key={`${context.key}:${item.id}:${index}`}
                />
              ))}
            </div>
            <div className="profile-skill-armour-stats">
              <small>Armour stats</small>
              <SkillStatList
                bonuses={context.armourBonuses}
                label={`${context.armour.name} combined stats`}
                emptyLabel="No armour stats available"
              />
            </div>
          </div>
        ) : <span className="profile-skill-empty">No matching armour found</span>}
      </section>
      <section className="profile-skill-gear">
        <div className="profile-skill-section-heading">
          <small>Tools &amp; gear</small>
        </div>
        {context.gear.length > 0 ? (
          <div className="profile-skill-gear-grid">
            {context.gear.map((item, index) => (
              <SkillItemIcon item={item} kind="gear" key={`${spec.key}:${context.key}:${item.id}:${index}`} />
            ))}
          </div>
        ) : <span className="profile-skill-empty">No matching owned gear found</span>}
      </section>
    </div>
  </section>
);

export const SkillsPreview: React.FC<{
  model: ProfileViewModel;
  parsed: ParsedItems | null;
}> = ({ model, parsed }) => {
  const [selectedKey, setSelectedKey] = useState<HighlightSkillKey>("MINING");
  const selectedSpec = SKILL_SPECS.find((spec) => spec.key === selectedKey) ?? SKILL_SPECS[0];
  const selectedSkill = skillFor(model.skills, selectedSpec);
  const contexts = useMemo(
    () => buildSkillGearContexts(model, parsed, selectedSpec),
    [model, parsed, selectedSpec],
  );
  const progress = selectedSkill?.progress ?? 0;
  const remaining = selectedSkill?.xpForNext === null
    ? null
    : selectedSkill?.xpForNext === undefined || selectedSkill.xpInto === undefined
      ? undefined
      : Math.max(0, selectedSkill.xpForNext - selectedSkill.xpInto);

  return (
    <section className="profile-skills-detail profile-glass" data-profile-skill={selectedSpec.key.toLowerCase()}>
      <nav className="profile-skill-tabs" aria-label="Skills" role="tablist">
        {SKILL_SPECS.map((spec) => {
          const skill = skillFor(model.skills, spec);
          const active = selectedKey === spec.key;
          return (
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className={active ? "is-active" : ""}
              onClick={() => setSelectedKey(spec.key)}
              key={spec.key}
            >
              <span aria-hidden>
                <ItemIcon
                  name={skill?.icon ?? spec.fallbackIcon}
                  id={skill?.iconId ?? skill?.icon ?? spec.fallbackIcon}
                  size={25}
                  fallback="initials"
                />
              </span>
              <span>{spec.label}</span>
              <small className="profile-number">{skill?.level === null || skill?.level === undefined ? "--" : skill.level}</small>
            </button>
          );
        })}
      </nav>

      <section className="profile-skill-panel" role="tabpanel" aria-label={`${selectedSpec.label} details`}>
        <header className="profile-skill-panel-head">
          <span className="profile-skill-panel-icon" aria-hidden>
            <ItemIcon
              name={selectedSkill?.icon ?? selectedSpec.fallbackIcon}
              id={selectedSkill?.iconId ?? selectedSkill?.icon ?? selectedSpec.fallbackIcon}
              size={42}
              fallback="initials"
            />
          </span>
          <div className="profile-skill-panel-title">
            <small>{selectedSpec.label}</small>
            <strong>{selectedSkill?.level === null || selectedSkill?.level === undefined ? "Level unavailable" : `Level ${selectedSkill.level}`}</strong>
          </div>
          <dl className="profile-skill-facts">
            <div><dt>Lifetime XP</dt><dd className="profile-number">{exactNumber(selectedSkill?.lifetimeXp)}</dd></div>
            <div><dt>Current level</dt><dd className="profile-number">{selectedSkill?.xpForNext === null ? "At cap" : `${exactNumber(selectedSkill?.xpInto)} / ${exactNumber(selectedSkill?.xpForNext ?? undefined)}`}</dd></div>
            <div><dt>Remaining</dt><dd className="profile-number">{remaining === null ? "At cap" : exactNumber(remaining)}</dd></div>
            <div><dt>Skill cap</dt><dd className="profile-number">{selectedSkill?.capLevel ?? "Unavailable"}</dd></div>
          </dl>
          {selectedSkill?.progress !== null && selectedSkill?.progress !== undefined && (
            <span className="profile-skill-progress" role="progressbar" aria-label={`${selectedSpec.label} level progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
              <i style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
            </span>
          )}
        </header>

        <div className={`profile-skill-contexts ${contexts.length > 1 ? "profile-skill-contexts--multi" : ""}`}>
          {contexts.map((context) => <SkillContextCard context={context} spec={selectedSpec} key={context.key} />)}
        </div>
      </section>
    </section>
  );
};

export default SkillsPreview;
