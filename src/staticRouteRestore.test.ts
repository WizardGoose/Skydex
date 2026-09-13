import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { restoreStaticRoute } from "./staticRouteRestore";

function browser(current: string, pending: string | null) {
  const address = new URL(current, "https://skydex.test");
  const values = new Map(pending === null ? [] : [["pathToRedirect", pending]]);
  const state = { idx: 2, key: "existing" };
  const target = {
    location: address,
    sessionStorage: {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      removeItem: vi.fn((key: string) => { values.delete(key); }),
    },
    history: {
      state,
      replaceState: vi.fn((_state: unknown, _unused: string, url?: string | URL | null) => {
        if (url) address.href = new URL(url, address).href;
      }),
    },
  };
  return { target, values };
}

describe("static route restoration", () => {
  it("restores the complete requested URL before the router reads it", () => {
    const pending = "/profile?tab=accessories&q=A%20B#bag";
    const { target, values } = browser("/", pending);

    restoreStaticRoute(target);

    expect(target.location.pathname + target.location.search + target.location.hash).toBe(pending);
    expect(target.history.replaceState).toHaveBeenCalledWith(target.history.state, "", pending);
    expect(values.has("pathToRedirect")).toBe(false);
    restoreStaticRoute(target);
    expect(target.history.replaceState).toHaveBeenCalledTimes(1);
  });

  it("consumes an already-restored token instead of replaying it after navigation", () => {
    const { target, values } = browser("/profile", "/profile");
    restoreStaticRoute(target);
    expect(values.has("pathToRedirect")).toBe(false);
    target.location.pathname = "/greenhouse";
    restoreStaticRoute(target);
    expect(target.location.pathname).toBe("/greenhouse");
    expect(target.history.replaceState).not.toHaveBeenCalled();
  });

  it.each(["/greenhouse", "/profile?tab=inventory", "/?tour=1"])(
    "keeps an explicit current location %s ahead of an old redirect",
    (current) => {
      const { target, values } = browser(current, "/profile");
      restoreStaticRoute(target);
      expect(target.history.replaceState).not.toHaveBeenCalled();
      expect(values.size).toBe(0);
    },
  );

  it.each(["https://example.test/profile", "//example.test/profile", "/\\example.test", "/profile\n", ""])(
    "discards an invalid handoff %j",
    (pending) => {
      const { target, values } = browser("/", pending);
      restoreStaticRoute(target);
      expect(target.history.replaceState).not.toHaveBeenCalled();
      expect(values.size).toBe(0);
    },
  );

  it("keeps startup available when session storage is blocked", () => {
    const { target } = browser("/", "/profile");
    target.sessionStorage.getItem.mockImplementation(() => { throw new Error("Storage blocked"); });
    expect(() => restoreStaticRoute(target)).not.toThrow();
    expect(target.history.replaceState).not.toHaveBeenCalled();
  });

  it("restores before constructing the router, never through a post-render history event", () => {
    const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const wrapper = readFileSync(new URL("./components/AppWithRedirect.tsx", import.meta.url), "utf8");
    expect(app.indexOf("restoreStaticRoute(window)")).toBeLessThan(app.indexOf("const router = createBrowserRouter("));
    expect(wrapper).not.toContain("replaceState");
    expect(wrapper).not.toContain("PopStateEvent");
  });
});
