package com.skydex.layout;

import com.google.gson.JsonObject;

/**
 * Where the grid sits in the world: the block the player anchored, plus which
 * way the grid runs from it.
 *
 * <p>Plain ints, no Minecraft types, so the grid-to-world mapping is testable
 * headlessly — which matters, because getting it wrong puts the whole overlay
 * in the wrong place and that is hard to debug by eye.
 */
public final class LayoutAnchor {

    private final int x;
    private final int y;
    private final int z;
    private final GridOrientation orientation;

    public LayoutAnchor(int x, int y, int z, GridOrientation orientation) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.orientation = orientation == null ? GridOrientation.R0 : orientation;
    }

    public int x() {
        return x;
    }

    /** The floor block's own Y; markers are drawn on its top face. */
    public int y() {
        return y;
    }

    public int z() {
        return z;
    }

    public GridOrientation orientation() {
        return orientation;
    }

    public LayoutAnchor withOrientation(GridOrientation newOrientation) {
        return new LayoutAnchor(x, y, z, newOrientation);
    }

    /** Same corner, next orientation. */
    public LayoutAnchor rotated() {
        return withOrientation(orientation.next());
    }

    public int worldX(int gridX, int gridY) {
        return x + orientation.offsetX(gridX, gridY);
    }

    public int worldZ(int gridX, int gridY) {
        return z + orientation.offsetZ(gridX, gridY);
    }

    public int worldX(LayoutCell cell) {
        return worldX(cell.x(), cell.y());
    }

    public int worldZ(LayoutCell cell) {
        return worldZ(cell.x(), cell.y());
    }

    public JsonObject toJson() {
        JsonObject o = new JsonObject();
        o.addProperty("x", x);
        o.addProperty("y", y);
        o.addProperty("z", z);
        o.addProperty("orientation", orientation.degrees());
        return o;
    }

    public static LayoutAnchor fromJson(JsonObject o) {
        if (o == null || !o.has("x") || !o.has("y") || !o.has("z")) {
            return null;
        }
        return new LayoutAnchor(
                o.get("x").getAsInt(),
                o.get("y").getAsInt(),
                o.get("z").getAsInt(),
                GridOrientation.fromDegrees(
                        o.has("orientation") ? o.get("orientation").getAsInt() : 0,
                        GridOrientation.R0));
    }

    @Override
    public String toString() {
        return x + ", " + y + ", " + z + " (" + orientation.description() + ")";
    }
}
