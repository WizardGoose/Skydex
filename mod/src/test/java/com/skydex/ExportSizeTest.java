package com.skydex;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.skydex.data.IslandSnapshot;
import com.skydex.data.ItemNames;
import com.skydex.export.ExportCodec;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import java.util.zip.Deflater;
import java.util.zip.GZIPOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The player's real island produced a ~7.4 KB code, which is unpleasant to
 * paste. Three levers were applied; this measures each one so the claim is a
 * number rather than a hope, and guards against a regression quietly undoing
 * them.
 */
class ExportSizeTest {

    // ------------------------------------------------------------- behaviour

    @Test
    @DisplayName("the export drops the sections the Hypixel API already covers")
    void exportDropsApiCoveredSections() {
        IslandSnapshot full = Fixtures.snapshot();
        assertNotNull(full.inventory(), "the fixture does have an inventory");

        IslandSnapshot export = full.withoutApiCoveredSections();
        assertNull(export.inventory());
        assertNull(export.enderChest());
        assertNull(export.storage());

        // What the site cannot get elsewhere must survive.
        assertNotNull(export.sacks());
        assertNotNull(export.chests());
        assertEquals(Fixtures.EXPECTED_EXPORT_JSON, export.toMinifiedJson());
    }

    @Test
    @DisplayName("dropping sections does not mutate the original snapshot")
    void slimmingIsNonDestructive() {
        IslandSnapshot full = Fixtures.snapshot();
        full.withoutApiCoveredSections();
        assertNotNull(full.inventory(), "the live feed still needs these");
    }

    @Test
    @DisplayName("the live feed still carries everything")
    void liveFeedKeepsEverything() {
        // /v1/island and the SSE stream serialise the snapshot as-is; only the
        // clipboard path slims it.
        String live = Fixtures.snapshot().toMinifiedJson();
        assertTrue(live.contains("\"inventory\""), live);
    }

    @Test
    @DisplayName("gzip runs at maximum compression")
    void usesMaxCompression() {
        byte[] raw = Fixtures.bigSnapshot().toMinifiedJson().getBytes(StandardCharsets.UTF_8);
        assertTrue(ExportCodec.gzip(raw).length < gzipAtLevel(raw, Deflater.DEFAULT_COMPRESSION).length,
                "level 9 should beat the default level on a payload this repetitive");
    }

    // ----------------------------------------------------------- measurement

    @Test
    @DisplayName("measure: the three levers together shrink a realistic island code")
    void measureRealisticIsland() {
        IslandSnapshot snapshot = Fixtures.bigSnapshot();

        String slimJson = snapshot.withoutApiCoveredSections().toMinifiedJson();
        String fullJson = snapshot.toMinifiedJson();
        String fatJson = restoreNames(fullJson);

        int before = ExportCodec.PREFIX.length() + base64Length(gzipAtLevel(
                fatJson.getBytes(StandardCharsets.UTF_8), Deflater.DEFAULT_COMPRESSION));
        int afterNames = ExportCodec.PREFIX.length() + base64Length(gzipAtLevel(
                fullJson.getBytes(StandardCharsets.UTF_8), Deflater.DEFAULT_COMPRESSION));
        int afterSections = ExportCodec.PREFIX.length() + base64Length(gzipAtLevel(
                slimJson.getBytes(StandardCharsets.UTF_8), Deflater.DEFAULT_COMPRESSION));
        int after = ExportCodec.encode(slimJson).length();

        System.out.println("=== export code size, realistic island ===");
        System.out.printf("  JSON  all sections + every name : %,7d chars%n", fatJson.length());
        System.out.printf("  JSON  all sections, names slim  : %,7d chars%n", fullJson.length());
        System.out.printf("  JSON  export sections, names slim: %,6d chars%n", slimJson.length());
        System.out.println("  ---");
        System.out.printf("  CODE  before (old behaviour)    : %,7d chars%n", before);
        System.out.printf("  CODE  + omit redundant names    : %,7d chars%n", afterNames);
        System.out.printf("  CODE  + drop API-covered sects  : %,7d chars%n", afterSections);
        System.out.printf("  CODE  + max gzip (shipped)      : %,7d chars%n", after);
        System.out.printf("  total reduction                 : %.1f%%%n",
                100.0 * (before - after) / before);

        // Each lever must pull in the right direction, and the whole must be a
        // meaningful win. Asserted separately so a regression names itself.
        assertTrue(afterNames < before, "omitting redundant names must shrink the code");
        assertTrue(afterSections < afterNames, "dropping API-covered sections must shrink the code");
        assertTrue(after < afterSections, "max gzip must shrink the code");
        assertTrue(after < before * 0.65,
                "expected a substantial reduction, got " + after + " from " + before);
        // The code must still decode to exactly what we compressed.
        assertEquals(slimJson, ExportCodec.decode(ExportCodec.encode(slimJson)));
    }

    @Test
    @DisplayName("measure: what per-item extras cost the code")
    void measureExtrasCost() {
        IslandSnapshot snapshot = Fixtures.bigSnapshot();
        String withExtras = snapshot.withoutApiCoveredSections().toMinifiedJson();
        String withoutExtras = stripExtras(withExtras);

        String codeWith = ExportCodec.encode(withExtras);
        String codeWithout = ExportCodec.encode(withoutExtras);

        System.out.println("=== cost of per-item extras ===");
        System.out.printf("  JSON without extras : %,7d chars%n", withoutExtras.length());
        System.out.printf("  JSON with extras    : %,7d chars%n", withExtras.length());
        System.out.printf("  CODE without extras : %,7d chars%n", codeWithout.length());
        System.out.printf("  CODE with extras    : %,7d chars  (+%,d, +%.1f%%)%n",
                codeWith.length(), codeWith.length() - codeWithout.length(),
                100.0 * (codeWith.length() - codeWithout.length()) / codeWithout.length());

        // The threshold the feature was gated on: if extras push a realistic
        // code past ~8k chars it ships live-only behind a toggle instead.
        assertTrue(codeWith.length() < 8_000,
                "extras pushed the code to " + codeWith.length()
                        + " chars; past ~8k this must go live-only");
    }

    /** Remove every {@code extra} object, to isolate what they cost. */
    private static String stripExtras(String json) {
        JsonObject root = JsonParser.parseString(json).getAsJsonObject();
        for (String section : new String[]{"inventory", "enderChest", "storage"}) {
            if (root.has(section)) {
                root.getAsJsonArray(section).forEach(e -> e.getAsJsonObject().remove("extra"));
            }
        }
        if (root.has("chests")) {
            for (JsonElement chest : root.getAsJsonArray("chests")) {
                chest.getAsJsonObject().getAsJsonArray("items")
                        .forEach(e -> e.getAsJsonObject().remove("extra"));
            }
        }
        return root.toString();
    }

    // ---------------------------------------------------------------- helpers

    /** Base64url without padding: 4 chars per 3 bytes, rounded up. */
    private static int base64Length(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes).length();
    }

    private static byte[] gzipAtLevel(byte[] raw, int level) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (GZIPOutputStream gz = new GZIPOutputStream(out) {
            {
                def.setLevel(level);
            }
        }) {
            gz.write(raw);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }

    /** Rebuild the old wire format: every item carries an explicit name. */
    private static String restoreNames(String json) {
        JsonObject root = JsonParser.parseString(json).getAsJsonObject();
        for (String section : new String[]{"inventory", "enderChest", "storage"}) {
            if (root.has(section)) {
                restoreNames(root.getAsJsonArray(section));
            }
        }
        if (root.has("chests")) {
            for (JsonElement chest : root.getAsJsonArray("chests")) {
                restoreNames(chest.getAsJsonObject().getAsJsonArray("items"));
            }
        }
        return root.toString();
    }

    private static void restoreNames(JsonArray items) {
        for (JsonElement element : items) {
            JsonObject item = element.getAsJsonObject();
            if (!item.has("name")) {
                // Rebuild in the original field order: id, name, count, slot,
                // extra. Every field except the name has to survive, or the
                // baseline is smaller than the shipped format for reasons that
                // have nothing to do with names.
                String id = item.get("id").getAsString();
                int count = item.get("count").getAsInt();
                JsonElement slot = item.get("slot");
                JsonElement extra = item.get("extra");
                for (Map.Entry<String, JsonElement> e : Map.copyOf(item.asMap()).entrySet()) {
                    item.remove(e.getKey());
                }
                item.addProperty("id", id);
                item.addProperty("name", ItemNames.prettify(id));
                item.addProperty("count", count);
                if (slot != null) {
                    item.add("slot", slot);
                }
                if (extra != null) {
                    item.add("extra", extra);
                }
            }
        }
    }

    @Test
    @DisplayName("the fat baseline really does carry a name on every entry")
    void baselineIsFair() {
        String fat = restoreNames(Fixtures.bigSnapshot().toMinifiedJson());
        JsonObject root = JsonParser.parseString(fat).getAsJsonObject();
        for (JsonElement chest : root.getAsJsonArray("chests")) {
            for (JsonElement item : chest.getAsJsonObject().getAsJsonArray("items")) {
                assertTrue(item.getAsJsonObject().has("name"),
                        "baseline must have every name for the comparison to be honest");
            }
        }
        assertFalse(Fixtures.bigSnapshot().toMinifiedJson().contains("\"name\":\"Enchanted Cobblestone\""),
                "the shipped format should have dropped that redundant name");
    }
}
