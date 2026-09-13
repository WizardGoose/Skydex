import React from "react";
import { ControlGrid, ControlPair, ControlRow, INPUT, LABEL, Segmented, SliderRow, ToggleRow } from "../../../ui/kit";
import { formatDuration, stageSeconds } from "../../planner/time";
import type { BioanalysisTier } from "../../planner/planEstimates";
import type { GreenhouseStats, Stat, StatSource } from "../../../island/profileStats";

/**
 * The greenhouse settings block, compact.
 *
 * It used to be four stacked label-over-control blocks with an eight pixel gap
 * between each, a two line hint under the Bioanalysis field and a four line
 * paragraph under the lot. Four numbers you set once and then want to read
 * next to each other took more vertical space than the plan they were feeding,
 * in a 260px sidebar.
 *
 * What changed, and why each one is a real reduction rather than a squeeze:
 *
 *   Every control is one row. Label left, control middle, value right, in a
 *   fixed mono slot so the numbers line up as a column you can read down.
 *   Hairlines between rows instead of gaps.
 *   Plot count is three buttons rather than a three stop slider. Picking one
 *   of three things by dragging was always the harder way to do it.
 *   The Bioanalysis hint and the timing paragraph became tooltips, and the
 *   one number the paragraph was really carrying, how long a stage takes,
 *   became a row of its own so it lines up with everything else.
 *
 * Nothing here holds state. The planner owns it, and this renders it, so the
 * page can keep its storage exactly as it is.
 */

/** Ordered so the index doubles as the API's numeric tier. */
const BIOANALYSIS: ReadonlyArray<{ value: BioanalysisTier; label: string }> = [
  { value: "none", label: "None" },
  { value: "talisman", label: "Talisman, +5%" },
  { value: "ring", label: "Ring, +10%" },
  { value: "artifact", label: "Artifact, +15%" },
];

const PLOT_OPTIONS = [
  { value: 1, label: "1", title: "One plot" },
  { value: 2, label: "2", title: "Two plots in parallel" },
  { value: 3, label: "3", title: "Three plots in parallel" },
] as const;

/**
 * The stats contract, straight from src/island/profileStats.ts, so the result
 * of `useGreenhouseStats()` goes in with no adapter:
 *
 *   const stats = useGreenhouseStats();
 *   const growth = resolveGrowth(state.growth, stats);
 *   <GreenhouseSettings growth={growth} onChange={onChange} stats={stats} />
 *
 * `growth` and `stats` have to describe the same numbers or the chips make a
 * claim the controls do not back up, which is why the caller resolves once and
 * feeds both from it. `planner/growthSource.ts` is where that rule lives.
 *
 * A null field means the API does not expose that stat at all. It stays
 * manual and gets no chip, and it never shows a zero: absent and zero are
 * different claims and the second one would be a lie.
 */
export type ApiStat = Stat;
export type GreenhouseStatsLike = GreenhouseStats;

/**
 * Why a stat is still being asked of you.
 *
 * The standing rule is to pull from the API wherever it can be pulled, so
 * every field that is not pulled owes the player a reason on the spot rather than in
 * a changelog. Three of the four owe one, and none of them is "we did not get
 * around to it": one is genuinely absent, one is ambiguous enough that
 * guessing would corrupt every estimate downstream, and one lives in data
 * this site has decided not to read.
 *
 * These say what the control is and why it is manual. They do not explain the
 * arithmetic. The maths lives in planner/time.ts, which is where it can be
 * tested, and a formula repeated in a tooltip is a second copy that goes
 * stale silently.
 */
const WHY_MANUAL = {
  cropGrowth: "Not pulled: Hypixel computes this and never stores it, so the API has no value to give.",
  plots: "Not pulled: the API's plot field is ambiguous, and reading it wrong would skew every time estimate here.",
  bioanalysis:
    "Not pulled: it lives in accessory bag data this site does not read. Only the best one you hold counts, they upgrade each other.",
} as const;

/**
 * Whether to show the provenance chip on a control.
 *
 * The chip means one thing: "this number is the one the API gave you". It is a
 * claim about the value actually in use, so it has to be answered by whichever
 * source actually won rather than by whether an API value happens to exist.
 *
 * Two locks, and both matter:
 *
 *   THE SOURCE. `stat` is the resolved stat out of the store in
 *   `island/profileStats.ts`, which lays the player's typed values over the
 *   API's before publishing. Once they have typed one it reads `manual` and the
 *   chip goes, and it stays gone until the override is withdrawn, even if they
 *   happen to type the same number the API gave. That is the same precedence
 *   the island owned-counts run on.
 *
 *   THE VALUE. The live number still has to match. That is what keeps the chip
 *   honest for a caller that has not fed this control from the resolved value:
 *   it can fail to show a chip, which understates, but it cannot advertise a
 *   number that is not on screen. `PlannerPage` feeds both from one resolved
 *   object, so in practice the two agree by construction.
 *
 * Deliberately not exported. The precedence tests assert the chip by rendering
 * this panel and reading the markup, which is the claim a player actually sees;
 * exporting the predicate would let a test pass while the row it is supposed to
 * be attached to renders something else, and would cost this file its fast
 * refresh besides.
 */
const chipSource = (stat: Stat | null | undefined, live: number): StatSource | undefined =>
  stat && stat.source === "api" && stat.value === live ? "api" : undefined;

export interface GreenhouseGrowth {
  cropGrowth: number;
  /**
   * The Growth Speed tier in force, already resolved by the caller. The panel
   * does not know or care which source won; it renders the number and reports
   * an edit, and `stats` is what says whose number it is.
   */
  speedTier: number;
  plots: number;
  bioanalysis?: BioanalysisTier;
}

export interface GreenhouseSettingsProps {
  growth: GreenhouseGrowth;
  onChange: <K extends keyof GreenhouseGrowth>(key: K, value: GreenhouseGrowth[K]) => void;
  /** Optional, from `useGreenhouseStats()`. Drives the provenance chips only. */
  stats?: GreenhouseStatsLike | null;
  /** Unique crops standing in the greenhouse, for the stage time readout. */
  uniqueCrops?: number;
  /**
   * True when a key exists but no garden pull has ever succeeded, so the API
   * could fill this in and simply has not been asked yet.
   *
   * It changes what the hint is allowed to claim. Three of these four stats
   * are manual forever and say so, which makes a fourth silently-manual row
   * indistinguishable from them: the player cannot tell "Hypixel does not
   * expose this" from "you never connected your profile". This flag is what
   * separates the two.
   */
  awaitingProfile?: boolean;
  className?: string;
}

export const GreenhouseSettings: React.FC<GreenhouseSettingsProps> = ({
  growth,
  onChange,
  stats,
  uniqueCrops = 12,
  awaitingProfile = false,
  className = "",
}) => {
  const stage = stageSeconds({ ...growth, uniqueCrops });
  const bioIndex = BIOANALYSIS.findIndex((b) => b.value === (growth.bioanalysis ?? "none"));

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2 pb-1">
        <span className={LABEL}>Greenhouse</span>
      </div>

      <ControlGrid>
        <SliderRow
          id="gh-crop-growth"
          label="Crop Growth"
          min={0}
          max={200}
          step={5}
          value={growth.cropGrowth}
          onChange={(v) => onChange("cropGrowth", v)}
          source={chipSource(stats?.cropGrowth, growth.cropGrowth)}
          hint={WHY_MANUAL.cropGrowth}
        />

        <SliderRow
          id="gh-speed-tier"
          label="Speed tier"
          min={0}
          max={9}
          value={growth.speedTier}
          onChange={(v) => onChange("speedTier", v)}
          source={chipSource(stats?.growthSpeedTier, growth.speedTier)}
          hint={
            awaitingProfile
              ? "Connect your profile in Settings to fill this in automatically."
              : "Your Greenhouse Growth Speed upgrade. Read from your profile, and yours to change if it is behind."
          }
        />

        <ControlRow
          label="Bioanalysis"
          htmlFor="gh-bioanalysis"
          source={chipSource(stats?.bioanalysis, bioIndex)}
          hint={WHY_MANUAL.bioanalysis}
        >
          <select
            id="gh-bioanalysis"
            value={growth.bioanalysis ?? "none"}
            onChange={(e) => onChange("bioanalysis", e.target.value as BioanalysisTier)}
            className={`${INPUT} cursor-pointer`}
          >
            {BIOANALYSIS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </ControlRow>

        <ControlPair>
          <ControlRow label="Plots" hint={WHY_MANUAL.plots} source={chipSource(stats?.plots, growth.plots)}>
            <Segmented
              ariaLabel="Plots running"
              options={PLOT_OPTIONS}
              value={growth.plots}
              onChange={(v) => onChange("plots", v)}
            />
          </ControlRow>

          <ControlRow
            label="One stage"
            value={formatDuration(stage)}
            hint={`At ${uniqueCrops} unique crops, and a spawn is rolled once per stage. Expected wall clock, and the greenhouse keeps growing while you are offline.`}
          />
        </ControlPair>
      </ControlGrid>

      {/*
       * Only shown once a profile has actually been read, because that is the
       * only moment the question arises. If nothing was pulled, nothing needs
       * explaining; if something was, the three fields that were not pulled
       * would otherwise look like the site simply forgot them.
       */}
      {stats?.fetchedAt && (
        <p className="pt-1 text-[11px] leading-snug text-slate-400">Only Growth Speed is in the API. Hover for why.</p>
      )}
    </div>
  );
};

export interface PlannerOptionsListProps {
  options: { showBaseCrops: boolean; hideCompleted: boolean; showTime: boolean };
  onChange: <K extends "showBaseCrops" | "hideCompleted" | "showTime">(key: K, value: boolean) => void;
  className?: string;
}

/**
 * The options checklist. Same three toggles, on hairlines instead of a
 * `space-y-1.5` stack, so the gaps stop costing as much as the options.
 */
export const PlannerOptionsList: React.FC<PlannerOptionsListProps> = ({ options, onChange, className = "" }) => (
  <ControlGrid className={className}>
    <ToggleRow label="Show base crops" checked={options.showBaseCrops} onChange={(v) => onChange("showBaseCrops", v)} />
    <ToggleRow label="Hide finished" checked={options.hideCompleted} onChange={(v) => onChange("hideCompleted", v)} />
    <ToggleRow label="Show grow times" checked={options.showTime} onChange={(v) => onChange("showTime", v)} />
  </ControlGrid>
);
