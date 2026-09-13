package com.skydex.garden;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.skydex.data.ItemNames;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Names, ground types and image ids shared with the Skydex Greenhouse.
 *
 * <p>The source file is copied from the website into the mod resources during
 * development. Reading that same catalogue avoids a second hand-maintained
 * table quietly assigning the wrong ground or label to a share code.
 */
public final class GreenhouseCatalog {

    private static final String RESOURCE = "/assets/skydex/greenhouse/data.json";
    private static final Map<String, Entry> ENTRIES = load();

    /** Observed block ids whose spelling differs from the website id. */
    private static final Map<String, String> ALIASES = Map.of(
            "LONELILLY", "lonelily",
            "SNOOZLINGFLOWER", "snoozling",
            "CARROTS", "carrot",
            "POTATOES", "potato",
            "COCOA", "cocoa_beans",
            "COCO", "cocoa_beans",
            "PLANTBOY", "plantboy_advance",
            "JERRYSEED", "jerryflower",
            "DEADBUSH", "dead_plant");

    private GreenhouseCatalog() {
    }

    public static java.util.Set<String> ids() { return ENTRIES.keySet(); }

    public static int size(String value) {
        String id = canonicalId(value);
        var entry = id == null ? null : ENTRIES.get(id);
        return entry == null ? 1 : entry.size();
    }

    public static String canonicalId(String value) {
        String key = MutationNames.normalise(value);
        if (key.isEmpty()) {
            return null;
        }
        String alias = ALIASES.get(key);
        if (alias != null) {
            return alias;
        }
        String candidate = value.trim().toLowerCase(Locale.ROOT)
                .replace(' ', '_').replace('-', '_');
        if (ENTRIES.containsKey(candidate)) {
            return candidate;
        }
        // Display names and ids both reduce to the same punctuation-free key.
        for (Map.Entry<String, Entry> entry : ENTRIES.entrySet()) {
            if (MutationNames.normalise(entry.getKey()).equals(key)
                    || MutationNames.normalise(entry.getValue().name()).equals(key)) {
                return entry.getKey();
            }
        }
        return candidate;
    }

    public static String displayName(String value) {
        String id = canonicalId(value);
        Entry entry = id == null ? null : ENTRIES.get(id);
        return entry == null ? ItemNames.prettify(value) : entry.name();
    }

    public static String ground(String value) {
        String id = canonicalId(value);
        Entry entry = id == null ? null : ENTRIES.get(id);
        return entry == null || entry.ground() == null ? "farmland" : entry.ground();
    }

    /** null when no packaged crop image exists for this id. */
    public static String textureId(String value) {
        String id = canonicalId(value);
        return id != null && ENTRIES.containsKey(id) ? id : null;
    }

    public static boolean isKnown(String value) {
        String id = canonicalId(value);
        return id != null && ENTRIES.containsKey(id);
    }

    /** The crops that surround a mutation, in the same order as the site catalogue. */
    public static List<Requirement> requirements(String value) {
        String id = canonicalId(value);
        Entry entry = id == null ? null : ENTRIES.get(id);
        return entry == null ? List.of() : entry.requirements();
    }

    private static Map<String, Entry> load() {
        Map<String, Entry> result = new HashMap<>();
        try (InputStream stream = GreenhouseCatalog.class.getResourceAsStream(RESOURCE)) {
            if (stream == null) {
                return Map.of();
            }
            JsonObject root = JsonParser.parseReader(
                    new InputStreamReader(stream, StandardCharsets.UTF_8)).getAsJsonObject();
            readGroup(root, "crops", result);
            readGroup(root, "mutations", result);
            return Map.copyOf(result);
        } catch (Exception ignored) {
            // The screen can still render labels and farmland without the
            // catalogue. A missing image is safer than failing mod startup.
            return Map.of();
        }
    }

    private static void readGroup(JsonObject root, String key, Map<String, Entry> out) {
        if (!root.has(key) || !root.get(key).isJsonObject()) {
            return;
        }
        for (Map.Entry<String, JsonElement> item : root.getAsJsonObject(key).entrySet()) {
            if (!item.getValue().isJsonObject()) {
                continue;
            }
            JsonObject value = item.getValue().getAsJsonObject();
            String name = string(value, "name", ItemNames.prettify(item.getKey()));
            String ground = string(value, "ground", "farmland");
            out.put(item.getKey().toLowerCase(Locale.ROOT),
                    new Entry(name, ground, requirements(value), value.has("size")
                            ? Math.clamp(value.get("size").getAsInt(), 1, 3) : 1));
        }
    }

    private static List<Requirement> requirements(JsonObject value) {
        if (!value.has("requirements") || !value.get("requirements").isJsonArray()) {
            return List.of();
        }
        List<Requirement> result = new ArrayList<>();
        for (JsonElement element : value.getAsJsonArray("requirements")) {
            if (!element.isJsonObject()) {
                continue;
            }
            JsonObject requirement = element.getAsJsonObject();
            String crop = string(requirement, "crop", "").trim().toLowerCase(Locale.ROOT);
            int count = requirement.has("count") && requirement.get("count").isJsonPrimitive()
                    ? requirement.get("count").getAsInt() : 0;
            if (!crop.isEmpty() && count > 0) {
                result.add(new Requirement(crop, count));
            }
        }
        return List.copyOf(result);
    }

    private static String string(JsonObject object, String key, String fallback) {
        if (!object.has(key) || !object.get(key).isJsonPrimitive()) {
            return fallback;
        }
        String value = object.get(key).getAsString();
        return value.isBlank() ? fallback : value;
    }

    public record Requirement(String cropId, int count) {
    }

    private record Entry(String name, String ground, List<Requirement> requirements, int size) {
    }
}
