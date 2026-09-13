package com.skydex.data;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;

/**
 * Structured per-item detail for SkyCrypt-style tooltips.
 *
 * <p>Spec shape, every field optional:
 * <pre>
 * "extra": { "reforge": "Rapid", "stars": 3, "ench": {"BIG_BRAIN": 3}, "recomb": true }
 * </pre>
 *
 * <p>The important case is {@code ENCHANTED_BOOK}: every book shares one id, so
 * without {@code ench} a reader sees "Enchanted Book x51" and learns nothing.
 * The id stays {@code ENCHANTED_BOOK} and the enchantment rides in {@code ench}.
 *
 * <p>Compact structured data only — never raw lore text.
 */
public final class ItemExtra {

    public static final ItemExtra EMPTY = new ItemExtra(null, 0, Map.of(), false, null);

    private final String reforge;
    private final int stars;
    private final Map<String, Integer> enchantments;
    private final boolean recombobulated;
    private final String skin;

    public ItemExtra(String reforge, int stars, Map<String, Integer> enchantments, boolean recombobulated) {
        this(reforge, stars, enchantments, recombobulated, null);
    }

    public ItemExtra(String reforge, int stars, Map<String, Integer> enchantments,
                     boolean recombobulated, String skin) {
        this.skin = skin == null || skin.isBlank() ? null : skin;
        this.reforge = reforge == null || reforge.isBlank() ? null : reforge;
        this.stars = Math.max(0, stars);
        // Filter here rather than at the call site: a level-zero enchantment is
        // noise on the wire, and this is the one place every producer passes
        // through.
        this.enchantments = filterLevels(enchantments);
        this.recombobulated = recombobulated;
    }

    /** Sorted for a reproducible wire format; non-positive levels dropped. */
    private static Map<String, Integer> filterLevels(Map<String, Integer> source) {
        if (source == null || source.isEmpty()) {
            return Map.of();
        }
        Map<String, Integer> kept = new TreeMap<>();
        for (Map.Entry<String, Integer> e : source.entrySet()) {
            if (e.getKey() != null && !e.getKey().isBlank()
                    && e.getValue() != null && e.getValue() > 0) {
                kept.put(e.getKey(), e.getValue());
            }
        }
        return kept.isEmpty() ? Map.of() : kept;
    }

    /** null when the item is not reforged. */
    public String reforge() {
        return reforge;
    }

    /** 0 when the item has no stars. */
    public int stars() {
        return stars;
    }

    /** Enchantment id (upper case) to level; empty when none. */
    public Map<String, Integer> enchantments() {
        return enchantments;
    }

    public boolean recombobulated() {
        return recombobulated;
    }

    /**
     * Texture hash for a player_head item, or null. Custom heads cover pets,
     * abiphones and a large slice of SkyBlock items that have no wiki image, so
     * this is often the only way the site can draw them at all.
     */
    public String skin() {
        return skin;
    }

    /** Nothing worth shipping: the whole {@code extra} object is then omitted. */
    public boolean isEmpty() {
        return reforge == null && stars == 0 && enchantments.isEmpty()
                && !recombobulated && skin == null;
    }

    /** @return the object, or null when empty so the caller omits the key */
    public JsonObject toJson() {
        if (isEmpty()) {
            return null;
        }
        JsonObject o = new JsonObject();
        if (reforge != null) {
            o.addProperty("reforge", reforge);
        }
        if (stars > 0) {
            o.addProperty("stars", stars);
        }
        if (!enchantments.isEmpty()) {
            JsonObject ench = new JsonObject();
            for (Map.Entry<String, Integer> e : enchantments.entrySet()) {
                ench.addProperty(e.getKey(), e.getValue());
            }
            o.add("ench", ench);
        }
        if (recombobulated) {
            o.addProperty("recomb", true);
        }
        if (skin != null) {
            o.addProperty("skin", skin);
        }
        return o;
    }

    /** @return the parsed extra, or {@link #EMPTY} when absent or unusable */
    public static ItemExtra fromJson(JsonElement element) {
        if (element == null || !element.isJsonObject()) {
            return EMPTY;
        }
        JsonObject o = element.getAsJsonObject();
        String reforge = o.has("reforge") && o.get("reforge").isJsonPrimitive()
                ? o.get("reforge").getAsString() : null;
        int stars = o.has("stars") && o.get("stars").isJsonPrimitive() ? o.get("stars").getAsInt() : 0;
        boolean recomb = o.has("recomb") && o.get("recomb").isJsonPrimitive()
                && o.get("recomb").getAsBoolean();
        String skin = o.has("skin") && o.get("skin").isJsonPrimitive()
                ? o.get("skin").getAsString() : null;

        Map<String, Integer> ench = new LinkedHashMap<>();
        if (o.has("ench") && o.get("ench").isJsonObject()) {
            for (Map.Entry<String, JsonElement> e : o.getAsJsonObject("ench").entrySet()) {
                if (e.getValue().isJsonPrimitive()) {
                    ench.put(e.getKey(), e.getValue().getAsInt());
                }
            }
        }
        return new ItemExtra(reforge, stars, ench, recomb, skin);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof ItemExtra other)) {
            return false;
        }
        return stars == other.stars
                && recombobulated == other.recombobulated
                && Objects.equals(reforge, other.reforge)
                && Objects.equals(skin, other.skin)
                && enchantments.equals(other.enchantments);
    }

    @Override
    public int hashCode() {
        return Objects.hash(reforge, stars, enchantments, recombobulated, skin);
    }

    @Override
    public String toString() {
        return "ItemExtra[reforge=" + reforge + ", stars=" + stars
                + ", ench=" + enchantments + ", recomb=" + recombobulated
                + ", skin=" + skin + "]";
    }
}
