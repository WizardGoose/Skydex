# Attribution and licensing

## Upstream code

The shard fusion calculator, greenhouse solver and greenhouse designer in this
project are derived from **SkyShards** by Campion and xKapy:

  https://github.com/Campionnn/SkyShards
  https://github.com/Campionnn/SkyShards-Greenhouse

**Licence state of those repositories: both MIT.** The main SkyShards repo
gained its MIT LICENSE ~2026-07-31, and SkyShards-Greenhouse gained its own
MIT LICENSE as promised (verified 2026-08-06 via the GitHub licensing API,
spdx MIT). Everything this project derives from either repo is therefore
covered by a formal MIT grant, preserved here.

For the record of how that came to be: before the licence files landed, the
default-copyright reading applied and publication was held while permission
was sought. Campion granted it directly in chat ("yea i can add an mit
license for it too. it won't include the backend though, only the frontend
solver"), and then followed through with the formal LICENSE. The backend
exclusion costs nothing: this project no longer calls their backend anywhere
(see below).

**The greenhouse solver no longer calls out.** It used to POST every solve to
api.skyshards.com; it now runs in the visitor's own browser, in a Web Worker,
with no network involved. That covers the solver page, the planner's plot
economics, the solved-layout preview and the mutation requirement grid. Layout
sharing is likewise fully local: a share link already carried the whole layout
in the URL, and it now points at this site rather than at theirs.

Forty canonical layouts are **solved at build time** and shipped in
`src/greenhouse/data/solverPrecompute.json`, so the planner's opening burst
costs no search at all. The builder sweeps 40 RNG streams per unproved entry and
keeps the best layout that passes the legality validator, which a browser could
never afford: the two hardest mutations reach their best known plot on roughly
one seed in twenty, so a visitor gets 52 Soggybud where a cold two-and-a-half
second solve returns 51. This is our own solver run longer, not an answer taken
from anywhere else, and the runtime refuses the file outright if its dataset
fingerprint does not match, falling back to solving live. A custom plot, being a
different question, is always solved live. `pnpm parity:solver` prints both
numbers side by side and names every row where they differ.

The greenhouse **expansion optimizer** is local too. It used to POST to
`/greenhouse/expansion`; it now runs its own planner in a Web Worker. Against
the answers recorded from the remote it matches on 16 or 17 of the 18 sampled
plots and is one spawn short on the rest, which are the two 99-cell plots, and
it answers plots with disconnected unlocked cells, which the remote endpoint
times out on. No answer it gives is illegal: the harness re-counts every layout
from scratch rather than trusting the reported number.

That range is not hedging, it is the honest reading. The planner's refinement
is bounded by wall clock rather than by iterations, and both borderline plots
use their full 2500ms, so the count moves with how busy the machine is: two
runs on the same commit an hour apart gave 16 of 18 and then 17 of 18. Run
`pnpm parity:expansion` and read the number it prints on your machine rather
than this sentence. That the gate is time-sensitive at all is a weakness worth
fixing before it guards a release.

**No call to api.skyshards.com remains.** The last one was the Hypixel
player-profile lookup behind Fusion, then Manage Inventory, then Import, which
proxied the Hypixel API through their host. It is gone, along with the `/api`
dev proxy and the `VITE_API_TARGET` variable that fed it; both existed for
that one caller and had no other reader.

That call could never have worked in a deployed build anyway.
api.skyshards.com sends no `Access-Control-Allow-Origin` on either the GET or
the OPTIONS preflight, and it sets `Access-Control-Allow-Credentials: true`,
so a wildcard could not have applied either. It worked only under
`pnpm run dev`, where the Vite `/api` proxy made it same-origin, and a static
build has no proxy.

The import now runs in the visitor's own browser against
`api.hypixel.net/v2/skyblock/profiles`, with the player's own key from
`src/island/apiKey.ts`, which Hypixel's CORS policy allows. The reading lives
in `src/shards/profileImport.ts`; the request itself stays in
`src/island/hypixel.ts`, still the only file in this project that handles the
key. The product cost was accepted deliberately: the import used to ask for a
username and nothing else, and it now also needs the player's own Hypixel API
key. Without one it refuses and points at the Settings page rather than
throwing.

The per-shard fused count behind `AttributeOwned.level` was traced to
`member.attributes.stacks` against a recorded dump of a real profile: every
sampled value sits at or under that shard's rarity cap in `MAX_QUANTITIES`,
one exactly on it, which is what distinguishes a shard count from a tier
level. `member.shards.owned[].type` is the bare id (`SPHINX`, not
`SHARD_SPHINX`), so both spellings are normalised before matching. There is no
`last_save` anywhere in the v2 profiles payload, so the profile list orders by
Hypixel's own `selected` flag rather than showing an invented timestamp. When
Hypixel sends no `attributes.stacks`, the import takes the shard counts, says
the fused counts could not be read, and leaves the player's own attribute
numbers untouched instead of zeroing them.

Ending these calls ends the load on their servers; it does not affect the
permission question above, which is about the derived code and the
fork-inherited assets and is unchanged either way.

## Networth valuation (SkyHelper-Networth)

The networth engine in `src/networth/` is a **direct TypeScript port** of
**SkyHelper-Networth** by Altpapier:

  https://github.com/Altpapier/SkyHelper-Networth

  Copyright (c) 2022 Altpapier
  Licensed under the MIT License.

MIT is one-way compatible with GPL-3.0, so porting it into this codebase is
allowed outright, and the only obligation is that its copyright notice travels
with the ported portions. That is what this section is. Every file in
`src/networth/` that carries ported logic names it in its own header as well,
so a reader hitting a strange-looking rule can find out whose rule it is
without leaving the file.

**What was ported, and how faithfully.** The valuation rules, verbatim in
behaviour: the fifty-five entry application-worth table, the thirty-six
modifier handlers and the order they run in, the item-id normaliser, the pet
level ladder and its two interpolation bands, the essence and master star
costs, the soulbound split, and the category aggregator. The port was checked
rather than trusted: `pnpm parity:networth` feeds one set of real item
documents and one pinned price snapshot to the actual npm package and to this
port and reports the delta per category, and it also compares all twenty-three
ported constant tables field by field against the package's own. That constant
check is not decoration; it caught a two-entry transcription slip in the pet
level ladder that no fixture would have exposed.

**Category assembly is checked separately from valuation**, because the two
fail differently and a valuation check cannot see an assembly bug. An item
counted in the wrong category, or twice, or dropped, moves the total with every
handler behaving perfectly. So the gate's fourth pass sends a whole raw profile
member through upstream's `parseItems` and through this project's
`parseMemberItems` and compares the per-category item COUNT as well as the
total. That pass is what pins the rules with no valuation component at all:
where saved equipment loadouts count, that a borrowed museum item is somebody
else's, that a toolkit slot already in use must not be counted twice, and which
of the two `sacks_counts` spellings wins.

**Version sensitivity, recorded because it looks like a bug and is not.**
Upstream's category set has moved recently: `member.loadout.armor` (the
wardrobe) arrived in **2.7.5** and `member.loadout.equipment` plus the farming
and hunting toolkits arrived in **2.8.0**. A tool pinned to an earlier release
therefore reports a smaller Equipment figure for the same profile, and no
toolkit categories at all. This port tracks 2.8.0 and matches 2.8.0 exactly;
a disagreement with another tool is worth checking against that tool's pinned
version before it is treated as an error here.

**What was NOT ported, and why the package is not simply a dependency.** Its
I/O layer cannot run in a browser and the reasons are structural rather than
cosmetic: `constants/itemsMap.js` calls `require('fs')` at module load and
writes a backup file every twelve hours, `helper/decode.js` uses Node's `zlib`
and `Buffer`, and `managers/NetworthManager.js` is a singleton whose
constructor fires a network request and starts a `setInterval` the moment it is
imported. So the decoding half is this project's own `src/nbt` (which uses the
browser's `DecompressionStream` and adds no dependency), and the package is
present only as a devDependency for the parity gate. Nothing from it ships.

**The price list is fetched, never redistributed.** Prices come from
`https://raw.githubusercontent.com/SkyHelperBot/Prices/main/pricesV2.json` at
runtime, in the visitor's own browser, cached for twenty minutes in
localStorage under `skyindex.networth.prices.v1`. That repository carries **no
licence file**, so this project treats it the way it treats wiki content: the
visitor's browser fetches it directly, no copy ships in this repository or in a
build, and no snapshot is committed. `pnpm parity:networth` downloads its own
copy into `tools/.cache/`, which is gitignored, for exactly this reason. If
this project ever wanted to mirror that file, it would ask first.

**Hypixel item documents are committed as test fixtures**, and that is worth
stating plainly rather than leaving implicit. `tools/fixtures/networth/` and
`src/networth/__tests__/fixtures/` hold real item documents and a trimmed slice
of Hypixel's item catalogue, captured from the **keyless** endpoints
`/v2/skyblock/auctions`, `/v2/skyblock/auctions_ended` and
`/v2/resources/skyblock/items` by `tools/capture-networth-fixture.mjs`. They
are there because this project's house rule is that a test fixture is captured,
never hand-written: a parser tested against shapes its own author invented
proves only that the author was consistent. This is the same arrangement as
`src/island/__tests__/fixtures/island-ref.json`, which is a real captured
island. None of it ships in a build.

## NotEnoughUpdates data (accessory chains, item lore, pet textures, and Bestiary)

The accessories page supplements its wiki-derived upgrade chains with the
`talisman_upgrades` constant from the **NotEnoughUpdates-REPO** by the NEU
team:

  https://github.com/NotEnoughUpdates/NotEnoughUpdates-REPO

  Licensed under the MIT License (LICENSE at the repository root, verified
  2026-08-03).

**What is taken, exactly:** the `talisman_upgrades` map inside
`constants/misc.json`, which states which Hypixel accessory ids upgrade into
which; the signed texture property from the current `<PET>;<rarity>.json` item
record when the public Hypixel item resource does not contain a base pet; and
`constants/bestiary.json` for Bestiary family grouping, bracket ladders, caps,
in-game name colours, and official mob and location icon properties. Generic item
tooltips also use `internalname`, `displayname`, and `lore` from individual
`items/<ID>.json` records. Captured inventory lore takes precedence over these
base item descriptions. Newly crafted pet descriptions substitute level-one
`statNums` and `otherNums` from `constants/petnums.json` at the item's stated
rarity. No other NEU fields are used.

**How it is taken:** fetched at runtime by the visitor's own browser from
`raw.githubusercontent.com`, the same arrangement as the SkyHelper price list
above, and cached in the visitor's localStorage under
`skyindex.accessories.neu.v1` for a day. No copy ships in this repository or
in a build; MIT would permit bundling, but runtime fetching means the data
stays exactly as current as the repository itself. The parsing lives in
`src/accessories/neuUpgrades.ts`, which names this provenance in its own
header. Pet texture records use the same runtime-only arrangement and are
cached under `skyindex.pets.neu-textures.v1`; their narrow parser lives in
`src/profile/petTextures.ts`. The Bestiary catalogue is likewise fetched only
at runtime and cached under `skyindex.bestiary.neu.v1`; its narrow parser lives
in `src/profile/bestiaryResource.ts`.

Item lore is requested when its tooltip opens, validated against the requested
item ID, and cached for a day under `skyindex.items.neu-lore.v1`. The parser in
`src/items/itemLore.ts` retains Minecraft text formatting; no item records are
bundled with the site.

The wiki remains the primary source of upgrade chains; the NEU constant fills
in chains whose wiki articles do not state their infobox upgrade fields.

## Wiki data

Mutation data, crafting recipes and item icons come from the Hypixel SkyBlock
Wiki, licensed **CC BY-NC-SA 3.0**:

  https://creativecommons.org/licenses/by-nc-sa/3.0/
  https://hypixelskyblock.minecraft.wiki

That licence requires attribution, forbids commercial use, and requires any
redistribution to carry the same terms.

**How this project stays clear of those terms: it does not redistribute wiki
content.** No wiki text, data module, or image ships in this repository or in
the built site. The visitor's own browser fetches wiki pages and images from
the wiki at runtime, exactly as it would by visiting the wiki directly, and
the site footer carries the attribution and licence link. The NC and SA
obligations attach to wiki content, and the wiki itself is the party serving
that content to each visitor. This is the same arrangement other community
tools use, and it is why the earlier bundled copies (13MB of icons, recipe
dumps) were deliberately deleted rather than shipped.

One nuance is inherited rather than chosen: the fork came with a bundled
greenhouse dataset (`public/greenhouse/data.json`), crop images
(`public/greenhouse/crops/`) and shard icons. The dataset is game-mechanics
facts (names and numbers); the images depict Minecraft content and are used
the way SkyBlock community tools customarily use them. They are part of the
upstream-permission conversation below, not wiki content.

## Minecraft Wiki (minecraft.wiki)

One icon is hotlinked from the main Minecraft Wiki rather than from the Hypixel
SkyBlock Wiki: the large (double) chest render used as the chest card icon on
the Island page. No double chest exists on the Hypixel wiki under any title,
established by enumerating its File namespace rather than by guessing titles.

**Its licence basis is different from the Hypixel wiki's, and the difference is
the reason this section exists rather than being folded into the one above.**
minecraft.wiki licences site content CC BY-NC-SA 3.0 "unless otherwise noted",
but the wiki farm's own governing policy is explicit that this does not extend
to media:

  "Non-text media on our wikis should not be assumed to be available under the
  same license as the text. Please view the media description page for details
  about the license of any specific media file."
  https://meta.weirdgloop.org/w/Licensing (section "Non-text files")

So the description page was read rather than assumed. It carries
`{{License Mojang}}`, which sets `nonfree = true`, `attrreq = true` and
`linkreq = true`, and states that the asset is "freely usable **on this wiki**".
That permission is wiki-scoped and does not reach a third party. No Creative
Commons grant covers this file, so this project relies on Mojang's own
guidelines instead.

| | |
|---|---|
| Title | Large Chest (S) JE6 |
| Depicts | The vanilla Minecraft large (double) chest, isometric, facing south |
| Description page | https://minecraft.wiki/w/File:Large_Chest_(S)_JE6.png |
| Image URL (hotlinked) | https://minecraft.wiki/images/Large_Chest_%28S%29_JE6.png |
| Dimensions | 402x366 PNG, 6,517 bytes |
| Host | Minecraft Wiki (minecraft.wiki), operated by Weird Gloop |
| Copyright | Mojang Studios / Microsoft |
| Licence | Not CC. Non-free Mojang asset, used under the Minecraft Usage Guidelines: https://www.minecraft.net/usage-guidelines |
| Wiki licence tag | `{{License Mojang}}` (nonfree, attribution required, link required) |
| Verified | 2026-08-02: HTTP 200, `image/png`, `Access-Control-Allow-Origin: *`, and the file opened and confirmed to be the wide two-block chest rather than a single |

**Nothing is copied into this project.** The visitor's browser requests the
image directly from minecraft.wiki, the same arrangement used for Hypixel wiki
images and for MCHeads. That satisfies Mojang's "don't redistribute our games
or any alterations of our games or game files" outright: no byte of Mojang's
ships in this repository or in a build.

Mojang treats sharing with the community as commercial use "regardless of
whether you receive payment or provide it for free", so the Commercial Use
conditions apply to this project even though it is free. They require that the
site not imply endorsement, redistribute nothing, and carry a non-affiliation
disclaimer.

**Obligation met.** That disclaimer ("NOT AN OFFICIAL MINECRAFT PRODUCT. NOT
APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT") is set in the site footer
in `src/components/layout/Layout.tsx`, which renders on every route, so it is
present on the privacy policy and every other page as well. The obligation is
not created by this icon; it already applied because Minecraft item icons
render throughout the site. It stays recorded here so the reason the line
exists is not lost the next time somebody tidies the footer.

**A related imprecision in the section above, found by the same check:** the
Hypixel SkyBlock wiki has no licence-tagging infrastructure for files at all,
so the claim that its **item icons** are "licensed CC BY-NC-SA 3.0" is an
assumption the wiki farm's policy explicitly says not to make. It holds for the
mutation data and recipes, which are text. The project's actual position is
unaffected, because hotlinking avoids redistribution whichever licence applies,
but the wording overstates what was verified.

Mojang states all rights "are and will remain owned by Mojang and Microsoft"
and that permissions "may be revoked at any time". This entry records the
guidelines as they read on 2026-08-02; it is not a perpetual grant.

## Bundled media

**No image is used by the site any more.** The 2026-08 background types round
replaced the photographic backdrop with a flat solid ground, so nothing in
`src/` references an image and none ships in a build. One file is still on disk
(the Tarantula below) purely because a superseded scratch review page still
points at it; see its entry.

Both records are kept rather than deleted. They document what was republished
in earlier builds of this project and under what licence, and a provenance
record that only covers the current commit is not much of a record.

Both are US-Government public domain, which is what made bundling and
republishing them allowed. Neither is CC BY-NC or CC BY-SA: a non-commercial
term would have conflicted with republishing and a share-alike term would have
dragged its own licence onto this project.

**Sombrero Galaxy Spitzer Image** (retired 2026-08, file deleted)

Was the live backdrop from the 2026-08 backdrop candidates round until the
background types round that followed it, where flat solid was shown against
flat-plus-one-functional-gradient and against a subtle authored grain, and was
picked outright. The site now has no backdrop image, no ambient wash and no
grain overlay, so nothing references this file and it has been removed from
`public/bg/`. See the Ground block in `src/index.css` for the replacement and
its measured contrast table.

| | |
|---|---|
| File in this repo | `public/bg/sombrero-pia15427.webp` |
| Title | Sombrero Galaxy Not So Flat After All |
| Identifier | PIA15427 |
| Source page | https://images.nasa.gov/details/PIA15427 |
| Original file | https://images-assets.nasa.gov/image/PIA15427/PIA15427~orig.jpg |
| Licensor | NASA Jet Propulsion Laboratory (JPL) |
| Credit line | NASA/JPL-Caltech |
| Licence | Public domain (work of the US Government, not subject to copyright in the United States) |
| Retrieved | 2026-08-02 |

Licence basis, checked on the source itself rather than assumed from the
domain, the same test the Tarantula entry below passed. The record for
PIA15427 carries no copyright field in either the item record or the extended
metadata, and names no creator outside NASA: its secondary creator is
`NASA/JPL-Caltech` and its center is `JPL`. Both governing policies quoted in
the Tarantula entry below carve out third-party material, and this image
falls outside those carve-outs because there is no third party in the credit.

The bundled file is a derivative: cropped to 16:9 from the portrait original
(1970x1108 taken from y=520), downscaled to 1920x1080, black point crushed
(floor 0.13), desaturated to 32%, tinted toward a deep Index blue
(channel mix r 0.68, g 0.90, b 1.30), highlights rolled off so the galaxy
core stays below 43% of full scale, and encoded as WebP at quality 92
(44,816 bytes). The astronomical image is NASA's work; the colour grade is
this project's.

**Tarantula Nebula Spitzer 2-Color Image** (superseded, file retained for now)

Replaced as the live backdrop by the Sombrero image above during the 2026-08
backdrop candidates round, and then made moot entirely when the background
types round removed the backdrop layer altogether. Nothing in `src/` references
it and it ships in no build.

Its stated condition for removal was that it could go when the scratch review
page using it as a comparison baseline went. That page is now superseded, since
the decision it existed to support has been made. It has been moved out of
`public/` to `bench/bg-candidates/` so it is no longer published in a build,
but it has not been deleted, so this file stays until it is. Both should go
together, and that is a tidy-up rather than a licensing question: retaining a
public-domain file breaches nothing.

| | |
|---|---|
| File in this repo | `public/bg/nebula-pia23646.webp` |
| Title | Tarantula Nebula Spitzer 2-Color Image |
| Identifier | PIA23646 |
| Source page | https://images.nasa.gov/details/PIA23646 |
| Original file | https://images-assets.nasa.gov/image/PIA23646/PIA23646~orig.jpg |
| Licensor | NASA Jet Propulsion Laboratory (JPL) |
| Credit line | NASA/JPL-Caltech |
| Licence | Public domain (work of the US Government, not subject to copyright in the United States) |
| Retrieved | 2026-08-01 |

Licence basis, checked on the source itself rather than assumed from the
domain. The record for PIA23646 carries no copyright field and names no
creator outside NASA: its secondary creator is `NASA/JPL-Caltech` and its
center is `JPL`. That matters because both governing policies carve out
third-party material, and this image falls outside those carve-outs because
there is no third party in the credit.

The JPL Image Use Policy (https://www.jpl.nasa.gov/jpl-image-use-policy/)
states that "Unless otherwise noted, images and video on JPL public web sites
... may be used for any purpose without prior permission", that the credit
line should be "Courtesy NASA/JPL-Caltech", and that the restriction on
commercial use applies only to "image and video materials on JPL public web
sites [that] are owned by organizations other than JPL or NASA".

The NASA Images and Media Guidelines
(https://www.nasa.gov/nasa-brand-center/images-and-media/) state that "NASA
content - images, audio, video, and media files ... generally are not subject
to copyright in the United States", that "NASA should be acknowledged as the
source of the material", and that third-party material "will be marked
identified as copyright protected with the name of the copyright holder".
PIA23646 carries no such marking.

Note that NASA's guidelines ask that the NASA insignia and logo not be used,
and that NASA's name not be used to imply NASA endorsement of a product or
service. This project uses neither and implies neither.

The bundled file is a derivative: downscaled to 1920x1080, black point
crushed, desaturated and tinted toward the site's violet, highlights rolled
off, and encoded as WebP. The astronomical image is NASA's work; the colour
grade is this project's.

## Bundled fonts

Every typeface the site uses ships inside this repository and is republished
with it. All of them are available under the SIL Open Font License, which is
what makes bundling, self-hosting and redistribution allowed where the
third-party art above is not. The OFL requires that the copyright notice and
the licence travel with the font, which is the purpose of this section.

Nothing is loaded from fonts.googleapis.com or fonts.gstatic.com. There is no
`<link>`, no `@import`, and no preconnect to either, so rendering text puts no
third party in the critical path and hands no visitor IP to one.

**ADLaM Display**

| | |
|---|---|
| File in this repo | `public/fonts/adlam-display-latin-v1.woff2` |
| Family name | ADLaM Display |
| Copyright | Copyright (c) 2022 by Microsoft. All rights reserved. |
| Licence | SIL Open Font License, Version 1.1 |
| Licence text | https://openfontlicense.org (also `ofl/adlamdisplay/OFL.txt` in google/fonts) |
| Upstream metadata | https://github.com/google/fonts/blob/main/ofl/adlamdisplay/METADATA.pb (`license: "OFL"`) |
| Source page | https://fonts.google.com/specimen/ADLaM+Display |
| File retrieved from | https://fonts.gstatic.com/s/adlamdisplay/v1/KFOhCnGXkPOLlhx6jD8_b1ZEOsbSkA.woff2 |
| Subset | latin only, as served by the Google Fonts CSS API |
| Size | 23,928 bytes |
| Retrieved | 2026-08-01 |

Only the latin subset is bundled. The adlam and latin-ext subsets are not
included, because the only thing set in this face is the site's mark, which is
two Latin letters and a full stop.

The family carries **no Reserved Font Name**, so the sole remaining obligation
is that the font is not renamed. It is declared in `src/index.css` under its
real family name, `ADLaM Display`, and referenced under that name. The file is
byte-identical to the one Google Fonts serves; nothing about the font has been
modified, subsetted further, or re-encoded.

The font is self-hosted rather than linked. No `<link>` or `@import` to
fonts.googleapis.com is used for it, so no third party is in the critical path
of the site's own mark and no visitor IP is handed to one to render it.

**Space Grotesk, JetBrains Mono, Montserrat**

The three text faces, all from Google Fonts under the SIL Open Font License
1.1, all self-hosted from `public/fonts/` and referenced under their real
family names. Each is a variable font, so one file per subset serves every
weight the site sets.

| Family | Files | Weights used | Copyright, as stated in the family's own OFL.txt |
|---|---|---|---|
| Space Grotesk | `space-grotesk-latin-var.woff2` (22,288 bytes), `space-grotesk-latin-ext-var.woff2` (18,940 bytes) | 400-700 | Copyright 2020 The Space Grotesk Project Authors (https://github.com/floriankarsten/space-grotesk) |
| JetBrains Mono | `jetbrains-mono-latin-var.woff2` (31,432 bytes), `jetbrains-mono-latin-ext-var.woff2` (11,624 bytes) | 400-700 | Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono) |
| Montserrat | `montserrat-latin-var.woff2` (37,956 bytes), `montserrat-latin-ext-var.woff2` (70,688 bytes) | 400-800 | Copyright 2024 The Montserrat.Git Project Authors (https://github.com/JulietaUla/Montserrat.git) |

| | |
|---|---|
| Licence | SIL Open Font License, Version 1.1, for all three |
| Licence text | https://openfontlicense.org |
| Source pages | https://fonts.google.com/specimen/Space+Grotesk, https://fonts.google.com/specimen/JetBrains+Mono, https://fonts.google.com/specimen/Montserrat |
| Files retrieved from | https://fonts.gstatic.com, via the Google Fonts CSS API |
| Subsets | latin and latin-ext only |
| Retrieved | 2026-08-09 |

Only latin and latin-ext are bundled. The cyrillic, greek and vietnamese
subsets are not, because the interface is English; the `unicode-range` on each
face means text in those scripts falls through to the reader's system font
rather than fetching anything. The files are byte-identical to the ones Google
Fonts serves, and the `unicode-range` values in `src/index.css` are Google's
own, so subsetting behaviour is unchanged. None of the three carries a Reserved
Font Name, so the remaining obligation is not to rename them, and they are
declared and referenced under their real names.

**GNU Unifont**

| | |
|---|---|
| File in this repo | `public/fonts/unifont-17.0.03.otf` |
| Family name | Unifont |
| Version | 17.0.03 |
| Copyright | Copyright (c) 1998-2025 Roman Czyborra, Paul Hardy, Qianqian Fang, Andrew Miller, Johnnie Weaver, David Corbett, Aella Chiana Moskopp, Rebecca Bettencourt, Ho-Seok Ee, et al. |
| Licence | Dual: SIL Open Font License 1.1, or GNU GPL v2 or later with the GNU Font Embedding Exception |
| Licence text | https://scripts.sil.org/OFL and https://gnu.org/licenses/gpl.html |
| Source | https://unifoundry.com/unifont/ |
| Size | 5,321,400 bytes |

Every field above is read from the font's own `name` table rather than assumed,
including the dual licence, which the file states in those words. This project
relies on the OFL half of that dual grant, on the same footing as ADLaM
Display: bundling and self-hosting are permitted, the font is not renamed, and
the copyright notice is reproduced here. The copyright line is transcribed with
plain-ASCII spellings of two characters ("(c)" for the copyright sign, "Aella"
for the AE ligature); the authoritative form is the one inside the file.

It is used for one narrow job - the in-game symbols inside perk and description
text, which the site's Latin faces do not carry - and `src/index.css` bounds it
with a `unicode-range` to the symbol blocks, so a page with no such glyphs never
downloads it. The file is byte-identical to the upstream release; nothing about
it has been modified or subsetted.

## Hypixel API

Live bazaar prices and item metadata come from the public Hypixel API
(api.hypixel.net), used keylessly and read-only.

## MCHeads (mc-heads.net)

A great many SkyBlock items are Minecraft player heads with custom skins: pets,
Abiphones, and much of the decorative catalogue. None of them have a wiki image,
so the Island page renders them from their texture hash through MCHeads, at
`https://mc-heads.net/avatar/<texture-hash>/<px>`.

Nothing is copied into this project. The visitor's browser requests the image
directly, the same arrangement used for wiki images, and the step runs only
after the wiki routes have already failed for that item.

Terms, as published by the service and checked on 2026-08-01:

- **CORS**: "MCHeads supports Cross-Origin Resource Sharing, so you can make
  AJAX request from other sites."
- **Caching**: skins are cached server-side for 24 hours, behind CloudFlare.
- **Attribution**: encouraged but not required. Their suggested wording is
  "Thanks to MCHeads for providing Minecraft avatars." The site credits them in
  the footer, because attribution is cheap and it is the decent thing to do when
  a free service says it is appreciated.

Verified empirically before use, against real texture hashes taken from
Hypixel's own `/v2/resources/skyblock/items`: the endpoint answers `200` with
`Content-Type: image/png` and `Access-Control-Allow-Origin: *`, and two
different hashes return two genuinely different images rather than one shared
default. One behaviour worth recording: an unrecognised hash returns `200` with
the default Steve face rather than a `404`, so this step cannot fail and a
corrupt hash renders Steve instead of falling through to a blank tile.

The profile page also uses two further MCHeads endpoints under the same terms:
`https://mc-heads.net/body/<uuid>/<px>` for the flat full-body render (the
identity header's fallback when WebGL is unavailable), and
`https://mc-heads.net/skin/<uuid>` for the raw skin PNG that feeds the 3D
player model. The skin endpoint was verified the same way on 2026-08-03:
`200`, `image/png`, `Access-Control-Allow-Origin: *`, which is what lets a
WebGL texture be built from it at all. Crafatar was considered for the same
job and was answering `521` on the day it was tested, so MCHeads carries both.

## skinview3d

The 3D player model on the profile page is rendered by
[skinview3d](https://github.com/bs-community/skinview3d) (MIT licence), from
the Blessing Skin community, together with its bundled copy of three.js (also
MIT). Installed from npm at a pinned version; nothing about it is modified.
The library renders the player's skin, cape, ears and elytra; it has no armor
mesh support, which is why worn armor appears beside the model as item icons
rather than on it.

## fflate

Zip and gzip reading for the user-supplied texture pack feature is done by
[fflate](https://github.com/101arrowz/fflate) (MIT licence), installed from
npm at a pinned exact version. It runs entirely in the visitor's browser;
nothing about it is modified.

## Game-Icons.net (gecko glyph)

The small gecko marking a Crocodile proc in the recipe trees
(`src/components/ui/GeckoIcon.tsx`) is the "Gecko" icon by Delapouite from
[Game-Icons.net](https://game-icons.net/), licensed
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The path data is
reproduced unchanged.

It arrived here as `GiGecko` from the `react-icons` package. That package
installs 84 MB to supply this one glyph, so the artwork is inlined as a local
component and the dependency is gone. Inlining is redistribution rather than a
link, which is what makes this attribution required rather than merely polite:
CC BY 3.0 asks for the creator's name, the source, and the licence, and those
are the three lines above.

## User-supplied texture packs

The Settings page can load a SkyBlock texture pack the user downloaded
themselves (for example FurfSky Reborn from Modrinth) and draw item icons
from it. The owner's ruling that shaped the feature: "basically caching a
custom texture pack in the users side, not violating anything".

**This project distributes no pack and no pack content.** The user's own zip
is parsed client-side (`src/items/texturePackParse.ts`) and cached in the
user's own browser storage (`src/items/texturePack.ts`); no byte of it is
uploaded, re-hosted, bundled, or committed here, and the repository's test
fixtures are synthetic zips built in-test from the format specification, never
a real pack. Pack content therefore stays the user's own copy under the
pack's own licence, whatever that licence is - which is what lets packs under
no-derivatives or non-commercial terms (Hypixel+ is CC-BY-NC-ND) be used by
their owner without this project touching those terms at all.

The format the parser reads is the one defined by
[Catharsis](https://github.com/meowdding/catharsis) (MIT licence), including
its [.cats container](https://github.com/meowdding/cats-file-format) (MIT).
Understanding of the format was taken from those repositories' documentation
and readers, with thanks; no code was copied from either.

## Community inspiration

**SkyCrypt** and **SkyOcean** are important product and interface references:

  https://cupcake.shiiyu.moe
  https://github.com/meowdding/SkyOcean

SkyCrypt informed the clear presentation of dense profile data. SkyOcean, by
meowdding and its contributors, informed the companion mod's chest-tracking
and sack-handling design, as well as the idea that a wide collection of
SkyBlock utilities can feel like one cohesive, in-game-first toolkit.

The Skydex implementation was rewritten for its standalone Java/Fabric
transport and data model. No SkyOcean source files or non-code assets are
copied or redistributed here. SkyOcean's code is MIT licensed and its non-code
material is all rights reserved; neither category is included in Skydex.

## Original work

Everything under `src/greenhouse/planner/`, `src/items/`, `src/profile/`,
`src/ui/`, `src/pages/DashboardPage.tsx`, `src/pages/ItemsPage.tsx` and
`tools/` was written for this project.
