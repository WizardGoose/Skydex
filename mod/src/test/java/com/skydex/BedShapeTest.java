package com.skydex;

import com.skydex.garden.BedBlocks;
import com.skydex.garden.BedShape;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The bed finder replaced arithmetic that could not tell it was wrong. It is
 * pure array logic precisely so this half can be tested exhaustively, leaving
 * only the block reads to be confirmed in game.
 */
class BedShapeTest {

    /** A grid with a rectangle of floor at (ox,oz), size w by h. */
    private static boolean[][] withRect(int size, int ox, int oz, int w, int h) {
        boolean[][] grid = new boolean[size][size];
        for (int x = ox; x < ox + w; x++) {
            for (int z = oz; z < oz + h; z++) {
                grid[x][z] = true;
            }
        }
        return grid;
    }

    @Test
    @DisplayName("a clean rectangle is found exactly")
    void findsCleanRectangle() {
        BedShape.Bed bed = BedShape.largestPatch(withRect(31, 8, 11, 10, 10));
        assertNotNull(bed);
        assertEquals(8, bed.minX());
        assertEquals(11, bed.minZ());
        assertEquals(10, bed.width());
        assertEquals(10, bed.height());
        assertEquals(100, bed.cells());
        assertEquals(1.0, bed.fillRatio(), 1e-9);
        assertEquals(17, bed.maxX());
        assertEquals(20, bed.maxZ());
    }

    @Test
    @DisplayName("a bed with crops and gaps in it is still one bed")
    void toleratesHoles() {
        // A real bed is never solid floor: crops stand in it, paths cross it.
        // Requiring a perfect rectangle would find nothing at all.
        boolean[][] grid = withRect(31, 5, 5, 10, 10);
        grid[7][7] = false;
        grid[8][7] = false;
        grid[12][11] = false;
        BedShape.Bed bed = BedShape.largestPatch(grid);
        assertNotNull(bed);
        assertEquals(5, bed.minX());
        assertEquals(10, bed.width());
        assertEquals(10, bed.height());
        assertEquals(97, bed.cells());
        assertTrue(bed.isConvincing(16, 0.55));
    }

    @Test
    @DisplayName("a non-square bed keeps its real dimensions")
    void nonSquareBed() {
        // The old code assumed 10x10 and would have cropped or padded anything
        // else. Deriving the size means a differently shaped greenhouse reads
        // correctly instead of partially.
        BedShape.Bed bed = BedShape.largestPatch(withRect(31, 3, 4, 12, 7));
        assertNotNull(bed);
        assertEquals(12, bed.width());
        assertEquals(7, bed.height());
        assertEquals(84, bed.cells());
    }

    @Test
    @DisplayName("the biggest patch wins when there are several")
    void picksLargestPatch() {
        boolean[][] grid = withRect(31, 0, 0, 3, 3);
        for (int x = 20; x < 28; x++) {
            for (int z = 20; z < 28; z++) {
                grid[x][z] = true;
            }
        }
        BedShape.Bed bed = BedShape.largestPatch(grid);
        assertNotNull(bed);
        assertEquals(20, bed.minX());
        assertEquals(8, bed.width());
        assertEquals(64, bed.cells());
    }

    @Test
    @DisplayName("patches touching only at a corner stay separate")
    void diagonalDoesNotJoin() {
        // 4-way connectivity on purpose: with diagonals, two beds meeting at a
        // corner would merge into one box covering both and the gap between.
        boolean[][] grid = new boolean[10][10];
        for (int i = 0; i < 3; i++) {
            for (int j = 0; j < 3; j++) {
                grid[i][j] = true;
                grid[i + 4][j + 4] = true;
            }
        }
        BedShape.Bed bed = BedShape.largestPatch(grid);
        assertNotNull(bed);
        assertEquals(9, bed.cells(), "the two patches must not have merged");
        assertEquals(3, bed.width());
    }

    @Test
    @DisplayName("scattered dirt is not convincing")
    void rejectsScatter() {
        boolean[][] grid = new boolean[31][31];
        // A thin diagonal-ish smear: connected, but nothing like a bed.
        for (int i = 0; i < 20; i++) {
            grid[i][i / 2] = true;
            grid[i][i / 2 + 1] = true;
        }
        BedShape.Bed bed = BedShape.largestPatch(grid);
        assertNotNull(bed);
        assertFalse(bed.isConvincing(16, 0.55), "a smear must not pass as a bed: " + bed.fillRatio());
    }

    @Test
    @DisplayName("a tiny patch is decoration, not a bed")
    void rejectsTinyPatch() {
        BedShape.Bed bed = BedShape.largestPatch(withRect(31, 5, 5, 3, 3));
        assertNotNull(bed);
        assertEquals(9, bed.cells());
        assertFalse(bed.isConvincing(16, 0.55));
        // A single strip is not a bed either, however long.
        assertFalse(BedShape.largestPatch(withRect(31, 0, 0, 20, 1)).isConvincing(16, 0.55));
    }

    @Test
    @DisplayName("an empty or missing grid yields nothing rather than throwing")
    void handlesEmpty() {
        assertNull(BedShape.largestPatch(null));
        assertNull(BedShape.largestPatch(new boolean[0][0]));
        assertNull(BedShape.largestPatch(new boolean[10][10]));
    }

    @Test
    @DisplayName("a fully floored search area still resolves without recursing to death")
    void handlesFullGrid() {
        // 31x31 all floor: the iterative flood fill must cope, where a recursive
        // one would be 961 frames deep on the client thread.
        BedShape.Bed bed = BedShape.largestPatch(withRect(31, 0, 0, 31, 31));
        assertNotNull(bed);
        assertEquals(961, bed.cells());
        assertEquals(31, bed.width());
    }

    @Test
    @DisplayName("the floor palette accepts growing media and refuses the building")
    void bedPalette() {
        for (String path : new String[]{"farmland", "dirt", "coarse_dirt", "grass_block",
                "podzol", "soul_sand", "sand", "moss_block", "mud", "clay"}) {
            assertTrue(BedBlocks.isBed(path), path + " should count as bed");
        }
        for (String path : new String[]{"glass", "white_stained_glass", "stone", "oak_log",
                "air", "water", "wheat", "barrier", "glass_pane"}) {
            assertFalse(BedBlocks.isBed(path), path + " must not count as bed");
        }
        assertFalse(BedBlocks.isBed(null));
        assertFalse(BedBlocks.isBed(""));
        assertTrue(BedBlocks.isBed("  FARMLAND  "));
    }
}
