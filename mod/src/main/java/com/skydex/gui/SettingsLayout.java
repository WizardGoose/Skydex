package com.skydex.gui;

/**
 * Literal geometry from the accepted 760 by 380 browser prototype.
 *
 * <p>The screen is authored in the prototype's CSS-pixel coordinate system and rendered at
 * one-half GUI scale. At Minecraft GUI scale two, one prototype pixel therefore lands on one
 * framebuffer pixel. Keeping the source measurements intact avoids the rounding drift caused by
 * independently resizing every row, font, border, and icon.</p>
 */
public final class SettingsLayout {

    /** Maps one prototype pixel to half of one Minecraft GUI unit. */
    public static final float RENDER_SCALE = 0.5f;

    public static final int PANEL_W = 760;
    public static final int PANEL_H = 380;
    public static final int DRAWER_W = 252;
    public static final int TOPBAR_H = 48;
    public static final int CONTENT_LEFT = 15;
    public static final int CONTENT_RIGHT = 745;
    public static final int GAP = 4;

    public static final int WORDMARK_W = 132;
    public static final int WORDMARK_H = 25;
    public static final int ARROW_W = 30;
    public static final int ARROW_H = 32;
    public static final int CHEVRON_W = 14;
    public static final int CHEVRON_H = 26;
    public static final int SHARE_H = 36;
    public static final int SHARE_TEXT_PADDING = 11;

    public static final int PLOT_COLUMN_W = 246;
    public static final int PLOT_HEADING_H = 27;
    public static final int BOARD_SIZE = 222;
    public static final int BOARD_GRID_INSET = 5;
    public static final int CELL_GAP = 2;
    private static final int BOARD_GRID_SPAN = 212;

    public static final int CURRENT_LEAD_H = 47;
    public static final int BRIEF_H = 92;
    public static final int BRIEF_ICON = 27;
    public static final int HELPER_H = 36;
    public static final int EXPORT_H = 40;
    public static final int EXPORT_W = 142;
    public static final int REPLACEMENT_H = 34;

    public static final int DATA_MENU_W = 324;
    public static final int DATA_MENU_H = 107;
    public static final int DATA_OPTION_H = 29;

    public static final int PRESET_CARD_H = 96;
    public static final int PRESET_PREVIEW_SIZE = 64;
    public static final int PRESET_GRID_SIZE = 6;
    public static final int PRESET_GRID_INSET = 4;
    private static final int PRESET_GRID_SPAN = 56;

    /** Local prototype coordinates. Rendering applies {@link #screenX} and {@link #screenY}. */
    public final int panelX = 0;
    public final int panelY = 0;
    public final int screenX;
    public final int screenY;

    private SettingsLayout(int screenX, int screenY) {
        this.screenX = screenX;
        this.screenY = screenY;
    }

    public static SettingsLayout of(int screenWidth, int screenHeight) {
        int renderedWidth = rendered(PANEL_W);
        int renderedHeight = rendered(PANEL_H);
        return new SettingsLayout(
                Math.max(0, (screenWidth - renderedWidth) / 2),
                Math.max(0, (screenHeight - renderedHeight) / 2));
    }

    public int panelRight() { return PANEL_W; }
    public int panelBottom() { return PANEL_H; }
    public int contentX() { return CONTENT_LEFT; }
    public int contentRight() { return CONTENT_RIGHT; }
    public int contentWidth() { return CONTENT_RIGHT - CONTENT_LEFT; }

    public int wordmarkX() { return 18; }
    public int wordmarkY() { return 12; }
    public int brandRuleX() { return 160; }
    public int arrowX() { return 717; }
    public int arrowY() { return 8; }
    public int connectionRight() { return 706; }

    public int shareX() { return CONTENT_LEFT; }
    public int shareY() { return 61; }
    public int shareWidth() { return CONTENT_RIGHT - CONTENT_LEFT; }

    public int workspaceY() { return 106; }
    public int fieldX() { return CONTENT_LEFT; }
    public int boardX() { return fieldX(); }
    public int boardY() { return 133; }
    public int legendY() { return 355; }

    public int dividerX() { return 275; }
    public int rightX() { return 290; }
    public int rightWidth() { return CONTENT_RIGHT - rightX(); }

    public int currentLeadY() { return workspaceY(); }
    public int briefY() { return 157; }
    public int briefSplitX() { return 500; }
    public int helperY() { return 253; }
    public int exportY() { return 293; }
    public int dataWidth() { return 307; }
    public int exportX() { return 603; }
    public int replacementY() { return 337; }

    public int dataMenuWidth() { return DATA_MENU_W; }
    public int dataMenuHeight() { return DATA_MENU_H; }
    public int dataMenuX() { return rightX() + dataWidth() - dataMenuWidth(); }
    public int dataMenuY() { return exportY() - dataMenuHeight() - 5; }
    public int dataOptionWidth() { return 146; }
    public int dataOptionX(int column) { return dataMenuX() + 9 + column * 158; }
    public int dataOptionY(int row) { return dataMenuY() + 7 + row * 31; }

    /** Closed is hidden behind the core; open is flush against its right edge. */
    public int drawerX(double progress) {
        return panelRight() - DRAWER_W + (int) Math.round(DRAWER_W * clamp(progress));
    }

    public int drawerCardX(double progress) { return drawerX(progress) + 10; }
    public int drawerCardY(int index) { return TOPBAR_H + 8 + index * PRESET_CARD_H; }
    public int drawerCardWidth() { return DRAWER_W - 20; }

    /** Browser-style fractional grid tracks distributed onto whole prototype pixels. */
    public int boardCellX(int column) {
        return boardX() + BOARD_GRID_INSET + distributedStart(column, 10, BOARD_GRID_SPAN, CELL_GAP);
    }

    public int boardCellY(int row) {
        return boardY() + BOARD_GRID_INSET + distributedStart(row, 10, BOARD_GRID_SPAN, CELL_GAP);
    }

    public int boardCellSize(int index) {
        return distributedSize(index, 10, BOARD_GRID_SPAN, CELL_GAP);
    }

    public int presetCellX(int drawerX, int column) {
        return drawerX + 15
                + distributedStart(column, PRESET_GRID_SIZE, PRESET_GRID_SPAN, 1);
    }

    public int presetCellY(int cardY, int row) {
        int previewY = cardY + (PRESET_CARD_H - PRESET_PREVIEW_SIZE) / 2;
        return previewY + PRESET_GRID_INSET
                + distributedStart(row, PRESET_GRID_SIZE, PRESET_GRID_SPAN, 1);
    }

    public int presetCellSize(int index) {
        return distributedSize(index, PRESET_GRID_SIZE, PRESET_GRID_SPAN, 1);
    }

    public double virtualX(double screenCoordinate) {
        return (screenCoordinate - screenX) / RENDER_SCALE;
    }

    public double virtualY(double screenCoordinate) {
        return (screenCoordinate - screenY) / RENDER_SCALE;
    }

    public int renderedPanelWidth(boolean drawerVisible) {
        return rendered(PANEL_W + (drawerVisible ? DRAWER_W : 0));
    }

    public int renderedPanelHeight() {
        return rendered(PANEL_H);
    }

    public static int rendered(int prototypePixels) {
        return Math.round(prototypePixels * RENDER_SCALE);
    }

    private static int distributedStart(int index, int tracks, int span, int gap) {
        int gaps = (tracks - 1) * gap;
        double step = (span - gaps) / (double) tracks + gap;
        return (int) Math.round(index * step);
    }

    private static int distributedSize(int index, int tracks, int span, int gap) {
        int gaps = (tracks - 1) * gap;
        double step = (span - gaps) / (double) tracks + gap;
        int left = (int) Math.round(index * step);
        int right = index == tracks - 1 ? span : (int) Math.round((index + 1) * step) - gap;
        return right - left;
    }

    private static double clamp(double value) {
        return Math.max(0.0, Math.min(1.0, value));
    }
}
