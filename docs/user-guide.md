# Skydex user guide

Open [skydex.ca](https://skydex.ca), start the tutorial or open Settings, and
enter your Minecraft username. Skydex selects your current profile; you can
choose a different one in Settings. No personal Hypixel API key is needed.

You can browse the tools before connecting. Connecting adds your profile data
and available holdings to the pages that use them.

## Profile and Settings

[Profile](https://skydex.ca/profile) shows your gear, accessories, pets,
inventory, skills and progression. Its sections cover collections, Dungeons,
Garden, Museum and the other parts of your profile.

The [public profile viewer](https://skydex.ca/pv) looks up another player
without changing the account connected to your tools.

In Settings you can choose your profile, Profile Type, planning preferences,
background and resource packs. You can also manage the mod connection and
saved data there.

### Profile Type

Normal and Ironman use different acquisition options. Normal can use market
routes alongside crafting and gathering; Ironman plans use the routes
available to that mode. Converter uses Normal calculation behaviour.

Skydex can follow the mode reported by your connected profile. Choosing a
Profile Type yourself overrides that detection; **Follow profile** switches
it back.

## Recipes

Open [Recipes](https://skydex.ca/recipes), search for an item and set the
quantity you want. The catalogue includes crafting and forge recipes, with
filters for method, materials and rarity.

The recipe view shows ingredients, held materials and missing inputs. Open
the material tree to work through the full chain. Ingredients and intermediate
items you already hold reduce what still needs to be made.

Available buying and gathering routes depend on your Profile Type. Missing
prices stay unavailable; they are not treated as free items.

## Storage

[Storage](https://skydex.ca/storage) shows island chests recorded by the Skydex
mod. Search for an item to find the chests containing it, then use the chest
position and slot layout to locate it in game.

Inventory, sacks and backpacks provided by Hypixel are also available through
Profile. Island chests need a mod snapshot because the API cannot read them.

A snapshot only describes what was captured at that point. Check its source
and age if it disagrees with your current inventory. Unavailable, private,
not-yet-captured and verified-empty data are different states.

## Greenhouse

[Greenhouse](https://skydex.ca/greenhouse) combines your targets, plot,
requirements and planting plan in one workspace.

1. Add the items or mutations you want to grow and set their quantities.
2. Use **Edit cells** to match the land you have unlocked. Expansion cells
   must connect to existing land along an edge.
3. Use **Auto-arrange** to calculate a layout, or place inputs and targets
   yourself in the planner.
4. Follow the material requirements and planting steps. Use **Loadouts** to
   save a layout or return to one you've already made.

Undo and Redo apply to plot edits. The solver runs on your device. Shared
layout links carry the layout, so another player can open it without a
Skydex account.

A direct mutation target means growing new mutations. Owned mutations can
still supply inputs for other targets.

### Reading the estimates

- **Plantings** count how many rounds of planting and harvesting a plan needs.
  Held inputs can reduce the remaining work.
- **Growth cycles** are the stages spent maturing inputs, waiting for mutation
  spawns and growing the mutations themselves. A harvest window can leave a
  plot standing for several cycles before harvesting.
- **Expected time** is the average predicted by the growth model. Mutation
  spawns are random, so an individual run can finish earlier or later.
- **90% time**, where shown, is a more conservative estimate from that model.
  A mutation row uses its 90th-percentile completion time.
- **Time left** discounts completed plantings. Open the timing detail to see
  the inputs, stages and growth time behind the estimate.

The estimates depend on the selected plot, targets and growth assumptions.
They are planning estimates, not guaranteed harvest times. When a solver
result says **optimal**, it has met a proven bound; a **feasible** result is a
valid layout that has not been proven best.

## Shards

Open [Shards](https://skydex.ca/shards), choose your target shards and set the
amounts you want.

Check Collection before planning. **Sync** reads the selected profile; the
count editor lets you adjust saved counts and whether a shard can be used in
a route. Collection tracks both loose shards and fused progress.

Follow the fusion plan to see which shards to obtain and how to combine them.
The [recipe browser](https://skydex.ca/shard-recipes) lists fusion
combinations. [Fusion Lines](https://skydex.ca/fusion-lines) shows the Special
and ID lines.

Home brings together search, public profile lookup and your saved planner
progress.

## Using the mod

The [README's mod instructions](../README.md#install-the-mod) cover downloading
and installing the correct Fabric JAR.

For skydex.ca, choose **GitHub Pages** in `/skydex`, then run `/skydex copy`.
Open **Settings → Data & connections → Inventory import and reset** on the
website and paste the code into **Import inventory snapshot**. Copy and
import again to update it.

For live updates, run the website on the same computer as Minecraft, choose
**Locally Hosted** in the mod, and press **Link mod** in Settings. You can
then send a greenhouse layout to the mod as an in-game planting guide.
You place the blocks yourself.

Clipboard imports are decoded locally. The live connection uses
`127.0.0.1:27916` on your own computer and begins after you link the mod.
Unlinking stops the connection and keeps your saved snapshot.

## Saved data

Plans, preferences, imported snapshots, backdrops and resource packs are saved
in your browser. Each device and site address has its own data, so a local
copy of Skydex and skydex.ca do not share those saves.

Profile lookups, public game data, prices and images use online services.
The [Privacy Policy](https://skydex.ca/privacy-policy) describes the requests,
caching and storage. Clearing the site's browser data removes your local saves.

## Feedback

[Report a bug or request a feature](https://github.com/WizardGoose/Skydex/issues).
Include what you were doing and what you expected; screenshots, item names
and the relevant settings make a problem easier to reproduce.
