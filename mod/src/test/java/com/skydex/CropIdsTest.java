package com.skydex;

import com.skydex.garden.CropIds;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The greenhouse is a building, so the crop table has to be a whitelist: if any
 * non-air block counted, the board would fill up with glass and flooring.
 */
class CropIdsTest {

    @Test
    @DisplayName("crops follow the spec's vanilla id rule: registry path upper-cased")
    void followsSpecFallbackRule() {
        // Same rule ItemIds already applies to vanilla items, and the same
        // result the spec's own greenhouse example shows for PUMPKIN.
        assertEquals("PUMPKIN", CropIds.fromBlockPath("pumpkin"));
        assertEquals("WHEAT", CropIds.fromBlockPath("wheat"));
        assertEquals("CARROTS", CropIds.fromBlockPath("carrots"));
        assertEquals("POTATOES", CropIds.fromBlockPath("potatoes"));
        assertEquals("NETHER_WART", CropIds.fromBlockPath("nether_wart"));
        assertEquals("SUGAR_CANE", CropIds.fromBlockPath("sugar_cane"));
        assertEquals("COCOA", CropIds.fromBlockPath("cocoa"));
        assertEquals("RED_MUSHROOM", CropIds.fromBlockPath("red_mushroom"));
        assertEquals("BROWN_MUSHROOM", CropIds.fromBlockPath("brown_mushroom"));
    }

    @Test
    @DisplayName("stems report as the fruit, so a planted cell is not read as empty")
    void stemsReportAsTheirFruit() {
        // A layout that says "pumpkin here" is satisfied by a stem, and an
        // ungrown pumpkin is still an occupied cell.
        assertEquals("PUMPKIN", CropIds.fromBlockPath("pumpkin_stem"));
        assertEquals("PUMPKIN", CropIds.fromBlockPath("attached_pumpkin_stem"));
        assertEquals("MELON", CropIds.fromBlockPath("melon_stem"));
        assertEquals("MELON", CropIds.fromBlockPath("attached_melon_stem"));
    }

    @Test
    @DisplayName("dead and burnt cell states count as occupied, not empty")
    void deadStatesAreRealBoardInformation() {
        // "Nothing planted here" and "what was planted here died" are different
        // facts, and the site wants the difference.
        assertEquals("DEAD_BUSH", CropIds.fromBlockPath("dead_bush"));
        assertEquals("FIRE", CropIds.fromBlockPath("fire"));
    }

    @Test
    @DisplayName("building blocks are not crops")
    void structureIsRejected() {
        for (String path : new String[]{
                "glass", "white_stained_glass", "farmland", "dirt", "grass_block", "stone",
                "air", "oak_log", "barrier", "torch", "water"}) {
            assertNull(CropIds.fromBlockPath(path), path + " must not read as a crop");
            assertFalse(CropIds.isCrop(path));
        }
    }

    @Test
    @DisplayName("blank and unknown input is refused rather than invented")
    void handlesJunk() {
        assertNull(CropIds.fromBlockPath(null));
        assertNull(CropIds.fromBlockPath(""));
        assertNull(CropIds.fromBlockPath("   "));
        assertNull(CropIds.fromBlockPath("not_a_block"));
    }

    @Test
    @DisplayName("lookup tolerates case and surrounding whitespace")
    void lookupIsForgiving() {
        assertEquals("WHEAT", CropIds.fromBlockPath("WHEAT"));
        assertEquals("WHEAT", CropIds.fromBlockPath("  Wheat  "));
        assertTrue(CropIds.knownCount() >= 18);
    }
}
