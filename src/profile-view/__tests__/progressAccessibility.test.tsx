import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { profileStatusView } from "../../profile/profileStatus";
import type { ProfileViewModel } from "../../profile/profileViewModel";
import type { LiveProfileViewModel } from "../../profile/useLiveProfileViewModel";
import { ProfileSurface } from "../ProfileView";

const model = (): ProfileViewModel => ({
  player: {
    name: "Test Player",
    uuid: "00000000000040008000000000000000",
    profileName: "Test Profile",
    gameMode: "Normal",
    fetchedAt: 1,
  },
  skyblockLevel: {
    key: "SKYBLOCK_LEVEL",
    name: "SkyBlock Level",
    wikiName: "SkyBlock Levels",
    level: 0,
    progress: 0,
    figure: "0 / 100 XP",
    icon: "Experience Bottle",
    maxed: false,
    locked: false,
  },
  skills: [{
    key: "FARMING",
    name: "Farming",
    wikiName: "Farming",
    level: 0,
    progress: 0,
    figure: "0 / 50 XP",
    icon: "Golden Hoe",
    maxed: false,
    locked: false,
  }],
  slayers: [],
  timecharms: { available: false, securedCount: 0, entries: [] },
  metrics: [],
  loadout: {
    id: null,
    name: null,
    resolved: false,
    inventoryAvailable: true,
    armour: [],
    equipment: [],
    armourSetName: null,
    armourBonuses: [],
    equipmentBonuses: [],
    contexts: [],
    tuning: [],
    pet: null,
    choices: [],
    armourWardrobe: { available: true, savedCount: 0, slots: [] },
    equipmentWardrobe: { available: true, savedCount: 0, slots: [] },
  },
});

const live = (view: ProfileViewModel | null): LiveProfileViewModel => ({
  scope: "personal",
  model: view,
  profile: {} as LiveProfileViewModel["profile"],
  networth: {} as LiveProfileViewModel["networth"],
  status: profileStatusView(view ? "ready" : "needsKey", Boolean(view)),
  error: null,
  refresh: async () => undefined,
  profiles: [],
  selectedProfileId: null,
  selectProfile: () => undefined,
  skillMetadataStatus: "ready",
});

const render = (view: ProfileViewModel | null): string => renderToStaticMarkup(
  <MemoryRouter initialEntries={["/profile?tab=gear"]}>
    <ProfileSurface live={live(view)} />
  </MemoryRouter>,
);

describe("profile progress accessibility", () => {
  it("keeps preview tracks visible without claiming unknown progress is zero", () => {
    const markup = render(null);
    const farmingTrack = markup.match(/<span class="profile-skill-progress "[^>]*aria-label="Farming progress unavailable"[^>]*>/)?.[0];

    expect(farmingTrack).toBeDefined();
    expect(farmingTrack).not.toContain("aria-valuenow");
  });

  it("keeps a real zero as a known progress value", () => {
    const markup = render(model());
    const farmingTrack = markup.match(/<span class="profile-skill-progress "[^>]*aria-label="Farming progress 0%"[^>]*>/)?.[0];

    expect(farmingTrack).toContain('aria-valuenow="0"');
  });
});
