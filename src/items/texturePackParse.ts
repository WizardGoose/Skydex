import { unzipSync, gunzipSync } from "fflate";

/**
 * Reading a user-supplied SkyBlock texture pack, entirely in the browser.
 *
 * WHY THIS EXISTS, AND THE LICENSING SHAPE IT MUST KEEP
 * -----------------------------------------------------
 * The feature: upload a texture pack in the settings, cached entirely on
 * the user's side, violating nothing. The architecture IS the licensing
 * answer. Packs like
 * Hypixel+ (CC-BY-NC-ND) and FurfSky can never be bundled or re-hosted by
 * this repository, and nothing here ever needs them to be: the user downloads
 * the pack themselves from Modrinth, hands the zip to this parser, and every
 * byte of it stays in their own browser. This project distributes a reader,
 * never a pack. The same arrangement as the wiki images, one step further:
 * there the wiki serves its own content to the visitor, here the visitor
 * serves their own copy to themselves.
 *
 * THE FORMAT, AS FOUND IN THE REAL THING
 * --------------------------------------
 * FurfSky Reborn's new format targets Catharsis, a MIT-licensed Fabric mod
 * (github.com/meowdding/catharsis), whose docs and example packs state the
 * layout precisely. The load-bearing rule, from
 * docs/getting_started/skyblock_textures.md:
 *
 *   "To replace a SkyBlock item texture, you need to create a JSON file in
 *    the assets/skyblock/items/ folder with the ID of the SkyBlock item you
 *    want to replace. ID's containing a : have been replaced with . "
 *
 * So `assets/skyblock/items/hyperion.json` retextures HYPERION and
 * `assets/skyblock/items/double_plant.4.json` retextures DOUBLE_PLANT:4.
 * That file is a vanilla Item Model Definition, typically:
 *
 *   { "model": { "type": "minecraft:model", "model": "<ns>:item/hyperion" } }
 *
 * pointing at `assets/<ns>/models/item/hyperion.json`, a plain model whose
 * `textures.layer0` names `assets/<ns>/textures/item/hyperion.png`. Items
 * that share a base id (pets, enchantments, potions, runes, attributes) get
 * sub-identifier folders, e.g. `assets/skyblock/items/pets/wolf.json`.
 *
 * Real packs wrap all of that twice more:
 *
 *   - Fabric overlays: pack.mcmeta lists overlay directories (FurfSky has
 *     79 of them, `item_melee`, `armor_icon`, `legacy_witherblade`...), each
 *     a whole pack root of its own, applied when its condition holds. The
 *     conditions are in-game config; this site cannot ask them, so the rule
 *     here is: the pack root first, then overlays in their listed order, and
 *     the FIRST definition that resolves to a real texture in the pack wins.
 *     Measured against FurfSky v2.0-pre.5's own config defaults, that is the
 *     pack's default look: every `item_*` overlay defaults on and every
 *     `legacy_*` overlay defaults off, and `item_melee` is listed before
 *     `legacy_witherblade`.
 *
 *   - The .cats container: FurfSky publishes as `<name>.cats.zip`, a zip
 *     holding one `.cats` archive (magic "CATS", big-endian, a directory
 *     tree of files stored raw or gzipped; spec at
 *     github.com/meowdding/cats-file-format, MIT). When the zip's payload is
 *     a .cats file, it is unpacked here and read exactly like the zip.
 *
 * SCOPE, STATED HONESTLY
 * ----------------------
 * First class: catharsis id-keyed item textures, which key by Hypixel item
 * id and so align exactly with this codebase's `hypixelId` fields. Pets are
 * mapped to the `PET_<TYPE>` spelling this codebase uses. Second layer,
 * best effort: plain vanilla-layout packs (`assets/minecraft/textures/item/
 * <name>.png`, and the legacy `textures/items/` spelling), whose file names
 * can only ever name vanilla items, so `diamond_sword.png` answers for
 * DIAMOND_SWORD and nothing fancier. OUT of scope, deliberately: OptiFine
 * CIT predicate emulation (the old FurfSky format), and catharsis's
 * conditional model dispatch beyond taking the base case - a select or
 * condition node contributes its fallback, never a predicate answer. The
 * remaining sub-identifier folders (enchantments, potions, runes,
 * attributes) describe variants this site does not model per icon, so they
 * are counted and skipped rather than half-supported.
 */

/**
 * The first frame of a Minecraft animated texture inside its source sheet.
 *
 * Browsers do not understand `<texture>.png.mcmeta`; without this rectangle
 * they draw the whole vertical sheet and shrink every frame into one icon.
 */
export interface PackTextureFrame {
  sheetWidth: number;
  sheetHeight: number;
  frameX: number;
  frameY: number;
  frameWidth: number;
  frameHeight: number;
}

/** One texture the pack states, keyed by the id form below. */
export interface PackTexture {
  /** Raw PNG bytes, exactly as stored in the pack. */
  data: Uint8Array;
  /** Where in the pack it came from, for the summary and for debugging. */
  path: string;
  /** Which layer recognised it. */
  source: "catharsis" | "hypixel" | "vanilla";
  /** Crop to apply when the PNG is an animation sheet. */
  frame?: PackTextureFrame;
}

export interface PackCounts {
  /** Every file entry in the archive (after .cats unwrapping). */
  files: number;
  /** Distinct item keys that resolved to a texture. */
  recognised: number;
  /** ...of which came from the catharsis layer. */
  catharsis: number;
  /** ...of which came from Hypixel's official item-model definitions. */
  hypixel: number;
  /** ...of which came from the vanilla item-texture layer. */
  vanilla: number;
  /** Catharsis definitions whose model chain never reached a PNG in the pack. */
  unresolved: number;
  /** Sub-identifier definitions skipped as out of scope (enchantments, potions, runes, attributes). */
  special: number;
  /** Files that played no part in any recognised texture. */
  ignored: number;
  /**
   * What the ignored files actually ARE, by class, largest first.
   *
   * Exists because a bare number reads as failure: load FurfSky and the
   * five-digit ignored count reads as the pack being refused. Nothing
   * was refused; a
   * catharsis pack is mostly GUI art, 3D armor definitions, block and
   * entity textures and alternate looks for items already covered, none of
   * which IS an item icon. Naming the classes is the difference between
   * "refused" and "not applicable", so the classes are computed here where
   * the files are, not guessed at in the UI.
   */
  ignoredClasses: { label: string; count: number }[];
}

export interface ParsedPack {
  /** pack.mcmeta description, flattened to plain text, or null. */
  description: string | null;
  /** catharsis:pack/v1 id and version, when the pack declares them. */
  packId: string | null;
  packVersion: string | null;
  /** Item key -> texture. */
  textures: Map<string, PackTexture>;
  counts: PackCounts;
}

/* -------------------------------------------------------------------------- */
/* The matching rule                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Fold anything a caller has into the key form the texture map uses.
 *
 * The map is keyed by Hypixel item id, uppercase with underscores, colon
 * kept (`DOUBLE_PLANT:4`), because that is exactly what catharsis keys its
 * files by (lowercased, dot for colon) and exactly what this codebase's
 * `hypixelId` fields carry. Callers arrive with either an id in any case
 * (`ENCHANTED_BREAD`, ItemsPage's `enchanted_bread` slug) or a display name
 * ("Diamond Sword"), so everything is folded the same way: uppercase, runs
 * of anything that is not a letter, digit or colon become one underscore.
 * A display name that IS the prettified id folds back to the id; a reforged
 * or decorated name folds to something the map has no entry for and falls
 * through to the wiki ladder, which already handles it.
 */
export const foldPackKey = (s: string): string =>
  s
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9:]+/g, "_")
    .replace(/^_+|_+$/g, "");

/**
 * Every key worth trying for an item, best first: the hypixel id, then the
 * display name. The id outranks the name for the same reason it does across
 * this codebase: it is the game's own spelling, while a name is decorated,
 * reforged and occasionally shared.
 */
export const packModelKey = (model: string): string => `MODEL:${model.trim().toLowerCase()}`;

export const packKeyCandidates = (
  id?: string | null,
  name?: string | null,
  itemModel?: string | null,
): string[] => {
  const out: string[] = [];
  for (const raw of [id, name]) {
    if (!raw) continue;
    const key = foldPackKey(raw);
    if (key && !out.includes(key)) out.push(key);
  }
  if (itemModel) out.push(packModelKey(itemModel));
  return out;
};

/* -------------------------------------------------------------------------- */
/* .cats container                                                            */
/* -------------------------------------------------------------------------- */

const CATS_MAGIC = 0x43415453; // "CATS"

/**
 * Unpack a .cats archive to path -> bytes.
 *
 * Read against the format's own Rust and Java readers rather than the
 * prose: big-endian throughout, header = magic u32, version u8, root entry
 * count u16, then entries. Entry = type u8 (0 file, 1 directory), name
 * (u8 length + ASCII), then for a file offset u32 / size u32 / compression
 * u8 (0xFF raw, 0xFE gzip), for a directory count u16 + children. File
 * offsets are relative to the first byte AFTER the header, which is where
 * the readers start their data slice.
 */
export const unpackCats = (bytes: Uint8Array): Record<string, Uint8Array> => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 7 || view.getUint32(0) !== CATS_MAGIC) throw new Error("not a .cats archive");

  let pos = 4;
  pos += 1; // version; only 0x01 exists and nothing below depends on it
  const rootCount = view.getUint16(pos);
  pos += 2;

  interface FileRef {
    path: string;
    offset: number;
    size: number;
    gzip: boolean;
  }
  const refs: FileRef[] = [];

  const readEntry = (prefix: string): void => {
    const type = view.getUint8(pos);
    pos += 1;
    const nameLen = view.getUint8(pos);
    pos += 1;
    let name = "";
    for (let i = 0; i < nameLen; i++) name += String.fromCharCode(bytes[pos + i]);
    pos += nameLen;

    if (type === 0) {
      const offset = view.getUint32(pos);
      const size = view.getUint32(pos + 4);
      const comp = view.getUint8(pos + 8);
      pos += 9;
      refs.push({ path: prefix + name, offset, size, gzip: comp === 0xfe });
    } else if (type === 1) {
      const count = view.getUint16(pos);
      pos += 2;
      for (let i = 0; i < count; i++) readEntry(prefix + name + "/");
    } else {
      throw new Error(`invalid .cats entry type ${type}`);
    }
  };

  for (let i = 0; i < rootCount; i++) readEntry("");
  const dataStart = pos;

  const out: Record<string, Uint8Array> = {};
  for (const ref of refs) {
    const slice = bytes.subarray(dataStart + ref.offset, dataStart + ref.offset + ref.size);
    out[ref.path] = ref.gzip ? gunzipSync(slice) : slice;
  }
  return out;
};

/* -------------------------------------------------------------------------- */
/* pack.mcmeta                                                                */
/* -------------------------------------------------------------------------- */

/** Minecraft text component to plain text. Strings, {text, extra}, arrays. */
const flattenText = (node: unknown): string => {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(flattenText).join("");
  if (node && typeof node === "object") {
    const obj = node as { text?: unknown; extra?: unknown };
    return flattenText(obj.text ?? "") + (obj.extra !== undefined ? flattenText(obj.extra) : "");
  }
  return "";
};

/** Strip the section-sign colour codes some packs bake into names. */
const stripColour = (s: string): string => s.replace(/§[0-9a-fk-orA-FK-OR]/g, "");

/* -------------------------------------------------------------------------- */
/* The parse                                                                  */
/* -------------------------------------------------------------------------- */

const decoder = new TextDecoder();

const parseJson = (bytes: Uint8Array): unknown | null => {
  try {
    return JSON.parse(decoder.decode(bytes)) as unknown;
  } catch {
    // A malformed JSON file is the pack author's problem, not a reason to
    // refuse the rest of the pack. It simply contributes nothing.
    return null;
  }
};

/** Read the IHDR dimensions without decoding the PNG. */
const pngDimensions = (bytes: Uint8Array): { width: number; height: number } | null => {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
};

/**
 * Resolve the initial frame described by a PNG's Minecraft animation metadata.
 *
 * Minecraft defaults an undeclared frame size to the largest square that fits
 * the sheet (normally a 16px-wide vertical strip). An explicit `frames` list
 * may start elsewhere, so the first valid declared index is the representative
 * frame SkyDex shows. Static PNGs and malformed metadata deliberately return
 * undefined and keep the old whole-image behaviour.
 */
const animationFrame = (png: Uint8Array, metadata?: Uint8Array): PackTextureFrame | undefined => {
  if (!metadata) return undefined;
  const dimensions = pngDimensions(png);
  const parsed = parseJson(metadata) as {
    animation?: {
      width?: unknown;
      height?: unknown;
      frames?: unknown;
    };
  } | null;
  const animation = parsed?.animation;
  if (!dimensions || !animation || typeof animation !== "object") return undefined;

  const positiveInt = (value: unknown): number | null =>
    typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
  const statedWidth = positiveInt(animation.width);
  const statedHeight = positiveInt(animation.height);
  const frameWidth = statedWidth ?? (statedHeight ? dimensions.width : Math.min(dimensions.width, dimensions.height));
  const frameHeight = statedHeight ?? (statedWidth ? dimensions.height : Math.min(dimensions.width, dimensions.height));

  if (
    frameWidth > dimensions.width ||
    frameHeight > dimensions.height ||
    dimensions.width % frameWidth !== 0 ||
    dimensions.height % frameHeight !== 0
  ) {
    return undefined;
  }

  const columns = dimensions.width / frameWidth;
  const frameCount = columns * (dimensions.height / frameHeight);
  if (frameCount <= 1) return undefined;

  let frameIndex = 0;
  if (Array.isArray(animation.frames)) {
    for (const entry of animation.frames) {
      const rawIndex =
        typeof entry === "number"
          ? entry
          : entry && typeof entry === "object"
            ? (entry as { index?: unknown }).index
            : null;
      if (typeof rawIndex === "number" && Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < frameCount) {
        frameIndex = rawIndex;
        break;
      }
    }
  }

  return {
    sheetWidth: dimensions.width,
    sheetHeight: dimensions.height,
    frameX: (frameIndex % columns) * frameWidth,
    frameY: Math.floor(frameIndex / columns) * frameHeight,
    frameWidth,
    frameHeight,
  };
};

/**
 * Walk an Item Model Definition to the one model reference the base look
 * uses. Predicates are out of scope, so every dispatch node contributes its
 * base case: `fallback` for select and range_dispatch, `on_false` for
 * condition (the unmet state is the everyday look), the first entry of a
 * composite, and the nested model of catharsis's redirect and glint
 * wrappers. `type` is matched with and without the `minecraft:` prefix
 * because real packs write both ("type":"model" in FurfSky).
 */
const firstModelRef = (node: unknown, depth = 0): string | null => {
  if (!node || typeof node !== "object" || depth > 12) return null;
  const obj = node as Record<string, unknown>;

  if (typeof obj.model === "string") return obj.model;

  const candidates: unknown[] = [
    obj.fallback,
    obj.on_false,
    obj.on_true,
    obj.model, // nested object: minecraft:condition-less wrappers, catharsis:redirect, catharsis:glint
  ];
  if (Array.isArray(obj.models)) candidates.push(...obj.models);
  if (Array.isArray(obj.cases)) for (const c of obj.cases) candidates.push((c as Record<string, unknown>)?.model);
  if (Array.isArray(obj.entries)) for (const e of obj.entries) candidates.push((e as Record<string, unknown>)?.model);

  for (const c of candidates) {
    const ref = firstModelRef(c, depth + 1);
    if (ref) return ref;
  }
  return null;
};

/** `ns:path` -> [ns, path]; a bare path defaults to the minecraft namespace. */
const splitRef = (ref: string): [string, string] => {
  const i = ref.indexOf(":");
  return i === -1 ? ["minecraft", ref] : [ref.slice(0, i), ref.slice(i + 1)];
};

/** The catharsis definition folder, inside any root. */
const ITEMS_DIR = "assets/skyblock/items/";
/** Exact item definitions shipped by Hypixel's official SkyBlock pack. */
const HYPIXEL_ITEMS_DIR = "assets/hypixel_skyblock/items/item/";
/** Sub-identifier folders this site cannot key per icon. Counted, not guessed at. */
const SPECIAL_SUBDIRS = new Set(["attributes", "enchantments", "potions", "runes"]);

export const parseTexturePack = (zipBytes: Uint8Array): ParsedPack => {
  let entries = unzipSync(zipBytes);

  /*
   * The .cats.zip arrangement: Modrinth only takes zips, so a .cats pack
   * ships as a zip whose payload is the archive, with a courtesy
   * pack.mcmeta beside it for launchers. The archive's own metadata is the
   * real one ("the pack.mcmeta and the icon inside the .cats get
   * prioritized", per the format docs), so when a .cats file is present it
   * replaces the wrapper wholesale.
   */
  const catsName = Object.keys(entries).find((n) => n.toLowerCase().endsWith(".cats"));
  if (catsName) entries = unpackCats(entries[catsName]);

  // Directory placeholder entries (zips may carry them) hold no bytes worth
  // counting as files.
  const paths = Object.keys(entries).filter((p) => !p.endsWith("/"));
  const totalFiles = paths.length;
  const consumed = new Set<string>();

  /* ---- pack.mcmeta ------------------------------------------------------ */

  let description: string | null = null;
  let packId: string | null = null;
  let packVersion: string | null = null;

  if (entries["pack.mcmeta"]) {
    consumed.add("pack.mcmeta");
    const meta = parseJson(entries["pack.mcmeta"]) as {
      pack?: { description?: unknown };
      "catharsis:pack/v1"?: { id?: unknown; version?: unknown };
      "fabric:overlays"?: { entries?: { directory?: unknown }[] };
    } | null;
    const desc = stripColour(flattenText(meta?.pack?.description ?? "")).trim();
    description = desc || null;
    const cat = meta?.["catharsis:pack/v1"];
    if (typeof cat?.id === "string") packId = cat.id;
    if (typeof cat?.version === "string") packVersion = cat.version;
  }

  /* ---- roots, in application order -------------------------------------- */

  /*
   * The pack root, then every overlay directory pack.mcmeta lists, in its
   * listed order, then any top-level directory that looks like an overlay
   * (has its own assets/) but was not listed, in path order. First
   * resolvable definition per id wins across that order; see the header for
   * why that reproduces a default install.
   */
  const roots: string[] = [""];
  const meta = entries["pack.mcmeta"] ? (parseJson(entries["pack.mcmeta"]) as Record<string, unknown> | null) : null;
  const overlayEntries = (meta?.["fabric:overlays"] as { entries?: { directory?: unknown }[] } | undefined)?.entries;
  if (Array.isArray(overlayEntries)) {
    for (const e of overlayEntries) {
      if (typeof e?.directory === "string" && !roots.includes(e.directory)) roots.push(e.directory);
    }
  }
  const seenTop = new Set(roots);
  for (const p of paths.sort()) {
    const i = p.indexOf("/assets/");
    if (i > 0) {
      const top = p.slice(0, i);
      if (!top.includes("/") && !seenTop.has(top)) {
        seenTop.add(top);
        roots.push(top);
      }
    }
  }

  /** A pack-inner path (`assets/...`) looked up under a root. */
  const at = (root: string, inner: string): Uint8Array | undefined =>
    entries[root ? `${root}/${inner}` : inner];

  /**
   * Look an inner path up under the definition's own root first, then the
   * pack root, then everywhere else. Namespaces are effectively unique per
   * overlay (FurfSky's `item_melee:` textures live only under item_melee/),
   * so the preference order is about correctness when they are not.
   */
  const lookup = (inner: string, preferRoot: string): { bytes: Uint8Array; path: string } | null => {
    const order = [preferRoot, ...roots.filter((r) => r !== preferRoot)];
    for (const root of order) {
      const bytes = at(root, inner);
      if (bytes) return { bytes, path: root ? `${root}/${inner}` : inner };
    }
    return null;
  };

  /* ---- resolving one definition to a PNG --------------------------------- */

  /**
   * Model JSON -> texture reference, following the parent chain inside the
   * pack. Children override parents in the textures map, exactly as the
   * game merges them; `layer0` is preferred because that is the layer an
   * item icon is; `#name` indirection resolves through the merged map. A
   * parent outside the pack (`minecraft:item/handheld` and friends) simply
   * ends the chain: its own textures are vanilla's, not ours to guess.
   */
  const textureRefFromModel = (modelRef: string, preferRoot: string, walked: string[]): string | null => {
    const merged: Record<string, string> = {};
    let ref: string | null = modelRef;
    for (let depth = 0; ref && depth < 8; depth++) {
      const [ns, path] = splitRef(ref);
      const found = lookup(`assets/${ns}/models/${path}.json`, preferRoot);
      if (!found) break;
      walked.push(found.path);
      const model = parseJson(found.bytes) as { parent?: unknown; textures?: Record<string, unknown> } | null;
      if (!model) break;
      if (model.textures && typeof model.textures === "object") {
        for (const [slot, value] of Object.entries(model.textures)) {
          // Parent values must not clobber a child's; the child was walked first.
          if (typeof value === "string" && !(slot in merged)) merged[slot] = value;
        }
      }
      ref = typeof model.parent === "string" ? model.parent : null;
    }

    let tex = merged["layer0"] ?? Object.values(merged)[0] ?? null;
    // #layer0 style indirection, cap-looped in case a pack ties a knot.
    for (let hops = 0; tex && tex.startsWith("#") && hops < 4; hops++) tex = merged[tex.slice(1)] ?? null;
    return tex && !tex.startsWith("#") ? tex : null;
  };

  /**
   * A definition file's whole journey: JSON -> model ref -> model chain ->
   * texture ref -> PNG bytes in the pack. Returns null when any link is
   * missing, and the walked list is only committed to `consumed` on
   * success, so a dead-end walk does not launder junk files into "used".
   */
  const resolveDefinition = (
    defPath: string,
    defBytes: Uint8Array,
    preferRoot: string
  ): { data: Uint8Array; path: string; walked: string[]; frame?: PackTextureFrame } | null => {
    const def = parseJson(defBytes);
    if (!def) return null;
    const modelRef = firstModelRef((def as Record<string, unknown>).model ?? def);
    if (!modelRef) return null;

    const walked: string[] = [defPath];
    let texRef = textureRefFromModel(modelRef, preferRoot, walked);
    /*
     * A definition may point straight at a model this pack does not carry
     * (vanilla's own, e.g. "replace the Hyperion with a diamond sword").
     * The one honest guess left is the convention the game itself uses,
     * model path = texture path, tried against the pack only. If the pack
     * does not carry that PNG either, the definition is unresolved; vanilla
     * assets are Mojang's and are not shipped here.
     */
    texRef ??= modelRef;

    const [tns, tpath] = splitRef(texRef);
    const png = lookup(`assets/${tns}/textures/${tpath}.png`, preferRoot);
    if (!png) return null;
    walked.push(png.path);
    const metadataPath = `${png.path}.mcmeta`;
    const frame = animationFrame(png.bytes, entries[metadataPath]);
    if (frame) walked.push(metadataPath);
    return { data: png.bytes, path: png.path, walked, frame };
  };

  /* ---- the catharsis layer ----------------------------------------------- */

  const textures = new Map<string, PackTexture>();
  let unresolved = 0;
  let special = 0;
  /** Definitions for ids some earlier root already textured: alternate looks. */
  const altDefs = new Set<string>();
  const unresolvedDefs = new Set<string>();
  const specialDefs = new Set<string>();

  for (const root of roots) {
    const prefix = root ? `${root}/${ITEMS_DIR}` : ITEMS_DIR;
    for (const p of paths) {
      if (!p.startsWith(prefix) || !p.endsWith(".json")) continue;
      const rel = p.slice(prefix.length, -".json".length);

      let key: string;
      if (rel.includes("/")) {
        const [sub, ...rest] = rel.split("/");
        const leaf = rest.join("/");
        if (SPECIAL_SUBDIRS.has(sub) || rest.length !== 1) {
          special++;
          specialDefs.add(p);
          continue;
        }
        if (sub === "pets") {
          // The PET_<TYPE> spelling is this codebase's own (the forge pets,
          // the profile pet ids), keyed from catharsis's petInfo.type folder.
          key = "PET_" + foldPackKey(leaf);
        } else {
          special++;
          specialDefs.add(p);
          continue;
        }
      } else {
        // "ID's containing a : have been replaced with ." - so the dot goes
        // back to being a colon on the way in.
        key = foldPackKey(rel.replace(/\./g, ":"));
      }

      if (!key) continue;
      if (textures.has(key)) {
        // A later root's definition for an id already answered: the same
        // item's alternate look under a config variant this site cannot ask
        // about. Not a refusal and not junk; named as such in the breakdown.
        altDefs.add(p);
        continue;
      }
      const resolved = resolveDefinition(p, entries[p], root);
      if (!resolved) {
        unresolved++;
        unresolvedDefs.add(p);
        continue;
      }
      textures.set(key, { data: resolved.data, path: resolved.path, source: "catharsis", frame: resolved.frame });
      for (const w of resolved.walked) consumed.add(w);
    }
  }

  const catharsisCount = textures.size;

  /* ---- Hypixel's official item-model layer ------------------------------ */

  let hypixelCount = 0;
  for (const root of roots) {
    const prefix = root ? `${root}/${HYPIXEL_ITEMS_DIR}` : HYPIXEL_ITEMS_DIR;
    for (const p of paths) {
      if (!p.startsWith(prefix) || !p.endsWith(".json")) continue;

      const definition = parseJson(entries[p]);
      const modelRef = definition
        ? firstModelRef((definition as Record<string, unknown>).model ?? definition)
        : null;
      if (!modelRef) {
        unresolved++;
        unresolvedDefs.add(p);
        continue;
      }

      const key = packModelKey(modelRef);
      if (textures.has(key)) {
        altDefs.add(p);
        continue;
      }

      const resolved = resolveDefinition(p, entries[p], root);
      if (!resolved) {
        unresolved++;
        unresolvedDefs.add(p);
        continue;
      }

      textures.set(key, {
        data: resolved.data,
        path: resolved.path,
        source: "hypixel",
        frame: resolved.frame,
      });
      hypixelCount += 1;
      for (const walked of resolved.walked) consumed.add(walked);
    }
  }

  /* ---- the vanilla layer ------------------------------------------------- */

  /*
   * Best effort, second place by construction: a vanilla texture name can
   * only name a vanilla item, and the catharsis layer already spoke for
   * anything it covers. Both spellings are read because Hypixel is a
   * 1.8-era game and legacy packs write `textures/items/` (plural) where
   * modern ones write `textures/item/`.
   */
  const vanillaRe = /(?:^|\/)assets\/minecraft\/textures\/items?\/([a-z0-9_]+)\.png$/;
  let vanillaCount = 0;
  for (const p of paths) {
    const m = vanillaRe.exec(p);
    if (!m) continue;
    const key = foldPackKey(m[1]);
    if (!key || textures.has(key)) continue;
    const metadataPath = `${p}.mcmeta`;
    const frame = animationFrame(entries[p], entries[metadataPath]);
    textures.set(key, { data: entries[p], path: p, source: "vanilla", frame });
    vanillaCount += 1;
    consumed.add(p);
    if (frame) consumed.add(metadataPath);
  }

  /* ---- naming what was left over ----------------------------------------- */

  /*
   * Every file that played no part gets a class, first match wins, ordered
   * from the most specific claim to the vaguest. The classes are path
   * heuristics and say so in their labels ("art", "definitions"), never a
   * pretence of having parsed what was skipped.
   */
  const classify = (p: string): string => {
    if (altDefs.has(p)) return "alternate looks for items already covered";
    if (specialDefs.has(p)) return "item variants not applied yet (enchantments, potions, runes, attributes)";
    if (unresolvedDefs.has(p)) return "item definitions whose textures the pack does not carry";
    const lower = p.toLowerCase();
    if (lower.includes("/catharsis/") || lower.endsWith(".geo.json") || lower.includes("/armors/"))
      return "3D armor, block and mod-feature definitions";
    if (lower.includes("gui")) return "GUI and interface art";
    if (lower.includes("/models/") && lower.endsWith(".json")) return "model files for looks not selected";
    if (lower.includes("/textures/") && lower.endsWith(".png")) return "block, entity and other non-item textures";
    if (lower.endsWith(".mcmeta")) return "animation and pack metadata";
    if (lower.includes("/font/") || lower.includes("/lang/") || /\.(ogg|ttf|otf)$/.test(lower))
      return "fonts, sounds and language files";
    return "other files";
  };

  const classCounts = new Map<string, number>();
  for (const p of paths) {
    if (consumed.has(p)) continue;
    const label = classify(p);
    classCounts.set(label, (classCounts.get(label) ?? 0) + 1);
  }
  const ignoredClasses = [...classCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  return {
    description,
    packId,
    packVersion,
    textures,
    counts: {
      files: totalFiles,
      recognised: textures.size,
      catharsis: catharsisCount,
      hypixel: hypixelCount,
      vanilla: vanillaCount,
      unresolved,
      special,
      ignored: totalFiles - consumed.size,
      ignoredClasses,
    },
  };
};
