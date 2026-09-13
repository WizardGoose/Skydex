package com.skydex;

import com.skydex.location.GardenAreas;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Built from strings captured in the owner's live client, not from an
 * assumption about the wording. This check has been wrong twice, and both
 * failures were invisible to headless testing because both times the test
 * asserted the same guess the code made.
 *
 * <p>Verbatim from his {@code logs/latest.log}:
 *
 * <pre>
 *   Location: The Garden [glyph] x1    (at the barn)
 *   Location: Plot - 3                 (in the greenhouse)
 *   Location: Plot - 2                 (another plot)
 * </pre>
 *
 * <p>The glyphs are written as unicode escapes rather than literal characters so
 * the fixtures cannot be silently mangled by a file encoding. U+E018 is the
 * codepoint decoded from the raw bytes {@code EE 80 98} in his log; U+E067 is
 * the area glyph the tracker already knows about.
 */
class GardenAreasTest {

    /** Hypixel's area glyph, as used by LocationTracker. */
    private static final String AREA = "";
    /** The ironman/recycle marker that appears mid-line on his island. */
    private static final String RECYCLE = "";
    /** The printable fallback some fonts render instead. */
    private static final String AREA_ALT = "⏣";

    /** His barn location line, exactly as the mod received it. */
    private static final String CAPTURED_BARN = "The Garden " + RECYCLE + " x1";

    @Test
    @DisplayName("CAPTURED: the decorated barn line is the Garden")
    void capturedBarnLine() {
        // This exact string was rejected in playtest 2, under a sidebar that
        // plainly said The Garden. Whole-line matching broke on the decoration
        // just as substring matching had broken on looseness.
        assertTrue(GardenAreas.isGardenLine(CAPTURED_BARN), CAPTURED_BARN);
        assertTrue(GardenAreas.isGardenLine(AREA + " " + CAPTURED_BARN));
        assertEquals("the garden x1", GardenAreas.normalisedText(CAPTURED_BARN));
    }

    @Test
    @DisplayName("CAPTURED: plot lines are the Garden, which is where greenhouses live")
    void capturedPlotLines() {
        // The barn never holds a greenhouse, so rejecting these rejected the
        // only places the feature can ever work.
        assertTrue(GardenAreas.isGardenLine("Plot - 3"));
        assertTrue(GardenAreas.isGardenLine("Plot - 2"));
        assertTrue(GardenAreas.isGardenLine(AREA + " Plot - 3"));
        assertEquals(3, GardenAreas.plotNumber("Plot - 3"));
        assertEquals(2, GardenAreas.plotNumber(AREA + " Plot - 2"));
    }

    @Test
    @DisplayName("CAPTURED: the bare area name counts too")
    void capturedAreaLine() {
        assertTrue(GardenAreas.isGardenLine("Garden"));
        assertTrue(GardenAreas.isGardenLine(AREA + " Garden"));
        assertTrue(GardenAreas.isGardenLine(AREA_ALT + " The Garden"));
    }

    @Test
    @DisplayName("decoration after the area name is ignored, whatever it is")
    void decorationIsIgnored() {
        // The point of normalising rather than enumerating: the next glyph
        // nobody has seen yet must not break this a third time.
        assertTrue(GardenAreas.isGardenLine("The Garden x1"));
        assertTrue(GardenAreas.isGardenLine("The Garden x12"));
        assertTrue(GardenAreas.isGardenLine("Garden " + RECYCLE));
        assertTrue(GardenAreas.isGardenLine("Plot - 3 " + RECYCLE + " x1"));
        assertTrue(GardenAreas.isGardenLine("The Garden" + RECYCLE + "x1"));
    }

    @Test
    @DisplayName("all 24 plots are accepted, and out-of-range numbers are not")
    void everyPlotNumber() {
        for (int i = 1; i <= 24; i++) {
            assertTrue(GardenAreas.isGardenLine("Plot - " + i), "plot " + i + " rejected");
            assertEquals(i, GardenAreas.plotNumber("Plot - " + i));
        }
        assertEquals(-1, GardenAreas.plotNumber("Plot - 0"));
        assertEquals(-1, GardenAreas.plotNumber("Plot - 25"));
        assertFalse(GardenAreas.isGardenLine("Plot - 99"));
    }

    @Test
    @DisplayName("spacing around the dash does not matter")
    void spacingTolerance() {
        assertTrue(GardenAreas.isGardenLine("Plot - 3"));
        assertTrue(GardenAreas.isGardenLine("Plot -3"));
        assertTrue(GardenAreas.isGardenLine("Plot- 3"));
        assertTrue(GardenAreas.isGardenLine("Plot-3"));
        assertTrue(GardenAreas.isGardenLine("plot - 3"));
        assertTrue(GardenAreas.isGardenLine("  Plot  -  3  "));
    }

    @Test
    @DisplayName("any one matching line decides it, whatever order the sidebar came in")
    void anyLineDecides() {
        // area() returns whichever glyph line came first out of an unordered
        // collection, so the decision must not depend on which that is.
        assertTrue(GardenAreas.isGarden(List.of("Winter 1st", "1:20am", AREA + " Plot - 3")));
        assertTrue(GardenAreas.isGarden(List.of(AREA + " Some Renamed Plot", "Garden")));
        assertTrue(GardenAreas.isGarden(List.of(CAPTURED_BARN)));
        assertFalse(GardenAreas.isGarden(List.of("Winter 1st", AREA + " Village")));
        assertFalse(GardenAreas.isGarden(List.of()));
        assertFalse(GardenAreas.isGarden(null));
    }

    @Test
    @DisplayName("other islands are not the Garden")
    void otherAreas() {
        // The Hub especially: it has its own Carpenter NPC and would otherwise
        // pass every remaining corroboration the scanner does.
        for (String line : new String[]{
                "Your Island", "Hub", "Village", "Dungeon Hub", "The Barn",
                "Private Island", "Crystal Hollows", "Farming Islands"}) {
            assertFalse(GardenAreas.isGardenLine(line), line + " must not read as the Garden");
            assertFalse(GardenAreas.isGardenLine(AREA + " " + line));
        }
    }

    @Test
    @DisplayName("the line must name the area, not merely mention it")
    void mustNameTheArea() {
        // Normalising strips decoration, so the guard against false positives is
        // that trailing WORDS are not allowed, only counts and bare numbers.
        assertFalse(GardenAreas.isGardenLine("Garden Visitors: 3"));
        assertFalse(GardenAreas.isGardenLine("Visit the Garden!"));
        assertFalse(GardenAreas.isGardenLine("Plot - 3 locked"));
        assertFalse(GardenAreas.isGardenLine("Garden Level 7"));
    }

    @Test
    @DisplayName("junk in does not throw")
    void handlesJunk() {
        assertFalse(GardenAreas.isGardenLine(null));
        assertFalse(GardenAreas.isGardenLine(""));
        assertFalse(GardenAreas.isGardenLine("   "));
        assertFalse(GardenAreas.isGardenLine(AREA));
        assertEquals(0, GardenAreas.normalise(null).length);
        assertEquals(0, GardenAreas.normalise(AREA + AREA).length);
    }
}
