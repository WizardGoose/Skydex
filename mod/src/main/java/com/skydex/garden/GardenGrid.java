package com.skydex.garden;

/**
 * The Garden's plot geometry.
 *
 * <p>Much reduced. This class used to compute where the greenhouse's plantable
 * grid was, from the player's coordinates plus a borrowed offset constant. That
 * was wrong on the owner's real island: it placed the grid several blocks from
 * the actual planted bed, and nothing inside the arithmetic could tell. The
 * offset constant is gone rather than corrected, because correcting it would
 * only produce a number that happens to fit one greenhouse, and
 * {@link GreenhouseScanner} now finds the bed by looking for it.
 *
 * <p>What is left is the part that is genuinely publicly observable world
 * layout: the Garden is a 5x5 grid of 96 block plots spanning -240 to +240 on
 * both axes. That is used only as a cheap sanity bound, not to place anything.
 *
 * <p>Pure integer maths, no Minecraft types, so the boundary cases stay testable
 * headlessly.
 */
public final class GardenGrid {

    /** Each Garden plot is 96 blocks square. */
    public static final int PLOT_SIZE = 96;
    /** Plots per axis: the Garden is 5x5, the Barn being the centre one. */
    public static final int PLOTS_PER_AXIS = 5;
    /** West/north edge of the whole Garden. */
    public static final int GARDEN_MIN = -(PLOTS_PER_AXIS * PLOT_SIZE) / 2;
    /** East/south edge, exclusive. */
    public static final int GARDEN_MAX = GARDEN_MIN + PLOTS_PER_AXIS * PLOT_SIZE;

    /**
     * A <b>hint only</b>, never a position.
     *
     * <p>The Y level a 2025 era mod believed greenhouses sat at, and which its
     * own source marked as a guess. It no longer places anything: the scanner
     * finds the bed's real height and mentions this number only when the two
     * disagree, so that a drift worth knowing about is visible rather than
     * silently absorbed.
     */
    public static final int GREENHOUSE_Y = 73;

    /** Default bed size, used when the player anchors one by hand. */
    public static final int DEFAULT_BED_SIZE = 10;

    private GardenGrid() {
    }

    /** True when a coordinate pair falls inside the Garden's 480x480 footprint. */
    public static boolean isInsideGarden(double x, double z) {
        return plotIndex(x) >= 0 && plotIndex(z) >= 0;
    }

    /**
     * Which plot column/row a coordinate falls in.
     *
     * @return 0..{@link #PLOTS_PER_AXIS}-1, or -1 when outside the Garden
     */
    public static int plotIndex(double coord) {
        int relative = (int) Math.floor(coord) - GARDEN_MIN;
        if (relative < 0 || relative >= PLOTS_PER_AXIS * PLOT_SIZE) {
            return -1;
        }
        return relative / PLOT_SIZE;
    }

    /** The lowest-coordinate corner of the plot a coordinate falls in. */
    public static int plotCorner(double coord) {
        int index = plotIndex(coord);
        if (index < 0) {
            throw new IllegalArgumentException("coordinate " + coord + " is outside the Garden");
        }
        return GARDEN_MIN + index * PLOT_SIZE;
    }
}
