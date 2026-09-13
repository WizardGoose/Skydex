# Contributing to Skydex

Suggestions, bug reports, documentation fixes and code contributions are all
welcome. If there's something you'd like Skydex to do, [open an
issue](https://github.com/WizardGoose/Skydex/issues) and describe it.

For a larger change, an issue is a good place to work through the idea before
spending time building it. Small fixes can go straight into a pull request.

## Getting started

Use Node 20.19+ within Node 20, or 22.12+, and pnpm 10.18.1.
The [setup guide](SETUP.md) covers installation and cloning the repository.

```sh
pnpm install
pnpm dev
```

Open the address printed in your terminal. No environment file or personal
Hypixel API key is needed to run the website. Profile requests use Skydex's
hosted API; calculations, including the greenhouse solver, run in the browser.

The Fabric mod is in [`mod/`](../mod/) in this repository. It uses Java 25 JDK
and its included Gradle wrapper. See the [README's build
commands](../README.md#build-commands) to build the website, mod or both.

## Finding your way around

| Location | Contains |
| --- | --- |
| `src/App.tsx` | Routes and page entry points |
| `src/pages/` | Main site pages and settings |
| `src/profile-view/` | Profile sections and their shared layout |
| `src/items/`, `src/accessories/`, `src/networth/` | Item data, acquisition and valuation |
| `src/greenhouse/` | Plot editing, solver, planning and growth estimates |
| `src/shards/`, `src/inventory/` | Shard data and saved holdings |
| `src/island/` | Profile requests, mod snapshots, imports and data merging |
| `src/nbt/` | Reading encoded Minecraft item data |
| `src/ui/` | Shared controls, item artwork and styling |
| `mod/` | Fabric mod source, tests and build files |
| `tools/` | Build scripts, benchmarks and data checks |

The [mod data reference](architecture/island-data-contract.md) covers the
formats shared by the website and mod.

## Checking a change

Run the tests that cover the behaviour you changed. For example:

```sh
pnpm exec vitest run src/island/__tests__
```

These commands are also available:

| Command | What it does |
| --- | --- |
| `pnpm test` | Runs the website test suite |
| `pnpm lint` | Checks code style and common mistakes |
| `pnpm run build:site` | Type-checks and builds the website |
| `pnpm run build:mod` | Tests and builds the Fabric mod |
| `pnpm bench` | Benchmarks the greenhouse solver |
| `pnpm check` | Runs the greenhouse planner calculations in the terminal |
| `pnpm parity:solver` | Compares solver results with recorded baselines |
| `pnpm parity:expansion` | Compares expansion results with recorded baselines |
| `pnpm parity:networth` | Compares valuation with SkyHelper-Networth |

For a UI change, check the page in a browser at desktop and phone widths,
including the controls and states you changed. For a parser or calculation
fix, include a regression test that reproduces the problem.

A few things to preserve when working on the tools:

- Missing or private data is different from an empty inventory. Keep those
  states separate, and retain the source and age of saved data.
- Reuse existing calculations and shared UI where they already do the same
  job. Equivalent values on different pages should agree.
- Keep saved plans and older export codes readable when changing a format.
- Use representative game or API input when testing parsers. Remove personal
  identifiers from fixtures before committing them.
- Keep the source of game rules beside the calculation. For a solver change,
  check both the validity of its layouts and its performance. An optimality
  label requires a proven bound.

## Greenhouse data

The solver reads `public/greenhouse/data.json`. Common layouts are precomputed
in `src/greenhouse/data/solverPrecompute.json`; custom plots are solved in the
browser.

When changing the dataset, record the source for the new values and regenerate
the precomputed layouts:

```sh
pnpm data:precompute
pnpm data:precompute:check
```

The precompute records a dataset fingerprint. A mismatch makes the website
solve the layout locally instead of using results from a different dataset.
The check command validates the generated file against the committed version.

## Pull requests

Explain what changed, why it helps, and how you checked it. Include screenshots
for a visual change and a short reproduction for a bug fix. Keep unrelated
changes in separate pull requests so they are easier to review.

Skydex's code is [MIT licensed](../LICENSE). Keep existing attribution, and
record the source and licence of any outside code or assets you add in
[NOTICE.md](../NOTICE.md). Game data and artwork can have different terms;
check the relevant notice before bundling them.

## Bug reports and requests

For a bug, include the page, what you tried, what you expected and what
happened. Your device, browser and a screenshot help. For a wrong calculation,
include the item or mutation, quantity and relevant settings. Exact game text
is useful when something has been read incorrectly.

For a mod problem, include the Minecraft version and Skydex mod version too.
Check screenshots and diagnostic output for anything personal before posting.

For a feature request, tell me what you'd like to do with Skydex. A description
or example is enough to start the conversation.
