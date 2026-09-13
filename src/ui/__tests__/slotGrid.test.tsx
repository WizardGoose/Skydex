import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Slot } from "../slotGrid";

describe("shared item slots", () => {
  it("renders a plain Profile-style amount over the rarity tile", () => {
    const markup = renderToStaticMarkup(
      <Slot
        item={{ id: "ENCHANTED_DIAMOND", name: "Enchanted Diamond", count: 1_300 }}
        needle=""
        context={{
          tierOf: () => "legendary",
          priceOf: () => null,
          provenance: null,
        }}
      />,
    );

    expect(markup).toContain("×1.3k");
    expect(markup).toContain("profile-item-overlay-text");
    expect(markup).toContain("border-rarity-legendary/45");
    expect(markup).not.toContain("bg-slate-950/85");
  });
});
