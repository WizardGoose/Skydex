import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { localProfileApiProxy } from "./tools/localProfileApi";
import {
  PUBLIC_PAGE_METADATA,
  renderPageMetadataHtml,
} from "./src/site/pageMetadata";

/*
 * Chunk grouping is keyed on package name rather than written as the object
 * form of `manualChunks`, because the object form cannot name every module it
 * needs to.
 *
 * `react/jsx-runtime` is CommonJS: it is a two-line file that re-exports
 * `cjs/react-jsx-runtime.production.js`. Rollup therefore represents it as two
 * modules - the real file, and a synthetic `\0commonjs-proxy:` module that
 * performs the singleton `require`. The object form resolves real paths only,
 * so it can place the runtime's code but never the proxy that instantiates it.
 * The proxy then lands in whichever chunk first reaches it, every JSX-emitting
 * module in the app hard-depends on that chunk, and the result is a flow-graph
 * bundle on the critical path of the landing page. Matching on package name
 * catches the proxy and the file together.
 *
 * Each group lists its transitive dependencies explicitly. The object form used
 * to pull those in by walking the graph; matching by id does not walk, so
 * anything left out here would scatter into page chunks and be downloaded more
 * than once.
 */
const CHUNK_BY_PACKAGE = new Map<string, string>(
  Object.entries({
    vendor: [
      "react",
      "react-dom",
      "react-router",
      "react-router-dom",
      "scheduler",
    ],
    model3d: ["three", "skinview3d", "skinview-utils"],
    graph: [
      "@xyflow/react",
      "@xyflow/system",
      "@dagrejs/dagre",
      "@dagrejs/graphlib",
      "classcat",
      "zustand",
    ],
    icons: ["lucide-react"],
  }).flatMap(([chunk, packages]) =>
    packages.map((name) => [name, chunk] as [string, string]),
  ),
);

/**
 * The npm package a Rollup module id belongs to, or null for app source.
 *
 * Ids arrive in three shapes: a real path, a `\0commonjs-proxy:`-prefixed path,
 * and a `\0commonjs-module:`-prefixed path. Under pnpm the real path nests the
 * package inside a versioned store directory, so the package name is the
 * segment following the LAST `node_modules/`, not the first.
 */
function packageOfModule(id: string): string | null {
  const path = id
    .replace(/\\/g, "/")
    .replace(/^\0/, "")
    .replace(/^commonjs-(proxy|module):/, "");
  const marker = path.lastIndexOf("node_modules/");
  if (marker === -1) return null;
  const segments = path.slice(marker + "node_modules/".length).split("/");
  if (segments.length === 0) return null;
  return segments[0].startsWith("@")
    ? `${segments[0]}/${segments[1]}`
    : segments[0];
}

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => {
  const deployRevision = (process.env.GITHUB_SHA ?? "local").slice(0, 12);

  // LAN preview origins cannot call the hosted profile API directly. Relay its
  // four public read routes during development; keep production on the hosted
  // service and retain its anonymous client IDs, cache, and quota handling.
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "skydex-deploy-revision",
        transformIndexHtml(html) {
          return html.replaceAll(
            "__SKYDEX_DEPLOY_REVISION__",
            deployRevision,
          );
        },
      },
      {
        name: "skydex-page-link-metadata",
        async closeBundle() {
          const outputRoot = resolve(process.cwd(), "dist");
          const rootIndexPath = resolve(outputRoot, "index.html");
          const rootIndex = await readFile(rootIndexPath, "utf8");

          await Promise.all(
            PUBLIC_PAGE_METADATA.map(async (page) => {
              const routeDirectory = resolve(outputRoot, page.path.slice(1));
              await mkdir(routeDirectory, { recursive: true });
              await writeFile(
                resolve(routeDirectory, "index.html"),
                renderPageMetadataHtml(rootIndex, page),
                "utf8",
              );
            }),
          );
        },
      },
    ],
    /* Keep generated review captures outside the dev watcher. The project
     * root contains large screenshot/DOM audit artifacts; watching them
     * made every capture look like source churn and grew duplicate Vite
     * processes into multi-gigabyte servers. */
    server: {
      proxy: command === "serve" && !isPreview ? localProfileApiProxy() : undefined,
      // Prepare the main lazy routes on startup, not on the first navigation.
      // This only warms Vite's transform cache; it does not fetch them in the browser.
      warmup: {
        clientFiles: [
          "./src/profile-view/ProfileView.tsx",
          "./src/pages/ItemsPage.tsx",
          "./src/pages/StoragePage.tsx",
          "./src/greenhouse/GreenhouseShell.tsx",
          "./src/pages/SettingsPage.tsx",
          "./src/island/PlayerModel.tsx",
        ],
      },
      watch: {
        ignored: ["**/.tmp-layoutrefs/**", "**/.codex-reference/**", "**/.vite/**"],
      },
    },
    base: "/",
    build: {
      rollupOptions: {
        output: {
          /*
           * The 3D model stack dwarfs the page that uses it: three alone is
           * most of the profile route's weight. In its own chunk it is fetched
           * once and then served from cache across deploys, so a profile-page
           * edit no longer re-downloads the renderer. The fusion graph's
           * layout engine gets the same trade.
           */
          manualChunks(id) {
            // Rollup's CommonJS interop helpers are shared by every wrapped
            // package. Left to the default placement they can land in a route
            // chunk that vendor then has to import, which inverts the
            // dependency and drags the route onto the critical path.
            if (id.includes("commonjsHelpers")) return "vendor";
            const pkg = packageOfModule(id);
            return pkg ? CHUNK_BY_PACKAGE.get(pkg) : undefined;
          },
        },
      },
      // No `target` here on purpose. Vite 7 defaults to
      // "baseline-widely-available" (chrome107 / edge107 / firefox104 /
      // safari16). Runtime/CSS support requires Safari 16.4+, Chrome 111+,
      // and Firefox 128+ (Tailwind 4); compilation does not polyfill Web APIs.
      sourcemap: false,
      cssCodeSplit: true,
      chunkSizeWarningLimit: 1000,
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react-router-dom"],
    },
  };
});
