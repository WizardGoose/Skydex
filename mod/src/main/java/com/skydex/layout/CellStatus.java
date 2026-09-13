package com.skydex.layout;

/**
 * What the world holds at a layout cell, compared against what the layout asks
 * for.
 *
 * <p>Three states rather than a boolean, because "nothing is there yet" and
 * "something else is there" are different situations for the player and only
 * one of them is a mistake. A greenhouse mutation is grown by planting its base
 * crop and waiting, so a cell that wants CHOCONUT and currently holds cocoa is
 * the <i>expected</i> middle of the job, not an error. Collapsing both into
 * "not done" would throw away the only information that tells those apart.
 *
 * <p>Both non-done states draw the same ghost marker. The distinction is
 * carried in words, on the label, where it can be explained.
 *
 * <p>No Minecraft types, so the matching rules stay testable off a game
 * classpath.
 */
public enum CellStatus {

    /** The world matches the layout here. Nothing left to place. */
    DONE,

    /** Nothing the mod can identify is standing in this cell. */
    EMPTY,

    /**
     * Something is here, but not what the layout asked for.
     *
     * <p>Usually benign: the base crop of a mutation that has not turned yet.
     */
    MISMATCH;

    public boolean isDone() {
        return this == DONE;
    }

    /** Everything that still wants a ghost drawn over it. */
    public boolean isPending() {
        return this != DONE;
    }
}
