package com.skydex.data;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * A container recorded on the private island, keyed by block position.
 *
 * <p>Spec v1 shape: {@code { "pos": [x,y,z], "name": "...", "lastSeen": <ms>,
 * "items": [ ... ] }}.
 */
public final class ChestRecord {

    private final int x;
    private final int y;
    private final int z;
    private String name;
    private long lastSeen;
    private List<ItemEntry> items;

    public ChestRecord(int x, int y, int z, String name, long lastSeen, List<ItemEntry> items) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.name = name == null ? "Chest" : name;
        this.lastSeen = lastSeen;
        this.items = new ArrayList<>(Objects.requireNonNullElseGet(items, List::of));
    }

    /** Stable identity of a chest: its block position. */
    public String key() {
        return x + "," + y + "," + z;
    }

    public static String key(int x, int y, int z) {
        return x + "," + y + "," + z;
    }

    public int x() {
        return x;
    }

    public int y() {
        return y;
    }

    public int z() {
        return z;
    }

    public String name() {
        return name;
    }

    public long lastSeen() {
        return lastSeen;
    }

    public List<ItemEntry> items() {
        return items;
    }

    /** Replace contents with a fresh observation. */
    public void update(String newName, long seenAt, List<ItemEntry> newItems) {
        if (newName != null && !newName.isBlank()) {
            this.name = newName;
        }
        this.lastSeen = seenAt;
        this.items = new ArrayList<>(newItems);
    }

    public JsonObject toJson() {
        JsonObject o = new JsonObject();
        JsonArray pos = new JsonArray(3);
        pos.add(x);
        pos.add(y);
        pos.add(z);
        o.add("pos", pos);
        o.addProperty("name", name);
        o.addProperty("lastSeen", lastSeen);
        JsonArray arr = new JsonArray(items.size());
        for (ItemEntry item : items) {
            arr.add(item.toJson());
        }
        o.add("items", arr);
        return o;
    }

    public static ChestRecord fromJson(JsonElement element) {
        JsonObject o = element.getAsJsonObject();
        JsonArray pos = o.getAsJsonArray("pos");
        int x = pos.get(0).getAsInt();
        int y = pos.get(1).getAsInt();
        int z = pos.get(2).getAsInt();
        String name = o.has("name") && !o.get("name").isJsonNull() ? o.get("name").getAsString() : "Chest";
        long lastSeen = o.has("lastSeen") ? o.get("lastSeen").getAsLong() : 0L;
        List<ItemEntry> items = new ArrayList<>();
        if (o.has("items") && o.get("items").isJsonArray()) {
            for (JsonElement e : o.getAsJsonArray("items")) {
                items.add(ItemEntry.fromJson(e));
            }
        }
        return new ChestRecord(x, y, z, name, lastSeen, items);
    }
}
