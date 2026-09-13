package com.skydex;

import com.skydex.layout.CellStatus;
import com.skydex.render.LayoutProgress;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The snapshot the render thread reads: its packing, its counting, and the fact
 * that nothing can change it after it is built.
 *
 * <p>The packing tests carry negative coordinates deliberately. A greenhouse
 * sits wherever the island put it, the owner's own is at a negative Z, and a
 * packer that silently collides on negatives would mark the wrong cells green
 * in exactly the case nobody thinks to test by hand.
 */
class LayoutProgressTest {

    private static LayoutProgress of(Map<Long, CellStatus> statuses) {
        return new LayoutProgress(statuses);
    }

    // ------------------------------------------------------------------ packing

    @Test
    @DisplayName("a column packs to a key that survives negative coordinates")
    void packsNegativeCoordinates() {
        assertNotEquals(LayoutProgress.pack(-5, -7), LayoutProgress.pack(-7, -5));
        assertNotEquals(LayoutProgress.pack(91, -5), LayoutProgress.pack(-5, 91));
        assertNotEquals(LayoutProgress.pack(0, -1), LayoutProgress.pack(-1, 0));
        assertNotEquals(LayoutProgress.pack(1, 0), LayoutProgress.pack(0, 1));
    }

    @Test
    @DisplayName("the same column always packs to the same key")
    void packingIsStable() {
        assertEquals(LayoutProgress.pack(12, -34), LayoutProgress.pack(12, -34));
        assertEquals(LayoutProgress.pack(-2_000_000, 2_000_000),
                LayoutProgress.pack(-2_000_000, 2_000_000));
    }

    @Test
    @DisplayName("a column is looked up by the world position it was stored under")
    void findsStoredColumns() {
        Map<Long, CellStatus> statuses = new HashMap<>();
        statuses.put(LayoutProgress.pack(91, -5), CellStatus.DONE);
        statuses.put(LayoutProgress.pack(92, -5), CellStatus.MISMATCH);
        LayoutProgress progress = of(statuses);

        assertEquals(CellStatus.DONE, progress.at(91, -5));
        assertEquals(CellStatus.MISMATCH, progress.at(92, -5));
    }

    @Test
    @DisplayName("a column outside the layout reads as empty rather than throwing")
    void unknownColumnsAreEmpty() {
        // The renderer asks about every layout cell every frame; a gap in the
        // map must be an answer, not an exception on the render thread.
        assertEquals(CellStatus.EMPTY, of(Map.of()).at(0, 0));
        assertEquals(CellStatus.EMPTY, LayoutProgress.NONE.at(1234, -9876));
    }

    // ----------------------------------------------------------------- counting

    @Test
    @DisplayName("counts are derived from the cells, so the summary cannot drift")
    void countsMatchTheCells() {
        Map<Long, CellStatus> statuses = new LinkedHashMap<>();
        statuses.put(LayoutProgress.pack(0, 0), CellStatus.DONE);
        statuses.put(LayoutProgress.pack(1, 0), CellStatus.DONE);
        statuses.put(LayoutProgress.pack(2, 0), CellStatus.EMPTY);
        statuses.put(LayoutProgress.pack(3, 0), CellStatus.MISMATCH);
        LayoutProgress progress = of(statuses);

        assertEquals(4, progress.totalCount());
        assertEquals(2, progress.doneCount());
        assertEquals(2, progress.pendingCount(), "empty and mismatched both still owe work");
        assertEquals(50, progress.percent());
    }

    @Test
    @DisplayName("percent rounds down, so it only reads 100 when nothing is left")
    void percentRoundsDown() {
        Map<Long, CellStatus> nearlyDone = new HashMap<>();
        for (int i = 0; i < 100; i++) {
            nearlyDone.put(LayoutProgress.pack(i, 0),
                    i < 99 ? CellStatus.DONE : CellStatus.EMPTY);
        }
        assertEquals(99, of(nearlyDone).percent());

        Map<Long, CellStatus> allDone = new HashMap<>();
        allDone.put(LayoutProgress.pack(0, 0), CellStatus.DONE);
        allDone.put(LayoutProgress.pack(1, 0), CellStatus.DONE);
        allDone.put(LayoutProgress.pack(2, 0), CellStatus.DONE);
        assertEquals(100, of(allDone).percent());
    }

    @Test
    @DisplayName("an empty snapshot reports nothing rather than dividing by zero")
    void emptySnapshotIsSafe() {
        assertTrue(LayoutProgress.NONE.isEmpty());
        assertEquals(0, LayoutProgress.NONE.totalCount());
        assertEquals(0, LayoutProgress.NONE.doneCount());
        assertEquals(0, LayoutProgress.NONE.pendingCount());
        assertEquals(0, LayoutProgress.NONE.percent());
    }

    @Test
    @DisplayName("the summary reads as a sentence a player can act on")
    void summaryReadsPlainly() {
        Map<Long, CellStatus> statuses = new HashMap<>();
        statuses.put(LayoutProgress.pack(0, 0), CellStatus.DONE);
        statuses.put(LayoutProgress.pack(1, 0), CellStatus.EMPTY);
        statuses.put(LayoutProgress.pack(2, 0), CellStatus.EMPTY);
        statuses.put(LayoutProgress.pack(3, 0), CellStatus.EMPTY);
        assertEquals("1 / 4 placed (25%)", of(statuses).summary());
    }

    // --------------------------------------------------------------- immutability

    @Test
    @DisplayName("the snapshot keeps its own copy, so the scan cannot edit it afterwards")
    void snapshotIsIndependentOfTheMapItWasBuiltFrom() {
        // The whole thread-safety argument is that the render thread only ever
        // sees a finished object. That holds only if the tick thread cannot
        // still be holding a reference into it.
        Map<Long, CellStatus> live = new HashMap<>();
        live.put(LayoutProgress.pack(0, 0), CellStatus.DONE);
        LayoutProgress progress = of(live);

        live.put(LayoutProgress.pack(1, 0), CellStatus.DONE);
        live.remove(LayoutProgress.pack(0, 0));

        assertEquals(1, progress.totalCount());
        assertEquals(CellStatus.DONE, progress.at(0, 0));
        assertEquals(CellStatus.EMPTY, progress.at(1, 0));
    }

    @Test
    @DisplayName("both states that still owe work count as pending")
    void pendingCoversEmptyAndMismatch() {
        assertTrue(CellStatus.EMPTY.isPending());
        assertTrue(CellStatus.MISMATCH.isPending());
        assertFalse(CellStatus.DONE.isPending());
        assertTrue(CellStatus.DONE.isDone());
    }
}
