import React, { useEffect, useMemo, useState } from "react";
import { CircleOff, PackageX, Search } from "lucide-react";
import type { ProfileStatusView } from "../../profile/profileStatus";
import { wikiImageUrl } from "../../items/wikiCrafting";
import {
  type PetPreviewEntry,
  type PetsPreviewModel,
} from "../../profile/petsBestiaryCollections";
import { petItemFallback } from "../../profile/petItemMetadata";
import {
  resolveNeuItemHead,
  type ResolvedNeuItemHead,
} from "../../profile/petTextures";
import { resolveProfileSectionState, type ProfileSectionState } from "../../profile/riftMuseumDungeons";
import type { ItemTooltipMetadata, ItemTooltipSection } from "../../ui/itemTooltipModel";
import { ItemTooltipInlineItem } from "../../ui/ItemTooltip";
import {
  ProfilePbcDisclosure,
  ProfilePbcEmpty,
  ProfilePbcHeader,
  ProfilePbcLoading,
  ProfilePbcStatusLine,
  ProfilePbcUnavailable,
} from "./ProfilePbcShared";
import { compactProfileNumber, profilePercent } from "./profilePbcFormatting";
import { ProfileItemTile } from "./ProfileItemTile";
import { usePetArtworkTexture } from "./PetArtwork";
import { matchingOwnedPets } from "./profileAuxiliaryPreviewModels";
import "./pets-bestiary-collections.css";
import "./pets-preview.css";

export interface PetsPreviewProps {
  status: ProfileStatusView;
  model: PetsPreviewModel | null;
  error?: string | null;
}

const INITIAL_PET_TILES = 24;

const PetTile: React.FC<{
  pet: PetPreviewEntry;
  selected?: boolean;
  onSelect?: () => void;
}> = ({ pet, selected = false, onSelect }) => {
  const skinId = pet.skin?.id ?? null;
  const exactPetTexture = usePetArtworkTexture(pet.type, pet.tier, skinId);

  const displayIconId = pet.skin?.id ?? pet.iconId;
  const heldTier = pet.heldItem?.tier ?? petItemFallback(pet.heldItem?.id)?.rarity ?? null;
  const sections: ItemTooltipSection[] = (pet.abilities ?? []).map((ability) => ({
    title: ability.name,
    tone: "ability",
    lines: [ability.description],
  }));
  if (pet.heldItem) sections.push({
    title: "Held item",
    tone: "bonus",
    lines: [<ItemTooltipInlineItem id={pet.heldItem.id} name={pet.heldItem.name} tier={heldTier} key={pet.heldItem.id} />],
  });
  const metadata: ItemTooltipMetadata[] = [
    { label: "Status", value: pet.active ? "Active" : "Stored" },
    ...(pet.petType ? [{ label: "Pet type", value: pet.petType }] : []),
    { label: "Candy", value: pet.candyUsed === null ? "Unavailable" : pet.candyUsed.toLocaleString(), mono: true },
    { label: "Skin", value: pet.skin?.name ?? "Default" },
  ];
  return (
    <ProfileItemTile
      id={pet.iconId}
      name={pet.name}
      wikiName={pet.name}
      iconId={displayIconId}
      iconName={pet.skin?.name ?? pet.name}
      hypixelId={displayIconId}
      iconSrc={wikiImageUrl(pet.skin?.name ?? pet.name)}
      iconTerminalSrc={exactPetTexture}
      allowSemanticFallback={false}
      tier={pet.tier}
      tierIsDisplayed
      stats={pet.stats?.map((stat) => ({
        label: stat.label,
        value: stat.formatted,
        tone: stat.tone,
      }))}
      active={pet.active}
      selected={selected}
      onClick={onSelect}
      cornerLabel={pet.level === null ? null : pet.level}
      progress={pet.xp === null || pet.xpMax === null ? null : {
        label: "XP to max",
        value: `${compactProfileNumber(pet.xp)} / ${compactProfileNumber(pet.xpMax)}${pet.xpPercent === null ? "" : ` · ${profilePercent(pet.xpPercent)}`}`,
        current: pet.xp,
        max: pet.xpMax,
      }}
      sections={sections}
      metadata={metadata}
      ariaLabel={`${pet.name}, ${pet.tier}, ${pet.level === null ? "level unavailable" : `level ${pet.level}`}${pet.active ? ", active" : ""}`}
    />
  );
};

const ActivePet: React.FC<{ pet: PetPreviewEntry }> = ({ pet }) => {
  const progress = pet.xpPercent === null ? null : Math.max(0, Math.min(100, pet.xpPercent));
  const rarity = pet.tier.trim().toLowerCase().replace(/[\s_]+/g, "-");
  const maxed = progress !== null && progress >= 100;
  const heldTier = pet.heldItem?.tier ?? petItemFallback(pet.heldItem?.id)?.rarity ?? null;
  const skinKey = pet.skin?.id ?? null;
  const [resolvedSkin, setResolvedSkin] = useState<{ key: string; value: ResolvedNeuItemHead } | null>(null);
  useEffect(() => {
    if (!skinKey) {
      setResolvedSkin(null);
      return;
    }
    let current = true;
    void resolveNeuItemHead(skinKey).then((value) => {
      if (current) setResolvedSkin({ key: skinKey, value });
    });
    return () => {
      current = false;
    };
  }, [skinKey]);
  const exactSkin = skinKey !== null && resolvedSkin?.key === skinKey ? resolvedSkin.value : null;
  const skinTier = pet.skin?.tier ?? exactSkin?.tier ?? null;
  return (
    <section
      className={`profile-pet-active ${maxed ? "is-maxed" : ""}`}
      aria-labelledby="profile-active-pet-title"
      data-profile-pet-rarity={rarity}
    >
      <div className="profile-pet-active-identity">
        <span className="profile-pet-featured-tile" data-pet-active-tile><PetTile pet={pet} /></span>
        <div className="profile-pet-active-copy">
          <span className="profile-pet-active-label">{pet.active ? "Active pet" : "Selected pet"}</span>
          <h3 className="profile-pet-active-value" id="profile-active-pet-title">{pet.name}</h3>
          <p className="profile-pet-active-meta">
            {pet.tier} · {pet.level === null ? "Level unavailable" : `Level ${pet.level.toLocaleString()}`}
            {pet.petType ? ` · ${pet.petType}` : ""}
          </p>
        </div>
        <div className="profile-pet-attachments" aria-label="Active pet attachments">
          <div>
            <small>Held item</small>
            {pet.heldItem ? (
              <ProfileItemTile
                id={pet.heldItem.id}
                name={pet.heldItem.name}
                wikiName={pet.heldItem.name}
                iconId={pet.heldItem.id}
                hypixelId={pet.heldItem.id}
                tier={heldTier}
                tierIsDisplayed={Boolean(heldTier)}
                metadata={[{ label: "Attached to", value: pet.name }]}
                ariaLabel={`${pet.heldItem.name}, held by ${pet.name}`}
              />
            ) : (
              <span className="profile-pet-attachment-placeholder" title="No held item reported" aria-label="No held item reported">
                <PackageX aria-hidden />
              </span>
            )}
          </div>
          <div>
            <small>Skin</small>
            {pet.skin ? (
              <ProfileItemTile
                id={pet.skin.id}
                name={pet.skin.name}
                wikiName={pet.skin.name}
                iconId={pet.skin.id}
                hypixelId={pet.skin.id}
                iconSrc={wikiImageUrl(pet.skin.name)}
                iconTerminalSrc={exactSkin?.url}
                tier={skinTier}
                tierIsDisplayed={Boolean(skinTier)}
                allowSemanticFallback={false}
                metadata={[{ label: "Pet", value: pet.name }]}
                ariaLabel={`${pet.skin.name} on ${pet.name}`}
              />
            ) : (
              <span className="profile-pet-attachment-placeholder" title="Default pet appearance" aria-label="Default pet appearance">
                <CircleOff aria-hidden />
              </span>
            )}
          </div>
        </div>
        {pet.stats && pet.stats.length > 0 && (
          <dl className="profile-pet-active-stats" aria-label={`${pet.name} stats`}>
            {pet.stats.map((stat) => (
              <div key={stat.name}>
                <dt className={stat.colorClass ?? undefined}>{stat.label}</dt>
                <dd className={`${stat.colorClass ?? ""} profile-number`}>{stat.formatted}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div className="profile-pet-active-progress">
        <div className="profile-pet-progress-head">
          <span>XP to max</span>
          <strong className="profile-number">{progress === null ? "Unavailable" : maxed ? "Maxed" : profilePercent(progress)}</strong>
        </div>
        <div className="profile-pet-progress-track" role="progressbar" aria-label="XP to max" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? undefined}>
          {progress !== null && <i style={{ width: `${progress}%` }} />}
        </div>
        <dl>
          <div><dt>Experience</dt><dd className="profile-number">{pet.xp === null || pet.xpMax === null ? "Unavailable" : `${compactProfileNumber(pet.xp)} / ${compactProfileNumber(pet.xpMax)}`}</dd></div>
          <div><dt>Candy used</dt><dd className="profile-number">{pet.candyUsed === null ? "Unavailable" : pet.candyUsed.toLocaleString()}</dd></div>
        </dl>
      </div>
    </section>
  );
};

const stateForPets = (pets: PetsPreviewModel): ProfileSectionState => {
  if (!pets.available) return "unavailable";
  if (pets.entries.length === 0) return "empty";
  return pets.partial ? "partial" : "populated";
};

export const PetsPreview: React.FC<PetsPreviewProps> = ({ status, model, error = null }) => {
  const [query, setQuery] = useState("");
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [visiblePetCount, setVisiblePetCount] = useState(INITIAL_PET_TILES);
  const pets = model ?? {
    available: false,
    entries: [],
    activeId: null,
    uniqueTypes: 0,
    totalXp: null,
    totalCandyUsed: null,
    dropped: 0,
    partial: false,
  } satisfies PetsPreviewModel;
  const state = resolveProfileSectionState(status, stateForPets(pets));
  const activeEntries = pets.entries.filter((pet) => pet.active);
  const active = activeEntries.length === 1 ? activeEntries[0] : null;
  const selectedPet = selectedPetId === null
    ? null
    : pets.entries.find((pet) => pet.id === selectedPetId) ?? null;
  const featuredPet = selectedPet ?? active;
  const matches = useMemo(() => matchingOwnedPets(pets.entries, query), [pets.entries, query]);
  const displayedMatches = matches.slice(0, visiblePetCount);

  useEffect(() => {
    if (visiblePetCount >= matches.length) return;
    const handle = setTimeout(() => setVisiblePetCount(matches.length), 0);
    return () => clearTimeout(handle);
  }, [matches.length, visiblePetCount]);

  return (
    <section className="profile-pbc-preview profile-pets-preview" aria-label="Pets" data-profile-section-state={state}>
      <section className="profile-pbc-shell profile-glass" aria-label="Pets overview">
        <ProfilePbcHeader eyebrow="Pets" title="Pets" count={pets.available ? pets.entries.length : null} countLabel="owned" />
        {state === "loading" ? (
          <ProfilePbcLoading rows={6} />
        ) : state === "private" || state === "never-opened" || state === "unavailable" ? (
          <ProfilePbcUnavailable status={status} noun="Pet" error={error} />
        ) : state === "empty" ? (
          <ProfilePbcEmpty>No pets are recorded on this profile.</ProfilePbcEmpty>
        ) : (
          <div className="profile-pbc-content">
            {featuredPet ? (
              <ActivePet pet={featuredPet} />
            ) : (
              <div className="profile-pet-active-missing" role="status">
                {activeEntries.length > 1
                  ? "Multiple pets were marked active, so no single active pet is claimed."
                  : "No active pet was reported on this profile."}
              </div>
            )}
            <ProfilePbcStatusLine status={status} partial={state === "partial"} />
            <ProfilePbcDisclosure storageId="pets-owned" title="Owned pets" count={pets.entries.length}>
              <label className="profile-aux-search profile-pet-search">
                <span className="sr-only">Search owned pets</span>
                <Search aria-hidden />
                  <input
                    value={query}
                    onChange={(event) => {
                      setVisiblePetCount(INITIAL_PET_TILES);
                      setQuery(event.currentTarget.value);
                    }}
                  placeholder="Search pets, tiers, held items, or skins"
                  autoComplete="off"
                />
              </label>
              <div className="profile-pet-grid profile-item-grid" data-pet-owned-grid>
                {displayedMatches.map((pet) => (
                  <span className="profile-pet-owned-tile" data-pet-owned-tile key={pet.id}>
                    <PetTile
                      pet={pet}
                      selected={featuredPet?.id === pet.id}
                      onSelect={() => setSelectedPetId(pet.id)}
                    />
                  </span>
                ))}
              </div>
              {matches.length === 0 && <ProfilePbcEmpty>No owned pets match this search.</ProfilePbcEmpty>}
            </ProfilePbcDisclosure>
          </div>
        )}
      </section>
    </section>
  );
};
