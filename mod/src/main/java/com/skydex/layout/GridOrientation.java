package com.skydex.layout;

/**
 * Which way the grid runs from its anchor corner.
 *
 * <p>Greenhouses face different ways, and the mod must never guess world
 * coordinates, so the player anchors one corner and then cycles orientation
 * until the ghost lines up.
 *
 * <p>The maths is a rotation of the offset vector about the anchor, clockwise
 * as seen from above (+X is east, +Z is south):
 * {@code rotateCW(dx, dz) = (-dz, dx)}. Cell (0,0) therefore lands on the
 * anchor block itself in every orientation, which is the property that makes
 * the UX predictable — the corner you pick stays put while the rest swings
 * around it.
 */
public enum GridOrientation {

    /** Default: grid x runs east, grid y runs south. */
    R0(0, "east / south"),
    R90(90, "south / west"),
    R180(180, "west / north"),
    R270(270, "north / east");

    private final int degrees;
    private final String description;

    GridOrientation(int degrees, String description) {
        this.degrees = degrees;
        this.description = description;
    }

    public int degrees() {
        return degrees;
    }

    /** Human hint for chat: which way grid x and grid y run. */
    public String description() {
        return description;
    }

    /** World X offset from the anchor for grid cell (gx, gy). */
    public int offsetX(int gx, int gy) {
        return switch (this) {
            case R0 -> gx;
            case R90 -> -gy;
            case R180 -> -gx;
            case R270 -> gy;
        };
    }

    /** World Z offset from the anchor for grid cell (gx, gy). */
    public int offsetZ(int gx, int gy) {
        return switch (this) {
            case R0 -> gy;
            case R90 -> gx;
            case R180 -> -gy;
            case R270 -> -gx;
        };
    }

    /** Next orientation in the cycle, so a command can just step through. */
    public GridOrientation next() {
        return switch (this) {
            case R0 -> R90;
            case R90 -> R180;
            case R180 -> R270;
            case R270 -> R0;
        };
    }

    public static GridOrientation fromDegrees(int degrees, GridOrientation fallback) {
        int normalised = ((degrees % 360) + 360) % 360;
        for (GridOrientation orientation : values()) {
            if (orientation.degrees == normalised) {
                return orientation;
            }
        }
        return fallback;
    }
}
