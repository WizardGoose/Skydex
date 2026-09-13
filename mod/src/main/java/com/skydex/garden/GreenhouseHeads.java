package com.skydex.garden;

import com.google.gson.JsonParser;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/** Packaged original head skins. Previewing an unseen plant needs no network or archive. */
public final class GreenhouseHeads {
    public static final Set<String> NATIVE_CROPS = Set.of(
            "wheat", "potato", "carrot", "sugar_cane", "nether_wart", "fire", "dead_plant");
    private static final Map<String, String> TEXTURES = load();

    private GreenhouseHeads() {}

    public static Set<String> ids() { return TEXTURES.keySet(); }

    /** Resource path, or null for native blocks and unknown plants. */
    public static String texturePath(String value) {
        String id = GreenhouseCatalog.canonicalId(value);
        return id != null && TEXTURES.containsKey(id) ? "textures/greenhouse/heads/" + id + ".png" : null;
    }

    private static Map<String, String> load() {
        try (var stream = GreenhouseHeads.class.getResourceAsStream("/assets/skydex/greenhouse/heads.json")) {
            if (stream == null) return Map.of();
            var root = JsonParser.parseReader(new InputStreamReader(stream, StandardCharsets.UTF_8))
                    .getAsJsonObject().getAsJsonObject("textures");
            var textures = new HashMap<String, String>();
            for (var entry : root.entrySet()) {
                String hash = entry.getValue().getAsString();
                if (entry.getKey().matches("[a-z_]+") && hash.matches("[a-f0-9]{32,64}"))
                    textures.put(entry.getKey(), hash);
            }
            return Map.copyOf(textures);
        } catch (Exception invalid) {
            return Map.of(); // Existing floor markers remain available if an asset is damaged.
        }
    }
}
