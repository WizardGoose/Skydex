import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const layout = readFileSync(resolve(process.cwd(), "src/components/layout/Layout.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

describe("footer composition", () => {
  it("keeps compact credits and the required Minecraft notice", () => {
    expect(layout).toContain("Skydex Project Credits");
    expect(layout).toContain("Thank you to everyone who helped make Skydex possible.");
    expect(layout).toContain("NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.");
    expect(layout).toContain('<span className="sd-footer-disclaimer">');
    expect(layout).not.toContain('<strong className="sd-footer-disclaimer">');
    expect(styles).toMatch(/\.sd-footer-disclaimer\s*\{[^}]*font-weight: 400;/s);
    expect(styles).toMatch(/\.sd-footer-show\s*\{[^}]*font-weight: 400;/s);
    expect(layout.match(/NOT AN OFFICIAL MINECRAFT PRODUCT/g)).toHaveLength(1);
    expect(layout.match(/Skydex Project Credits/g)).toHaveLength(1);
  });

  it("collapses verbose credits into a reversible compact source while keeping the Minecraft notice", () => {
    expect(layout).toContain('const FOOTER_DISMISSED_KEY = "skydex.footer.dismissed.v1"');
    expect(layout).toContain("localStorage.getItem(FOOTER_DISMISSED_KEY)");
    expect(layout).toContain('localStorage.setItem(FOOTER_DISMISSED_KEY, "true")');
    expect(layout).toContain('aria-label={rememberFooterDismissal ? "Collapse footer details and remember this choice" : "Collapse footer details"}');
    expect(layout).toContain("Don&rsquo;t show details again");
    expect(layout).toContain("localStorage.removeItem(FOOTER_DISMISSED_KEY)");
    expect(layout).toContain("Sources: Hypixel Wiki · CC BY-NC-SA 3.0");
    expect(layout).not.toContain('role="switch"');

    const dismissibleStart = layout.indexOf("{footerVisible && (");
    const requiredStart = layout.indexOf('<div className="sd-footer-required');
    const dismissibleRegion = layout.slice(dismissibleStart, requiredStart);
    expect(dismissibleRegion).toContain("Item, recipe and mutation data");
    expect(dismissibleRegion).toContain("Skydex Project Credits");
    expect(dismissibleRegion).not.toContain("NOT AN OFFICIAL MINECRAFT PRODUCT");

    const copy = layout.slice(layout.indexOf('<div className="sd-footer-copy">'), layout.indexOf('<div className="sd-footer-controls">'));
    expect(copy.indexOf("Item, recipe and mutation data")).toBeLessThan(copy.indexOf("Skydex Project Credits"));

    const controls = layout.slice(layout.indexOf('<div className="sd-footer-controls">'), requiredStart);
    expect(controls.indexOf("Don&rsquo;t show details again")).toBeLessThan(controls.indexOf("<X"));
    expect(controls).not.toContain("<ChevronDown");
  });

  it("does not remount route content for query-only overlay state", () => {
    expect(layout).not.toContain("key={location.pathname + location.search}");
    expect(layout.match(/<ErrorBoundary key={location\.pathname}/g)).toHaveLength(2);
  });
});
