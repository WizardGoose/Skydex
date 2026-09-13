package com.skydex.garden;

/**
 * Where the planting bed sits relative to the Carpenter's feet.
 *
 * <p>Every Hypixel greenhouse is the same prefabricated structure, so the bed's
 * corner is a fixed offset from the NPC standing inside it. That makes the
 * Carpenter a far better reference point than the world grid ever was: a
 * structure-relative offset is immune to plot position, to which plot the
 * greenhouse was built on, and to the plot-corner arithmetic that put the old
 * grid several blocks off the owner's real bed.
 *
 * <p><b>The offset is not known yet, and is not being guessed.</b> That is the
 * whole point. {@link #KNOWN} is false, so nothing here places anything; the
 * scanner falls back to searching for the bed, and when it finds one it reports
 * the measured delta. One real sighting turns that into the constant below, at
 * which point placement becomes arithmetic again, but arithmetic derived from
 * this game rather than borrowed from someone else's mod.
 *
 * <p>Same discipline as the Crop Diagnostics parser: the machinery ships
 * complete and switched off, and it is switched on by evidence rather than by
 * confidence. {@code GreenhouseOffsetTest} fails the build if {@link #KNOWN} is
 * flipped without the constants being filled in.
 */
public final class GreenhouseOffset {

    /**
     * False until a real greenhouse has been measured.
     *
     * <p>Flip this only together with real {@link #DX}/{@link #DY}/{@link #DZ}
     * values taken from a reported detection.
     */
    public static final boolean KNOWN = false;

    /** Bed origin minus Carpenter feet, on each axis. Meaningless while unknown. */
    public static final int DX = 0;
    public static final int DY = 0;
    public static final int DZ = 0;

    /** Bed dimensions that come with the offset. */
    public static final int WIDTH = GardenGrid.DEFAULT_BED_SIZE;
    public static final int HEIGHT = GardenGrid.DEFAULT_BED_SIZE;

    private GreenhouseOffset() {
    }

    /** True once the offset has been measured and can place the bed directly. */
    public static boolean isKnown() {
        return KNOWN;
    }

    /** Bed origin X for a Carpenter standing at {@code carpenterX}. */
    public static int originX(int carpenterX) {
        return carpenterX + DX;
    }

    /** Bed Y for a Carpenter standing at {@code carpenterY}. */
    public static int bedY(int carpenterY) {
        return carpenterY + DY;
    }

    /** Bed origin Z for a Carpenter standing at {@code carpenterZ}. */
    public static int originZ(int carpenterZ) {
        return carpenterZ + DZ;
    }

    /**
     * The delta a real detection just proved, formatted for a human to relay.
     *
     * <p>Printed prominently rather than buried, because this single line is
     * what upgrades the feature from searching to knowing.
     */
    public static String describeMeasured(int carpenterX, int carpenterY, int carpenterZ,
                                          int bedOriginX, int bedY, int bedOriginZ,
                                          int width, int height) {
        return "bed is dx=" + (bedOriginX - carpenterX)
                + " dy=" + (bedY - carpenterY)
                + " dz=" + (bedOriginZ - carpenterZ)
                + " from the Carpenter's feet, size " + width + "x" + height;
    }

    /** True when a measured delta matches the stored constant. */
    public static boolean agreesWith(int carpenterX, int carpenterY, int carpenterZ,
                                     int bedOriginX, int bedY, int bedOriginZ) {
        return KNOWN
                && bedOriginX - carpenterX == DX
                && bedY - carpenterY == DY
                && bedOriginZ - carpenterZ == DZ;
    }
}
