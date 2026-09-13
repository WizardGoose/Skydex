import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const current = JSON.parse(readFileSync(resolve(root, "src/desc.json"), "utf8"));
const historic = JSON.parse(execFileSync("git", ["show", "f03a17d:src/desc.json"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
}));

const textOf = (value) => {
  if (Array.isArray(value)) return value.map(textOf).join("");
  if (value && typeof value === "object") return typeof value.t === "string" ? value.t : "";
  return "";
};

const byTitle = new Map();
const byId = new Map();
for (const entry of Object.values(historic)) {
  if (!entry || typeof entry.title !== "string") continue;
  const lines = Array.isArray(entry.how_to_hunt)
    ? entry.how_to_hunt
        .map((line) => textOf(line).replace(/^\s*-\s*/, "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
    : [];
  byTitle.set(entry.title.trim().toLowerCase(), lines);
  if (typeof entry.id === "string" && entry.id.trim()) byId.set(entry.id.trim().toLowerCase(), entry);
}

const output = {};
const presentation = {};
for (const [key, entry] of Object.entries(current)) {
  const title = typeof entry?.title === "string" ? entry.title.trim().toLowerCase() : "";
  output[key] = title ? byTitle.get(title) ?? [] : [];
  const id = typeof entry?.id === "string" ? entry.id.trim().toLowerCase() : "";
  const rich = (id ? byId.get(id) : null)
    ?? Object.values(historic).find((candidate) => candidate?.title?.trim().toLowerCase() === title)
    ?? historic[key]
    ?? null;
  presentation[key] = rich ? {
    description: Array.isArray(rich.description) ? rich.description : [],
    how_to_hunt: Array.isArray(rich.how_to_hunt) ? rich.how_to_hunt : [],
  } : null;
}

writeFileSync(
  resolve(root, "src/shards/acquisitionData.generated.json"),
  `${JSON.stringify(output, null, 2)}\n`,
  "utf8",
);

writeFileSync(
  resolve(root, "src/shards/shardPresentation.generated.json"),
  `${JSON.stringify(presentation, null, 2)}\n`,
  "utf8",
);

const mapped = Object.values(output).filter((lines) => lines.length > 0).length;
const formatted = Object.values(presentation).filter(Boolean).length;
console.log(`Wrote acquisition guidance for ${mapped}/${Object.keys(output).length} shards and game formatting for ${formatted}/${Object.keys(presentation).length}.`);
