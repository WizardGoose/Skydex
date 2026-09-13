package com.skydex.data;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.skydex.export.ExportSection;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The island-data-spec v1 document.
 *
 * <p>Invariant that matters: a {@code null} section means "never captured" and
 * is <b>omitted</b> from the JSON; an empty list/map means "captured and
 * verified empty" and is emitted. The website distinguishes the two, so do not
 * collapse them.
 *
 * <p>Contains no Minecraft types on purpose — the whole serialisation contract
 * is unit-testable off a game classpath.
 */
public final class IslandSnapshot {

    /** Bump only on a breaking change to the snapshot schema. */
    public static final int SCHEMA = 1;

    /**
     * serializeNulls matters: the spec shows {@code "gameMode": null} as a real
     * value ("unknown"), and default Gson would silently drop the key.
     */
    private static final Gson GSON = new GsonBuilder().serializeNulls().create();

    private long exportedAt;
    private String playerUuid;
    private String playerName;
    private String profileName;
    private String gameMode;

    /** null = never captured. */
    private Map<String, Long> sacks;
    /** null = never captured. */
    private List<ChestRecord> chests;
    /** null = never captured. */
    private List<ItemEntry> inventory;
    /** null = never captured. */
    private List<ItemEntry> enderChest;
    /** null = never captured. */
    private List<ItemEntry> storage;
    /** null = never observed. Small enough to ride in both transports. */
    private GreenhouseBoard greenhouse;

    public IslandSnapshot() {
    }

    public long exportedAt() {
        return exportedAt;
    }

    public IslandSnapshot exportedAt(long ms) {
        this.exportedAt = ms;
        return this;
    }

    public String playerUuid() {
        return playerUuid;
    }

    public IslandSnapshot player(String uuid, String name) {
        this.playerUuid = uuid;
        this.playerName = name;
        return this;
    }

    public String playerName() {
        return playerName;
    }

    public String profileName() {
        return profileName;
    }

    public String gameMode() {
        return gameMode;
    }

    public IslandSnapshot profile(String name, String gameMode) {
        this.profileName = name;
        this.gameMode = gameMode;
        return this;
    }

    public Map<String, Long> sacks() {
        return sacks;
    }

    public IslandSnapshot sacks(Map<String, Long> sacks) {
        this.sacks = sacks;
        return this;
    }

    public List<ChestRecord> chests() {
        return chests;
    }

    public IslandSnapshot chests(List<ChestRecord> chests) {
        this.chests = chests;
        return this;
    }

    public List<ItemEntry> inventory() {
        return inventory;
    }

    public IslandSnapshot inventory(List<ItemEntry> inventory) {
        this.inventory = inventory;
        return this;
    }

    public List<ItemEntry> enderChest() {
        return enderChest;
    }

    public IslandSnapshot enderChest(List<ItemEntry> enderChest) {
        this.enderChest = enderChest;
        return this;
    }

    public List<ItemEntry> storage() {
        return storage;
    }

    public IslandSnapshot storage(List<ItemEntry> storage) {
        this.storage = storage;
        return this;
    }

    /** null when the greenhouse has never been observed. */
    public GreenhouseBoard greenhouse() {
        return greenhouse;
    }

    public IslandSnapshot greenhouse(GreenhouseBoard greenhouse) {
        this.greenhouse = greenhouse;
        return this;
    }

    /**
     * A copy without the three sections the Hypixel API already exposes.
     *
     * <p>Used for the clipboard code only. Those sections are the bulk of a
     * real island's payload, and the site can fetch them itself with the
     * player's own key. The live feed deliberately still carries them: while
     * the mod is connected its data is fresher and rate-limit free, so the site
     * treats it as replacing the API for those sections.
     *
     * <p>The greenhouse survives this trim on purpose: the API does not expose
     * it at all, and the spec pins it as carried by both transports because a
     * whole board is a hundred cells at most.
     */
    public IslandSnapshot withoutApiCoveredSections() {
        IslandSnapshot copy = new IslandSnapshot()
                .exportedAt(exportedAt)
                .player(playerUuid, playerName)
                .profile(profileName, gameMode);
        copy.sacks = sacks;
        copy.chests = chests;
        copy.greenhouse = greenhouse;
        return copy;
    }

    /**
     * A copy containing only the data groups the player selected.
     *
     * <p>Identity and profile metadata always remain because a payload with no
     * owner cannot be safely merged by the browser. Within a selected section,
     * null still means never captured and empty still means captured empty.
     */
    public IslandSnapshot onlySections(Set<ExportSection> selected) {
        EnumSet<ExportSection> sections = selected == null || selected.isEmpty()
                ? EnumSet.noneOf(ExportSection.class)
                : EnumSet.copyOf(selected);
        IslandSnapshot copy = new IslandSnapshot()
                .exportedAt(exportedAt)
                .player(playerUuid, playerName)
                .profile(profileName, gameMode);
        if (sections.contains(ExportSection.SACKS)) {
            copy.sacks = sacks;
        }
        if (sections.contains(ExportSection.ISLAND_CHESTS)) {
            copy.chests = chests;
        }
        if (sections.contains(ExportSection.INVENTORY)) {
            copy.inventory = inventory;
        }
        if (sections.contains(ExportSection.ENDER_CHEST)) {
            copy.enderChest = enderChest;
        }
        if (sections.contains(ExportSection.STORAGE)) {
            copy.storage = storage;
        }
        if (sections.contains(ExportSection.GREENHOUSE)) {
            copy.greenhouse = greenhouse;
        }
        return copy;
    }

    // ---------------------------------------------------------------- json

    public JsonObject toJson() {
        JsonObject root = new JsonObject();
        root.addProperty("schema", SCHEMA);
        root.addProperty("exportedAt", exportedAt);

        JsonObject player = new JsonObject();
        addOrNull(player, "uuid", playerUuid);
        addOrNull(player, "name", playerName);
        root.add("player", player);

        JsonObject profile = new JsonObject();
        addOrNull(profile, "name", profileName);
        addOrNull(profile, "gameMode", gameMode);
        root.add("profile", profile);

        if (sacks != null) {
            JsonObject sackObj = new JsonObject();
            for (Map.Entry<String, Long> e : sacks.entrySet()) {
                sackObj.addProperty(e.getKey(), e.getValue());
            }
            root.add("sacks", sackObj);
        }
        if (chests != null) {
            JsonArray arr = new JsonArray(chests.size());
            for (ChestRecord chest : chests) {
                arr.add(chest.toJson());
            }
            root.add("chests", arr);
        }
        addItems(root, "inventory", inventory);
        addItems(root, "enderChest", enderChest);
        addItems(root, "storage", storage);
        if (greenhouse != null) {
            root.add("greenhouse", greenhouse.toJson());
        }
        return root;
    }

    /** Minified JSON, exactly what both transports carry. */
    public String toMinifiedJson() {
        return GSON.toJson(toJson());
    }

    private static void addItems(JsonObject root, String key, List<ItemEntry> items) {
        if (items == null) {
            return;
        }
        JsonArray arr = new JsonArray(items.size());
        for (ItemEntry item : items) {
            arr.add(item.toJson());
        }
        root.add(key, arr);
    }

    private static void addOrNull(JsonObject o, String key, String value) {
        if (value == null) {
            o.add(key, com.google.gson.JsonNull.INSTANCE);
        } else {
            o.addProperty(key, value);
        }
    }

    public static IslandSnapshot fromJson(String json) {
        return fromJson(JsonParser.parseString(json).getAsJsonObject());
    }

    public static IslandSnapshot fromJson(JsonObject root) {
        IslandSnapshot s = new IslandSnapshot();
        s.exportedAt = root.has("exportedAt") ? root.get("exportedAt").getAsLong() : 0L;

        if (root.has("player") && root.get("player").isJsonObject()) {
            JsonObject player = root.getAsJsonObject("player");
            s.playerUuid = str(player, "uuid");
            s.playerName = str(player, "name");
        }
        if (root.has("profile") && root.get("profile").isJsonObject()) {
            JsonObject profile = root.getAsJsonObject("profile");
            s.profileName = str(profile, "name");
            s.gameMode = str(profile, "gameMode");
        }
        if (root.has("sacks") && root.get("sacks").isJsonObject()) {
            Map<String, Long> sacks = new LinkedHashMap<>();
            for (Map.Entry<String, JsonElement> e : root.getAsJsonObject("sacks").entrySet()) {
                sacks.put(e.getKey(), e.getValue().getAsLong());
            }
            s.sacks = sacks;
        }
        if (root.has("chests") && root.get("chests").isJsonArray()) {
            List<ChestRecord> chests = new ArrayList<>();
            for (JsonElement e : root.getAsJsonArray("chests")) {
                chests.add(ChestRecord.fromJson(e));
            }
            s.chests = chests;
        }
        s.inventory = items(root, "inventory");
        s.enderChest = items(root, "enderChest");
        s.storage = items(root, "storage");
        if (root.has("greenhouse")) {
            s.greenhouse = GreenhouseBoard.fromJson(root.get("greenhouse"));
        }
        return s;
    }

    private static List<ItemEntry> items(JsonObject root, String key) {
        if (!root.has(key) || !root.get(key).isJsonArray()) {
            return null;
        }
        List<ItemEntry> list = new ArrayList<>();
        for (JsonElement e : root.getAsJsonArray(key)) {
            list.add(ItemEntry.fromJson(e));
        }
        return list;
    }

    private static String str(JsonObject o, String key) {
        if (!o.has(key) || o.get(key).isJsonNull()) {
            return null;
        }
        return o.get(key).getAsString();
    }
}
