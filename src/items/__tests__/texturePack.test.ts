import { describe, expect, it } from "vitest";
import { gzipSync, strToU8, zipSync } from "fflate";
import { foldPackKey, packKeyCandidates, packModelKey, parseTexturePack, unpackCats } from "../texturePackParse";

/**
 * The fixture is SYNTHETIC and built in-test, deliberately: no real pack
 * may ever enter this repository, because the packs this feature exists for
 * (FurfSky, Hypixel+) are exactly the ones whose licences forbid
 * redistribution. The layouts below are the catharsis format as documented
 * in the MIT-licensed catharsis repo (assets/skyblock/items/<id>.json,
 * docs/getting_started/skyblock_textures.md) and the standard vanilla
 * layout, reproduced from the spec rather than copied from anyone's pack.
 */

/** Any bytes serve as a texture; the parser stores PNGs, it does not decode them. */
const png = (tag: string): Uint8Array => strToU8(`\x89PNG-fake-${tag}`);

/** Enough of a PNG header for the parser to read an IHDR width and height. */
const sizedPng = (width: number, height: number): Uint8Array => {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
};

const json = (value: unknown): Uint8Array => strToU8(JSON.stringify(value));

/** A pack in catharsis layout with one vanilla-layout texture and junk. */
const buildFixtureZip = (): Uint8Array =>
  zipSync({
    "pack.mcmeta": json({
      pack: {
        pack_format: 15,
        description: { text: "", extra: [{ text: "Synthetic ", color: "aqua" }, { text: "Pack" }] },
      },
      "catharsis:pack/v1": { id: "synthetic_fixture", version: "1.2.3" },
    }),
    // Catharsis: definition -> model -> texture, the documented chain.
    "assets/skyblock/items/hyperion.json": json({
      model: { type: "minecraft:model", model: "fixture:item/hyperion" },
    }),
    "assets/fixture/models/item/hyperion.json": json({
      parent: "minecraft:item/handheld",
      textures: { layer0: "fixture:item/hyperion" },
    }),
    "assets/fixture/textures/item/hyperion.png": png("hyperion"),
    // The dot-for-colon rule: double_plant.4.json names DOUBLE_PLANT:4.
    // Also the model-missing fallback: the ref names no model file in the
    // pack, so the texture is tried at the same path.
    "assets/skyblock/items/double_plant.4.json": json({
      model: { type: "model", model: "fixture:item/rose_bush" },
    }),
    "assets/fixture/textures/item/rose_bush.png": png("rose"),
    // A select dispatch resolving through its fallback (predicates are out
    // of scope; the base case is the answer).
    "assets/skyblock/items/aspect_of_the_end.json": json({
      model: {
        type: "minecraft:select",
        property: "catharsis:skyblock_island",
        cases: [{ when: "the_end", model: { type: "minecraft:model", model: "fixture:item/aote_end" } }],
        fallback: { type: "minecraft:model", model: "fixture:item/aote" },
      },
    }),
    "assets/fixture/models/item/aote.json": json({ textures: { layer0: "fixture:item/aote" } }),
    "assets/fixture/textures/item/aote.png": png("aote"),
    // A pet, keyed from the pets/ sub-identifier folder.
    "assets/skyblock/items/pets/wolf.json": json({
      model: { type: "minecraft:model", model: "fixture:item/pet_wolf" },
    }),
    "assets/fixture/textures/item/pet_wolf.png": png("wolf"),
    // Out-of-scope sub-identifier: counted, never guessed at.
    "assets/skyblock/items/enchantments/sharpness.json": json({
      model: { type: "minecraft:model", model: "fixture:item/sharpness" },
    }),
    // A definition whose texture the pack does not carry: unresolved.
    "assets/skyblock/items/hyperion_broken.json": json({
      model: { type: "minecraft:model", model: "fixture:item/nowhere" },
    }),
    // Vanilla layout, which can only ever name a vanilla item.
    "assets/minecraft/textures/item/diamond_sword.png": png("dsword"),
    // Junk that must be ignored and counted.
    "credits.txt": strToU8("made by nobody"),
    "assets/fixture/sounds/ding.ogg": strToU8("not a texture"),
    "assets/skyblock/items/garbage.json": strToU8("{not json"),
  });

describe("parseTexturePack, catharsis layout", () => {
  const parsed = parseTexturePack(buildFixtureZip());

  it("reads pack.mcmeta metadata, flattening the text component", () => {
    expect(parsed.description).toBe("Synthetic Pack");
    expect(parsed.packId).toBe("synthetic_fixture");
    expect(parsed.packVersion).toBe("1.2.3");
  });

  it("keys a plain definition by its uppercased SkyBlock id", () => {
    const tex = parsed.textures.get("HYPERION");
    expect(tex).toBeDefined();
    expect(tex!.source).toBe("catharsis");
    expect(tex!.path).toBe("assets/fixture/textures/item/hyperion.png");
  });

  it("turns the documented dot back into a colon", () => {
    expect(parsed.textures.get("DOUBLE_PLANT:4")).toBeDefined();
  });

  it("resolves a select dispatch through its fallback", () => {
    expect(parsed.textures.get("ASPECT_OF_THE_END")?.path).toBe("assets/fixture/textures/item/aote.png");
  });

  it("maps the pets sub-folder to the PET_ id spelling", () => {
    expect(parsed.textures.get("PET_WOLF")).toBeDefined();
  });

  it("takes the vanilla layer only where catharsis said nothing", () => {
    const tex = parsed.textures.get("DIAMOND_SWORD");
    expect(tex?.source).toBe("vanilla");
  });

  it("names what the ignored files are, class by class", () => {
    const classes = new Map(parsed.counts.ignoredClasses.map((c) => [c.label, c.count]));
    // The out-of-scope enchantment definition is stated as what it is, not
    // lumped into a bare number that reads as refusal.
    expect(classes.get("item variants not applied yet (enchantments, potions, runes, attributes)")).toBe(1);
    expect(classes.get("item definitions whose textures the pack does not carry")).toBe(2);
    // credits.txt and the ogg land in the honest catch-alls.
    expect(classes.get("fonts, sounds and language files")).toBe(1);
    expect(classes.get("other files")).toBe(1);
    // Every ignored file is accounted for: the classes sum to the count.
    const sum = parsed.counts.ignoredClasses.reduce((a, c) => a + c.count, 0);
    expect(sum).toBe(parsed.counts.ignored);
  });

  it("counts honestly: recognised, unresolved, special, ignored", () => {
    expect(parsed.counts.files).toBe(17);
    expect(parsed.counts.recognised).toBe(5);
    expect(parsed.counts.catharsis).toBe(4);
    expect(parsed.counts.hypixel).toBe(0);
    expect(parsed.counts.vanilla).toBe(1);
    // hyperion_broken.json points nowhere; garbage.json does not parse.
    expect(parsed.counts.unresolved).toBe(2);
    // enchantments/sharpness.json is out of scope, counted, not guessed.
    expect(parsed.counts.special).toBe(1);
    // Consumed: pack.mcmeta, 4 definitions, 2 model files, 4 catharsis
    // textures, 1 vanilla texture = 12 of 17. The other 5 played no part:
    // credits.txt, the ogg, the broken and garbage definitions, and the
    // out-of-scope enchantment definition.
    expect(parsed.counts.ignored).toBe(5);
  });
});

describe("parseTexturePack, Hypixel's official item-model layout", () => {
  it("keys the resolved texture by the exact item_model supplied by the API", () => {
    const model = "hypixel_skyblock:item/island_relevant/foraging_3/accessories/lumberjack/lumberjack_talisman";
    const modelPath = "island_relevant/foraging_3/accessories/lumberjack/lumberjack_talisman";
    const zip = zipSync({
      "pack.mcmeta": json({ pack: { pack_format: 84, description: "official fixture" } }),
      [`assets/hypixel_skyblock/items/item/${modelPath}.json`]: json({
        model: { type: "minecraft:model", model },
      }),
      [`assets/hypixel_skyblock/models/item/${modelPath}.json`]: json({
        textures: { layer0: model },
      }),
      [`assets/hypixel_skyblock/textures/item/${modelPath}.png`]: png("lumberjack"),
    });

    const parsed = parseTexturePack(zip);
    const texture = parsed.textures.get(packModelKey(model));
    expect(texture?.source).toBe("hypixel");
    expect(texture?.path).toBe(`assets/hypixel_skyblock/textures/item/${modelPath}.png`);
    expect(parsed.counts.hypixel).toBe(1);
  });
});

describe("parseTexturePack, overlays", () => {
  it("prefers the pack root, then overlays in mcmeta order, first resolvable wins", () => {
    const zip = zipSync({
      "pack.mcmeta": json({
        pack: { pack_format: 15, description: "overlay fixture" },
        "fabric:overlays": {
          entries: [
            { directory: "first", condition: { condition: "catharsis:config", id: "first" } },
            { directory: "second", condition: { condition: "catharsis:config", id: "second" } },
          ],
        },
      }),
      // "second" sorts before "first" alphabetically and sits earlier in the
      // archive, so only the declared mcmeta order can make "first" win.
      "second/assets/skyblock/items/hyperion.json": json({
        model: { type: "model", model: "second:item/hyperion" },
      }),
      "second/assets/second/textures/item/hyperion.png": png("second"),
      "first/assets/skyblock/items/hyperion.json": json({
        model: { type: "model", model: "first:item/hyperion" },
      }),
      "first/assets/first/textures/item/hyperion.png": png("first"),
    });
    const parsed = parseTexturePack(zip);
    expect(parsed.textures.get("HYPERION")?.path).toBe("first/assets/first/textures/item/hyperion.png");
    // The losing overlay's definition is named an alternate look, because
    // that is what it is: the same item under a config this site cannot ask.
    expect(parsed.counts.ignoredClasses).toContainEqual({
      label: "alternate looks for items already covered",
      count: 1,
    });
  });

  it("falls past an overlay definition that cannot resolve", () => {
    const zip = zipSync({
      "pack.mcmeta": json({
        pack: { pack_format: 15 },
        "fabric:overlays": {
          entries: [{ directory: "broken" }, { directory: "working" }],
        },
      }),
      "broken/assets/skyblock/items/hyperion.json": json({
        model: { type: "model", model: "broken:item/nowhere" },
      }),
      "working/assets/skyblock/items/hyperion.json": json({
        model: { type: "model", model: "working:item/hyperion" },
      }),
      "working/assets/working/textures/item/hyperion.png": png("works"),
    });
    const parsed = parseTexturePack(zip);
    expect(parsed.textures.get("HYPERION")?.path).toBe("working/assets/working/textures/item/hyperion.png");
    expect(parsed.counts.unresolved).toBe(1);
  });
});

describe("parseTexturePack, animated item textures", () => {
  it("records the first mcmeta frame instead of treating the whole sheet as one icon", () => {
    const zip = zipSync({
      "pack.mcmeta": json({ pack: { pack_format: 15 } }),
      "assets/skyblock/items/animated_default.json": json({
        model: { type: "model", model: "fixture:item/animated_default" },
      }),
      "assets/fixture/models/item/animated_default.json": json({
        textures: { layer0: "fixture:item/animated_default" },
      }),
      "assets/fixture/textures/item/animated_default.png": sizedPng(16, 48),
      "assets/fixture/textures/item/animated_default.png.mcmeta": json({
        animation: { frametime: 2 },
      }),
      "assets/skyblock/items/animated_grid.json": json({
        model: { type: "model", model: "fixture:item/animated_grid" },
      }),
      "assets/fixture/models/item/animated_grid.json": json({
        textures: { layer0: "fixture:item/animated_grid" },
      }),
      "assets/fixture/textures/item/animated_grid.png": sizedPng(32, 32),
      "assets/fixture/textures/item/animated_grid.png.mcmeta": json({
        animation: {
          width: 16,
          height: 16,
          // Invalid entries are skipped; the first drawable declared frame wins.
          frames: [99, { index: 3, time: 6 }, 0],
        },
      }),
      "assets/skyblock/items/rectangular_static.json": json({
        model: { type: "model", model: "fixture:item/rectangular_static" },
      }),
      "assets/fixture/textures/item/rectangular_static.png": sizedPng(16, 48),
      // The vanilla layer uses the same metadata rule.
      "assets/minecraft/textures/item/clock.png": sizedPng(16, 64),
      "assets/minecraft/textures/item/clock.png.mcmeta": json({
        animation: { frames: [2, 3, 0, 1] },
      }),
    });

    const parsed = parseTexturePack(zip);
    expect(parsed.textures.get("ANIMATED_DEFAULT")?.frame).toEqual({
      sheetWidth: 16,
      sheetHeight: 48,
      frameX: 0,
      frameY: 0,
      frameWidth: 16,
      frameHeight: 16,
    });
    expect(parsed.textures.get("ANIMATED_GRID")?.frame).toEqual({
      sheetWidth: 32,
      sheetHeight: 32,
      frameX: 16,
      frameY: 16,
      frameWidth: 16,
      frameHeight: 16,
    });
    expect(parsed.textures.get("CLOCK")?.frame).toEqual({
      sheetWidth: 16,
      sheetHeight: 64,
      frameX: 0,
      frameY: 32,
      frameWidth: 16,
      frameHeight: 16,
    });
    // A rectangular texture without animation metadata keeps the old behavior.
    expect(parsed.textures.get("RECTANGULAR_STATIC")?.frame).toBeUndefined();
  });
});

describe("unpackCats and the .cats.zip arrangement", () => {
  /**
   * A .cats archive built byte by byte from the format spec
   * (github.com/meowdding/cats-file-format/format.md): magic "CATS",
   * version u8, root count u16, entries (type u8, name u8-length-prefixed,
   * file = offset u32 / size u32 / compression u8, directory = count u16 +
   * children), all big-endian, data offsets relative to the end of the
   * header. One raw file and one gzipped file cover both compressions.
   */
  const buildCats = (tree: Record<string, { data: Uint8Array; gzip: boolean }>): Uint8Array => {
    interface Dir {
      dirs: Map<string, Dir>;
      files: { name: string; data: Uint8Array; gzip: boolean }[];
    }
    const root: Dir = { dirs: new Map(), files: [] };
    for (const [path, file] of Object.entries(tree)) {
      const parts = path.split("/");
      let dir = root;
      for (const part of parts.slice(0, -1)) {
        if (!dir.dirs.has(part)) dir.dirs.set(part, { dirs: new Map(), files: [] });
        dir = dir.dirs.get(part)!;
      }
      dir.files.push({ name: parts[parts.length - 1], data: file.data, gzip: file.gzip });
    }

    const data: number[] = [];
    const stored: { name: string; offset: number; size: number; gzip: boolean; dir?: undefined }[] = [];
    const header: number[] = [];
    const pushU16 = (arr: number[], n: number) => arr.push((n >> 8) & 0xff, n & 0xff);
    const pushU32 = (arr: number[], n: number) => arr.push((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
    const pushName = (arr: number[], name: string) => {
      arr.push(name.length);
      for (const ch of name) arr.push(ch.charCodeAt(0));
    };

    const writeDir = (dir: Dir) => {
      for (const f of dir.files) {
        const payload = f.gzip ? gzipSync(f.data) : f.data;
        const offset = data.length;
        for (const b of payload) data.push(b);
        header.push(0);
        pushName(header, f.name);
        pushU32(header, offset);
        pushU32(header, payload.length);
        header.push(f.gzip ? 0xfe : 0xff);
        stored.push({ name: f.name, offset, size: payload.length, gzip: f.gzip });
      }
      for (const [name, sub] of dir.dirs) {
        header.push(1);
        pushName(header, name);
        pushU16(header, sub.files.length + sub.dirs.size);
        writeDir(sub);
      }
    };

    const rootCount = root.files.length + root.dirs.size;
    writeDir(root);

    const out: number[] = [0x43, 0x41, 0x54, 0x53, 0x01];
    pushU16(out, rootCount);
    return new Uint8Array([...out, ...header, ...data]);
  };

  it("unpacks raw and gzipped entries with directory nesting", () => {
    const cats = buildCats({
      "pack.mcmeta": { data: json({ pack: { description: "cats fixture" } }), gzip: true },
      "assets/skyblock/items/hyperion.json": {
        data: json({ model: { type: "model", model: "fx:item/hyperion" } }),
        gzip: true,
      },
      "assets/fx/textures/item/hyperion.png": { data: png("cats"), gzip: false },
    });
    const files = unpackCats(cats);
    expect(Object.keys(files).sort()).toEqual([
      "assets/fx/textures/item/hyperion.png",
      "assets/skyblock/items/hyperion.json",
      "pack.mcmeta",
    ]);
    expect(new TextDecoder().decode(files["pack.mcmeta"])).toContain("cats fixture");
  });

  it("reads a .cats file wrapped in a zip, preferring the inner metadata", () => {
    const cats = buildCats({
      "pack.mcmeta": { data: json({ pack: { description: "inner truth" } }), gzip: false },
      "assets/skyblock/items/hyperion.json": {
        data: json({ model: { type: "model", model: "fx:item/hyperion" } }),
        gzip: true,
      },
      "assets/fx/textures/item/hyperion.png": { data: png("inner"), gzip: false },
    });
    const zip = zipSync({
      "pack.cats": cats,
      // The wrapper mcmeta exists for launchers without the mod; the docs
      // say the one inside the archive wins, and it does here because the
      // archive replaces the wrapper wholesale.
      "pack.mcmeta": json({ pack: { description: "wrapper cosmetics" } }),
    });
    const parsed = parseTexturePack(zip);
    expect(parsed.description).toBe("inner truth");
    expect(parsed.textures.get("HYPERION")).toBeDefined();
  });

  it("refuses bytes that are not a cats archive", () => {
    expect(() => unpackCats(strToU8("definitely not"))).toThrow();
  });
});

describe("the matching rule", () => {
  it("folds ids and names to the same key space, id first", () => {
    expect(foldPackKey("enchanted_bread")).toBe("ENCHANTED_BREAD");
    expect(foldPackKey("Diamond Sword")).toBe("DIAMOND_SWORD");
    expect(foldPackKey("DOUBLE_PLANT:4")).toBe("DOUBLE_PLANT:4");
    // Decoration folds away rather than poisoning the key.
    expect(foldPackKey("◆ Snow Rune")).toBe("SNOW_RUNE");
  });

  it("offers the id before the display name and dedupes", () => {
    expect(packKeyCandidates("HYPERION", "Withered Hyperion")).toEqual(["HYPERION", "WITHERED_HYPERION"]);
    expect(packKeyCandidates("enchanted_bread", "Enchanted Bread")).toEqual(["ENCHANTED_BREAD"]);
    expect(packKeyCandidates(null, "Diamond Sword")).toEqual(["DIAMOND_SWORD"]);
    expect(packKeyCandidates(undefined, undefined)).toEqual([]);
  });

  it("adds Hypixel's exact model key after the stable id and name fallbacks", () => {
    const model = "hypixel_skyblock:item/island_relevant/foraging_3/accessories/lumberjack/lumberjack_talisman";
    expect(packKeyCandidates("LUMBERJACK_TALISMAN", "Lumberjack Talisman", model)).toEqual([
      "LUMBERJACK_TALISMAN",
      packModelKey(model),
    ]);
  });

});
