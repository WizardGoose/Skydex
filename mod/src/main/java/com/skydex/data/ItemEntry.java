package com.skydex.data;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.Objects;

/**
 * One stack as recorded by the mod. Field names here are part of the
 * island-data-spec v1 contract: {@code id}, {@code name}, {@code count} and the
 * optional {@code extra}.
 *
 * <p>Pure JDK + Gson: no Minecraft types, so this is unit-testable without a
 * game classpath.
 */
public final class ItemEntry {

    /** Sentinel for "this entry is not tied to a container slot" (sacks). */
    public static final int NO_SLOT = -1;

    private final String id;
    private final String name;
    private final int count;
    private final ItemExtra extra;
    private final int slot;

    public ItemEntry(String id, String name, int count) {
        this(id, name, count, ItemExtra.EMPTY, NO_SLOT);
    }

    public ItemEntry(String id, String name, int count, ItemExtra extra) {
        this(id, name, count, extra, NO_SLOT);
    }

    public ItemEntry(String id, String name, int count, ItemExtra extra, int slot) {
        this.slot = slot < 0 ? NO_SLOT : slot;
        this.id = Objects.requireNonNull(id, "id");
        this.extra = extra == null ? ItemExtra.EMPTY : extra;
        // A null name means "whatever the reader would rebuild", which depends
        // on the reforge, so extra has to be resolved first.
        this.name = name == null ? ItemNames.expected(id, this.extra.reforge()) : name;
        this.count = count;
    }

    public String id() {
        return id;
    }

    public String name() {
        return name;
    }

    public int count() {
        return count;
    }

    /** Never null; {@link ItemExtra#EMPTY} when there is nothing to say. */
    public ItemExtra extra() {
        return extra;
    }

    /**
     * The 0-based container slot, or {@link #NO_SLOT}.
     *
     * <p>Present for containers so the site can draw the real grid with its
     * gaps; absent for sacks, which are aggregates with no layout.
     */
    public int slot() {
        return slot;
    }

    public boolean hasSlot() {
        return slot >= 0;
    }

    /**
     * {@code name} is omitted when the reader can rebuild it — either from the
     * id alone, or from the reforge plus the id. On a real island that is the
     * large majority of entries.
     */
    public JsonObject toJson() {
        JsonObject o = new JsonObject();
        o.addProperty("id", id);
        if (!ItemNames.isRedundant(id, name, extra.reforge())) {
            o.addProperty("name", name);
        }
        o.addProperty("count", count);
        if (slot >= 0) {
            o.addProperty("slot", slot);
        }
        JsonObject extraJson = extra.toJson();
        if (extraJson != null) {
            o.add("extra", extraJson);
        }
        return o;
    }

    public static ItemEntry fromJson(JsonElement element) {
        JsonObject o = element.getAsJsonObject();
        String id = o.get("id").getAsString();
        ItemExtra extra = ItemExtra.fromJson(o.get("extra"));
        int slot = o.has("slot") && o.get("slot").isJsonPrimitive()
                ? o.get("slot").getAsInt() : NO_SLOT;
        // Absent name means "same as what the reader would rebuild", which the
        // constructor fills in, so a round trip is lossless.
        String name = o.has("name") && !o.get("name").isJsonNull() ? o.get("name").getAsString() : null;
        int count = o.has("count") && !o.get("count").isJsonNull() ? o.get("count").getAsInt() : 1;
        return new ItemEntry(id, name, count, extra, slot);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof ItemEntry other)) {
            return false;
        }
        return count == other.count && slot == other.slot && id.equals(other.id)
                && name.equals(other.name) && extra.equals(other.extra);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, name, count, extra, slot);
    }

    @Override
    public String toString() {
        return "ItemEntry[" + id + " x" + count
                + (slot >= 0 ? " @" + slot : "")
                + (extra.isEmpty() ? "" : " " + extra) + "]";
    }
}
