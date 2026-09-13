package com.skydex;

import com.skydex.data.IslandSnapshot;
import com.skydex.export.CompactCodec;
import com.skydex.export.ExportCodec;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The proposed schema-2 payload. Not emitted yet — this exists to prove the
 * format is lossless and to measure what it actually buys, so the proposal
 * carries numbers rather than hopes.
 */
class CompactCodecTest {

    @Test
    @DisplayName("v2 round-trips the small fixture exactly")
    void roundTripsFixture() {
        IslandSnapshot original = Fixtures.snapshot();
        IslandSnapshot decoded = CompactCodec.decode(CompactCodec.encode(original));

        // Comparing the v1 serialisation of both is the strongest check: if the
        // documents match, nothing was lost on the way through v2.
        assertEquals(original.toMinifiedJson(), decoded.toMinifiedJson());
    }

    @Test
    @DisplayName("v2 round-trips a full island including slots, names and extras")
    void roundTripsBigSnapshot() {
        IslandSnapshot original = Fixtures.bigSnapshot();
        IslandSnapshot decoded = CompactCodec.decode(CompactCodec.encode(original));
        assertEquals(original.toMinifiedJson(), decoded.toMinifiedJson());
    }

    @Test
    @DisplayName("uncaptured sections stay uncaptured through v2")
    void preservesAbsentSections() {
        IslandSnapshot original = Fixtures.snapshot().withoutApiCoveredSections();
        IslandSnapshot decoded = CompactCodec.decode(CompactCodec.encode(original));

        assertNull(decoded.inventory());
        assertNull(decoded.enderChest());
        assertNull(decoded.storage());
        assertEquals(original.toMinifiedJson(), decoded.toMinifiedJson());
    }

    @Test
    @DisplayName("the string pool dedupes: thousands of stacks, a few hundred strings")
    void stringsArePooled() {
        IslandSnapshot snapshot = Fixtures.bigSnapshot();
        com.google.gson.JsonObject payload = com.google.gson.JsonParser
                .parseString(CompactCodec.encode(snapshot)).getAsJsonObject();

        com.google.gson.JsonArray pool = payload.getAsJsonArray("P");
        java.util.Set<String> distinct = new java.util.HashSet<>();
        pool.forEach(e -> distinct.add(e.getAsString()));
        assertEquals(pool.size(), distinct.size(), "the pool must hold no duplicates");

        int stacks = snapshot.chests().stream().mapToInt(c -> c.items().size()).sum()
                + snapshot.inventory().size()
                + snapshot.enderChest().size()
                + snapshot.storage().size();
        assertTrue(pool.size() < stacks / 2,
                "expected far fewer pooled strings than stacks: " + pool.size() + " vs " + stacks);
    }

    @Test
    @DisplayName("v2 refuses a payload that is not v2")
    void rejectsWrongVersion() {
        assertTrue(org.junit.jupiter.api.Assertions.assertThrows(
                        IllegalArgumentException.class,
                        () -> CompactCodec.decode("{\"v\":1}"))
                .getMessage().contains("schema 2"));
    }

    @Test
    @DisplayName("measure: v2 against v1 on a realistic island")
    void measureAgainstV1() {
        IslandSnapshot full = Fixtures.bigSnapshot();

        for (boolean withInventory : new boolean[]{false, true}) {
            IslandSnapshot snapshot = withInventory ? full : full.withoutApiCoveredSections();

            String v1Json = snapshot.toMinifiedJson();
            String v2Json = CompactCodec.encode(snapshot);
            String v1Code = ExportCodec.encode(v1Json);
            String v2Code = CompactCodec.PREFIX + ExportCodec.encode(v2Json)
                    .substring(ExportCodec.PREFIX.length());

            System.out.printf("%n=== %s ===%n",
                    withInventory ? "full island (include-inventory ON)" : "chests + sacks only");
            System.out.printf("  v1 JSON : %,8d chars%n", v1Json.length());
            System.out.printf("  v2 JSON : %,8d chars   (%.2fx smaller)%n",
                    v2Json.length(), (double) v1Json.length() / v2Json.length());
            System.out.printf("  v1 CODE : %,8d chars%n", v1Code.length());
            System.out.printf("  v2 CODE : %,8d chars   (%.2fx smaller)%n",
                    v2Code.length(), (double) v1Code.length() / v2Code.length());
        }

        // The headline case is his: everything included.
        String v1 = ExportCodec.encode(full.toMinifiedJson());
        String v2 = ExportCodec.encode(CompactCodec.encode(full));
        assertTrue(v2.length() < v1.length(), "v2 must be smaller than v1");
    }
}
