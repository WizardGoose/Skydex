import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("skydex.ca deployment contract", () => {
  it("publishes the canonical custom-domain marker", () => {
    expect(read("public/CNAME").trim()).toBe("skydex.ca");
  });

  it("contains no repository-subpath deployment base", () => {
    for (const path of [
      "vite.config.ts",
      "src/App.tsx",
      "public/404.html",
      ".github/workflows/deploy-pages.yml",
      "package.json",
    ]) {
      expect(read(path), path).not.toContain("/Skydex/");
    }
  });

  it("does not select a GitHub Pages subpath build", () => {
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["build:pages"]).not.toContain("GITHUB_PAGES=true");
  });

  it("discloses Cloudflare as part of the public request path", () => {
    const privacy = read("src/pages/PrivacyPolicy.tsx");
    expect(privacy).toMatch(/Cloudflare/);
    expect(privacy).toMatch(/IP address/);
  });

  it("routes only the bounded production Hypixel API through the Worker", () => {
    const wrangler = read("wrangler.jsonc");
    const worker = read("cloudflare/hypixel-api-worker.js");
    const transport = read("src/island/hypixelTransport.ts");

    expect(wrangler).toContain('"name": "skydex-worker"');
    expect(wrangler).toContain('"HYPIXEL_API_KEY"');
    expect(wrangler).toContain('"pattern": "api.skydex.ca"');
    expect(wrangler).toContain('"custom_domain": true');
    expect(wrangler).toContain('"HYPIXEL_QUOTA"');
    expect(wrangler).toContain('"HYPIXEL_METRICS"');
    expect(wrangler).toContain('"workers_dev": false');
    expect(worker).toContain('const ENDPOINTS = {');
    expect(worker).not.toMatch(/HYPIXEL_API_KEY\s*[:=]\s*["'][^"']+["']/);
    expect(transport).toContain('const PRODUCTION_API_ORIGIN = "https://api.skydex.ca"');
    expect(transport).toContain('new URL("/v1/hypixel/snapshot"');
    expect(transport).not.toContain('import.meta.env.VITE_');
  });

  it("does not put repository-dispatch values or a PAT into a shell-capable action", () => {
    const workflow = read(".github/workflows/update-fusions.yml");
    expect(workflow).not.toContain("github.event.client_payload.target_branch");
    expect(workflow).not.toContain("secrets.PAT");
    expect(workflow).not.toMatch(/uses:\s*actions\/checkout@v\d/);
  });

  it("validates downloaded fusion JSON before publishing it", () => {
    const workflow = read(".github/workflows/update-fusions.yml");
    expect(workflow).toContain("jq -e");
    expect(workflow).toContain("fusion-data.next.json");
    expect(workflow).toContain("fusion-properties.next.json");
  });
});
