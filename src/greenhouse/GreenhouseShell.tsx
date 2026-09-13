import React, { useEffect, useMemo } from "react";
import { Outlet } from "react-router-dom";
import { useApiAccess } from "../island/apiKey";
import { useIsland } from "../island/useIsland";
import { useParsedProfile } from "../networth/useNetworth";
import { CharacterStage } from "../profile-view/CharacterStage";
import { ProfileIdentity } from "../profile-view/ProfileIdentity";
import { GreenhouseDataProvider, GridStateProvider, LockedPlacementsProvider, DesignerProvider, InfoModalProvider } from "./context";
import { ToastProvider } from "./components/ui";
import { CropMutationInfoModal } from "./components/calculator/CropMutationInfoModal";
import { usePreloadGroundImages } from "./hooks";
import "../profile-view/profile.css";
import "./greenhouse-shell.css";
import "../profile-view/utility-workspace.css";

/**
 * Hosts the ported greenhouse app inside Skydex's shared layout.
 *
 * The greenhouse module was originally its own single-page app, so it brings
 * its own provider stack and its own toast context. Everything it needs is
 * mounted here and nowhere else: the rest of Skydex is unaffected, and the
 * providers only initialise when a /greenhouse route is active.
 *
 * The frame below is the one visible thing this file owns. It gives the
 * section the same column and vertical rhythm every other page uses, so the
 * greenhouse reads as part of the site rather than as a guest inside it.
 */
const GreenhouseRoutes: React.FC = () => {
  usePreloadGroundImages();
  const { snapshot } = useIsland();
  const parsedProfile = useParsedProfile();
  const { access, setProfileId } = useApiAccess();

  useEffect(() => {
    document.documentElement.classList.add("sd-channel");
    return () => document.documentElement.classList.remove("sd-channel");
  }, []);

  const characterPlayer = useMemo(() => {
    const uuid = parsedProfile.playerUuid || snapshot?.player.uuid || access.uuid;
    if (!uuid) return null;
    return {
      name: parsedProfile.playerName || snapshot?.player.name || access.name || "Player",
      uuid,
      profileName: parsedProfile.profileName || snapshot?.profile.name || "Profile",
      gameMode: parsedProfile.gameMode ?? snapshot?.profile.gameMode ?? "Normal",
      fetchedAt: parsedProfile.fetchedAt ?? snapshot?.exportedAt ?? 0,
    };
  }, [
    access.name,
    access.uuid,
    parsedProfile.fetchedAt,
    parsedProfile.gameMode,
    parsedProfile.playerName,
    parsedProfile.playerUuid,
    parsedProfile.profileName,
    snapshot,
  ]);

  const characterProfiles = useMemo(() => {
    if (parsedProfile.profileOptions.length > 0) return parsedProfile.profileOptions;
    if (!characterPlayer) return [];
    return [{
      id: parsedProfile.profileId ?? access.profileId ?? characterPlayer.profileName,
      name: characterPlayer.profileName,
      gameMode: parsedProfile.gameMode ?? snapshot?.profile.gameMode ?? null,
    }];
  }, [
    access.profileId,
    characterPlayer,
    parsedProfile.gameMode,
    parsedProfile.profileId,
    parsedProfile.profileOptions,
    snapshot?.profile.gameMode,
  ]);

  const selectedCharacterProfile = parsedProfile.profileId ?? access.profileId ?? characterProfiles[0]?.id ?? "profile";

  return (
    <div className="profile-view-root profile-view-root--frosted greenhouse-view-root">
      <div className="profile-shell greenhouse-profile-shell">
        {characterPlayer ? (
          <CharacterStage
            player={characterPlayer}
            profiles={characterProfiles}
            selectedProfileId={selectedCharacterProfile}
            onProfileChange={setProfileId}
            showProfilePicker={false}
          />
        ) : (
          <aside className="profile-character-stage" aria-label="Character preview" />
        )}

        <main className="profile-workspace greenhouse-profile-workspace">
          <div className="greenhouse-routes w-full min-w-0">
            <ProfileIdentity
              mobileProfilePicker
              playerName={characterPlayer?.name ?? access.name ?? "Player"}
              playerUuid={characterPlayer?.uuid ?? parsedProfile.playerUuid ?? access.uuid}
              profiles={characterProfiles}
              selectedProfileId={selectedCharacterProfile}
              gameMode={characterPlayer?.gameMode ?? "Normal"}
              onProfileChange={setProfileId}
              fetchedAt={characterPlayer?.fetchedAt ?? parsedProfile.fetchedAt}
              sourceStatus={parsedProfile.profileStatus.label}
            />
            <Outlet />
            <CropMutationInfoModal />
          </div>
        </main>
      </div>
    </div>
  );
};

// ToastProvider must sit outermost: LockedPlacementsProvider (and the grid
// placement hooks) call useToast during their own initialisation.
export const GreenhouseShell: React.FC = () => (
  <ToastProvider>
    <GreenhouseDataProvider>
      <GridStateProvider>
        <LockedPlacementsProvider>
          <DesignerProvider>
            <InfoModalProvider>
              <GreenhouseRoutes />
            </InfoModalProvider>
          </DesignerProvider>
        </LockedPlacementsProvider>
      </GridStateProvider>
    </GreenhouseDataProvider>
  </ToastProvider>
);

export default GreenhouseShell;
