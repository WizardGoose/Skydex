# Contributing to Skydex

Thanks for wanting to help. This page covers how the repository is laid out,
how to run everything, the rules the codebase holds itself to, and how to file
a suggestion that can actually be acted on. Read it top to bottom once and you
will know your way around.

## What you need

- Node (a current LTS is fine)
- pnpm (the repo pins the exact version in `package.json`)

Then:

```sh
pnpm install
pnpm dev
```

No environment file, no variables, no accounts. Everything runs in the
browser, including the solver.

## Repository tour

The short version: pages live in `src/pages/` and `src/greenhouse/pages/`,
and each domain has its own directory with its logic and its tests together.

```
src/
  greenhouse/     the greenhouse suite
    solver/         the local layout solver (pure, runs in a Web Worker)
    solverClient/   caching, the shipped precompute, and its fingerprint guard
    planner/        plan building, time estimates, progress arithmetic
    timeModel/      the probabilistic spawn/growth model
    expansion/      the plot expansion optimizer
    pages/          Solver, Designer, Planner pages
    data/           dataset store, wiki sync overlay, shipped precompute
  items/          crafting trees, bazaar prices, wiki images and recipes
  island/         the Island page's data layer: paste codes, live feed,
                  Hypixel API client, feed merging, profile access state
  nbt/            a small NBT reader/writer for decoding game item data
  accessories/    the accessories catalogue and its wiki parsers
  shards/         profile import for the fusion calculator
  inventory/      the "what do I own" aggregation the planner reads
  profile/        game mode (ironman vs normal) store
  pages/          top-level pages (Dashboard, Items, Island, Fusion, Settings...)
  ui/             shared kit: panels, icons, brand
tools/            build and verification scripts (data pipeline, parity, bench)
public/greenhouse/data.json   the greenhouse dataset the solver reads
docs/             design notes and specs (see docs/README.md)
```

The companion Fabric mod is its own project with its own repository and
licence (MIT). The contract between the mod and this site, wire format and
all, is written down in [island-data-spec.md](island-data-spec.md). Both sides
implement that document exactly; anything not in it is not part of the
contract.

Routing starts in `src/App.tsx`, which is also a decent map of the site.

## Running things

| Command | What it does |
|---|---|
| `pnpm dev` | dev server |
| `pnpm test` | the test suite (vitest, roughly 1,700 tests) |
| `pnpm lint` | eslint |
| `pnpm bench` | solver benchmark |
| `pnpm check` | solves the full planner burst in the terminal and prints the numbers |
| `pnpm parity` | compares the local solver and expansion optimizer against recorded remote baselines |

The test suite is fast and there is no reason not to run it before and after a
change. If you touch a parser or the solver, run the relevant parity or
robustness tool in `tools/` too.

## The data pipeline

The greenhouse dataset (mutation requirements, crop data) originates on the
Hypixel SkyBlock Wiki and flows through `tools/`:

```sh
pnpm data:sync        # dump wiki -> rebuild dataset -> crosscheck -> rebuild precompute
pnpm data:check       # verify the dataset against the wiki without writing
pnpm data:precompute  # rebuild only the solver precompute
```

`pnpm data:sync` is the whole chain in order. It fetches the wiki pages,
rebuilds `public/greenhouse/data.json`, cross-checks the result, and then
rebuilds the solver precompute.

### When to regenerate the precompute

The planner's opening burst (about forty single-mutation solves) is solved at
build time and shipped in `src/greenhouse/data/solverPrecompute.json`, because
a cold burst costs the visitor seventeen seconds of spinner for answers that
are the same for everyone.

Regenerate it (`pnpm data:precompute`) whenever the dataset changes, whether
from `data:sync` or a manual edit. Every entry is stamped with a fingerprint
of the dataset it was solved against, and at runtime the site refuses any
entry whose fingerprint does not match, falling back to a live solve. So a
stale precompute degrades to slow, never to wrong, but there is no reason to
ship it stale: `pnpm data:precompute:check` compares a fresh build against the
committed file and exits non-zero when they differ, so CI can catch it.

The precompute builder validates every layout for legality, asserts its
encoding assumptions, and round-trips each entry through the runtime decoder
before writing anything. An illegal layout is a build failure, not a shipped
bug.

## The honesty rules

These are the rules the codebase runs on. They are enforced in code and in
review, and a change that breaks one will be asked to fix it, however good the
rest of the change is.

**A label is a claim, and claims need proof.** The solver returns OPTIMAL only
when the result meets a bound it proved; otherwise it returns FEASIBLE and
states the bound it was working against. The same discipline runs through the
time model: every number is either cited to the wiki page it came from or
marked as an assumption, with the in-game test that would settle it. See
[greenhouse-time-research.md](greenhouse-time-research.md) for what that looks
like in practice.

**Never render an unknown as a zero.** "We could not read your accessory bag"
and "you own nothing" are different facts, and the Island page keeps four
different kinds of nothing apart. If a change would put a number on screen
that nobody computed, it is wrong.

**Wiki content is runtime-loaded, never bundled.** Wiki text, data, and images
are CC BY-NC-SA, and this project stays clear of those terms by not
redistributing them: the visitor's own browser fetches from the wiki at
runtime, exactly as if they visited it directly. Do not commit wiki images,
recipe dumps, or wiki text into the repo or the build. This has been done and
deliberately undone before (13MB of icons were deleted, not shipped).
`NOTICE.md` has the full reasoning.

**Parsers of game output get verbatim fixtures.** Anything that parses text
the game, the wiki, or the Hypixel API produced is tested against real
captured output, copied verbatim, not against handwritten approximations of
it. The accessories tests, the island code tests, and the NBT round-trip tests
all work this way. A parser tested against a guessed format is a parser that
works until it meets reality, and the companion mod applies the same rule (its
crop countdown parser is written but switched off until someone records the
real screen).

**One derivation per number.** When two pages show the same figure, they call
the same function. The Planner and the Dashboard both read
`planner/planEstimates.ts` because they once each derived progress themselves
and disagreed on screen. If your change needs a number that already exists
somewhere, import it; do not re-derive it.

**Measure, don't assume.** Solver tuning values in this codebase carry the
measurements that chose them, in comments, including the wrong guesses along
the way. If you change a constant, bring the measurement that justified it.

## Licensing

The picture has three layers, and `NOTICE.md` is the authoritative record:

- **This repository** is MIT, and the grant in `LICENSE` covers the whole
  history of the codebase, from the very first commit.
- **SkyShards heritage.** The fusion calculator, greenhouse solver and
  designer are derived from SkyShards by Campion and xKapy. The main SkyShards
  repo is MIT. The greenhouse branch's licence is pending: the owner has given
  explicit permission in writing and said an MIT licence will follow, and
  `NOTICE.md` tracks that until the formal licence lands.
- **Community inspiration and implementation reference.** SkyCrypt is an
  important product and interface reference. SkyOcean's chest-tracking and
  sack-handling features informed the standalone mod design. The Skydex
  implementation was rewritten for its own Java/Fabric transport and data
  model; no SkyOcean source files or non-code assets are copied into Skydex.
  `NOTICE.md` records the distinction.
- **Wiki data** is CC BY-NC-SA and is never redistributed by this project
  (see the honesty rules above).

The companion mod is MIT, in its own repository.

If your contribution pulls in outside code or assets, say where it came from
and under what licence, and add an entry to `NOTICE.md` if it needs one. "I
found it somewhere" is not a provenance.

## Filing a good suggestion

Screenshots are ground truth here. The best bug reports in this project's
history were a screenshot of the site next to a screenshot of the game
disagreeing with it, and several of those screenshots became test fixtures.

A report that can be acted on has:

1. **What page**, and what you did to get there.
2. **What you expected**, and why (a wiki link or an in-game screenshot is
   ideal).
3. **What you saw instead**, as a screenshot. Exact text copied verbatim
   beats a paraphrase, especially for anything a parser touched.
4. If it involves the mod or the Island page: the output of
   `/skydex status` in game, copied as-is.

For suggestions rather than bugs, say what problem you are trying to solve,
not just the feature you have in mind. The planner's plot sizing, the harvest
window display, and the progress arithmetic all started as "this number
confused me" reports, and those turned out to be the most valuable kind.
