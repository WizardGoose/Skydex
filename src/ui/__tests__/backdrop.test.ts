import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyBackdropPreferences,
  BACKDROP_PREFERENCES_KEY,
  BACKDROP_PREFERENCES_UPDATED_EVENT,
  clearAppliedBackdropPreferences,
  DEFAULT_BACKDROP_PREFERENCES,
  readBackdropPreferences,
  saveBackdropPreferences,
} from "../backdrop";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("backdrop preferences", () => {
  let storage: MemoryStorage;
  let dispatchEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storage = new MemoryStorage();
    dispatchEvent = vi.fn();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { dispatchEvent });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses safe defaults for missing or malformed preferences", () => {
    expect(readBackdropPreferences()).toEqual(DEFAULT_BACKDROP_PREFERENCES);

    storage.setItem(BACKDROP_PREFERENCES_KEY, "not json");
    expect(readBackdropPreferences()).toEqual(DEFAULT_BACKDROP_PREFERENCES);

    storage.setItem(
      BACKDROP_PREFERENCES_KEY,
      JSON.stringify({ v: 1, horizontal: "outside", vertical: "bottom", shade: 99 }),
    );
    expect(readBackdropPreferences()).toEqual({
      v: 1,
      horizontal: "center",
      vertical: "bottom",
      shade: 40,
    });
  });

  it("normalises, stores and publishes preference changes", () => {
    const saved = saveBackdropPreferences({ horizontal: "right", vertical: "top", shade: 17.6 });

    expect(saved).toEqual({ v: 1, horizontal: "right", vertical: "top", shade: 18 });
    expect(JSON.parse(storage.getItem(BACKDROP_PREFERENCES_KEY) ?? "null")).toEqual(saved);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0]).toBeInstanceOf(Event);
    expect((dispatchEvent.mock.calls[0][0] as Event).type).toBe(BACKDROP_PREFERENCES_UPDATED_EVENT);
  });

  it("applies and removes the three presentation variables", () => {
    const style = {
      setProperty: vi.fn(),
      removeProperty: vi.fn(),
    };
    const root = { style } as unknown as HTMLElement;

    applyBackdropPreferences({ v: 1, horizontal: "left", vertical: "bottom", shade: 23 }, root);
    expect(style.setProperty.mock.calls).toEqual([
      ["--sd-bg-position-x", "left"],
      ["--sd-bg-position-y", "bottom"],
      ["--sd-scrim", "0.23"],
    ]);

    clearAppliedBackdropPreferences(root);
    expect(style.removeProperty.mock.calls).toEqual([
      ["--sd-bg-position-x"],
      ["--sd-bg-position-y"],
      ["--sd-scrim"],
    ]);
  });
});
