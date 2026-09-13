import { describe, expect, it } from "vitest";
import {
  PUBLIC_PAGE_METADATA,
  renderPageMetadataHtml,
} from "../pageMetadata";

const INDEX_FIXTURE = `<!doctype html>
<html lang="en">
  <head>
    <!-- SKYDEX_PAGE_METADATA_START -->
    <title>Skydex</title>
    <meta name="description" content="All in one Hypixel SkyBlock utility." />
    <!-- SKYDEX_PAGE_METADATA_END -->
  </head>
  <body><script type="module" src="/assets/app.js"></script></body>
</html>`;

describe("public page link metadata", () => {
  it("covers every primary navigation URL with a distinct page label", () => {
    expect(PUBLIC_PAGE_METADATA.map(({ path }) => path)).toEqual([
      "/profile",
      "/recipes",
      "/storage",
      "/forge",
      "/greenhouse",
      "/shards",
    ]);

    expect(PUBLIC_PAGE_METADATA.map(({ label }) => label)).toEqual([
      "Profile",
      "Recipes",
      "Storage",
      "Forge",
      "Greenhouse",
      "Shards",
    ]);
  });

  it("renders a compact, page-specific Forge preview without changing the app entrypoint", () => {
    const forge = PUBLIC_PAGE_METADATA.find(({ path }) => path === "/forge");
    expect(forge).toBeDefined();

    const html = renderPageMetadataHtml(INDEX_FIXTURE, forge!);

    expect(html).toContain("<title>Forge Page — Skydex</title>");
    expect(html).toContain('property="og:title" content="Forge Page"');
    expect(html).toContain('property="og:url" content="https://skydex.ca/forge"');
    expect(html).toContain(
      'property="og:image" content="https://skydex.ca/favicon/favicon.png"',
    );
    expect(html).toContain('property="og:image:width" content="128"');
    expect(html).toContain('property="og:image:height" content="128"');
    expect(html).toContain('name="twitter:card" content="summary"');
    expect(html).not.toContain("summary_large_image");
    expect(html).toContain('<script type="module" src="/assets/app.js"></script>');
  });

  it("escapes metadata before inserting it into HTML", () => {
    const html = renderPageMetadataHtml(INDEX_FIXTURE, {
      path: "/unsafe",
      label: 'Forge & "More"',
      description: '<script>alert("nope")</script>',
    });

    expect(html).toContain("Forge &amp; &quot;More&quot; Page");
    expect(html).toContain("&lt;script&gt;alert(&quot;nope&quot;)&lt;/script&gt;");
    expect(html).not.toContain('<script>alert("nope")</script>');
  });
});
