import React, { useState } from "react";
import { Fish, Flame, Swords, Users } from "lucide-react";
import type { ProfileStatusView } from "../../profile/profileStatus";
import {
  type CrimsonDojoRow,
  type CrimsonIslePreviewModel,
  type TrophyFishRow,
  type TrophyTier,
} from "../../profile/profileWorlds";
import { type ProfileSectionState, resolveProfileSectionState } from "../../profile/riftMuseumDungeons";
import { ItemIcon } from "../../ui/ItemIcon";
import { rarityTileClass } from "../../ui/kit";
import { compactProfileNumber } from "./profilePbcFormatting";
import { ProfileItemTile } from "./ProfileItemTile";
import {
  ProfilePbcDisclosure,
  ProfilePbcEmpty,
  ProfilePbcHeader,
  ProfilePbcLoading,
  ProfilePbcStatusLine,
  ProfilePbcUnavailable,
} from "./ProfilePbcShared";
import "./rift-museum-dungeons.css";
import "./crimson-isle-preview.css";

export interface CrimsonIslePreviewProps {
  status: ProfileStatusView;
  model: CrimsonIslePreviewModel | null;
  error?: string | null;
}

const KUUDRA_TIERS = ["Basic", "Hot", "Burning", "Fiery", "Infernal"] as const;
const TROPHY_TIERS: readonly TrophyTier[] = ["bronze", "silver", "gold", "diamond"];
const TROPHY_RARITY: Readonly<Record<TrophyTier, string>> = { bronze: "uncommon", silver: "rare", gold: "epic", diamond: "legendary" };

const StatePanel: React.FC<{
  state: Exclude<ProfileSectionState, "partial" | "populated" | "empty">;
  status: ProfileStatusView;
  error?: string | null;
}> = ({ state, status, error = null }) => {
  if (state === "loading") return <ProfilePbcLoading rows={5} />;
  if (state === "private" || state === "unavailable") return <ProfilePbcUnavailable status={status} noun="Crimson Isle" error={error} />;
  return <ProfilePbcEmpty>The Crimson Isle has not been opened on this profile.</ProfilePbcEmpty>;
};

const DojoRow: React.FC<{ row: CrimsonDojoRow }> = ({ row }) => (
  <div className="profile-crimson-value-row"><span><Swords aria-hidden />{row.label}</span><strong className="profile-number">{compactProfileNumber(row.score)}</strong></div>
);

interface TrophyPresentation {
  tier: TrophyTier | null;
  rarity: string | null;
  wikiName: string | null;
  obfuscated: boolean;
}

const trophyPresentation = (row: TrophyFishRow): TrophyPresentation => {
  const obfuscated = /^obfuscated(?:_fish)?(?:_|$)/i.test(row.key);
  const tier = [...TROPHY_TIERS].reverse().find((candidate) => (row[candidate] ?? 0) > 0)
    ?? [...TROPHY_TIERS].reverse().find((candidate) => row[candidate] !== null)
    ?? null;
  const wikiBase = obfuscated ? row.label.replace(/\s+Fish\s+/i, " ") : row.label;
  return {
    tier,
    rarity: tier ? TROPHY_RARITY[tier] : null,
    wikiName: tier ? `${wikiBase} ${tier[0].toUpperCase()}${tier.slice(1)}` : wikiBase,
    obfuscated,
  };
};

const trophyItemId = (row: TrophyFishRow, tier: TrophyTier | null): string | null => (
  tier ? `${row.key}_${tier}`.replace(/[^a-z0-9]+/gi, "_").toUpperCase() : null
);

const TrophyTile: React.FC<{ row: TrophyFishRow; selected: boolean; onSelect: () => void }> = ({ row, selected, onSelect }) => {
  const presentation = trophyPresentation(row);
  const itemId = trophyItemId(row, presentation.tier);
  const gradeLines = TROPHY_TIERS.map((tier) => `${tier[0].toUpperCase()}${tier.slice(1)}: ${row[tier] === null ? "Unavailable" : row[tier]?.toLocaleString()}`);
  return (
    <span className="profile-crimson-trophy-wrap" data-trophy-texture={itemId ?? "unavailable"}>
      <ProfileItemTile
        id={itemId}
        name={row.label}
        wikiName={presentation.wikiName}
        iconId={presentation.wikiName ?? itemId}
        hypixelId={null}
        allowSemanticFallback={false}
        preferWikiIdentity
        freezeAnimatedMedia
        tier={presentation.rarity}
        tierIsDisplayed={presentation.rarity !== null}
        count={row.total ?? undefined}
        cornerLabel={presentation.tier?.[0].toUpperCase() ?? null}
        sections={[{ title: "Trophy Fish collection", lines: gradeLines }]}
        values={row.total === null ? [] : [{ label: "Total caught", value: row.total.toLocaleString() }]}
        ariaLabel={`${row.label}, ${row.total === null ? "total unavailable" : `${row.total.toLocaleString()} caught`}`}
        selected={selected}
        onClick={onSelect}
      />
    </span>
  );
};

const TrophyDetail: React.FC<{ row: TrophyFishRow }> = ({ row }) => {
  const presentation = trophyPresentation(row);
  const itemId = trophyItemId(row, presentation.tier);
  return (
    <aside className={`profile-crimson-trophy-detail ${rarityTileClass(presentation.rarity)}`} aria-labelledby="crimson-trophy-detail-title">
      <header>
        <span aria-hidden>{itemId ? <ItemIcon name={presentation.wikiName ?? row.label} id={presentation.wikiName ?? itemId} allowSemanticFallback={false} preferWikiIdentity freezeAnimatedMedia size={48} fallback="blank" /> : <span className="profile-crimson-obfuscated-icon"><Fish /></span>}</span>
        <div><small>Selected Trophy Fish</small><h3 id="crimson-trophy-detail-title">{row.label}</h3></div>
        <strong className="profile-number">{row.total === null ? "-" : row.total.toLocaleString()}</strong>
      </header>
      <div>{TROPHY_TIERS.map((tier) => <div key={tier}><span>{tier}</span><strong className="profile-number">{row[tier] === null ? "Unavailable" : row[tier]?.toLocaleString()}</strong></div>)}</div>
    </aside>
  );
};

export const CrimsonIslePreview: React.FC<CrimsonIslePreviewProps> = ({ status, model, error = null }) => {
  const visibleState = resolveProfileSectionState(status, model?.state);
  const available = (section: keyof NonNullable<CrimsonIslePreviewModel["availability"]>): boolean => model?.availability?.[section] !== false;
  const [selectedFishKey, setSelectedFishKey] = useState<string | null>(null);
  const selectedFish = model?.trophyFish.find((row) => row.key === selectedFishKey) ?? model?.trophyFish[0] ?? null;

  return (
    <section className="profile-rmd-preview profile-crimson-preview" aria-label="Crimson Isle" data-profile-section-state={visibleState}>
      <section className="profile-rmd-shell profile-glass" aria-label="Crimson Isle profile">
        <ProfilePbcHeader eyebrow="Crimson Isle" title="Crimson Isle profile" count={null} countLabel="" />
        {visibleState !== "partial" && visibleState !== "populated" && visibleState !== "empty" ? <StatePanel state={visibleState} status={status} error={error} /> : visibleState === "empty" || !model ? <ProfilePbcEmpty>No Crimson Isle progress is recorded on this profile.</ProfilePbcEmpty> : (
          <div className="profile-rmd-content profile-crimson-content">
            <ProfilePbcStatusLine status={status} partial={visibleState === "partial"} />
            <section className="profile-crimson-current" aria-labelledby="crimson-current-title">
              <header><div><Flame aria-hidden /><span><small>Current Crimson Isle state</small><strong id="crimson-current-title">{available("faction") ? model.selectedFaction ?? "No faction recorded" : "Faction unavailable"}</strong></span></div><b className="profile-number">{available("abiphone") && model.abiphoneContacts !== null ? `${model.abiphoneContacts.toLocaleString()} contacts` : "Contacts unavailable"}</b></header>
              <div className="profile-crimson-reputation">
                <div className={model.selectedFaction?.toLowerCase().includes("mage") ? "is-current" : ""}><span>Mage reputation</span><strong className="profile-number">{available("reputation") && model.mageReputation !== null ? compactProfileNumber(model.mageReputation) : "Unavailable"}</strong></div>
                <div className={model.selectedFaction?.toLowerCase().includes("barbarian") ? "is-current" : ""}><span>Barbarian reputation</span><strong className="profile-number">{available("reputation") && model.barbarianReputation !== null ? compactProfileNumber(model.barbarianReputation) : "Unavailable"}</strong></div>
              </div>
            </section>
            <section className="profile-crimson-kuudra" aria-labelledby="crimson-kuudra-title"><header><strong id="crimson-kuudra-title">Kuudra completions</strong><span>Five tiers</span></header><div className="profile-crimson-kuudra-track">{KUUDRA_TIERS.map((label) => { const row = model.kuudra.find((entry) => entry.label === label); return <div key={label}><span>{label}</span><strong className="profile-number">{!available("kuudra") ? "Unavailable" : row ? row.completions.toLocaleString() : "No record"}</strong></div>; })}</div></section>
            <section className="profile-crimson-trophies" aria-labelledby="crimson-trophy-title"><header><div><Fish aria-hidden /><strong id="crimson-trophy-title">Trophy Fish collection</strong></div><span>{available("trophyFish") ? `${model.trophyFish.length.toLocaleString()} fish types` : "Unavailable"}</span></header>{!available("trophyFish") ? <p className="profile-rmd-field-state">Trophy Fish data is unavailable.</p> : model.trophyFish.length === 0 ? <p className="profile-rmd-field-state">No Trophy Fish catches are recorded.</p> : <div className="profile-crimson-trophy-layout"><div className="profile-crimson-trophy-grid">{model.trophyFish.map((row) => <TrophyTile key={row.key} row={row} selected={selectedFish?.key === row.key} onSelect={() => setSelectedFishKey(row.key)} />)}</div>{selectedFish && <TrophyDetail row={selectedFish} />}</div>}</section>
            <div className="profile-rmd-pages profile-crimson-depth">
              <ProfilePbcDisclosure storageId="crimson-dojo" title="Dojo" count={available("dojo") ? model.dojo.length : null} initiallyExpanded={false}>{!available("dojo") ? <p className="profile-rmd-field-state">Dojo data is unavailable.</p> : model.dojo.length === 0 ? <p className="profile-rmd-field-state">No Dojo scores are recorded.</p> : <div className="profile-crimson-value-grid">{model.dojo.map((row) => <DojoRow key={row.key} row={row} />)}</div>}</ProfilePbcDisclosure>
              <ProfilePbcDisclosure storageId="crimson-contacts" title="Abiphone contacts" count={available("abiphone") ? (model.contacts !== undefined ? model.contacts.length : model.abiphoneContacts) : null} initiallyExpanded={false}>{!available("abiphone") ? <p className="profile-rmd-field-state">Abiphone contact data is unavailable.</p> : (model.contacts?.length ?? 0) === 0 ? <p className="profile-rmd-field-state">No active Abiphone contacts are recorded.</p> : <div className="profile-crimson-contacts">{model.contacts?.map((contact) => <span key={contact}><Users aria-hidden />{contact}</span>)}</div>}</ProfilePbcDisclosure>
            </div>
          </div>
        )}
      </section>
    </section>
  );
};

export default CrimsonIslePreview;
