import { describe, expect, it } from "vitest";
import {
  layoutCodeFromDesignerLocation,
  nextDesignerLayoutCode,
} from "../designerRoute";
import { sharedDesignerLocation } from "../route";

describe("Designer fragment layout input", () => {
  it("rejects an empty canonical layout slot", () => {
    expect(() => layoutCodeFromDesignerLocation("#designer?layout=", "")).toThrow(
      /layout slot but nothing in it/i,
    );
  });

  it("rejects an empty canonical layout slot before another fragment parameter", () => {
    expect(() => layoutCodeFromDesignerLocation("#designer?layout=&tab=grid", "")).toThrow(
      /layout slot but nothing in it/i,
    );
  });
});

describe("Designer shared-link loading", () => {
  it("processes a shared layout once even when React replays the effect", () => {
    const hash = "#designer?layout=abc123";

    expect(nextDesignerLayoutCode(null, hash, "")).toBe("abc123");
    expect(nextDesignerLayoutCode("abc123", hash, "")).toBeNull();
  });

  it("still loads a different shared layout without remounting the page", () => {
    expect(nextDesignerLayoutCode("abc123", "#designer?layout=def456", "")).toBe("def456");
  });

  it("turns the crawler-visible share path back into the normal Designer location", () => {
    expect(sharedDesignerLocation("AbC_-09")).toEqual({
      pathname: "/greenhouse",
      search: "?layout=AbC_-09",
      hash: "#designer",
    });
  });
});
