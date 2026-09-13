import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("public Profile Viewer boundary", () => {
  it("loads through a route-scoped reader that cannot change personal account settings", () => {
    const source = read("src/profile/usePublicProfileViewModel.ts");

    expect(source).toContain("loadProfileSources");
    expect(source).toContain('scope: "public"');
    expect(source).not.toMatch(/from ["']\.\.\/island\/apiKey["']/);
    expect(source).not.toMatch(/\buseApiAccess\s*\(/);
    expect(source).not.toMatch(/\blocalStorage\./);
    expect(source).not.toMatch(/\bsessionStorage\./);
  });

  it("does not merge the visitor's mod holdings into another player's profile", () => {
    const source = read("src/profile-view/ProfileView.tsx");
    const accessories = read("src/profile-view/AccessoriesPreview.tsx");

    expect(source).toContain('live.scope === "public"');
    expect(source).toContain("owned={EMPTY_OWNED}");
    expect(source).toContain("owned={null}");
    expect(source).toContain("chestProvenance={null}");
    expect(source).toContain("chestProvenance={NO_CHEST_PROVENANCE}");
    expect(source).toContain('publicProfile={live.scope === "public"}');
    expect(accessories).toContain("{ isolatedProfile: publicProfile }");
    expect(accessories).toContain("if (!publicProfile) void refreshOwned()");
  });

  it("gives PV profile choices game-mode icons and a private-API warning", () => {
    const characterStage = read("src/profile-view/CharacterStage.tsx");
    const sources = read("src/networth/useNetworth.ts");

    expect(characterStage).toContain("publicViewer ? selectedProfile.gameMode : gameMode");
    expect(characterStage).toContain("<ProfileApiWarning />");
    expect(characterStage).toContain("inventory API data private");
    expect(sources).toContain("inventoryApiEnabled: inventoryApiEnabled(candidate.member)");
  });

  it("routes Profile to the production Profile surface with no preview launcher", () => {
    const app = read("src/App.tsx");
    const layout = read("src/components/layout/Layout.tsx");
    const profileView = read("src/profile-view/ProfileView.tsx");
    const characterStage = read("src/profile-view/CharacterStage.tsx");
    const viewer = read("src/pages/ProfileViewerPage.tsx");

    expect(app).toContain('import("./profile-view/ProfileView")');
    expect(app).toContain('path: "profile"');
    expect(app).toContain('path: "pv/:player"');
    expect(layout).not.toContain("DevMarkup");
    expect(layout).not.toContain("Profile revamp");
    expect(profileView).toContain('aria-label="Profile mode"');
    expect(profileView).toContain('to="/profile"');
    expect(profileView).toContain('to="/pv"');
    expect(profileView).not.toContain('className="profile-workspace-frost"');
    expect(profileView).not.toContain("profile-source-state");
    expect(profileView).toContain("profilePreviewModel");
    expect(viewer).not.toContain("profile-viewer-card");
    expect(viewer).toContain("previewPlayer={draftPlayer}");
    expect(viewer).toContain("onValueChange={setDraftPlayer}");
    expect(characterStage).toContain("previewName && !headFailed ? (");
    expect(characterStage).not.toContain('"Player head preview"');
  });
});
