import React, { useMemo, useState } from "react";
import { Flame, Minus, Plus, RotateCcw, Search, Shield } from "lucide-react";
import { ShardSelect, type ShardSelectOption } from "../components/forms/inputs/ShardSelect";
import { KUUDRA_TIERS } from "../constants";
import { useCalculatorState, useCustomRates, useShardsWithRecipes } from "../hooks";
import { useApiAccess } from "../island/apiKey";
import type { CalculationFormData } from "../schemas";
import { acquisitionSummary, hasDirectAcquisition } from "../shards/acquisition";
import { useShardProfileSnapshot } from "../shards/profileAssumptionsStore";
import { ShardRouteToggles } from "../shards/ShardRouteToggles";
import { ControlGrid, ControlRow, FOCUS, INPUT, PANEL, SectionHead, ToggleRow } from "../ui/kit";
import { formatLargeNumber, getRarityColor } from "../utilities";

type SettingSource = "profile" | "override";
type KuudraTier = CalculationFormData["kuudraTier"];

const KUUDRA_TIER_OPTIONS: readonly ShardSelectOption[] = KUUDRA_TIERS.map((tier, index) => ({
  value: tier.value,
  label: tier.label,
  icon: tier.value === "none" ? Shield : Flame,
  tone: (["neutral", "common", "uncommon", "amber", "orange", "red"] as const)[index],
}));

const SourceControl: React.FC<{
  value: SettingSource;
  onChange: (value: SettingSource) => void;
  profileDisabled?: boolean;
  label: string;
}> = ({ value, onChange, profileDisabled = false, label }) => (
  <div className="shards-settings-source" role="group" aria-label={`${label} source`}>
    <button type="button" aria-pressed={value === "profile"} disabled={profileDisabled} onClick={() => onChange("profile")} className={FOCUS}>Profile</button>
    <button type="button" aria-pressed={value === "override"} onClick={() => onChange("override")} className={FOCUS}>Override</button>
  </div>
);

const numberOr = (raw: string, fallback: number): number => {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

export const ShardSettingsPanel: React.FC<{ section?: "overrides" | "kuudra" | "penalty" }> = ({ section }) => {
  const { form, setForm } = useCalculatorState();
  const { customRates, defaultRates, updateRate, resetRates } = useCustomRates();
  const { shards } = useShardsWithRecipes();
  const { access } = useApiAccess();
  const storedSnapshot = useShardProfileSnapshot();
  const [rateQuery, setRateQuery] = useState("");
  const snapshot = storedSnapshot && (!access.profileId || storedSnapshot.profileId === access.profileId)
    ? storedSnapshot
    : null;
  const hunterSource = form.hunterFortuneSource ?? "profile";
  const kuudraSource = form.kuudraTierSource ?? "profile";
  const patch = <K extends keyof CalculationFormData>(key: K, value: CalculationFormData[K]) => setForm({ ...form, [key]: value });
  const penaltyStep = form.ironManView ? 0.1 : 100;
  const penaltyMax = form.ironManView ? Math.max(20, Math.ceil(form.craftPenalty)) : Math.max(50_000, Math.ceil(form.craftPenalty));
  const penaltyProgress = penaltyMax > 0 ? Math.min(100, Math.max(0, (form.craftPenalty / penaltyMax) * 100)) : 0;
  const rateShards = useMemo(() => {
    const query = rateQuery.trim().toLowerCase();
    return shards.filter((shard) => hasDirectAcquisition(shard.key, defaultRates[shard.key]) && (!query
      || shard.name.toLowerCase().includes(query)
      || shard.key.toLowerCase().includes(query)
      || acquisitionSummary(shard.key).toLowerCase().includes(query)));
  }, [defaultRates, rateQuery, shards]);

  return (
    <div className="shards-settings-stack">
      {section !== "penalty" && <div className={`${PANEL} shards-settings-profile-panel`}>
        <SectionHead title={section === "kuudra" ? "Kuudra tier" : section === "overrides" ? "Hunting Fortune" : "Profile-derived values"} right={snapshot ? <span className="shards-settings-profile-name">{snapshot.profileName}</span> : undefined} />
        <div className="p-3">
          <ControlGrid>
            {section !== "kuudra" && <><ControlRow
              label="Hunter Fortune"
              value={snapshot?.hunterFortune.value !== null && snapshot?.hunterFortune.value !== undefined
                ? formatLargeNumber(snapshot.hunterFortune.value)
                : "Unavailable"}
              hint="Planning baseline from Hunting level, Hunter's Luck, the best complete saved equipment set, accessories, and Hunter's Karma. Excludes tool, rarity, and temporary bonuses."
            >
              <SourceControl label="Hunter Fortune" value={hunterSource} onChange={(value) => patch("hunterFortuneSource", value)} />
            </ControlRow>
            {hunterSource === "override" && (
              <ControlRow label="Hunter Fortune override" htmlFor="shards-hunter-fortune-override">
                <input
                  id="shards-hunter-fortune-override"
                  type="number"
                  min={0}
                  step="any"
                  value={form.hunterFortune}
                  onChange={(event) => patch("hunterFortune", numberOr(event.target.value, form.hunterFortune))}
                  onWheel={(event) => event.currentTarget.blur()}
                  className={`${INPUT} shards-settings-number`}
                />
              </ControlRow>
            )}
            </>}
            {section !== "overrides" && <><ControlRow
              label="Kuudra tier"
              value={snapshot?.kuudraTier ? snapshot.kuudraTier.toUpperCase() : "Unavailable"}
              hint="Uses the highest Kuudra tier completed on this profile."
            >
              <SourceControl label="Kuudra tier" value={kuudraSource} onChange={(value) => patch("kuudraTierSource", value)} />
            </ControlRow>
            {kuudraSource === "override" && (
              <ControlRow label="Kuudra tier override" htmlFor="shards-kuudra-tier-override">
                <ShardSelect id="shards-kuudra-tier-override" ariaLabel="Kuudra tier override" value={form.kuudraTier} options={KUUDRA_TIER_OPTIONS} onChange={(value) => patch("kuudraTier", value as KuudraTier)} className="shards-settings-select" />
              </ControlRow>
            )}
            </>}
          </ControlGrid>
          {!snapshot && <p className="shards-settings-note">Open Shards with a connected profile to refresh automatic values. Saved overrides remain available as a fallback.</p>}
          {section !== "kuudra" && snapshot?.hunterFortune.value === null && snapshot.hunterFortune.unavailableReason && <p className="shards-settings-note">{snapshot.hunterFortune.unavailableReason}</p>}
        </div>
      </div>}

      {(!section || section === "penalty") && <div className={PANEL}>
        <SectionHead title={section === "penalty" ? "Craft penalty" : "Fusion options"} />
        <div className="p-3">
          <ControlGrid>
            {!section && <ShardRouteToggles ironman={form.ironManView} form={form} onChange={patch} />}
            <div className="shards-penalty-row">
              <span>Craft penalty</span>
              <div>
                <button type="button" className={FOCUS} aria-label="Decrease craft penalty" onClick={() => patch("craftPenalty", Math.max(0, Number((form.craftPenalty - penaltyStep).toFixed(2))))}><Minus aria-hidden /></button>
                <input type="range" min={0} max={penaltyMax} step={penaltyStep} value={form.craftPenalty} style={{ "--shards-range-progress": `${penaltyProgress}%` } as React.CSSProperties} onChange={(event) => patch("craftPenalty", Number(event.target.value))} aria-label="Craft penalty" />
                <button type="button" className={FOCUS} aria-label="Increase craft penalty" onClick={() => patch("craftPenalty", Number((form.craftPenalty + penaltyStep).toFixed(2)))}><Plus aria-hidden /></button>
                <output>{formatLargeNumber(form.craftPenalty)} {form.ironManView ? "sec" : "coins"}</output>
              </div>
            </div>
          </ControlGrid>
        </div>
      </div>}

      {(!section || section === "kuudra") && <div className={PANEL}>
        <SectionHead title="Kuudra timing" />
        <div className="p-3">
          <ControlGrid>
            <ToggleRow label="Custom completion time" checked={form.customKuudraTime} onChange={(value) => patch("customKuudraTime", value)} />
            {form.customKuudraTime && (
              <ControlRow label="Completion time" value="seconds" htmlFor="shards-kuudra-time">
                <input id="shards-kuudra-time" type="number" min={1} step={1} value={form.kuudraTimeSeconds ?? ""} onChange={(event) => patch("kuudraTimeSeconds", event.target.value ? Math.max(1, numberOr(event.target.value, 1)) : null)} onWheel={(event) => event.currentTarget.blur()} className={`${INPUT} shards-settings-number`} />
              </ControlRow>
            )}
            <ControlRow label="Money per hour" htmlFor="shards-money-per-hour" hint="Used to include Kuudra key cost as time. Leave blank to ignore key cost.">
              <input id="shards-money-per-hour" type="number" min={0} step="any" value={Number.isFinite(form.moneyPerHour) ? form.moneyPerHour ?? "" : ""} placeholder="Ignore key cost" onChange={(event) => patch("moneyPerHour", event.target.value.trim() ? numberOr(event.target.value, 0) : Infinity)} onWheel={(event) => event.currentTarget.blur()} className={`${INPUT} shards-settings-number shards-settings-number--wide`} />
            </ControlRow>
          </ControlGrid>
        </div>
      </div>}

      {(!section || section === "overrides") && <div className={PANEL}>
        <SectionHead title="Hunting-rate overrides" right={<button type="button" className={`shards-settings-reset ${FOCUS}`} aria-label="Reset hunting-rate overrides" title="Reset hunting-rate overrides" onClick={() => { if (window.confirm("Reset every custom hunting rate to its default?")) resetRates(); }}><RotateCcw size={14} aria-hidden /></button>} />
        <div className="shards-settings-rates">
          <label className="shards-settings-search"><Search aria-hidden /><span className="sr-only">Search hunting rates</span><input value={rateQuery} onChange={(event) => setRateQuery(event.target.value)} placeholder="Search direct shards" className={INPUT} /></label>
          <div className="shards-settings-rate-list">
            {rateShards.map((shard) => (
              <label key={shard.key}>
                <img src={`${import.meta.env.BASE_URL}shardIcons/${shard.key}.png`} alt="" width={24} height={24} loading="lazy" />
                <span><strong className={getRarityColor(shard.rarity)}>{shard.name}</strong><small>{acquisitionSummary(shard.key)}</small></span>
                <input type="number" min={0} step="any" aria-label={`${shard.name} shards per hour`} value={customRates[shard.key] ?? defaultRates[shard.key] ?? ""} onChange={(event) => { const raw = event.target.value; if (!raw.trim()) updateRate(shard.key, undefined); else { const value = Number(raw); if (Number.isFinite(value) && value >= 0) updateRate(shard.key, value); } }} onWheel={(event) => event.currentTarget.blur()} className={`${INPUT} shards-settings-rate-input`} />
                <em>/ hour</em>
              </label>
            ))}
          </div>
        </div>
      </div>}
    </div>
  );
};
