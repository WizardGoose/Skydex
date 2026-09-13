import { describe, expect, it } from "vitest";
import { closeTourLocation, isTourRequested } from "../tourState";

describe("the in-place welcome", () => {
  it("recognizes an explicit welcome request independently of the current page", () => {
    expect(isTourRequested("?tour=1")).toBe(true);
    expect(isTourRequested("?tab=inventory&tour=1")).toBe(true);
    expect(isTourRequested("?tour=0")).toBe(false);
    expect(isTourRequested("")).toBe(false);
  });

  it.each(["/", "/shards", "/recipes", "/greenhouse", "/profile"])("keeps %s and its page state when closing a preview", (pathname) => {
    expect(closeTourLocation({ pathname, search: "?tab=inventory&tour=1&item=GILL_MEMBRANE", hash: "#materials" })).toEqual({
      pathname,
      search: "?tab=inventory&item=GILL_MEMBRANE",
      hash: "#materials",
    });
    expect(closeTourLocation({ pathname, search: "?tour=1", hash: "" })).toEqual({ pathname, search: "", hash: "" });
  });
});
