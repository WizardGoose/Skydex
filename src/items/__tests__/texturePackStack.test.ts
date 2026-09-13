import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setTexturePackStackForTests,
  packTextureFrame,
  packTextureSrc,
  texturePackEntries,
  type TexturePackEntry,
} from "../texturePack";
import type { PackCounts, PackTextureFrame } from "../texturePackParse";

const counts: PackCounts = {
  files: 1,
  recognised: 1,
  catharsis: 1,
  hypixel: 0,
  vanilla: 0,
  unresolved: 0,
  special: 0,
  ignored: 0,
  ignoredClasses: [],
};

const entry = (id: string, priority: number, enabled = true): TexturePackEntry => ({
  id,
  name: `${id}.zip`,
  description: id,
  counts,
  loadedAt: priority + 1,
  enabled,
  priority,
});

describe("texture-pack priority stack", () => {
  const high = new Blob(["high"]);
  const low = new Blob(["low"]);

  beforeEach(() => {
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) =>
      blob === high ? "blob:high" : blob === low ? "blob:low" : "blob:other",
    );
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  afterEach(() => {
    __setTexturePackStackForTests([]);
    vi.restoreAllMocks();
  });

  it("lets the higher pack win even when it uses a later key candidate", () => {
    __setTexturePackStackForTests([
      { manifest: entry("high", 0), textures: new Map([["DISPLAY_NAME", high]]) },
      { manifest: entry("low", 1), textures: new Map([["ITEM_ID", low]]) },
    ]);

    expect(packTextureSrc("ITEM_ID", "Display Name")).toBe("blob:high");
  });

  it("skips a disabled pack without deleting its place in the stack", () => {
    __setTexturePackStackForTests([
      { manifest: entry("high", 0, false), textures: new Map([["ITEM_ID", high]]) },
      { manifest: entry("low", 1), textures: new Map([["ITEM_ID", low]]) },
    ]);

    expect(packTextureSrc("ITEM_ID", "Display Name")).toBe("blob:low");
    expect(texturePackEntries().map(({ id, enabled }) => ({ id, enabled }))).toEqual([
      { id: "high", enabled: false },
      { id: "low", enabled: true },
    ]);
  });

  it("normalises stored priorities and returns defensive manifest copies", () => {
    __setTexturePackStackForTests([
      { manifest: entry("low", 8), textures: new Map([["ITEM_ID", low]]) },
      { manifest: entry("high", 2), textures: new Map([["ITEM_ID", high]]) },
    ]);

    const firstRead = texturePackEntries();
    expect(firstRead.map(({ id, priority }) => ({ id, priority }))).toEqual([
      { id: "high", priority: 0 },
      { id: "low", priority: 1 },
    ]);
    firstRead[0].name = "changed outside the store";
    expect(texturePackEntries()[0].name).toBe("high.zip");
  });

  it("keeps animation framing attached to the texture that won", () => {
    const frame: PackTextureFrame = {
      sheetWidth: 16,
      sheetHeight: 32,
      frameX: 0,
      frameY: 16,
      frameWidth: 16,
      frameHeight: 16,
    };
    __setTexturePackStackForTests([
      {
        manifest: entry("high", 0),
        textures: new Map([["ITEM_ID", high]]),
        frames: new Map([["ITEM_ID", frame]]),
      },
      { manifest: entry("low", 1), textures: new Map([["ITEM_ID", low]]) },
    ]);

    const source = packTextureSrc("ITEM_ID", "Display Name");
    expect(source).toBe("blob:high");
    expect(packTextureFrame(source ?? "")).toEqual(frame);
  });
});
