# Skydex documentation

Start here.

## For players

- **[User guide](user-guide.md)**. What each page does, how to connect your
  Hypixel profile, how the companion mod feeds the Island page, and what the
  planner's numbers mean.

## For contributors

- **[Contributing](contributing.md)**. Repository tour, how to run dev, tests
  and the data pipeline, the honesty rules the codebase holds itself to, the
  licensing picture, and how to file a suggestion that can be acted on.

Also read [../NOTICE.md](../NOTICE.md) for the full attribution and licensing
record, and [../README.md](../README.md) for the quick start.

## Deep dives

Design notes and specs that already live in this folder. These are working
documents: dated, specific, and honest about what is verified versus assumed.

- **[island-data-spec.md](island-data-spec.md)**. The contract between the
  companion mod and the site: the current `SKYDEX2-`/`SKYDEX-` code formats and legacy readers, the local server
  endpoints, and every field of the island snapshot. Both sides implement
  this exactly.
- **[greenhouse-time-research.md](greenhouse-time-research.md)**. The sourced
  research behind the planner's time model. Every number cited or marked as
  an assumption, with the playtest that would settle it.
- **[route-engine-design.md](route-engine-design.md)**. Vision notes for the
  route engine: turning the planner's bill of materials into an ordered route
  over time.
- **[hypixel-api-cheatsheet.md](hypixel-api-cheatsheet.md)**. A field-by-field
  dump of what the Hypixel public API actually exposes, taken against a real
  account, so decisions about what to pull versus ask are grounded in what is
  on the wire.
- **[design-intel.md](design-intel.md)**. A survey of the neighbouring
  SkyBlock community sites, claim by claim, used to decide what this site
  should and should not copy.
