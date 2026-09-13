import React, { useMemo, useState } from "react";
import { Coins as CoinsIcon, RefreshCw, Store } from "lucide-react";
import { SettingsLink } from "../../components/layout/SettingsLink";
import { ago } from "../../island/format";
import type { SectionProvenance } from "../../island/merge";
import type { IslandChest } from "../../island/types";
import { resourceNameFor, resourceTierFor } from "../../items/itemResource";
import { coins, exactCoins } from "../../networth/format";
import type { NetworkCategoryView } from "../../networth/networkModel";
import type { NpcSellSummary } from "../../networth/npcSell";
import type { ValuedItem } from "../../networth/types";
import { useNetworth, type NetworthView } from "../../networth/useNetworth";
import { ItemIcon } from "../../ui/ItemIcon";
import { ItemTooltip, ItemTooltipInlineItem } from "../../ui/ItemTooltip";
import { rarityTileClass } from "../../ui/kit";
import type { ItemTooltipMetadata, ItemTooltipSection, ItemTooltipValue } from "../../ui/itemTooltipModel";
import {
  buildNetWorthComposition,
  buildNetWorthPreviewModel,
  netWorthCategoryStateLabel,
  type NetWorthPreviewState,
} from "./profileAuxiliaryPreviewModels";
import { buildNpcNetworthCategories, marketBreakdown, networthItemDisplayName, networthItemIconId, networthItemIconName } from "./networthPreviewModel";
import { ProfileIdentityTrigger } from "./ProfileIdentityTrigger";
import "./networth-preview.css";

export type NetworthValueMode = "market" | "npc";

export interface NetWorthPreviewProps {
  chests: readonly IslandChest[];
  chestProvenance: SectionProvenance;
  /** Existing cross-source NPC projection. Null/omitted means that valuation is unavailable. */
  npcSell?: NpcSellSummary | null;
}

export interface NetWorthPreviewContentProps {
  view: NetworthView;
  chestProvenance: SectionProvenance;
  npcSell?: NpcSellSummary | null;
}

const NetWorthStatePanel: React.FC<{ state: Exclude<NetWorthPreviewState, "partial" | "populated"> }> = ({ state }) => {
  const copy: Record<typeof state, string> = {
    loading: "Reading the selected profile and current prices.",
    private: "Connect your Hypixel API key in Settings to load Networth.",
    unavailable: "Networth data is unavailable for this profile.",
    empty: "The supplied profile has no valued items or coin balances.",
    error: "Networth data could not be loaded.",
  };
  return (
    <section className="profile-networth-state profile-glass" aria-labelledby="profile-networth-state-title" data-profile-section-state={state}>
      <h2 id="profile-networth-state-title">Networth</h2>
      {state === "loading" ? (
        <div className="profile-networth-skeleton" aria-label={copy[state]} role="status"><i /><i /><i /></div>
      ) : (
        <div className="profile-networth-state-copy">
          <p role={state === "error" ? "alert" : "status"}>{copy[state]}</p>
          {state === "private" && <SettingsLink section="hypixel">Open Settings</SettingsLink>}
        </div>
      )}
    </section>
  );
};

const MarketItemCard: React.FC<{
  item: ValuedItem;
  category: NetworkCategoryView;
  selected: boolean;
  onSelect: () => void;
}> = ({ item, category, selected, onSelect }) => {
  const iconId = networthItemIconId(item);
  const iconName = resourceNameFor(iconId) ?? networthItemIconName(item);
  const displayName = networthItemDisplayName(item);
  const tier = item.petData?.tier?.toLowerCase() ?? resourceTierFor(iconId) ?? resourceTierFor(item.id);
  const breakdown = marketBreakdown(item);
  const sections: ItemTooltipSection[] = [{
    title: "Valuation breakdown",
    lines: breakdown.map((entry, index) => {
      const calculation = index > 0 ? item.calculation[index - 1] : null;
      const enchantment = calculation?.type === "ENCHANT" || calculation?.type === "ENCHANTMENT" || calculation?.type === "ENCHANTMENT_UPGRADE";
      const rowIconId = index === 0 ? iconId : enchantment ? "ENCHANTED_BOOK" : calculation?.id || iconId;
      const rowIconName = index === 0
        ? displayName
        : enchantment
          ? entry.detail
          : resourceNameFor(rowIconId) ?? entry.detail;
      return (
        <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1" key={entry.key}>
          <span className="text-slate-300">{entry.label}</span>
          <span className="text-slate-500" aria-hidden>·</span>
          <ItemTooltipInlineItem
            id={rowIconId}
            name={rowIconName}
            tier={resourceTierFor(rowIconId)}
            count={calculation && calculation.count > 1 ? calculation.count : null}
          />
          <span className="text-slate-500" aria-hidden>·</span>
          <span className="text-stat-gold">{exactCoins(entry.value)}</span>
        </span>
      );
    }),
  }];
  const values: ItemTooltipValue[] = [
    { label: "AH/BZ value", value: exactCoins(item.price) },
    { label: "Base value", value: exactCoins(item.basePrice) },
  ];
  const metadata: ItemTooltipMetadata[] = [
    { label: "Category", value: category.label },
    { label: "Soulbound", value: item.soulbound ? "Yes" : "No" },
    ...(item.soulboundPortion > 0 ? [{ label: "Soulbound portion", value: exactCoins(item.soulboundPortion) }] : []),
  ];
  const icon = <ItemIcon name={iconName} id={iconId} hypixelId={iconId} size={42} fallback="blank" />;

  return (
    <ItemTooltip
      name={displayName}
      wikiName={iconName}
      count={item.count}
      tier={tier}
      tierIsDisplayed={tier !== null}
      icon={icon}
      values={values}
      sections={sections}
      metadata={metadata}
      soulbound={item.soulbound}
      ariaLabel={`${displayName}, ${exactCoins(item.price)}, ${category.label}`}
      wrapperClassName="profile-networth-item-wrap"
      interactive
    >
      <button
        type="button"
        className={`profile-networth-item ${rarityTileClass(tier)} ${selected ? "is-selected" : ""}`}
        onClick={onSelect}
        aria-pressed={selected}
        data-profile-item-tier={tier ?? "unknown"}
        data-networth-item
      >
        <span className="profile-networth-item-icon" aria-hidden>{icon}</span>
        <span className="profile-networth-item-copy"><strong>{displayName}</strong><small>{item.count > 1 ? `×${item.count.toLocaleString()} · ` : ""}{coins(item.price)}</small></span>
      </button>
    </ItemTooltip>
  );
};

const MarketBreakdown: React.FC<{ item: ValuedItem; category: NetworkCategoryView }> = ({ item, category }) => {
  const iconId = networthItemIconId(item);
  const iconName = resourceNameFor(iconId) ?? networthItemIconName(item);
  const displayName = networthItemDisplayName(item);
  const tier = item.petData?.tier?.toLowerCase() ?? resourceTierFor(iconId) ?? resourceTierFor(item.id);
  const breakdownRows = marketBreakdown(item).map((entry, index) => {
    if (index === 0) return { ...entry, iconId, iconName, wikiName: iconName };
    const calculation = item.calculation[index - 1];
    const enchantment = calculation?.type === "ENCHANT" || calculation?.type === "ENCHANTMENT" || calculation?.type === "ENCHANTMENT_UPGRADE";
    const rowIconId = enchantment ? "ENCHANTED_BOOK" : calculation?.id || iconId;
    const rowIconName = enchantment
      ? entry.detail
      : resourceNameFor(rowIconId) ?? entry.detail;
    return {
      ...entry,
      iconId: rowIconId,
      iconName: rowIconName,
      wikiName: enchantment ? "Enchantments" : rowIconName,
    };
  });
  return (
    <aside className={`profile-networth-breakdown ${rarityTileClass(tier)}`} aria-labelledby="profile-networth-breakdown-title" data-profile-item-tier={tier ?? "unknown"}>
      <header>
        <span aria-hidden><ItemIcon name={iconName} id={iconId} hypixelId={iconId} size={48} fallback="blank" /></span>
        <div><small>{category.label}</small><h3 id="profile-networth-breakdown-title">{displayName}</h3></div>
        <strong title={exactCoins(item.price)}>{coins(item.price)}</strong>
      </header>
      <div className="profile-networth-breakdown-rows">
        {breakdownRows.map((entry) => (
          <div key={entry.key}>
            <ProfileIdentityTrigger
              id={entry.iconId}
              name={entry.iconName}
              wikiName={entry.wikiName}
              icon={<ItemIcon name={entry.iconName} id={entry.iconId} hypixelId={entry.iconId} size={28} fallback="blank" />}
              tier={resourceTierFor(entry.iconId)}
              tierIsDisplayed={Boolean(resourceTierFor(entry.iconId))}
              metadata={[{ label: "Valuation source", value: entry.detail }]}
              values={[{ label: "Value contribution", value: exactCoins(entry.value) }]}
              provenance="Networth breakdown"
              ariaLabel={`${entry.label}, ${entry.detail}, ${exactCoins(entry.value)}`}
              wrapperClassName="profile-networth-breakdown-identity"
              buttonClassName="profile-networth-breakdown-label"
            >
              <i aria-hidden><ItemIcon name={entry.iconName} id={entry.iconId} hypixelId={entry.iconId} size={24} fallback="blank" /></i>
              <span>
                <strong>{entry.label}</strong>
                <small>{entry.detail}</small>
              </span>
            </ProfileIdentityTrigger>
            <b title={exactCoins(entry.value)}>{coins(entry.value)}</b>
          </div>
        ))}
      </div>
      <footer>
        <span>{item.soulbound ? "Soulbound" : "Tradeable valuation"}</span>
        {item.soulboundPortion > 0 && <span title={exactCoins(item.soulboundPortion)}>{coins(item.soulboundPortion)} soulbound portion</span>}
      </footer>
    </aside>
  );
};

const ValueModeControl: React.FC<{ mode: NetworthValueMode; onChange: (mode: NetworthValueMode) => void }> = ({ mode, onChange }) => (
  <div className="profile-networth-mode" role="group" aria-label="Networth value source">
    <button type="button" className={mode === "market" ? "is-active" : ""} aria-pressed={mode === "market"} onClick={() => onChange("market")}><CoinsIcon aria-hidden /><span>Market<small>AH / BZ</small></span></button>
    <button type="button" className={mode === "npc" ? "is-active" : ""} aria-pressed={mode === "npc"} onClick={() => onChange("npc")}><Store aria-hidden /><span>NPC Value<small>sell price</small></span></button>
  </div>
);

export const NpcValueView: React.FC<{ summary: NpcSellSummary | null | undefined }> = ({ summary }) => {
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const categories = useMemo(() => summary ? buildNpcNetworthCategories(summary) : [], [summary]);
  const selectedCategory = categories.find((category) => category.key === selectedCategoryKey) ?? categories[0] ?? null;
  const items = selectedCategory?.items ?? [];
  const selectedItem = items.find((item) => item.row.id === selectedItemId) ?? items[0] ?? null;

  if (!summary) return <section className="profile-networth-npc-unavailable profile-glass" role="status"><h3>NPC Value unavailable</h3><p>This profile snapshot has no NPC sell projection. AH/BZ Value remains available.</p></section>;

  return (
    <>
      <div className="profile-networth-npc-summary profile-glass" aria-label="NPC sell value summary">
        <div className="is-primary"><small>NPC Value</small><strong title={exactCoins(summary.total)}>{coins(summary.total)}</strong></div>
        <div><small>Priced item types</small><strong>{summary.rows.length.toLocaleString()}</strong></div>
        <div><small>Unpriced item types</small><strong>{summary.unpricedIds.toLocaleString()}</strong></div>
        <div><small>Unpriced stacks</small><strong>{summary.unpricedCount.toLocaleString()}</strong></div>
      </div>
      {categories.length === 0 ? <section className="profile-networth-npc-unavailable profile-glass"><h3>No NPC-valued stacks</h3><p>No held stack in this snapshot has a published NPC sell price.</p></section> : (
        <>
          <section className="profile-networth-composition profile-glass" aria-labelledby="profile-networth-npc-composition-title">
            <header><div><small>Published NPC sell prices</small><h3 id="profile-networth-npc-composition-title">Item sources</h3></div><strong title={exactCoins(summary.total)}>{coins(summary.total)}</strong></header>
            <div className="profile-networth-legend">{categories.map((category) => <button type="button" className={category.key === selectedCategory?.key ? "is-active" : ""} onClick={() => { setSelectedCategoryKey(category.key); setSelectedItemId(null); }} key={category.key}><span><strong>{category.label}</strong><small>{category.items.length.toLocaleString()} priced items · {coins(category.total)}</small></span></button>)}</div>
          </section>
          {selectedCategory && <section className="profile-networth-valuables profile-glass" aria-labelledby="profile-networth-npc-items-title">
            <header><div><small>NPC-valued stacks</small><h3 id="profile-networth-npc-items-title">{selectedCategory.label}</h3></div><strong title={exactCoins(selectedCategory.total)}>{coins(selectedCategory.total)}</strong></header>
            <div className="profile-networth-items-layout" data-profile-layout-track="items-with-breakdown">
              <div>
                <div className="profile-networth-item-grid">{items.map((item) => {
                  const icon = <ItemIcon name={resourceNameFor(item.row.id) ?? item.row.name} id={item.row.id} hypixelId={item.row.id} size={42} fallback="blank" />;
                  return <ItemTooltip key={item.row.id} id={item.row.id} name={item.row.name} wikiName={resourceNameFor(item.row.id) ?? item.row.name} count={item.count} icon={icon} unitPrice={item.row.unit} priceLabel="NPC each" wrapperClassName="profile-networth-item-wrap" interactive><button type="button" className={`profile-networth-item ${rarityTileClass(resourceTierFor(item.row.id))} ${selectedItem?.row.id === item.row.id ? "is-selected" : ""}`} onClick={() => setSelectedItemId(item.row.id)} aria-pressed={selectedItem?.row.id === item.row.id} data-networth-npc-item><span className="profile-networth-item-icon" aria-hidden>{icon}</span><span className="profile-networth-item-copy"><strong>{item.row.name}</strong><small>×{item.count.toLocaleString()} · {coins(item.total)}</small></span></button></ItemTooltip>;
                })}</div>
              </div>
              {selectedItem && <aside className={`profile-networth-breakdown ${rarityTileClass(resourceTierFor(selectedItem.row.id))}`} aria-labelledby="profile-networth-npc-breakdown-title"><header><span aria-hidden><ItemIcon name={resourceNameFor(selectedItem.row.id) ?? selectedItem.row.name} id={selectedItem.row.id} hypixelId={selectedItem.row.id} size={48} fallback="blank" /></span><div><small>{selectedCategory.label}</small><h3 id="profile-networth-npc-breakdown-title">{selectedItem.row.name}</h3></div><strong>{coins(selectedItem.total)}</strong></header><div className="profile-networth-breakdown-rows"><div><span><strong>NPC unit price</strong><small>Published item resource</small></span><b>{coins(selectedItem.row.unit)}</b></div><div><span><strong>Held here</strong><small>{selectedCategory.label}</small></span><b>×{selectedItem.count.toLocaleString()}</b></div><div><span><strong>Source value</strong><small>Unit price × held count</small></span><b>{coins(selectedItem.total)}</b></div></div></aside>}
            </div>
          </section>}
        </>
      )}
    </>
  );
};

export const NetWorthPreviewContent: React.FC<NetWorthPreviewContentProps> = ({ view, chestProvenance, npcSell }) => {
  const [mode, setMode] = useState<NetworthValueMode>("market");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const model = buildNetWorthPreviewModel(view, chestProvenance);

  const refresh = async () => {
    setRefreshing(true);
    try { await view.refresh(true); } finally { setRefreshing(false); }
  };

  const header = <header className="profile-networth-head profile-glass"><div><h2 id="profile-networth-title">Networth</h2></div><ValueModeControl mode={mode} onChange={setMode} /><div className="profile-networth-provenance">{view.fetchedAt && <small>API {ago(view.fetchedAt)}</small>}{view.pricesAt && <small>{view.pricesFrom === "storage" ? "Cached prices" : "Prices"} {ago(view.pricesAt)}</small>}<button type="button" onClick={() => void refresh()} disabled={refreshing || view.status === "loading"} aria-label="Refresh Networth"><RefreshCw className={refreshing || view.status === "loading" ? "is-refreshing" : ""} aria-hidden /></button></div></header>;

  if (mode === "npc") return <section className="profile-networth-preview" aria-labelledby="profile-networth-title">{header}<NpcValueView summary={npcSell} /></section>;
  if (model.state !== "partial" && model.state !== "populated") return <section className="profile-networth-preview" aria-labelledby="profile-networth-title">{header}<NetWorthStatePanel state={model.state} /></section>;
  if (!view.result) return null;

  const composition = buildNetWorthComposition(model.categories);
  const selected = composition.categories.find((category) => category.key === selectedKey) ?? composition.categories[0] ?? null;
  const valuedItems = selected?.items ?? [];
  const selectedItem = valuedItems.find((item, index) => `${item.customId}-${index}` === selectedItemKey) ?? valuedItems[0] ?? null;
  const bankVisible = view.coverage?.bankShared !== false;
  const balances = [
    { label: "AH/BZ Value", value: coins(view.result.networth), title: exactCoins(view.result.networth), primary: true },
    { label: "Purse", value: coins(view.result.purse), title: exactCoins(view.result.purse) },
    { label: "Co-op bank", value: bankVisible ? coins(view.result.bank) : "Unavailable", title: bankVisible ? exactCoins(view.result.bank) : "Private" },
    { label: "Personal bank", value: coins(view.result.personalBank), title: exactCoins(view.result.personalBank) },
  ];
  const unsoulboundPercent = view.result.networth > 0 ? Math.max(0, Math.min(100, (view.result.unsoulboundNetworth / view.result.networth) * 100)) : 0;
  const secondaryCategories = model.categories.filter((category) => !composition.categories.some((available) => available.key === category.key));
  const segmentHues = [190, 154, 42, 268, 12, 215, 325, 84, 232, 174, 55, 295];

  return (
    <section className="profile-networth-preview" aria-labelledby="profile-networth-title" data-profile-section-state={model.state}>
      {header}
      {model.state === "partial" && <p className="profile-networth-notice" role="status">Some categories or current prices are unavailable. Composition uses only visible supported item value.</p>}
      <div className="profile-networth-balances profile-glass" aria-label="Coin and value summary">{balances.map((balance) => <div className={balance.primary ? "is-primary" : ""} key={balance.label}><small>{balance.label}</small><strong title={balance.title}>{balance.value}</strong></div>)}</div>
      <div className="profile-networth-unsoulbound profile-glass"><div><span>Unsoulbound value</span><strong title={exactCoins(view.result.unsoulboundNetworth)}>{coins(view.result.unsoulboundNetworth)}</strong></div><span className="profile-skill-progress" role="progressbar" aria-label="Unsoulbound share of total Networth" aria-valuemin={0} aria-valuemax={100} aria-valuenow={unsoulboundPercent}><i style={{ width: `${unsoulboundPercent}%` }} /></span></div>
      <section className="profile-networth-composition profile-glass" aria-labelledby="profile-networth-composition-title">
        <header><div><small>{model.state === "partial" ? "Visible item value" : "AH/BZ item value"}</small><h3 id="profile-networth-composition-title">Category composition</h3></div><strong title={exactCoins(composition.knownItemValue)}>{coins(composition.knownItemValue)}</strong></header>
        {composition.categories.length > 0 ? <><div className="profile-networth-bar" aria-label="Known item value by category">{composition.categories.map((category, index) => { const percent = composition.knownItemValue > 0 ? ((category.total ?? 0) / composition.knownItemValue) * 100 : 0; return <button type="button" aria-label={`${category.label}: ${exactCoins(category.total ?? 0)}, ${percent.toFixed(1)} percent`} title={`${category.label} · ${exactCoins(category.total ?? 0)} · ${percent.toFixed(1)}%`} style={{ width: `${percent}%`, backgroundColor: `hsl(${segmentHues[index % segmentHues.length]} 62% 48% / 0.78)` }} onClick={() => { setSelectedKey(category.key); setSelectedItemKey(null); }} key={category.key} />; })}</div><div className="profile-networth-legend">{composition.categories.map((category, index) => { const percent = composition.knownItemValue > 0 ? ((category.total ?? 0) / composition.knownItemValue) * 100 : 0; return <button type="button" className={category.key === selected?.key ? "is-active" : ""} onClick={() => { setSelectedKey(category.key); setSelectedItemKey(null); }} key={category.key}><span className="profile-networth-legend-icon" aria-hidden><ItemIcon name={category.icon.name} id={category.icon.id} size={22} fallback="blank" /></span><i style={{ backgroundColor: `hsl(${segmentHues[index % segmentHues.length]} 62% 48% / 0.78)` }} /><span><strong>{category.label}</strong><small>{percent.toFixed(1)}% · {coins(category.total ?? 0)}</small></span></button>; })}</div></> : <p className="profile-networth-empty">No positive item categories are currently available.</p>}
        {secondaryCategories.length > 0 && <div className="profile-networth-category-states" aria-label="Other category states">{secondaryCategories.map((category) => <span data-networth-state={category.state} key={category.key}>{category.label} · {netWorthCategoryStateLabel(category)}</span>)}</div>}
      </section>
      {selected && <section className="profile-networth-valuables profile-glass" aria-labelledby="profile-networth-valuables-title"><header><span aria-hidden><ItemIcon name={selected.icon.name} id={selected.icon.id} size={30} fallback="blank" /></span><div><small>Most valuable items</small><h3 id="profile-networth-valuables-title">{selected.label}</h3></div><strong title={exactCoins(selected.total ?? 0)}>{coins(selected.total ?? 0)}</strong></header>{valuedItems.length > 0 ? <div className="profile-networth-items-layout" data-profile-layout-track="items-with-breakdown"><div><div className="profile-networth-item-grid">{valuedItems.map((item, index) => { const key = `${item.customId}-${index}`; return <MarketItemCard item={item} category={selected} selected={selectedItem === item} onSelect={() => setSelectedItemKey(key)} key={key} />; })}</div></div>{selectedItem && <MarketBreakdown item={selectedItem} category={selected} />}</div> : <p className="profile-networth-empty">This category has value but no supported valued item rows.</p>}</section>}
    </section>
  );
};

export const NetWorthPreview: React.FC<NetWorthPreviewProps> = ({ chests, chestProvenance, npcSell = null }) => {
  const view = useNetworth(chests);
  return <NetWorthPreviewContent view={view} chestProvenance={chestProvenance} npcSell={npcSell} />;
};

export default NetWorthPreview;
