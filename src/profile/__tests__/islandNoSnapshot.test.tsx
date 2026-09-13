import { renderToPipeableStream, renderToStaticMarkup } from "react-dom/server";
import { PassThrough } from "node:stream";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IslandPage } from "../../pages/IslandPage";
import { sectionTabNavigationIndex } from "../../pages/sectionTabs";
import { PROFILE_TAB_STORAGE_KEY, PROFILE_TAB_TTL_MS } from "../profileTabs";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const renderRoute = (route: string): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[route]}>
      <IslandPage />
    </MemoryRouter>
  );

const renderRouteAsync = (route: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on("data", (chunk: Buffer) => chunks.push(chunk));
    output.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    const stream = renderToPipeableStream(
      <MemoryRouter initialEntries={[route]}>
        <IslandPage />
      </MemoryRouter>,
      {
        onAllReady: () => stream.pipe(output),
        onError: reject,
      },
    );
  });

describe("IslandPage no-snapshot Profile routing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T18:00:00.000Z"));
    vi.stubGlobal("sessionStorage", new MemoryStorage());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each(["gear", "pets", "inventory", "networth", "network"])(
    "renders the explicit unavailable Profile state for ?tab=%s",
    (tab) => {
      const markup = renderRoute(`/island?tab=${tab}`);

      expect(markup).toContain("Profile data unavailable");
      expect(markup).toContain("Connect your Minecraft profile in Settings");
      expect(markup).toContain("/settings#hypixel");
      expect(markup).not.toContain("Island Storage");
    }
  );

  it("keeps the bare route on island-code onboarding and honors the five-minute remembered tab window", () => {
    const session = new MemoryStorage();
    vi.stubGlobal("sessionStorage", session);

    expect(renderRoute("/island")).toContain("Paste an island code");

    session.setItem(
      PROFILE_TAB_STORAGE_KEY,
      JSON.stringify({ tab: "inventory", selectedAt: Date.now() })
    );
    expect(renderRoute("/island")).toContain("Profile data unavailable");

    vi.advanceTimersByTime(PROFILE_TAB_TTL_MS);
    const expired = renderRoute("/island");
    expect(expired).toContain("Paste an island code");
    expect(expired).toContain("Island Storage");
  });
  it("labels Minions with the Profile Inventory Sacks-style category board", async () => {
    const markup = await renderRouteAsync("/island?tab=minions");
    expect(markup).toContain('aria-labelledby="profile-minions-title"');
    expect(markup).toContain('data-minion-category-board="true"');
    expect(markup).toContain('data-minion-category-grid="true"');
    expect(markup).toContain('data-fixed-card-board="true"');
    expect(markup).toContain('data-minion-family-rows="true"');
    expect(markup).not.toContain('data-minion-selector-rail="true"');
    expect(markup).not.toContain('role="tablist" aria-label="Minion families"');
  });
  it("keeps Minion categories closed by default and opens the selected category", async () => {
    const closed = await renderRouteAsync("/island?tab=minions");
    const closedGrid = closed.slice(closed.indexOf('data-minion-category-grid="true"'));
    expect(closedGrid.match(/aria-expanded="true"/g) ?? []).toHaveLength(0);

    const selected = await renderRouteAsync("/island?tab=minions&minion=wheat");
    const selectedGridStart = selected.indexOf('data-minion-category-grid="true"');
    const selectedDetailStart = selected.indexOf('data-minion-detail-sheet="true"');
    const selectedGrid = selected.slice(selectedGridStart, selectedDetailStart);
    expect(selectedGrid.match(/aria-expanded="true"/g) ?? []).toHaveLength(1);
  });

  it("keeps one selected family detail sheet below the category board", async () => {
    const markup = await renderRouteAsync("/island?tab=minions&minion=wheat");
    expect(markup).toContain('data-minion-detail-sheet="true"');
    expect(markup).toContain('data-minion-detail-header="true"');
    expect(markup).toContain('id="minion-detail-heading"');
    expect(markup).toContain('data-minion-family-id="wheat"');
    expect(markup).not.toContain('data-minion-selector-rail="true"');
  });
  it("gives SectionTabs one tab stop and the expected tablist semantics", () => {
    const markup = renderRoute("/island?tab=gear");
    const tabStart = markup.indexOf('role="tablist"');
    const tabEnd = markup.indexOf("</div>", tabStart);
    const tabMarkup = markup.slice(tabStart, tabEnd);
    expect(tabMarkup).toContain('aria-label="Profile sections"');
    expect((tabMarkup.match(/role="tab"/g) ?? [])).toHaveLength(6);
    expect((tabMarkup.match(/tabindex="0"/g) ?? [])).toHaveLength(1);
    expect((tabMarkup.match(/tabindex="-1"/g) ?? [])).toHaveLength(5);
  });

  it("moves SectionTabs horizontally and handles Home/End", () => {
    expect(sectionTabNavigationIndex("ArrowRight", 0, 3)).toBe(1);
    expect(sectionTabNavigationIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(sectionTabNavigationIndex("Home", 2, 3)).toBe(0);
    expect(sectionTabNavigationIndex("End", 0, 3)).toBe(2);
    expect(sectionTabNavigationIndex("PageDown", 0, 3)).toBeNull();
    expect(sectionTabNavigationIndex("ArrowRight", 0, 0)).toBeNull();
  });
});
