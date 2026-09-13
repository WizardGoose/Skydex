import { afterEach, describe, expect, it, vi } from "vitest";

const WIKITEXT = `
{| class="wikitable"
{{Slot|Lonelily}} | [[Lonelily]] | {{Common}} | 25
{{Plainlist|
* '''Size:''' 1x1
* '''Growth Surface:''' {{ID|Farmland}}
* '''Spreading Conditions:''' {{RD|4x Wild Rose}}
}}
|}
`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Greenhouse wiki refresh transport", () => {
  it("fetches the wiki directly even when an optional companion-health probe would fail", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/health")) return Promise.reject(new Error("companion unavailable"));
      return Promise.resolve(
        new Response(JSON.stringify({ parse: { wikitext: WIKITEXT } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchWikiMutations } = await import("../wikiSync");
    const snapshot = await fetchWikiMutations(new Map());

    expect(snapshot.mutations.lonelily.name).toBe("Lonelily");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("hypixelskyblock.minecraft.wiki/api.php");
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("/v1/health");
  });

  it("preserves Cloudflare challenge as a blocked live refresh, not an unavailable dataset", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("challenge", { status: 403, headers: { "Cf-Mitigated": "challenge" } })))
    );

    const { fetchWikiMutations } = await import("../wikiSync");

    await expect(fetchWikiMutations(new Map())).rejects.toThrow("Live wiki refresh blocked by Cloudflare challenge");
  });
});
