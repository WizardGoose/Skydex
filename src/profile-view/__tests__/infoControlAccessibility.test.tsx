import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProfileInfoPopover } from "../ProfileInfoPopover";

describe("information attached to a working control", () => {
  it("preserves the control name, toggle state and existing description", () => {
    const markup = renderToStaticMarkup(
      <ProfileInfoPopover title="Storage" info={{ summary: "Uses held items." }}
        ariaLabel="Storage information" triggerMode="control">
        <button aria-label="Use storage" aria-pressed aria-describedby="storage-status">Storage</button>
      </ProfileInfoPopover>,
    );
    expect(markup).toContain('aria-label="Use storage"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-describedby="storage-status"');
    expect(markup).not.toContain('aria-haspopup');
  });

  it("does not replace a disclosure's own expanded state or controlled region", () => {
    const markup = renderToStaticMarkup(
      <ProfileInfoPopover title="Settings" info={{ summary: "Plan settings." }}
        ariaLabel="Settings information" triggerMode="control">
        <button aria-expanded aria-controls="plan-settings">Settings</button>
      </ProfileInfoPopover>,
    );
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-controls="plan-settings"');
  });

  it("retains the existing Profile information-button contract by default", () => {
    const markup = renderToStaticMarkup(
      <ProfileInfoPopover title="Joined" info={{ summary: "Profile creation date." }} ariaLabel="Joined information">
        <button>Info</button>
      </ProfileInfoPopover>,
    );
    expect(markup).toContain('aria-label="Joined information"');
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('aria-expanded="false"');
  });
});
