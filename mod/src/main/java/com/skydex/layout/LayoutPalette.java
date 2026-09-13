package com.skydex.layout;

import com.skydex.SkydexTheme;

/**
 * Ghost-marker colours for the in-world overlay.
 *
 * <p>Every colour here is one of the theme's own at a lower alpha, so the
 * tiles lying on the island floor and the settings screen cannot drift apart:
 * retinting the accent reaches the crop tiles without a second edit. What this
 * class still owns is the choice of which colour means what, and the unpackers
 * the renderer needs to feed a vertex consumer.
 *
 * <p>Alpha is the whole difference between this and the GUI palette: a marker
 * has to sit on the floor without hiding it, so these run far more transparent
 * than anything drawn on a panel.
 *
 * <p>ARGB ints, pure maths, no Minecraft types.
 */
public final class LayoutPalette {

    /** Translucent enough to read the floor through. */
    private static final int TILE_ALPHA = 0x66;
    /** The ground marker is smaller, so it can afford to be more solid. */
    private static final int GROUND_ALPHA = 0x99;
    /**
     * Each face of a ghost block, and much fainter than a flat tile because six
     * of them enclose a volume.
     *
     * <p>A tile is one surface and is seen once. A box is seen through two faces
     * at minimum and four where boxes overlap in the distance, and alpha
     * compounds: at the tile's own value a wall of pending cells would stack
     * into something close to opaque and hide the greenhouse behind it. This is
     * set so that the two faces of a single box read at roughly the weight of
     * one tile.
     */
    private static final int GHOST_ALPHA = 0x30;

    /** Index blue, as on the site. */
    public static final int CROP_FILL = SkydexTheme.withAlpha(SkydexTheme.ACCENT, TILE_ALPHA);
    /**
     * The theme's gold.
     *
     * <p>Chosen against the crop blue rather than merely differing from it: the
     * two are separated along the blue to yellow axis, which is the axis that
     * survives red-green colour blindness. A second blue, or a green, would
     * read as the same tile to a good share of players.
     */
    public static final int MUTATION_FILL = SkydexTheme.withAlpha(SkydexTheme.GOLD, TILE_ALPHA);
    /** Inner square drawn on cells that specify a ground block. */
    public static final int GROUND_FILL = SkydexTheme.withAlpha(SkydexTheme.SUCCESS, GROUND_ALPHA);

    // ------------------------------------------------------------ projection

    /**
     * A cell the world already satisfies.
     *
     * <p>Green carries "done" and nothing else while the projection is on, which
     * is why {@link #GROUND_NOTE_FILL} exists rather than the ground marker
     * simply keeping the green it wears the rest of the time. Two greens on one
     * floor meaning two different things would make the one state the player is
     * scanning for unreadable, and progress at a glance is the entire point of
     * the colour.
     */
    public static final int DONE_FILL = SkydexTheme.withAlpha(SkydexTheme.SUCCESS, TILE_ALPHA);

    /**
     * The ground marker while the projection is on: the theme's type colour, not
     * its green.
     *
     * <p>Near-white reads as an annotation rather than a state, which is what
     * this marker is. It says "this cell wants a particular block underneath",
     * a note about the job, while every coloured thing around it is saying what
     * stage the job has reached.
     */
    public static final int GROUND_NOTE_FILL = SkydexTheme.withAlpha(SkydexTheme.TEXT, GROUND_ALPHA);

    /** Ghost block over a crop cell that is not built yet. */
    public static final int CROP_GHOST = SkydexTheme.withAlpha(SkydexTheme.ACCENT, GHOST_ALPHA);

    /**
     * Ghost block over a mutation cell that is not built yet.
     *
     * <p>Keeps the blue-to-yellow split the flat tiles already use, for the same
     * reason: it is the axis that survives red-green colour blindness, and a
     * player deciding what to carry to the greenhouse needs crops and mutations
     * told apart before anything else.
     */
    public static final int MUTATION_GHOST = SkydexTheme.withAlpha(SkydexTheme.GOLD, GHOST_ALPHA);

    /** A wrong placed crop or mutation is always red, matching the in-game correction rule. */
    public static final int MISMATCH_FILL = SkydexTheme.withAlpha(SkydexTheme.DANGER, TILE_ALPHA);
    public static final int MISMATCH_GHOST = SkydexTheme.withAlpha(SkydexTheme.DANGER, GHOST_ALPHA);

    private LayoutPalette() {
    }

    public static int fill(LayoutCell cell) {
        return cell.isMutation() ? MUTATION_FILL : CROP_FILL;
    }

    /** The ghost block's colour, matching the tile the cell would otherwise wear. */
    public static int ghost(LayoutCell cell) {
        return cell.isMutation() ? MUTATION_GHOST : CROP_GHOST;
    }

    public static int alpha(int argb) {
        return (argb >>> 24) & 0xFF;
    }

    public static int red(int argb) {
        return (argb >> 16) & 0xFF;
    }

    public static int green(int argb) {
        return (argb >> 8) & 0xFF;
    }

    public static int blue(int argb) {
        return argb & 0xFF;
    }
}
