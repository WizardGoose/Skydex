# Skydex island data contract

This reference covers the schema-v1 snapshots and layout messages exchanged
by the Skydex website and Fabric mod. Clipboard imports and the local HTTP
connection use the same snapshot model.

The website's [types](../../src/island/types.ts),
[validator](../../src/island/validate.ts) and
[mod server](../../mod/src/main/java/com/skydex/http/SkydexHttpServer.java)
contain the corresponding implementation.

## Connection modes

Choose the site mode in the mod's `/skydex` screen:

- **Locally Hosted** starts the local server. The website connects after the
  player chooses **Link mod** in Settings. Manual export remains available.
- **GitHub Pages** stops the local server. `/skydex copy` or **Copy export
  code** puts a snapshot on the clipboard for import into the website.

Commands: `/skydex` (open GUI) · `/skydex copy` (clipboard code) ·
`/skydex status` (chat summary: captured counts, mode, server state).

## Data sources and merging

The API supplies profile inventories, sacks and other shared profile data;
island chests come from the mod. Authenticated profile requests use Skydex's
hosted API, without a visitor-supplied Hypixel key.

The mod's **Include inventory in export code** setting controls whether
clipboard codes include `inventory`, `enderChest` and `storage`. In Auto mode,
these are included for GitHub Pages and omitted for Locally Hosted, where the
live feed supplies them. An explicit user setting overrides Auto.

The website keeps mod and API feeds separately. Before combining them, it
checks that they belong to the expected account and profile. Mismatched data
is withheld from the view without erasing the saved feed.

- Only captured or verified-empty sections contribute data. Missing and
  private sections cannot replace an observation from another source.
- Chests come from the mod. For other whole-container sections, captured
  items take precedence over an empty observation. Among eligible feeds,
  live mod data takes priority; otherwise the newest feed wins, with ties
  going to the mod.
- Sacks merge by item ID. Mod counts win for IDs it has observed, while API
  counts remain available for the others.

See [merge.ts](../../src/island/merge.ts) for section selection and
[storageIdentity.ts](../../src/island/storageIdentity.ts) for identity checks.

## JSON schema

```jsonc
{
  "schema": 1,                      // integer, bump on breaking change
  "exportedAt": 1754092800000,      // ms epoch, when the snapshot was taken
  "player": { "uuid": "…", "name": "…" },
  "profile": { "name": "…", "gameMode": "ironman" | "normal" | "bingo" | "stranded" | null },

  // Sack contents. Key = Hypixel internal item ID (e.g. "ENCHANTED_BROWN_MUSHROOM").
  "sacks": { "ENCHANTED_BROWN_MUSHROOM": 25600 },

  // Containers recorded on the private island.
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
        // `name` is optional: producers omit it when
        // it equals the title-cased id (ENCHANTED_BREAD -> "Enchanted Bread").
        // Readers prettify the id when name is absent. Only ship a name when
        // it genuinely differs (reforges, stars, renamed items).
        //
        // `extra` is optional structured item detail for tooltips.
        // Omitted when empty. Shape:
        //   "extra": {
        //     "reforge": "Rapid",              // reforge name only
        //     "stars": 3,                      // upgrade/dungeon stars
        //     "ench": { "BIG_BRAIN": 3 },      // enchantments (books AND gear)
        //     "recomb": true                   // recombobulated
        //   }
        // All fields are optional; unknown fields are ignored.
        // Enchantment data distinguishes books sharing the ENCHANTED_BOOK id.
        //
        // `slot` is an optional int: the 0-based container slot
        // the stack sits in, so the site can render the original
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
  // captured yet. An empty list means that section was observed as empty.
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

## Optional section: `greenhouse`

An observed greenhouse board can travel in both the live feed and export
codes. The section is omitted until observed; an observed board can have no
occupied cells. Growth timestamps are optional.

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
- CORS: `Access-Control-Allow-Origin: *`; the server accepts `GET`, `POST`
  and `OPTIONS`. The server remains bound to loopback.
- Website prefers `/v1/events`; if the stream fails to open it falls back to
  polling `/v1/island` every 5 s while `/v1/health` succeeds; backs off to
  30 s when unreachable. "Live" indicator either way.

## Encoding

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
- The shorter format is selected per snapshot; binary is not always smaller.
- `/skydex copy` or the GUI Copy button puts the code on the clipboard.
- Website has a paste box; on paste it validates the prefix, inflates, parses,
  and stores.

## Website persistence

The localStorage key remains `wizardsky.island.v1`. Current writes use
`{ "v": 2, "feeds": { "mod": ..., "api": ... } }`, with each present feed
holding `receivedAt`, `snapshot` and its section states.

The earlier `{ "receivedAt": ..., "snapshot": ... }` form is still read as a
mod feed. Migration does not delete the old data, and an unreadable feed does
not discard the other feed. See [storage.ts](../../src/island/storage.ts).

New snapshots update their source feed; merging happens for the displayed
view. Clearing imported data is an explicit Settings action. Unlinking the
mod stops live requests and retains the saved snapshot.

## Transport 3: layout push (site to mod)

The site can send a greenhouse layout for the mod to display as an overlay.
The player places the blocks; a layout request only changes the guide.

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

- **Coordinates:**
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

## Capture behaviour

The mod reads data available to the client, including container screens, item
components and greenhouse observations. It does not automate gameplay or place
blocks. The local HTTP endpoints exchange snapshots and display instructions
with the website.
