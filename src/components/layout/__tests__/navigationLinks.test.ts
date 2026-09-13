import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Navigation } from "../Navigation";

describe("Navigation support links", () => {
  it("keeps masthead subrows above its owned backdrop layer", () => {
    const source = readFileSync(new URL("../Navigation.tsx", import.meta.url), "utf8");

    expect(source).toContain('className="sd-tools relative z-10');
    expect(source).toContain('<div className="relative z-10 space-y-2');
  });

  it("uses the compact Recipes and Storage destinations in the masthead", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/storage"] },
        React.createElement(Navigation)
      )
    );

    expect(markup).toContain('href="/recipes"');
    expect(markup).toContain(">Recipes<");
    expect(markup).toContain('href="/storage"');
    expect(markup).toContain(">Storage<");
    expect(markup).not.toContain(">Crafting<");
    expect(markup).not.toContain(">Forge<");
    expect(markup).toMatch(/<a(?=[^>]*href="\/storage")(?=[^>]*aria-current="page")[^>]*>/);
  });

  it("keeps the public Profile Viewer inside the Profile section", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/pv/Technoblade"] },
        React.createElement(Navigation)
      )
    );

    expect(markup).toContain('href="/profile"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain(">Profile<");
    expect(markup).not.toContain(">PV<");
  });

  it("opens the unified Shards workspace without a secondary tools strip", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/shards"] },
        React.createElement(Navigation)
      )
    );

    expect(markup).toContain('href="/shards"');
    expect(markup).toMatch(/<a(?=[^>]*href="\/shards")(?=[^>]*aria-current="page")[^>]*>/);
    expect(markup).not.toContain('class="sd-tools');
    expect(markup).not.toContain(">Fusion<");
    expect(markup).not.toContain(">Lines<");
  });

  it("opens one Greenhouse workspace without the retired mode links", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/greenhouse#designer"] },
        React.createElement(Navigation)
      )
    );

    expect(markup).toContain('href="/greenhouse"');
    expect(markup).not.toContain('class="sd-tools');
    const source = readFileSync(new URL("../Navigation.tsx", import.meta.url), "utf8");
    expect(source).not.toContain('label: "Planner"');
    expect(source).not.toContain('label: "Solver"');
    expect(source).not.toContain('label: "Designer"');
  });

  it("exposes GitHub and Ko-fi as safe external links", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/greenhouse#designer"] },
        React.createElement(Navigation)
      )
    );

    expect(markup).toContain('href="https://github.com/WizardGoose/Skydex"');
    expect(markup).toContain('aria-label="GitHub"');
    expect(markup).toContain('href="https://ko-fi.com/wizardgoose"');
    expect(markup).toContain('aria-label="Ko-fi"');
    expect(markup).toContain('aria-label="Report a bug on GitHub"');
    expect(markup).toContain('https://github.com/WizardGoose/Skydex/issues/new?');
    expect(markup.match(/target="_blank"/g)).toHaveLength(3);
    expect(markup.match(/rel="noreferrer"/g)).toHaveLength(3);
  });
});
