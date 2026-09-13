import React, { useMemo } from "react";
import { ListChecks, Sparkles } from "lucide-react";
import { resourceTierFor } from "../../items/itemResource";
import type { ProfileStatusView } from "../../profile/profileStatus";
import { gearBonuses, timecharmPresentationFor, type ProfileGearBonusView, type ProfileGearItemView } from "../../profile/profileViewModel";
import {
  type ProfileSectionState,
  type ProfileValueRow,
  type RiftItemRow,
  type RiftItemSurface,
  type RiftPreviewModel,
  type RiftQuestRow,
  type RiftTimecharmRow,
  resolveProfileSectionState,
} from "../../profile/riftMuseumDungeons";
import { compactProfileNumber } from "./profilePbcFormatting";
import { stripMinecraftFormatting } from "../../ui/itemTooltipModel";
import ItemIcon from "../../ui/ItemIcon";
import ProfileItemTile from "./ProfileItemTile";
import { ProfileSlotGrid, ProfileSlotSurface } from "./ProfileSlotSurface";
import {
  ProfilePbcDisclosure,
  ProfilePbcEmpty,
  ProfilePbcHeader,
  ProfilePbcLoading,
  ProfilePbcStatusLine,
  ProfilePbcUnavailable,
} from "./ProfilePbcShared";
import "./rift-museum-dungeons.css";
import "./rift-preview.css";

export interface RiftPreviewProps {
  status: ProfileStatusView;
  model: RiftPreviewModel;
  error?: string | null;
}

const StatePanel: React.FC<{
  state: Exclude<ProfileSectionState, "partial" | "populated" | "empty">;
  status: ProfileStatusView;
  error?: string | null;
}> = ({ state, status, error = null }) => {
  if (state === "loading") return <ProfilePbcLoading rows={5} />;
  if (state === "private" || state === "unavailable") return <ProfilePbcUnavailable status={status} noun="Rift" error={error} />;
  return <ProfilePbcEmpty>{state === "never-opened" ? "The Rift has not been opened on this profile." : "No Rift progress is recorded on this profile."}</ProfilePbcEmpty>;
};

const displayValue = (row: ProfileValueRow): string => typeof row.value === "number" ? compactProfileNumber(row.value) : row.value;

const displayPetName = (type: string): string => {
  if (type.toUpperCase().includes("MONTEZUMA")) return "Montezuma";
  return type
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const petWikiName = (type: string): string => `${displayPetName(type)} Pet`;

const TimecharmDetail: React.FC<{ row: RiftTimecharmRow }> = ({ row }) => {
  const presentation = timecharmPresentationFor(row.key);
  const name = presentation?.name ?? row.label;
  return (
    <div className="profile-rift-timecharm">
      <span className="profile-rift-timecharm-icon" aria-hidden><ItemIcon name={name} id={row.key} hypixelId={row.key} size={25} fallback="blank" /></span>
      <span><strong>{name}</strong><small>{row.timestamp === null ? "Secured time unavailable" : `Secured ${new Date(row.timestamp).toLocaleDateString()}`}</small></span>
      <b className="profile-number">{row.visits === null ? "Visits unavailable" : `${row.visits.toLocaleString()} visits`}</b>
    </div>
  );
};

const QuestRow: React.FC<{ row: RiftQuestRow }> = ({ row }) => (
  <div className={`profile-rift-quest profile-rift-quest--${row.state}`}><ListChecks aria-hidden /><span><strong>{row.label}</strong>{row.detail && <small>{row.detail}</small>}</span><b>{row.state.replace("-", " ")}</b></div>
);

const RiftItem: React.FC<{ row: RiftItemRow }> = ({ row }) => {
  const name = stripMinecraftFormatting(row.name).trim() || row.name;
  return (
    <ProfileItemTile
      id={row.id}
      name={name}
      wikiName={name}
      iconId={row.id}
      hypixelId={row.id}
      count={row.count}
      tier={row.tier ?? resourceTierFor(row.id)}
      tierIsDisplayed={Boolean(row.tier ?? resourceTierFor(row.id))}
      lore={row.lore}
      ariaLabel={`${name}, Rift item`}
    />
  );
};

const reorderInventory = (slots: readonly (RiftItemRow | null)[]): readonly (RiftItemRow | null)[] => slots.length === 36
  ? [...slots.slice(9), ...slots.slice(0, 9)]
  : slots;

const fixedSlots = (surface: RiftItemSurface, count: number, reverse = false): readonly (RiftItemRow | null)[] => {
  const slots = Array.from({ length: count }, (_, index) => surface.slots[index] ?? null);
  return reverse ? slots.reverse() : slots;
};

const RiftLoadoutSlots: React.FC<{ surface: RiftItemSurface; reverse?: boolean }> = ({ surface, reverse = false }) => {
  if (surface.state === "unavailable") return <p className="profile-rmd-field-state">{surface.label} data is unavailable.</p>;
  const slots = fixedSlots(surface, 4, reverse);
  const gearItems: ProfileGearItemView[] = slots.flatMap((row) => row && row.id ? [{
    id: row.id,
    name: row.name,
    wikiName: row.name,
    count: row.count,
    rarity: row.tier,
    lore: [...row.lore],
  }] : []);
  const bonuses = gearBonuses(gearItems);
  return (
    <div className="profile-rift-gear-compact">
      <ProfileSlotGrid
        ariaLabel={surface.label}
        slots={slots}
        columns={1}
        dataKey={`rift-loadout-${surface.key}`}
        gridClassName="profile-rift-loadout-slot-grid"
        itemAriaLabel={(row) => `${row.name}, Rift loadout item`}
        renderItem={(row) => <RiftItem row={row} />}
      />
      <RiftBonusSummary bonuses={bonuses} />
    </div>
  );
};

const RiftBonusSummary: React.FC<{ bonuses: readonly ProfileGearBonusView[] }> = ({ bonuses }) => (
  <div className="profile-rift-loadout-summary" aria-label="Equipped Rift stats">
    <span className="profile-gear-total-label">Equipped stats</span>
    {bonuses.length === 0 ? <small className="profile-rift-no-stats">No item stats recorded</small> : bonuses.map((bonus) => (
      <span className={`profile-gear-bonus ${bonus.colorClass}`} title={`${bonus.value} ${bonus.name}`} key={bonus.name}>
        <i aria-hidden>{bonus.glyph}</i>
        <span>{bonus.name}</span>
        <strong className="profile-number">{bonus.value}</strong>
      </span>
    ))}
  </div>
);

const RiftInventorySlots: React.FC<{
  surface: RiftItemSurface;
  slots: readonly (RiftItemRow | null)[];
  title?: string;
  dataKey?: string;
}> = ({ surface, slots, title = surface.label, dataKey = surface.key }) => {
  if (surface.state === "unavailable") return <p className="profile-rmd-field-state">{surface.label} data is unavailable.</p>;
  const occupied = slots.filter(Boolean).length;
  return (
    <ProfileSlotSurface
      title={title}
      meta={<span className="profile-number">{occupied.toLocaleString()} / {slots.length.toLocaleString()} slots</span>}
      ariaLabel={title}
      slots={slots}
      columns={9}
      dataKey={`rift-${dataKey}`}
      className="profile-rift-inventory-surface"
      gridClassName="profile-rift-inventory-slot-grid"
      itemAriaLabel={(row) => `${row.name}, Rift inventory item`}
      renderItem={(row) => <RiftItem row={row} />}
    />
  );
};

const MissingSurface: React.FC<{ label: string }> = ({ label }) => <p className="profile-rmd-field-state">{label} data is unavailable.</p>;

const CurrencySurface: React.FC<{ model: RiftPreviewModel }> = ({ model }) => {
  const unavailable = model.missingFields.includes("currencies");
  return (
    <fieldset className="profile-rift-currency-card">
      <legend className="profile-gear-legend">Current currencies</legend>
      <div className="profile-rift-currency-card-body">
        {unavailable ? <MissingSurface label="Rift currency" /> : model.currencies.length === 0 ? (
          <p className="profile-rmd-field-state">No Rift currencies are recorded.</p>
        ) : (
          <dl>
            {model.currencies.map((row) => (
              <div key={row.key} data-rift-currency={row.key}>
                <dt>{row.label}</dt>
                <dd className="profile-number">{displayValue(row)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </fieldset>
  );
};

const LoadoutSurface: React.FC<{ model: RiftPreviewModel }> = ({ model }) => {
  const armor = model.itemSurfaces?.find((surface) => surface.key === "armor") ?? null;
  const equipment = model.itemSurfaces?.find((surface) => surface.key === "equipment") ?? null;
  const pet = model.activePet;
  return (
    <section className="profile-rift-loadout profile-loadout" aria-labelledby="rift-loadout-title">
      <header className="profile-panel-head">
        <div className="profile-loadout-title-copy"><span className="profile-eyebrow">Current Rift loadout</span><h2 id="rift-loadout-title">Rift</h2></div>
        <span className="profile-live-state">Rift-owned state</span>
      </header>
      <div className="profile-loadout-body profile-rift-loadout-body">
        <div className="profile-equipped profile-rift-equipped">
          <fieldset className="profile-gear-column">
            <legend className="profile-gear-legend">Armour</legend>
            <div className="profile-gear-column-body">{armor ? <RiftLoadoutSlots surface={armor} reverse /> : <MissingSurface label="Rift Armour" />}</div>
          </fieldset>
          <fieldset className="profile-gear-column">
            <legend className="profile-gear-legend">Equipment</legend>
            <div className="profile-gear-column-body">{equipment ? <RiftLoadoutSlots surface={equipment} /> : <MissingSurface label="Rift Equipment" />}</div>
          </fieldset>
        </div>
        <fieldset className={`profile-pet-card profile-pet-card--rarity-${pet?.tier?.toLowerCase().replace(/_/g, "-") ?? "common"}`}>
          <legend className="profile-gear-legend">Pet</legend>
          <div className="profile-pet-card-body profile-rift-pet-card-body">
            {pet === undefined || model.missingFields.includes("pet") ? <MissingSurface label="Rift pet" /> : pet === null ? <p className="profile-rmd-field-state">No Rift pet is recorded.</p> : (
              <div className="profile-rift-loadout-pet">
                <span className="profile-rift-loadout-pet-tile">
                  <ProfileItemTile
                    id={`PET_${pet.type}`}
                    name={petWikiName(pet.type)}
                    wikiName={petWikiName(pet.type)}
                    iconId={`PET_${pet.type}`}
                    hypixelId={`PET_${pet.type}`}
                    tier={pet.tier}
                    tierIsDisplayed={Boolean(pet.tier)}
                    ariaLabel={`${displayPetName(pet.type)}, Rift pet`}
                  />
                </span>
                <span><strong>{displayPetName(pet.type)}</strong><small>{pet.tier ? pet.tier.replace(/_/g, " ") : "Rarity unavailable"}</small>{pet.foundSoulPieces !== null && <b className="profile-number">{pet.foundSoulPieces.toLocaleString()} soul pieces</b>}</span>
              </div>
            )}
          </div>
        </fieldset>
        <CurrencySurface model={model} />
      </div>
    </section>
  );
};

const InventorySurface: React.FC<{ model: RiftPreviewModel }> = ({ model }) => {
  const inventory = model.itemSurfaces?.find((surface) => surface.key === "inventory") ?? null;
  const ender = model.itemSurfaces?.find((surface) => surface.key === "ender_chest") ?? null;
  const inventorySlots = useMemo(() => inventory ? reorderInventory(inventory.slots) : [], [inventory]);
  const enderPages = useMemo(() => {
    if (!ender) return [];
    const pageSize = 45;
    const pageCount = Math.max(2, Math.ceil(ender.slots.length / pageSize));
    return Array.from({ length: pageCount }, (_, pageIndex) => (
      Array.from({ length: pageSize }, (__, slotIndex) => ender.slots[(pageIndex * pageSize) + slotIndex] ?? null)
    ));
  }, [ender]);

  return (
    <div className="profile-rift-inventory-layout" data-profile-layout-track="paired-surfaces">
      <section className="profile-rift-inventory" aria-labelledby="rift-inventory-title">
        <header><strong id="rift-inventory-title">Rift inventory</strong></header>
        {!inventory || model.missingFields.includes("inventory") && !ender
          ? <MissingSurface label="Rift inventory" />
          : <RiftInventorySlots surface={inventory} slots={inventorySlots} />}
      </section>
      {!ender ? (
        <section className="profile-rift-inventory" aria-label="Rift Ender Chest"><MissingSurface label="Rift Ender Chest" /></section>
      ) : enderPages.map((slots, index) => {
        const title = `Rift Ender Chest ${index + 1}/${enderPages.length}`;
        return (
          <section className="profile-rift-inventory" aria-label={title} key={title}>
            <RiftInventorySlots surface={ender} slots={slots} title={title} dataKey={`ender-chest-${index + 1}`} />
          </section>
        );
      })}
    </div>
  );
};

export const RiftPreview: React.FC<RiftPreviewProps> = ({ status, model, error = null }) => {
  const visibleState = resolveProfileSectionState(status, model.state);
  const timecharmsUnavailable = model.missingFields.includes("timecharms");
  const questsUnavailable = model.missingFields.includes("quests");

  return (
    <section className="profile-rmd-preview profile-rift-preview" aria-label="Rift" data-profile-section-state={visibleState}>
      <section className="profile-rmd-shell profile-glass" aria-label="Rift profile">
        <ProfilePbcHeader eyebrow="Rift" title="Rift profile" count={visibleState === "loading" || visibleState === "private" || visibleState === "unavailable" || timecharmsUnavailable ? null : model.timecharms.length} countLabel="secured" />
        {visibleState !== "partial" && visibleState !== "populated" && visibleState !== "empty" ? <StatePanel state={visibleState} status={status} error={error} /> : visibleState === "empty" ? <ProfilePbcEmpty>No Rift progress is recorded on this profile.</ProfilePbcEmpty> : (
          <div className="profile-rmd-content profile-rift-content">
            <ProfilePbcStatusLine status={status} partial={visibleState === "partial" || model.missingFields.length > 0} />
            <LoadoutSurface model={model} />
            <InventorySurface model={model} />
            <section className="profile-rift-secured" aria-labelledby="rift-secured-title"><header><span><Sparkles aria-hidden /><strong id="rift-secured-title">Secured Timecharms</strong></span><b className="profile-number">{timecharmsUnavailable ? "Unavailable" : model.timecharms.length.toLocaleString()}</b></header>{timecharmsUnavailable ? <p className="profile-rmd-field-state">Rift Timecharm data is unavailable.</p> : model.timecharms.length === 0 ? <p className="profile-rmd-field-state">No secured Timecharms are recorded.</p> : <div className="profile-rift-timecharm-grid">{model.timecharms.map((row) => <TimecharmDetail key={row.key} row={row} />)}</div>}</section>
            <section className="profile-rift-quests" aria-labelledby="rift-quests-title"><header><ListChecks aria-hidden /><strong id="rift-quests-title">Quests</strong></header>{questsUnavailable ? <p className="profile-rmd-field-state">Rift quest data is unavailable.</p> : model.quests.length === 0 ? <p className="profile-rmd-field-state">No Rift quests are recorded.</p> : <div>{model.quests.map((row) => <QuestRow key={row.key} row={row} />)}</div>}</section>
            <div className="profile-rmd-pages"><ProfilePbcDisclosure storageId="rift-stats" title="Rift progression" count={model.stats.length} initiallyExpanded={false}>{model.missingFields.includes("stats") ? <p className="profile-rmd-field-state">Additional Rift progression is unavailable.</p> : model.stats.length === 0 ? <p className="profile-rmd-field-state">No additional Rift progression is recorded.</p> : <dl className="profile-rift-value-grid">{model.stats.map((row) => <div key={row.key}><dt>{row.label}</dt><dd className="profile-number">{displayValue(row)}</dd></div>)}</dl>}</ProfilePbcDisclosure></div>
          </div>
        )}
      </section>
    </section>
  );
};

export default RiftPreview;
