import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  Anchor,
  Check,
  ChevronDown,
  CircleUserRound,
  Grid3x3,
  Shield,
} from "lucide-react";
import type { SkyBlockProfileOption } from "../networth/useNetworth";
import type { ProfileViewModel } from "../profile/profileViewModel";
import { ItemIcon } from "../ui/ItemIcon";
import type { HypixelNetworkRank } from "./profileRank";
import { ProfileNetworkRankLabel } from "./ProfileIdentity";
import { useCompactIdentity } from "./identityResponsive";

const PlayerModel = lazy(() => import("../island/PlayerModel").then((module) => ({
  default: module.PlayerModel,
})));

const freshnessLabel = (fetchedAt: number): string => {
  const age = Math.max(0, Date.now() - fetchedAt);
  if (age < 60_000) return "just now";
  if (age < 3_600_000) return `${Math.floor(age / 60_000)}m ago`;
  if (age < 86_400_000) return `${Math.floor(age / 3_600_000)}h ago`;
  return `${Math.floor(age / 86_400_000)}d ago`;
};

const CharacterModelStandby: React.FC = () => (
  <div className="profile-character-model" aria-hidden />
);

const ProfileModeGlyph: React.FC<{ gameMode: string | null }> = ({ gameMode }) => {
  const normalizedMode = gameMode?.toLowerCase() ?? "normal";
  const Icon = normalizedMode === "ironman"
    ? Shield
    : normalizedMode === "stranded"
      ? Anchor
      : normalizedMode === "bingo"
        ? Grid3x3
        : CircleUserRound;
  const label = normalizedMode === "normal"
    ? "Normal"
    : normalizedMode.charAt(0).toUpperCase() + normalizedMode.slice(1);

  return (
    <span
      className={`profile-mode-icon profile-mode-icon--${normalizedMode}`}
      role="img"
      aria-label={`${label} profile`}
      title={`${label} profile`}
    >
      <Icon aria-hidden />
    </span>
  );
};

const ProfileApiWarning: React.FC = () => (
  <span
    className="profile-picker-api-warning"
    role="img"
    aria-label="Inventory API data is private"
    title="This profile is not sharing inventory API data."
  >
    <AlertTriangle aria-hidden />
  </span>
);

export const ProfilePicker: React.FC<{
  profiles: readonly SkyBlockProfileOption[];
  selectedValue: string;
  gameMode: string;
  onChange?: (profileId: string) => void;
  publicViewer?: boolean;
}> = ({ profiles, selectedValue, gameMode, onChange, publicViewer = false }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedProfile = profiles.find((profile) => profile.id === selectedValue) ?? profiles[0];
  const canChange = Boolean(onChange && profiles.length > 1);
  const selectedApiPrivate = publicViewer && selectedProfile.inventoryApiEnabled === false;

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className={`profile-picker ${open ? "is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="profile-picker-trigger"
        aria-label={`SkyBlock profile: ${selectedProfile.name}${selectedApiPrivate ? ", inventory API data private" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={!canChange}
        onClick={() => canChange && setOpen((current) => !current)}
      >
        {(publicViewer || gameMode !== "Normal") && (
          <ProfileModeGlyph gameMode={publicViewer ? selectedProfile.gameMode : gameMode} />
        )}
        <span className="profile-picker-name">{selectedProfile.name}</span>
        {selectedApiPrivate && <ProfileApiWarning />}
        {canChange && <ChevronDown className="profile-picker-chevron" aria-hidden />}
      </button>

      {open && (
        <div className="profile-picker-menu" role="listbox" aria-label="SkyBlock profiles">
          {profiles.map((profile) => {
            const selected = profile.id === selectedValue;
            return (
              <button
                type="button"
                role="option"
                aria-selected={selected}
                className={selected ? "is-selected" : ""}
                onClick={() => {
                  setOpen(false);
                  if (!selected) onChange?.(profile.id);
                }}
                key={profile.id}
              >
                <span className="profile-picker-option-copy">
                  <ProfileModeGlyph gameMode={profile.gameMode} />
                  <span>{profile.name}</span>
                </span>
                {(publicViewer && profile.inventoryApiEnabled === false) || selected ? (
                  <span className="profile-picker-option-state">
                    {publicViewer && profile.inventoryApiEnabled === false && <ProfileApiWarning />}
                    {selected && <Check aria-hidden />}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const ProfileFreshness: React.FC<{
  fetchedAt: number | null;
  fallbackLabel?: string;
  sourceStatus?: string | null;
  className?: string;
}> = ({ fetchedAt, fallbackLabel = "Not loaded", sourceStatus, className = "" }) => (
  <div className={`profile-freshness${className ? ` ${className}` : ""}`}>
    <span>API <strong>{fetchedAt === null || !Number.isFinite(fetchedAt) || fetchedAt <= 0 ? fallbackLabel : freshnessLabel(fetchedAt)}</strong></span>
    {sourceStatus && <span>{sourceStatus}</span>}
  </div>
);

const CharacterStageComponent: React.FC<{
  player: ProfileViewModel["player"];
  sourceStatus?: string | null;
  profiles: readonly SkyBlockProfileOption[];
  selectedProfileId: string;
  onProfileChange?: (profileId: string) => void;
  publicViewer?: boolean;
  previewPlayer?: string;
  previewApiLabel?: string;
  showProfilePicker?: boolean;
  rank?: HypixelNetworkRank | null;
}> = ({
  player,
  sourceStatus,
  profiles,
  selectedProfileId,
  onProfileChange,
  publicViewer = false,
  previewPlayer,
  previewApiLabel,
  showProfilePicker = true,
  rank = null,
}) => {
  const reducedMotion = useReducedMotion();
  const compactIdentity = useCompactIdentity();
  const [headFailed, setHeadFailed] = useState(false);
  const [modelUuid, setModelUuid] = useState<string | null>(null);
  const previewName = previewPlayer?.trim() ?? "";

  useEffect(() => setHeadFailed(false), [previewName]);

  useEffect(() => {
    if (previewPlayer !== undefined) return;
    let cancelled = false;
    let idleHandle: number | null = null;
    const reveal = () => {
      if (!cancelled) setModelUuid(player.uuid);
    };

    const idleApi = window as unknown as {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    // Yield to the route commit without imposing a fixed wait on every visit.
    const delayHandle = typeof idleApi.requestIdleCallback === "function"
      ? null
      : window.setTimeout(reveal, 0);
    if (typeof idleApi.requestIdleCallback === "function") {
      idleHandle = idleApi.requestIdleCallback(reveal, { timeout: 250 });
    }

    return () => {
      cancelled = true;
      if (delayHandle !== null) window.clearTimeout(delayHandle);
      if (idleHandle !== null) idleApi.cancelIdleCallback?.(idleHandle);
    };
  }, [player.uuid, previewPlayer]);

  return (
    <aside
      className="profile-character-stage"
      aria-label={`${player.name} character preview`}
    >
      <div className="profile-character-halo" aria-hidden />
      {previewPlayer !== undefined ? (
        previewName && !headFailed ? (
          <div className="profile-character-head-preview">
            <span
              className="profile-character-head-frame"
              aria-label={`${previewName} head preview`}
            >
              <img
                src={`https://mc-heads.net/avatar/${encodeURIComponent(previewName)}/192`}
                alt=""
                width={192}
                height={192}
                referrerPolicy="no-referrer"
                onError={() => setHeadFailed(true)}
              />
            </span>
          </div>
        ) : null
      ) : modelUuid === player.uuid ? (
        <Suspense fallback={<CharacterModelStandby />}>
          <PlayerModel uuid={player.uuid} className="profile-character-model" animate={!reducedMotion} />
        </Suspense>
      ) : (
        <CharacterModelStandby />
      )}
      <div className="profile-character-caption">
        {previewPlayer === undefined ? (
          <span className="profile-avatar">
            <ItemIcon
              name={player.name}
              id={player.uuid}
              src={`https://mc-heads.net/avatar/${encodeURIComponent(player.uuid)}/96`}
              allowSemanticFallback={false}
              size={48}
              fallback="initials"
            />
          </span>
        ) : previewName && !headFailed ? (
          <span className="profile-avatar">
            <img
              src={`https://mc-heads.net/avatar/${encodeURIComponent(previewName)}/96`}
              alt=""
              width={48}
              height={48}
              referrerPolicy="no-referrer"
              onError={() => setHeadFailed(true)}
            />
          </span>
        ) : null}
        <div className="profile-character-caption-copy">
          <small>{previewPlayer !== undefined ? (publicViewer ? "Profile viewer" : "Connected profile") : "Island profile"}</small>
          <strong
            className="profile-character-caption-name"
            style={previewPlayer === undefined && rank ? { color: rank.color } : undefined}
          >
            {previewPlayer !== undefined ? previewName || "Player" : player.name}
            {previewPlayer === undefined && rank && (
              <span className="profile-character-caption-rank" style={{ color: rank.color }}>
                <ProfileNetworkRankLabel rank={rank} />
              </span>
            )}
          </strong>
          {previewPlayer === undefined && showProfilePicker && compactIdentity && (
            <ProfilePicker
              profiles={profiles}
              selectedValue={selectedProfileId}
              gameMode={player.gameMode}
              onChange={onProfileChange}
              publicViewer={publicViewer}
            />
          )}
        </div>
        <ProfileFreshness
          fetchedAt={previewPlayer !== undefined ? null : player.fetchedAt}
          fallbackLabel={previewApiLabel}
          sourceStatus={sourceStatus}
          className="profile-character-caption-freshness"
        />
      </div>
    </aside>
  );
};

export const CharacterStage = React.memo(CharacterStageComponent);
