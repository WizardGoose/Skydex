import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ProfileLookupForm } from "../profile/ProfileLookupForm";
import { usePublicProfileViewModel } from "../profile/usePublicProfileViewModel";
import { ProfileSurface } from "../profile-view/ProfileView";

const viewerPath = (player: string): string => `/pv/${encodeURIComponent(player.trim())}`;

export const ProfileViewerPage: React.FC = () => {
  const navigate = useNavigate();
  const { player = "" } = useParams<{ player: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const profileId = searchParams.get("profile");
  const [draftPlayer, setDraftPlayer] = useState(player);

  useEffect(() => setDraftPlayer(player), [player]);

  const selectProfile = useCallback((nextProfileId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("profile", nextProfileId);
    setSearchParams(next, { replace: false });
  }, [searchParams, setSearchParams]);

  const live = usePublicProfileViewModel(player, profileId, selectProfile);
  const openPlayer = (nextPlayer: string) => navigate(viewerPath(nextPlayer));
  const lookup = (
    <ProfileLookupForm
      initialValue={player}
      value={draftPlayer}
      compact={Boolean(player)}
      iconOnly
      onValueChange={setDraftPlayer}
      onSubmit={openPlayer}
    />
  );

  return (
    <ProfileSurface
      live={live}
      emptyTitle={!player ? "Profile Viewer" : live.status.showError ? "Profile could not load" : `Looking up ${player}`}
      emptyDetail={!player ? "Search a Minecraft player to view the SkyBlock profiles they share." : live.error ?? undefined}
      action={lookup}
      previewPlayer={draftPlayer}
      forcePreview={draftPlayer.trim().toLowerCase() !== player.trim().toLowerCase()}
    />
  );
};

export default ProfileViewerPage;
