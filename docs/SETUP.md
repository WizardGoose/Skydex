# Running Skydex on your own machine

This guide covers downloading the code and running Skydex locally. You can
also use [skydex.ca](https://skydex.ca) without installing anything.

If you already have the tools installed, the [README](../README.md#run-it-locally)
has the short version.

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

This reads `package.json`, downloads the libraries into pnpm's package store,
and links them into the project's `node_modules` folder. You only need to run
it again when the dependencies change.

## 4. Run it

```sh
pnpm run dev
```

The terminal prints an address, normally `http://localhost:5173`. Open that in
your browser. Leave the terminal window open: it is the server, and closing it
stops the site. Press `Ctrl+C` in that terminal when you want to stop.

While this is running, edits you make to the source appear in the browser
almost immediately, without a reload.

### Open the development site on a phone

Run `pnpm dev --host 0.0.0.0`, then open the printed Network address on a phone
connected to the same local network. Profile reads pass through the local dev
server to `api.skydex.ca`; the hosted service otherwise rejects private network
browser origins. This relay only supports Skydex's four profile read endpoints,
preserves the browser's anonymous rate-limit ID, and forwards no local cookies
or credentials. Published builds contact the hosted API directly.

### Safari and other browsers

Use Safari/iOS **16.4 or newer**, Chrome/Edge **111 or newer**, or Firefox
**128 or newer**. These are the [Tailwind 4 browser requirements](https://tailwindcss.com/docs/compatibility).
Safari 16.4 also added the [compression streams](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)
used to read compressed profile inventory and island codes. Keep the browser
updated for fixes to those features. Build-time JavaScript compilation does not
provide missing browser APIs.

The plain HTTP phone preview can load profiles without the secure-context Cache
API or `crypto.randomUUID`: the transport uses its in-memory cache and
`crypto.getRandomValues` fallback. A fresh page may therefore need to fetch again.
Browser data is separate for each device and address; localhost settings do not
automatically transfer to the Network address. Clipboard sharing requires HTTPS
in Safari; this limitation does not prevent choosing targets or loading profiles.

## 5. Connect a Minecraft profile (optional)

Most of the site works without a profile. Connecting one fills in your sacks,
gear, net worth, game mode and the other player-specific views.

1. In Skydex, open **Settings**.
2. In **General**, enter your Minecraft username or UUID and press
   **Connect**.

You do not need a personal Hypixel API key. The hosted site and a local Skydex
checkout both ask `api.skydex.ca` for the profile using Skydex's approved
application access. Your browser sends the account UUID or selected profile ID,
plus a random anonymous rate-limit ID; it does not send a Hypixel credential.
The [Privacy Policy](https://skydex.ca/privacy-policy) records the full request
and caching path.

## 6. Look at a production build

To build and preview the version that will be served to visitors:

```sh
pnpm start
```

That runs the build and serves the result on port `4180`, or the next free
port if it is busy. Open the address printed in the terminal and check the
built site before publishing.

To build the GitHub Pages artifact locally:

```sh
pnpm run build:pages
```

That creates the same root-based artifact the GitHub Pages workflow publishes
for `https://skydex.ca`.

## 7. If something goes wrong

**The address is already in use.** Vite will normally pick the next free port on
its own and print the address it actually used, so open that address rather
than assuming 5173. You can leave another copy running if you still need it.

**`pnpm` is not recognised.** The `npm install -g pnpm` step did not finish, or
the terminal was opened before it ran. Close the terminal, open a new one, and
check `pnpm --version` again. The new terminal picks up any changes to PATH.

**`pnpm install` fails partway.** Run it again first, since a dropped download
is a possible cause. If it still fails, check `node --version` against the
requirement at the top: an unsupported Node is the next most likely cause. On
Windows, a project folder inside OneDrive or behind a very long path can also
cause odd file errors, so try a short path such as `C:\dev\Skydex`.

**The page loads but item images and recipes do not.** The browser fetches
these from online sources, including the Hypixel SkyBlock Wiki. Check your
connection and whether the source is reachable. The greenhouse solver runs
locally, but loading new game data and artwork still needs a connection.

**A deep link works locally but 404s on a published site.** Check the
`public/404.html` and `src/staticRouteRestore.ts` pair. Both have to be present,
and the build's base path and fallback entry address must match where you host
the site. Skydex uses `/` on skydex.ca. The
[README's configuration section](../README.md#configuration) explains how the
two fit together.

## Where to go next

[docs/contributing.md](contributing.md) covers the shape of the codebase, the
data pipeline and the checks a change has to pass before it lands.
