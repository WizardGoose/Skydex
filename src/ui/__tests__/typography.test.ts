import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../index.css", import.meta.url), "utf8");

const rgb = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const luminance = (hex: string): number => {
  const channels = rgb(hex).map((channel) => {
    const unit = channel / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrast = (foreground: string, background: string): number => {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
};

describe("site typography baseline", () => {
  it("uses Profile's medium interface weight as the site-wide floor", () => {
    const bodyRule = css.match(/body\s*\{(?<body>[\s\S]*?)\}/)?.groups?.body ?? "";

    expect(css).toMatch(/--font-sans:\s*"Montserrat"/);
    expect(bodyRule).toMatch(/font-family:\s*var\(--font-sans\)/);
    expect(bodyRule).toMatch(/font-weight:\s*500/);
  });

  it("keeps secondary copy AA-readable on the brightest glass ground", () => {
    const slate500 = css.match(/--color-slate-500:\s*(#[0-9a-f]{6})/i)?.[1];

    expect(slate500).toBeDefined();
    expect(contrast(slate500 ?? "#000000", "#23262d")).toBeGreaterThanOrEqual(4.5);
  });

  it("compensates the shared small-text scale when browser zoom widens the viewport", () => {
    const firstStep = css.match(/@media \(min-width:\s*1800px\)\s*\{(?<rules>[\s\S]*?)\n\}/)?.groups?.rules ?? "";
    const secondStep = css.match(/@media \(min-width:\s*2400px\)\s*\{(?<rules>[\s\S]*?)\n\}/)?.groups?.rules ?? "";

    expect(firstStep).toContain(".text-\\[10px\\]");
    expect(firstStep).toContain(".text-\\[11px\\]");
    expect(secondStep).toContain(".text-\\[12px\\]");
  });
});
