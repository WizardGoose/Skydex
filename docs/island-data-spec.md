# Skydex Island Data Spec (v1)

The contract between the **Skydex mod** (Fabric, MC 26.1.2) and the
**Skydex website**. Both sides implement this exactly. Anything not written
here is not part of the contract.

> Renamed from WizardSky 2026-08-01, BEFORE first release, so there is no
> back-compat surface: the old `WZSKY1.` prefix and `/wizardsky` commands are
> gone, not deprecated.

## Modes (mod-side setting, chosen in the GUI)

The mod has a **site mode** setting, picked in its GUI (opened with
`/skydex`), styled to match the website (obsidian ground, Index blue accent):

- **Locally hosted** - the localhost server runs; the site connects and
  updates live. Manual export still works.
- **GitHub Pages** - the localhost server is stopped (the hosted site cannot
  reach it anyway on some setups, and there is no point burning a port);
  updates are manual: `/skydex copy` or the GUI's Copy button puts the
  current code on the clipboard.

Commands: `/skydex` (open GUI) · `/skydex copy` (clipboard code) ·
`/skydex status` (chat summary: captured counts, mode, server state).

GUI copy, exact strings: title **"How do you use Skydex?"**, options
**"GitHub Pages"** / **"Locally Hosted"**.

## Section sourcing policy (added 2026-08-01)

The Hypixel web API already exposes inventory, ender chest and storage
backpacks (as NBT), and the site pulls it with the user's own key. So:

- **Clipboard codes EXCLUDE `inventory`, `enderChest` and `storage` by
  default** — the API covers them, and dropping them is most of the code's
  size. A GUI toggle "Include inventory in export code" (default off) exists
  for keyless users.
- **Locally hosted live mode still carries everything**: the mod's live feed
  is fresher than the API and free of rate limits, so while the mod is live
  the site treats mod data as REPLACING the API for those sections and skips
  API refreshes for them.
- **Site API behaviour: auto-refresh** profile data (respecting the 5-minute
  TTL) when a key is present and the mod is NOT live; manual refresh always
  available. While the mod is live, no API polling for mod-covered sections.
- Sacks and chests always come from the mod when available (chests are never
  in the API; mod sacks are fresher).

## Purpose

The Hypixel API does not expose island chests (and sack/API visibility depends
on the player's privacy settings). The mod captures that data client-side while
the player plays, then hands it to the website two ways:

1. **Live**: a localhost HTTP server the website polls (real-time updates).
2. **Code**: a compact clipboard string the player pastes into the website
   (works on the hosted site without a companion server).

## JSON schema

```jsonc
{
  "schema": 1,                      // integer, bump on breaking change
  "exportedAt": 1754092800000,      // ms epoch, when the snapshot was taken
  "player": { "uuid": "…", "name": "…" },
  "profile": { "name": "…", "gameMode": "ironman" | "normal" | "bingo" | "stranded" | null },

  // Sack contents. Key = Hypixel internal item ID (e.g. "ENCHANTED_BROWN_MUSHROOM").
  "sacks": { "ENCHANTED_BROWN_MUSHROOM": 25600 },

  // Every container recorded on the private island (SkyOcean-style).
  "chests": [
    {
      "pos": [x, y, z],             // block position, identifies the chest
      "name": "Chest",              // container screen title, colour codes stripped
      "lastSeen": 1754092800000,    // ms epoch of last open
      "items": [
        { "id": "HYPIXEL_ID", "name": "Display Name", "count": 64 }
        // id comes from custom_data ExtraAttributes.id; when absent (vanilla
        // item), fall back to the minecraft registry id upper-cased, e.g.
        // "minecraft:oak_log" -> "OAK_LOG".
        // `name` is OPTIONAL (added 2026-08-01, size): producers OMIT it when
        // it equals the title-cased id (ENCHANTED_BREAD -> "Enchanted Bread").
        // Readers prettify the id when name is absent. Only ship a name when
        // it genuinely differs (reforges, stars, renamed items).
        //
        // `extra` is OPTIONAL structured item detail (added 2026-08-01), for
        // SkyCrypt-style tooltips. Omitted entirely when empty. Shape:
        //   "extra": {
        //     "reforge": "Rapid",              // reforge name only
        //     "stars": 3,                      // upgrade/dungeon stars
        //     "ench": { "BIG_BRAIN": 3 },      // enchantments (books AND gear)
        //     "recomb": true                   // recombobulated
        //   }
        // All fields optional; unknown fields ignored. This is COMPACT
        // structured data, never raw lore text. An ENCHANTED_BOOK without
        // its `ench` is useless to the reader, so books should always carry it.
        //
        // `slot` OPTIONAL int (added 2026-08-01): the 0-based container slot
        // the stack sits in, so the site can render the container's TRUE
        // layout (a Large Chest as its real 9x6, gaps included). Producers
        // ship it for chests/inventory/enderChest/storage; never for sacks
        // (sacks are aggregates). When present, entries are per-slot, not
        // merged. Readers without slot fall back to packed order.
        //
        // `extra.skin` OPTIONAL string: the texture hash for player_head
        // items (from the profile component's texture URL, the hex after
        // /texture/). Lets the site render custom-head items (pets,
        // abiphones, many SkyBlock items) that have no wiki image.
      ]
    }
  ],

  // Same item shape, flat lists. Optional: omit any section the mod has not
  // captured yet rather than sending an empty lie.
  "inventory":  [ { "id": "…", "name": "…", "count": 1 } ],
  "enderChest": [ … ],
  "storage":    [ … ]               // backpacks, flattened across pages
}
```

Rules:

- Counts are totals per entry as seen; the website aggregates by `id`.
- Unknown extra fields must be ignored by the reader (forward compatible).
- Sections the mod hasn't observed yet are **omitted**, not empty — the site
  distinguishes "no data" from "verified empty".

## Optional section: `greenhouse` (pinned 2026-08-02)

Captured by the mod while the player is on the Garden near the greenhouse
(detection research: skyindex-mod/docs/greenhouse-detection-research.md).
Carried in BOTH the live feed and export codes (it is small). Optional like
every section: omitted until first observed, never sent empty.

```jsonc
"greenhouse": {
  "observedAt": 1754092800000,     // ms epoch of the scan
  "size": [10, 10],                // [width, height], future-proofing
  "cells": [
    // Only occupied cells. Same coordinate pins as Transport 3:
    // x = column, y = row, 0-based, (0,0) at the same corner the layout
    // push anchors to, so a pushed layout and an observed board align.
    { "x": 0, "y": 3, "crop": "PUMPKIN" },
    { "x": 1, "y": 3, "mutation": "CHOCONUT", "nextStageAt": 1754099000000 }
    // crop XOR mutation per cell. Ids use Hypixel internal id style.
    // nextStageAt OPTIONAL ms epoch: from the Crop Diagnostics container
    // ("Next Stage: 1h 40m 20s" parsed at open time, per-crop and
    // player-triggered - present only for cells the player has diagnosed).
  ]
}
```

Reader rules: a new snapshot's `greenhouse` REPLACES the old one wholesale
(same as every section); readers must tolerate unknown cell fields; cells
outside `size` are a validation error, not a silent clamp.

## Transport 1: localhost live server

- Bind **127.0.0.1 only**, port **27916**. Never 0.0.0.0. Runs only in
  "Locally hosted" mode.
- `GET /v1/health` → `{ "ok": true, "mod": "<version>", "schema": 1 }`
- `GET /v1/island` → the JSON document above (latest snapshot).
- `GET /v1/events` → **Server-Sent Events** stream (`text/event-stream`).
  On connect, immediately sends the current snapshot as one
  `event: island` / `data: <minified JSON>` message, then pushes a new one
  each time a capture changes the snapshot (debounced ≥1 s). Heartbeat
  comment line every 25 s to keep the connection alive. This is the
  "instantly updated" path: the browser's built-in `EventSource` needs no
  dependency on either side.
- CORS: `Access-Control-Allow-Origin: *` (localhost-bound, read-only, no
  secrets — the data is the player's own island contents).
- Website prefers `/v1/events`; if the stream fails to open it falls back to
  polling `/v1/island` every 5 s while `/v1/health` succeeds; backs off to
  30 s when unreachable. "Live" indicator either way.

## Encoding pins (settled 2026-08-01)

- **base64url is UNPADDED** (JWT convention). Decoders must accept padded and
  whitespace-mangled input anyway (codes get pasted out of Discord), but
  producers emit no `=`.
- **`player.uuid` is the dashed canonical form.** Hypixel's web API wants it
  undashed, so any consumer forwarding it there strips dashes at the call site.
- `/v1/health`'s `"mod"` field carries the mod VERSION string (e.g. "1.0.0").

## Transport 2: clipboard code

- Current formats: `SKYDEX2-` + base64url(gzip(binary v2)), or `SKYDEX-` +
  base64url(gzip(minified schema-v1 JSON)). The producer builds both and emits
  the shorter complete representation; both are unpadded and use maximum gzip.
- Binary v2 uses `SKDX` magic, version byte 2, LEB128 integers, a frequency-
  ordered string pool, interned extras, sparse item name/extra tables, explicit
  presence flags, and carries every snapshot section including greenhouse.
- Compatibility is read-many: the website also accepts the retired JSON labels
  `SKYDEX1.` and `SKYINDEX1.`. No code already in circulation is invalidated.
- Measurement on the realistic test island: current JSON is 7,807 characters;
  binary v2 is 6,407 (about 18% shorter). Binary can lose on highly diverse ids,
  which is why selection is per snapshot rather than hardcoded.- Mod: `/skydex copy` or the GUI Copy button puts the code on the clipboard.
- Website has a paste box; on paste it validates the prefix, inflates, parses,
  and stores.

## Website persistence

- Snapshot stored at localStorage key `wizardsky.island.v1` exactly as
  received, plus `{ "receivedAt": <ms> }` wrapper.
- NEVER cleared automatically. Merging: a new snapshot replaces the old one
  wholesale (the mod owns history, the site owns display).

## Transport 3: layout push (site → mod, added 2026-08-01)

The site can hand the mod a greenhouse layout to DISPLAY in game as a ghost
overlay (Litematica-style). Strictly visual: the mod renders where things go;
the player places everything by hand. Automatic placement would break Hypixel
rules and is out of scope permanently.

- `POST /v1/layout` (same localhost server, so Locally hosted mode only), body:

```jsonc
{
  "schema": 1,
  "label": "Choconut x72",          // shown in game so the player knows what's loaded
  "size": [10, 10],
  "cells": [
    // only occupied cells are listed; x,y are 0-based grid coords
    { "x": 0, "y": 3, "crop": "Cocoa Beans", "ground": "farmland" },
    { "x": 1, "y": 3, "mutation": "Choconut" }   // crop XOR mutation per cell
  ]
}
```

- **Coordinate pins (settled 2026-08-01, both sides must match):**
  - `x` = column, `y` = row; `{x:0,y:3}` and `{x:1,y:3}` are horizontal
    neighbours. `size` is `[width, height]`.
  - A multi-cell mutation (2×2, 3×3) is listed as EACH of its cells, not one
    cell with a size.
  - Overlaps should not occur; if they do, the later entry wins, and senders
    order mutations after crops so a contested cell resolves to the mutation.
  - Grid coords are abstract: the mod maps them to world X/Z via the
    player-set anchor + rotation, with (0,0) at the anchored corner.
- Responses: `200 {ok:true}` · `400 {"reason":"<human sentence>"}` for
  malformed bodies (readers should also tolerate plain-text 400s).
- The mod stores ONE current layout (new push replaces old), persists it, and
  renders the overlay only on the private island, only while enabled.
- In-game control: `/skydex layout` toggles the overlay, `/skydex layout
  clear` drops the stored layout; the GUI shows the loaded label + a toggle.
- Anchoring: the player sets the grid origin in game (stand at / look at the
  greenhouse corner and run `/skydex layout anchor`); the mod never guesses
  world coordinates and never reads server data to find the plot.
- CORS `*` like the rest; `OPTIONS` preflight for POST must be answered.

## Hypixel rules constraint

The mod is **passive**: it only reads what the client already renders
(container screens, item lore/components, chat). No automation, no sending
packets on the player's behalf, no gameplay advantage beyond information
display — same category as SkyOcean / Skyblocker / NEU.
