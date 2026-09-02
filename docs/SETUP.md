# Running Skydex on your own machine

This walks through it from nothing. It assumes you have never run a Node
project before, so it explains what each step is for rather than only what to
type. If you already know this, the three commands you want are in the
[README](../README.md).

Nothing here uploads anything, and nothing here needs a Skydex account, because
there is no such thing.

## 1. What you need first

Two pieces of software. Both are free.

**Node.js**, which runs JavaScript outside a browser. Skydex needs version
**20.19 or newer, or 22.12 or newer**. Node 21 and the early 22 releases will
not work, so if you are installing fresh, take the current LTS release from
[nodejs.org](https://nodejs.org).

**pnpm**, which fetches the libraries the project depends on. This project is
built with **pnpm 10.18.1**.

To check what you already have, open a terminal (Command Prompt or PowerShell
on Windows, Terminal on macOS or Linux) and run:

```sh
node --version
pnpm --version
```

If `node --version` prints something older than the versions above, install a
newer Node and check again. If `pnpm --version` says the command is not found,
install it with:

```sh
npm install -g pnpm
```

`npm` arrives with Node, so it is already there once Node is installed. If your
setup prefers Corepack, `corepack enable` also works and will match the version
this project pins.

## 2. Get the code

If you have Git:

```sh
git clone https://github.com/WizardGoose/Skydex.git
cd Skydex
```

If you do not, use the green **Code** button on the GitHub page, choose
**Download ZIP**, unzip it somewhere, and then open a terminal in the folder you
unzipped. Everything after this point assumes your terminal is inside that
folder. If a command says it cannot find `package.json`, you are in the wrong
folder.

## 3. Install the dependencies

```sh
pnpm install
```

This reads `package.json`, downloads the libraries into a `node_modules` folder,
and does not touch anything outside the project. It takes a few minutes the
first time. You only need to run it again when the dependencies change.

## 4. Run it

```sh
pnpm run dev
```

The terminal prints an address, normally `http://localhost:5173`. Open that in
your browser. Leave the terminal window open: it is the server, and closing it
stops the site. Press `Ctrl+C` in that terminal when you want to stop.

While this is running, edits you make to the source appear in the browser
almost immediately, without a reload.

## 5. Connect a Minecraft profile locally (optional)

The live site at `skydex.ca` uses Skydex's approved production connection. A
local `pnpm run dev` session uses the same public `api.skydex.ca` connection.

1. In Skydex, open **Settings**.
2. Enter a Minecraft username or UUID and connect it.

The browser sends only the account identifier and an anonymous browser id to
`api.skydex.ca`. Cloudflare holds the private Hypixel credential.

## 6. Look at a production build

The dev server is not what visitors get. To build the site the way it is
actually shipped and then serve that:

```sh
pnpm start
```

That runs the build and then serves the result at `http://localhost:4180`. This
is the version to check before publishing anything, because the dev server is
more forgiving than a real static host. Its profile connection expects the
Cloudflare Worker at `api.skydex.ca`, so profile pulls work in this preview once
that Worker has been deployed.

To build the GitHub Pages artifact locally:

```sh
pnpm run build:pages
```

That creates the same root-based artifact the GitHub Pages workflow publishes
for `https://skydex.ca`.

## 7. If something goes wrong

**The address is already in use.** Vite will normally pick the next free port on
its own and print the address it actually used, so read the terminal rather than
assuming 5173. If you have another copy of Skydex running in another terminal,
stop that one first with `Ctrl+C`.

**`pnpm` is not recognised.** The `npm install -g pnpm` step did not finish, or
the terminal was opened before it ran. Close the terminal, open a new one, and
check `pnpm --version` again. A new terminal is genuinely often the fix, because
the old one has a stale copy of your PATH.

**`pnpm install` fails partway.** Run it again first, since a dropped download
is the common cause. If it still fails, check `node --version` against the
requirement at the top: an unsupported Node is the next most likely cause. On
Windows, a project folder inside OneDrive or behind a very long path can also
cause odd file errors, so try a short path such as `C:\dev\Skydex`.

**The page loads but item images and recipes do not.** Those are fetched live
from the Hypixel SkyBlock Wiki by your own browser. A network that blocks it, or
being offline, produces exactly this. The greenhouse solver still works offline;
the wiki-backed pages cannot.

**A deep link works locally but 404s on a published site.** That is the
`public/404.html` and `src/components/AppWithRedirect.tsx` pair. Both have to be
present, and the base path in `404.html` has to match the repo name. The
[README](../README.md) explains how the two fit together.

## Where to go next

[docs/contributing.md](contributing.md) covers the shape of the codebase, the
data pipeline and the checks a change has to pass before it lands.
