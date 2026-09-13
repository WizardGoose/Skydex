package com.skydex;

import com.skydex.gui.SettingsLayout;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SettingsLayoutTest {

    @Test
    @DisplayName("the accepted 760 by 380 browser core keeps its literal coordinate system")
    void centresTheMainPanelWithoutRescalingItsParts() {
        SettingsLayout layout = SettingsLayout.of(960, 540);
        assertAll(
                () -> assertEquals(290, layout.screenX),
                () -> assertEquals(175, layout.screenY),
                () -> assertEquals(0, layout.panelX),
                () -> assertEquals(0, layout.panelY),
                () -> assertEquals(380, layout.renderedPanelWidth(false)),
                () -> assertEquals(190, layout.renderedPanelHeight()),
                () -> assertEquals(506, layout.renderedPanelWidth(true)),
                () -> assertEquals(760, SettingsLayout.PANEL_W),
                () -> assertEquals(380, SettingsLayout.PANEL_H),
                () -> assertEquals(252, SettingsLayout.DRAWER_W),
                () -> assertEquals(48, SettingsLayout.TOPBAR_H),
                () -> assertEquals(36, SettingsLayout.SHARE_H),
                () -> assertEquals(222, SettingsLayout.BOARD_SIZE),
                () -> assertEquals(36, SettingsLayout.HELPER_H),
                () -> assertEquals(40, SettingsLayout.EXPORT_H),
                () -> assertEquals(142, SettingsLayout.EXPORT_W),
                () -> assertEquals(324, SettingsLayout.DATA_MENU_W),
                () -> assertEquals(107, SettingsLayout.DATA_MENU_H),
                () -> assertEquals(64, SettingsLayout.PRESET_PREVIEW_SIZE));
    }

    @Test
    @DisplayName("the share code field takes the complete content row")
    void shareFieldFillsItsRow() {
        SettingsLayout layout = SettingsLayout.of(854, 480);
        assertEquals(15, layout.shareX());
        assertEquals(61, layout.shareY());
        assertEquals(730, layout.shareWidth());
        assertEquals(layout.contentX(), layout.shareX());
        assertEquals(layout.contentRight(), layout.shareX() + layout.shareWidth());
    }

    @Test
    @DisplayName("the browser greenhouse board tracks fill the exact inner span")
    void boardIsExactlyTenDistributedCells() {
        SettingsLayout layout = SettingsLayout.of(854, 480);
        int previousRight = -1;
        for (int column = 0; column < 10; column++) {
            int left = layout.boardCellX(column);
            int right = left + layout.boardCellSize(column);
            if (column > 0) {
                assertEquals(SettingsLayout.CELL_GAP, left - previousRight);
            }
            previousRight = right;
        }
        assertEquals(layout.boardX() + 5, layout.boardCellX(0));
        assertEquals(layout.boardX() + 217, previousRight);
        assertEquals(layout.boardY() + SettingsLayout.BOARD_SIZE, layout.legendY());
        assertTrue(layout.boardX() + SettingsLayout.BOARD_SIZE < layout.dividerX());
    }

    @Test
    @DisplayName("the five detail rows retain the accepted browser measurements")
    void detailsFillThePanel() {
        SettingsLayout layout = SettingsLayout.of(854, 480);
        assertAll(
                () -> assertEquals(106, layout.currentLeadY()),
                () -> assertEquals(157, layout.briefY()),
                () -> assertEquals(253, layout.helperY()),
                () -> assertEquals(293, layout.exportY()),
                () -> assertEquals(337, layout.replacementY()),
                () -> assertEquals(371,
                        layout.replacementY() + SettingsLayout.REPLACEMENT_H),
                () -> assertEquals(layout.contentRight(),
                        layout.exportX() + SettingsLayout.EXPORT_W));
    }

    @Test
    @DisplayName("the loadout drawer slides outside while its handle remains in the core")
    void presetRailSlidesFromBehindMainPanel() {
        SettingsLayout layout = SettingsLayout.of(854, 480);
        assertEquals(508, layout.drawerX(0));
        assertEquals(760, layout.drawerX(1));
        assertEquals(252, layout.drawerX(1) - layout.drawerX(0));
        assertEquals(717, layout.arrowX());
        assertEquals(8, layout.arrowY());
        assertEquals(0, (SettingsLayout.ARROW_W - SettingsLayout.CHEVRON_W) % 2);
        assertEquals(0, (SettingsLayout.ARROW_H - SettingsLayout.CHEVRON_H) % 2);
    }

    @Test
    @DisplayName("the checkbox dropdown floats above the included-data control")
    void dataDropdownIsAnOverlay() {
        SettingsLayout layout = SettingsLayout.of(854, 480);
        assertEquals(273, layout.dataMenuX());
        assertEquals(181, layout.dataMenuY());
        assertEquals(288, layout.dataMenuY() + layout.dataMenuHeight());
        assertTrue(layout.dataMenuY() + layout.dataMenuHeight() < layout.exportY());
        assertTrue(layout.dataOptionX(1) + layout.dataOptionWidth()
                <= layout.dataMenuX() + layout.dataMenuWidth());
    }

    @Test
    @DisplayName("a tiny window clamps the rendered panel origin")
    void clampsTinyWindow() {
        SettingsLayout layout = SettingsLayout.of(200, 120);
        assertEquals(0, layout.screenX);
        assertEquals(0, layout.screenY);
    }
}
