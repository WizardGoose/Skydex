import { UtilityTargetSearch } from "../ui/UtilityTargetSearch";
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ProfileProgressRow } from "../profile-view/ProfileProgressRow";
import {
  AlertTriangle,
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  Eye,
  EyeOff,
  ChevronDown,
  RefreshCw,
  Search,
} from "lucide-react";
import { ShardSettingsPanel } from "./ShardSettingsPanel";
import "./site-settings.css";
import { MAX_QUANTITIES, SHARD_DESCRIPTIONS, fusedCountToTierLevel } from "../constants";
import { useCalculatorState, useCustomRates, usePageTitle, useShardsWithRecipes } from "../hooks";
import {
  getInventoryManagement,
  setManagedAttributes,
  setManagedDisabledShards,
  setManagedInventory,
  useInventoryManagement,
} from "../inventory/managementStore";
import { mergeShardInventory } from "../inventory/shardsStore";
import { useApiAccess } from "../island/apiKey";
import { requestSkillDefs, skillProgress, useSkillDefs } from "../island/skills";
import { useParsedProfile } from "../networth/useNetworth";
import { CharacterStage } from "../profile-view/CharacterStage";
import { ProfileIdentity } from "../profile-view/ProfileIdentity";
import { ShardAcquisitionGuide } from "../shards/ShardAcquisitionGuide";
import { UtilityMetric } from "../profile-view/UtilityMetric";
import { ProfileProgressionFilters, type ProfileProgressionFilterGroup } from "../profile-view/profile-sections/ProfileProgressionFilters";
import { applyApiGameMode, useProfile } from "../profile/useProfile";
import type { CalculationFormData } from "../schemas";
import { rarityKey } from "../search/rarity";
import { CalculationService, DataService, InvCalculationService } from "../services";
import { acquisitionFor, acquisitionMethods, acquisitionSummary, hasDirectAcquisition } from "../shards/acquisition";
import type { FusionFocus } from "../shards/fusionDependencies";
import { ShardMethodIcons } from "../shards/ShardSourceCount";
import {
  importPlayerProfile,
  type HypixelProfileResponse,
  type ProfileData,
} from "../shards/profileImport";
import { deriveHunterFortune } from "../shards/profileAssumptions";
import { publishShardProfileSnapshot } from "../shards/profileAssumptionsStore";
import {
  buildShardProgress,
  inventoryUsed,
  remainingForGoal,
  fusedTargetForAdditional,
  summarizeShardProgress,
  type ShardProgressEntry,
  type ShardProgressStatus,
} from "../shards/progressionModel";
import { ShardGoalList } from "../shards/ShardGoalList";
import { ShardRouteToggles } from "../shards/ShardRouteToggles";
import { ShardRouteTree } from "../shards/ShardRouteTree";
import { ShardGameText } from "../shards/ShardGameTextView";
import { ShardTooltip } from "../shards/ShardTooltip";
import { ShardGatherPreferences } from "../shards/ShardGatherPreferences";
import { HuntingEstimateContext, useHuntingEstimate } from "../shards/huntingEstimateContext";
import type { AcquisitionEstimate } from "../shards/huntingModel";
import { applyHuntingAttributes } from "../shards/huntingEquipment";
import { inventoryForGoal, restoreGoalInventory, storageInputsForRoute } from "../shards/goalInventory";
import {
  shardAcquisitionGameText,
  shardDescriptionGameText,
} from "../shards/shardGameTextModel";
import type {
  CalculationParams,
  Data,
  InventoryCalculationResult,
  Recipe,
  RecipeOverride,
  ShardWithDirectInfo,
} from "../types/types";
import { FOCUS, INPUT, rarityFlatTileClass } from "../ui/kit";
import { formatLargeNumber, formatTime, getRarityColor, skyBlockStatPresentation } from "../utilities";
import "../profile-view/profile.css";
import "./shards-page.css";
import "./shards-workspace.css";
import "../profile-view/utility-workspace.css";

const FusionDevViews = React.lazy(() => import("../shards/dev/FusionDevViews"));

type CollectionFilter = ShardProgressStatus;
type ImportPhase = "idle" | "loading" | "ready" | "unavailable" | "error";
type AcquisitionFilter = "all" | "direct" | "fusion";

interface ImportView {
  phase: ImportPhase;
  response: HypixelProfileResponse | null;
  selected: ProfileData | null;
  fetchedAt: number | null;
  error: string | null;
}

type GoalMode = "amount" | "max";

interface GoalSelection {
  shardKey: string;
  amount: number;
  mode: GoalMode;
  gatherInstead?: string[];
  excludedFusionInputs?: string[];
  pendingAmount?: number;
}

interface GoalWorkspaceState {
  goals: GoalSelection[];
  activeGoalKey: string | null;
}

interface GoalRoute {
  goal: GoalSelection;
  entry: ShardProgressEntry;
  remaining: number | null;
  result: InventoryCalculationResult | null;
  error: string | null;
  storage?: ReadonlyMap<string, number>;
}

interface RouteRequirement {
  shardKey: string;
  shard: ShardWithDirectInfo | null;
  owned: number;
  missing: number;
  total: number;
}

type ShardLevelField = keyof Pick<
  CalculationFormData,
  | "newtLevel"
  | "salamanderLevel"
  | "lizardKingLevel"
  | "leviathanLevel"
  | "pythonLevel"
  | "kingCobraLevel"
  | "seaSerpentLevel"
  | "tiamatLevel"
  | "crocodileLevel"
>;

const GOAL_STORAGE_KEY = "skydex_shard_goals_v2";
const LEGACY_GOAL_STORAGE_KEY = "skydex_shard_goal_v1";
const EMPTY_COUNTS = new Map<string, number>();
const DESCRIPTION_TABLE = SHARD_DESCRIPTIONS as Record<string, { title?: string; description?: string }>;
const SHARD_LEVEL_FIELDS: readonly { shardKey: string; field: ShardLevelField }[] = [
  { shardKey: "C35", field: "newtLevel" },
  { shardKey: "U8", field: "salamanderLevel" },
  { shardKey: "R8", field: "lizardKingLevel" },
  { shardKey: "E5", field: "leviathanLevel" },
  { shardKey: "R9", field: "pythonLevel" },
  { shardKey: "R54", field: "kingCobraLevel" },
  { shardKey: "E32", field: "seaSerpentLevel" },
  { shardKey: "L6", field: "tiamatLevel" },
  { shardKey: "R45", field: "crocodileLevel" },
] as const;

const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;

const parseSavedGoal = (value: unknown): GoalSelection | null => {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<GoalSelection>;
  if (typeof parsed.shardKey !== "string" || !parsed.shardKey) return null;
  if (typeof parsed.amount !== "number" || !Number.isFinite(parsed.amount) || parsed.amount < 1) return null;
  return {
    shardKey: parsed.shardKey,
    amount: Math.floor(parsed.amount),
    mode: parsed.mode === "max" ? "max" : "amount",
    pendingAmount: typeof parsed.pendingAmount === "number" && Number.isFinite(parsed.pendingAmount) && parsed.pendingAmount > 0 ? Math.floor(parsed.pendingAmount) : undefined,
    gatherInstead: Array.isArray(parsed.gatherInstead) ? [...new Set(parsed.gatherInstead.filter((key): key is string => typeof key === "string" && key.length > 0))] : [],
    excludedFusionInputs: Array.isArray(parsed.excludedFusionInputs) ? [...new Set(parsed.excludedFusionInputs.filter((key): key is string => typeof key === "string" && key.length > 0))] : [],
  };
};

const newGoalSelection = (shardKey: string, entry: ShardProgressEntry | undefined): GoalSelection => {
  const target = entry ? fusedTargetForAdditional(1, entry.fused, entry.cap) : null;
  return { shardKey, amount: target ?? 1, mode: "amount", pendingAmount: target === null ? 1 : undefined };
};

const readSavedGoalState = (): GoalWorkspaceState => {
  if (typeof window === "undefined") return { goals: [], activeGoalKey: null };
  try {
    const stored = JSON.parse(window.localStorage.getItem(GOAL_STORAGE_KEY) ?? "null") as unknown;
    const goals = Array.isArray(stored)
      ? stored.map(parseSavedGoal).filter((goal): goal is GoalSelection => goal !== null)
      : [];
    if (goals.length > 0) return { goals, activeGoalKey: goals[0].shardKey };

    const legacy = parseSavedGoal(JSON.parse(window.localStorage.getItem(LEGACY_GOAL_STORAGE_KEY) ?? "null"));
    return legacy ? { goals: [legacy], activeGoalKey: legacy.shardKey } : { goals: [], activeGoalKey: null };
  } catch {
    return { goals: [], activeGoalKey: null };
  }
};

const attributeTitle = (entry: Pick<ShardProgressEntry, "shard">): string =>
  DESCRIPTION_TABLE[entry.shard.key]?.title?.trim() || entry.shard.name;

const totalResultEstimate = (total: number, ironman: boolean): string => {
  if (!Number.isFinite(total)) return "Unavailable";
  return ironman ? formatTime(total) : `${formatLargeNumber(total)} coins`;
};

const statusLabel = (status: ShardProgressStatus): string => {
  if (status === "incomplete") return "Incomplete";
  if (status === "maxed") return "Maxed";
  return "Unknown";
};

const normalizedSearch = (value: string) => value.trim().toLowerCase();

const directAcquisitionLabel = (ironman: boolean): string => ironman ? "Hunt" : "Hunt or buy";

const shardRarityStyle = (rarity: string): React.CSSProperties | undefined => {
  const key = rarityKey(rarity);
  return key ? ({ "--shard-rarity": `var(--color-rarity-${key})` } as React.CSSProperties) : undefined;
};

const SHARD_EFFECT_TERMS = [
  "Double Hook Chance",
  "Sea Creature Chance",
  "Bonus Attack Speed",
  "Pressure Resistance",
  "Cold Resistance",
  "Heat Resistance",
  "True Defense",
  "Health Regen",
  "Critical Damage",
  "Crit Damage",
  "Hunter Fortune",
  "Foraging Fortune",
  "Farming Fortune",
  "Mining Fortune",
  "Mangrove Fortune",
  "Fig Fortune",
  "Block Fortune",
  "Fishing Speed",
  "Magic Find",
  "Enchanting Wisdom",
  "Foraging Wisdom",
  "Fishing Wisdom",
  "Hunting Wisdom",
  "Mining Wisdom",
  "Farming Wisdom",
  "Taming Wisdom",
  "Combat Wisdom",
  "Trophy Chance",
  "Trophy Fish Chance",
  "Pet Luck",
  "Intelligence",
  "Strength",
  "Defense",
  "Damage",
  "Health",
  "Vitality",
  "Tracking",
  "Overbloom",
  "Pristine",
  "Sweep",
  "Speed",
] as const;
const SHARD_EFFECT_GLYPHS: Readonly<Record<string, string>> = {
  "❤": "text-stat-red",
  "✎": "text-stat-aqua",
  "❁": "text-stat-red",
  "∮": "text-stat-dark-green",
  "☘": "text-stat-gold",
  "☂": "text-stat-aqua",
  "α": "text-stat-dark-aqua",
  "❈": "text-stat-green",
  "♨": "text-stat-dark-red",
  "⸕": "text-stat-gold",
  "✦": "text-stat-white",
  "✯": "text-stat-aqua",
  "☀": "text-stat-yellow",
  "♔": "text-stat-gold",
  "❍": "text-stat-blue",
  "⚶": "text-stat-dark-aqua",
  "✿": "text-stat-dark-green",
  "☯": "text-stat-dark-aqua",
  "⚔": "text-stat-yellow",
  "❂": "text-stat-white",
  "✧": "text-stat-dark-purple",
  "❃": "text-stat-light-purple",
  "❣": "text-stat-red",
  "☠": "text-stat-blue",
  "♣": "text-stat-light-purple",
  "⚓": "text-stat-blue",
};
const escapePattern = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SHARD_EFFECT_PATTERN = new RegExp(
  `([+-]?\\d+(?:\\.\\d+)?(?:%|s|M)?|${[...SHARD_EFFECT_TERMS, ...Object.keys(SHARD_EFFECT_GLYPHS), "COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"]
    .sort((left, right) => right.length - left.length)
    .map(escapePattern)
    .join("|")})`,
  "gi",
);

const shardEffectTokenClass = (token: string): string | null => {
  const trimmed = token.trim();
  if (/^[+-]?\d/.test(trimmed)) return trimmed.startsWith("-") ? "text-stat-red" : "text-stat-green";
  const glyphClass = SHARD_EFFECT_GLYPHS[trimmed];
  if (glyphClass) return glyphClass;
  const stat = skyBlockStatPresentation(trimmed);
  if (stat) return stat.colorClass;
  const rarity = rarityKey(trimmed);
  return rarity ? getRarityColor(rarity) : null;
};

const ShardEffectText: React.FC<{ shardKey: string; description: string }> = ({ shardKey, description }) => {
  const gameText = shardDescriptionGameText(shardKey, description);
  return (
    <span className="shards-row-effect" title={description}>
      {gameText ? <ShardGameText text={gameText} /> : description.split(SHARD_EFFECT_PATTERN).map((part, index) => {
        const className = shardEffectTokenClass(part);
        return className ? <span className={className} key={`${part}-${index}`}>{part}</span> : part;
      })}
    </span>
  );
};

const ShardAcquisitionText: React.FC<{ shardKey: string; text: string }> = ({ shardKey, text }) => {
  const gameText = shardAcquisitionGameText(shardKey, text);
  return gameText ? <ShardGameText text={gameText} /> : <>{text}</>;
};

const rateLabel = (rate: number | undefined, ironman: boolean): string => {
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0) return "Unavailable";
  return ironman ? `${Number(rate.toPrecision(3)).toLocaleString()} / hour` : `${formatLargeNumber(rate)} coins`;
};

const AcquisitionCard: React.FC<{
  shard: ShardWithDirectInfo;
  progress?: ShardProgressEntry;
  quantity?: number;
  effectiveRate?: number;
  baseRate?: number;
  ironman: boolean;
  requirement?: { total: number; owned: number };
}> = ({ shard, progress, quantity, effectiveRate, baseRate, ironman, requirement }) => {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const estimate = useHuntingEstimate(shard.key);
  const methods = ironman ? estimate?.method && estimate.method !== "Unavailable" ? [estimate.method] : acquisitionMethods(shard.key) : ["Bazaar"];
  return <article className={`shards-requirement-card ${rarityFlatTileClass(shard.rarity)}`}>
    <header>
      <ShardTooltip shard={shard} progress={progress}>
        <span className="shards-requirement-art"><img src={`${import.meta.env.BASE_URL}shardIcons/${shard.key}.png`} alt="" width={36} height={36} /></span>
      </ShardTooltip>
      <button type="button" className={`shards-requirement-open ${FOCUS}`} onClick={event => {
        setExpanded(value => !value);
        if (expanded) return;
        const card = event.currentTarget.closest<HTMLElement>(".shards-requirement-card");
        requestAnimationFrame(() => {
          const panel = card?.closest<HTMLElement>(".shards-plan-panel");
          if (!card || !panel) return;
          const bounds = card.getBoundingClientRect();
          const viewport = panel.getBoundingClientRect();
          if (bounds.bottom > viewport.bottom) panel.scrollBy({ top: Math.max(0, Math.min(bounds.bottom - viewport.bottom + 8, bounds.top - viewport.top)), behavior: "smooth" });
        });
      }}
        aria-expanded={expanded} aria-controls={detailsId} aria-label={`${expanded ? "Hide" : "Show"} ${shard.name} acquisition details`}>
        <span className="shards-requirement-title"><strong className={getRarityColor(shard.rarity)}>{shard.name}</strong><ShardMethodIcons methods={methods} /><ChevronDown size={14} aria-hidden /></span>
        {requirement ? <span className="shards-requirement-counts">
          <span className="shards-count--progress"><span className="shards-count-label">Need</span><b>{Math.ceil(requirement.total).toLocaleString()}</b></span>
          {requirement.owned > 0 && <span className="shards-count--storage"><span className="shards-count-label">Storage</span><b>{Math.ceil(requirement.owned).toLocaleString()}</b></span>}
          <span className={quantity ? "shards-count--materials" : "shards-count--growth"}><span className="shards-count-label">{quantity ? ironman ? "Gather" : "Buy" : "Status"}</span><b>{quantity ? Math.ceil(quantity).toLocaleString() : "Covered"}</b></span>
        </span> : <small>{quantity === undefined ? attributeTitle({ shard }) : `${Math.ceil(quantity).toLocaleString()} still needed`}</small>}
      </button>
    </header>
    {(!requirement || !!quantity) && <dl className="shards-requirement-rate">
      <UtilityMetric activation="click" label={ironman ? "Est. rate" : "Unit price"} tone="materials"
        value={`${ironman && effectiveRate ? "~" : ""}${rateLabel(effectiveRate, ironman)}`} info={{
          summary: ironman ? `Base rate: ${shard.key === "L15" && !baseRate ? "Kuudra model" : rateLabel(baseRate, true)}` : "Bazaar unit price used for this plan.",
          notes: ironman ? estimate?.assumptions : undefined,
          rows: estimate ? [{ label: estimate.method, value: rateLabel(effectiveRate, true) }, ...estimate.alternatives.map(option => ({ label: option.method, value: rateLabel(option.rate ?? undefined, true) }))] : undefined,
        }} />
      {requirement && !ironman && quantity !== undefined && quantity > 0 && effectiveRate !== undefined && effectiveRate > 0 && <UtilityMetric label="Total" tone="materials" value={rateLabel(Math.ceil(quantity) * effectiveRate, false)} />}
    </dl>}
    <div id={detailsId} hidden={!expanded} className="shards-requirement-guide">
      <ShardAcquisitionGuide shardKey={shard.key} />
    </div>
  </article>;
};

export const SettingsPage: React.FC = () => {
  usePageTitle();
  const [searchParams] = useSearchParams();
  const { shards, loading: shardsLoading, error: shardsError } = useShardsWithRecipes();
  const { customRates, defaultRates, loading: ratesLoading } = useCustomRates();
  const { form, setForm } = useCalculatorState();
  const formRef = useRef(form);
  formRef.current = form;
  const { inventory, ownedAttributes, disabledShards } = useInventoryManagement();
  const { access, setProfileId } = useApiAccess();
  const parsedProfile = useParsedProfile();
  const { ironman } = useProfile();
  const skillDefs = useSkillDefs();

  const [importView, setImportView] = useState<ImportView>({ phase: "idle", response: null, selected: null, fetchedAt: null, error: null });
  const [goalState, setGoalState] = useState<GoalWorkspaceState>(readSavedGoalState);
  const [goalSearchOpen, setGoalSearchOpen] = useState(true);
  const [goalQuery, setGoalQuery] = useState("");
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>("unknown");
  const [sortDescending, setSortDescending] = useState(false);
  const [query, setQuery] = useState("");
  const [rateQuery, setRateQuery] = useState("");
  const [rarityFilter, setRarityFilter] = useState("all");
  const [familyFilter, setFamilyFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [acquisitionFilter, setAcquisitionFilter] = useState<AcquisitionFilter>("all");
  const [editingShardKey, setEditingShardKey] = useState<string | null>(null);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [goalRoutes, setGoalRoutes] = useState<GoalRoute[]>([]);
  const [routeInventory, setRouteInventory] = useState<Map<string, number> | null>(null);
  const [effectiveRates, setEffectiveRates] = useState<Record<string, number>>({});
  const [hiddenTargets, setHiddenTargets] = useState<ReadonlySet<string>>(new Set());
  const [fusionFocus, setFusionFocus] = useState<FusionFocus>();
  const inspectFusion = (target: string, path: string[]) => {
    setGoalState(current => ({ ...current, activeGoalKey: target }));
    setHiddenTargets(current => { const next = new Set(current); next.delete(target); return next; });
    setFusionFocus(current => ({ target, path, revision: (current?.revision ?? 0) + 1 }));
  };
  const [acquisitionEstimates, setAcquisitionEstimates] = useState<Record<string, AcquisitionEstimate>>({});
  const [calculating, setCalculating] = useState(false);
  const [devRecipeOverrides, setDevRecipeOverrides] = useState<Record<string, RecipeOverride[]>>({});
  const [devFusionError, setDevFusionError] = useState<string | null>(null);
  const [fusionContext, setFusionContext] = useState<{ data: Data; params: CalculationParams } | null>(null);
  const calculationRequest = useRef(0);
  const importedIdentity = useRef("");
  const plannerRef = useRef<HTMLElement>(null);
  const collectionRef = useRef<HTMLElement>(null);
  const queryApplied = useRef(false);
  const goals = goalState.goals;
  const goal = goals.find((candidate) => candidate.shardKey === goalState.activeGoalKey) ?? goals[0] ?? null;

  const shardsByKey = useMemo(() => new Map(shards.map((shard) => [shard.key, shard])), [shards]);

  useEffect(() => requestSkillDefs(), []);

  useEffect(() => {
    if (form.ironManView === ironman) return;
    setForm({ ...form, ironManView: ironman });
  }, [form, ironman, setForm]);

  useEffect(() => {
    if (shardsLoading || shards.length === 0) return;
    const identity = access.name.trim() || access.uuid.trim();
    if (!identity) {
      setImportView({ phase: "unavailable", response: null, selected: null, fetchedAt: null, error: null });
      return;
    }

    const controller = new AbortController();
    const identityKey = `${access.uuid.toLowerCase() || identity.toLowerCase()}:${access.profileId ?? "selected"}`;
    const sameIdentity = importedIdentity.current === identityKey;
    importedIdentity.current = identityKey;
    setImportView((previous) => sameIdentity
      ? { ...previous, phase: "loading", error: null }
      : { phase: "loading", response: null, selected: null, fetchedAt: null, error: null });
    const accept = (response: HypixelProfileResponse, cached: boolean, loading = false) => {
      if (controller.signal.aborted) return;
      const selected = response.profiles.find((profile) => profile.profile.profile_id === access.profileId)
        ?? response.profiles.find((profile) => profile.profile.profile_id === response.selected_profile_id)
        ?? response.profiles.find((profile) => profile.profile.selected)
        ?? response.profiles[0]
        ?? null;
      if (!selected) {
        setImportView({ phase: "error", response, selected: null, fetchedAt: null, error: "No SkyBlock profiles were found for this player." });
        return;
      }

      // A cache restores coverage and gear without overwriting newer manual
      // counts. Only a successful refresh replaces the managed count stores.
      if (!cached && selected.shardsRead) {
        const counts = new Map(selected.shards.map((shard) => [shard.id, shard.amount]));
        setManagedInventory(mergeShardInventory(
          getInventoryManagement().inventory,
          shards.map((shard) => shard.key),
          shards.map((shard) => [shard.key, counts.get(shard.key) ?? 0] as const),
        ));
      }
      if (!cached && selected.attributesRead) {
        const counts = new Map(selected.attributes.map((attribute) => [attribute.id, attribute.level]));
        const nextAttributes = new Map(shards.map((shard) => [shard.key, counts.get(shard.key) ?? 0]));
        setManagedAttributes(nextAttributes);
        const levelPatch: Partial<Record<ShardLevelField, number>> = {};
        for (const { shardKey, field } of SHARD_LEVEL_FIELDS) {
          const shard = shardsByKey.get(shardKey);
          levelPatch[field] = fusedCountToTierLevel(nextAttributes.get(shardKey) ?? 0, shard?.rarity ?? "common");
        }
        setForm({ ...formRef.current, ...levelPatch });
      }
      if (!cached) applyApiGameMode(selected.profile.game_mode);
      setImportView({ phase: cached || loading ? "loading" : "ready", response, selected, fetchedAt: response.fetchedAt ?? Date.now(), error: null });
    };
    void (async () => {
      const cached = await importPlayerProfile(identity, shards, controller.signal, true);
      if (controller.signal.aborted) return;
      if (cached.ok) accept(cached.value, true);
      const imported = await importPlayerProfile(identity, shards, controller.signal, false, (response) => {
        // Keep already decoded gear while a refresh finishes. Initial loads
        // can still show counts before any optional equipment metadata lands.
        if (!cached.ok) accept(response, Boolean(response.cacheState?.includes("stale")), true);
      });
      if (controller.signal.aborted) return;
      if (!imported.ok) {
        setImportView((previous) => ({ ...previous, phase: "error", error: imported.error.message }));
        return;
      }
      if (imported.value.cacheState?.includes("stale")) {
        accept(imported.value, true);
        setImportView((previous) => ({ ...previous, phase: "error", error: "Profile refresh failed. Showing the last saved profile." }));
      } else accept(imported.value, false);
    })().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setImportView((previous) => ({ ...previous, phase: "error", error: error instanceof Error ? error.message : "Shard profile data could not be loaded." }));
    });
    return () => controller.abort();
  }, [access.name, access.profileId, access.uuid, refreshRevision, setForm, shards, shardsByKey, shardsLoading]);

  const profileLoading = importView.phase === "loading" && !importView.selected;
  const profileRefreshing = importView.phase === "loading";
  const displayedInventory = profileLoading ? EMPTY_COUNTS : inventory;
  const displayedAttributes = profileLoading ? EMPTY_COUNTS : ownedAttributes;
  const knowledge = useMemo(() => ({
    loose: Boolean(importView.selected?.shardsRead),
    attributes: Boolean(importView.selected?.attributesRead),
  }), [importView.selected]);
  const progress = useMemo(() => buildShardProgress(shards, displayedInventory, displayedAttributes, knowledge), [displayedAttributes, displayedInventory, knowledge, shards]);
  const progressByKey = useMemo(() => new Map(progress.map((entry) => [entry.shard.key, entry])), [progress]);
  const progressSummary = useMemo(() => summarizeShardProgress(progress), [progress]);

  const hunterKarmaLevel = useMemo(() => {
    const shard = shardsByKey.get("L29");
    return fusedCountToTierLevel(ownedAttributes.get("L29") ?? 0, shard?.rarity ?? "legendary");
  }, [ownedAttributes, shardsByKey]);
  const detectedHunterFortune = useMemo(() => {
    const signals = importView.selected?.signals;
    if (!signals) return { value: null, parts: [], unavailableReason: "No profile is connected." };
    return deriveHunterFortune(signals, skillDefs.defs?.HUNTING ?? null, hunterKarmaLevel, form.seaSerpentLevel, form.tiamatLevel);
  }, [form.seaSerpentLevel, form.tiamatLevel, hunterKarmaLevel, importView.selected, skillDefs.defs]);
  const hunterFortuneFromProfile = (form.hunterFortuneSource ?? "profile") === "profile";
  const kuudraFromProfile = (form.kuudraTierSource ?? "profile") === "profile";
  const effectiveHunterFortune = hunterFortuneFromProfile && detectedHunterFortune.value !== null ? detectedHunterFortune.value : form.hunterFortune;
  const detectedKuudraTier = importView.selected?.signals.kuudraTier ?? null;
  const effectiveKuudraTier = kuudraFromProfile && detectedKuudraTier !== null ? detectedKuudraTier : form.kuudraTier;
  const huntingEquipment = useMemo(() => {
    const equipment = importView.selected?.signals.huntingEquipment;
    if (!equipment) return undefined;
    const combatDef = skillDefs.defs?.COMBAT;
    const echo = 1 + 0.02 * form.seaSerpentLevel * (1 + 0.05 * form.tiamatLevel);
    return {
      ...applyHuntingAttributes(equipment, (key) => fusedCountToTierLevel(ownedAttributes.get(key) ?? 0, shardsByKey.get(key)?.rarity ?? "common"), echo),
      combatLevel: combatDef && equipment.skillXp.SKILL_COMBAT !== undefined ? skillProgress(equipment.skillXp.SKILL_COMBAT, combatDef).level : undefined,
    };
  }, [form.seaSerpentLevel, form.tiamatLevel, importView.selected, ownedAttributes, shardsByKey, skillDefs.defs]);

  useEffect(() => {
    const selected = importView.selected;
    if (!selected || importView.phase !== "ready") return;
    publishShardProfileSnapshot({
      profileId: selected.profile.profile_id,
      profileName: selected.profile.cute_name,
      fetchedAt: importView.fetchedAt ?? Date.now(),
      hunterFortune: detectedHunterFortune,
      kuudraTier: detectedKuudraTier,
    });
  }, [detectedHunterFortune, detectedKuudraTier, importView.fetchedAt, importView.phase, importView.selected]);

  useEffect(() => {
    if (shardsLoading) return;
    setGoalState((current) => {
      const normalized = current.goals.flatMap((candidate) => {
        const shard = shardsByKey.get(candidate.shardKey);
        if (!shard?.canFuse) return [];
        const cap = MAX_QUANTITIES[shard.rarity] ?? MAX_QUANTITIES.common;
        const resolved = candidate.pendingAmount === undefined ? null : fusedTargetForAdditional(candidate.pendingAmount, progressByKey.get(candidate.shardKey)?.fused ?? null, cap);
        const amount = candidate.mode === "max" ? cap : Math.min(Math.max(1, resolved ?? candidate.amount), cap);
        return [{ ...candidate, amount, pendingAmount: resolved !== null || candidate.mode === "max" ? undefined : candidate.pendingAmount }];
      });
      const activeGoalKey = normalized.some((candidate) => candidate.shardKey === current.activeGoalKey)
        ? current.activeGoalKey
        : normalized[0]?.shardKey ?? null;
      const unchanged = activeGoalKey === current.activeGoalKey
        && normalized.length === current.goals.length
        && normalized.every((candidate, index) => {
          const previous = current.goals[index];
          return previous?.shardKey === candidate.shardKey && previous.amount === candidate.amount && previous.mode === candidate.mode && previous.pendingAmount === candidate.pendingAmount;
        });
      return unchanged ? current : { goals: normalized, activeGoalKey };
    });
  }, [progressByKey, shardsByKey, shardsLoading]);

  useEffect(() => {
    if (queryApplied.current || shards.length === 0) return;
    queryApplied.current = true;
    const raw = searchParams.get("q") ?? "";
    const requested = normalizedSearch(raw);
    if (!requested) return;
    const shard = shards.find((candidate) => normalizedSearch(candidate.key) === requested || normalizedSearch(candidate.name) === requested);
    if (shard?.canFuse) {
      setGoalState((current) => current.goals.some((candidate) => candidate.shardKey === shard.key)
        ? { ...current, activeGoalKey: shard.key }
        : { goals: [...current.goals, newGoalSelection(shard.key, progressByKey.get(shard.key))], activeGoalKey: shard.key });
      setGoalQuery("");
    } else setGoalQuery(raw);
  }, [progressByKey, searchParams, shards]);

  useEffect(() => {
    try {
      if (goals.length > 0) window.localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(goals));
      else window.localStorage.removeItem(GOAL_STORAGE_KEY);
    } catch {
      // The active goals still work for this visit when storage is unavailable.
    }
  }, [goals]);

  const selectedEntry = useMemo(() => progress.find((entry) => entry.shard.key === goal?.shardKey) ?? null, [goal?.shardKey, progress]);
  const goalRouteInputs = useMemo<GoalRoute[]>(() => goals.flatMap((candidate) => {
    const entry = progress.find((progressEntry) => progressEntry.shard.key === candidate.shardKey);
    if (!entry) return [];
    const amount = candidate.pendingAmount === undefined ? candidate.amount : fusedTargetForAdditional(candidate.pendingAmount, entry.fused, entry.cap);
    return [{ goal: amount === null ? candidate : { ...candidate, amount }, entry, remaining: amount === null ? null : remainingForGoal(amount, entry.fused), result: null, error: null }];
  }), [goals, progress]);
  const usableInventory = useMemo(() => new Map(form.useHeldShards === false ? [] : [...inventory].filter(([shardKey]) => !disabledShards.has(shardKey))), [disabledShards, form.useHeldShards, inventory]);

  useEffect(() => {
    setDevRecipeOverrides({});
    setDevFusionError(null);
  }, [access.uuid, access.name, access.profileId]);

  const replaceDevRecipe = async (target: string, output: string, recipe: Recipe | undefined) => {
    if (calculating || !fusionContext) return false;
    const service = CalculationService.getInstance();
    const next = (devRecipeOverrides[target] ?? []).filter(override => override.shardId !== output);
    if (recipe) {
      if (!(fusionContext.data.recipes[output] ?? []).some(candidate => service.areRecipesEqual(candidate, recipe))) return false;
      next.push({ shardId: output, recipe });
      const excluded = goals.find(goal => goal.shardKey === target)?.excludedFusionInputs ?? [];
      if (recipe.inputs.some(input => excluded.includes(input))) return false;
      const targetData = await service.parseData({ ...fusionContext.params, excludedFusionInputs: excluded });
      const { choices } = service.computeMinCosts(targetData, fusionContext.params, next);
      if (service.findCycleNodes(choices).some(cycle => cycle.includes(output))) {
        setDevFusionError("This replacement creates a circular fusion. Choose another shard.");
        return false;
      }
    }
    setDevFusionError(null);
    setCalculating(true);
    setDevRecipeOverrides(previous => ({ ...previous, [target]: next }));
    return true;
  };

  useEffect(() => {
    const requestId = ++calculationRequest.current;
    const pendingRoutes = goalRouteInputs.map((route) => ({ ...route, result: null, error: null }));
    if (shardsLoading || ratesLoading || profileLoading) {
      setGoalRoutes(pendingRoutes);
      setAcquisitionEstimates({});
      setFusionContext(null);
      setRouteInventory(new Map(usableInventory));
      setEffectiveRates({});
      setCalculating(false);
      return;
    }

    const hasWork = goalRouteInputs.some((route) => route.remaining !== null && route.remaining > 0);
    // Start the updating state before the debounce, retaining the last complete
    // plan until the replacement is ready rather than flashing empty target rows.
    setCalculating(hasWork);
    if (!hasWork) {
      setGoalRoutes(pendingRoutes);
      setAcquisitionEstimates({});
      setFusionContext(null);
      setRouteInventory(new Map(usableInventory));
    }
    const timer = window.setTimeout(() => {
      const calculate = async () => {
        const dataService = DataService.getInstance();
        const filteredCustomRates = Object.fromEntries(Object.entries(customRates).filter((entry): entry is [string, number] => entry[1] !== undefined));
        const params: CalculationParams = {
          huntingEquipment,
          hunterEquipmentFortune: hunterFortuneFromProfile ? importView.selected?.signals.itemFortune.equipmentTotal : undefined,
          customRates: ironman ? filteredCustomRates : await dataService.loadShardCosts(form.instantBuyPrices),
          hunterFortune: effectiveHunterFortune,
          excludeChameleon: form.excludeChameleon,
          frogBonus: huntingEquipment?.available ? Boolean(huntingEquipment.frogLevel) : form.frogBonus,
          newtLevel: form.newtLevel,
          salamanderLevel: form.salamanderLevel,
          lizardKingLevel: form.lizardKingLevel,
          leviathanLevel: form.leviathanLevel,
          pythonLevel: form.pythonLevel,
          kingCobraLevel: form.kingCobraLevel,
          seaSerpentLevel: form.seaSerpentLevel,
          tiamatLevel: form.tiamatLevel,
          crocodileLevel: form.crocodileLevel,
          kuudraTier: effectiveKuudraTier,
          moneyPerHour: form.moneyPerHour,
          customKuudraTime: form.customKuudraTime,
          kuudraTimeSeconds: form.kuudraTimeSeconds,
          noWoodenBait: form.noWoodenBait,
          rateAsCoinValue: !ironman,
          craftPenalty: form.craftPenalty,
        };
        const data = await CalculationService.getInstance().parseData(params);
        const nextRoutes: GoalRoute[] = [];
        let workingInventory = new Map(usableInventory);

        for (const route of goalRouteInputs) {
          if (route.remaining === null || route.remaining === 0) {
            nextRoutes.push(route);
            continue;
          }
          try {
            const goalInventory = inventoryForGoal(workingInventory, route.goal.gatherInstead);
            const nextResult = await InvCalculationService.getInstance().calculateOptimalPath(
              route.entry.shard.key,
              route.remaining,
              { ...params, excludedFusionInputs: route.goal.excludedFusionInputs },
              goalInventory.available,
              devRecipeOverrides[route.goal.shardKey] ?? [],
              ownedAttributes,
            );
            workingInventory = nextResult.remainingInventory
              ? restoreGoalInventory(nextResult.remainingInventory, goalInventory.reserved)
              : workingInventory;
            const storage = new Map(goalInventory.available);
            for (const [key, entry] of progressByKey) if (entry.loose !== null && !storage.has(key)) storage.set(key, 0);
            nextRoutes.push({ ...route, result: nextResult, storage });
          } catch (error: unknown) {
            nextRoutes.push({
              ...route,
              error: error instanceof Error ? error.message : "A route could not be calculated for this goal.",
            });
          }
        }

        const huntingData = ironman ? data : CalculationService.getInstance().buildData(await DataService.getInstance().loadFusionData(), defaultRates, { ...params, rateAsCoinValue: false, customRates: {} });
        return {
          nextRoutes,
          workingInventory,
          context: { data, params },
          nextRates: Object.fromEntries(Object.entries(data.shards).map(([key, shard]) => [key, shard.rate])),
          nextEstimates: Object.fromEntries(Object.entries(huntingData.shards).flatMap(([key, shard]) => shard.acquisition ? [[key, shard.acquisition]] : [])),
        };
      };

      void calculate().then(({ nextRoutes, workingInventory, nextRates, nextEstimates, context }) => {
        if (calculationRequest.current !== requestId) return;
        setGoalRoutes(nextRoutes);
        setRouteInventory(workingInventory);
        setEffectiveRates(nextRates);
        setAcquisitionEstimates(nextEstimates);
        setFusionContext(context);
        setCalculating(false);
      }).catch((error: unknown) => {
        if (calculationRequest.current !== requestId) return;
        const message = error instanceof Error ? error.message : "The route could not be calculated.";
        setGoalRoutes(pendingRoutes.map((route) => route.remaining && route.remaining > 0 ? { ...route, error: message } : route));
        setFusionContext(null);
        setAcquisitionEstimates({});
        setRouteInventory(new Map(usableInventory));
        setEffectiveRates({});
        setCalculating(false);
      });
    }, 140);
    return () => window.clearTimeout(timer);
  }, [customRates, defaultRates, devRecipeOverrides, effectiveHunterFortune, effectiveKuudraTier, form, goalRouteInputs, hunterFortuneFromProfile, huntingEquipment, importView.selected, ironman, ownedAttributes, profileLoading, progressByKey, ratesLoading, shardsLoading, usableInventory]);

  const chooseGoalByKey = useCallback((shardKey: string, scroll = true, completeAttribute = false) => {
    const shard = shardsByKey.get(shardKey);
    if (!shard?.canFuse) return;
    const shouldScroll = goalState.goals.length === 0;
    setGoalState((current) => {
      const existing = current.goals.find(candidate => candidate.shardKey === shardKey);
      const entry = progressByKey.get(shardKey);
      const selection: GoalSelection = completeAttribute && entry
        ? { ...existing, shardKey, amount: entry.cap, mode: "max", pendingAmount: undefined }
        : existing ?? newGoalSelection(shardKey, entry);
      return { goals: existing ? current.goals.map(candidate => candidate === existing ? selection : candidate) : [...current.goals, selection], activeGoalKey: shardKey };
    });
    setGoalQuery("");
    if (!scroll || !shouldScroll || !window.matchMedia("(max-width: 860px)").matches) return;
    window.requestAnimationFrame(() => plannerRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    }));
  }, [goalState.goals, progressByKey, shardsByKey]);
  const setGoalAmountByKey = useCallback((shardKey: string, raw: number) => {
    const entry = progress.find((candidate) => candidate.shard.key === shardKey);
    if (!entry || !Number.isFinite(raw)) return;
    const amount = fusedTargetForAdditional(raw, entry.fused, entry.cap);
    if (amount === null) return;
    setGoalState((current) => ({
      ...current,
      goals: current.goals.map((candidate) => candidate.shardKey === shardKey
        ? { ...candidate, amount, mode: "amount", pendingAmount: undefined }
        : candidate),
    }));
  }, [progress]);
  const setGoalMaxByKey = useCallback((shardKey: string) => {
    const entry = progress.find((candidate) => candidate.shard.key === shardKey);
    if (!entry) return;
    setGoalState((current) => ({
      ...current,
      goals: current.goals.map((candidate) => candidate.shardKey === shardKey
        ? { ...candidate, amount: entry.cap, mode: "max", pendingAmount: undefined }
        : candidate),
    }));
  }, [progress]);
  const removeGoalByKey = useCallback((shardKey: string) => {
    setDevRecipeOverrides(previous => {
      const next = { ...previous };
      delete next[shardKey];
      return next;
    });
    setGoalState((current) => {
      const removedIndex = current.goals.findIndex((candidate) => candidate.shardKey === shardKey);
      const goals = current.goals.filter((candidate) => candidate.shardKey !== shardKey);
      const activeGoalKey = current.activeGoalKey === shardKey
        ? goals[Math.min(Math.max(0, removedIndex), goals.length - 1)]?.shardKey ?? null
        : current.activeGoalKey;
      return { goals, activeGoalKey };
    });
  }, []);
  const setGoalInputExcluded = (goalKey: string, inputKey: string, excluded: boolean) => {
    if (calculating) return;
    setCalculating(true);
    setDevFusionError(null);
    if (excluded) setDevRecipeOverrides(current => ({ ...current, [goalKey]: (current[goalKey] ?? []).filter(override => !override.recipe?.inputs.includes(inputKey)) }));
    setGoalState(current => ({ ...current, goals: current.goals.map(candidate => {
      if (candidate.shardKey !== goalKey) return candidate;
      const keys = new Set(candidate.excludedFusionInputs);
      if (excluded) keys.add(inputKey); else keys.delete(inputKey);
      return { ...candidate, excludedFusionInputs: [...keys] };
    }) }));
  };
  const setGoalGatherInstead = useCallback((goalKey: string, inputKey: string, gather: boolean) => {
    setGoalState((current) => ({ ...current, goals: current.goals.map((candidate) => {
      if (candidate.shardKey !== goalKey) return candidate;
      const keys = new Set(candidate.gatherInstead);
      if (gather) keys.add(inputKey); else keys.delete(inputKey);
      return { ...candidate, gatherInstead: [...keys] };
    }) }));
  }, []);
  const filterOptions = useMemo<readonly { value: CollectionFilter; label: string; count: number }[]>(() => [
    { value: "incomplete", label: "Incomplete", count: progressSummary.incomplete },
    { value: "maxed", label: "Maxed", count: progressSummary.maxed },
    ...(progressSummary.unknown > 0 ? [{ value: "unknown" as const, label: "Unknown", count: progressSummary.unknown }] : []),
  ], [progressSummary.incomplete, progressSummary.maxed, progressSummary.unknown]);
  const filterAvailable = filterOptions.some((option) => option.value === collectionFilter);
  useEffect(() => {
    if (shardsLoading || progressSummary.total === 0) return;
    if (!filterAvailable) setCollectionFilter(filterOptions[0]?.value ?? "incomplete");
  }, [filterAvailable, filterOptions, progressSummary.total, shardsLoading]);

  const families = useMemo(() => [...new Set(shards.map((shard) => shard.family).filter((family): family is string => Boolean(family)))].sort(), [shards]);
  const types = useMemo(() => [...new Set(shards.map((shard) => shard.type).filter((type): type is string => Boolean(type)))].sort(), [shards]);
  const activeAdvancedFilters = [rarityFilter, familyFilter, typeFilter, acquisitionFilter].filter((value) => value !== "all").length;
  const progressForStatus = useMemo(() => progress.filter((entry) => entry.status === collectionFilter), [collectionFilter, progress]);
  const collectionFilterGroups = useMemo<readonly ProfileProgressionFilterGroup[]>(() => {
    const count = (predicate: (entry: ShardProgressEntry) => boolean) => progressForStatus.filter(predicate).length;
    const directCount = count((entry) => hasDirectAcquisition(entry.shard.key, defaultRates[entry.shard.key]));
    const fusionCount = progressForStatus.length - directCount;
    return [
      {
        legend: "Rarity",
        options: RARITIES.map((rarity) => {
          const optionCount = count((entry) => entry.shard.rarity === rarity);
          const selected = rarityFilter === rarity;
          return {
            id: rarity,
            label: rarity.replace(/^./, (letter) => letter.toUpperCase()),
            count: optionCount,
            selected,
            disabled: optionCount === 0 && !selected,
            onToggle: () => setRarityFilter(selected ? "all" : rarity),
            accent: `var(--color-rarity-${rarity})`,
          };
        }),
      },
      {
        legend: "Acquisition",
        options: [
          {
            id: "direct",
            label: directAcquisitionLabel(ironman),
            count: directCount,
            selected: acquisitionFilter === "direct",
            disabled: directCount === 0 && acquisitionFilter !== "direct",
            onToggle: () => setAcquisitionFilter(acquisitionFilter === "direct" ? "all" : "direct"),
          },
          {
            id: "fusion",
            label: "Fusion only",
            count: fusionCount,
            selected: acquisitionFilter === "fusion",
            disabled: fusionCount === 0 && acquisitionFilter !== "fusion",
            onToggle: () => setAcquisitionFilter(acquisitionFilter === "fusion" ? "all" : "fusion"),
          },
        ],
      },
      {
        legend: "Family",
        options: families.map((family) => {
          const optionCount = count((entry) => entry.shard.family === family);
          const selected = familyFilter === family;
          return {
            id: family,
            label: family,
            count: optionCount,
            selected,
            disabled: optionCount === 0 && !selected,
            onToggle: () => setFamilyFilter(selected ? "all" : family),
          };
        }),
      },
      {
        legend: "Type",
        options: types.map((type) => {
          const optionCount = count((entry) => entry.shard.type === type);
          const selected = typeFilter === type;
          return {
            id: type,
            label: type,
            count: optionCount,
            selected,
            disabled: optionCount === 0 && !selected,
            onToggle: () => setTypeFilter(selected ? "all" : type),
          };
        }),
      },
    ];
  }, [acquisitionFilter, defaultRates, families, familyFilter, ironman, progressForStatus, rarityFilter, typeFilter, types]);
  const clearCollectionFilters = useCallback(() => {
    setQuery("");
    setRarityFilter("all");
    setAcquisitionFilter("all");
    setFamilyFilter("all");
    setTypeFilter("all");
  }, []);
  const filteredProgress = useMemo(() => {
    const normalized = normalizedSearch(query);
    return progressForStatus
      .filter((entry) => rarityFilter === "all" || entry.shard.rarity === rarityFilter)
      .filter((entry) => familyFilter === "all" || entry.shard.family === familyFilter)
      .filter((entry) => typeFilter === "all" || entry.shard.type === typeFilter)
      .filter((entry) => {
        const direct = hasDirectAcquisition(entry.shard.key, defaultRates[entry.shard.key]);
        return acquisitionFilter === "all" || (acquisitionFilter === "direct" ? direct : !direct);
      })
      .filter((entry) => {
        if (!normalized) return true;
        const description = DESCRIPTION_TABLE[entry.shard.key];
        return [entry.shard.name, entry.shard.key, description?.title, description?.description, acquisitionSummary(entry.shard.key)].some((value) => value?.toLowerCase().includes(normalized));
      })
      .sort((left, right) => left.shard.name.localeCompare(right.shard.name) * (sortDescending ? -1 : 1));
  }, [acquisitionFilter, defaultRates, familyFilter, progressForStatus, query, rarityFilter, sortDescending, typeFilter]);
  const goalShelfEntries = useMemo(() => {
    const normalized = normalizedSearch(goalQuery);
    return progress.filter((entry) => {
      if (!entry.shard.canFuse) return false;
      if (!normalized) return true;
      const description = DESCRIPTION_TABLE[entry.shard.key];
      return [entry.shard.name, entry.shard.key, entry.shard.type, entry.shard.family, description?.title, description?.description]
        .some((value) => value?.toLowerCase().includes(normalized));
    });
  }, [goalQuery, progress]);

  const availableProfileOptions = useMemo(() => importView.response?.profiles.length
    ? importView.response.profiles.map((profile) => ({ id: profile.profile.profile_id, name: profile.profile.cute_name, gameMode: profile.profile.game_mode }))
    : parsedProfile.profileOptions, [importView.response, parsedProfile.profileOptions]);
  const playerName = importView.response?.username || parsedProfile.playerName || access.name || "Player";
  const playerUuid = importView.response?.uuid || parsedProfile.playerUuid || access.uuid;
  const profileName = importView.selected?.profile.cute_name || parsedProfile.profileName || "Profile";
  const gameMode = importView.selected?.profile.game_mode || parsedProfile.gameMode || (ironman ? "ironman" : "Normal");
  const fallbackProfileId = importView.selected?.profile.profile_id ?? parsedProfile.profileId ?? access.profileId ?? "profile";
  const profileOptions = availableProfileOptions.length > 0 ? availableProfileOptions : [{ id: fallbackProfileId, name: profileName, gameMode }];
  const selectedProfileId = importView.selected?.profile.profile_id ?? parsedProfile.profileId ?? access.profileId ?? profileOptions[0].id;
  const fetchedAt = importView.fetchedAt ?? parsedProfile.fetchedAt ?? 0;
  const characterPlayer = playerUuid ? { name: playerName, uuid: playerUuid, profileName, gameMode, fetchedAt } : null;
  const sourceStatus = importView.phase === "loading"
    ? "Refreshing shard data..."
    : importView.phase === "error"
      ? "Saved shard data; refresh failed"
      : importView.phase === "unavailable"
        ? "No profile connected"
        : importView.phase === "ready" && (!importView.selected?.shardsRead || !importView.selected?.attributesRead)
          ? "Some shard data unavailable"
          : null;
  const routesMatchGoals = goalRoutes.length === goalRouteInputs.length && goalRoutes.every((route, index) => {
    const expected = goalRouteInputs[index];
    return expected?.goal.shardKey === route.goal.shardKey
      && expected.goal.amount === route.goal.amount
      && expected.goal.mode === route.goal.mode
      && (expected.goal.gatherInstead ?? []).join(",") === (route.goal.gatherInstead ?? []).join(",")
      && expected.remaining === route.remaining;
  });
  const visibleGoalRoutes = routesMatchGoals ? goalRoutes : goalRouteInputs;
  const activeGoalRoute = visibleGoalRoutes.find((route) => route.goal.shardKey === goal?.shardKey) ?? null;
  const gatherPreferenceKeys = [...new Set([...storageInputsForRoute(activeGoalRoute?.result?.tree ?? null), ...(goal?.gatherInstead ?? [])])];
  const endingInventory = routesMatchGoals ? routeInventory : null;
  const used = useMemo(
    () => inventoryUsed(usableInventory, endingInventory ? { remainingInventory: endingInventory } : null),
    [endingInventory, usableInventory],
  );
  const needed = useMemo(() => {
    const quantities = new Map<string, number>();
    for (const route of visibleGoalRoutes) {
      for (const [shardKey, quantity] of route.result?.totalQuantities ?? []) {
        if (quantity > 0) quantities.set(shardKey, (quantities.get(shardKey) ?? 0) + quantity);
      }
    }
    return [...quantities.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  }, [visibleGoalRoutes]);
  const routeRequirements = useMemo<RouteRequirement[]>(() => {
    const ownedByShard = new Map(used.map((item) => [item.shardId, item.quantity]));
    const missingByShard = new Map(needed);
    const keys = new Set([...missingByShard.keys(), ...ownedByShard.keys()]);
    return [...keys].map((shardKey) => {
      const owned = ownedByShard.get(shardKey) ?? 0;
      const missing = missingByShard.get(shardKey) ?? 0;
      return { shardKey, shard: shardsByKey.get(shardKey) ?? null, owned, missing, total: owned + missing };
    }).sort((left, right) => right.missing - left.missing || right.total - left.total || left.shardKey.localeCompare(right.shardKey));
  }, [needed, shardsByKey, used]);
  const heldUsedTotal = used.reduce((sum, item) => sum + item.quantity, 0);
  const totalNeeded = needed.reduce((sum, [, quantity]) => sum + quantity, 0);
  const totalRemaining = visibleGoalRoutes.reduce((sum, route) => sum + (route.remaining ?? 0), 0);
  const totalRouteTime = visibleGoalRoutes.reduce((sum, route) => sum + (route.result?.totalTime ?? 0), 0);
  const totalCrafts = visibleGoalRoutes.reduce((sum, route) => sum + (route.result?.craftsNeeded ?? 0), 0);
  const routeHasUnknownProgress = visibleGoalRoutes.some((route) => route.remaining === null);
  const routeErrors = visibleGoalRoutes.filter((route) => route.error !== null);
  const acquisitionTargets = useMemo(() => {
    return needed
      .map(([key, quantity]) => ({ shard: shardsByKey.get(key), quantity }))
      .filter((entry): entry is { shard: ShardWithDirectInfo; quantity: number } => Boolean(entry.shard && hasDirectAcquisition(entry.shard.key, defaultRates[entry.shard.key])));
  }, [defaultRates, needed, shardsByKey]);
  const hunterFortuneTitle = hunterFortuneFromProfile && detectedHunterFortune.parts.length > 0
    ? `Planning baseline using the best complete saved equipment set. ${detectedHunterFortune.parts.map((part) => `${part.label} ${formatLargeNumber(part.value)}`).join(" + ")}. Excludes tool, rarity, and temporary bonuses.${huntingEquipment?.available ? ` Captured tools: ${[huntingEquipment.blackHole, huntingEquipment.net, huntingEquipment.huntaxe, huntingEquipment.lasso].filter(Boolean).map((tool) => tool!.name).join(", ") || "none found"}.` : " Captured gear unavailable."}`
    : undefined;
  const directRateShards = useMemo(() => {
    const normalized = normalizedSearch(rateQuery);
    return shards.filter((shard) => hasDirectAcquisition(shard.key, defaultRates[shard.key]) && (!normalized || shard.name.toLowerCase().includes(normalized) || shard.key.toLowerCase().includes(normalized) || acquisitionSummary(shard.key).toLowerCase().includes(normalized)));
  }, [defaultRates, rateQuery, shards]);

  const updateCount = useCallback((kind: "fused" | "loose", shardKey: string, raw: string, cap: number) => {
    const target = kind === "fused" ? ownedAttributes : inventory;
    const next = new Map(target);
    if (!raw.trim()) {
      next.delete(shardKey);
    } else {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      next.set(shardKey, Math.min(kind === "fused" ? cap : Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(parsed))));
    }
    if (kind === "fused") setManagedAttributes(next);
    else setManagedInventory(next);
  }, [inventory, ownedAttributes]);

  const toggleShardInRoutes = useCallback((shardKey: string) => {
    const next = new Set(disabledShards);
    if (next.has(shardKey)) next.delete(shardKey);
    else next.add(shardKey);
    setManagedDisabledShards(next);
  }, [disabledShards]);

  return (
    <HuntingEstimateContext.Provider value={acquisitionEstimates}>
    <div className={`profile-view-root profile-view-root--frosted shards-view-root${characterPlayer ? "" : " shards-view-root--no-character"}`}>
      <div className="profile-shell shards-shell">
        {characterPlayer ? (
          <CharacterStage player={characterPlayer} sourceStatus={sourceStatus} profiles={profileOptions} selectedProfileId={selectedProfileId} onProfileChange={setProfileId} showProfilePicker={false} />
        ) : <aside className="profile-character-stage" aria-label="Character preview" />}

        <main className="profile-workspace shards-workspace">
          <ProfileIdentity mobileProfilePicker playerName={playerName} playerUuid={playerUuid} profiles={profileOptions} selectedProfileId={selectedProfileId} gameMode={gameMode} onProfileChange={setProfileId} fetchedAt={fetchedAt} fallbackLabel="Not synced" sourceStatus={sourceStatus} />

          <section className="shards-workspace-surface profile-glass">
            <div className="shards-workspace-grid utility-workbench">
              <aside className="shards-zone shards-goals utility-workbench-zone utility-rail-split" aria-labelledby="shard-goal-title">
                <div className="shards-goal-controls">
                <header className="shards-zone-heading">
                  <h2 id="shard-goal-title">Target {goals.length === 1 ? "Shard" : "Shards"}</h2>
                </header>
                <UtilityTargetSearch query={goalQuery} onQueryChange={setGoalQuery} expanded={goalSearchOpen} onExpandedChange={setGoalSearchOpen} placeholder="Add a target shard" label="Find a shard target" controls="shard-goal-previews" />
                {goalSearchOpen && (
                    <div id="shard-goal-previews" className="shards-goal-shelf" aria-label="Target shard shelf">
                      {shardsLoading ? (
                        <div className="shards-loading" role="status"><span className="shards-spinner" aria-hidden />Loading shards</div>
                      ) : goalShelfEntries.length === 0 ? (
                        <div className="shards-empty"><strong>No shards match</strong><span>Try another name, attribute, family, or type.</span></div>
                      ) : goalShelfEntries.map((entry) => {
                        const plannedGoal = goals.find((candidate) => candidate.shardKey === entry.shard.key);
                        const selected = goal?.shardKey === entry.shard.key;
                        return (
                          <ShardTooltip key={entry.shard.key} shard={entry.shard} progress={entry} interactive>
                          <button
                            type="button"
                            className={`shards-goal-tile ${FOCUS}${plannedGoal ? " is-planned" : ""}${selected ? " is-selected" : ""}`}
                            style={shardRarityStyle(entry.shard.rarity)}
                            aria-pressed={Boolean(plannedGoal)}
                            aria-label={`${plannedGoal ? "Select planned" : "Add"} ${entry.shard.name}, ${attributeTitle(entry)}, ${statusLabel(entry.status)}`}
                            onClick={() => chooseGoalByKey(entry.shard.key)}
                          >
                            <img src={`${import.meta.env.BASE_URL}shardIcons/${entry.shard.key}.png`} alt="" width={38} height={38} loading="lazy" />
                            {plannedGoal && (
                              <b className="shards-goal-count profile-item-tile-count profile-item-overlay-text profile-number">
                                {remainingForGoal(plannedGoal.amount, entry.fused) ?? "?"}
                              </b>
                            )}
                          </button>
                          </ShardTooltip>
                        );
                      })}
                    </div>
                )}
                </div>
                <ShardGoalList hiddenTargets={hiddenTargets} onToggleVisibility={key => setHiddenTargets(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; })} routes={visibleGoalRoutes} activeKey={goal?.shardKey} onSelect={(key) => chooseGoalByKey(key, false)} onAmount={setGoalAmountByKey} onMax={setGoalMaxByKey} onRemove={removeGoalByKey} />
              </aside>

              <section ref={plannerRef} className="shards-zone shards-route-planner utility-workbench-zone" aria-labelledby="shard-planner-title">
                <header className="shards-zone-heading shards-route-heading">
                  <h2 id="shard-planner-title">Fusion</h2>
                  <p>{visibleGoalRoutes.length} target {visibleGoalRoutes.length === 1 ? "shard" : "shards"}</p>
                </header>
                <div className="shards-route-options" role="group" aria-label="Fusion options">
                  <ShardRouteToggles toolbar ironman={ironman} form={form} onChange={(key, value) => setForm({ ...form, [key]: value })}
                    storageOptions={goal && selectedEntry && <ShardGatherPreferences goalName={selectedEntry.shard.name} keys={gatherPreferenceKeys} selected={goal.gatherInstead ?? []} inventory={inventory} shardsByKey={shardsByKey} progressByKey={progressByKey} onChange={(key, gather) => setGoalGatherInstead(goal.shardKey, key, gather)} />} />
                  {([['overrides', 'Overrides'], ['kuudra', 'Kuudra'], ['penalty', 'Craft penalty']] as const).map(([section, label]) => (
                    <details key={section} name="shards-planner-settings" className="shards-inline-options">
                      <summary className="shards-toolbar-toggle">{label} <ChevronDown size={12} aria-hidden /></summary>
                      <div className="shards-options-popover"><ShardSettingsPanel section={section} /></div>
                    </details>
                  ))}
                </div>

                <div className="shards-calculator-scroll" tabIndex={0} role="region" aria-label="Fusion plan">
                <div className={`shards-route-stage${visibleGoalRoutes.length > 0 ? " has-routes" : ""}`}>
                  {devFusionError && <p className="shards-route-inline-note is-error" role="alert">{devFusionError}</p>}
                  {<React.Suspense fallback={<div className="shards-route-state" role="status">Loading fusion view</div>}>
                    <FusionDevViews view="circuit" routes={visibleGoalRoutes} hiddenTargets={hiddenTargets} focus={fusionFocus} data={fusionContext?.data ?? null}
                      crocodileMultiplier={fusionContext ? CalculationService.getInstance().calculateMultipliers(fusionContext.params).crocodileMultiplier : 1}
                      overrides={devRecipeOverrides} busy={calculating} shardsByKey={shardsByKey} progressByKey={progressByKey} ironman={ironman}
                      onReplace={replaceDevRecipe} onExcludeInput={setGoalInputExcluded} onGatherInstead={setGoalGatherInstead} onSelect={key => chooseGoalByKey(key, false)} />
                  </React.Suspense>}
                  {activeGoalRoute?.remaining === null && <div className="shards-route-inline-note is-warning"><AlertTriangle aria-hidden /><span>Set <strong className={getRarityColor(activeGoalRoute.entry.shard.rarity)}>{activeGoalRoute.entry.shard.name}</strong>&apos;s fused count to include it accurately.</span><button type="button" className={FOCUS} onClick={() => { setCollectionFilter("unknown"); setEditingShardKey(activeGoalRoute.goal.shardKey); setQuery(activeGoalRoute.entry.shard.name); window.requestAnimationFrame(() => collectionRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })); }}>Set progress</button></div>}
                </div>

                </div>

                {visibleGoalRoutes.some((route) => route.result) && (
                  <dl className="profile-metrics profile-metrics--standalone shards-plan-metrics" aria-label="Full plan totals">
                    <UtilityMetric activation="click" label="Remaining" value={routeHasUnknownProgress ? "—" : totalRemaining.toLocaleString()} tone="progress" info={{ summary: "Target shards still required by the visible targets. This is the final output quantity, not the number of ingredients." }} />
                    <UtilityMetric activation="click" label="From storage" value={heldUsedTotal.toLocaleString()} tone="storage" info={{ summary: "Held ingredient shards allocated across the visible plan. Shared stock is spent only once." }} />
                    <UtilityMetric activation="click" label="Still needed" value={Math.ceil(totalNeeded).toLocaleString()} tone="materials" info={{ summary: "Additional ingredient shards to acquire after storage allocation. Shard requirements shows which shards make up this total." }} />
                    <UtilityMetric activation="click" label={ironman ? "Est. time" : "Cost"} value={totalResultEstimate(totalRouteTime, ironman)} tone="time" info={{ summary: ironman ? "The plan's estimated acquisition and fusion time, using the selected rates and crafting penalty." : "Estimated cost of the visible routes using the selected Bazaar prices and crafting penalty." }} />
                    <UtilityMetric activation="click" label="Fusions" value={totalCrafts.toLocaleString()} tone="operations" info={{ summary: "Fusion operations across the visible routes. Each operation can produce more than one shard." }} />
                  </dl>
                )}
                {routeErrors.length > 0 && <div className="shards-route-inline-note is-error" role="alert"><AlertTriangle aria-hidden /><span>{routeErrors.length} {routeErrors.length === 1 ? "target could" : "targets could"} not be calculated.</span></div>}
              </section>

          <section className="shards-zone shards-plan-details utility-workbench-zone utility-rail-split utility-support-rail" aria-label="Shard plan details">
            <section className="shards-plan-section" aria-labelledby="shards-requirements-title">
              <header className="shards-zone-heading"><span>NEEDS</span><h2 id="shards-requirements-title">Shard requirements</h2></header>
              <dl className="profile-metrics shards-requirement-assumptions" aria-label="Hunting assumptions">
                <UtilityMetric activation="click" label="Hunter Fortune" value={formatLargeNumber(effectiveHunterFortune)} tone="operations" info={{ summary: hunterFortuneTitle || "Hunter Fortune used for the current acquisition estimates." }} />
                {(visibleGoalRoutes.some((route) => route.entry.shard.key === "L15") || acquisitionTargets.some(({ shard }) => shard.key === "L15")) && <UtilityMetric activation="click" label="Kuudra tier" value={effectiveKuudraTier.toUpperCase()} tone="materials" info={{ summary: "Kuudra tier used to estimate Kraken shard acquisition from reward chests." }} />}
              </dl>
              <div className="shards-plan-panel" role="region" aria-label="Shard requirements list" tabIndex={0}>
              <div className="shards-zone shards-requirements">
                  {hunterFortuneFromProfile && detectedHunterFortune.value === null && <p className="shards-assumption-warning">Hunter Fortune could not be detected.</p>}
                  <div className="shards-requirement-list">
                    {routeRequirements.length > 0 ? routeRequirements.map((requirement) => {
                      return requirement.shard && <AcquisitionCard key={requirement.shardKey} shard={requirement.shard} progress={progressByKey.get(requirement.shardKey)} requirement={requirement} quantity={requirement.missing} effectiveRate={effectiveRates[requirement.shardKey]} baseRate={defaultRates[requirement.shardKey]} ironman={ironman} />;
                    }) : <div className="shards-empty"><span>{calculating ? "Calculating requirements" : routeErrors.length ? "Calculation unavailable" : routeHasUnknownProgress ? "Set progress to calculate requirements" : goals.length ? "No inputs required" : "Add a target to see its requirements"}</span></div>}
                  </div>
                </div>
              </div>
            </section>
            <section className="shards-plan-section" aria-labelledby="shards-breakdowns-title">
              <header className="shards-zone-heading"><h2 id="shards-breakdowns-title">{goals.length ? "Target breakdowns" : "Direct rates"}</h2></header>
              <div className="shards-plan-panel" role="region" aria-label={goals.length ? "Target breakdowns list" : "Direct rates list"} tabIndex={0}>
              <div className="shards-plan-breakdown">
              {goals.length ? (
                <>
                    <div className="shards-route-goal-paths">
                      {visibleGoalRoutes.map((route) => (
                        <section className={`shards-route-goal-path${route.remaining === 0 && !route.result?.tree ? " is-complete" : ""}`} key={route.goal.shardKey} style={shardRarityStyle(route.entry.shard.rarity)}>
                          {!route.result?.tree && <header>
                            <img src={`${import.meta.env.BASE_URL}shardIcons/${route.entry.shard.key}.png`} alt="" width={44} height={44} />
                            <span><strong className={getRarityColor(route.entry.shard.rarity)}>{route.entry.shard.name}</strong><small>{attributeTitle(route.entry)}</small></span>
                            <b>{route.remaining === 0 ? <><Check aria-hidden />Complete</> : route.remaining === null ? "Progress needed" : `${route.remaining.toLocaleString()} to fuse`}</b>
                          </header>}
                          {route.result?.tree ? (
                            <ShardRouteTree tree={route.result.tree} shardsByKey={shardsByKey} ironman={ironman} onInspect={path => inspectFusion(route.goal.shardKey, path)} />
                          ) : route.remaining !== 0 && (
                            <div className="shards-acquisition-wait"><strong>{route.remaining === null ? "Progress needed" : calculating ? "Calculating fusion" : "Fusion unavailable"}</strong>{route.error && <span>{route.error}</span>}</div>
                          )}
                        </section>
                      ))}
                    </div>
                </>
              ) : (
                <div className="shards-rate-overview"><label className="shards-search"><Search aria-hidden /><span className="sr-only">Search direct rates</span><input value={rateQuery} onChange={(event) => setRateQuery(event.target.value)} placeholder="Search huntable shards" className={INPUT} /></label><div className="shards-rate-overview-list">{directRateShards.map((shard) => <ShardTooltip key={shard.key} shard={shard} progress={progressByKey.get(shard.key)} interactive><button type="button" onClick={() => chooseGoalByKey(shard.key)} className={`${FOCUS} w-full`}><img src={`${import.meta.env.BASE_URL}shardIcons/${shard.key}.png`} alt="" width={28} height={28} loading="lazy" /><span><strong className={getRarityColor(shard.rarity)}>{shard.name}</strong><small><ShardAcquisitionText shardKey={shard.key} text={acquisitionSummary(shard.key)} /></small></span><em>{ironman && effectiveRates[shard.key] > 0 ? "~" : ""}{rateLabel(effectiveRates[shard.key], ironman)}</em></button></ShardTooltip>)}</div></div>
              )}
              </div>
              </div>
            </section>
          </section>
            </div>

            {(shardsError || importView.error || !!importView.selected?.unmappedShards) && (
              <div className="shards-source-note" role={shardsError || importView.error ? "alert" : "status"}><AlertTriangle aria-hidden /><span>{shardsError || importView.error || `${importView.selected?.unmappedShards} profile shard${importView.selected?.unmappedShards === 1 ? " is" : "s are"} newer than this catalogue and cannot be planned yet.`}</span></div>
            )}
          </section>
                  <section ref={collectionRef} className="shards-zone shards-collection shards-collection--compact profile-glass" aria-labelledby="shard-collection-title" aria-busy={profileLoading}>
                    <header className="shards-zone-heading shards-collection-heading">
                      <div><h2 id="shard-collection-title">Shard Collection</h2></div>
                      <button type="button" className={`shards-profile-sync ${FOCUS}`} onClick={() => setRefreshRevision((current) => current + 1)} disabled={!(access.name.trim() || access.uuid.trim()) || profileRefreshing} aria-label="Sync shard collection with profile"><RefreshCw className={profileRefreshing ? "is-spinning" : ""} aria-hidden /><span>{profileRefreshing ? "Syncing" : "Sync"}</span></button>
                    </header>
                    <div className="shards-collection-controls">
                      <div className="shards-collection-search-tools">
                        <ProfileProgressionFilters query={query} onQueryChange={setQuery} searchLabel="Search shard collection" placeholder="Search collection" groups={collectionFilterGroups} activeCount={activeAdvancedFilters} resultCount={filteredProgress.length} totalCount={progressForStatus.length} onClear={clearCollectionFilters} />
                        <button type="button" className={`shards-sort-toggle ${FOCUS}`} aria-label={sortDescending ? "Sort shards by name ascending" : "Sort shards by name descending"} title={sortDescending ? "Name: Z to A. Switch to A to Z" : "Name: A to Z. Switch to Z to A"} onClick={() => setSortDescending((current) => !current)}>{sortDescending ? <ArrowUpAZ aria-hidden /> : <ArrowDownAZ aria-hidden />}</button>
                      </div>
                      <div className="shards-status-tabs profile-tabs" role="group" aria-label="Collection progress">
                        {filterOptions.map((option) => <button key={option.value} type="button" className={collectionFilter === option.value ? "is-active" : ""} aria-pressed={collectionFilter === option.value} disabled={collectionFilter !== option.value && option.count === 0} onClick={() => setCollectionFilter(option.value)}><span>{option.label}</span><strong className="profile-number">{option.count}</strong></button>)}
                      </div>
                    </div>
                    <div className="shards-collection-grid">
                      {profileLoading || shardsLoading ? (
                        <div className="shards-loading" role="status"><span className="shards-spinner" aria-hidden />Loading shard progress</div>
                      ) : filteredProgress.length === 0 ? (
                        <div className="shards-empty"><strong>No shards match</strong><span>Change the status, search, or filters.</span></div>
                      ) : filteredProgress.map((entry) => {
                        const selected = goal?.shardKey === entry.shard.key;
                        const planned = goals.some((candidate) => candidate.shardKey === entry.shard.key);
                        const progressPercent = entry.fused === null ? 0 : Math.min(100, (entry.fused / entry.cap) * 100);
                        const direct = hasDirectAcquisition(entry.shard.key, defaultRates[entry.shard.key]);
                        const disabled = disabledShards.has(entry.shard.key);
                        return (
                          <article key={entry.shard.key} style={shardRarityStyle(entry.shard.rarity)} className={`shards-collection-row${planned ? " is-planned" : ""}${selected ? " is-selected" : ""}${disabled ? " is-disabled" : ""}${editingShardKey === entry.shard.key ? " is-editing" : ""}`}>
                            <ShardTooltip shard={entry.shard} progress={entry} interactive>
                            <ProfileProgressRow as="button" detail type="button" className={`shards-row-select ${FOCUS}`} aria-pressed={planned} onClick={() => entry.shard.canFuse ? chooseGoalByKey(entry.shard.key, false, true) : setEditingShardKey(entry.shard.key)} icon={
                              <span className="profile-skill-icon shards-progress-icon"><img src={`${import.meta.env.BASE_URL}shardIcons/${entry.shard.key}.png`} alt="" width={28} height={28} loading="lazy" /></span>}>
                                <span className="profile-skill-head"><strong className={getRarityColor(entry.shard.rarity)}>{entry.shard.name}</strong><span className="profile-skill-figure">{entry.fused === null ? "—" : `${Math.min(entry.fused, entry.cap)} / ${entry.cap}`}<span className="sr-only"> fused · {statusLabel(entry.status)}</span></span></span>
                                <span className="shards-collection-secondary"><span>{attributeTitle(entry)}</span><span>{entry.loose === null ? "—" : entry.loose.toLocaleString()} in storage</span></span>
                                <span className="profile-skill-progress" role="progressbar" aria-label={`${entry.shard.name} fused progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={entry.fused === null ? undefined : progressPercent}><i style={{ width: `${progressPercent}%` }} /></span>
                            </ProfileProgressRow>
                            </ShardTooltip>
                            <button type="button" className={`shards-row-edit-toggle ${FOCUS}`} aria-label={`${editingShardKey === entry.shard.key ? "Close" : "Adjust"} ${entry.shard.name} counts and fusion use`} aria-expanded={editingShardKey === entry.shard.key} aria-controls={`shard-editor-${entry.shard.key}`} onClick={() => setEditingShardKey((current) => current === entry.shard.key ? null : entry.shard.key)} title={`${editingShardKey === entry.shard.key ? "Close" : "Adjust"} ${entry.shard.name}`}><span aria-hidden>···</span></button>
                            {editingShardKey === entry.shard.key && (
                              <>
                              <div className="shards-row-editor" id={`shard-editor-${entry.shard.key}`}>
                                <label><span>Fused</span><input type="number" min={0} max={entry.cap} value={entry.fused ?? ""} placeholder="Unknown" onChange={(event) => updateCount("fused", entry.shard.key, event.target.value, entry.cap)} onWheel={(event) => event.currentTarget.blur()} className={FOCUS} /></label>
                                <label><span>In storage</span><input type="number" min={0} value={entry.loose ?? ""} placeholder="Unknown" onChange={(event) => updateCount("loose", entry.shard.key, event.target.value, entry.cap)} onWheel={(event) => event.currentTarget.blur()} className={FOCUS} /></label>
                                <button type="button" aria-pressed={!disabled} className={`shards-route-toggle ${FOCUS}`} onClick={() => toggleShardInRoutes(entry.shard.key)} title={disabled ? "Allow the planner to spend your held stock of this shard" : "Keep your held stock of this shard. The planner can still acquire more if needed."}>{disabled ? <EyeOff aria-hidden /> : <Eye aria-hidden />}<span>{disabled ? "Held shards protected" : "Use held shards"}</span></button>
                              </div>
                              <div className="shards-row-acquisition"><ShardEffectText shardKey={entry.shard.key} description={DESCRIPTION_TABLE[entry.shard.key]?.description ?? "Attribute details unavailable"} />{direct ? acquisitionFor(entry.shard.key).map((line) => <p key={line}><ShardAcquisitionText shardKey={entry.shard.key} text={line} /></p>) : <p>Fusion only</p>}</div>
                              </>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </section>
        </main>
      </div>
    </div>
    </HuntingEstimateContext.Provider>
  );
};
