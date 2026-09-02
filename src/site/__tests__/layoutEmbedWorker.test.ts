import { describe, expect, it } from "vitest";
import {
  buildLayoutOembed,
  buildLayoutPreviewDocument,
  buildLayoutShareDocument,
  decodeSharedLayout,
  handleLayoutEmbedRequest,
  layoutShareRoute,
} from "../../../cloudflare/layout-embed-worker.js";
import { encodeSharedDesign } from "../../greenhouse/utilities/designEncoding";

const SOGGY_FIELD_CODE = "y9YxqTE0qdEjHiQ6JmGwiAIA";
const DELAYED_SOGGYBUDS_CODE =
  "KzOqcUnNSaxMTVE1MgjOT0-vTCpNKa4x1jGpMTTRya7RIwiSYAwnRygz0ckRUxYPAAA";
const SOGGY_INPUTS = [
  { cropId: "gloomgourd", position: [4, 3] as [number, number] },
  { cropId: "melon", position: [4, 5] as [number, number] },
  { cropId: "gloomgourd", position: [5, 3] as [number, number] },
  { cropId: "melon", position: [5, 5] as [number, number] },
];
const SOGGY_TARGETS = [
  { cropId: "soggybud", position: [4, 4] as [number, number] },
  { cropId: "soggybud", position: [5, 4] as [number, number] },
];
const DATASET = {
  crops: {
    melon: { name: "Melon", size: 1, ground: "farmland" },
    pumpkin: { name: "Pumpkin", size: 1, ground: "farmland" },
  },
  mutations: {
    gloomgourd: {
      name: "Gloomgourd",
      size: 1,
      ground: "farmland",
      requirements: [
        { crop: "pumpkin", count: 1 },
        { crop: "melon", count: 1 },
      ],
    },
    soggybud: {
      name: "Soggybud",
      size: 1,
      ground: "farmland",
      requirements: [
        { crop: "melon", count: 2 },
        { crop: "gloomgourd", count: 2 },
      ],
    },
  },
};

describe("stateless layout link embeds", () => {
  it("recognises only the bounded canonical share route", () => {
    expect(layoutShareRoute(`/greenhouse/share/${SOGGY_FIELD_CODE}`)).toEqual({
      code: SOGGY_FIELD_CODE,
      preview: false,
    });
    expect(layoutShareRoute(`/greenhouse/share/${SOGGY_FIELD_CODE}/preview.png`)).toEqual({
      code: SOGGY_FIELD_CODE,
      preview: true,
    });
    expect(layoutShareRoute(`/greenhouse/share/${SOGGY_FIELD_CODE}/oembed.json`)).toEqual({
      code: SOGGY_FIELD_CODE,
      oembed: true,
      preview: false,
    });
    expect(layoutShareRoute("/greenhouse")).toBeNull();
    expect(layoutShareRoute("/greenhouse/share/<script>")).toBeNull();
  });

  it("decodes the real shared layout without storing it", async () => {
    const layout = await decodeSharedLayout(SOGGY_FIELD_CODE);

    expect(layout.name).toBeUndefined();
    expect(layout.inputs).toEqual(SOGGY_INPUTS);
    expect(layout.targets).toEqual(SOGGY_TARGETS);
  });

  it("returns layout-specific Open Graph metadata and a browser redirect", async () => {
    const html = await buildLayoutShareDocument(SOGGY_FIELD_CODE, "https://skydex.ca", DATASET);

    expect(html).toContain('property="og:title" content="Oooo, a Soggy Field! - Open in Skydex!"');
    expect(html).toContain(
      `property="og:image" content="https://skydex.ca/greenhouse/share/${SOGGY_FIELD_CODE}/preview.png?v=2"`,
    );
    expect(html).toContain(
      `type="application/json+oembed" href="https://skydex.ca/greenhouse/share/${SOGGY_FIELD_CODE}/oembed.json"`,
    );
    expect(html).not.toContain('property="og:description"');
    expect(html).not.toContain('name="twitter:description"');
    expect(html).not.toContain('name="description"');
    expect(html).toContain(`/greenhouse?layout=${SOGGY_FIELD_CODE}#designer`);
    expect(html).not.toContain("localStorage");
  });

  it("offers Discord a large photo embed without the redundant summary line", async () => {
    const oembed = await buildLayoutOembed(
      SOGGY_FIELD_CODE,
      "https://skydex.ca",
      DATASET,
    );

    expect(oembed).toEqual({
      version: "1.0",
      type: "photo",
      title: "Oooo, a Soggy Field! - Open in Skydex!",
      provider_name: "Skydex",
      provider_url: "https://skydex.ca",
      url: `https://skydex.ca/greenhouse/share/${SOGGY_FIELD_CODE}/preview.png?v=2`,
      width: 1200,
      height: 630,
    });
  });

  it("uses a frozen v2 name without query parameters or query overrides", async () => {
    const namedCode = encodeSharedDesign(
      SOGGY_INPUTS,
      SOGGY_TARGETS,
      "Wizard's | Waterworks",
    );
    const layout = await decodeSharedLayout(namedCode);
    const html = await buildLayoutShareDocument(
      namedCode,
      "https://skydex.ca",
      DATASET,
      "Query Override",
    );
    const preview = await buildLayoutPreviewDocument(
      namedCode,
      "https://skydex.ca",
      DATASET,
      "Query Override",
    );
    const oembed = await buildLayoutOembed(
      namedCode,
      "https://skydex.ca",
      DATASET,
      "Query Override",
    );

    expect(layout.name).toBe("Wizard's | Waterworks");
    expect(layout.inputs).toEqual(SOGGY_INPUTS);
    expect(layout.targets).toEqual(SOGGY_TARGETS);
    expect(html).toContain(
      'property="og:title" content="Oooo, Wizard\'s | Waterworks! - Open in Skydex!"',
    );
    expect(html).toContain(`/greenhouse/share/${namedCode}/preview.png`);
    expect(html).toContain(`/greenhouse/share/${namedCode}/oembed.json`);
    expect(html).not.toContain("?name=");
    expect(html).not.toContain("Query Override");
    expect(preview).toContain("Wizard's | Waterworks");
    expect(preview).not.toContain("Query Override");
    expect(oembed.title).toBe("Oooo, Wizard's | Waterworks! - Open in Skydex!");
    expect(oembed.url).toBe(`https://skydex.ca/greenhouse/share/${namedCode}/preview.png?v=2`);
  });

  it("keeps query names as a fallback for existing v1 links", async () => {
    const html = await buildLayoutShareDocument(
      SOGGY_FIELD_CODE,
      "https://skydex.ca",
      DATASET,
      "Wizard's Waterworks",
    );

    expect(html).toContain("Oooo, Wizard's Waterworks! - Open in Skydex!");
    expect(html).toContain(`/preview.png?v=2&name=Wizard%27s+Waterworks`);
  });

  it.each([
    ["Delayed Soggybuds", "Oooo, Delayed Soggybuds! - Open in Skydex!"],
    ["Gloomgourd", "Oooo, a Gloomgourd! - Open in Skydex!"],
    ["Gloomgourds", "Oooo, Gloomgourds! - Open in Skydex!"],
    ["Amber Orchard", "Oooo, an Amber Orchard! - Open in Skydex!"],
    ["The Bog", "Oooo, The Bog! - Open in Skydex!"],
    ["Wizard's Waterworks", "Oooo, Wizard's Waterworks! - Open in Skydex!"],
  ])("frames the user title %s with natural grammar", async (name, expectedTitle) => {
    const code = encodeSharedDesign(SOGGY_INPUTS, SOGGY_TARGETS, name);

    const html = await buildLayoutShareDocument(code, "https://skydex.ca", DATASET);
    const oembed = await buildLayoutOembed(code, "https://skydex.ca", DATASET);

    expect(html).toContain(`property="og:title" content="${expectedTitle}"`);
    expect(oembed.title).toBe(expectedTitle);
  });

  it("uses the exact delayed Soggybuds link title and a revisioned preview resource", async () => {
    const layout = await decodeSharedLayout(DELAYED_SOGGYBUDS_CODE);
    const html = await buildLayoutShareDocument(
      DELAYED_SOGGYBUDS_CODE,
      "https://skydex.ca",
      DATASET,
    );

    expect(layout.name).toBe("Delayed Soggybuds");
    expect(html).toContain(
      'property="og:title" content="Oooo, Delayed Soggybuds! - Open in Skydex!"',
    );
    expect(html).toContain(
      `property="og:image" content="https://skydex.ca/greenhouse/share/${DELAYED_SOGGYBUDS_CODE}/preview.png?v=2"`,
    );
  });

  it("builds a readable full-field screenshot document from the same link payload", async () => {
    const html = await buildLayoutPreviewDocument(SOGGY_FIELD_CODE, "https://skydex.ca", DATASET);

    expect(html.match(/class="cell/g)).toHaveLength(100);
    expect(html).toContain("Soggy Field");
    expect(html).toContain("Soggybud");
    expect(html).toContain("Melon");
    expect(html).toContain("Gloomgourd");
    expect(html).toContain("Farmland");
    expect(html).toContain("/greenhouse/crops/soggybud.png");
    expect(html).toContain('@font-face{font-family:"Skydex Chrome"');
    expect(html).toContain('/fonts/montserrat-latin-var.woff2');
    expect(html).toContain('font-family:"Skydex Chrome","Space Grotesk",sans-serif');
    expect(html).toContain("linear-gradient(171.3deg,#e8edf3 0 47.4%,#20b8e6 47.4% 100%)");
    expect(html).toContain("background-clip:text");
    expect(html).toContain(">SKYDEX</strong>");
    expect(html).not.toContain("SKY<span>DEX</span>");
  });

  it("shows the Designer's ready, delayed, and blocked counts in the preview image", async () => {
    const statusCode = encodeSharedDesign(
      [
        { cropId: "melon", position: [3, 3] },
        { cropId: "melon", position: [5, 5] },
        { cropId: "pumpkin", position: [4, 2] },
        { cropId: "melon", position: [6, 2] },
      ],
      [
        { cropId: "gloomgourd", position: [4, 3] },
        { cropId: "gloomgourd", position: [5, 3] },
        { cropId: "soggybud", position: [4, 4] },
      ],
      "Waterworks",
    );

    const html = await buildLayoutPreviewDocument(statusCode, "https://skydex.ca", DATASET);

    expect(html).toContain("MUTATION STATUS");
    expect(html).toContain("2 ready");
    expect(html).toContain("1 delayed");
    expect(html).toContain("0 blocked");
  });

  it("paints each target with its evaluated ready or delayed state", async () => {
    const statusCode = encodeSharedDesign(
      [
        { cropId: "melon", position: [3, 3] },
        { cropId: "melon", position: [5, 5] },
        { cropId: "pumpkin", position: [4, 2] },
        { cropId: "melon", position: [6, 2] },
      ],
      [
        { cropId: "gloomgourd", position: [4, 3] },
        { cropId: "gloomgourd", position: [5, 3] },
        { cropId: "soggybud", position: [4, 4] },
      ],
      "Waterworks",
    );

    const html = await buildLayoutPreviewDocument(statusCode, "https://skydex.ca", DATASET);

    expect(html).toContain('class="placement target valid"');
    expect(html).toMatch(
      /class="placement target delayed"[^>]*><img src="https:\/\/skydex\.ca\/greenhouse\/crops\/soggybud\.png"/,
    );
  });

  it("returns failed share-page visitors to the Designer instead of a bare edge error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json(DATASET);

    try {
      const response = await handleLayoutEmbedRequest(
        new Request("https://skydex.ca/greenhouse/share/A"),
        {},
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        "https://skydex.ca/greenhouse?layout=A#designer",
      );
      expect(await response.text()).not.toContain(
        "That shared layout could not be rendered.",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("delegates the production API route instead of falling through to the static site", async () => {
    const response = await handleLayoutEmbedRequest(
      new Request("https://api.skydex.ca/v1/hypixel/profiles?uuid=b876ec32e396476ba1158438d83c67d4", {
        headers: { origin: "https://skydex.ca" },
      }),
      {},
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toContain("anonymous Skydex browser id");
  });

  it("terminates unknown API-host paths instead of fetching the Worker recursively", async () => {
    const response = await handleLayoutEmbedRequest(
      new Request("https://api.skydex.ca/not-a-route"),
      {},
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      cause: "That Skydex API route does not exist.",
    });
  });
});
