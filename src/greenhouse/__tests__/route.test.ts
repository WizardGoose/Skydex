import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { GreenhouseHashRoute } from "../GreenhouseHashRoute";
import {
  greenhouseHref,
  greenhouseTargetFromLocation,
  legacyGreenhouseHref,
  parseGreenhouseHash,
} from "../route";

describe("Greenhouse fragment routes", () => {
  it("defaults unknown or empty fragments to Planner while preserving a query", () => {
    expect(parseGreenhouseHash("")).toEqual({ tool: "planner", search: "" });
    expect(parseGreenhouseHash("#planner")).toEqual({
      tool: "planner",
      search: "",
    });
    expect(parseGreenhouseHash("#solver")).toEqual({ tool: "solver", search: "" });
    expect(parseGreenhouseHash("#designer?layout=AbC_-09")).toEqual({
      tool: "designer",
      search: "?layout=AbC_-09",
    });
    expect(parseGreenhouseHash("#unknown?layout=keep-me")).toEqual({
      tool: "planner",
      search: "?layout=keep-me",
    });
  });

  it("builds canonical tool links without serializing the payload", () => {
    expect(greenhouseHref("planner")).toBe("/greenhouse#planner");
    expect(greenhouseHref("designer", "?layout=AbC_-09")).toBe(
      "/greenhouse#designer?layout=AbC_-09",
    );
  });

  it("reads Planner targets from canonical fragment links and standard queries", () => {
    expect(greenhouseTargetFromLocation("#planner?target=rose%20dragon")).toBe(
      "rose dragon",
    );
    expect(greenhouseTargetFromLocation("#planner", "?target=rose_dragon_pet")).toBe(
      "rose_dragon_pet",
    );
    expect(greenhouseTargetFromLocation("#solver?target=ignore-me")).toBeNull();
    expect(greenhouseTargetFromLocation("#planner?target=%E0%A4%A")).toBeNull();
  });

  it("maps only obsolete nested Greenhouse paths to their fragment equivalents", () => {
    expect(legacyGreenhouseHref("/greenhouse/planner", "?target=soggybud")).toBe(
      "/greenhouse#planner?target=soggybud",
    );
    expect(legacyGreenhouseHref("/greenhouse/designer", "?layout=AbC_-09")).toBe(
      "/greenhouse#designer?layout=AbC_-09",
    );
    expect(legacyGreenhouseHref("/greenhouse", "")).toBeNull();
  });
});

describe("GreenhouseHashRoute", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["Planner", "/greenhouse#planner", "planner"],
    ["Solver", "/greenhouse#solver", "solver"],
    ["Designer", "/greenhouse#designer", "designer"],
    ["the first Designer payload", "/greenhouse#designer?layout=first", "designer"],
    ["the next Designer payload", "/greenhouse#designer?layout=second", "designer"],
  ])("keeps the old %s link on the one greenhouse workspace", (_name, entry, label) => {
    const Workspace = ({ focusTool }: { focusTool: string }) =>
      createElement("section", { "data-greenhouse-workspace": "", "data-focus-tool": focusTool });
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: [entry] },
        createElement(GreenhouseHashRoute, {
          Workspace,
        }),
      ),
    );

    expect(markup.match(/data-greenhouse-workspace/g)).toHaveLength(1);
    expect(markup).toContain(`data-focus-tool="${label}"`);
  });

  it("uses the Router hash when internal navigation differs from the native hash", () => {
    // A React Router Link can update router state through history.pushState
    // without dispatching hashchange. The controller must follow the router's
    // location, not retain the prior native hash.
    vi.stubGlobal("window", { location: { hash: "#planner" } });
    const Workspace = ({ focusTool }: { focusTool: string }) =>
      createElement("span", { "data-focus-tool": focusTool }, focusTool);

    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ["/greenhouse#solver"] },
        createElement(GreenhouseHashRoute, {
          Workspace,
        }),
      ),
    );

    expect(markup).toContain("solver");
    expect(markup).toContain('data-focus-tool="solver"');
  });

  it("forwards a decoded target to the mounted workspace adapter", () => {
    const Workspace = ({
      focusTool,
      linkedTarget,
    }: {
      focusTool: string;
      linkedTarget: string | null;
    }) => createElement("span", {
      "data-focus-tool": focusTool,
      "data-linked-target": linkedTarget ?? "",
    });

    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ["/greenhouse#planner?target=rose%5Fdragon%5Fpet"] },
        createElement(GreenhouseHashRoute, { Workspace }),
      ),
    );

    expect(markup).toContain('data-focus-tool="planner"');
    expect(markup).toContain('data-linked-target="rose_dragon_pet"');
  });
});
