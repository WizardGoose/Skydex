import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const settings = readFileSync(resolve(process.cwd(), "src/pages/SiteSettingsPage.tsx"), "utf8");
const hypixel = readFileSync(resolve(process.cwd(), "src/island/HypixelPanel.tsx"), "utf8");
const overlay = readFileSync(resolve(process.cwd(), "src/components/layout/SettingsOverlay.tsx"), "utf8");

describe("continuous settings layout", () => {
  it("keeps every settings section in one ordered document", () => {
    const general = settings.indexOf('id="settings-panel-general"');
    const shards = settings.indexOf('id="settings-panel-shards"');
    const appearance = settings.indexOf('id="settings-panel-appearance"');
    const connections = settings.indexOf('id="settings-panel-connections"');

    expect(general).toBeGreaterThan(-1);
    expect(shards).toBeGreaterThan(general);
    expect(appearance).toBeGreaterThan(shards);
    expect(connections).toBeGreaterThan(appearance);
    expect(settings).not.toContain('activeSection === "general"');
    expect(settings).not.toContain('activeSection === "shards"');
    expect(settings).not.toContain('activeSection === "appearance"');
    expect(settings).not.toContain('activeSection === "connections"');
  });

  it("puts the existing account control before every preference", () => {
    expect(settings.indexOf("<HypixelPanel />")).toBeLessThan(settings.indexOf('title="Profile preferences"'));
    expect(hypixel.indexOf("Minecraft username or UUID")).toBeLessThan(
      hypixel.indexOf("Connect your Minecraft account to load"),
    );
  });

  it("uses only the settings content column for jump links and manual scrolling", () => {
    expect(settings).toContain("const contentRef = useRef<HTMLDivElement | null>(null)");
    expect(settings).toContain('<div ref={contentRef} className="profile-settings-content">');
    expect(settings).toContain("const scrollRoot = contentRef.current");
    expect(settings).toContain('scrollRoot.scrollTo({ top: Math.max(0, top), behavior })');
    expect(settings).toContain('scrollRoot.addEventListener("scroll", updateActiveSection');
    expect(settings).not.toContain("scrollIntoView(");
    expect(overlay).toContain('className="settings-shell-body relative flex min-h-0 flex-1 overflow-hidden"');
    expect(overlay).not.toContain("flex-1 overflow-y-auto overscroll-contain");
  });
});
