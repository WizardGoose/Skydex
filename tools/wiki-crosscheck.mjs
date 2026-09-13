#!/usr/bin/env node
/**
 * Cross-check the greenhouse dataset against the wiki.
 *
 *   node tools/wiki-crosscheck.mjs
 *
 * The planner's numbers are only as good as `public/greenhouse/data.json`,
 * which came from the SkyShards greenhouse branch rather than the wiki. This
 * verifies the two agree on the things the planner actually depends on:
 * the mutation roster, each one's rarity, and its spreading requirements.
 *
 * Reads the committed wiki snapshot (data/wiki/pages/Mutations.json) so it runs
 * offline. Its results describe that snapshot, not a fresh wiki response.
 */
import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("public/greenhouse/data.json", "utf8"));
const wikiRaw = JSON.parse(readFileSync("data/wiki/pages/Mutations.json", "utf8"));

// The dump nests the parse result; flatten to one searchable string.
let wiki = JSON.stringify(wikiRaw);
wiki = wiki.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\t/g, " ");

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const issues = [];
const ok = [];

// ---- 1. Roster: every mutation we know should appear on the wiki page ----
const missing = [];
for (const m of Object.values(data.mutations)) {
  if (!wiki.toLowerCase().includes(m.name.toLowerCase())) missing.push(m.name);
}
if (missing.length) issues.push(`Mutations absent from the wiki page: ${missing.join(", ")}`);
else ok.push(`All ${Object.keys(data.mutations).length} mutations appear on the wiki page`);

// ---- 2. Anything on the wiki we do not have -----------------------------
// Mutation rows carry a rarity class; harvest names from the minetip titles.
const wikiNames = new Set();
for (const [, name] of wiki.matchAll(/data-minetip-title="&amp;?[0-9a-fk-or]?([A-Za-z' -]{3,30})"/g)) {
  wikiNames.add(name.trim());
}
const known = new Set(Object.values(data.mutations).map((m) => norm(m.name)));
const knownCrops = new Set(Object.values(data.crops).map((c) => norm(c.name)));
const extra = [...wikiNames].filter((n) => !known.has(norm(n)) && !knownCrops.has(norm(n)));

// "Thronshade" is a typo in a tooltip attribute on the wiki; the real row is
// Thornshade and its data matches ours. Ignore known wiki typos.
const WIKI_TYPOS = new Set(["thronshade"]);
const unexplained = extra.filter((n) => !WIKI_TYPOS.has(norm(n)));

if (unexplained.length) issues.push(`On the wiki but not in our dataset (may be crops/items, check manually): ${unexplained.slice(0, 12).join(", ")}`);
else ok.push(`No unknown mutation names on the wiki page (${extra.length - unexplained.length} known wiki typo ignored)`);

// ---- 3. Rarity agreement ------------------------------------------------
// Rows look like: <td ...>Name</td> ... rarity word nearby.
let rarityChecked = 0;
const rarityMismatch = [];
for (const m of Object.values(data.mutations)) {
  const idx = wiki.toLowerCase().indexOf(m.name.toLowerCase());
  if (idx < 0) continue;
  const window = wiki.slice(idx, idx + 400).toLowerCase();
  const found = ["legendary", "epic", "rare", "uncommon", "common"].find((r) => window.includes(r));
  if (!found) continue;
  rarityChecked += 1;
  if (found !== m.rarity) rarityMismatch.push(`${m.name}: ours=${m.rarity} wiki=${found}`);
}
if (rarityMismatch.length) issues.push(`Rarity disagreements (${rarityMismatch.length}/${rarityChecked}): ${rarityMismatch.join("; ")}`);
else ok.push(`Rarity agrees on all ${rarityChecked} mutations the page states one for`);

// ---- 4. Spreading requirements ------------------------------------------
// The wiki writes these as "2x Nether Wart / 2x Fire" in the spreading column.
let reqChecked = 0;
const reqMismatch = [];
const nameOf = (id) => data.mutations[id]?.name ?? data.crops[id]?.name ?? id;

for (const m of Object.values(data.mutations)) {
  if (!m.requirements.length) continue;

  // Anchor on the mutation's OWN table row. Each row starts with {{Slot|Name}};
  // matching the first mention of the name instead lands in the page preamble
  // or a neighbouring row and produces false mismatches.
  const rowStart = wiki.indexOf(`{{Slot|${m.name}}}`);
  if (rowStart < 0) continue;
  const nextRow = wiki.indexOf("{{Slot|", rowStart + 8);
  const window = wiki.slice(rowStart, nextRow > rowStart ? nextRow : rowStart + 1600);

  const bad = [];
  for (const req of m.requirements) {
    const label = nameOf(req.crop);
    // Look for "<count>x <Name>" allowing flexible spacing/markup between.
    const pattern = new RegExp(`${req.count}\\s*x[^A-Za-z]{0,40}${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
    if (!pattern.test(window)) bad.push(`${req.count}x ${label}`);
  }
  reqChecked += 1;
  if (bad.length) reqMismatch.push(`${m.name}: could not confirm ${bad.join(", ")}`);
}

if (reqMismatch.length) {
  issues.push(`Requirements not confirmed on ${reqMismatch.length}/${reqChecked} mutations`);
}
ok.push(`Requirement strings checked against the wiki for ${reqChecked} mutations`);

// ---- Report -------------------------------------------------------------
console.log("=== AGREES ===");
for (const line of ok) console.log("  ok   " + line);

console.log("\n=== NEEDS A LOOK ===");
if (!issues.length) console.log("  (nothing)");
for (const line of issues) console.log("  !!   " + line);

if (reqMismatch.length) {
  console.log("\n  unconfirmed requirement details (first 12):");
  for (const line of reqMismatch.slice(0, 12)) console.log("     - " + line);
  console.log("\n  Note: the wiki renders these in a table cell, so a miss here often means");
  console.log("  a formatting difference rather than a real disagreement. Spot-check by hand.");
}
