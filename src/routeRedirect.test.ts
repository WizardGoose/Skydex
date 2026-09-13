import { describe, expect, it } from "vitest";
import {
  canonicalLocalReviewUrl,
  legacyProfileRedirectTarget,
  preservedRedirectTarget,
} from "./routeRedirect";

describe("legacy route redirects", () => {
  it("preserves query and hash state when changing the canonical path", () => {
    expect(preservedRedirectTarget("/shards", { search: "?q=ananke", hash: "#route" })).toEqual({
      pathname: "/shards",
      search: "?q=ananke",
      hash: "#route",
    });
  });

  it("normalizes missing search and hash values", () => {
    expect(preservedRedirectTarget("/recipes", {})).toEqual({ pathname: "/recipes", search: "", hash: "" });
  });

  it("moves legacy root Profile tabs to the current Profile route", () => {
    expect(legacyProfileRedirectTarget({ search: "?tab=accessories&settings=1", hash: "#bag" })).toEqual({
      pathname: "/profile",
      search: "?tab=accessories&settings=1",
      hash: "#bag",
    });
  });

  it("leaves Home-only and unknown query state on Home", () => {
    expect(legacyProfileRedirectTarget({ search: "?tour=1" })).toBeNull();
    expect(legacyProfileRedirectTarget({ search: "?tab=not-a-profile-tab" })).toBeNull();
  });
});

describe("local review origin", () => {
  it("folds localhost:7070 into the linked 127.0.0.1 browser store", () => {
    expect(canonicalLocalReviewUrl({
      protocol: "http:",
      hostname: "localhost",
      port: "7070",
      pathname: "/profile",
      search: "?settings=1",
      hash: "#connections",
    })).toBe("http://127.0.0.1:7070/profile?settings=1#connections");
  });

  it("does not rewrite production or unrelated local ports", () => {
    const location = {
      protocol: "https:",
      hostname: "skydex.ca",
      port: "",
      pathname: "/profile",
      search: "",
      hash: "",
    };
    expect(canonicalLocalReviewUrl(location)).toBeNull();
    expect(canonicalLocalReviewUrl({ ...location, protocol: "http:", hostname: "localhost", port: "5173" })).toBeNull();
  });
});
