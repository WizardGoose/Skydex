package com.skydex;

import com.skydex.capture.SackChatParser;
import com.skydex.data.SnapshotStore;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Every line here is a real one, taken verbatim from the player's own captured
 * chat components.
 *
 * <p>The earlier version of this parser assumed the bracketed value was the
 * item's new total, and its tests passed because the fixtures were invented from
 * that same assumption. It is a list of <b>sack names</b>. These lines exist so
 * that mistake cannot be repeated from fabricated examples.
 */
class SackChatParserTest {

    /** Verbatim from the capture: a mixed add/remove hover pair. */
    private static final List<String> ADDED_HOVER = List.of(
            "Added items:",
            "  +3 Lump of Magma (Lava Fishing Sack)",
            "  +5 Magmafish (Lava Fishing Sack)",
            "",
            "This message can be disabled in the settings.");

    private static final List<String> REMOVED_HOVER = List.of(
            "Removed items:",
            "  -2,161 Magmafish (Lava Fishing Sack)",
            "  -160 Silver Magmafish (Lava Fishing Sack)",
            "",
            "This message can be disabled in the settings.");

    @Test
    @DisplayName("recognises the message and its two hover headers")
    void recognisesMessageAndHovers() {
        assertTrue(SackChatParser.isSackMessage("[Sacks] +1 item. (Last 5s.)"));
        assertTrue(SackChatParser.isSackMessage("[Sacks] +1,007 items, -534 items. (Last 30s.)"));
        assertFalse(SackChatParser.isSackMessage("A Sack of nothing"));

        assertTrue(SackChatParser.isSackHover("Added items:\n  +3 Lump of Magma (Lava Fishing Sack)"));
        assertTrue(SackChatParser.isSackHover("Removed items:\n  -1 Magmafish (Lava Fishing Sack)"));
        assertFalse(SackChatParser.isSackHover("Some other tooltip entirely"));
        assertFalse(SackChatParser.isSackHover(null));
    }

    @Test
    @DisplayName("the bracketed text is a SACK LIST, never a total")
    void bracketsAreSackNamesNotTotals() {
        // "+3 ... (Lava Fishing Sack)" means the change is +3. Reading the
        // brackets as a total is the bug this test exists to prevent.
        Map<String, Long> deltas = SackChatParser.parseDeltas(ADDED_HOVER).deltas();
        assertEquals(3L, deltas.get("LUMP_OF_MAGMA"));
        assertEquals(5L, deltas.get("MAGMAFISH"));
        assertEquals(2, deltas.size());
    }

    @Test
    @DisplayName("a multi-sack bracket list does not confuse the line")
    void multipleSackNamesInBrackets() {
        Map<String, Long> deltas = SackChatParser.parseDeltas(List.of(
                "Added items:",
                "  +7 Mycelium (Mining Sack, Nether Sack, Lava Fishing Sack)")).deltas();
        assertEquals(Map.of("MYCELIUM", 7L), deltas);
    }

    @Test
    @DisplayName("removals are negative deltas")
    void removalsAreNegative() {
        Map<String, Long> deltas = SackChatParser.parseDeltas(REMOVED_HOVER).deltas();
        assertEquals(-2_161L, deltas.get("MAGMAFISH"));
        assertEquals(-160L, deltas.get("SILVER_MAGMAFISH"));
    }

    @Test
    @DisplayName("gemstone lines drop their icon and map to the _GEM id form")
    void gemstoneIconsAndIds() {
        Map<String, Long> deltas = SackChatParser.parseDeltas(List.of(
                "Added items:",
                "  +1,433 ☘ Rough Citrine Gemstone (Gemstones Sack)",
                "  +12 ☂ Flawed Aquamarine Gemstone (Gemstones Sack)",
                "  +2 ☠ Fine Onyx Gemstone (Gemstones Sack)")).deltas();

        assertEquals(1_433L, deltas.get("ROUGH_CITRINE_GEM"));
        assertEquals(12L, deltas.get("FLAWED_AQUAMARINE_GEM"));
        assertEquals(2L, deltas.get("FINE_ONYX_GEM"));
    }

    @Test
    @DisplayName("'Fine Flour' is a real item, not a gemstone cut")
    void fineFlourIsNotAGemstone() {
        // The gemstone rule is anchored on a trailing "Gemstone" precisely so
        // this does not become FINE_FLOUR_GEM.
        assertEquals("FINE_FLOUR", SackChatParser.toItemId("Fine Flour"));
        assertEquals("ROUGH_CITRINE_GEM", SackChatParser.toItemId("☘ Rough Citrine Gemstone"));
    }

    @Test
    @DisplayName("a truncated list is flagged rather than silently under-counted")
    void truncationIsFlagged() {
        SackChatParser.Update update = SackChatParser.parseDeltas(List.of(
                "Added items:",
                "  +3 Lump of Magma (Lava Fishing Sack)",
                "  +61 other items."));

        assertEquals(3L, update.deltas().get("LUMP_OF_MAGMA"));
        assertTrue(update.truncated(), "the 'other items' tail must be noticed");
        assertFalse(SackChatParser.parseDeltas(ADDED_HOVER).truncated());
    }

    @Test
    @DisplayName("literal colour codes inside a name are stripped")
    void stripsColourCodesInNames() {
        // Real captured name: "Blobfish §LBRONZE".
        Map<String, Long> deltas = SackChatParser.parseDeltas(List.of(
                "  +1 Blobfish §LBRONZE (Bronze Trophy Fishing Sack)")).deltas();
        assertEquals(1, deltas.size());
        assertTrue(deltas.keySet().iterator().next().startsWith("BLOBFISH"),
                deltas.keySet().toString());
    }

    @Test
    @DisplayName("noise lines and empty input are handled")
    void handlesNoise() {
        assertTrue(SackChatParser.parseDeltas(List.of(
                "Added items:", "", "This message can be disabled in the settings.")).isEmpty());
        assertTrue(SackChatParser.parseDeltas(null).isEmpty());
        assertTrue(SackChatParser.parseDeltas(List.of()).isEmpty());
        assertEquals("", SackChatParser.toItemId(""));
        assertEquals("", SackChatParser.toItemId(null));
    }

    // -------------------------------------------------------- store semantics

    @Test
    @DisplayName("deltas ADD to the stored total, they do not replace it")
    void deltasAdd() {
        SnapshotStore store = new SnapshotStore(Path.of("unused.json"));
        store.recordSacks(Map.of("MAGMAFISH", 1_000L));

        store.addSacks(SackChatParser.parseDeltas(List.of(
                "  +5 Magmafish (Lava Fishing Sack)")).deltas());

        assertEquals(1_005L, store.toSnapshot(Fixtures.TS).sacks().get("MAGMAFISH"),
                "replacing instead of adding would give 5");
    }

    @Test
    @DisplayName("a removal subtracts, and totals never go below zero")
    void removalsSubtractAndClamp() {
        SnapshotStore store = new SnapshotStore(Path.of("unused.json"));
        store.recordSacks(Map.of("MAGMAFISH", 100L));

        store.addSacks(Map.of("MAGMAFISH", -40L));
        assertEquals(60L, store.toSnapshot(Fixtures.TS).sacks().get("MAGMAFISH"));

        // Overdrawn far past empty. The total clamps at zero, and a zero no
        // longer reaches the wire, so the entry disappears from the snapshot
        // rather than shipping as "you have none of this".
        store.addSacks(Map.of("MAGMAFISH", -999L));
        assertNull(store.toSnapshot(Fixtures.TS).sacks().get("MAGMAFISH"),
                "an emptied sack is not sent");

        // The clamp itself still has to be checked, and checking it through the
        // wire is no longer possible now that zero is omitted. Adding one back
        // does it, and more strictly than the old assertion did: this only reads
        // 1 if the stored total was exactly 0. Had it gone to -939, adding one
        // would clamp again and the entry would still be absent.
        store.addSacks(Map.of("MAGMAFISH", 1L));
        assertEquals(1L, store.toSnapshot(Fixtures.TS).sacks().get("MAGMAFISH"),
                "a total must never go negative");
    }

    @Test
    @DisplayName("an unknown id is ignored rather than invented")
    void unknownIdsAreIgnored() {
        SnapshotStore store = new SnapshotStore(Path.of("unused.json"));
        store.recordSacks(Map.of("MAGMAFISH", 100L));

        // A name that resolves wrongly (or an item never seen in a sack screen)
        // must not create an entry, because nothing would ever correct it.
        int updated = store.addSacks(Map.of("BLOBFISH_BRONZE", 5L, "MAGMAFISH", 1L));

        Map<String, Long> sacks = store.toSnapshot(Fixtures.TS).sacks();
        assertEquals(1, updated);
        assertEquals(1, sacks.size(), "no phantom entry may appear");
        assertEquals(101L, sacks.get("MAGMAFISH"));
    }

    @Test
    @DisplayName("with no sack screen seen yet, chat deltas do nothing at all")
    void noScreenMeansNoEffect() {
        SnapshotStore store = new SnapshotStore(Path.of("unused.json"));
        assertEquals(0, store.addSacks(Map.of("MAGMAFISH", 5L)));
        assertEquals(0, store.sackTypeCount());
    }
}
