import { describe, expect, it } from "vitest";
import { migrateBrandStorage } from "../migrateBrandStorage";

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  failWrites = false;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  key(i: number) { return [...this.values.keys()][i] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error("quota exceeded");
    this.values.set(key, value);
  }
  removeItem(key: string) { this.values.delete(key); }
}

describe("Skydex browser storage migration", () => {
  it("preserves exact saved values and unrelated data, and is idempotent", () => {
    const storage = new MemoryStorage();
    storage.setItem("skyindex.greenhouse.uniqueCrops", "17");
    storage.setItem("skyindex.searches.v1", '["a","b"]');
    storage.setItem("skyindex.texturepack.v1", '{"count":2}');
    storage.setItem("unrelated", "keep");
    storage.setItem("wizardsky.apikey.v1", "synthetic");
    migrateBrandStorage(storage);
    expect(storage.getItem("skydex.greenhouse.uniqueCrops")).toBe("17");
    expect(storage.getItem("skydex.searches.v1")).toBe('["a","b"]');
    expect(storage.getItem("skydex.texturepack.v1")).toBe('{"count":2}');
    expect(storage.getItem("unrelated")).toBe("keep");
    expect(storage.getItem("wizardsky.apikey.v1")).toBe("synthetic");
    expect([...storage.values.keys()].some(key => key.startsWith("skyindex."))).toBe(false);
    const migrated = [...storage.values];
    migrateBrandStorage(storage);
    expect([...storage.values]).toEqual(migrated);
  });

  it("preserves conflicting old values without overwriting current choices or previous backups", () => {
    const storage = new MemoryStorage();
    storage.setItem("skyindex.searches.v1", "old");
    storage.setItem("skydex.searches.v1", "current");
    storage.setItem("skydex.migration-backup.searches.v1", "earlier");
    migrateBrandStorage(storage);
    expect(storage.getItem("skydex.searches.v1")).toBe("current");
    expect(storage.getItem("skydex.migration-backup.searches.v1")).toBe("earlier");
    expect(storage.getItem("skydex.migration-backup.searches.v1.1")).toBe("old");
    expect(storage.getItem("skyindex.searches.v1")).toBeNull();
  });

  it("retains originals if storage refuses a write", () => {
    const storage = new MemoryStorage();
    storage.setItem("skyindex.searches.v1", "saved");
    storage.failWrites = true;
    expect(() => migrateBrandStorage(storage)).toThrow("quota exceeded");
    expect(storage.getItem("skyindex.searches.v1")).toBe("saved");
    storage.failWrites = false;
    migrateBrandStorage(storage);
    expect(storage.getItem("skydex.searches.v1")).toBe("saved");
  });
});
