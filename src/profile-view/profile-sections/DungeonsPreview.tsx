import React from "react";
import { Award, Clock3, Shield } from "lucide-react";
import type { ProfileStatusView } from "../../profile/profileStatus";
import {
  type DungeonClassRow,
  type DungeonFloorGroup,
  type DungeonFloorRow,
  type DungeonRewardRow,
  type DungeonRunRow,
  type DungeonsPreviewModel,
  type ProfileSectionState,
  resolveProfileSectionState,
} from "../../profile/riftMuseumDungeons";
import { compactProfileNumber } from "./profilePbcFormatting";
import {
  ProfilePbcDisclosure,
  ProfilePbcEmpty,
  ProfilePbcHeader,
  ProfilePbcLoading,
  ProfilePbcStatusLine,
  ProfilePbcUnavailable,
} from "./ProfilePbcShared";
import "./rift-museum-dungeons.css";
import "./dungeons-preview.css";

export interface DungeonsPreviewProps {
  status: ProfileStatusView;
  model: DungeonsPreviewModel;
  error?: string | null;
}

const StatePanel: React.FC<{
  state: Exclude<ProfileSectionState, "partial" | "populated" | "empty">;
  status: ProfileStatusView;
  error?: string | null;
}> = ({ state, status, error = null }) => {
  if (state === "loading") return <ProfilePbcLoading rows={5} />;
  if (state === "private" || state === "unavailable") {
    return <ProfilePbcUnavailable status={status} noun="Dungeons" error={error} />;
  }
  return <ProfilePbcEmpty>Dungeons have not been opened on this profile.</ProfilePbcEmpty>;
};

const duration = (milliseconds: number | null): string => {
  if (milliseconds === null) return "Unavailable";
  const whole = Math.max(0, Math.round(milliseconds));
  const minutes = Math.floor(whole / 60_000);
  const seconds = Math.floor((whole % 60_000) / 1_000).toString().padStart(2, "0");
  const centiseconds = Math.floor((whole % 1_000) / 10).toString().padStart(2, "0");
  return `${minutes}:${seconds}.${centiseconds}`;
};

const floorMetrics = (row: DungeonFloorRow): string => {
  const metrics: string[] = [];
  if (row.attempts !== null) metrics.push(`Attempts ${row.attempts.toLocaleString()}`);
  if (row.completions !== null) metrics.push(`Completions ${row.completions.toLocaleString()}`);
  if (row.bestTimeMs !== null) metrics.push(`Best time ${duration(row.bestTimeMs)}`);
  if (row.bestScore !== null) metrics.push(`Best score ${row.bestScore.toLocaleString()}`);
  if (row.mobsKilled !== null) metrics.push(`Mobs killed ${row.mobsKilled.toLocaleString()}`);
  if (row.mostMobsKilled !== null) metrics.push(`Most mobs killed ${row.mostMobsKilled.toLocaleString()}`);
  if (row.mostHealing !== null) metrics.push(`Most healing ${row.mostHealing.toLocaleString()}`);
  if (row.watcherKills !== null) metrics.push(`Watcher kills ${row.watcherKills.toLocaleString()}`);
  if (row.fastestTimeS !== null) metrics.push(`Fastest S ${duration(row.fastestTimeS)}`);
  if (row.fastestTimeSPlus !== null) metrics.push(`Fastest S+ ${duration(row.fastestTimeSPlus)}`);
  return metrics.length === 0 ? "Floor metrics unavailable" : metrics.join(" · ");
};

const floorSummary = (row: DungeonFloorRow): string => {
  if (row.completions !== null) return `${row.completions.toLocaleString()} complete`;
  if (row.attempts !== null) return `${row.attempts.toLocaleString()} attempts`;
  return "Recorded";
};

const FloorRecord: React.FC<{
  label: "Normal" | "Master";
  row: DungeonFloorRow | null;
  sourceAvailable: boolean;
}> = ({ label, row, sourceAvailable }) => (
  <div
    className={`profile-dungeons-floor-record profile-dungeons-floor-record--${label.toLowerCase()}${row ? "" : " is-empty"}`}
    title={row ? floorMetrics(row) : sourceAvailable ? `No ${label} record` : `${label} data unavailable`}
  >
    <header>
      <span>{label}</span>
      <strong>{row ? floorSummary(row) : sourceAvailable ? "No record" : "Unavailable"}</strong>
    </header>
    {row ? (
      <dl>
        <div><dt>Best</dt><dd className="profile-number">{row.bestTimeMs === null ? "—" : duration(row.bestTimeMs)}</dd></div>
        <div><dt>Score</dt><dd className="profile-number">{row.bestScore === null ? "—" : row.bestScore.toLocaleString()}</dd></div>
      </dl>
    ) : <span className="profile-dungeons-floor-empty">—</span>}
  </div>
);

const NumberRows: React.FC<{ rows: readonly { key: string; label: string; value: number | string }[]; empty: string }> = ({ rows, empty }) => rows.length === 0 ? (
  <p className="profile-rmd-field-state">{empty}</p>
) : (
  <div className="profile-dungeons-value-grid">
    {rows.map((row) => <div key={row.key}><span>{row.label}</span><strong className="profile-number">{typeof row.value === "number" ? compactProfileNumber(row.value) : row.value}</strong></div>)}
  </div>
);

const ClassRow: React.FC<{ row: DungeonClassRow }> = ({ row }) => (
  <div className="profile-dungeons-depth-row">
    <span><Shield aria-hidden /><strong>{row.label}</strong></span>
    <small>{row.level === null ? "Level unavailable" : `Level ${row.level.toLocaleString()}`}</small>
    <b className="profile-number">{row.experience === null ? "XP unavailable" : `${compactProfileNumber(row.experience)} XP`}</b>
  </div>
);

const RunRow: React.FC<{ row: DungeonRunRow }> = ({ row }) => (
  <div className="profile-dungeons-depth-row">
    <span><Clock3 aria-hidden /><strong>{row.label}</strong></span>
    <small>{row.detail ?? "Run detail unavailable"}</small>
    <b className="profile-number">{duration(row.timeMs)}</b>
  </div>
);

const RewardRow: React.FC<{ row: DungeonRewardRow }> = ({ row }) => (
  <div className="profile-dungeons-depth-row">
    <span><Award aria-hidden /><strong>{row.label}</strong></span>
    <small>{row.detail ?? "Reward detail unavailable"}</small>
    <b>{row.state}</b>
  </div>
);

const legacyGroups = (model: DungeonsPreviewModel): readonly DungeonFloorGroup[] => model.floorGroups ?? (model.floors.length > 0 ? [{
  key: "catacombs",
  label: "Normal",
  experience: model.catacombsExperience,
  highestFloor: model.highestFloor,
  completedRuns: null,
  floors: model.floors,
}] : []);

export const DungeonsPreview: React.FC<DungeonsPreviewProps> = ({ status, model, error = null }) => {
  const visibleState = resolveProfileSectionState(status, model.state);
  const groups = legacyGroups(model);
  const normal = groups.find((group) => group.key === "catacombs") ?? null;
  const master = groups.find((group) => group.key === "master_catacombs") ?? null;
  const floorKeys = [...new Set(groups.flatMap((group) => group.floors.map((floor) => floor.key)))].sort((left, right) => {
    const leftFloor = Number(left.match(/(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER);
    const rightFloor = Number(right.match(/(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER);
    return leftFloor - rightFloor || left.localeCompare(right);
  });
  const selectedClass = model.selectedClass === null ? null : model.classes.find((row) => row.key.toLowerCase() === model.selectedClass?.toLowerCase()) ?? null;
  const floorDetailCount = groups.reduce((total, group) => total + group.floors.length, 0);
  const hasDepth = floorDetailCount + model.classes.length + model.bestRuns.length + model.collection.length
    + model.rewards.length + model.essence.length + model.stats.length > 0;

  return (
    <section className="profile-rmd-preview profile-dungeons-preview" aria-label="Dungeons" data-profile-section-state={visibleState}>
      <section className="profile-rmd-shell profile-glass" aria-label="Dungeon progress">
        <ProfilePbcHeader eyebrow="Dungeons" title="Catacombs progress" count={null} countLabel="" />
        {visibleState !== "partial" && visibleState !== "populated" && visibleState !== "empty" ? (
          <StatePanel state={visibleState} status={status} error={error} />
        ) : visibleState === "empty" ? (
          <ProfilePbcEmpty>No Catacombs progress is recorded on this profile.</ProfilePbcEmpty>
        ) : (
          <div className="profile-rmd-content profile-dungeons-content">
            <ProfilePbcStatusLine status={status} partial={visibleState === "partial" || model.partial} />
            <div className="profile-dungeons-current">
              <section aria-labelledby="dungeons-cata-title">
                <header><strong id="dungeons-cata-title">Catacombs</strong></header>
                <dl>
                  <div><dt>Catacombs XP</dt><dd className="profile-number">{model.catacombsExperience === null ? "Unavailable" : compactProfileNumber(model.catacombsExperience)}</dd></div>
                  <div><dt>Highest Normal floor</dt><dd className="profile-number">{model.highestFloor === null ? "Unavailable" : model.highestFloor.toLocaleString()}</dd></div>
                  <div><dt>Secrets found</dt><dd className="profile-number">{model.secretsFound === null ? "Unavailable" : compactProfileNumber(model.secretsFound)}</dd></div>
                </dl>
              </section>
              <section aria-labelledby="dungeons-class-title">
                <header><strong id="dungeons-class-title">Selected class</strong></header>
                <div className="profile-dungeons-selected-class">
                  <Shield aria-hidden />
                  <strong>{selectedClass?.label ?? model.selectedClass ?? "Unavailable"}</strong>
                  <span>{selectedClass?.level === null || !selectedClass ? "Level unavailable" : `Level ${selectedClass.level.toLocaleString()}`}</span>
                  <b className="profile-number">{selectedClass?.experience === null || !selectedClass ? "XP unavailable" : `${compactProfileNumber(selectedClass.experience)} XP`}</b>
                </div>
              </section>
            </div>

            <section className="profile-dungeons-floors-section" aria-labelledby="dungeons-floors-title">
              <header>
                <div><strong id="dungeons-floors-title">Floors</strong><span>Normal and Master records</span></div>
                <div className="profile-dungeons-run-totals" aria-label="Recorded Dungeon runs">
                  {normal?.completedRuns !== null && normal?.completedRuns !== undefined && <span className="is-normal">Normal <b className="profile-number">{normal.completedRuns.toLocaleString()}</b></span>}
                  {master?.completedRuns !== null && master?.completedRuns !== undefined && <span className="is-master">Master <b className="profile-number">{master.completedRuns.toLocaleString()}</b></span>}
                </div>
              </header>
              {floorKeys.length === 0 ? (
                <p className="profile-rmd-field-state">No floor records are available.</p>
              ) : (
                <div className="profile-dungeons-floor-grid">
                  {floorKeys.map((key) => {
                    const normalFloor = normal?.floors.find((floor) => floor.key === key) ?? null;
                    const masterFloor = master?.floors.find((floor) => floor.key === key) ?? null;
                    const label = normalFloor?.label ?? masterFloor?.label ?? key;
                    return (
                      <article className="profile-dungeons-floor-card" key={key}>
                        <header><strong>{label}</strong></header>
                        <div>
                          <FloorRecord label="Normal" row={normalFloor} sourceAvailable={normal !== null} />
                          <FloorRecord label="Master" row={masterFloor} sourceAvailable={master !== null} />
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {hasDepth && <div className="profile-rmd-pages profile-dungeons-depth">
              {floorDetailCount > 0 && <ProfilePbcDisclosure storageId="dungeons-floor-details" title="Exact floor metrics" count={floorDetailCount} initiallyExpanded={false}>
                <div className="profile-dungeons-floor-details">
                  {groups.flatMap((group) => group.floors.map((row) => <div key={`${group.key}:${row.key}`}><strong>{group.label} {row.label}</strong><span>{floorMetrics(row)}</span></div>))}
                </div>
              </ProfilePbcDisclosure>}
              {model.classes.length > 0 && <ProfilePbcDisclosure storageId="dungeons-classes" title="Classes" count={model.classes.length} initiallyExpanded={false}>
                <div className="profile-dungeons-depth-grid">{model.classes.map((row) => <ClassRow key={row.key} row={row} />)}</div>
              </ProfilePbcDisclosure>}
              {model.bestRuns.length > 0 && <ProfilePbcDisclosure storageId="dungeons-best-runs" title="Personal bests" count={model.bestRuns.length} initiallyExpanded={false}>
                <div className="profile-dungeons-depth-grid">{model.bestRuns.map((row) => <RunRow key={row.key} row={row} />)}</div>
              </ProfilePbcDisclosure>}
              {model.collection.length > 0 && <ProfilePbcDisclosure storageId="dungeons-collection" title="Collection" count={model.collection.length} initiallyExpanded={false}>
                <NumberRows rows={model.collection} empty="No Dungeon collection records are available." />
              </ProfilePbcDisclosure>}
              {model.rewards.length > 0 && <ProfilePbcDisclosure storageId="dungeons-rewards" title="Rewards" count={model.rewards.length} initiallyExpanded={false}>
                <div className="profile-dungeons-depth-grid">{model.rewards.map((row) => <RewardRow key={row.key} row={row} />)}</div>
              </ProfilePbcDisclosure>}
              {model.essence.length > 0 && <ProfilePbcDisclosure storageId="dungeons-essence" title="Essence" count={model.essence.length} initiallyExpanded={false}>
                <NumberRows rows={model.essence} empty="No Dungeon essence records are available." />
              </ProfilePbcDisclosure>}
              {model.stats.length > 0 && <ProfilePbcDisclosure storageId="dungeons-stats" title="Additional Dungeon values" count={model.stats.length} initiallyExpanded={false}>
                <NumberRows rows={model.stats} empty="No additional Dungeon values are available." />
              </ProfilePbcDisclosure>}
            </div>}
          </div>
        )}
      </section>
    </section>
  );
};

export default DungeonsPreview;
