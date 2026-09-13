package com.skydex.export;

import com.skydex.data.ChestRecord;
import com.skydex.data.IslandSnapshot;
import com.skydex.data.ItemEntry;
import com.skydex.data.ItemExtra;
import com.skydex.data.ItemNames;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Skydex binary serialisation.
 *
 * <p>Same semantic model as {@link CompactCodec}'s JSON — one string pool, an
 * interned extras table, columnar sections with sparse name/extra side-tables —
 * but written as varints instead of JSON text. JSON v2 halved the code; going
 * binary removes the punctuation, the digit-as-text encoding and the key names
 * that gzip was still paying for.
 *
 * <p>Decoding is deliberately strict. A corrupt payload must produce a clean
 * rejection, never a plausible-looking wrong island: every reference is
 * range-checked, every declared length is checked against the bytes that could
 * possibly remain, and trailing bytes are an error because they mean the
 * document was misread.
 *
 * <p>Not emitted yet: {@code /skydex copy} still produces v1 until the site
 * ships a decoder.
 */
public final class BinaryCodec {

    /** File magic, so a wrong payload fails immediately rather than deep inside. */
    static final byte[] MAGIC = {'S', 'K', 'I', 'X'};
    static final int VERSION = 2;
    /** Prototype prefix; this draft is not the site's current binary format. */
    public static final String PREFIX = "SKYDEX2.";

    static final int HAS_SACKS = 1;
    static final int HAS_CHESTS = 1 << 1;
    static final int HAS_INVENTORY = 1 << 2;
    static final int HAS_ENDER_CHEST = 1 << 3;
    static final int HAS_STORAGE = 1 << 4;
    /** Bits above this are undefined in v2 and rejected. */
    private static final int KNOWN_FLAGS =
            HAS_SACKS | HAS_CHESTS | HAS_INVENTORY | HAS_ENDER_CHEST | HAS_STORAGE;

    private BinaryCodec() {
    }

    // ---------------------------------------------------------- wire format

    /** Snapshot -> a complete clipboard code. */
    public static String encodeCode(IslandSnapshot snapshot) {
        return PREFIX + java.util.Base64.getUrlEncoder().withoutPadding()
                .encodeToString(ExportCodec.gzip(encode(snapshot)));
    }

    /** Clipboard code -> snapshot. Tolerates padding and pasted whitespace. */
    public static IslandSnapshot decodeCode(String code) {
        if (code == null) {
            throw new BinaryFormatException("code is null");
        }
        String trimmed = code.trim();
        if (!trimmed.startsWith(PREFIX)) {
            throw new BinaryFormatException("not a Skydex v2 code (expected prefix " + PREFIX + ")");
        }
        String payload = trimmed.substring(PREFIX.length()).replaceAll("\\s", "");
        while (payload.endsWith("=")) {
            payload = payload.substring(0, payload.length() - 1);
        }
        byte[] compressed;
        try {
            compressed = java.util.Base64.getUrlDecoder().decode(payload);
        } catch (IllegalArgumentException e) {
            throw new BinaryFormatException("code is not valid base64url");
        }
        return decode(ExportCodec.gunzip(compressed));
    }

    // ------------------------------------------------------------- encoding

    /**
     * Encodes in two passes.
     *
     * <p>The first pass only counts how often each string is referenced; the
     * pool is then ordered most-referenced-first, so the ids that appear
     * thousands of times get indices under 128 and cost a single varint byte,
     * while rare strings pay two. With hundreds of distinct ids across thousands
     * of stacks, that ordering is worth more than anything else in the format.
     */
    public static byte[] encode(IslandSnapshot snapshot) {
        Pool counting = new Pool();
        encodeWith(snapshot, counting);
        return encodeWith(snapshot, Pool.orderedByFrequency(counting));
    }

    private static byte[] encodeWith(IslandSnapshot snapshot, Pool pool) {
        // Sections are encoded first so the pool and extras table are complete
        // before they are written; the header then precedes them on the wire.
        byte[] sacks = snapshot.sacks() == null ? null : encodeSacks(snapshot, pool);
        byte[] chests = snapshot.chests() == null ? null : encodeChests(snapshot, pool);
        byte[] inventory = encodeSection(snapshot.inventory(), pool);
        byte[] enderChest = encodeSection(snapshot.enderChest(), pool);
        byte[] storage = encodeSection(snapshot.storage(), pool);

        int uuidRef = pool.intern(snapshot.playerUuid());
        int playerNameRef = pool.intern(snapshot.playerName());
        int profileRef = pool.intern(snapshot.profileName());
        int gameModeRef = pool.intern(snapshot.gameMode());

        BinaryWriter out = new BinaryWriter();
        for (byte b : MAGIC) {
            out.writeByte(b);
        }
        out.writeByte(VERSION);
        out.writeVarLong(snapshot.exportedAt());

        out.writeVarInt(pool.values.size());
        for (String value : pool.values) {
            out.writeString(value);
        }
        out.writeVarInt(uuidRef);
        out.writeVarInt(playerNameRef);
        out.writeVarInt(profileRef);
        out.writeVarInt(gameModeRef);

        out.writeVarInt(pool.extras.size());
        for (int[] extra : pool.extras) {
            for (int value : extra) {
                out.writeVarInt(value);
            }
        }

        int flags = (sacks != null ? HAS_SACKS : 0)
                | (chests != null ? HAS_CHESTS : 0)
                | (inventory != null ? HAS_INVENTORY : 0)
                | (enderChest != null ? HAS_ENDER_CHEST : 0)
                | (storage != null ? HAS_STORAGE : 0);
        out.writeByte(flags);

        appendAll(out, sacks, chests, inventory, enderChest, storage);
        return out.toByteArray();
    }

    private static void appendAll(BinaryWriter out, byte[]... blocks) {
        for (byte[] block : blocks) {
            if (block != null) {
                for (byte b : block) {
                    out.writeByte(b);
                }
            }
        }
    }

    private static byte[] encodeSacks(IslandSnapshot snapshot, Pool pool) {
        BinaryWriter out = new BinaryWriter();
        Map<String, Long> sacks = snapshot.sacks();
        out.writeVarInt(sacks.size());
        for (Map.Entry<String, Long> e : sacks.entrySet()) {
            out.writeVarInt(pool.intern(e.getKey()));
            out.writeVarLong(e.getValue());
        }
        return out.toByteArray();
    }

    private static byte[] encodeChests(IslandSnapshot snapshot, Pool pool) {
        BinaryWriter out = new BinaryWriter();
        List<ChestRecord> chests = snapshot.chests();
        out.writeVarInt(chests.size());
        for (ChestRecord chest : chests) {
            out.writeSignedVarInt(chest.x());
            out.writeSignedVarInt(chest.y());
            out.writeSignedVarInt(chest.z());
            out.writeVarInt(pool.intern(chest.name()));
            out.writeVarLong(chest.lastSeen());
            byte[] section = encodeSection(chest.items(), pool);
            for (byte b : section) {
                out.writeByte(b);
            }
        }
        return out.toByteArray();
    }

    /** @return the encoded section, or null when the section was never captured */
    private static byte[] encodeSection(List<ItemEntry> items, Pool pool) {
        if (items == null) {
            return null;
        }
        BinaryWriter out = new BinaryWriter();
        out.writeVarInt(items.size());

        for (ItemEntry item : items) {
            // +1 so 0 can mean "no slot"; slots are small so this stays 1 byte.
            out.writeVarInt(item.slot() < 0 ? 0 : item.slot() + 1);
        }
        for (ItemEntry item : items) {
            out.writeVarInt(pool.intern(item.id()));
        }
        for (ItemEntry item : items) {
            out.writeVarInt(item.count());
        }

        List<int[]> names = new ArrayList<>();
        List<int[]> extras = new ArrayList<>();
        for (int i = 0; i < items.size(); i++) {
            ItemEntry item = items.get(i);
            if (!ItemNames.isRedundant(item.id(), item.name(), item.extra().reforge())) {
                names.add(new int[]{i, pool.intern(item.name())});
            }
            if (!item.extra().isEmpty()) {
                extras.add(new int[]{i, pool.extra(item.extra())});
            }
        }
        out.writeVarInt(names.size());
        for (int[] pair : names) {
            out.writeVarInt(pair[0]);
            out.writeVarInt(pair[1]);
        }
        out.writeVarInt(extras.size());
        for (int[] pair : extras) {
            out.writeVarInt(pair[0]);
            out.writeVarInt(pair[1]);
        }
        return out.toByteArray();
    }

    // ------------------------------------------------------------- decoding

    public static IslandSnapshot decode(byte[] payload) {
        if (payload == null) {
            throw new BinaryFormatException("payload is null");
        }
        BinaryReader in = new BinaryReader(payload);
        for (int i = 0; i < MAGIC.length; i++) {
            if (in.readByte("magic") != MAGIC[i]) {
                throw new BinaryFormatException("not a Skydex binary payload (bad magic)", i);
            }
        }
        int version = in.readByte("version") & 0xFF;
        if (version != VERSION) {
            throw new BinaryFormatException(
                    "unsupported binary version " + version + "; this reader understands " + VERSION);
        }

        IslandSnapshot snapshot = new IslandSnapshot().exportedAt(in.readVarLong("exportedAt"));

        int poolSize = in.readCount("string pool");
        List<String> pool = new ArrayList<>(poolSize);
        for (int i = 0; i < poolSize; i++) {
            pool.add(in.readString("pool[" + i + "]"));
        }

        String uuid = deref(pool, in.readVarInt("player uuid"), in, "player uuid");
        String playerName = deref(pool, in.readVarInt("player name"), in, "player name");
        snapshot.player(uuid, playerName);
        String profileName = deref(pool, in.readVarInt("profile name"), in, "profile name");
        String gameMode = deref(pool, in.readVarInt("game mode"), in, "game mode");
        snapshot.profile(profileName, gameMode);

        int extraCount = in.readCount("extras table");
        List<ItemExtra> extras = new ArrayList<>(extraCount);
        for (int i = 0; i < extraCount; i++) {
            extras.add(readExtra(in, pool, i));
        }

        int flags = in.readByte("section flags") & 0xFF;
        if ((flags & ~KNOWN_FLAGS) != 0) {
            throw new BinaryFormatException(
                    "unknown section flags 0x" + Integer.toHexString(flags), in.offset());
        }

        if ((flags & HAS_SACKS) != 0) {
            int count = in.readCount("sacks");
            Map<String, Long> sacks = new TreeMap<>();
            for (int i = 0; i < count; i++) {
                String id = deref(pool, in.readVarInt("sack id"), in, "sack id");
                long total = in.readVarLong("sack total");
                if (id == null) {
                    throw new BinaryFormatException("sack entry has no item id", in.offset());
                }
                sacks.put(id, total);
            }
            snapshot.sacks(sacks);
        }
        if ((flags & HAS_CHESTS) != 0) {
            int count = in.readCount("chests");
            List<ChestRecord> chests = new ArrayList<>(count);
            for (int i = 0; i < count; i++) {
                int x = in.readSignedVarInt("chest x");
                int y = in.readSignedVarInt("chest y");
                int z = in.readSignedVarInt("chest z");
                String title = deref(pool, in.readVarInt("chest title"), in, "chest title");
                long lastSeen = in.readVarLong("chest lastSeen");
                chests.add(new ChestRecord(x, y, z, title, lastSeen, readSection(in, pool, extras)));
            }
            snapshot.chests(chests);
        }
        if ((flags & HAS_INVENTORY) != 0) {
            snapshot.inventory(readSection(in, pool, extras));
        }
        if ((flags & HAS_ENDER_CHEST) != 0) {
            snapshot.enderChest(readSection(in, pool, extras));
        }
        if ((flags & HAS_STORAGE) != 0) {
            snapshot.storage(readSection(in, pool, extras));
        }

        in.expectEnd();
        return snapshot;
    }

    private static ItemExtra readExtra(BinaryReader in, List<String> pool, int index) {
        String reforge = deref(pool, in.readVarInt("extra[" + index + "] reforge"), in, "reforge");
        int stars = in.readVarInt("extra[" + index + "] stars");
        int enchCount = in.readCount("extra[" + index + "] enchantments");
        Map<String, Integer> enchantments = new TreeMap<>();
        for (int i = 0; i < enchCount; i++) {
            String id = deref(pool, in.readVarInt("enchantment id"), in, "enchantment id");
            int level = in.readVarInt("enchantment level");
            if (id == null) {
                throw new BinaryFormatException("enchantment has no id", in.offset());
            }
            enchantments.put(id, level);
        }
        boolean recomb = in.readVarInt("extra[" + index + "] recomb") != 0;
        String skin = deref(pool, in.readVarInt("extra[" + index + "] skin"), in, "skin");
        return new ItemExtra(reforge, stars, enchantments, recomb, skin);
    }

    private static List<ItemEntry> readSection(BinaryReader in, List<String> pool,
                                               List<ItemExtra> extras) {
        int n = in.readCount("section entries");
        int[] slots = new int[n];
        for (int i = 0; i < n; i++) {
            slots[i] = in.readVarInt("slot") - 1;
        }
        String[] ids = new String[n];
        for (int i = 0; i < n; i++) {
            ids[i] = deref(pool, in.readVarInt("item id"), in, "item id");
            if (ids[i] == null) {
                throw new BinaryFormatException("item entry has no id", in.offset());
            }
        }
        int[] counts = new int[n];
        for (int i = 0; i < n; i++) {
            counts[i] = in.readVarInt("item count");
        }

        Map<Integer, String> nameAt = new LinkedHashMap<>();
        int nameCount = in.readCount("section names");
        for (int i = 0; i < nameCount; i++) {
            int entry = in.readVarInt("name entry index");
            String name = deref(pool, in.readVarInt("name"), in, "name");
            if (entry >= n) {
                throw new BinaryFormatException(
                        "name refers to entry " + entry + " but the section holds " + n, in.offset());
            }
            nameAt.put(entry, name);
        }

        Map<Integer, ItemExtra> extraAt = new LinkedHashMap<>();
        int extraRefs = in.readCount("section extras");
        for (int i = 0; i < extraRefs; i++) {
            int entry = in.readVarInt("extra entry index");
            int extraIndex = in.readVarInt("extra index");
            if (entry >= n) {
                throw new BinaryFormatException(
                        "extra refers to entry " + entry + " but the section holds " + n, in.offset());
            }
            if (extraIndex >= extras.size()) {
                throw new BinaryFormatException(
                        "extra index " + extraIndex + " is outside the table of "
                                + extras.size(), in.offset());
            }
            extraAt.put(entry, extras.get(extraIndex));
        }

        List<ItemEntry> items = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            items.add(new ItemEntry(ids[i], nameAt.get(i), counts[i],
                    extraAt.getOrDefault(i, ItemExtra.EMPTY), slots[i]));
        }
        return items;
    }

    /** @param ref 0 means absent; otherwise pool index + 1, range-checked. */
    private static String deref(List<String> pool, int ref, BinaryReader in, String field) {
        if (ref == 0) {
            return null;
        }
        int index = ref - 1;
        if (index >= pool.size()) {
            throw new BinaryFormatException(
                    field + " references pool entry " + index + " but the pool holds "
                            + pool.size(), in.offset());
        }
        return pool.get(index);
    }

    // ----------------------------------------------------------------- pool

    /** Interning tables; deterministic order so encoding is reproducible. */
    private static final class Pool {
        private final Map<String, Integer> index = new LinkedHashMap<>();
        private final List<String> values = new ArrayList<>();
        private final Map<String, Integer> uses = new LinkedHashMap<>();
        private final Map<String, Integer> extraIndex = new LinkedHashMap<>();
        private final List<int[]> extras = new ArrayList<>();
        /** When set, no new strings may be added: the order is already fixed. */
        private boolean sealed;

        /**
         * Re-seed a pool with the same strings, ordered by how often the
         * counting pass referenced them. Ties break on the string itself so the
         * result does not depend on map iteration order.
         */
        static Pool orderedByFrequency(Pool counted) {
            List<String> ordered = new ArrayList<>(counted.values);
            ordered.sort((a, b) -> {
                int byUses = Integer.compare(
                        counted.uses.getOrDefault(b, 0), counted.uses.getOrDefault(a, 0));
                return byUses != 0 ? byUses : a.compareTo(b);
            });
            Pool pool = new Pool();
            for (String value : ordered) {
                pool.index.put(value, pool.values.size());
                pool.values.add(value);
            }
            pool.sealed = true;
            return pool;
        }

        /** @return 0 for null, else pool index + 1 */
        int intern(String value) {
            if (value == null) {
                return 0;
            }
            uses.merge(value, 1, Integer::sum);
            Integer existing = index.get(value);
            if (existing != null) {
                return existing + 1;
            }
            if (sealed) {
                // Both passes walk the same data, so this cannot happen; failing
                // loudly beats emitting a payload with a silently missing string.
                throw new IllegalStateException("string appeared after the pool was fixed: " + value);
            }
            index.put(value, values.size());
            values.add(value);
            return values.size();
        }

        /**
         * Extras are flattened to a varint run:
         * {@code [reforgeRef, stars, enchCount, (idRef, level)*, recomb, skinRef]}.
         */
        int extra(ItemExtra value) {
            List<Integer> flat = new ArrayList<>();
            flat.add(intern(value.reforge()));
            flat.add(value.stars());
            flat.add(value.enchantments().size());
            for (Map.Entry<String, Integer> e : value.enchantments().entrySet()) {
                flat.add(intern(e.getKey()));
                flat.add(e.getValue());
            }
            flat.add(value.recombobulated() ? 1 : 0);
            flat.add(intern(value.skin()));

            int[] encoded = new int[flat.size()];
            for (int i = 0; i < flat.size(); i++) {
                encoded[i] = flat.get(i);
            }
            String key = java.util.Arrays.toString(encoded);
            Integer existing = extraIndex.get(key);
            if (existing != null) {
                return existing;
            }
            extraIndex.put(key, extras.size());
            extras.add(encoded);
            return extras.size() - 1;
        }
    }
}
