import React from "react";
import { Link } from "react-router-dom";

/**
 * Privacy policy.
 *
 * The setting is one column at a readable measure, sections separated by a rule
 * rather than boxed, links in the site accent. The opening paragraph is upright
 * rather than italic: italic is a real legibility cost over three lines of 14px
 * on a dark ground, and this is the page's one explainer, not an aside.
 *
 * The words are a description of what the code does, so they are only correct
 * as long as that stays true. Every claim below is checkable against a specific
 * file: the production profile path against `cloudflare/hypixel-api-worker.js`
 * and `src/island/hypixelTransport.ts`, the remaining outbound hosts against
 * the `fetch` calls in `src/island`, `src/items`, `src/accessories` and
 * `src/networth`, and browser storage against `src/ui/backdrop.ts` and
 * `src/utilities/localStorage.ts`. If a change adds a network call or a new
 * store, this page is part of that change.
 */

const P = "text-sm leading-[1.8] text-slate-300";
const UL = "list-disc space-y-1.5 pl-5 text-sm leading-[1.8] text-slate-300 marker:text-slate-500";
const LINK = "text-emerald-300 underline decoration-emerald-500/40 underline-offset-4 transition-colors hover:decoration-emerald-400";
const HOST = "font-semibold text-slate-100";

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mt-10 border-t border-slate-800 pt-8">
    <h2 className="mb-3 text-base font-semibold text-slate-100">{title}</h2>
    <div className="space-y-4">{children}</div>
  </section>
);

const PrivacyPolicy: React.FC = () => (
  <div className="mx-auto w-full max-w-[65ch] px-1 py-10">
    <header>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Privacy Policy</h1>
      <div className="mt-3 h-px bg-gradient-to-r from-emerald-500/60 via-slate-800 to-transparent" />
      <p className="mt-4 text-sm leading-[1.8] text-slate-300">
        Skydex has no account system, profile database or advertising identity. The app is served as static files and its calculations happen on your
        device. Authenticated Hypixel profile requests pass through the narrow Cloudflare Worker described below, where successful responses may be
        cached briefly and retained as a fallback for up to 24 hours. A shared Designer link may pass through the same Worker for a stateless preview. This page describes each path
        and what it keeps.
      </p>
    </header>

    <Section title="What Skydex collects">
      <p className={P}>Skydex does not build a user database or a history of player activity.</p>
      <ul className={UL}>
        <li>No accounts, no sign-up, no email address.</li>
        <li>
          No browser analytics, advertising telemetry or tracking script. The profile Worker records aggregate service-health numbers such as cache
          hits and remaining Hypixel capacity, without names, UUIDs, IP addresses or browser ids.
        </li>
        <li>No advertising, and no ad network.</li>
        <li>
          No cookies. Skydex never reads or writes <span className={HOST}>document.cookie</span>.
        </li>
      </ul>
    </Section>

    <Section title="Skydex&rsquo;s Hypixel connection">
      <p className={P}>
        Skydex.ca uses the application access approved for Skydex. Visitors connect a Minecraft account and do not provide Hypixel credentials.
      </p>
      <ul className={UL}>
        <li>The private credential is an encrypted Cloudflare Worker secret. It is not in the source, website build, browser storage or a web address.</li>
        <li>
          Only the Worker reads it, and only to call the exact Profile, Garden and Museum routes Skydex uses at{" "}
          <span className={HOST}>api.hypixel.net</span>.
        </li>
        <li>The Worker never returns the credential or Hypixel&rsquo;s authentication response details to the browser.</li>
        <li>Credential data saved by an older live version is removed on first load, while the saved Minecraft account and profile choice remain.</li>
      </ul>
    </Section>

    <Section title="Where your browser connects">
      <p className={P}>
        These are the sources your browser or the production Worker contacts, and what each one can see:
      </p>
      <ul className={UL}>
        <li>
          <span className={HOST}>api.skydex.ca/v1/hypixel</span>, for authenticated profile data. Your browser sends the Minecraft UUID or selected
          profile id plus a random anonymous browser id. The id contains no authentication data and is used only for short-lived abuse limits. Cloudflare also
          provides the connecting IP address; the Worker turns it into an opaque temporary counter key and does not write it to Skydex telemetry. The
          Worker validates and authorizes the request, then asks <span className={HOST}>api.hypixel.net</span>. Fresh answers remain in the
          Worker cache for 5 to 30 minutes depending on the data, with the last good answer retained for up to 24 hours. The same snapshot may remain
          in this browser for up to 24 hours so changing pages does not request it again. Skydex also reads Hypixel&rsquo;s public item, skill and bazaar
          lists directly; those require no authentication and say nothing about you.
        </li>
        <li>
          <span className={HOST}>playerdb.co</span>, and <span className={HOST}>api.ashcon.app</span> if the first does not answer, to turn a
          Minecraft username into a UUID. This happens only when you type a name in and connect, and the name is the only thing sent.
        </li>
        <li>
          <span className={HOST}>mc-heads.net</span>, to draw player heads, avatars and the 3D skin view. These are image requests, and the UUID or
          skin texture hash is part of the image address.
        </li>
        <li>
          <span className={HOST}>hypixelskyblock.minecraft.wiki</span> and{" "}
          <a href="https://minecraft.wiki" target="_blank" rel="noopener noreferrer" className={LINK}>
            minecraft.wiki
          </a>
          , for recipe, forge, shop and mutation data and a few images. Page names go out; nothing about you does.
        </li>
        <li>
          <span className={HOST}>raw.githubusercontent.com</span>, for two public data files: the SkyHelper price list behind the networth estimate,
          and the NotEnoughUpdates constants that describe accessory upgrade paths. Nothing about you is sent with either.
        </li>
      </ul>
      <p className={P}>
        Fonts are not on that list. Every typeface the site is set in is served from this site's own address, so no request for them goes to Google
        or anyone else, and no IP address is handed over to render text.
      </p>
      <p className={P}>
        The authenticated profile route is the only source request in this list that passes through Skydex&rsquo;s Worker. The other source requests are
        made directly by your browser.
      </p>
    </Section>

    <Section title="The companion mod">
      <p className={P}>
        Skydex does not contact the companion mod unless you choose <span className={HOST}>Link companion mod</span> in Settings. That deliberate
        click checks <span className={HOST}>127.0.0.1</span>, which is your own computer, and is when your browser may ask for local-device access.
        Once linked, Skydex listens for live updates and can send a greenhouse layout when you press its button. Unlinking stops those local
        connections without deleting your saved snapshot. The traffic never leaves your machine, and none of it is reachable from the network.
      </p>
    </Section>

    <Section title="What is kept in your browser">
      <p className={P}>
        Plenty is saved locally, because a tool that forgot your work every reload would be useless. Browser storage is not bulk-synced to Skydex;
        only the identifiers needed for a profile request leave when you connect or refresh.
      </p>
      <ul className={UL}>
        <li>
          <span className={HOST}>localStorage</span> holds your settings, saved planners and greenhouse layouts, owned-shard inventory, recent
          searches, the companion-mod link preference, your Minecraft account and profile choice, and cached copies of wiki and Hypixel data already
          fetched, so the site is not re-fetching the same lists on every visit. It also holds the random anonymous browser id used for API abuse
          limits. The live site stores no Hypixel credential supplied by a visitor.
        </li>
        <li>
          <span className={HOST}>sessionStorage</span> holds one entry, briefly. Opening a deep link on a static host lands on a fallback page first,
          and that entry is how the address you asked for survives the hop.
        </li>
        <li>
          <span className={HOST}>IndexedDB</span> holds files you chose yourself: a custom backdrop image, and a Minecraft resource pack if you loaded
          one. The file itself is stored, and it stays in the browser. Nothing about it is sent anywhere.
        </li>
        <li>
          <span className={HOST}>Cache Storage</span> may hold the last profiles, garden and museum snapshot for up to 24 hours. Skydex caps this
          cache and removes older entries as new ones arrive.
        </li>
      </ul>
      <p className={P}>
        Clearing site data for this site in your browser removes all of it, and the Settings page has buttons for the pieces you are most likely to
        want gone on their own.
      </p>
    </Section>

    <Section title="Hosting">
      <p className={P}>
        The static site is served by GitHub Pages, with Cloudflare handling the public skydex.ca connection in front of it. Like any host and delivery
        network, they receive ordinary request details such as your IP address, browser user agent, and requested path or query string. The profile
        Worker uses the anonymous browser id and an opaque network counter only to enforce request ceilings, and does not write either to Skydex
        telemetry or an application log. Successful Hypixel responses remain fresh at the edge for 5 to 30 minutes, with a last-good fallback retained
        for up to 24 hours. A Designer share link carries its encoded layout in
        the path so Cloudflare can render a Discord preview; the Worker decodes it in memory and discards it. Anything after a{" "}
        <span className={HOST}>#</span> stays in your browser. GitHub and Cloudflare apply their own privacy terms to the traffic they handle.
      </p>
    </Section>

    <Section title="Other sites">
      <p className={P}>
        A few links point off-site, to the wiki, to Hypixel, and to the projects Skydex is built on. Following one puts you under that site's privacy
        practices, which are theirs and not covered here.
      </p>
    </Section>

    <Section title="Contact">
      <p className={P}>
        Questions about any of this can go to the handles on the <Link to="/contact" className={LINK}>Contact page</Link>.
      </p>
    </Section>

    <Section title="Changes">
      <p className={P}>
        This page describes how the current version behaves. If the code starts doing something different, this page changes with it rather than after
        it.
      </p>
    </Section>
  </div>
);

export default PrivacyPolicy;
