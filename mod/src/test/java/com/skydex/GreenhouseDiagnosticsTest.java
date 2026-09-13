package com.skydex;

import com.skydex.garden.GreenhouseDiagnostics;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Rewritten alongside the move from arithmetic to observation.
 *
 * <p>The states this used to guard ({@code GRID_MISMATCH}, {@code Y_DRIFT},
 * {@code EMPTY_UNCONFIRMED}) were hedges against constants nobody had verified.
 * They are gone, because finding the bed answers what they were guessing at. The
 * property that carries over unchanged is the important one: exactly one state
 * is allowed to emit, and every other state can say what it saw.
 */
class GreenhouseDiagnosticsTest {

    @Test
    @DisplayName("only OBSERVED is allowed to produce a payload")
    void onlyObservedCaptures() {
        for (GreenhouseDiagnostics.Status status : GreenhouseDiagnostics.Status.values()) {
            assertEquals(status == GreenhouseDiagnostics.Status.OBSERVED, status.isCapture(),
                    status + " disagrees about whether it may capture");
        }
    }

    @Test
    @DisplayName("a fresh scanner has never scanned")
    void startsIdle() {
        GreenhouseDiagnostics idle = GreenhouseDiagnostics.idle();
        assertEquals(GreenhouseDiagnostics.Status.IDLE, idle.status());
        assertFalse(idle.hasScanned());
        assertFalse(idle.foundBed());
        assertEquals(0, idle.cellCount());
        assertTrue(idle.unknownHeads().isEmpty());
    }

    @Test
    @DisplayName("a board found off the Garden is refused and names what the sidebar said")
    void offGardenBoardIsRefused() {
        // The check that stops the Hub, which has a real Carpenter, from
        // producing a fictional greenhouse.
        GreenhouseDiagnostics d = GreenhouseDiagnostics.offGardenBoard(5L, "Hub");
        assertEquals(GreenhouseDiagnostics.Status.OFF_GARDEN_BOARD, d.status());
        assertFalse(d.status().isCapture());
        // Naming the sidebar value is what separates "we are in the Hub" from
        // "Hypixel reworded the Garden's area line".
        assertTrue(d.summary().contains("Hub"), d.summary());
        assertTrue(d.summary().contains("nothing was sent"), d.summary());
        assertTrue(GreenhouseDiagnostics.offGardenBoard(5L, null).summary().contains("nothing"));
        assertTrue(GreenhouseDiagnostics.offGardenBoard(5L, "  ").summary().contains("nothing"));
    }

    @Test
    @DisplayName("a missing bed says where it looked and what was there instead")
    void noBedIsActionable() {
        // "No bed found" alone is not something the owner can act on. What the
        // search saw is: if the real floor is a block the palette does not know,
        // this is what names it.
        String detail = "searched 31x31 around the Carpenter at x=91 z=-5, y 67 to 76. "
                + "Commonest blocks there: glass x120, stone x44";
        GreenhouseDiagnostics d = GreenhouseDiagnostics.noBed(5L, detail);
        assertEquals(GreenhouseDiagnostics.Status.NO_BED, d.status());
        assertFalse(d.status().isCapture());
        assertFalse(d.foundBed());
        assertTrue(d.summary().contains("31x31"), d.summary());
        assertTrue(d.summary().contains("glass x120"), d.summary());
        assertTrue(GreenhouseDiagnostics.noBed(5L, null).summary().startsWith("NO PLANTING BED"));
    }

    @Test
    @DisplayName("a board read with no active profile says so instead of claiming success")
    void heldWithNoProfileIsHonest() {
        // Reporting OBSERVED here would print a cell count directly above
        // "Greenhouse: not observed yet", because nothing was stored.
        GreenhouseDiagnostics d = GreenhouseDiagnostics.heldNoProfile(
                5L, GreenhouseDiagnostics.Source.DETECTED, 91, -5, 73, 10, 10, 37);
        assertEquals(GreenhouseDiagnostics.Status.HELD_NO_PROFILE, d.status());
        assertFalse(d.status().isCapture());
        assertTrue(d.foundBed(), "the bed was located even though nothing was stored");
        assertTrue(d.summary().contains("37"), d.summary());
        assertTrue(d.summary().contains("no profile"), d.summary());
    }

    @Test
    @DisplayName("a good scan reports the bed's position and size for an F3 check")
    void observedReportsWhereAndHowBig() {
        // The failure this rewrite exists for was a position that looked
        // plausible and was wrong. Every outcome now names coordinates.
        GreenhouseDiagnostics d = GreenhouseDiagnostics.observed(
                5L, GreenhouseDiagnostics.Source.DETECTED, 88, -2, 71, 10, 10, 37, 2, List.of(), "");
        assertEquals(37, d.cellCount());
        assertEquals(2, d.looseNameMatches());
        assertTrue(d.foundBed());
        assertTrue(d.summary().contains("37 cells"), d.summary());
        assertTrue(d.summary().contains("10x10"), d.summary());
        assertTrue(d.summary().contains("x=88"), d.summary());
        assertTrue(d.summary().contains("z=-2"), d.summary());
        assertTrue(d.summary().contains("y=71"), d.summary());
        assertTrue(d.summary().contains("found by searching"), d.summary());
    }

    @Test
    @DisplayName("an empty bed is a real observation, not a failure")
    void emptyBedIsObserved() {
        // Having located the floor, "nothing is planted" is a fact rather than
        // the ambiguity it used to be, so it is sendable.
        GreenhouseDiagnostics d = GreenhouseDiagnostics.observed(
                5L, GreenhouseDiagnostics.Source.DETECTED, 88, -2, 71, 10, 10, 0, 0, List.of(), "");
        assertTrue(d.status().isCapture());
        assertEquals(0, d.cellCount());
        assertTrue(d.summary().contains("0 cells"), d.summary());
    }

    @Test
    @DisplayName("the measured Carpenter offset is carried so it can be relayed")
    void measuredOffsetIsCarried() {
        // The one line worth relaying out of the whole diagnostic: it turns
        // searching for the bed into knowing where it is.
        GreenhouseDiagnostics d = GreenhouseDiagnostics.observed(
                        5L, GreenhouseDiagnostics.Source.DETECTED, 88, -2, 71, 10, 10, 12, 0, List.of(), "")
                .withMeasuredOffset("bed is dx=-3 dy=-2 dz=3 from the Carpenter's feet, size 10x10");
        assertTrue(d.measuredOffset().contains("dx=-3"), d.measuredOffset());
        assertEquals(12, d.cellCount(), "the copy keeps everything else");
        assertEquals(GreenhouseDiagnostics.Source.DETECTED, d.source());
        assertEquals("", GreenhouseDiagnostics.idle().measuredOffset());
    }

    @Test
    @DisplayName("a bed placed from the Carpenter offset is labelled as such")
    void carpenterSourceIsVisible() {
        GreenhouseDiagnostics d = GreenhouseDiagnostics.observed(
                5L, GreenhouseDiagnostics.Source.CARPENTER, 88, -2, 71, 10, 10, 12, 0, List.of(),
                "placed from the Carpenter, no bed found to confirm it");
        assertTrue(d.summary().contains("from the Carpenter offset"), d.summary());
        assertEquals(GreenhouseDiagnostics.Source.CARPENTER, d.source());
    }

    @Test
    @DisplayName("a non-square bed keeps its real dimensions in the report")
    void nonSquareBedReported() {
        GreenhouseDiagnostics d = GreenhouseDiagnostics.observed(
                5L, GreenhouseDiagnostics.Source.DETECTED, 0, 0, 70, 12, 7, 5, 0, List.of(), "");
        assertEquals(12, d.width());
        assertEquals(7, d.height());
        assertTrue(d.summary().contains("12x7"), d.summary());
    }

    @Test
    @DisplayName("unidentified heads are remembered, but capped")
    void unknownHeadsAreCapped() {
        List<String> many = new ArrayList<>();
        for (int i = 0; i < 50; i++) {
            many.add("Head " + i);
        }
        GreenhouseDiagnostics d = GreenhouseDiagnostics.observed(
                5L, GreenhouseDiagnostics.Source.DETECTED, 0, 0, 70, 10, 10, 0, 0, many, "");
        assertEquals(12, d.unknownHeads().size());
        assertEquals("Head 0", d.unknownHeads().get(0));

        assertTrue(GreenhouseDiagnostics.observed(
                5L, GreenhouseDiagnostics.Source.DETECTED, 0, 0, 70, 10, 10, 0, 0, null, "")
                .unknownHeads().isEmpty());
    }

    @Test
    @DisplayName("every status has a label and a non-blank summary")
    void everyStatusExplainsItself() {
        for (GreenhouseDiagnostics.Status status : GreenhouseDiagnostics.Status.values()) {
            assertFalse(status.label().isBlank(), status + " has no label");
        }
        assertFalse(GreenhouseDiagnostics.idle().summary().isBlank());
        assertFalse(GreenhouseDiagnostics.outsideGarden(1L).summary().isBlank());
        assertTrue(GreenhouseDiagnostics.noGreenhouse(1L).summary().contains("Carpenter"));
    }
}
