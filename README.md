<!-- Keep the public display name spelled "Skydex". SITE_NAME in
     src/ui/brand.ts is the application source of truth. -->

<div align="center">

<img src="docs/assets/wordmark.svg" alt="Skydex" width="880">

An open-source toolkit for Hypixel SkyBlock.

<a href="LICENSE"><img src="docs/assets/badge-mit.svg" alt="MIT licensed" height="20"></a>
<a href="#how-to-use-skydex"><img src="docs/assets/badge-browser.svg" alt="runs in your browser" height="20"></a>
<a href="#privacy"><img src="docs/assets/badge-no-tracking.svg" alt="no ads, no tracking" height="20"></a>
<a href="https://github.com/WizardGoose/Skydex/actions/workflows/mod-build.yml"><img src="https://github.com/WizardGoose/Skydex/actions/workflows/mod-build.yml/badge.svg" alt="Skydex mod build status" height="20"></a>

</div>

# Skydex

Skydex is my open-source SkyBlock project. It has profiles, recipes, storage,
greenhouse planning, shard fusion, and a mod. I'd like to say it saves me time,
but I keep spending that time adding things to it. Skydex is not in a 'completed' state, Skydex is in a state I feel comfortable with releasing even though I dislike certain aspects. More change to come!

[Contributions](docs/contributing.md), forks, suggestions and requests are all
welcome! You don't have to write code to have a say in what gets added. If
there's a tool you'd find useful, something that could work better, or a bug
I've managed to miss, [open an issue](https://github.com/WizardGoose/Skydex/issues)
and tell me about it.

**[Open Skydex](https://skydex.ca)** ·
[What you can do](#what-you-can-do) ·
[How to use Skydex](#how-to-use-skydex) · [Run it locally](#run-it-locally) ·
[Configuration](#configuration) · [Privacy](#privacy) · [Credits](#credits)

## What you can do

- **Profile:** look through your gear, accessories, pets, inventory and progression, from skills and collections to Dungeons, Garden and Museum. Items keep their SkyBlock artwork, rarity and tooltips. The public profile viewer lets you look up another player without changing your connected account.
- **Recipes:** pick an item and quantity, then expand its crafting or forge tree down to the materials. Skydex counts the ingredients and intermediate items you already have, shows what's missing, and accounts for the buying, crafting and gathering options available to your profile type.
- **Storage:** find items in your recorded island chests, with chest positions and the original slot layouts to help you find them in game. You can see when the data was captured; inventories, sacks and backpacks from the API are available through Profile too.
- **Greenhouse:** choose the items and mutations you want to grow, see their requirements and plan around your available land. Let the solver arrange the plot in your browser, or place plants yourself in the planner. Save loadouts, reopen them later and share layouts with other players.
- **Shards:** set your target shards, sync your collection from your profile or adjust counts by hand, and follow the fusion plan from the shards you need to the ones you're making. The recipe browser and fusion lines are there for exploring the combinations too.

Your selected profile and available holdings carry across the tools. Follow your profile's detected mode or choose Profile Type in Settings; plans and preferences are saved in your browser so you can pick up where you left off. Missing or private inventory data is shown as unavailable.

Home brings together search, public profile lookup and saved planner progress. The [user guide](docs/user-guide.md) covers the individual tools in more detail.

## How to use Skydex

Open **[skydex.ca](https://skydex.ca)** in your browser. No installation or local server is needed.

Start the tutorial or open **Settings** and enter your Minecraft username. Your current profile will be selected automatically; you can choose a different one in Settings. No personal Hypixel API key is needed.

Skydex also has a mod! Install it to record your island chests and greenhouse, and show your planned layout in game. You still do the planting. The website works without the mod too.

### Install the mod

Download the JAR for your Minecraft version from the
[latest Skydex release](https://github.com/WizardGoose/Skydex/releases/latest).
Use a Fabric instance and put the JAR, along with the matching
[Fabric API](https://modrinth.com/mod/fabric-api), in its `mods` folder.
Check the release notes for supported Minecraft versions and requirements.
Close Minecraft before replacing an existing JAR.

### Import into skydex.ca

1. Open `/skydex` in game and choose **GitHub Pages**.
2. Run `/skydex copy`, or choose **Copy export code** in the mod screen.
3. On the website, open **Settings → Data & connections → Inventory import
   and reset**, then paste the code into **Import inventory snapshot**.

The code is decoded in your browser. Importing it does not upload your
inventory to Skydex. Copy and import again when you want to update the snapshot.

### Link a locally running site

Run the website on the same computer as Minecraft, choose **Locally Hosted**
in `/skydex`, then press **Link mod** in **Settings → Data & connections**.
This enables live updates as you play and lets you send a greenhouse layout
to the mod when you choose to.

The connection uses `http://127.0.0.1:27916`, which is your own computer. The
mod's server listens there only. The website starts this connection after you
link it; unlinking stops it without deleting your saved snapshot.

## Run it locally

For the website, use Node **20.19+ within Node 20, or 22.12+**, and pnpm. The
repository pins pnpm **10.18.1**. The [setup guide](docs/SETUP.md) covers getting
the code and installing these tools from scratch.

From the repository folder:

```sh
pnpm install
pnpm run dev
```

Open the address printed in the terminal, normally `http://localhost:5173`.
If that port is busy, Vite chooses another one. Read the address rather than
assuming. (assuming is how you end up staring at a blank tab)

To build and serve the production version locally:

```sh
pnpm start
```

This builds the site and serves it on port `4180`, unless that port is already
in use. The terminal prints the address to open.

### Build commands

| Command | Builds | Requirements |
| --- | --- | --- |
| `pnpm run build:site` | Website into `dist/` | Node and pnpm |
| `pnpm run build:pages` | Website for GitHub Pages | Node and pnpm |
| `pnpm run build:mod` | Skydex mod into `mod/build/libs/` | Node, pnpm and Java 25 JDK |
| `pnpm run build:all` | Website and mod | Node, pnpm and Java 25 JDK |

The mod source lives in [`mod/`](mod/). To build it without Node or pnpm,
use Java 25 JDK and the included Gradle wrapper:

```sh
cd mod
./gradlew build             # macOS / Linux
# .\gradlew.bat build       # Windows PowerShell
```

The default target is Minecraft 26.1.2. For Minecraft 26.2, add
`-Pminecraft_version=26.2 -Pfabric_api_version=0.158.0+26.2` to the build command.
[GitHub Actions](https://github.com/WizardGoose/Skydex/actions/workflows/mod-build.yml)
tests and builds both targets. Use Releases for stable JAR downloads; build
outputs are kept out of source history.

## Configuration

For everyday use, configuration lives in **Settings**: your connected profile,
Profile Type, planning preferences, appearance and data connections. Settings
and saved plans belong to the browser and site address you use. A local copy
and skydex.ca keep separate data.

Running the website locally needs no `.env` file or personal Hypixel API key.
Both the hosted site and a local copy use `api.skydex.ca` for authenticated
profile reads. The service keeps the application credential on the server;
it is not part of the website build.

The static build expects to be served at `/`, as it is on skydex.ca. If you
host a fork under a subdirectory, its base path and deep-link handling need to
match that address.

On GitHub Pages, [`public/404.html`](public/404.html) saves an incoming deep
link and [`src/staticRouteRestore.ts`](src/staticRouteRestore.ts) restores it
before the app's router starts. They work as a pair. (please do not separate
them, they get sad)

<details>
<summary>A note for contributors: old names and saved data</summary>

Some browser-storage keys retain the `wizardsky.*` compatibility namespace.
Older names migrate before their readers run, preserving existing plans,
snapshots and texture packs. The mod migrates existing data to `config/skydex`
and backs up conflicting older files. Its command is `/skydex`.

Clipboard imports accept `SKYDEX2-`, `SKYDEX-`, `SKYDEX1.` and `SKYINDEX1.`.
Keep the older readers when changing the format so existing exports still work.

</details>

## Privacy

Skydex has no accounts, ads, browser analytics, tracking scripts or cookies.
It does not build a user database or a history of your activity.

- **Saved work stays on your device.** Plans, settings, imported snapshots,
  custom backdrops and texture packs are stored in your browser. Clearing site
  data removes them. Inventory export codes are decoded locally when pasted.
- **Profile lookups make network requests.** Username services resolve the
  name you enter. Skydex's profile API receives the UUID or selected profile
  ID and a random browser ID used for abuse limits, then requests the data
  from Hypixel. You never supply a Hypixel credential.
- **Cached data has an age.** Profile responses stay fresh for 5 to 30 minutes,
  depending on the data. The hosted service retains a fallback for up to 24
  hours. Your browser can reuse an older response for up to 30 days during a
  failed refresh, marked as stale. This is separate from your saved plans.
- **Online sources and hosts receive requests.** The site fetches public game
  data, prices and images. Those providers, GitHub Pages and Cloudflare can
  receive ordinary connection details such as your IP address and requested
  URL. No analytics does not mean no network traffic.
- **Sharing a layout shares its contents.** A greenhouse share link contains
  the layout. Cloudflare can read that layout to generate a social preview;
  the preview service processes it without saving a layout database.

The mod's live connection stays on your computer and begins only after you
choose **Link mod**. The [Privacy Policy](https://skydex.ca/privacy-policy)
explains the individual connections and storage in more detail; its
[source is here](src/pages/PrivacyPolicy.tsx).

## Credits

Skydex grew from tools other people made and shared. Thank you to their
developers and contributors.

- **[SkyShards](https://github.com/Campionnn/SkyShards)** by Campion and xKapy:
  the original shard fusion calculator, greenhouse solver and designer that
  Skydex's versions are derived from.
- **[SkyHelper-Networth](https://github.com/Altpapier/SkyHelper-Networth)** by
  Altpapier: the valuation engine ported to TypeScript for Skydex's net-worth
  calculations.
- **[NotEnoughUpdates](https://github.com/NotEnoughUpdates/NotEnoughUpdates-REPO)**:
  public accessory-chain, pet-texture and Bestiary data used by the site.
- **[SkyCrypt](https://cupcake.shiiyu.moe)**: a reference for presenting dense
  profile information.
- **[SkyOcean](https://github.com/meowdding/SkyOcean)** by meowdding and its
  contributors: inspiration for the mod's storage tracking and bringing
  SkyBlock utilities together in game.
- **[Hypixel SkyBlock Wiki](https://hypixelskyblock.minecraft.wiki)**,
  **[Minecraft Wiki](https://minecraft.wiki)** and **[MCHeads](https://mc-heads.net)**:
  game references, data and artwork used throughout Skydex.

[NOTICE.md](NOTICE.md) records code ancestry, attribution and the terms for
third-party code, data and assets.

## Contributing

Skydex is a personal project that I work on while playing SkyBlock. There is
more I want to do with it, and contributions, forks, suggestions and fixes
are welcome.

The [contribution guide](docs/contributing.md) covers the codebase and its
checks. For [bugs or suggestions](https://github.com/WizardGoose/Skydex/issues),
include the page, what you tried and what you expected. Screenshots and the
exact item, shard or mutation involved help.

## License

Skydex's code is [MIT licensed](LICENSE), including the mod. Third-party code,
game data and assets retain their own terms, recorded in [NOTICE.md](NOTICE.md).

Skydex is not an official Minecraft or Hypixel product and is not approved by
or associated with Mojang, Microsoft or Hypixel.
