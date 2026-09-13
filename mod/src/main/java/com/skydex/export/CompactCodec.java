package com.skydex.export;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
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
 * PROPOSED schema-2 payload. Not emitted yet — {@code /skydex copy} still
 * produces v1 until the site ships a v2 decoder.
 *
 * <p>v1 writes one JSON object per stack, so the keys {@code id}, {@code count},
 * {@code slot} and {@code extra} repeat thousands of times, as does every id
 * string. v2 keeps JSON — the site needs no binary reader — but restructures it
 * around three ideas:
 *
 * <ol>
 *   <li><b>One string pool.</b> Every string in the document — item ids, display
 *       names, chest titles, reforge names, enchantment ids, skin hashes — lives
 *       once in {@code P} and is referenced by index. A pooled string is written
 *       once no matter how many stacks share it, and pooling everything together
 *       means an id that also appears as a name costs nothing extra.</li>
 *   <li><b>Columnar sections.</b> Slots, ids and counts are three parallel
 *       arrays rather than N objects of three keys. Names and extras are sparse
 *       side-tables of {@code [entryIndex, poolIndex]} pairs, so the common case
 *       — no custom name, no extras — costs literally nothing.</li>
 *   <li><b>Array-shaped extras.</b> An extra is
 *       {@code [reforgeIdx, stars, [[enchIdx, level]...], recomb, skinIdx]} with
 *       {@code -1} for absent, so the five key names disappear. Extras are
 *       interned too, because a shared reforge or enchant set is common.</li>
 * </ol>
 *
 * <p>Sections keep v1's omitted-means-never-captured rule.
 */
public final class CompactCodec {

    public static final int SCHEMA = 2;
    /** Wire prefix a v2 code would use. */
    public static final String PREFIX = "SKYDEX2.";
    /** Marks an absent pooled string inside an extra. */
    private static final int ABSENT = -1;

    private static final Gson GSON = new GsonBuilder().serializeNulls().create();

    private CompactCodec() {
    }

    // ------------------------------------------------------------- encoding

    /** @return the v2 payload as minified JSON */
    public static String encode(IslandSnapshot snapshot) {
        Pool pool = new Pool();
        JsonObject root = new JsonObject();
        root.addProperty("v", SCHEMA);
        root.addProperty("t", snapshot.exportedAt());

        JsonArray player = new JsonArray(2);
        player.add(pool.intern(snapshot.playerUuid()));
        player.add(pool.intern(snapshot.playerName()));
        root.add("p", player);

        JsonArray profile = new JsonArray(2);
        profile.add(pool.intern(snapshot.profileName()));
        profile.add(pool.intern(snapshot.gameMode()));
        root.add("r", profile);

        // Sections first, so the pool is fully populated before it is written.
        JsonArray chests = null;
        if (snapshot.chests() != null) {
            chests = new JsonArray();
            for (ChestRecord chest : snapshot.chests()) {
                JsonArray row = new JsonArray(4);
                JsonArray pos = new JsonArray(3);
                pos.add(chest.x());
                pos.add(chest.y());
                pos.add(chest.z());
                row.add(pos);
                row.add(pool.intern(chest.name()));
                row.add(chest.lastSeen());
                row.add(section(chest.items(), pool));
                chests.add(row);
            }
        }
        JsonArray inventory = section(snapshot.inventory(), pool);
        JsonArray enderChest = section(snapshot.enderChest(), pool);
        JsonArray storage = section(snapshot.storage(), pool);

        JsonArray sacks = null;
        if (snapshot.sacks() != null) {
            sacks = new JsonArray();
            for (Map.Entry<String, Long> e : snapshot.sacks().entrySet()) {
                JsonArray pair = new JsonArray(2);
                pair.add(pool.intern(e.getKey()));
                pair.add(e.getValue());
                sacks.add(pair);
            }
        }

        root.add("P", pool.toJson());
        if (!pool.extras.isEmpty()) {
            root.add("X", pool.extrasJson());
        }
        if (sacks != null) {
            root.add("S", sacks);
        }
        if (chests != null) {
            root.add("C", chests);
        }
        if (inventory != null) {
            root.add("V", inventory);
        }
        if (enderChest != null) {
            root.add("E", enderChest);
        }
        if (storage != null) {
            root.add("G", storage);
        }
        return GSON.toJson(root);
    }

    /** @return the five-array section, or null when the source section is absent */
    private static JsonArray section(List<ItemEntry> items, Pool pool) {
        if (items == null) {
            return null;
        }
        JsonArray slots = new JsonArray(items.size());
        JsonArray ids = new JsonArray(items.size());
        JsonArray counts = new JsonArray(items.size());
        JsonArray names = new JsonArray();
        JsonArray extras = new JsonArray();

        for (int i = 0; i < items.size(); i++) {
            ItemEntry item = items.get(i);
            slots.add(item.slot());
            ids.add(pool.intern(item.id()));
            counts.add(item.count());

            // Same rule as v1: a name the reader can rebuild is not shipped.
            if (!ItemNames.isRedundant(item.id(), item.name(), item.extra().reforge())) {
                names.add(pair(i, pool.intern(item.name())));
            }
            if (!item.extra().isEmpty()) {
                extras.add(pair(i, pool.extra(item.extra())));
            }
        }
        JsonArray out = new JsonArray(5);
        out.add(slots);
        out.add(ids);
        out.add(counts);
        out.add(names);
        out.add(extras);
        return out;
    }

    private static JsonArray pair(int index, int tableIndex) {
        JsonArray pair = new JsonArray(2);
        pair.add(index);
        pair.add(tableIndex);
        return pair;
    }

    // ------------------------------------------------------------- decoding

    /** Reference decoder, so the format can be proven lossless. */
    public static IslandSnapshot decode(String payload) {
        JsonObject root = JsonParser.parseString(payload).getAsJsonObject();
        int version = root.has("v") ? root.get("v").getAsInt() : -1;
        if (version != SCHEMA) {
            throw new IllegalArgumentException("expected schema " + SCHEMA + ", got " + version);
        }
        List<String> pool = new ArrayList<>();
        for (JsonElement e : root.getAsJsonArray("P")) {
            pool.add(e.isJsonNull() ? null : e.getAsString());
        }
        List<ItemExtra> extras = new ArrayList<>();
        if (root.has("X")) {
            for (JsonElement e : root.getAsJsonArray("X")) {
                extras.add(readExtra(e.getAsJsonArray(), pool));
            }
        }

        IslandSnapshot snapshot = new IslandSnapshot().exportedAt(root.get("t").getAsLong());
        JsonArray player = root.getAsJsonArray("p");
        snapshot.player(at(pool, player.get(0).getAsInt()), at(pool, player.get(1).getAsInt()));
        JsonArray profile = root.getAsJsonArray("r");
        snapshot.profile(at(pool, profile.get(0).getAsInt()), at(pool, profile.get(1).getAsInt()));

        if (root.has("S")) {
            Map<String, Long> sacks = new TreeMap<>();
            for (JsonElement e : root.getAsJsonArray("S")) {
                JsonArray pair = e.getAsJsonArray();
                sacks.put(at(pool, pair.get(0).getAsInt()), pair.get(1).getAsLong());
            }
            snapshot.sacks(sacks);
        }
        if (root.has("C")) {
            List<ChestRecord> chests = new ArrayList<>();
            for (JsonElement e : root.getAsJsonArray("C")) {
                JsonArray row = e.getAsJsonArray();
                JsonArray pos = row.get(0).getAsJsonArray();
                chests.add(new ChestRecord(
                        pos.get(0).getAsInt(), pos.get(1).getAsInt(), pos.get(2).getAsInt(),
                        at(pool, row.get(1).getAsInt()),
                        row.get(2).getAsLong(),
                        readSection(row.get(3).getAsJsonArray(), pool, extras)));
            }
            snapshot.chests(chests);
        }
        if (root.has("V")) {
            snapshot.inventory(readSection(root.getAsJsonArray("V"), pool, extras));
        }
        if (root.has("E")) {
            snapshot.enderChest(readSection(root.getAsJsonArray("E"), pool, extras));
        }
        if (root.has("G")) {
            snapshot.storage(readSection(root.getAsJsonArray("G"), pool, extras));
        }
        return snapshot;
    }

    private static ItemExtra readExtra(JsonArray array, List<String> pool) {
        String reforge = at(pool, array.get(0).getAsInt());
        int stars = array.get(1).getAsInt();
        Map<String, Integer> enchantments = new TreeMap<>();
        for (JsonElement e : array.get(2).getAsJsonArray()) {
            JsonArray pair = e.getAsJsonArray();
            enchantments.put(at(pool, pair.get(0).getAsInt()), pair.get(1).getAsInt());
        }
        boolean recomb = array.get(3).getAsInt() != 0;
        String skin = at(pool, array.get(4).getAsInt());
        return new ItemExtra(reforge, stars, enchantments, recomb, skin);
    }

    private static List<ItemEntry> readSection(JsonArray section, List<String> pool,
                                               List<ItemExtra> extras) {
        JsonArray slots = section.get(0).getAsJsonArray();
        JsonArray idIdx = section.get(1).getAsJsonArray();
        JsonArray counts = section.get(2).getAsJsonArray();

        Map<Integer, String> nameAt = new LinkedHashMap<>();
        for (JsonElement e : section.get(3).getAsJsonArray()) {
            JsonArray pair = e.getAsJsonArray();
            nameAt.put(pair.get(0).getAsInt(), at(pool, pair.get(1).getAsInt()));
        }
        Map<Integer, ItemExtra> extraAt = new LinkedHashMap<>();
        for (JsonElement e : section.get(4).getAsJsonArray()) {
            JsonArray pair = e.getAsJsonArray();
            extraAt.put(pair.get(0).getAsInt(), extras.get(pair.get(1).getAsInt()));
        }

        List<ItemEntry> items = new ArrayList<>(slots.size());
        for (int i = 0; i < slots.size(); i++) {
            items.add(new ItemEntry(
                    at(pool, idIdx.get(i).getAsInt()),
                    nameAt.get(i),
                    counts.get(i).getAsInt(),
                    extraAt.getOrDefault(i, ItemExtra.EMPTY),
                    slots.get(i).getAsInt()));
        }
        return items;
    }

    private static String at(List<String> pool, int index) {
        return index < 0 || index >= pool.size() ? null : pool.get(index);
    }

    // ----------------------------------------------------------------- pool

    /**
     * One interning table for every string in the document, plus the interned
     * extras. Insertion-ordered so encoding is reproducible.
     */
    private static final class Pool {
        private final Map<String, Integer> index = new LinkedHashMap<>();
        private final List<String> values = new ArrayList<>();
        private final Map<String, Integer> extraIndex = new LinkedHashMap<>();
        private final List<JsonArray> extras = new ArrayList<>();

        /** @return the pool index, or {@link #ABSENT} for null */
        int intern(String value) {
            if (value == null) {
                return ABSENT;
            }
            Integer existing = index.get(value);
            if (existing != null) {
                return existing;
            }
            index.put(value, values.size());
            values.add(value);
            return values.size() - 1;
        }

        int extra(ItemExtra value) {
            JsonArray encoded = new JsonArray(5);
            encoded.add(intern(value.reforge()));
            encoded.add(value.stars());
            JsonArray ench = new JsonArray();
            for (Map.Entry<String, Integer> e : value.enchantments().entrySet()) {
                JsonArray pair = new JsonArray(2);
                pair.add(intern(e.getKey()));
                pair.add(e.getValue());
                ench.add(pair);
            }
            encoded.add(ench);
            encoded.add(value.recombobulated() ? 1 : 0);
            encoded.add(intern(value.skin()));

            String key = encoded.toString();
            Integer existing = extraIndex.get(key);
            if (existing != null) {
                return existing;
            }
            extraIndex.put(key, extras.size());
            extras.add(encoded);
            return extras.size() - 1;
        }

        JsonArray toJson() {
            JsonArray array = new JsonArray(values.size());
            values.forEach(array::add);
            return array;
        }

        JsonArray extrasJson() {
            JsonArray array = new JsonArray(extras.size());
            extras.forEach(array::add);
            return array;
        }
    }
}
