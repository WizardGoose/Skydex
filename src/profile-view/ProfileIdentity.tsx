import React from "react";
import type { SkyBlockProfileOption } from "../networth/useNetworth";
import { ItemIcon } from "../ui/ItemIcon";
import type { HypixelNetworkRank } from "./profileRank";
import { ProfileFreshness, ProfilePicker } from "./CharacterStage";
import { useCompactIdentity } from "./identityResponsive";

export interface ProfileIdentityProps {
  /** The verified player name, or the page's deliberate neutral fallback. */
  playerName: string;
  /** Omit until a verified Hypixel player payload has been received. */
  rank?: HypixelNetworkRank | null;
  /** UUID preferred by the shared compact player head. The name is the safe fallback. */
  playerUuid?: string | null;
  /** Optional override for the shared compact player head. */
  playerHead?: React.ReactNode;
  eyebrow?: React.ReactNode;
  title?: string;
  action?: React.ReactNode;
  detail?: React.ReactNode;
  profiles: readonly SkyBlockProfileOption[];
  selectedProfileId: string;
  gameMode: string;
  onProfileChange?: (profileId: string) => void;
  publicViewer?: boolean;
  showProfilePicker?: boolean;
  /** Utility pages keep their header visible when the mobile character is hidden. */
  mobileProfilePicker?: boolean;
  sourceStatus?: string | null;
  fetchedAt?: number | null;
  fallbackLabel?: string;
  trailing?: React.ReactNode;
  className?: string;
  detailRole?: "status" | "alert";
}

export const ProfileNetworkRankLabel: React.FC<{ rank: HypixelNetworkRank }> = ({ rank }) => {
  const plus = rank.label.endsWith("++")
    ? rank.label.slice(0, -2)
    : rank.label.endsWith("+")
      ? rank.label.slice(0, -1)
      : null;
  const suffix = plus === null ? null : rank.label.slice(plus.length);
  return (
    <span className="profile-network-rank" aria-label={`Hypixel rank ${rank.label}`}>
      {plus === null ? rank.label : plus}
      {suffix && (
        <span style={rank.plusColor ? { color: rank.plusColor } : undefined}>{suffix}</span>
      )}
    </span>
  );
};

/** One Profile-family identity surface shared by personal pages. */
export const ProfileIdentity: React.FC<ProfileIdentityProps> = ({
  playerName,
  rank,
  playerUuid,
  playerHead,
  eyebrow,
  title,
  action,
  detail,
  profiles,
  selectedProfileId,
  gameMode,
  onProfileChange,
  publicViewer = false,
  showProfilePicker = true,
  mobileProfilePicker = false,
  sourceStatus,
  fetchedAt = null,
  fallbackLabel,
  trailing,
  className = "",
  detailRole = "status",
}) => {
  const compactIdentity = useCompactIdentity();
  const safeName = playerName.trim() || "Player";
  const pickerProfiles = profiles.length > 0
    ? profiles
    : [{ id: selectedProfileId || "profile", name: "Profile", gameMode: null }];
  const heading = title ?? safeName;
  const playerHeadId = playerUuid?.trim() || safeName;
  const resolvedPlayerHead = playerHead ?? (
    <ItemIcon
      name={safeName}
      id={playerHeadId}
      src={`https://mc-heads.net/avatar/${encodeURIComponent(playerHeadId)}/96`}
      allowSemanticFallback={false}
      size={44}
      fallback="initials"
    />
  );

  return (
    <header className={`profile-identity profile-family-identity profile-glass${action ? " profile-identity--lookup" : ""} profile-identity--with-head${className ? ` ${className}` : ""}`}>
      <span className="profile-identity-player-head" aria-hidden>{resolvedPlayerHead}</span>
      <div className="profile-identity-copy">
        {eyebrow && <span className="profile-eyebrow">{eyebrow}</span>}
        {action ? (
          <div className="profile-identity-lookup">{action}</div>
        ) : (
          <h1>
            <span className="profile-network-name" style={rank ? { color: rank.color } : undefined}>{heading}</span>
            {rank && <span className="profile-network-rank-wrap" style={{ color: rank.color }}> <ProfileNetworkRankLabel rank={rank} /></span>}
          </h1>
        )}
        {detail && <p className="profile-identity-detail" role={detailRole}>{detail}</p>}
        {showProfilePicker && (!compactIdentity || mobileProfilePicker) && (
          <div className="profile-identity-profile">
            <span>Island profile</span>
            <ProfilePicker
              profiles={pickerProfiles}
              selectedValue={selectedProfileId || pickerProfiles[0].id}
              gameMode={gameMode}
              onChange={onProfileChange}
              publicViewer={publicViewer}
            />
          </div>
        )}
      </div>
      {(trailing || fetchedAt !== undefined) && (
        <div className="profile-identity-actions">
          {trailing}
          {fetchedAt !== undefined && (
            <ProfileFreshness
              fetchedAt={fetchedAt}
              fallbackLabel={fallbackLabel}
              sourceStatus={sourceStatus}
            />
          )}
        </div>
      )}
    </header>
  );
};
