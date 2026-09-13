import React, { useMemo, useState } from "react";
import type { ProfileStatusView } from "../../profile/profileStatus";
import { coins, exactCoins } from "../../networth/format";
import type { Coverage } from "../../networth/useNetworth";
import type { ParsedItems } from "../../networth/profileNetworth";
import type { Catalogue, NetworthResult } from "../../networth/types";
import { itemStatsFromRecord, type ItemTooltipValue } from "../../ui/itemTooltipModel";
import { ItemIcon } from "../../ui/ItemIcon";
import { ItemTooltip } from "../../ui/ItemTooltip";
import {
  buildMuseumPreviewModel,
  resolveProfileSectionState,
  type MuseumCompletion,
  type MuseumCollectionItem,
  type MuseumCollectionUnit,
  type MuseumDonationGroup,
  type MuseumPreviewModel,
  type ProfileSectionState,
} from "../../profile/riftMuseumDungeons";
import {
  ProfilePbcDisclosure,
  ProfilePbcEmpty,
  ProfilePbcHeader,
  ProfilePbcLoading,
  ProfilePbcStatusLine,
  ProfilePbcUnavailable,
} from "./ProfilePbcShared";
import { ProfileItemTile } from "./ProfileItemTile";
import { ProfileProgressionFilters } from "./ProfileProgressionFilters";
import "./rift-museum-dungeons.css";
import "./museum-preview.css";

const MUSEUM_CATEGORY_ORDER = [
  "Armour & equipment",
  "Weapons",
  "Tools",
  "Accessories",
  "Other donations",
] as const;

type MuseumCategoryName = typeof MUSEUM_CATEGORY_ORDER[number];

interface MuseumCategoryGroup {
  name: MuseumCategoryName;
  rows: ReadonlyArray<MuseumPreviewModel["donations"][number]>;
}

type MuseumDonationRow = MuseumPreviewModel["donations"][number];
type MuseumGearKind = "Armour" | "Equipment";

interface MuseumGearColumn {
  key: string;
  kind: MuseumGearKind;
  rows: readonly MuseumDonationRow[];
}

const ARMOUR_SLOT_ORDER = ["helmet", "chestplate", "leggings", "boots"] as const;
const EQUIPMENT_SLOT_ORDER = ["necklace", "cloak", "belt", "gloves"] as const;

const museumGearSlot = (row: MuseumDonationRow): string => {
  const source = `${row.category ?? ""} ${row.id ?? ""} ${row.name}`.toLowerCase();
  if (/helmet|fedora|mask|hat|crown|goggles|hood|bonnet|head/.test(source)) return "helmet";
  if (/chestplate|tunic|jacket|shirt|coat|vest/.test(source)) return "chestplate";
  if (/leggings|trousers|pants/.test(source)) return "leggings";
  if (/boots|shoes|sandals|galoshes|slippers/.test(source)) return "boots";
  if (/necklace/.test(source)) return "necklace";
  if (/cloak/.test(source)) return "cloak";
  if (/belt/.test(source)) return "belt";
  if (/gloves|gauntlet|bracelet/.test(source)) return "gloves";
  return /equipment/.test(source) ? "gloves" : "helmet";
};

const museumGearKind = (row: MuseumDonationRow): MuseumGearKind => {
  const category = row.category?.toUpperCase() ?? "";
  return /NECKLACE|CLOAK|BELT|GLOVES|BRACELET|GAUNTLET|EQUIPMENT/.test(category)
    || /necklace|cloak|belt|gloves|bracelet|gauntlet/i.test(row.name)
    ? "Equipment"
    : "Armour";
};

const museumGearFamily = (row: MuseumDonationRow, slot: string): string => {
  const id = (row.id ?? "").toUpperCase().replace(/_INSIDE$/, "");
  const strippedId = id.replace(
    /_(?:HELMET|CHESTPLATE|LEGGINGS|BOOTS|NECKLACE|CLOAK|BELT|GLOVES|GLOVE|BRACELET|GAUNTLET)$/,
    "",
  );
  if (strippedId && strippedId !== id) return strippedId.toLowerCase();
  const strippedName = row.name
    .replace(new RegExp(`\\b${slot}\\b`, "ig"), "")
    .replace(/\b(?:fedora|mask|hat|crown|goggles|hood|bonnet|tunic|jacket|shirt|coat|vest|trousers|pants|shoes|sandals|galoshes|slippers|bracelet|gauntlet)\b/ig, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
  return strippedName || (row.id ?? row.key).toLowerCase();
};

const museumGearColumns = (rows: readonly MuseumDonationRow[]): MuseumGearColumn[] => {
  const grouped = new Map<string, { kind: MuseumGearKind; rows: MuseumDonationRow[] }>();
  for (const row of rows) {
    const kind = museumGearKind(row);
    const slot = museumGearSlot(row);
    const family = museumGearFamily(row, slot);
    const key = `${kind}:${family}`;
    const group = grouped.get(key) ?? { kind, rows: [] };
    group.rows.push(row);
    grouped.set(key, group);
  }
  const columns = [...grouped.entries()]
    .map(([key, group]) => {
      const order = group.kind === "Armour" ? ARMOUR_SLOT_ORDER : EQUIPMENT_SLOT_ORDER;
      return {
        key,
        kind: group.kind,
        rows: group.rows.slice().sort((left, right) => {
          const slotDelta = order.indexOf(museumGearSlot(left) as never) - order.indexOf(museumGearSlot(right) as never);
          return slotDelta || left.name.localeCompare(right.name);
        }),
      };
    })
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.key.localeCompare(right.key));

  return (["Armour", "Equipment"] as const).flatMap((kind) => {
    const kindColumns = columns.filter((column) => column.kind === kind);
    const complete = kindColumns.filter((column) => column.rows.length === 4);
    const partialRows = kindColumns
      .filter((column) => column.rows.length !== 4)
      .flatMap((column) => column.rows);
    const packed: MuseumGearColumn[] = [];
    for (let index = 0; index < partialRows.length; index += 4) {
      packed.push({
        key: `${kind}:partial-${index / 4}`,
        kind,
        rows: partialRows.slice(index, index + 4),
      });
    }
    return [...complete, ...packed];
  });
};

const museumCategoryName = (category: string | null | undefined): MuseumCategoryName => {
  const value = category?.trim().toUpperCase() ?? "";
  if (/ACCESSORY|TALISMAN/.test(value)) return "Accessories";
  if (/HELMET|CHESTPLATE|LEGGINGS|BOOTS|NECKLACE|CLOAK|BELT|GLOVES|BRACELET|EQUIPMENT|ARMOU?R/.test(value)) {
    return "Armour & equipment";
  }
  if (/SWORD|BOW|WAND|GAUNTLET|WEAPON/.test(value)) return "Weapons";
  if (/PICKAXE|DRILL|AXE|HOE|SHOVEL|SHEARS|FISHING_ROD|FARMING_TOOL|TOOL/.test(value)) return "Tools";
  return "Other donations";
};

const museumCategoryGroups = (rows: MuseumPreviewModel["donations"]): MuseumCategoryGroup[] => {
  const grouped = new Map<MuseumCategoryName, MuseumPreviewModel["donations"][number][]>();
  for (const row of rows) {
    const name = museumCategoryName(row.category);
    const group = grouped.get(name) ?? [];
    group.push(row);
    grouped.set(name, group);
  }
  return MUSEUM_CATEGORY_ORDER.flatMap((name) => {
    const group = grouped.get(name);
    if (!group?.length) return [];
    return [{ name, rows: group.slice().sort((a, b) => a.name.localeCompare(b.name)) }];
  });
};

export interface MuseumPreviewProps {
  status: ProfileStatusView;
  /** Preferred seam: a sanitized model prepared by the profile data layer. */
  model?: MuseumPreviewModel | null;
  /** Backward-compatible raw adapter for the current local profile shell. */
  parsed?: ParsedItems | null;
  result?: NetworthResult | null;
  coverage?: Pick<Coverage, "museumShared"> | null;
  sourceState?: Exclude<ProfileSectionState, "loading" | "partial" | "populated" | "empty">;
  completion?: MuseumCompletion | null;
  catalogue?: Catalogue | null;
  itemNameFor?: (id: string) => string | null;
  itemCategoryFor?: (id: string) => string | null;
  error?: string | null;
}

const StatePanel: React.FC<{
  state: Exclude<ProfileSectionState, "partial" | "populated" | "empty">;
  status: ProfileStatusView;
  error?: string | null;
}> = ({ state, status, error = null }) => {
  if (state === "loading") return <ProfilePbcLoading rows={7} />;
  if (state === "private" || state === "unavailable") {
    return <ProfilePbcUnavailable status={status} noun="Museum" error={error} />;
  }
  return <ProfilePbcEmpty>The Museum has not been opened on this profile.</ProfilePbcEmpty>;
};

const DonationTile: React.FC<{ row: MuseumPreviewModel["donations"][number] }> = ({ row }) => {
  const values: ItemTooltipValue[] = row.value === null ? [] : [{ label: "Museum value", value: exactCoins(row.value) }];
  return (
    <ProfileItemTile
      id={row.id}
      name={row.name}
      wikiName={row.name}
      iconId={row.id ?? row.name}
      hypixelId={row.id}
      count={row.count}
      tier={row.tier}
      tierIsDisplayed
      lore={row.lore}
      values={values}
      provenance="Museum"
      ariaLabel={`${row.name}, ${row.count.toLocaleString()} donated`}
    />
  );
};

const museumRepresentativeItem = (unit: MuseumCollectionUnit): MuseumCollectionItem => (
  unit.items.find((item) => /HELMET|HAT|MASK|CROWN|HOOD|HEAD/i.test(`${item.category ?? ""} ${item.id} ${item.name}`))
  ?? unit.items[0]
);

const museumAcceptedItem = (unit: MuseumCollectionUnit): MuseumCollectionItem | null => (
  unit.items.find((item) => Boolean(item.acceptedBy)) ?? null
);

const CollectionItemTile: React.FC<{
  item: MuseumCollectionItem;
  state: MuseumCollectionUnit["state"];
}> = ({ item, state }) => {
  const row = item.donation;
  const values: ItemTooltipValue[] = row?.value === null || row?.value === undefined
    ? []
    : [{ label: "Museum value", value: exactCoins(row.value) }];
  const acceptedBy = item.acceptedBy?.trim() || null;
  const status = acceptedBy
    ? `Accepted via ${acceptedBy}`
    : state === "donated" ? "Donated" : state === "borrowed" ? "Borrowed" : "Missing";
  return (
    <span className={`profile-museum-unit-item profile-museum-unit-item--${state}`}>
      <ProfileItemTile
        id={item.id}
        name={item.name}
        wikiName={item.name}
        iconId={acceptedBy ? "INK_SACK:10" : item.id}
        iconName={acceptedBy ? "Lime Dye" : item.name}
        hypixelId={acceptedBy ? "INK_SACK:10" : item.id}
        count={row?.count ?? 1}
        tier={row?.tier ?? item.tier}
        tierIsDisplayed={Boolean(row?.tier ?? item.tier)}
        stats={itemStatsFromRecord(item.stats)}
        lore={row?.lore ?? []}
        values={values}
        metadata={[{ label: "Museum", value: status }]}
        provenance="Museum"
        ariaLabel={`${item.name}, ${status.toLowerCase()}`}
      />
    </span>
  );
};

const MuseumBundleCollection: React.FC<{
  units: readonly MuseumCollectionUnit[];
  label: string;
}> = ({ units, label }) => {
  return (
    <div className="profile-museum-category-body">
      <div className="profile-museum-set-columns" aria-label={label} data-museum-bundle-count={units.length}>
        {units.map((unit) => {
              const representative = museumRepresentativeItem(unit);
              const row = representative.donation;
              const acceptedItem = museumAcceptedItem(unit);
              const acceptedBy = unit.acceptedBy?.trim() || acceptedItem?.acceptedBy?.trim() || null;
              const status = acceptedBy
                ? `Accepted via ${acceptedBy}`
                : unit.state === "donated" ? "Donated" : unit.state === "borrowed" ? "Borrowed" : "Missing";
              const icon = (
                <ItemIcon
                  name={unit.acceptedBy ? "Lime Dye" : representative.name}
                  id={unit.acceptedBy ? "INK_SACK:10" : representative.id}
                  hypixelId={unit.acceptedBy ? "INK_SACK:10" : representative.id}
                  size={32}
                  fallback="blank"
                />
              );
              return (
                <div className={`profile-museum-set-stack profile-museum-set-stack--${unit.state}`} key={unit.key}>
                  <ItemTooltip
                    name={unit.label}
                    wikiName={representative.name}
                    icon={icon}
                    tier={row?.tier ?? representative.tier}
                    tierIsDisplayed={Boolean(row?.tier ?? representative.tier)}
                    stats={itemStatsFromRecord(representative.stats)}
                    lore={row?.lore ?? []}
                    metadata={[{ label: "Museum", value: status }]}
                    ariaLabel={`${unit.label}, ${status.toLowerCase()}`}
                    wrapperClassName="profile-museum-set-trigger"
                    interactive
                  >
                    <button
                      type="button"
                      className="profile-museum-set-button"
                    >
                      <span className="profile-museum-set-icon" aria-hidden>{icon}</span>
                      <span className="profile-museum-set-copy">
                        <strong>{unit.label}</strong>
                        <small>{status}</small>
                      </span>
                      {acceptedItem && !unit.acceptedBy && (
                        <span className="profile-museum-set-upgrade" title="A mapped higher or alternate form satisfies this Museum entry" aria-label="Higher or alternate form accepted">
                          <ItemIcon name="Lime Dye" id="INK_SACK:10" size={18} fallback="blank" />
                        </span>
                      )}
                    </button>
                  </ItemTooltip>
                </div>
              );
            })}
      </div>
    </div>
  );
};

const MuseumIndividualUnits: React.FC<{
  units: readonly MuseumCollectionUnit[];
  label: string;
}> = ({ units, label }) => {
  const groups = MUSEUM_CATEGORY_ORDER.flatMap((name) => {
    const matching = units.filter((unit) => museumCategoryName(unit.items[0]?.category) === name);
    return matching.length > 0 ? [{ name, units: matching }] : [];
  });
  return (
    <div className="profile-museum-category-body">
      <div className="profile-museum-unit-groups" aria-label={label}>
        {groups.map((group) => (
          <section className="profile-museum-unit-group" key={group.name}>
            <header><strong>{group.name}</strong><span>{group.units.length.toLocaleString()}</span></header>
            <div className="profile-rmd-item-grid profile-item-grid">
              {group.units.map((unit) => (
                <CollectionItemTile key={unit.key} item={unit.items[0]} state={unit.state} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

type MuseumMissingKind = MuseumCollectionUnit["kind"];

const MUSEUM_MISSING_KIND_LABEL: Record<MuseumMissingKind, string> = {
  set: "Sets",
  item: "Individual items",
};

const museumMissingCategory = (unit: MuseumCollectionUnit): MuseumCategoryName =>
  museumCategoryName(unit.museumCategory ?? unit.items[0]?.category);

const museumMissingTextMatch = (unit: MuseumCollectionUnit, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [unit.label, unit.museumCategory, ...unit.items.flatMap((item) => [item.name, item.id, item.category])]
    .some((value) => value?.toLowerCase().includes(needle));
};

export const MuseumMissingCollection: React.FC<{ units: readonly MuseumCollectionUnit[] }> = ({ units }) => {
  const [query, setQuery] = useState("");
  const [kindFilters, setKindFilters] = useState<MuseumMissingKind[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<MuseumCategoryName[]>([]);
  const textMatches = useMemo(() => units.filter((unit) => museumMissingTextMatch(unit, query)), [query, units]);
  const kindOptions = useMemo(
    () => (["set", "item"] as const).filter((kind) => units.some((unit) => unit.kind === kind)),
    [units],
  );
  const categoryOptions = useMemo(
    () => MUSEUM_CATEGORY_ORDER.filter((category) => units.some((unit) => museumMissingCategory(unit) === category)),
    [units],
  );
  const kindCounts = useMemo(() => new Map(kindOptions.map((kind) => [kind, textMatches.filter((unit) =>
    unit.kind === kind && (categoryFilters.length === 0 || categoryFilters.includes(museumMissingCategory(unit)))).length])),
  [categoryFilters, kindOptions, textMatches]);
  const categoryCounts = useMemo(() => new Map(categoryOptions.map((category) => [category, textMatches.filter((unit) =>
    museumMissingCategory(unit) === category && (kindFilters.length === 0 || kindFilters.includes(unit.kind))).length])),
  [categoryOptions, kindFilters, textMatches]);
  const filtered = useMemo(() => textMatches.filter((unit) =>
    (kindFilters.length === 0 || kindFilters.includes(unit.kind))
    && (categoryFilters.length === 0 || categoryFilters.includes(museumMissingCategory(unit)))),
  [categoryFilters, kindFilters, textMatches]);
  const sets = filtered.filter((unit) => unit.kind === "set");
  const items = filtered.filter((unit) => unit.kind === "item");
  const toggleKind = (kind: MuseumMissingKind) => setKindFilters((current) => current.includes(kind)
    ? current.filter((value) => value !== kind)
    : [...current, kind]);
  const toggleCategory = (category: MuseumCategoryName) => setCategoryFilters((current) => current.includes(category)
    ? current.filter((value) => value !== category)
    : [...current, category]);
  const clear = () => {
    setQuery("");
    setKindFilters([]);
    setCategoryFilters([]);
  };
  return (
    <div className="profile-museum-missing-sections">
      <ProfileProgressionFilters
        query={query}
        onQueryChange={setQuery}
        searchLabel="Search missing Museum items and sets"
        placeholder="Search missing Museum items and sets"
        activeCount={kindFilters.length + categoryFilters.length}
        resultCount={filtered.length}
        totalCount={units.length}
        onClear={clear}
        groups={[{
          legend: "Donation type",
          options: kindOptions.map((kind) => {
            const count = kindCounts.get(kind) ?? 0;
            const selected = kindFilters.includes(kind);
            return {
              id: kind,
              label: MUSEUM_MISSING_KIND_LABEL[kind],
              count,
              selected,
              disabled: count === 0 && !selected,
              onToggle: () => toggleKind(kind),
            };
          }),
        }, {
          legend: "Museum category",
          options: categoryOptions.map((category) => {
            const count = categoryCounts.get(category) ?? 0;
            const selected = categoryFilters.includes(category);
            return {
              id: category,
              label: category,
              count,
              selected,
              disabled: count === 0 && !selected,
              onToggle: () => toggleCategory(category),
            };
          }),
        }]}
      />
      {sets.length > 0 && (
        <section className="profile-museum-missing-section">
          <header><strong>Armour & equipment sets</strong><span>{sets.length.toLocaleString()} missing</span></header>
          <MuseumBundleCollection units={sets} label="Missing Museum sets" />
        </section>
      )}
      {items.length > 0 && (
        <section className="profile-museum-missing-section">
          <header><strong>Individual items</strong><span>{items.length.toLocaleString()} missing</span></header>
          <MuseumIndividualUnits units={items} label="Missing Museum items" />
        </section>
      )}
      {filtered.length === 0 && <ProfilePbcEmpty>No missing Museum entries match these filters.</ProfilePbcEmpty>}
    </div>
  );
};

const museumGroupKind = (group: MuseumDonationGroup): string => {
  if (group.borrowed === true) return "Borrowed";
  return "Special donation";
};

const museumGroupPayload = (group: MuseumDonationGroup): string => {
  if (group.itemCount !== null) {
    return `${group.itemCount.toLocaleString()} ${group.itemCount === 1 ? "item" : "items"}`;
  }
  if (group.payload === "encoded") return "Encoded item payload";
  if (group.payload === "empty") return "No items recorded";
  if (group.payload === "structured") return "Structured item payload";
  return "Item payload unavailable";
};

const MuseumRecordTile: React.FC<{ group: MuseumDonationGroup }> = ({ group }) => {
  const iconName = group.itemName ?? "Chest";
  const iconId = group.itemId ?? "CHEST";
  return (
    <article className={`profile-museum-record profile-museum-record--${group.borrowed === true ? "borrowed" : "special"}`}>
      <span className="profile-museum-record-icon" aria-hidden>
        <ItemIcon name={iconName} id={iconId} hypixelId={group.itemId ?? undefined} fallbackName="Chest" size={28} />
      </span>
      <span className="profile-museum-record-copy">
        <strong>{group.label}</strong>
        <small>{museumGroupKind(group)}</small>
      </span>
      <span>{museumGroupPayload(group)}</span>
      {group.donatedAt !== null && <time dateTime={new Date(group.donatedAt).toISOString()}>{new Date(group.donatedAt).toLocaleDateString()}</time>}
    </article>
  );
};

const MuseumSpecialRecords: React.FC<{ groups: readonly MuseumDonationGroup[] }> = ({ groups }) => {
  return (
    <div className="profile-museum-category-body">
      <div className="profile-museum-records" data-museum-record-count={groups.length}>
        {groups.map((group) => <MuseumRecordTile key={`${group.kind}:${group.key}`} group={group} />)}
      </div>
    </div>
  );
};

const MuseumCategoryDisclosure: React.FC<{
  group: MuseumCategoryGroup;
  initiallyExpanded: boolean;
}> = ({ group, initiallyExpanded }) => {
  const gearColumns = useMemo(
    () => group.name === "Armour & equipment" ? museumGearColumns(group.rows) : [],
    [group.name, group.rows],
  );
  const storageId = `museum-category-${group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <ProfilePbcDisclosure
      storageId={storageId}
      title={group.name}
      count={group.rows.length}
      initiallyExpanded={initiallyExpanded}
    >
      <div className="profile-museum-category-body">
        {gearColumns.length > 0 ? (
          <div className="profile-museum-gear-sections" data-museum-render-count={gearColumns.reduce((total, column) => total + column.rows.length, 0)}>
            {(["Armour", "Equipment"] as const).map((kind) => {
              const columns = gearColumns.filter((column) => column.kind === kind);
              if (columns.length === 0) return null;
              return (
                <section className="profile-museum-gear-section" key={kind} aria-label={`${kind} donations`}>
                  <header><strong>{kind}</strong><span>{columns.reduce((total, column) => total + column.rows.length, 0).toLocaleString()}</span></header>
                  <div className="profile-museum-gear-board">
                    {columns.map((column) => (
                      <div className="profile-museum-gear-column" key={column.key}>
                        {column.rows.map((row) => <DonationTile key={row.key} row={row} />)}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="profile-rmd-item-grid profile-item-grid" data-museum-render-count={group.rows.length}>
            {group.rows.map((row) => <DonationTile key={row.key} row={row} />)}
          </div>
        )}
      </div>
    </ProfilePbcDisclosure>
  );
};

export const MuseumPreview: React.FC<MuseumPreviewProps> = ({
  status,
  model: suppliedModel = null,
  parsed = null,
  result = null,
  coverage = null,
  sourceState,
  completion,
  catalogue = null,
  itemNameFor,
  itemCategoryFor,
  error = null,
}) => {
  const model = useMemo(
    () => suppliedModel ?? buildMuseumPreviewModel({
      parsed,
      result,
      coverage,
      sourceState,
      completion,
      catalogue,
      itemNameFor,
      itemCategoryFor,
    }),
    [catalogue, completion, coverage, itemCategoryFor, itemNameFor, parsed, result, sourceState, suppliedModel],
  );
  const visibleState = resolveProfileSectionState(status, model.state);
  const hasApiProjection = model.api?.present === true;
  const collectionUnits = model.collectionUnits ?? null;
  const collectedSetUnits = collectionUnits?.filter((unit) => unit.kind === "set" && unit.state !== "missing") ?? [];
  const donatedIndividualUnits = collectionUnits?.filter((unit) => unit.kind === "item" && unit.state === "donated") ?? [];
  const borrowedIndividualUnits = collectionUnits?.filter((unit) => unit.kind === "item" && unit.state === "borrowed") ?? [];
  const missingUnits = collectionUnits?.filter((unit) => unit.state === "missing") ?? [];
  const specialRecords = model.api?.specialDonations ?? [];
  const categories = useMemo(() => museumCategoryGroups(model.donations), [model.donations]);
  const completionPercent = model.completion && model.completion.total > 0
    ? Math.min(100, Math.max(0, (model.completion.completed / model.completion.total) * 100))
    : null;
  const summaryMetricCount = Number(model.value !== null)
    + Number(model.completion !== null)
    + Number(model.api?.appraisal !== null && model.api?.appraisal !== undefined);

  return (
    <section className="profile-rmd-preview profile-museum-preview" aria-label="Museum" data-profile-section-state={visibleState}>
      <section className="profile-rmd-shell profile-glass" aria-label="Museum donations">
        <ProfilePbcHeader
          eyebrow="Museum"
          title="Museum collection"
          count={null}
          countLabel=""
        />
        {visibleState === "loading" || visibleState === "private" || visibleState === "unavailable" || visibleState === "never-opened" ? (
          <StatePanel state={visibleState} status={status} error={error} />
        ) : visibleState === "empty" && !hasApiProjection ? (
          <ProfilePbcEmpty>No Museum donations are recorded on this profile.</ProfilePbcEmpty>
        ) : (
          <div className="profile-rmd-content profile-museum-content">
            <ProfilePbcStatusLine status={status} partial={visibleState === "partial" || model.partial} />
            {summaryMetricCount > 0 && <dl
              className="profile-metrics profile-metrics--adaptive profile-metrics--standalone profile-museum-summary"
              data-profile-metric-count={summaryMetricCount}
            >
              {model.value !== null && (
                <div className="profile-metric profile-metric--museum-value">
                  <dt className="profile-metric-label">Museum value</dt>
                  <dd className="profile-number" title={exactCoins(model.value)}>{coins(model.value)}</dd>
                </div>
              )}
              {model.completion !== null && (
                <div className="profile-metric profile-metric--museum-completion">
                  <dt className="profile-metric-label">Completion</dt>
                  <dd className="profile-number">
                    {model.completion.completed.toLocaleString()} / {model.completion.total.toLocaleString()}
                  </dd>
                  {completionPercent !== null && (
                    <span
                      role="progressbar"
                      aria-label="Museum completion"
                      aria-valuemin={0}
                      aria-valuemax={model.completion.total}
                      aria-valuenow={model.completion.completed}
                    >
                      <i style={{ width: `${completionPercent}%` }} />
                    </span>
                  )}
                </div>
              )}
              {model.api?.appraisal !== null && model.api?.appraisal !== undefined && (
                <div className="profile-metric">
                  <dt className="profile-metric-label">Appraisal</dt>
                  <dd>{model.api.appraisal ? "Yes" : "No"}</dd>
                </div>
              )}
            </dl>}

            {hasApiProjection && model.api && model.api.missingFields.length > 0 && (
              <p className="profile-rmd-field-state">Museum API fields unavailable: {model.api.missingFields.join(", ")}.</p>
            )}

            {collectionUnits ? (
              <div className="profile-museum-categories" aria-label="Museum collection units">
                {collectedSetUnits.length > 0 && (
                  <ProfilePbcDisclosure
                    storageId="museum-bundled-sets"
                    title="Armour & equipment sets"
                    count={collectedSetUnits.length}
                    initiallyExpanded
                  >
                    <MuseumBundleCollection units={collectedSetUnits} label="Museum armour and equipment sets" />
                  </ProfilePbcDisclosure>
                )}
                {donatedIndividualUnits.length > 0 && (
                  <ProfilePbcDisclosure
                    storageId="museum-individual-donations"
                    title="Individual donations"
                    count={donatedIndividualUnits.length}
                    initiallyExpanded={collectedSetUnits.length === 0}
                  >
                    <MuseumIndividualUnits units={donatedIndividualUnits} label="Individual Museum donations" />
                  </ProfilePbcDisclosure>
                )}
                {borrowedIndividualUnits.length > 0 && (
                  <ProfilePbcDisclosure
                    storageId="museum-borrowed-items"
                    title="Borrowed items"
                    count={borrowedIndividualUnits.length}
                    initiallyExpanded={false}
                  >
                    <MuseumIndividualUnits units={borrowedIndividualUnits} label="Borrowed Museum items" />
                  </ProfilePbcDisclosure>
                )}
                {missingUnits.length > 0 && (
                  <ProfilePbcDisclosure
                    storageId="museum-missing"
                    title="Missing"
                    count={missingUnits.length}
                    initiallyExpanded={false}
                  >
                    <MuseumMissingCollection units={missingUnits} />
                  </ProfilePbcDisclosure>
                )}
              </div>
            ) : model.donations.length === 0 ? (
              <p className="profile-rmd-field-state">No decoded donation items are available.</p>
            ) : (
              <div className="profile-museum-categories" aria-label="Museum donation categories">
                {categories.map((group, index) => (
                  <MuseumCategoryDisclosure key={group.name} group={group} initiallyExpanded={index === 0} />
                ))}
              </div>
            )}

            {hasApiProjection && specialRecords.length > 0 && (
              <ProfilePbcDisclosure
                storageId="museum-special-borrowed-records"
                title="Special records"
                count={specialRecords.length}
                initiallyExpanded={false}
              >
                <MuseumSpecialRecords groups={specialRecords} />
              </ProfilePbcDisclosure>
            )}
          </div>
        )}
      </section>
    </section>
  );
};

export default MuseumPreview;
