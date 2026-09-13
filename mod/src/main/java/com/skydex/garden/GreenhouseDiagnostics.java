package com.skydex.garden;

import java.util.Collections;
import java.util.List;

/**
 * What the last greenhouse scan concluded, and why.
 *
 * <p>Rewritten when the scan moved from arithmetic to observation. The old
 * states existed to hedge against two constants nobody had verified: whether the
 * grid's Y was right, whether the offset was right, and whether an empty reading
 * meant an empty greenhouse or a mislocated one. Those were the right hedges for
 * a guess, and the guess turned out to be wrong on the owner's actual island.
 *
 * <p>Finding the bed replaces all three. If the plantable floor is where the
 * scan says it is, the position is not an assumption any more, and an empty
 * board read off a found bed is genuinely verified empty rather than ambiguous.
 * So {@code GRID_MISMATCH}, {@code Y_DRIFT} and {@code EMPTY_UNCONFIRMED} are
 * gone, and {@link Status#NO_BED} carries the one honest failure left: the
 * search ran and found no floor.
 *
 * <p>Immutable and Minecraft-free: the tick thread publishes a new instance and
 * the command thread reads whichever is current, with no locking because nothing
 * is ever mutated in place.
 */
public final class GreenhouseDiagnostics {

    /** How many unidentified heads to remember; enough to act on, not a leak. */
    private static final int MAX_UNKNOWN = 12;

    /** Where the scanned position came from. */
    public enum Source {
        /** Found by searching the blocks around the Carpenter for the bed. */
        DETECTED("found by searching"),
        /**
         * Placed directly from the Carpenter's feet using the measured offset.
         *
         * <p>The cheap path, available once the offset is known. Every Hypixel
         * greenhouse is the same structure, so the bed sits at a fixed distance
         * from the NPC inside it.
         */
        CARPENTER("from the Carpenter offset");

        private final String label;

        Source(String label) {
            this.label = label;
        }

        public String label() {
            return label;
        }
    }

    public enum Status {
        /** Not looking: capture off, or not on SkyBlock. */
        IDLE("not scanning"),
        /** Standing outside the Garden's plot footprint. */
        OUTSIDE_GARDEN("outside the Garden plots"),
        /** No Carpenter nearby, so no greenhouse here. */
        NO_GREENHOUSE("no greenhouse in this plot"),
        /**
         * A greenhouse was found somewhere the sidebar does not call the Garden.
         *
         * <p>The check that stops the Hub, which has its own Carpenter NPC and
         * ground at a similar height, from producing a fictional board.
         */
        OFF_GARDEN_BOARD("found a greenhouse somewhere that is not the Garden"),
        /**
         * The Carpenter is here, but no plantable floor was found anywhere in
         * the search area.
         *
         * <p>Distinct from an empty greenhouse on purpose. "I found the bed and
         * nothing is planted" and "I could not find a bed at all" are different
         * situations with different fixes, and the old code could not tell them
         * apart.
         */
        NO_BED("found the greenhouse but not its planting bed"),
        /** Read a board, but no profile is active to store it against. */
        HELD_NO_PROFILE("read a board but no profile is active yet"),
        /** Found the bed and read it. This is the only state that emits. */
        OBSERVED("observed");

        private final String label;

        Status(String label) {
            this.label = label;
        }

        public String label() {
            return label;
        }

        /** Only this state produces a payload. */
        public boolean isCapture() {
            return this == OBSERVED;
        }
    }

    public static final GreenhouseDiagnostics IDLE = new GreenhouseDiagnostics(
            Status.IDLE, "", 0L, Source.DETECTED, 0, 0, 0, 0, 0, 0, 0, List.of());

    private final Status status;
    private final String detail;
    private final long scannedAt;
    private final Source source;
    private final int originX;
    private final int originZ;
    private final int bedY;
    private final int width;
    private final int height;
    private final int cellCount;
    private final int looseNameMatches;
    private final List<String> unknownHeads;
    /** Set after construction by {@link #withMeasuredOffset}; never null. */
    private String measuredOffset = "";

    private GreenhouseDiagnostics(Status status, String detail, long scannedAt, Source source,
                                  int originX, int originZ, int bedY, int width, int height,
                                  int cellCount, int looseNameMatches, List<String> unknownHeads) {
        this.status = status;
        this.detail = detail;
        this.scannedAt = scannedAt;
        this.source = source;
        this.originX = originX;
        this.originZ = originZ;
        this.bedY = bedY;
        this.width = width;
        this.height = height;
        this.cellCount = cellCount;
        this.looseNameMatches = looseNameMatches;
        this.unknownHeads = unknownHeads == null ? List.of()
                : List.copyOf(unknownHeads.size() <= MAX_UNKNOWN
                        ? unknownHeads : unknownHeads.subList(0, MAX_UNKNOWN));
    }

    public static GreenhouseDiagnostics idle() {
        return IDLE;
    }

    public static GreenhouseDiagnostics outsideGarden(long now) {
        return simple(Status.OUTSIDE_GARDEN, "", now);
    }

    public static GreenhouseDiagnostics noGreenhouse(long now) {
        return simple(Status.NO_GREENHOUSE, "", now);
    }

    /**
     * @param area what the sidebar actually says, so the owner can tell a Hub
     *             false positive from the Garden's area line being reworded
     */
    public static GreenhouseDiagnostics offGardenBoard(long now, String area) {
        return simple(Status.OFF_GARDEN_BOARD, "the sidebar says \""
                + (area == null || area.isBlank() ? "nothing" : area) + "\"", now);
    }

    /**
     * @param detail where the search looked and what it saw there, so the owner
     *               can act on it rather than only knowing that it failed
     */
    public static GreenhouseDiagnostics noBed(long now, String detail) {
        return simple(Status.NO_BED, detail == null ? "" : detail, now);
    }

    private static GreenhouseDiagnostics simple(Status status, String detail, long now) {
        return new GreenhouseDiagnostics(status, detail, now, Source.DETECTED,
                0, 0, 0, 0, 0, 0, 0, List.of());
    }

    public static GreenhouseDiagnostics heldNoProfile(long now, Source source, int originX,
                                                      int originZ, int bedY, int width, int height,
                                                      int cellCount) {
        return new GreenhouseDiagnostics(Status.HELD_NO_PROFILE, "", now, source,
                originX, originZ, bedY, width, height, cellCount, 0, List.of());
    }

    public static GreenhouseDiagnostics observed(long now, Source source, int originX, int originZ,
                                                 int bedY, int width, int height, int cellCount,
                                                 int looseNameMatches, List<String> unknownHeads,
                                                 String detail) {
        return new GreenhouseDiagnostics(Status.OBSERVED, detail == null ? "" : detail, now, source,
                originX, originZ, bedY, width, height, cellCount, looseNameMatches, unknownHeads);
    }

    /**
     * The Carpenter-relative offset this scan measured, ready to become a
     * constant. Empty when nothing was measured.
     *
     * <p>Carried separately from {@link #detail} because it is the one line
     * worth relaying out of the whole diagnostic: it upgrades the feature from
     * searching for the bed to knowing where it is.
     */
    public String measuredOffset() {
        return measuredOffset;
    }

    public GreenhouseDiagnostics withMeasuredOffset(String measured) {
        GreenhouseDiagnostics copy = new GreenhouseDiagnostics(status, detail, scannedAt, source,
                originX, originZ, bedY, width, height, cellCount, looseNameMatches, unknownHeads);
        copy.measuredOffset = measured == null ? "" : measured;
        return copy;
    }

    public Status status() {
        return status;
    }

    /** Extra context; empty when there is nothing to add. */
    public String detail() {
        return detail;
    }

    public long scannedAt() {
        return scannedAt;
    }

    public Source source() {
        return source;
    }

    public int originX() {
        return originX;
    }

    public int originZ() {
        return originZ;
    }

    public int bedY() {
        return bedY;
    }

    public int width() {
        return width;
    }

    public int height() {
        return height;
    }

    public int cellCount() {
        return cellCount;
    }

    /** Cells identified by containment rather than an exact name match. */
    public int looseNameMatches() {
        return looseNameMatches;
    }

    /** Heads whose name matched nothing known: "name (texture hash)". */
    public List<String> unknownHeads() {
        return Collections.unmodifiableList(unknownHeads);
    }

    public boolean hasScanned() {
        return scannedAt > 0L;
    }

    /** True when the scan located a bed, whether or not anything is planted in it. */
    public boolean foundBed() {
        return status == Status.OBSERVED || status == Status.HELD_NO_PROFILE;
    }

    /**
     * One line for {@code /skydex status}.
     *
     * <p>Every outcome names coordinates the owner can check against F3, because
     * the failure this whole rewrite exists for was a position that looked
     * plausible and was wrong, and nothing in the old output would have shown
     * that without an aerial screenshot.
     */
    public String summary() {
        return switch (status) {
            case IDLE -> "not scanning (join SkyBlock with capture on)";
            case OUTSIDE_GARDEN -> "outside the Garden plot grid";
            case NO_GREENHOUSE -> "no greenhouse in this plot (no Carpenter found)";
            case OFF_GARDEN_BOARD -> "found a greenhouse here but " + detail + ", so nothing was sent";
            case NO_BED -> "NO PLANTING BED FOUND - " + detail;
            case HELD_NO_PROFILE -> "read " + cellCount + " cells at " + where()
                    + " but no profile is active yet, so nothing was stored";
            case OBSERVED -> cellCount + " cells in a " + width + "x" + height + " bed at "
                    + where() + (detail.isEmpty() ? "" : " - " + detail);
        };
    }

    private String where() {
        return "x=" + originX + " z=" + originZ + " y=" + bedY + " (" + source.label() + ")";
    }

    @Override
    public String toString() {
        return "GreenhouseDiagnostics[" + status + " " + summary() + "]";
    }
}
