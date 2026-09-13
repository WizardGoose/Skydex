package com.skydex.render;

import com.skydex.layout.CellStatus;

import java.util.Collections;
import java.util.Map;

/**
 * One pass's answer to "which cells are built yet", keyed by world position.
 *
 * <p><b>Keyed by world position on purpose, not by grid coordinate.</b> The mod
 * holds two grids that need not agree: the layout's, whose origin is a corner
 * the player anchored by hand, and the scanner's, whose origin is the planting
 * bed it found by searching. Comparing across them by column and row would be
 * assuming they line up, and a grid assumption that is wrong by a block is
 * exactly the failure the greenhouse scanner was rewritten to stop making. A
 * world coordinate is the one thing both sides can name without an assumption.
 *
 * <p>Immutable, and published as a whole. The tick thread builds a new instance
 * and assigns it; the render thread reads whichever is current. Nothing is
 * mutated in place, so neither side needs a lock and the renderer can never see
 * a half-updated map.
 *
 * <p>Counts are derived in the constructor rather than passed in, so the summary
 * the player reads cannot drift from the markers they are looking at.
 *
 * <p>No Minecraft types, so the packing and the counting are testable off a game
 * classpath.
 */
public final class LayoutProgress {

    /** Nothing scanned: no layout, no anchor, or the projection is off. */
    public static final LayoutProgress NONE = new LayoutProgress(Map.of());

    private final Map<Long, CellStatus> byPosition;
    private final int done;

    public LayoutProgress(Map<Long, CellStatus> byPosition) {
        this.byPosition = Map.copyOf(byPosition);
        int built = 0;
        for (CellStatus status : this.byPosition.values()) {
            if (status.isDone()) {
                built++;
            }
        }
        this.done = built;
    }

    /**
     * Both horizontal coordinates in one key.
     *
     * <p>Y is deliberately absent: a layout cell is a column of the greenhouse,
     * and the crop that satisfies it may sit at the bed level or one above it.
     * Keying on the column is what lets the scan look at both without needing
     * two entries that could then disagree.
     */
    public static long pack(int worldX, int worldZ) {
        return ((long) worldX << 32) | (worldZ & 0xFFFFFFFFL);
    }

    /**
     * @return the status of the cell at this world column, or
     *         {@link CellStatus#EMPTY} for a column this pass did not look at
     */
    public CellStatus at(int worldX, int worldZ) {
        CellStatus status = byPosition.get(pack(worldX, worldZ));
        return status == null ? CellStatus.EMPTY : status;
    }

    /** Cells the world already satisfies. */
    public int doneCount() {
        return done;
    }

    /** Every cell the layout asks for. */
    public int totalCount() {
        return byPosition.size();
    }

    public int pendingCount() {
        return byPosition.size() - done;
    }

    public boolean isEmpty() {
        return byPosition.isEmpty();
    }

    /** Rounded down, so it only reads 100% when nothing is left. */
    public int percent() {
        if (byPosition.isEmpty()) {
            return 0;
        }
        return done * 100 / byPosition.size();
    }

    /** "12 / 40 placed (30%)", for the label and for chat. */
    public String summary() {
        return done + " / " + byPosition.size() + " placed (" + percent() + "%)";
    }

    /** Unmodifiable; exposed for tests rather than for the renderer. */
    public Map<Long, CellStatus> byPosition() {
        return Collections.unmodifiableMap(byPosition);
    }

    @Override
    public String toString() {
        return "LayoutProgress[" + summary() + "]";
    }
}
