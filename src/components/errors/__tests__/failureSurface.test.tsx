
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../../layout/ErrorBoundary";
import FailureSurface from "../FailureSurface";
import {
  createFailureModel,
  createNotFoundModel,
  formatFailureDetails,
  isRouteResponseLike,
  sanitizeMessageText,
} from "../failureModel";

const failureCss = readFileSync(resolve(process.cwd(), "src/components/errors/failure-surface.css"), "utf8");

describe("failure surfaces", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("redacts credentials, ids, payload-shaped fields, and control characters", () => {
    const message = "Request failed apiKey=super-secret profile={members:[123]} 019fefd4-4871-78b3-9647-ecf458f0fe23\nstack";
    const safe = sanitizeMessageText(message + String.fromCharCode(1));
    expect(safe).not.toContain("super-secret");
    expect(safe).not.toContain("members");
    expect(safe).not.toContain("019fefd4");
    expect(safe).not.toContain("\u0001");
    expect(safe).toContain("[redacted]");
  });

  it("distinguishes thrown render, rejected data, and 404 failures", () => {
    const renderFailure = createFailureModel({
      error: new Error("component exploded"),
      route: "/island?tab=gear",
      source: "component",
      phase: "render",
    });
    expect(renderFailure.kind).toBe("render");
    expect(renderFailure.retryMode).toBe("remount");

    const dataFailure = createFailureModel({
      error: new TypeError("Failed to fetch"),
      route: "/items",
      source: "route",
      phase: "data",
    });
    expect(dataFailure.kind).toBe("data");
    expect(dataFailure.reason).toBe("network");
    expect(dataFailure.retryMode).toBe("revalidate");

    const notFoundData = createFailureModel({
      error: { status: 404, statusText: "Not Found" },
      route: "/items",
      source: "route",
      phase: "data",
    });
    expect(notFoundData.reason).toBe("not-found");
    expect(isRouteResponseLike({ status: 404 })).toBe(true);
  });

  it.each([
    new TypeError("Failed to fetch dynamically imported module: http://127.0.0.1:7070/src/profile-view/ProfileView.tsx"),
    new TypeError("error loading dynamically imported module: https://skydex.example/assets/profile.js"),
    new TypeError("Importing a module script failed."),
    Object.assign(new Error("Loading chunk profile failed."), { name: "ChunkLoadError" }),
  ])("reloads rejected module imports from either boundary: %s", (error) => {
    expect(createFailureModel({ error, source: "component", phase: "render" }).retryMode).toBe("reload");
    expect(createFailureModel({ error, source: "route" }).retryMode).toBe("reload");
  });

  it("retries a failed Profile import with a page reload instead of remounting its cached rejection", () => {
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    const boundary = new ErrorBoundary({ route: "/profile?tab=accessories" });
    boundary.state = ErrorBoundary.getDerivedStateFromError(new TypeError("Failed to fetch dynamically imported module: /src/profile-view/ProfileView.tsx"));
    const reset = vi.spyOn(boundary, "setState").mockImplementation(() => undefined);
    const fallback = boundary.render();
    expect(isValidElement<{ onRetry: () => void }>(fallback)).toBe(true);
    if (!isValidElement<{ onRetry: () => void }>(fallback)) throw new Error("Expected recovery surface");

    fallback.props.onRetry();

    expect(reload).toHaveBeenCalledOnce();
    expect(reset).not.toHaveBeenCalled();
  });

  it("still remounts ordinary rendering failures without reloading the page", () => {
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    const boundary = new ErrorBoundary({ route: "/profile" });
    boundary.state = ErrorBoundary.getDerivedStateFromError(new Error("component exploded"));
    const reset = vi.spyOn(boundary, "setState").mockImplementation(() => undefined);
    const fallback = boundary.render();
    if (!isValidElement<{ onRetry: () => void }>(fallback)) throw new Error("Expected recovery surface");

    fallback.props.onRetry();

    expect(reset).toHaveBeenCalledWith({ hasError: false, error: null });
    expect(reload).not.toHaveBeenCalled();
  });

  it("renders focusable recovery heading, retry, sanitized details, and credential guidance", () => {
    const failure = createFailureModel({
      error: { status: 403, statusText: "Forbidden" },
      route: "/island?apiKey=secret",
      source: "route",
      phase: "data",
      now: new Date("2026-08-13T12:00:00.000Z"),
    });
    const markup = renderToStaticMarkup(
      <MemoryRouter basename="/Skydex" initialEntries={["/Skydex/"]}>
        <FailureSurface failure={failure} onRetry={() => undefined} />
      </MemoryRouter>,
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain("Try again");
    expect(markup).toContain("Open Settings");
    expect(markup).toContain('href="/Skydex/profile?tab=gear"');
    expect(markup).toContain('href="/Skydex?settings=1"');
    expect(markup).not.toContain('href="/island?tab=gear"');
    expect(markup).not.toContain('href="/?settings=1"');
    expect(markup).toContain("Copy sanitized technical details");
    expect(markup).toContain("failure-surface-action");
    expect(markup).not.toContain("bg-emerald-500/15");
    expect(markup).toContain('aria-label="Wonder, the Skydex companion"');
    expect(markup).not.toContain("secret");
    expect(formatFailureDetails(failure)).not.toContain("secret");
  });

  it("owns recovery chrome when the failed route cannot mount its normal root", () => {
    expect(failureCss).toContain(":root:has(.failure-surface) .sd-tools");
    expect(failureCss).toContain(":root:has(.failure-surface) .sd-curtain");
    expect(failureCss).toContain(":root:has(.failure-surface) .sd-backdrop__frost");
    expect(failureCss).toContain(":root:has(.failure-surface) .sd-backdrop__scrim");
  });

  it("keeps the ErrorBoundary fallback free of raw exception text", () => {
    const boundary = new ErrorBoundary({ route: "/items" });
    boundary.state = ErrorBoundary.getDerivedStateFromError(new Error("apiKey=secret stack=[payload]"));
    const markup = renderToStaticMarkup(
      <MemoryRouter basename="/Skydex" initialEntries={["/Skydex/"]}>
        {boundary.render()}
      </MemoryRouter>,
    );
    expect(markup).toContain("Skydex recovery");
    expect(markup).not.toContain("apiKey=secret");
    expect(markup).not.toContain("[payload]");
  });

  it("provides an explicit not-found surface", () => {
    const failure = createNotFoundModel("/missing/path");
    const markup = renderToStaticMarkup(
      <MemoryRouter basename="/Skydex" initialEntries={["/Skydex/"]}>
        <FailureSurface failure={failure} />
      </MemoryRouter>,
    );
    expect(markup).toContain("That page is not in the Skydex map.");
    expect(markup).toContain('href="/Skydex"');
    expect(markup).not.toContain('href="/"');
    expect(markup).toContain("Go to dashboard");
    expect(markup).not.toContain("Try again");
  });

  it("does not offer the failed Profile route as its own recovery action", () => {
    const failure = createFailureModel({
      error: new Error("profile render failed"),
      route: "/profile?tab=gear",
      source: "component",
      phase: "render",
    });
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/"]}>
        <FailureSurface failure={failure} onRetry={() => undefined} />
      </MemoryRouter>,
    );
    expect(markup).not.toContain("Go to Profile");
    expect(markup).toContain("Go to dashboard");
  });
});
