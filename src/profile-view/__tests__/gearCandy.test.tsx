import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { profileStatusView } from "../../profile/profileStatus";
import type { ProfilePetView, ProfileViewModel } from "../../profile/profileViewModel";
import type { LiveProfileViewModel } from "../../profile/useLiveProfileViewModel";

/*
 * ItemTooltip keeps its card in a portal after interaction. The node test
 * environment has no DOM to focus or hover, so expose the same content inline
 * for this SSR regression test. The real Gear consumer and its metadata still
 * come from ProfileView.tsx.
 */
vi.mock("../../ui/ItemTooltip", async () => {
  const actual = await vi.importActual<typeof import("../../ui/ItemTooltip")>("../../ui/ItemTooltip");
  const InlineTooltip: React.FC<React.ComponentProps<typeof actual.ItemTooltip>> = ({ children, ...content }) => (
    <div data-test-tooltip>{children}<actual.ItemTooltipContent {...content} /></div>
  );
  return { ...actual, ItemTooltip: InlineTooltip };
});

/* Gear is the only Profile tab under test; avoid initializing the unrelated
 * managed-inventory store while ProfileView's module-level empty value loads. */
vi.mock("../../inventory", () => ({
  buildOwned: () => ({}),
  useOwned: () => ({}),
}));

import { ProfileSurface } from "../ProfileView";

const pet = (candyUsed: number | null): ProfilePetView => ({
  name: "Test Pet",
  wikiName: "Test Pet Pet",
  type: "TEST_PET",
  iconName: "Test Pet",
  iconId: "PET_TEST_PET",
  tier: "legendary",
  level: 100,
  xp: 1_000,
  xpMax: 1_000,
  xpPercent: 100,
  candyUsed,
  petType: null,
  skin: null,
  stats: [],
  abilities: [],
  heldItem: null,
});

const model = (candyUsed: number | null): ProfileViewModel => ({
  player: {
    name: "Test Player",
    uuid: "00000000000040008000000000000000",
    profileName: "Test Profile",
    gameMode: "Ironman",
    fetchedAt: 1,
  },
  skyblockLevel: null,
  skills: [],
  slayers: [],
  timecharms: { available: false, securedCount: 0, entries: [] },
  metrics: [],
  loadout: {
    id: null,
    name: "Current loadout",
    armour: [],
    equipment: [],
    armourSetName: null,
    armourBonuses: [],
    equipmentBonuses: [],
    contexts: [],
    tuning: [],
    pet: pet(candyUsed),
    resolved: true,
    inventoryAvailable: true,
    choices: [],
    armourWardrobe: { available: true, savedCount: 0, slots: [] },
    equipmentWardrobe: { available: true, savedCount: 0, slots: [] },
  },
});

const live = (view: ProfileViewModel): LiveProfileViewModel => ({
  scope: "personal",
  model: view,
  profile: {} as LiveProfileViewModel["profile"],
  networth: {} as LiveProfileViewModel["networth"],
  status: profileStatusView("ready", true),
  error: null,
  refresh: async () => undefined,
  profiles: [],
  selectedProfileId: null,
  selectProfile: () => undefined,
  skillMetadataStatus: "ready",
});

const renderGear = (candyUsed: number | null): string => renderToStaticMarkup(
  <MemoryRouter initialEntries={["/profile?tab=gear"]}>
    <ProfileSurface live={live(model(candyUsed))} />
  </MemoryRouter>,
);

describe("Gear pet candy rendering", () => {
  it("keeps missing candy usage unavailable in the visible facts and tooltip metadata", () => {
    const markup = renderGear(null);

    expect(markup).toMatch(/<small>Candy Used<\/small><strong[^>]*>Unavailable<\/strong>/);
    expect(markup).not.toContain("null / 10");
    expect(markup).not.toContain("NaN / 10");
    expect(markup).toMatch(/<span[^>]*>Candy used<\/span><span[^>]*>Unavailable<\/span>/);
  });

  it("keeps an explicit zero visible in the facts and tooltip metadata", () => {
    const markup = renderGear(0);

    expect(markup).toMatch(/<small>Candy Used<\/small><strong[^>]*>0 \/ 10<\/strong>/);
    expect(markup).not.toContain("Unavailable</strong>");
    expect(markup).toMatch(/<span[^>]*>Candy used<\/span><span[^>]*>0 \/ 10<\/span>/);
  });
});
