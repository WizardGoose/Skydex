import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProfileLookupForm } from "../ProfileLookupForm";

describe("ProfileLookupForm", () => {
  it("accepts a username or UUID without borrowing the universal search", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ProfileLookupForm, {
        initialValue: "Technoblade",
        onSubmit: vi.fn(),
      }),
    );

    expect(markup).toContain('role="search"');
    expect(markup).toContain('aria-label="Search SkyBlock profiles"');
    expect(markup).toContain('value="Technoblade"');
    expect(markup).toContain('placeholder="Minecraft username or UUID"');
    expect(markup).not.toContain("disabled");
  });

  it("does not submit an empty player lookup", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ProfileLookupForm, { onSubmit: vi.fn() }),
    );

    expect(markup).toContain('type="submit" disabled=""');
  });

  it("can render a route-independent draft for immediate head previews", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ProfileLookupForm, {
        initialValue: "LoadedPlayer",
        value: "PreviewPlayer",
        onValueChange: vi.fn(),
        onSubmit: vi.fn(),
      }),
    );

    expect(markup).toContain('value="PreviewPlayer"');
    expect(markup).not.toContain('value="LoadedPlayer"');
  });

  it("can reduce the PV submit action to an accessible enter arrow", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ProfileLookupForm, {
        initialValue: "Technoblade",
        iconOnly: true,
        onSubmit: vi.fn(),
      }),
    );

    expect(markup).toContain('aria-label="View SkyBlock profile"');
    expect(markup).toContain("lucide-corner-down-left");
    expect(markup).not.toContain("<span>");
  });
});
