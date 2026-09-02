# Skydex

A passive Fabric **client** mod for Hypixel SkyBlock that captures the storage
data the Hypixel API does not reliably expose — island chests, sacks, ender
chest, storage backpacks and your inventory — and hands it to the **Skydex**
website.

Minecraft **26.1.2 or 26.2** · Fabric Loader 0.19.3+ · Fabric API · Java 25

---

## What it captures

| Section | How | Notes |
|---|---|---|
| **Island chests** | Open a chest on your private island | Keyed by block position, so re-opening updates that chest instead of duplicating it |
| **Sacks** | Open any sack (`Farming Sack`, `Gemstones Sack`, …) | Real totals come from the item lore, because sack slots clamp their stack size to 64. Gemstone sacks record every cut separately, including Flawless |
| **Ender chest** | Open any ender chest page | Stored per page — opening page 1 does not wipe pages 2–9 |
| **Storage / backpacks** | Open a storage page or backpack | Same per-page rule |
| **Inventory** | Automatically while on SkyBlock | Re-read every few seconds |
| **Greenhouse board** | Automatically while standing in your greenhouse | The full 10x10 grid of crops and mutations. See below |

Nothing is captured off SkyBlock, and island chests are only recorded while
you are actually on your private island.

### Item detail

Every captured stack also carries the structured detail a tooltip needs, when
the item has any: its **reforge**, **stars**, **enchantments** and whether it is
**recombobulated**. This travels in both the live feed and the clipboard code.

Enchanted books are the reason this matters. Every book in the game shares the
id `ENCHANTED_BOOK`, so without its enchantment a book is just "Enchanted Book
x51" and tells you nothing. The id stays as it is and the enchantment rides
alongside it, so the site can show *Big Brain III*.

Custom heads — pets, abiphones, a lot of decoration items — also carry their
**skin texture hash**, which is the only way the site can draw them, since they
have no wiki image.

Items with nothing to say carry nothing — the field is left off entirely rather
than sent empty.

### Container layout

Every captured stack records the **slot** it sits in, so the site can draw a
container the way it actually looks in game: a Large Chest as its real 9×6, with
the gaps where the gaps are. Two identical stacks in different slots stay two
separate entries rather than being added together.

Empty slots are simply absent from the data rather than sent as blanks — the
gaps are the slot numbers that aren't there.

Sacks are the exception: they are totals for the whole sack, not a layout, so
they never carry a slot.

### Menu furniture is not recorded

Hypixel's storage and ender chest screens are menus, so they are full of things
that look like items but aren't: filler panes, the Close barrier, the Back
arrow, "Ender Chest Page 3", "Empty Backpack Slot 12", page-turn buttons. None
of those are recorded.

The test is whether an item has a real SkyBlock item id, not what it is called —
which matters, because a real island genuinely contained stored *Green Stained
Glass Pane* and a set of *Backwater* armour. Anything with a real id is always
kept, so nothing you actually own can be filtered out by accident.

### A note on sacks

Sack counts are read from the sack screen you have open, so a sack is recorded
the first time you open it and updated every time after. There is no way for a
mod to read every sack at once without asking Hypixel's servers for it, which
would stop it being passive — so if a category has never been opened, it is
simply not in the data yet. Opening the sack once fixes it permanently, and
nothing you have already recorded is ever lost by opening a different sack.

Connecting a Minecraft profile on the site also makes sacks available there in bulk.

The Runes sack is skipped on purpose: rune items carry no usable item id, and
recording plausible-but-wrong ids is worse than recording nothing.

## How do you use Skydex?

This is the one question the mod needs answering, and it is the first thing in
the settings screen (`/skydex`). It decides how your data reaches the site.

### Locally Hosted — live updates *(default)*

You run the Skydex site on this machine. The mod runs a small local server
and the site updates itself as you play — open a chest, watch it appear.

```
GET  http://127.0.0.1:27916/v1/health   liveness + mod version
GET  http://127.0.0.1:27916/v1/island   the latest snapshot
GET  http://127.0.0.1:27916/v1/events   live stream (Server-Sent Events)
POST http://127.0.0.1:27916/v1/layout   greenhouse layout to display in game
```

The site prefers the event stream, which pushes a new snapshot within a second
of anything changing, and falls back to polling `/v1/island` if the stream
cannot open. Bound to `127.0.0.1` only — never `0.0.0.0` — so nothing outside
this machine can reach it.

You can still copy a code by hand at any time.

### GitHub Pages — manual updates

You use the hosted site. A page on the internet generally cannot reach a server
inside your machine, so the mod **does not start one at all** rather than hold a
port nothing will connect to.

To update the site: press **Copy export code** in `/skydex` (or run
`/skydex copy`) and paste it into the site's paste box.

Switching modes takes effect immediately — no restart, and the choice is saved
as soon as you click it.

### What goes in the export code

The code carries **sacks and island chests** — the things the Hypixel API
cannot give the site. It leaves out your **inventory, ender chest and storage**,
because the API already exposes those and they are the bulk of the code's size.
Dropping them roughly halves it.

**Include inventory in export code** in `/skydex` controls this, and it
follows your site mode until you touch it: **on** for GitHub Pages, because the
hosted site has no other way to get those sections, and **off** for Locally
Hosted, because the live feed already carries them. Once you pick a side
yourself, your choice sticks in both modes.

This only affects the clipboard code. In **Locally Hosted** mode the live feed
always carries everything — it is fresher than the API and has no rate limit, so
the site uses the mod's data instead.

Item names are left off the code when the site can work them out itself — either
from the item id (`ENCHANTED_BREAD` → "Enchanted Bread") or from the reforge
plus the id (`JUJU_SHORTBOW` + reforge *Rapid* → "Rapid Juju Shortbow"). Names
that genuinely differ — starred items, renamed items — are always sent.

### What the code looks like

The mod builds both lossless representations and copies whichever is shorter:
`SKYDEX2-` is the compact binary format, while `SKYDEX-` is gzipped minified
JSON. Both use unpadded base64url and maximum gzip compression. On the realistic
test island, binary reduces the 7,807-character JSON code to 6,407 characters;
on unusually diverse data where pooling loses, the JSON form wins automatically.

The site reads both current formats and the older `SKYDEX1.` and `SKYINDEX1.`
JSON forms. The primary command and chat tag are now `/skydex` and `[Skydex]`;
`/skyindex` remains as a compatibility alias for existing players.

## Greenhouse board detection

While you stand in your greenhouse on the Garden, the mod reads the whole 10x10
board and sends it to the site: which cell holds which crop, and which cells
hold which mutation. It is the read direction of the same grid the layout
overlay draws, using the same cell coordinates, so the site can line up what you
actually planted against what it suggested.

Like everything else here it is passive. It reads blocks and entities the game
has already drawn for you. It never asks the server anything.

### Making sure it worked

Stand in your greenhouse and run **`/skydex status`**. Two lines matter:

```
  Greenhouse: 37 cells (4 mutations)
  Greenhouse scan: 37 cells in a 10x10 bed at x=88 z=-2 y=71 (found by searching)
```

The first is what has been stored and will be sent. The second is what the last
scan saw, refreshed every couple of seconds.

### How it finds the bed

Automatically, with nothing for you to set up. The mod finds the Carpenter,
who only ever stands inside a greenhouse, and works out the bed from there.

Every greenhouse is the same structure, so the bed sits at a fixed distance from
the Carpenter's feet. Once that distance is known the mod just places the grid
from him. Until then it searches the blocks around him for a connected patch of
plantable floor and reads the board off what it finds, which also measures the
distance for next time. The bed's own edges give both the position and the size,
so a greenhouse that is not 10x10 is read as what it actually is.

If the two ever disagree, the floor it can actually see wins over the stored
distance, and the mismatch is written to the log.

An earlier version instead calculated the position from your world coordinates
and a pair of numbers borrowed from other mods. On a real greenhouse those
pointed several blocks off the actual bed, and nothing inside the calculation
could tell. Measuring from the structure itself does not have that problem.

### When it says something else

| Line | Meaning |
|---|---|
| `no greenhouse in this plot (no Carpenter found)` | Normal anywhere except inside your greenhouse. The Carpenter standing in there is how the mod knows a greenhouse exists at all |
| `found a greenhouse here but the sidebar says "..."` | Something greenhouse-shaped somewhere that is not the Garden. Normal in the Hub, which has its own Carpenter |
| `NO PLANTING BED FOUND ...` | The Carpenter is there but no floor the mod recognises. It prints where it looked and the commonest blocks it saw, so the missing block type can be added |
| `read N cells but no profile is active yet` | Read before the mod worked out which profile you are on. It stores itself a moment later |
| `Unidentified mutation heads` | A mutation the mod does not have a name for. It lists the name and texture so it can be added |
| `Crop countdowns: off` | Expected today, see below |

A bed with nothing planted in it reports `0 cells` and is sent as such. Once the
bed itself has been found, "nothing is planted" is a real answer rather than a
guess.

### Crop countdowns are off for now

The Crop Diagnostics screen (right-click a crop with the Plant Diagnostic Tool)
shows a "Next Stage" timer, and the spec has a place to carry it per cell. The
parser is written but **switched off**, because nobody has yet opened that screen
and recorded what it really says, and this mod has a rule against writing a
parser against a guessed format.

Opening that screen while the mod is running writes the whole screen to
`logs/latest.log` and records nothing. That log is exactly what is needed to turn
the feature on properly.

## Greenhouse layout overlay

Design a greenhouse on the Skydex site, push it to the game, and the mod
paints translucent ghost tiles on your island floor showing what goes where —
like Litematica, but for greenhouse plots.

**It never places a single block.** The overlay is a picture; you build it by
hand. Automatic placement would break Hypixel's rules and is permanently out of
scope.

### Using it

1. Be in **Locally Hosted** mode (the push arrives over the local server).
2. On the site, design the layout and press its send button. The mod chat-logs
   what it loaded, and `/skydex` shows the label.
3. Stand at the corner of your greenhouse, look at the corner block, and run
   **`/skydex layout anchor`**. That block becomes grid cell (0,0) and the
   layout extends from it. If you are not looking at anything within 5 blocks,
   the block under your feet is used instead.
4. Run **`/skydex layout`** to show the overlay.
5. Facing the wrong way? **`/skydex layout rotate`** cycles the four
   orientations. The corner you anchored stays put while the grid swings around
   it, so you can just press it until it lines up.

| Command | What it does |
|---|---|
| `/skydex layout` | Shows/hides the overlay |
| `/skydex layout anchor` | Sets grid (0,0) to the block you are looking at |
| `/skydex layout rotate` | Cycles the four grid orientations |
| `/skydex layout progress` | Shows/hides the built-versus-unbuilt comparison |
| `/skydex layout clear` | Drops the loaded layout |

### Reading the overlay

| Marker | Meaning |
|---|---|
| Blue tile | A crop goes here |
| Amber tile | A mutation goes here |
| Small green square inside a tile | This cell needs a specific ground block |

Look at a tile and its name appears above your hotbar. The overlay only draws on
your private island, only while enabled, and is off until you turn it on.

### Progress view

**`/skydex layout progress`**, or the middle button in the settings screen's
greenhouse row, turns the flat plan into a comparison against what you have
actually built. Also off until you turn it on.

| Marker | Meaning |
|---|---|
| Green tile | The world already matches here. Nothing to do. |
| Blue ghost block | A crop goes here and is not placed yet |
| Amber ghost block | A mutation goes here and is not placed yet |
| Small white square inside a tile | This cell needs a specific ground block |

The ground marker turns white while the progress view is on, because green now
means "done" and one colour cannot mean two things on the same floor.

Looking at a cell also reports its state and your running count, for example
`Choconut  done  17 / 44 placed (38%)`. A cell that says **something else is
here** is usually fine: a mutation is grown by planting its base crop and
waiting, so the base crop sitting there is the job in progress rather than a
mistake.

The comparison reads your own loaded chunks once a second. Nothing is sent to
the server, and nothing is ever placed for you.

**There is no timer on the cells, deliberately.** Nothing the mod can see
supports an honest one: a pushed layout carries no time field, and the only
growth clock in the game's own UI is the Crop Diagnostics screen, whose format
this mod has not yet captured verbatim and therefore refuses to parse. A wrong
countdown does not look broken, it looks like a working clock that is lying, so
there is none until the data is real.

**Cells are not ranked.** A layout carries no build order, so every unbuilt cell
projects the same. Nothing in the overlay is claiming to know what to do first.

The layout, its anchor and its rotation are saved in
`config/skydex/layout.json`, so they survive a restart.

## Commands

| Command | What it does |
|---|---|
| `/skydex` | Opens the settings screen |
| `/skydex copy` | Copies the export code to your clipboard |
| `/skydex status` | Chat summary: captured counts, mode, server state, layout, location, greenhouse scan |
| `/skydex layout …` | Greenhouse overlay — see above |

## Install (Prism Launcher)

1. Create or open a **Fabric** instance on Minecraft **26.1.2** or **26.2**.
   - Prism: *Add Instance* → choose the Minecraft version → *Mod Loader* → **Fabric**.
   - Java: both versions require **Java 25**. In Prism, *Edit Instance →
     Settings → Java*, point it at a JDK/JRE 25.
2. Install the matching **Fabric API** into the instance's `mods` folder.
3. Drop the matching release asset into the same folder:
   `skydex-1.0+26.1.2.jar` or `skydex-1.0+26.2.jar`.
4. Launch, join Hypixel, go to your island and open some chests.
5. Run `/skydex` and pick which Skydex you use.

Build for 26.1.2 with `./gradlew build`, or for 26.2 with
`./gradlew build -Pminecraft_version=26.2 -Pfabric_api_version=0.156.0+26.2`.
The versioned JAR lands in `build/libs/`. Gradle downloads a matching JDK 25
automatically, so you do not need one on your PATH to compile.

## Where your data lives

```
config/skydex/config.json                  settings
config/skydex/layout.json                  greenhouse layout, anchor, overlay state
config/skydex/<uuid>_<profile>.json        one store per profile
```

Profiles are kept separate — an ironman profile's chests never merge into your
main. Chests you have not opened in **30 days** are dropped automatically, so a
rebuilt island does not haunt the export forever.

### Settings (`config/skydex/config.json`)

| Key | Default | Meaning |
|---|---|---|
| `siteMode` | `local` | `local` or `githubPages` — set this in the GUI |
| `captureEnabled` | `true` | Master switch for all capture |
| `httpPort` | `27916` | Only change this if the port clashes |
| `captureInventory` | `true` | Include your inventory in snapshots |
| `includeInventoryInExport` | `auto` | `auto`, `on` or `off` — whether the clipboard code carries inventory/ender chest/storage. `auto` follows the site mode |
| `chatFeedback` | `false` | Chat line on every capture (noisy) |

## Privacy

Your data never leaves your machine unless you send it yourself.

- The local server binds to loopback only, is **read-only**, and serves nothing
  but your own island contents.
- The export code goes to your clipboard. Where it goes next is entirely your
  choice.
- Nothing is uploaded, phoned home, or shared with any third party.

## Hypixel rules

Skydex is **passive**. It only reads what your client has already been sent
and rendered — container screens, item lore, the scoreboard, the tab list. It
does not:

- send packets or chat commands on your behalf (it does not even run `/locraw`;
  location is read from the scoreboard instead),
- automate any gameplay action,
- place, break or interact with a single block — the greenhouse overlay draws
  where things go and nothing else, which is the Litematica category; automatic
  placement is the banned thing and is permanently out of scope,
- give any advantage beyond showing you information you already have.

That puts it in the same category as SkyOcean, Skyblocker and NEU.

## Implementation notes

- **No mixins, no access widener.** Everything needed is reachable through
  public API (`CustomData.copyTag()`) and Fabric's screen/interaction events.
  That is the main reason this should survive Minecraft updates.
- **No third-party runtime dependencies.** The HTTP and SSE server is the JDK's
  own `com.sun.net.httpserver`; JSON goes through the Gson that Minecraft
  already ships; the settings screen is drawn with vanilla GUI primitives
  rather than a config library.
- **SSE without blocking the server.** An event stream lives for hours, so the
  handler registers the connection and returns its worker thread immediately;
  one scheduler thread does all pushes. Streams are capped at 4 (oldest dropped)
  and pushes are coalesced to at most one per second.
- **Capture timing.** Container slots arrive over several ticks, so contents are
  recorded once they have been *stable* for half a second, and again on close.
  Merging is keyed by position, so capturing twice is harmless.
- **Item ids.** On 26.x there is no legacy NBT: the Hypixel id is the `id` key
  of the `custom_data` component. Vanilla items fall back to their registry path
  upper-cased (`minecraft:oak_log` → `OAK_LOG`).

## Updating the mod while playing

**Never replace the jar while Minecraft is running.** The running client keeps
the old jar's directory in memory, so the first class it loads after a swap
reads the new file at the old offsets and the game crashes — usually minutes
later, when you happen to open a screen that touches a class it had not loaded
yet.

Close the game first, then copy the jar. `tools/deploy.ps1` does this for you:
it checks for a running instance and, if it finds one, stages the file as
`skyindex-<version>.jar.staged` next to the target and tells you to swap it
after quitting, rather than overwriting anything.

## Licence

MIT — see `LICENSE`.
