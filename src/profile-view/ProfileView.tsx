import React, { useEffect, useMemo, useRef, useState } from "react";
import { WardrobeScroll } from "./WardrobeScroll";
import { ProfileProgressRow } from "./ProfileProgressRow";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { Check, ChevronDown, CircleMinus, Grid3x3, Info, Lock, Minus, PawPrint, Plus } from "lucide-react";
import { buildOwned, useOwned } from "../inventory";
import type { OwnedIndex } from "../inventory";
import { withoutChrome } from "../island/chrome";
import { liveSackEntries } from "../island/sacks";
import type { SectionProvenance } from "../island/merge";
import { useIsland } from "../island/useIsland";
import { SlotIcon } from "../island/SlotIcon";
import { resourceCategoryFor, resourceNameFor } from "../items/itemResource";
import { useRecipes } from "../items/useItemData";
import { profileNpcSellSummary } from "../networth/profileNpcSell";
import type { NpcSellSource } from "../networth/npcSell";
import type { SkyBlockProfileOption } from "../networth/useNetworth";
import { profilePrimaryTab, type ProfilePrimaryTab, type ProfileTab } from "../profile/profileTabs";
import { useProfile } from "../profile/useProfile";
import { useProfileTabs } from "../profile/useProfileTabs";
import { wardrobePresentation, type WardrobeKind } from "../profile/wardrobePresentation";
import {
  useLiveProfileViewModel,
  type LiveProfileViewModel,
} from "../profile/useLiveProfileViewModel";
import {
  buildDungeonsPreviewModel,
  buildMuseumPreviewModel,
  buildRiftPreviewModel,
} from "../profile/riftMuseumDungeons";
import type {
  ProfileGearBonusView,
  ProfileGearItemView,
  ProfileLoadoutDetailView,
  ProfileLoadoutContextView,
  ProfileMetricView,
  ProfilePetView,
  ProfileSkillView,
  ProfileTuningStatView,
  ProfileViewModel,
  ProfileWardrobeView,
} from "../profile/profileViewModel";
import { ItemIcon } from "../ui/ItemIcon";
import { ItemTooltip, ItemTooltipInlineItem } from "../ui/ItemTooltip";
import { parseMinecraftText, stripMinecraftFormatting } from "../ui/itemTooltipModel";
import { RARITY } from "../ui/kit";
import { WikiLink } from "../ui/WikiLink";
import { AccessoriesPreview } from "./AccessoriesPreview";
import { GameTooltip } from "./GameTooltip";
import { CharacterStage } from "./CharacterStage";
import { ProfileIdentity } from "./ProfileIdentity";
import { useCompactIdentity } from "./identityResponsive";
import { ProfileInfoPopover } from "./ProfileInfoPopover";
import { ProgressionGuiPreview } from "./ProgressionGuiPreview";
import { ProgressionTreeTooltipPreview } from "./ProgressionTreeTooltipPreview";
import { usePersistentDisclosure } from "./disclosure";
import { BestiaryPreview } from "./profile-sections/BestiaryPreview";
import { CollectionsPreview } from "./profile-sections/CollectionsPreview";
import { CrimsonIslePreview } from "./profile-sections/CrimsonIslePreview";
import { DungeonsPreview } from "./profile-sections/DungeonsPreview";
import { GardenPreview } from "./profile-sections/GardenPreview";
import { InventoryPreview } from "./profile-sections/InventoryPreview";
import { MinionsPreview } from "./profile-sections/MinionsPreview";
import { MuseumPreview } from "./profile-sections/MuseumPreview";
import { NetWorthPreview, NetWorthPreviewContent } from "./profile-sections/NetWorthPreview";
import { PetArtwork } from "./profile-sections/PetArtwork";
import { PetsPreview } from "./profile-sections/PetsPreview";
import { ProfileCoopPreview } from "./profile-sections/ProfileCoopPreview";
import { profileTabForKey } from "./profile-sections/profileTabKeyboard";
import { RiftPreview } from "./profile-sections/RiftPreview";
import { SkillsPreview } from "./profile-sections/SkillsPreview";
import "./profile.css";

const PANEL_EASE = [0.2, 0.75, 0.25, 1] as const;

const panelReveal = (reducedMotion: boolean | null, delay = 0) => reducedMotion ? {} : ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.44, delay, ease: PANEL_EASE },
});

const ARMOUR_PRESENTATION = wardrobePresentation("armour");
const EQUIPMENT_PRESENTATION = wardrobePresentation("equipment");

const EMPTY_TUNING_PRESENTATION = [
  { label: "Strength", shortLabel: "STR", glyph: "❁", tone: "red" },
  { label: "Health", shortLabel: "HP", glyph: "❤", tone: "green" },
  { label: "Defense", shortLabel: "DEF", glyph: "❈", tone: "green" },
  { label: "Speed", shortLabel: "SPD", glyph: "✦", tone: "white" },
  { label: "Critical Chance", shortLabel: "CC", glyph: "☣", tone: "blue" },
  { label: "Critical Damage", shortLabel: "CD", glyph: "☠", tone: "blue" },
] as const;

const compactXp = (value: number): string => new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
}).format(value);

const percent = (value: number): string => new Intl.NumberFormat("en", {
  maximumFractionDigits: 1,
}).format(value);

const InGameText: React.FC<{ text: string }> = ({ text }) => (
  <>
    {parseMinecraftText(text).map((segment, index) => (
      <span className={segment.className} key={`${segment.text}-${index}`}>{segment.text}</span>
    ))}
  </>
);

const LOADOUT_CONTEXTS: readonly ProfileLoadoutContextView[] = [
  {
    label: "Power Stone",
    value: "Forceful",
    tooltip: "Accessory Power",
    iconName: "Acacia Birdhouse",
    iconId: "ACACIA_BIRDHOUSE",
    tone: "power",
    detail: {
      kind: "power",
      powerName: "Forceful",
      stoneName: "Acacia Birdhouse",
      stoneId: "ACACIA_BIRDHOUSE",
      stoneRarity: "rare",
      wikiName: "Acacia Birdhouse",
      description: "§fAcacia Birdhouse §7unlocks the §cForceful §7Accessory Power.",
      uniqueBonus: "§c+4 ⫽ Ferocity",
    },
  },
  {
    label: "HotM",
    value: "Heart of the Mountain 1",
    tooltip: "Heart of the Mountain",
    iconName: "Heart of the Mountain",
    iconId: "HEART_OF_THE_MOUNTAIN",
    tone: "hotm",
    detail: {
      kind: "tree",
      name: "Heart of the Mountain 1",
      wikiName: "Heart of the Mountain",
      experience: 1_247_000,
      tokensSpent: 25,
      selectedAbility: "Mining Speed Boost",
      nodes: [
        { key: "mining_speed", name: "Mining Speed", level: 50, enabled: true },
        { key: "mining_fortune", name: "Mining Fortune", level: 50, enabled: true },
        { key: "efficient_miner", name: "Efficient Miner", level: 100, enabled: true },
        { key: "powder_buff", name: "Powder Buff", level: 50, enabled: true },
      ],
    },
  },
  {
    label: "HotF",
    value: "Heart of the Forest 1",
    tooltip: "Heart of the Forest",
    iconName: "Oak Sapling",
    iconId: "OAK_SAPLING",
    tone: "hotf",
    detail: {
      kind: "tree",
      name: "Heart of the Forest 1",
      wikiName: "Heart of the Forest",
      experience: 370_907.7,
      tokensSpent: 15,
      selectedAbility: null,
      nodes: [
        { key: "foraging_fortune", name: "Foraging Fortune", level: 50, enabled: true },
        { key: "hunters_luck", name: "Hunters Luck", level: 37, enabled: true },
        { key: "deep_waters", name: "Deep Waters", level: 50, enabled: true },
        { key: "luck_of_the_forest", name: "Luck Of The Forest", level: 40, enabled: true },
      ],
    },
  },
] as const;

const PROFILE_PRIMARY_TABS: readonly { id: ProfilePrimaryTab; label: string }[] = [
  { id: "gear", label: "Gear" },
  { id: "accessories", label: "Accessories" },
  { id: "pets", label: "Pets" },
  { id: "minions", label: "Minions" },
  { id: "inventory", label: "Inventory" },
  { id: "skills", label: "Skills" },
  { id: "network", label: "Networth" },
  { id: "rift", label: "Rift" },
  { id: "crimson", label: "Crimson Isle" },
  { id: "museum", label: "Museum" },
  { id: "bestiary", label: "Bestiary" },
  { id: "collections", label: "Collections" },
  { id: "coop", label: "Profile / Co-op" },
] as const;
const PROFILE_TAB_IDS = PROFILE_PRIMARY_TABS.map((tab) => tab.id);
const profileTabId = (tab: ProfileTab) => `profile-tab-${tab}`;
const profileTabPanelId = (tab: ProfileTab) => `profile-tabpanel-${tab}`;

const useSideBySideWardrobeLayout = () => {
  const [sideBySide, setSideBySide] = useState(() => (
    typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(min-width: 1501px)").matches
  ));

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia("(min-width: 1501px)");
    const sync = () => setSideBySide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return sideBySide;
};

const SkillRow: React.FC<Omit<ProfileSkillView, "key">> = ({
  name,
  wikiName,
  level,
  progress,
  figure,
  figureDetail,
  icon,
  iconId,
  iconSize = 28,
  maxed = false,
  locked = false,
  levelColor,
}) => {
  const reducedMotion = useReducedMotion();
  const progressAvailable = !locked && level !== null;
  return (
  <ProfileProgressRow className={`${maxed ? "profile-skill--maxed" : ""} ${locked ? "profile-skill--locked" : ""}`} icon={
    <WikiLink
      name={wikiName}
      className="profile-skill-icon-link"
      title={`Open ${wikiName} on the wiki`}
      showExternalIcon={false}
    >
      <>
        <span className="profile-skill-icon" aria-hidden>
          <ItemIcon name={icon} id={iconId} size={iconSize} fallback="initials" loading="eager" />
        </span>
        <span className="sr-only">Open {name} on the wiki</span>
      </>
    </WikiLink>}>
      <div className="profile-skill-head">
        <WikiLink
          name={wikiName}
          className="profile-skill-name"
          nameClassName="profile-skill-link-label"
          title={`Open ${wikiName} on the wiki`}
        >
          <>
            {name}{" "}
            {level !== null && (
              <span className="profile-skill-level" style={levelColor ? { color: levelColor } : undefined}>
                {level}
              </span>
            )}
          </>
        </WikiLink>
        <span
          className="profile-number profile-skill-figure"
          tabIndex={!locked && figureDetail && figureDetail !== figure ? 0 : undefined}
          aria-label={!locked && figureDetail && figureDetail !== figure ? figureDetail : undefined}
        >
          {locked ? (
            <span className="profile-skill-lock"><Lock aria-hidden /> {figure}</span>
          ) : figureDetail && figureDetail !== figure ? (
            <span className="profile-skill-figure-swap" aria-hidden>
              <span className="profile-skill-figure-compact">{figure}</span>
              <span
                className="profile-skill-figure-detail"
                onClick={(event) => {
                  const selection = window.getSelection();
                  if (!selection) return;
                  const range = document.createRange();
                  range.selectNodeContents(event.currentTarget);
                  selection.removeAllRanges();
                  selection.addRange(range);
                }}
              >
                {figureDetail}
              </span>
            </span>
          ) : figure}
        </span>
      </div>
      {progress !== null && (
        <span
          className={`profile-skill-progress ${locked ? "profile-progress--locked" : ""}`}
          role={locked ? undefined : "progressbar"}
          aria-label={locked
            ? `${name} locked`
            : progressAvailable
              ? `${name} progress ${Math.round(progress)}%`
              : `${name} progress unavailable`}
          aria-valuemin={progressAvailable ? 0 : undefined}
          aria-valuemax={progressAvailable ? 100 : undefined}
          aria-valuenow={progressAvailable ? Math.round(progress) : undefined}
        >
          {!locked && (
            <motion.i
              style={{ width: `${progress}%`, transformOrigin: "left" }}
              initial={reducedMotion ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.56, ease: PANEL_EASE }}
            />
          )}
        </span>
      )}
  </ProfileProgressRow>
  );
};

const GearItemTooltip: React.FC<{
  item: ProfileGearItemView;
  children: React.ReactElement;
  wrapperClassName: string;
  interactive?: boolean;
  locationLabel?: string;
  locationValue?: string;
  slotLabel?: string;
}> = ({ item, children, wrapperClassName, interactive = false, locationLabel, locationValue, slotLabel }) => (
  <ItemTooltip
    name={item.name}
    id={item.id}
    count={item.count}
    extra={item.extra}
    tier={item.rarity ?? undefined}
    tierIsDisplayed
    icon={<SlotIcon name={item.wikiName} id={item.id} hypixelId={item.id} skin={item.extra?.skin} size={32} />}
    lore={item.lore}
    wikiName={item.wikiName}
    metadata={[
      ...(slotLabel ? [{ label: "Item slot", value: slotLabel }] : []),
      ...(locationLabel && locationValue ? [{ label: locationLabel, value: locationValue }] : []),
    ]}
    ariaLabel={`${item.name}${item.rarity ? `, ${item.rarity}` : ""}${slotLabel ? ` ${slotLabel}` : ""}`}
    wrapperClassName={wrapperClassName}
    interactive={interactive}
  >
    {children}
  </ItemTooltip>
);

const GearSlot: React.FC<{
  item?: ProfileGearItemView | null;
  emptyLabel?: string;
  locked?: boolean;
  selected?: boolean;
  locationLabel?: string;
  locationValue?: string;
  slotId?: string;
  slotLabel?: string;
}> = ({
  item,
  emptyLabel = "Empty slot",
  locked = false,
  selected = false,
  locationLabel,
  locationValue,
  slotId,
  slotLabel,
}) => {
  if (!item) {
    return (
      <span
        className={`profile-gear-slot profile-gear-slot--empty ${locked ? "profile-gear-slot--locked" : ""}`}
        title={emptyLabel}
        aria-label={emptyLabel}
        aria-disabled={locked || undefined}
      >
        <EmptySlotIcon slotId={slotId} />
      </span>
    );
  }

  return (
    <GearItemTooltip
      item={item}
      locationLabel={locationLabel}
      locationValue={locationValue}
      slotLabel={slotLabel}
      wrapperClassName="profile-gear-tooltip"
    >
      <button
        type="button"
        className={`profile-gear-slot profile-gear-slot--${(item.rarity ?? "unknown").toLowerCase().replace(/[\s_]+/g, "-")} ${selected ? "profile-gear-slot--selected" : ""}`}
        aria-label={item.name}
      >
        <SlotIcon name={item.wikiName} id={item.id} hypixelId={item.id} skin={item.extra?.skin} size={38} />
      </button>
    </GearItemTooltip>
  );
};

const EMPTY_SLOT_ICONS: Readonly<Record<string, React.ReactNode>> = {
  helmet: (
    <>
      <path d="M4.9 8.2C4.9 4.6 7.6 2.5 12 2.5s7.1 2.1 7.1 5.7v3.6c0 4.5-3 7.7-7.1 7.7s-7.1-3.2-7.1-7.7Z" />
      <circle cx="9.4" cy="10" r=".55" fill="currentColor" stroke="none" />
      <circle cx="14.6" cy="10" r=".55" fill="currentColor" stroke="none" />
      <path d="M9.8 14.6c1.4.8 3 .8 4.4 0" />
    </>
  ),
  chestplate: <path d="M8 5.2 12 7l4-1.8 3 3.1-2.2 2.4v8.1H7.2v-8.1L5 8.3Z" />,
  leggings: <path d="M7.2 4.8h9.6l-1.1 14.4h-3L12 11.5l-.7 7.7h-3Z" />,
  boots: (
    <>
      <path d="M6.1 4.8h4v9.1l-1.8 4.5H4.5v-3.1l1.6-1.1Z" />
      <path d="M13.9 4.8h4v9.4l1.6 1.1v3.1h-3.8l-1.8-4.5Z" />
    </>
  ),
  necklace: (
    <>
      <path d="M5.2 4.7c.8 5.8 3.3 9 6.8 9s6-3.2 6.8-9" />
      <path d="m12 13.7 2.2 2.2L12 19l-2.2-3.1Z" />
    </>
  ),
  cloak: (
    <>
      <circle cx="9" cy="5.6" r="1" />
      <circle cx="15" cy="5.6" r="1" />
      <path d="M8.1 6.3 5.4 19.2l6.6-2.8 6.6 2.8-2.7-12.9" />
    </>
  ),
  belt: (
    <>
      <path d="M3.8 8.7h16.4v6.6H3.8Z" />
      <path d="M9.3 7.8h5.4v8.4H9.3Z" />
      <path d="M10.9 10.4h2.2v3.2h-2.2Z" />
    </>
  ),
  "gloves-or-bracelets": (
    <path d="M8.2 5.7v5.1L6.7 9.1a1.4 1.4 0 0 0-2.2 1.7l2.4 5.3c.8 1.9 2.4 3 4.5 3h1.3c3 0 5.1-2 5.1-5V8.4a1.25 1.25 0 0 0-2.5 0v2m0 0V5.9a1.25 1.25 0 0 0-2.5 0v4.5m0 0V5.2a1.25 1.25 0 0 0-2.5 0v5.2m0 0V5.7a1.05 1.05 0 0 0-2.1 0Z" />
  ),
};

const EmptySlotIcon: React.FC<{ slotId?: string }> = ({ slotId }) => {
  const icon = slotId ? EMPTY_SLOT_ICONS[slotId] : null;
  return (
    <span className="profile-empty-slot-icon" aria-hidden>
      {icon && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      )}
    </span>
  );
};

const WARDROBE_PAGE_SIZE = 9;

const WardrobePage: React.FC<{
  kind: WardrobeKind;
  label: string;
  pageIndex: number;
  slots: ProfileWardrobeView["slots"];
  presentation: ReturnType<typeof wardrobePresentation>;
  sideBySide: boolean;
}> = ({ kind, label, pageIndex, slots, presentation, sideBySide }) => {
  const hasUnlockedSlots = slots.some((slot) => (
    slot.state === "occupied" || slot.state === "unlocked-empty"
  ));
  const lockedPage = !hasUnlockedSlots;
  const savedCount = slots.filter((slot) => slot.state === "occupied").length;
  const pageNumber = pageIndex + 1;
  const [expanded, setExpanded] = usePersistentDisclosure(`wardrobe:${kind}:page:${pageNumber}`, !lockedPage);
  const pageOpen = sideBySide ? true : expanded;
  const pageLabelId = `profile-${kind}-wardrobe-page-${pageNumber}-label`;
  const pageBodyId = `profile-${kind}-wardrobe-page-${pageNumber}-body`;
  const pageHeading = (
    <span className="profile-wardrobe-page-legend" id={pageLabelId}>
      <span>Page {pageNumber}</span>
      {lockedPage ? (
        <span className="profile-wardrobe-page-locked">
          <Lock aria-hidden />
          Locked
        </span>
      ) : (
        <span className="profile-wardrobe-page-saved">
          <Grid3x3 aria-hidden />
          {savedCount} saved
        </span>
      )}
    </span>
  );

  return (
    <section
      className={`profile-wardrobe-page ${lockedPage ? "profile-wardrobe-page--locked" : ""} ${pageOpen ? "is-open" : ""}`}
      aria-labelledby={pageLabelId}
    >
      {sideBySide ? (
        <div className="profile-wardrobe-page-titlebar">
          {pageHeading}
        </div>
      ) : (
        <button
          type="button"
          className="profile-wardrobe-page-titlebar profile-wardrobe-page-disclosure"
          aria-label={`${expanded ? "Collapse" : "Expand"} ${label} page ${pageNumber}`}
          aria-expanded={expanded}
          aria-controls={pageBodyId}
          onClick={() => setExpanded((current) => !current)}
        >
          {pageHeading}
          <ChevronDown className="profile-disclosure-chevron" aria-hidden />
        </button>
      )}
      <div className="profile-wardrobe-page-body" id={pageBodyId} hidden={!pageOpen}>
        <WardrobeScroll label={`${label} page ${pageNumber}`} open={pageOpen}>
        <div className="profile-wardrobe-grid">
          {slots.map((wardrobeSlot, position) => {
            const locked = wardrobeSlot.state === "locked";
            const setIndex = pageIndex * WARDROBE_PAGE_SIZE + position;

            return (
              <div
                className={`profile-wardrobe-set ${locked ? "profile-wardrobe-set--locked" : ""} ${wardrobeSlot.state === "unlocked-empty" ? "profile-wardrobe-set--empty" : ""}`}
                role="group"
                aria-label={locked ? `${label} position ${setIndex + 1}, locked` : `${wardrobeSlot.label} set`}
                key={`${kind}-${wardrobeSlot.id ?? `private-${setIndex + 1}`}`}
              >
                {presentation.slots.map((slotPresentation, slotIndex) => {
                  const piece = wardrobeSlot.pieces[slotIndex] ?? null;
                  const emptyLabel = locked
                    ? `Locked ${slotPresentation.label} slot in wardrobe position ${setIndex + 1}`
                    : `${wardrobeSlot.label} empty ${slotPresentation.label} slot`;

                  return (
                    <GearSlot
                      key={`${wardrobeSlot.id ?? "locked"}-${setIndex}-${slotPresentation.id}`}
                      item={piece}
                      emptyLabel={emptyLabel}
                      locked={locked}
                      locationLabel="Wardrobe slot"
                      locationValue={wardrobeSlot.id === null ? "Private" : `${wardrobeSlot.id}`}
                      slotId={slotPresentation.id}
                      slotLabel={slotPresentation.label}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
        </WardrobeScroll>
      </div>
    </section>
  );
};

const Wardrobe: React.FC<{
  kind: WardrobeKind;
  label: string;
  wardrobe: ProfileWardrobeView;
  sideBySide: boolean;
}> = ({ kind, label, wardrobe, sideBySide }) => {
  const presentation = kind === "armour" ? ARMOUR_PRESENTATION : EQUIPMENT_PRESENTATION;
  const pages = Array.from({ length: Math.ceil(wardrobe.slots.length / WARDROBE_PAGE_SIZE) }, (_, pageIndex) => {
    const start = pageIndex * WARDROBE_PAGE_SIZE;
    return wardrobe.slots.slice(start, start + WARDROBE_PAGE_SIZE);
  });

  return (
    <section className="profile-wardrobe" aria-label={label}>
      <header className="profile-subhead profile-wardrobe-header">
        <span>{label}</span>
        {!wardrobe.available && (
          <span className="profile-wardrobe-header-meta">
            <small>Private</small>
          </span>
        )}
      </header>
      {!wardrobe.available ? (
        <div className="profile-wardrobe-private" role="status">
          Inventory API access is off, so this wardrobe cannot be read.
        </div>
      ) : (
        <div className="profile-wardrobe-pages">
          {pages.map((slots, pageIndex) => (
            <WardrobePage
              kind={kind}
              label={label}
              pageIndex={pageIndex}
              slots={slots}
              presentation={presentation}
              sideBySide={sideBySide}
              key={`${kind}-page-${pageIndex + 1}-${slots.every((slot) => slot.state === "locked") ? "locked" : "available"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};

const Metric: React.FC<ProfileMetricView> = ({ label, value, tone, parts, modes, info }) => {
  const [activeMode, setActiveMode] = useState(0);
  const [showJoinedExact, setShowJoinedExact] = useState(false);
  const mode = modes?.[activeMode] ?? modes?.[0];
  const joinedExact = info?.variant === "joined" ? info.hero?.value ?? null : null;
  const displayValue = joinedExact && showJoinedExact ? joinedExact : mode?.value ?? value;
  const displayParts = mode?.parts ?? parts;

  return (
    <span className={`profile-metric ${tone ? `profile-metric--${tone}` : ""} ${modes ? "profile-metric--coins-wide" : ""} ${joinedExact && showJoinedExact ? "profile-metric--exact-visible" : ""}`}>
      <span className="profile-metric-head">
        <span className="profile-metric-label">{label}</span>
        {modes && (
          <span className="profile-metric-mode-switch" role="group" aria-label="Coin balance view">
            {modes.map((option, index) => (
              <button
                type="button"
                aria-pressed={index === activeMode}
                className={index === activeMode ? "is-active" : ""}
                onClick={() => setActiveMode(index)}
                key={option.label}
              >
                {option.label}
              </button>
            ))}
          </span>
        )}
      </span>
      {displayParts && displayParts.length > 0 ? (
        <span className="profile-metric-parts" aria-label={`${mode?.label ?? label}: ${displayParts.map((part) => `${part.label} ${part.value}`).join(", ")}`}>
          {displayParts.map((part) => (
            <span key={part.label}>
              <small>{part.label}</small>
              <strong className="profile-number">{part.value}</strong>
            </span>
          ))}
        </span>
      ) : (
        <strong className="profile-number" aria-live={joinedExact ? "polite" : undefined}>{displayValue}</strong>
      )}
      {joinedExact ? (
        <span className="profile-metric-hint">
          <button
            type="button"
            className="profile-metric-hint-button"
            aria-label={showJoinedExact ? "Show joined date" : "Show exact joined date"}
            aria-pressed={showJoinedExact}
            onPointerEnter={(event) => { if (event.pointerType !== "touch") setShowJoinedExact(true); }}
            onPointerLeave={(event) => { if (event.pointerType !== "touch") setShowJoinedExact(false); }}
            onPointerDown={(event) => { if (event.pointerType === "touch") setShowJoinedExact((current) => !current); }}
            onFocus={() => setShowJoinedExact(true)}
            onBlur={() => setShowJoinedExact(false)}
          >
            <Info aria-hidden />
          </button>
        </span>
      ) : info && (
        <ProfileInfoPopover
          title={label}
          info={info}
          ariaLabel={`${label} information`}
          wrapperClassName="profile-metric-hint"
        >
          <button type="button" className="profile-metric-hint-button">
            <Info aria-hidden />
          </button>
        </ProfileInfoPopover>
      )}
    </span>
  );
};

const LoadoutContextTooltip: React.FC<{
  context: ProfileLoadoutContextView;
  children: React.ReactElement;
  interactive?: boolean;
}> = ({ context, children, interactive = false }) => {
  const detail = context.detail;
  if (detail?.kind === "power") {
    return (
      <ItemTooltip
        name={detail.stoneName ?? detail.powerName}
        id={detail.stoneId}
        tier={detail.stoneRarity}
        icon={<ItemIcon name={detail.stoneName ?? context.iconName} id={detail.stoneId ?? context.iconId} size={34} fallback="initials" />}
        wikiName={detail.wikiName}
        sections={[
          { lines: [<InGameText text={detail.description} key="description" />] },
          ...(detail.uniqueBonus ? [{
            title: "Unique power bonus",
            tone: "bonus" as const,
            lines: [<InGameText text={detail.uniqueBonus} key="bonus" />],
          }] : []),
        ]}
        metadata={[{ label: "Accessory Power", value: detail.powerName }]}
        ariaLabel={`${detail.powerName} Accessory Power from ${detail.stoneName ?? "its selected power stone"}`}
        wrapperClassName="profile-loadout-context-tooltip"
        interactive={interactive}
      >
        {children}
      </ItemTooltip>
    );
  }

  if (detail?.kind === "tree") {
    return (
      <ItemTooltip
        name={context.value ?? detail.name}
        icon={<ItemIcon name={context.iconName} id={context.iconId} size={34} fallback="initials" />}
        wikiName={detail.wikiName}
        sections={[{
          lines: [<ProgressionTreeTooltipPreview context={context} key="tree-preview" />],
        }]}
        ariaLabel={`${detail.name}, ${detail.wikiName} saved tree`}
        wrapperClassName="profile-loadout-context-tooltip"
        interactive={interactive}
      >
        {children}
      </ItemTooltip>
    );
  }

  return (
    <ItemTooltip
      name={context.value ?? context.tooltip}
      id={context.iconId}
      icon={<ItemIcon name={context.iconName} id={context.iconId} size={34} fallback="initials" />}
      sections={[{ lines: [context.value
        ? `${context.value} is selected by this loadout; its allocation was not shared.`
        : `No ${context.tooltip} is saved to this loadout.`] }]}
      ariaLabel={context.value ?? `${context.tooltip}, not set`}
      wrapperClassName="profile-loadout-context-tooltip"
      interactive={interactive}
    >
      {children}
    </ItemTooltip>
  );
};

const LoadoutStatsPreview: React.FC<{
  contexts: readonly ProfileLoadoutContextView[];
  tuning: readonly ProfileTuningStatView[];
  idPrefix: string;
  locked?: boolean;
}> = ({ contexts, tuning, idPrefix, locked = false }) => {
  const [openTree, setOpenTree] = useState<ProfileLoadoutContextView["label"] | null>(null);
  const [inactiveExpanded, setInactiveExpanded] = usePersistentDisclosure(`${idPrefix}:presets`, false);
  const inactiveBodyId = `${idPrefix}-presets-body`;
  const activeTree = contexts.find((context) => context.label === openTree && context.detail?.kind === "tree") ?? null;
  const inactive = tuning.length === 0 && contexts.every((context) => context.value === null && context.detail === null);
  const body = (
      <div
        className={`profile-loadout-stats-body ${inactive ? "profile-loadout-stats-body--inactive profile-inactive-disclosure-body" : ""}`}
        id={inactive ? inactiveBodyId : undefined}
      >
        <div className="profile-loadout-contexts">
          {contexts.map((context) => {
            const opensTree = context.detail?.kind === "tree";
            const isTreePreset = context.tone === "hotm" || context.tone === "hotf";
            const button = (
              <button
                type="button"
                className={`profile-loadout-context profile-loadout-context--${context.tone} ${openTree === context.label ? "is-open" : ""}`}
                aria-expanded={!inactive && opensTree ? openTree === context.label : undefined}
                aria-controls={!inactive && opensTree ? `${idPrefix}-context-${context.label.toLowerCase()}` : undefined}
                aria-haspopup={!inactive && opensTree ? "dialog" : undefined}
                disabled={inactive}
                onClick={!inactive && opensTree ? () => setOpenTree(context.label) : undefined}
                key={context.label}
              >
                <span className="profile-loadout-context-icon" aria-hidden>
                  <ItemIcon name={context.iconName} id={context.iconId} size={28} fallback="initials" />
                </span>
                <span className={`profile-loadout-context-copy ${isTreePreset ? "profile-loadout-context-copy--tree" : ""}`}>
                  <small>{context.label}</small>
                  {isTreePreset && <span className="profile-loadout-context-preset-label">Preset name:</span>}
                  <strong>{context.value ?? "Not set"}</strong>
                </span>
              </button>
            );
            return inactive || openTree !== null ? button : (
              <LoadoutContextTooltip context={context} interactive={opensTree} key={context.label}>
                {button}
              </LoadoutContextTooltip>
            );
          })}
        </div>

        {!inactive && activeTree && <ProgressionGuiPreview context={activeTree} onClose={() => setOpenTree(null)} />}

        <div className={`profile-tuning ${tuning.length === 0 ? "profile-tuning--inactive" : ""}`}>
          <span className="profile-subhead">Tuning Points</span>
          {tuning.length > 0 ? (
            <div className="profile-tuning-grid">
              {tuning.map((stat) => (
                <div className="profile-tuning-stat" aria-label={`${stat.label} ${stat.value}`} key={stat.key}>
                  <span className={`profile-tuning-glyph profile-tuning-glyph--${stat.tone}`} aria-hidden>
                    {stat.glyph}
                  </span>
                  <span className={`profile-tuning-label profile-tuning-label--${stat.tone}`}>{stat.shortLabel}</span>
                  <strong className="profile-number">{stat.value}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="profile-tuning-grid profile-tuning-grid--inactive" aria-hidden>
              {EMPTY_TUNING_PRESENTATION.map((stat) => (
                <div className="profile-tuning-stat profile-tuning-stat--inactive" key={stat.label}>
                  <span className={`profile-tuning-glyph profile-tuning-glyph--${stat.tone}`}>{stat.glyph}</span>
                  <span className={`profile-tuning-label profile-tuning-label--${stat.tone}`}>{stat.shortLabel}</span>
                  <strong className="profile-number">-</strong>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
  );

  if (inactive) return (
    <fieldset className={`profile-loadout-stats profile-loadout-stats--inactive profile-inactive-disclosure ${inactiveExpanded ? "is-open" : ""}`} aria-label={`Presets, ${locked ? "locked" : "inactive"}`}>
      <InactiveGroupLegend label="Presets" locked={locked} />
      {!locked && (
        <InactiveGroupToggle
          label="Presets"
          controlsId={inactiveBodyId}
          expanded={inactiveExpanded}
          onToggle={() => setInactiveExpanded((expanded) => !expanded)}
        />
      )}
      {body}
    </fieldset>
  );

  return (
    <fieldset className="profile-loadout-stats" aria-label="Presets">
      <legend className="profile-loadout-group-legend">Presets</legend>
      {body}
    </fieldset>
  );
};

const InactiveGroupLegend: React.FC<{ label: string; locked?: boolean }> = ({ label, locked = false }) => (
  <legend className="profile-loadout-group-legend profile-inactive-disclosure-legend">
    <span>{label}</span>
    {!locked && (
      <span className="profile-inactive-disclosure-label">
        <CircleMinus aria-hidden />
        <span>Inactive</span>
      </span>
    )}
  </legend>
);

const InactiveGroupToggle: React.FC<{
  label: string;
  controlsId: string;
  expanded: boolean;
  onToggle: () => void;
}> = ({ label, controlsId, expanded, onToggle }) => (
  <button
    type="button"
    className="profile-inactive-disclosure-toggle"
    aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
    aria-controls={controlsId}
    aria-expanded={expanded}
    onClick={onToggle}
  >
    <span className="profile-inactive-disclosure-toggle-icon" aria-hidden>
      {expanded ? <Minus /> : <Plus />}
    </span>
  </button>
);

interface PetItemTooltipProps {
  children: React.ReactElement;
  wrapperClassName: string;
  pet: ProfilePetView;
}

interface PetTooltipProps {
  children: React.ReactElement;
  wrapperClassName: string;
  pet: ProfilePetView;
  interactive?: boolean;
}

const PetTooltip: React.FC<PetTooltipProps> = ({ children, wrapperClassName, pet, interactive = false }) => (
  <ItemTooltip
    name={pet.name}
    id={pet.iconId}
    tier={pet.tier}
    tierIsDisplayed
    icon={(
      <PetArtwork
        type={pet.type}
        tier={pet.tier}
        name={pet.iconName}
        id={pet.iconId}
        skinId={pet.skinId}
        skinName={pet.skin}
        size={34}
        fallback="initials"
      />
    )}
    wikiName={pet.wikiName}
    stats={pet.stats.map((stat) => ({
      label: stat.label,
      value: stat.value,
      tone: stat.tone,
    }))}
    progress={{
      label: "XP to max",
      value: `${compactXp(pet.xp)} / ${compactXp(pet.xpMax)}`,
      current: pet.xp,
      max: pet.xpMax,
    }}
    sections={pet.abilities.map((ability) => ({
      title: ability.name,
      tone: "ability",
      lines: [<InGameText text={ability.description} key={ability.name} />],
    }))}
    metadata={[
      ...(pet.petType ? [{ label: "Pet type", value: pet.petType }] : []),
      { label: "Level", value: `${pet.level}` },
      { label: "Total XP", value: `${compactXp(pet.xp)} / ${compactXp(pet.xpMax)}`, mono: true },
      { label: "Candy used", value: pet.candyUsed === null ? "Unavailable" : `${pet.candyUsed} / 10`, mono: true },
      ...(pet.skin ? [{ label: "Skin", value: pet.skin }] : []),
      ...(pet.heldItem ? [{ label: "Held item", value: <ItemTooltipInlineItem id={pet.heldItem.id} name={pet.heldItem.name} tier={pet.heldItem.rarity} /> }] : []),
    ]}
    ariaLabel={`${pet.name}, level ${pet.level}, ${pet.tier} pet`}
    wrapperClassName={wrapperClassName}
    interactive={interactive}
  >
    {children}
  </ItemTooltip>
);

const PetItemTooltip: React.FC<PetItemTooltipProps> = ({ children, wrapperClassName, pet }) => {
  const heldItem = pet.heldItem;
  if (!heldItem) return children;
  return (
    <ItemTooltip
      name={heldItem.name}
      id={heldItem.id}
      tier={heldItem.rarity ?? undefined}
      icon={<ItemIcon name={heldItem.name} id={heldItem.id} size={30} fallback="initials" />}
      wikiName={heldItem.name}
      sections={heldItem.effect ? [{ lines: [<InGameText text={heldItem.effect} key="effect" />] }] : []}
      metadata={[{ label: "Pet", value: pet.name }]}
      ariaLabel={`${heldItem.name}, held by ${pet.name}`}
      wrapperClassName={wrapperClassName}
      interactive
    >
      {children}
    </ItemTooltip>
  );
};

const PetPreview: React.FC<{
  pet: ProfilePetView | null;
  idPrefix: string;
  label?: string;
  locked?: boolean;
}> = ({ pet, idPrefix, label = "Pet", locked = false }) => {
  const reducedMotion = useReducedMotion();
  const [inactiveExpanded, setInactiveExpanded] = usePersistentDisclosure(`${idPrefix}:pet`, false);
  const inactiveBodyId = React.useId();
  if (!pet) return (
    <fieldset className={`profile-pet-card profile-pet-card--empty profile-inactive-disclosure ${inactiveExpanded ? "is-open" : ""}`} aria-label={`${label}, ${locked ? "locked" : "inactive"}`}>
      <InactiveGroupLegend label={label} locked={locked} />
      {!locked && (
        <InactiveGroupToggle
          label={label}
          controlsId={inactiveBodyId}
          expanded={inactiveExpanded}
          onToggle={() => setInactiveExpanded((expanded) => !expanded)}
        />
      )}
      <div className="profile-pet-card-body profile-pet-card-body--empty profile-inactive-disclosure-body" id={inactiveBodyId}>
        <div className="profile-pet-main profile-pet-empty-preview" aria-hidden>
          <span className="profile-pet-icon profile-pet-icon--inactive">
            <PawPrint />
          </span>
          <span className="profile-pet-copy profile-pet-copy--inactive">
            <span className="profile-pet-empty-line profile-pet-empty-line--name" />
            <span className="profile-pet-empty-line profile-pet-empty-line--rarity" />
            <span className="profile-pet-empty-line profile-pet-empty-line--item" />
          </span>
        </div>
        <div className="profile-pet-progress profile-pet-empty-preview" aria-hidden>
          <span className="profile-pet-level-head">
            <small>Level progress</small>
            <strong>—</strong>
          </span>
          <span className="profile-pet-progress-track profile-pet-progress-track--inactive" />
          <div className="profile-pet-facts">
            <span>
              <small>Total XP</small>
              <strong>—</strong>
            </span>
            <span>
              <small>Candy Used</small>
              <strong>—</strong>
            </span>
          </div>
        </div>
      </div>
    </fieldset>
  );
  const heldItemRarity = pet.heldItem?.rarity?.trim().toLowerCase().replace(/\s+/g, "_") ?? "";
  const heldItemRarityClass = RARITY[heldItemRarity] ?? "text-slate-100";
  const petRarity = pet.tier.trim().toLowerCase().replace(/\s+/g, "_");
  const petRarityClass = RARITY[petRarity] ?? "text-slate-100";
  return (
    <fieldset className={`profile-pet-card profile-pet-card--rarity-${petRarity}`}>
      <legend className="profile-loadout-group-legend">{label}</legend>
      <div className="profile-pet-card-body">
        <div className="profile-pet-main">
          <PetTooltip wrapperClassName="profile-pet-tooltip profile-pet-tooltip--icon" pet={pet}>
            <button type="button" className="profile-pet-icon" aria-label={`Show ${pet.name} stats`}>
              <PetArtwork
                type={pet.type}
                tier={pet.tier}
                name={pet.iconName}
                id={pet.iconId}
                skinId={pet.skinId}
                skinName={pet.skin}
                size={56}
                fallback="initials"
              />
            </button>
          </PetTooltip>
          <span className="profile-pet-copy">
          <PetTooltip wrapperClassName="profile-pet-tooltip profile-pet-tooltip--name" pet={pet} interactive>
            <WikiLink
              name={pet.wikiName}
              className={`profile-pet-name-link ${petRarityClass}`}
              nameClassName="profile-pet-name-link-content"
              title={`Open ${pet.wikiName} on the wiki`}
            >
              <>
                <strong>{pet.name}</strong> <em>Lvl {pet.level}</em>
              </>
            </WikiLink>
          </PetTooltip>
          <span className="profile-pet-meta">
            <span>{pet.tier.charAt(0).toUpperCase() + pet.tier.slice(1)}</span>
            {pet.heldItem && (
              <PetItemTooltip wrapperClassName="profile-pet-item-tooltip" pet={pet}>
                <div className="profile-pet-item">
                  <WikiLink
                    name={pet.heldItem.name}
                    className={`profile-pet-item-link ${heldItemRarityClass}`}
                    nameClassName="profile-pet-item-link-content"
                    title={`Open ${pet.heldItem.name} on the wiki`}
                  >
                    <>
                      <span className="profile-pet-item-icon">
                        <ItemIcon name={pet.heldItem.name} id={pet.heldItem.id} size={18} fallback="initials" />
                      </span>
                      <strong className="profile-pet-item-name">{pet.heldItem.name}</strong>
                    </>
                  </WikiLink>
                  {pet.heldItem.effect && (
                    <span className="profile-pet-item-effect"><InGameText text={pet.heldItem.effect} /></span>
                  )}
                </div>
              </PetItemTooltip>
            )}
            </span>
          </span>
        </div>

        <div className="profile-pet-progress">
          <span className="profile-pet-level-head">
            <small>Level progress</small>
            <strong>{pet.xp >= pet.xpMax ? "Max level" : `Lvl ${pet.level}`}</strong>
          </span>
          <span
            className="profile-pet-progress-track"
            role="progressbar"
            aria-label={`${pet.name} pet level progress`}
            aria-valuemin={0}
            aria-valuemax={pet.xpMax}
            aria-valuenow={Math.min(pet.xp, pet.xpMax)}
          >
            <motion.span
              style={{ width: `${pet.xpPercent}%`, transformOrigin: "left" }}
              initial={reducedMotion ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.58, ease: PANEL_EASE }}
            />
          </span>
          <div className="profile-pet-facts">
            <span>
              <small>Total XP</small>
              <strong className="profile-number">
                {compactXp(pet.xp)} / {compactXp(pet.xpMax)} ({percent(pet.xpPercent)}%)
              </strong>
            </span>
            <span>
              <small>Candy Used</small>
              <strong className="profile-number">{pet.candyUsed === null ? "Unavailable" : `${pet.candyUsed} / 10`}</strong>
            </span>
          </div>
        </div>
      </div>
    </fieldset>
  );
};

const GearBonusList: React.FC<{
  bonuses: readonly ProfileGearBonusView[];
  className?: string;
}> = ({ bonuses, className = "" }) => (
  <span className={`profile-gear-bonuses ${className}`}>
    {bonuses.map((bonus) => (
      <span
        className={`profile-gear-bonus ${bonus.colorClass}`}
        aria-label={`${bonus.value} ${bonus.name}`}
        title={`${bonus.value} ${bonus.name}`}
        key={bonus.name}
      >
        <span className="profile-gear-bonus-glyph" aria-hidden>{bonus.glyph}</span>
        <span className="profile-gear-bonus-name">{bonus.name}</span>
        <strong className="profile-number">{bonus.value}</strong>
      </span>
    ))}
  </span>
);

interface GearSetBonusSection {
  key: string;
  lines: readonly string[];
  fullSet: boolean;
}

const setBonusSections = (items: readonly (ProfileGearItemView | null)[]): GearSetBonusSection[] => {
  const sections: GearSetBonusSection[] = [];
  const seen = new Set<string>();
  const heading = /^(?:Full Set Bonus|Set Bonus|Tiered Bonus|Piece Bonus):/i;

  for (const item of items) {
    const lore = item?.lore ?? [];
    for (let index = 0; index < lore.length; index += 1) {
      const plain = stripMinecraftFormatting(lore[index]).trim();
      if (!heading.test(plain)) continue;

      const lines = [lore[index]];
      for (let next = index + 1; next < lore.length; next += 1) {
        const nextPlain = stripMinecraftFormatting(lore[next]).trim();
        if (!nextPlain || heading.test(nextPlain)) break;
        lines.push(lore[next]);
      }

      const key = plain.replace(/\s+\(\d+\/\d+\)\s*$/, "").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      sections.push({ key, lines, fullSet: /^Full Set Bonus:/i.test(plain) });
    }
  }

  return sections;
};

const GearSetBonuses: React.FC<{
  sections: readonly GearSetBonusSection[];
}> = ({ sections }) => {
  if (sections.length === 0) return null;
  return (
    <div className="profile-gear-set-bonuses" aria-label="Set bonuses">
      {sections.map((section) => (
        <span className="profile-gear-set-bonus" key={section.key}>
          {section.lines.map((line, index) => (
            <span className="profile-gear-set-bonus-line" key={`${section.key}-${index}`}>
              {parseMinecraftText(line).map((segment, segmentIndex) => (
                <span className={segment.className} key={`${section.key}-${index}-${segmentIndex}`}>{segment.text}</span>
              ))}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
};

const EquippedGroup: React.FC<{
  label: string;
  items: readonly (ProfileGearItemView | null)[];
  bonuses: readonly ProfileGearBonusView[];
  presentation: ReturnType<typeof wardrobePresentation>;
  setBonusSections: readonly GearSetBonusSection[];
  locationValue?: string;
  inactive?: boolean;
  locked?: boolean;
}> = ({
  label,
  items,
  bonuses,
  presentation,
  setBonusSections: displayedSetBonuses,
  locationValue = "Active",
  inactive = false,
  locked = false,
}) => (
  <fieldset className={`profile-gear-column ${inactive ? "profile-gear-column--inactive" : ""}`} aria-label={`${label} loadout`}>
    <legend className="profile-gear-legend">{label}</legend>
    <div className="profile-gear-column-body">
      <div className="profile-gear-compact">
        <div className="profile-equipped-item-list">
          {presentation.slots.map((slot, index) => {
            const item = items[index] ?? null;
            return (
              <div className={`profile-equipped-item ${item ? "" : "profile-equipped-item--empty"}`} key={`${label}-${slot.id}`}>
                <GearSlot
                  item={item}
                  emptyLabel={locked ? `Locked ${slot.label} slot` : `Empty ${slot.label} slot`}
                  locked={locked}
                  locationLabel="Loadout"
                  locationValue={locationValue}
                  slotId={slot.id}
                  slotLabel={slot.label}
                />
              </div>
            );
          })}
        </div>

        <div className="profile-gear-summary-stack">
          {inactive ? (
            <footer className="profile-gear-total profile-gear-total--compact profile-gear-total--inactive" aria-hidden>
              <span className="profile-gear-total-label">Equipped stats</span>
              <span className="profile-gear-empty-stat"><i /><i /></span>
              <span className="profile-gear-empty-stat"><i /><i /></span>
              <span className="profile-gear-empty-stat"><i /><i /></span>
              <span className="profile-gear-empty-stat"><i /><i /></span>
            </footer>
          ) : bonuses.length > 0 && (
            <footer className="profile-gear-total profile-gear-total--compact">
              <span className="profile-gear-total-label">Equipped stats</span>
              <GearBonusList bonuses={bonuses} />
            </footer>
          )}
          {!inactive && <GearSetBonuses sections={displayedSetBonuses} />}
        </div>
      </div>
    </div>
  </fieldset>
);

const INACTIVE_LOADOUT_CONTEXTS: readonly ProfileLoadoutContextView[] = LOADOUT_CONTEXTS.map((context) => ({
  ...context,
  value: null,
  detail: null,
}));

const inactiveLoadoutDetail = (id: number, name: string): ProfileLoadoutDetailView => ({
  id,
  name,
  armour: ARMOUR_PRESENTATION.slots.map(() => null),
  equipment: EQUIPMENT_PRESENTATION.slots.map(() => null),
  armourSetName: null,
  armourBonuses: [],
  equipmentBonuses: [],
  contexts: INACTIVE_LOADOUT_CONTEXTS,
  tuning: [],
  pet: null,
});

const LoadoutDetail: React.FC<{
  detail: ProfileLoadoutDetailView;
  inventoryAvailable: boolean;
  idPrefix: string;
  active?: boolean;
  inactive?: boolean;
  locked?: boolean;
}> = ({ detail, inventoryAvailable, idPrefix, active = false, inactive = false, locked = false }) => {
  const armourSetBonuses = setBonusSections(detail.armour);
  const equipmentSetBonuses = setBonusSections(detail.equipment);
  const armourDisplayedSetBonuses = armourSetBonuses.filter((section) => !section.fullSet);
  const equipmentDisplayedSetBonuses = [...equipmentSetBonuses];
  for (const section of armourSetBonuses.filter((candidate) => candidate.fullSet)) {
    if (!equipmentDisplayedSetBonuses.some((candidate) => candidate.key === section.key)) {
      equipmentDisplayedSetBonuses.push(section);
    }
  }

  return (
    <div className={`profile-loadout-body ${inventoryAvailable ? "" : "profile-loadout-body--private"} ${inactive ? "profile-loadout-body--inactive" : ""}`}>
    {inventoryAvailable || inactive ? (
      <div className="profile-equipped">
        <EquippedGroup
          label="Armour"
          items={detail.armour}
          bonuses={detail.armourBonuses}
          presentation={ARMOUR_PRESENTATION}
          setBonusSections={armourDisplayedSetBonuses}
          locationValue={active ? "Active" : detail.name ?? "Saved loadout"}
          inactive={inactive}
          locked={locked}
        />
        <EquippedGroup
          label="Equipment"
          items={detail.equipment}
          bonuses={detail.equipmentBonuses}
          presentation={EQUIPMENT_PRESENTATION}
          setBonusSections={equipmentDisplayedSetBonuses}
          locationValue={active ? "Active" : detail.name ?? "Saved loadout"}
          inactive={inactive}
          locked={locked}
        />
      </div>
    ) : (
      <div className="profile-loadout-private" role="status">
        Inventory API access is off, so equipped items and pets cannot be read.
      </div>
    )}

    <LoadoutStatsPreview
      contexts={detail.contexts}
      tuning={detail.tuning}
      idPrefix={idPrefix}
      locked={locked}
    />

    {(inventoryAvailable || inactive) && (
      <PetPreview
        pet={detail.pet}
        idPrefix={idPrefix}
        label="Pet"
        locked={locked}
      />
    )}
    </div>
  );
};

const SavedLoadoutPreview: React.FC<{
  choiceId: string | number;
  title: string;
  detail: ProfileLoadoutDetailView;
  inventoryAvailable: boolean;
  state?: "saved" | "unset" | "locked";
}> = ({ choiceId, title, detail, inventoryAvailable, state = "saved" }) => {
  const inactive = state !== "saved";
  const locked = state === "locked";
  const [storedExpanded, setExpanded] = usePersistentDisclosure(`loadout:${choiceId}`, false);
  const expanded = locked ? false : storedExpanded;
  const titleId = `profile-loadout-${choiceId}-title`;
  const bodyId = `profile-loadout-${choiceId}-body`;
  return (
    <section
      className={`profile-saved-loadout profile-saved-loadout--${state} ${expanded ? "is-open" : ""}`}
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="profile-panel-head profile-saved-loadout-titlebar"
        aria-controls={bodyId}
        aria-expanded={expanded}
        aria-disabled={locked || undefined}
        onClick={() => {
          if (!locked) setExpanded((current) => !current);
        }}
      >
        <span className="profile-saved-loadout-title-copy">
          <strong className="profile-saved-loadout-title" id={titleId}>{title}</strong>
          {inactive && (
            <span className="profile-saved-loadout-state">
              {locked ? <Lock aria-hidden /> : <CircleMinus aria-hidden />}
              <span>{locked ? "Locked" : "Empty"}</span>
            </span>
          )}
        </span>
        {!locked && <ChevronDown className="profile-disclosure-chevron" aria-hidden />}
      </button>
      {expanded && (
        <div
          className={`profile-saved-loadout-body-wrap ${locked ? "profile-saved-loadout-body-wrap--locked" : ""}`}
          id={bodyId}
        >
          <LoadoutDetail
            detail={detail}
            inventoryAvailable={inventoryAvailable}
            idPrefix={`profile-loadout-${choiceId}`}
            inactive={inactive}
            locked={locked}
          />
        </div>
      )}
    </section>
  );
};

const GearPreview: React.FC<{ loadout: ProfileViewModel["loadout"] }> = ({ loadout }) => {
  const reducedMotion = useReducedMotion();
  const sideBySideWardrobes = useSideBySideWardrobeLayout();
  const activeChoice = loadout.choices.find((choice) => choice.active) ?? null;
  const otherLoadouts = loadout.choices.filter((choice) => !choice.active);

  return (
    <motion.section
      className="profile-loadout profile-glass"
      aria-label="Loadouts"
      {...panelReveal(reducedMotion, 0.04)}
    >
      <header className="profile-panel-head">
        <div className="profile-loadout-title-copy">
          <span className="profile-eyebrow">Active loadout</span>
          <h2>{activeChoice?.title ?? loadout.name ?? "Current loadout"}</h2>
        </div>
        <span className="profile-live-state">
          <Check aria-hidden />
          {loadout.inventoryAvailable
            ? loadout.resolved
              ? "Equipped"
              : "Current gear"
            : "Inventory private"}
        </span>
      </header>

      <LoadoutDetail
        detail={loadout}
        inventoryAvailable={loadout.inventoryAvailable}
        idPrefix="profile-active-loadout"
        active
      />

      <div className="profile-wardrobes">
        <Wardrobe kind="armour" label="Armour wardrobe" wardrobe={loadout.armourWardrobe} sideBySide={sideBySideWardrobes} />
        <Wardrobe kind="equipment" label="Equipment wardrobe" wardrobe={loadout.equipmentWardrobe} sideBySide={sideBySideWardrobes} />
      </div>

      {otherLoadouts.length > 0 && (
        <section className="profile-saved-loadouts" aria-labelledby="profile-saved-loadouts-title">
          <header className="profile-saved-loadouts-head">
            <span className="profile-subhead" id="profile-saved-loadouts-title">Loadouts</span>
          </header>

          <div className="profile-saved-loadout-list">
            {otherLoadouts.map((choice) => {
              return (
                <SavedLoadoutPreview
                  choiceId={choice.id}
                  title={choice.title}
                  detail={choice.detail ?? inactiveLoadoutDetail(choice.id, choice.title)}
                  inventoryAvailable={loadout.inventoryAvailable}
                  state={choice.state}
                  key={choice.id}
                />
              );
            })}
          </div>
        </section>
      )}
    </motion.section>
  );
};

const splitRows = <T,>(rows: readonly T[]): readonly [readonly T[], readonly T[]] => {
  const middle = Math.ceil(rows.length / 2);
  return [rows.slice(0, middle), rows.slice(middle)];
};

const TimecharmPanel: React.FC<{
  timecharms: ProfileViewModel["timecharms"];
  preview?: boolean;
}> = ({ timecharms, preview = false }) => {
  const total = timecharms.entries.length;
  const secured = timecharms.securedCount;
  const previewSlots = 8;
  const style = {
    "--timecharm-count": String(Math.max(total, 1)),
    "--timecharm-line-start": `${total > 0 ? 100 / (total * 2) : 0}%`,
    "--timecharm-line-fill": `${timecharms.available && total > 0 ? (Math.max(0, secured - 1) / total) * 100 : 0}%`,
  } as React.CSSProperties;
  const status = preview ? "not loaded" : timecharms.available ? `${secured} of ${total} secured` : "status not shared";

  return (
    <div
      className={`profile-timecharms ${timecharms.available ? "" : "profile-timecharms--private"}`}
      aria-label={`Rift Timecharms, ${status}`}
    >
      <div className="profile-timecharm-head">
        <span>Rift Timecharms</span>
        <strong className="profile-number">{preview ? "—" : timecharms.available ? `${secured} / ${total} secured` : "Not shared"}</strong>
      </div>
      {preview ? (
        <div
          className="profile-timecharm-list profile-timecharm-list--preview"
          style={{ "--timecharm-count": String(previewSlots) } as React.CSSProperties}
          aria-hidden
        >
          {Array.from({ length: previewSlots }, (_, index) => (
            <span className="profile-timecharm profile-timecharm--preview" key={index} />
          ))}
        </div>
      ) : total > 0 ? (
        <div className="profile-timecharm-list" style={style}>
          {timecharms.entries.map((timecharm) => {
            const state = !timecharms.available ? "status not shared" : timecharm.complete ? "secured" : "not secured";
            return (
              <GameTooltip
                label={timecharm.name}
                icon={<ItemIcon name={timecharm.name} size={32} fallback="initials" />}
                tone="rift"
                ariaLabel={`${timecharm.name}, ${state}`}
                wrapperClassName={`profile-timecharm ${timecharm.complete ? "profile-timecharm--complete" : ""}`}
                preserveChildAction
                key={timecharm.key}
              >
                <WikiLink
                  name={timecharm.wikiName}
                  className="profile-timecharm-trigger"
                  nameClassName="profile-timecharm-link-content"
                  title={`Open ${timecharm.wikiName} on the wiki`}
                  showExternalIcon={false}
                >
                  <>
                  <span className="profile-timecharm-icon" aria-hidden>
                    <ItemIcon name={timecharm.name} size={26} fallback="initials" />
                  </span>
                  <span className="sr-only">{timecharm.shortName}</span>
                  </>
                </WikiLink>
              </GameTooltip>
            );
          })}
        </div>
      ) : (
        <span className="profile-inline-empty">No Timecharm entries were returned.</span>
      )}
    </div>
  );
};

const ProfileSkill: React.FC<{ row: ProfileSkillView }> = ({ row }) => {
  return (
    <SkillRow
      name={row.name}
      wikiName={row.wikiName}
      level={row.level}
      progress={row.progress}
      figure={row.figure}
      figureDetail={row.figureDetail}
      icon={row.icon}
      iconId={row.iconId}
      iconSize={row.iconSize}
      maxed={row.maxed}
      locked={row.locked}
      levelColor={row.levelColor}
    />
  );
};

const ProfileProgressSection: React.FC<{
  label: string;
  rows: readonly ProfileSkillView[];
  empty: string;
}> = ({ label, rows, empty }) => {
  return (
    <section className="profile-progress-section" aria-label={label}>
      <h2 className="profile-section-label">{label}</h2>
      {rows.length > 0 ? (
        <div className="profile-skill-grid">
          {splitRows(rows).map((column, index) => (
            <div className="profile-skill-column" key={index}>
              {column.map((row) => <ProfileSkill key={row.key} row={row} />)}
            </div>
          ))}
        </div>
      ) : (
        <span className="profile-inline-empty">{empty}</span>
      )}
    </section>
  );
};

const ProfileModeSwitch: React.FC<{ scope: LiveProfileViewModel["scope"] }> = ({ scope }) => (
  <nav className="profile-mode-switch" aria-label="Profile mode">
    <Link to="/profile" aria-current={scope === "personal" ? "page" : undefined}>
      Connected profile
    </Link>
    <Link to="/pv" aria-current={scope === "public" ? "page" : undefined}>
      Profile viewer
    </Link>
  </nav>
);

const EMPTY_ISLAND_CHESTS = [] as const;
const EMPTY_OWNED: OwnedIndex = buildOwned({ items: {} });
const NO_CHEST_PROVENANCE: SectionProvenance = { state: "absent", source: null, at: null };
const EMPTY_RIFT_MODEL = buildRiftPreviewModel(null);
const EMPTY_DUNGEONS_MODEL = buildDungeonsPreviewModel(null);

const PersonalMinionsSection: React.FC<{ live: LiveProfileViewModel }> = ({ live }) => {
  const { items } = useRecipes();
  const owned = useOwned({ items });
  const { ironman } = useProfile();
  return (
    <MinionsPreview
      profile={live.profile.minions}
      profileStatus={live.profile.status}
      items={items}
      owned={owned}
      parsed={live.profile.parsed}
      inventoryShared={live.profile.coverage?.inventoryShared ?? false}
      ironman={ironman}
    />
  );
};

const PublicMinionsSection: React.FC<{ live: LiveProfileViewModel }> = ({ live }) => {
  const { items } = useRecipes();
  return (
    <MinionsPreview
      profile={live.profile.minions}
      profileStatus={live.profile.status}
      items={items}
      owned={EMPTY_OWNED}
      parsed={live.profile.parsed}
      inventoryShared={live.profile.coverage?.inventoryShared ?? false}
      ironman={live.profile.gameMode?.toLowerCase() === "ironman"}
    />
  );
};

const LiveMinionsSection: React.FC<{ live: LiveProfileViewModel }> = ({ live }) =>
  live.scope === "public" ? <PublicMinionsSection live={live} /> : <PersonalMinionsSection live={live} />;

const CollectionsSectionContent: React.FC<{
  live: LiveProfileViewModel;
  gameMode: string | null;
}> = ({ live, gameMode }) => (
  <CollectionsPreview
    status={live.status}
    model={live.profile.pbc?.collections ?? null}
    gameMode={gameMode}
    error={live.error}
  />
);

const PersonalCollectionsSection: React.FC<{ live: LiveProfileViewModel }> = ({ live }) => {
  const configuredProfile = useProfile();
  const gameMode = configuredProfile.source === "manual"
    ? configuredProfile.mode
    : live.profile.gameMode;
  return <CollectionsSectionContent live={live} gameMode={gameMode} />;
};

const PublicCollectionsSection: React.FC<{ live: LiveProfileViewModel }> = ({ live }) => (
  <CollectionsSectionContent live={live} gameMode={live.profile.gameMode} />
);

const LiveCollectionsSection: React.FC<{ live: LiveProfileViewModel }> = ({ live }) =>
  live.scope === "public"
    ? <PublicCollectionsSection live={live} />
    : <PersonalCollectionsSection live={live} />;

const PersonalInventorySection: React.FC<{ live: LiveProfileViewModel }> = ({ live }) => {
  const { items } = useRecipes();
  const owned = useOwned({ items });
  const { sections } = useIsland();
  const npcSell = React.useMemo(
    () => profileNpcSellSummary(live.profile.parsed, items),
    [live.profile.parsed, items],
  );
  return (
    <InventoryPreview
      parsed={live.profile.parsed}
      layouts={live.profile.inventoryLayouts}
      coverage={live.profile.coverage}
      profileStatus={live.profile.status}
      items={items}
      owned={owned}
      chestProvenance={sections.chests}
      networth={live.networth.result}
      npcSell={npcSell}
    />
  );
};

const PublicInventorySection: React.FC<{ live: LiveProfileViewModel }> = ({ live }) => {
  const { items } = useRecipes();
  const npcSell = React.useMemo(
    () => profileNpcSellSummary(live.profile.parsed, items),
    [live.profile.parsed, items],
  );
  return (
    <InventoryPreview
      parsed={live.profile.parsed}
      layouts={live.profile.inventoryLayouts}
      coverage={live.profile.coverage}
      profileStatus={live.profile.status}
      items={items}
      owned={null}
      chestProvenance={null}
      networth={live.networth.result}
      npcSell={npcSell}
    />
  );
};

const LiveInventorySection: React.FC<{ live: LiveProfileViewModel }> = ({ live }) =>
  live.scope === "public" ? <PublicInventorySection live={live} /> : <PersonalInventorySection live={live} />;

const PersonalNetWorthSection: React.FC<{ live: LiveProfileViewModel }> = ({ live }) => {
  const { snapshot, sections } = useIsland();
  const { items } = useRecipes();
  const supplementalNpcSources = React.useMemo((): readonly NpcSellSource[] => {
    if (!snapshot) return [];

    const sources: NpcSellSource[] = [];
    const add = (label: string, held: ReturnType<typeof withoutChrome>) => {
      if (held.length > 0) sources.push({ label, items: held });
    };

    add("Island Chests", snapshot.chests.flatMap((chest) => withoutChrome(chest.items)));

    // The Profile API remains authoritative for ordinary containers. The mod
    // only fills those categories when the Inventory API is unavailable, so a
    // player who has both sources never sees the same stack counted twice.
    if (!live.profile.parsed || live.profile.coverage?.inventoryShared === false) {
      add("Inventory", withoutChrome(snapshot.inventory ?? []));
      add("Ender Chest", withoutChrome(snapshot.enderChest ?? []));
      add("Storage", withoutChrome(snapshot.storage ?? []));
    }
    if (!live.profile.parsed) {
      const sacks = liveSackEntries(snapshot.sacks);
      if (sacks.length > 0) sources.push({ label: "Sacks", items: sacks });
    }

    return sources;
  }, [live.profile.coverage?.inventoryShared, live.profile.parsed, snapshot]);
  const npcSell = React.useMemo(
    () => profileNpcSellSummary(live.profile.parsed, items, supplementalNpcSources),
    [live.profile.parsed, items, supplementalNpcSources],
  );
  return (
    <NetWorthPreview
      chests={snapshot?.chests ?? EMPTY_ISLAND_CHESTS}
      chestProvenance={sections.chests}
      npcSell={npcSell}
    />
  );
};

const PublicNetWorthSection: React.FC<{ live: LiveProfileViewModel }> = ({ live }) => {
  const { items } = useRecipes();
  const npcSell = React.useMemo(
    () => profileNpcSellSummary(live.profile.parsed, items),
    [live.profile.parsed, items],
  );
  return (
    <NetWorthPreviewContent
      view={live.networth}
      chestProvenance={NO_CHEST_PROVENANCE}
      npcSell={npcSell}
    />
  );
};

const LiveNetWorthSection: React.FC<{ live: LiveProfileViewModel }> = ({ live }) =>
  live.scope === "public" ? <PublicNetWorthSection live={live} /> : <PersonalNetWorthSection live={live} />;

const LiveMuseumSection: React.FC<{ live: LiveProfileViewModel }> = ({ live }) => {
  const model = buildMuseumPreviewModel({
    parsed: live.profile.parsed,
    result: live.networth.result,
    coverage: live.profile.coverage,
    api: live.profile.museumApi,
    catalogue: live.profile.catalogue,
    itemNameFor: resourceNameFor,
    itemCategoryFor: resourceCategoryFor,
  });
  return <MuseumPreview status={live.status} model={model} error={live.error} />;
};

const LiveProfileSection: React.FC<{
  activeTab: ProfileTab;
  live: LiveProfileViewModel;
}> = ({ activeTab, live }) => {
  if (activeTab === "pets") {
    return <PetsPreview status={live.status} model={live.profile.pbc?.pets ?? null} error={live.error} />;
  }
  if (activeTab === "minions") return <LiveMinionsSection live={live} />;
  if (activeTab === "inventory") return <LiveInventorySection live={live} />;
  if (activeTab === "network") return <LiveNetWorthSection live={live} />;
  if (activeTab === "rift") {
    return <RiftPreview status={live.status} model={live.profile.rift ?? EMPTY_RIFT_MODEL} error={live.error} />;
  }
  if (activeTab === "crimson") {
    return <CrimsonIslePreview status={live.status} model={live.profile.crimson} error={live.error} />;
  }
  if (activeTab === "garden") {
    return <GardenPreview status={live.status} model={live.profile.garden} error={live.error} />;
  }
  if (activeTab === "museum") return <LiveMuseumSection live={live} />;
  if (activeTab === "bestiary") {
    return <BestiaryPreview status={live.status} model={live.profile.pbc?.bestiary ?? null} error={live.error} />;
  }
  if (activeTab === "collections") return <LiveCollectionsSection live={live} />;
  if (activeTab === "dungeons") {
    return <DungeonsPreview status={live.status} model={live.profile.dungeons ?? EMPTY_DUNGEONS_MODEL} error={live.error} />;
  }
  if (activeTab === "coop") {
    return <ProfileCoopPreview status={live.status} model={live.profile.profileCoop} error={live.error} />;
  }
  return null;
};

const SKILLS_INNER_TABS: readonly { id: "skills" | "garden" | "dungeons"; label: string }[] = [
  { id: "skills", label: "Skills" },
  { id: "garden", label: "Garden" },
  { id: "dungeons", label: "Dungeons" },
];
const SKILLS_INNER_TAB_IDS = SKILLS_INNER_TABS.map((tab) => tab.id);

const SkillsHub: React.FC<{
  activeTab: "skills" | "garden" | "dungeons";
  model: ProfileViewModel;
  live: LiveProfileViewModel;
  onTabChange: (tab: ProfileTab) => void;
}> = ({ activeTab, model, live, onTabChange }) => {
  const panelId = `profile-skills-panel-${activeTab}`;
  const tabRefs = useRef<Partial<Record<(typeof SKILLS_INNER_TAB_IDS)[number], HTMLButtonElement | null>>>({});
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tab: (typeof SKILLS_INNER_TAB_IDS)[number]) => {
    const next = profileTabForKey(SKILLS_INNER_TAB_IDS, tab, event.key);
    if (next !== "skills" && next !== "garden" && next !== "dungeons") return;
    event.preventDefault();
    onTabChange(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section className="profile-skills-hub" aria-label="Skills">
      <div className="profile-skills-hub-head profile-glass">
        <header className="profile-panel-head">
          <div className="profile-loadout-title-copy">
            <span className="profile-eyebrow">Skills</span>
            <h2>Skills and loadouts</h2>
          </div>
        </header>
        <nav className="profile-skills-inner-tabs" aria-label="Skills sections" role="tablist">
          {SKILLS_INNER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`profile-skills-tab-${tab.id}`}
              aria-controls={`profile-skills-panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={activeTab === tab.id ? "is-active" : ""}
              ref={(node) => { tabRefs.current[tab.id] = node; }}
              onClick={() => onTabChange(tab.id)}
              onKeyDown={(event) => onKeyDown(event, tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div
        className="profile-skills-inner-panel"
        role="tabpanel"
        id={panelId}
        aria-labelledby={`profile-skills-tab-${activeTab}`}
        tabIndex={0}
      >
        {activeTab === "skills" ? (
          <SkillsPreview model={model} parsed={live.profile.parsed} />
        ) : (
          <LiveProfileSection activeTab={activeTab} live={live} />
        )}
      </div>
    </section>
  );
};

const previewSkill = (key: string, name: string, icon: string): ProfileSkillView => ({
  key: `preview-${key}`,
  name,
  wikiName: name,
  level: null,
  progress: 0,
  figure: "—",
  icon,
  maxed: false,
  locked: false,
});

const PROFILE_PREVIEW_SKILLS: readonly ProfileSkillView[] = [
  previewSkill("farming", "Farming", "Golden Hoe"),
  previewSkill("mining", "Mining", "Golden Pickaxe"),
  previewSkill("combat", "Combat", "Iron Sword"),
  previewSkill("foraging", "Foraging", "Jungle Axe"),
  previewSkill("fishing", "Fishing", "Fishing Rod"),
  previewSkill("enchanting", "Enchanting", "Enchantment Table"),
  previewSkill("alchemy", "Alchemy", "Brewing Stand"),
  previewSkill("carpentry", "Carpentry", "Crafting Table"),
  previewSkill("runecrafting", "Runecrafting", "Magma Cream"),
  previewSkill("social", "Social", "Emerald"),
  previewSkill("taming", "Taming", "Enchanted Egg"),
  previewSkill("hunting", "Hunting", "Hunter Knife"),
];

const PROFILE_PREVIEW_SLAYERS: readonly ProfileSkillView[] = [
  previewSkill("revenant", "Revenant", "Revenant Flesh"),
  previewSkill("voidgloom", "Voidgloom", "Null Sphere"),
  previewSkill("tarantula", "Tarantula", "Tarantula Web"),
  previewSkill("sven", "Sven", "Wolf Tooth"),
  previewSkill("vampire", "Vampire", "Hemovibe"),
  previewSkill("inferno", "Inferno", "Derelict Ashe"),
];

const PROFILE_PREVIEW_METRICS: readonly ProfileMetricView[] = [
  { label: "Joined", value: "—", tone: "joined", info: null },
  { label: "Purse", value: "—", tone: "coins", info: null },
  { label: "Bank", value: "—", tone: "coins", info: null },
  { label: "Average skill level", value: "—", tone: "skills", info: null },
  { label: "Fairy souls", value: "—", tone: "fairy", info: null },
  { label: "Networth", value: "—", tone: "networth", info: null },
];

const profilePreviewModel = (playerName: string): ProfileViewModel => {
  const name = playerName.trim() || "Player";
  return {
    player: {
      name,
      uuid: name,
      profileName: "Profile",
      gameMode: "Normal",
      fetchedAt: 0,
    },
    skyblockLevel: previewSkill("skyblock-level", "SkyBlock Level", "Experience Bottle"),
    skills: PROFILE_PREVIEW_SKILLS,
    slayers: PROFILE_PREVIEW_SLAYERS,
    timecharms: { available: false, securedCount: 0, entries: [] },
    metrics: PROFILE_PREVIEW_METRICS,
    loadout: {
      id: null,
      name: null,
      resolved: false,
      inventoryAvailable: true,
      armour: ARMOUR_PRESENTATION.slots.map(() => null),
      equipment: EQUIPMENT_PRESENTATION.slots.map(() => null),
      armourSetName: null,
      armourBonuses: [],
      equipmentBonuses: [],
      contexts: INACTIVE_LOADOUT_CONTEXTS,
      tuning: [],
      pet: null,
      choices: [],
      armourWardrobe: { available: true, savedCount: 0, slots: [] },
      equipmentWardrobe: { available: true, savedCount: 0, slots: [] },
    },
  };
};

const ProfilePreviewSection: React.FC<{ activeTab: ProfilePrimaryTab }> = ({ activeTab }) => {
  const label = PROFILE_PRIMARY_TABS.find((tab) => tab.id === activeTab)?.label ?? "Profile";
  return (
    <section className="profile-preview-section profile-glass" aria-label={`${label} preview`}>
      <header className="profile-panel-head">
        <div className="profile-loadout-title-copy">
          <span className="profile-eyebrow">Profile viewer</span>
          <h2>{label}</h2>
        </div>
      </header>
      <div className="profile-preview-section-grid" aria-hidden>
        {Array.from({ length: 6 }, (_, index) => (
          <span className="profile-preview-section-cell" key={index}>
            <i />
            <b />
            <em />
          </span>
        ))}
      </div>
    </section>
  );
};

const ProfileShell: React.FC<{
  model: ProfileViewModel;
  sourceStatus?: string | null;
  activeTab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
  profiles: readonly SkyBlockProfileOption[];
  selectedProfileId: string | null;
  onProfileChange?: (profileId: string) => void;
  live: LiveProfileViewModel;
  identityAction?: React.ReactNode;
  identityTitle?: string;
  identityDetail?: string;
  previewPlayer?: string;
  previewApiLabel?: string;
}> = ({
  model,
  sourceStatus,
  activeTab,
  onTabChange,
  profiles,
  selectedProfileId,
  onProfileChange,
  live,
  identityAction,
  identityTitle,
  identityDetail,
  previewPlayer,
  previewApiLabel,
}) => {
  const reducedMotion = useReducedMotion();
  const compactIdentity = useCompactIdentity();
  const tabRefs = useRef<Partial<Record<ProfilePrimaryTab, HTMLButtonElement | null>>>({});
  const activePrimaryTab = profilePrimaryTab(activeTab);
  const availableProfiles = profiles.length > 0
    ? profiles
    : [{ id: selectedProfileId ?? model.player.profileName, name: model.player.profileName, gameMode: null }];
  const selectedValue = selectedProfileId ?? availableProfiles.find((profile) => profile.name === model.player.profileName)?.id ?? availableProfiles[0].id;
  const accessoryPower = model.loadout.contexts.find((context) => context.label === "Power Stone")?.value ?? null;
  const accessorySetup = {
    power: accessoryPower,
    tuning: model.loadout.tuning.map((stat) => ({
      key: stat.key,
      label: stat.label,
      value: stat.value,
    })),
  };
  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tab: ProfilePrimaryTab) => {
    const nextTab = profileTabForKey(PROFILE_TAB_IDS, tab, event.key);
    if (!nextTab) return;
    event.preventDefault();
    onTabChange(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  return (
  <div className={`profile-shell${previewPlayer !== undefined ? " profile-shell--preview" : ""}`}>
    <CharacterStage
      player={model.player}
      sourceStatus={sourceStatus}
      profiles={availableProfiles}
      selectedProfileId={selectedValue}
      onProfileChange={onProfileChange}
      publicViewer={live.scope === "public"}
      previewPlayer={previewPlayer}
      previewApiLabel={previewApiLabel}
      showProfilePicker={previewPlayer === undefined}
    />

    <main className="profile-workspace">
      <div className="profile-mobile-mode-actions">
        <ProfileModeSwitch scope={live.scope} />
        {identityAction}
        {identityDetail && <p className="profile-mobile-state" role={live.status.showError ? "alert" : "status"}>{identityDetail}</p>}
      </div>
      <ProfileIdentity
        playerName={model.player.name}
        playerUuid={model.player.uuid}
        eyebrow={previewPlayer !== undefined ? (live.scope === "public" ? "Profile viewer" : "Connected profile") : undefined}
        title={identityTitle ?? model.player.name}
        action={compactIdentity ? undefined : identityAction}
        detail={identityDetail}
        detailRole={live.status.showError ? "alert" : "status"}
        profiles={availableProfiles}
        selectedProfileId={selectedValue}
        gameMode={model.player.gameMode}
        onProfileChange={onProfileChange}
        publicViewer={live.scope === "public"}
        showProfilePicker={previewPlayer === undefined}
        fetchedAt={previewPlayer !== undefined ? null : model.player.fetchedAt}
        fallbackLabel={previewApiLabel}
        sourceStatus={sourceStatus}
        trailing={!compactIdentity && (
          <div className="profile-identity-utility">
            <ProfileModeSwitch scope={live.scope} />
          </div>
        )}
      />

      <motion.section className="profile-skills profile-glass" aria-label="Profile skills" {...panelReveal(reducedMotion, 0.025)}>
        <div className="profile-progression">
          <div className="profile-progression-level">
            {model.skyblockLevel ? <ProfileSkill row={model.skyblockLevel} /> : <span className="profile-inline-empty">SkyBlock Level was not shared.</span>}
          </div>
          <TimecharmPanel timecharms={model.timecharms} preview={previewPlayer !== undefined} />
        </div>

        <ProfileProgressSection label="Skills" rows={model.skills} empty="No skill experience was returned." />
        <ProfileProgressSection label="Slayers" rows={model.slayers} empty="No Slayer progress was returned." />

        <div className="profile-metrics" aria-label="Profile summary">
          {model.metrics.map((metric) => <Metric key={metric.label} {...metric} />)}
        </div>
      </motion.section>

      <nav className="profile-tabs" aria-label="Profile sections" role="tablist">
        {PROFILE_PRIMARY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={profileTabId(tab.id)}
            aria-controls={profileTabPanelId(tab.id)}
            aria-selected={activePrimaryTab === tab.id}
            tabIndex={activePrimaryTab === tab.id ? 0 : -1}
            ref={(node) => { tabRefs.current[tab.id] = node; }}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(event) => onTabKeyDown(event, tab.id)}
            className={activePrimaryTab === tab.id ? "is-active" : ""}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section
        className="profile-tabpanel"
        role="tabpanel"
        id={profileTabPanelId(activePrimaryTab)}
        aria-labelledby={profileTabId(activePrimaryTab)}
        tabIndex={0}
      >
        {previewPlayer !== undefined ? (
          <ProfilePreviewSection activeTab={activePrimaryTab} />
        ) : activePrimaryTab === "skills" ? (
          <SkillsHub
            activeTab={activeTab === "garden" || activeTab === "dungeons" ? activeTab : "skills"}
            model={model}
            live={live}
            onTabChange={onTabChange}
          />
        ) : activeTab === "gear" ? (
          <GearPreview loadout={model.loadout} />
        ) : activeTab === "accessories" ? (
          <AccessoriesPreview
            profileId={selectedProfileId}
            setup={accessorySetup}
            abiphoneContacts={live.profile.crimson?.abiphoneContacts ?? null}
            consumedPrism={live.profile.rift?.consumedPrism ?? false}
            ownedItems={live.scope === "public"
              ? live.profile.coverage?.inventoryShared
                ? live.profile.parsed?.accessories ?? []
                : null
              : live.profile.coverage?.inventoryShared
                ? live.profile.parsed?.accessories
                : undefined}
            publicProfile={live.scope === "public"}
          />
        ) : (
          <LiveProfileSection activeTab={activeTab} live={live} />
        )}
      </section>
    </main>
  </div>
  );
};

export const ProfileSurface: React.FC<{
  live: LiveProfileViewModel;
  emptyTitle?: string;
  emptyDetail?: string;
  action?: React.ReactNode;
  previewPlayer?: string;
  forcePreview?: boolean;
}> = ({
  live,
  emptyTitle,
  emptyDetail,
  action,
  previewPlayer,
  forcePreview = false,
}) => {
  const { activeTab, selectTab } = useProfileTabs();
  const previewModel = useMemo(
    () => profilePreviewModel(live.scope === "public" ? previewPlayer ?? "" : ""),
    [live.scope, previewPlayer],
  );
  const showPreview = live.model === null || (live.scope === "public" && forcePreview);
  const displayedModel = showPreview ? previewModel : live.model ?? previewModel;
  const fallbackTitle = emptyTitle ?? (
    live.status.showNoKey
      ? "Profile is not connected"
      : live.status.showError
        ? "Profile could not load"
        : "Loading profile"
  );
  const fallbackDetail = emptyDetail ?? (
    live.status.showNoKey
      ? "Connect your Minecraft account in Settings."
      : live.error ?? live.status.label ?? "Reading the selected SkyBlock profile."
  );
  const previewApiLabel = live.status.status === "loading"
    ? "Loading"
    : live.status.showNoKey
      ? "Not connected"
    : live.status.showError
      ? "Unavailable"
      : "Not loaded";

  useEffect(() => {
    document.documentElement.classList.toggle("sd-channel", Boolean(displayedModel));
    return () => document.documentElement.classList.remove("sd-channel");
  }, [displayedModel]);

  return (
    <div className="profile-view-root profile-view-root--frosted">
      <ProfileShell
        model={displayedModel}
        sourceStatus={showPreview ? null : live.status.label}
        activeTab={activeTab}
        onTabChange={selectTab}
        profiles={live.profiles}
        selectedProfileId={live.selectedProfileId}
        onProfileChange={live.selectProfile}
        live={live}
        identityAction={action}
        identityTitle={showPreview && live.scope === "personal" ? fallbackTitle : undefined}
        identityDetail={showPreview && (live.scope === "personal" || live.status.showError) ? fallbackDetail : undefined}
        previewPlayer={showPreview ? (live.scope === "public" ? previewPlayer ?? "" : "") : undefined}
        previewApiLabel={previewApiLabel}
      />
    </div>
  );
};

export const ProfilePage: React.FC = () => {
  const live = useLiveProfileViewModel();
  return <ProfileSurface live={live} />;
};

export default ProfilePage;
