import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

describe("shared player identity artwork", () => {
  it("renders a constrained player head in every shared title bar", () => {
    const identity = read("src/profile-view/ProfileIdentity.tsx");
    expect(identity).toContain("playerUuid?: string | null");
    expect(identity).toContain("const resolvedPlayerHead = playerHead ?? (");
    expect(identity).toContain("https://mc-heads.net/avatar/");
    expect(identity).toContain("profile-identity-player-head");

    for (const path of [
      "src/profile-view/ProfileView.tsx",
      "src/pages/ItemsPage.tsx",
      "src/pages/StoragePage.tsx",
      "src/greenhouse/GreenhouseShell.tsx",
    ]) {
      expect(read(path)).toContain("playerUuid=");
    }
  });

  it("loads the compact mobile head as the first image source", () => {
    const stage = read("src/profile-view/CharacterStage.tsx");
    expect(stage).toContain('src={`https://mc-heads.net/avatar/${encodeURIComponent(player.uuid)}/96`}');
    expect(stage).toContain("allowSemanticFallback={false}");
    expect(stage).not.toContain('lateSrc={`https://mc-heads.net/avatar/${player.uuid}/96`}');
  });
});
