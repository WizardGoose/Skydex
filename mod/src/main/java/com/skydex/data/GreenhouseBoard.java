package com.skydex.data;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * The spec's optional {@code greenhouse} section: one observed board.
 *
 * <p>Semantics that matter, all of them pinned by the spec:
 * <ul>
 *   <li><b>Omitted until first observed.</b> A null board on the store means
 *       "never seen", and the section is left out of the JSON entirely rather
 *       than sent empty. An observed-but-bare greenhouse is a real, emittable
 *       state ({@code cells: []}); "no data" and "verified empty" are different
 *       facts and the site distinguishes them.</li>
 *   <li><b>A new snapshot replaces the old wholesale.</b> There is no cell-level
 *       merge: the greenhouse is small, always read in one pass, and a merge
 *       would resurrect crops the player has since harvested.</li>
 *   <li><b>Cells outside {@code size} are a validation error.</b> Enforced here
 *       on construction, so an out-of-range cell can never reach the wire.</li>
 * </ul>
 *
 * <p>No Minecraft types, so every rule above is unit-testable headlessly.
 */
public final class GreenhouseBoard {

    private final long observedAt;
    private final int width;
    private final int height;
    private final List<GreenhouseCell> cells;

    /**
     * @throws IllegalArgumentException when a cell falls outside the board, or
     *                                  two cells claim the same coordinate
     */
    public GreenhouseBoard(long observedAt, int width, int height, List<GreenhouseCell> cells) {
        if (width <= 0 || height <= 0) {
            throw new IllegalArgumentException("board size must be positive, got " + width + "x" + height);
        }
        this.observedAt = observedAt;
        this.width = width;
        this.height = height;

        List<GreenhouseCell> copy = new ArrayList<>(cells.size());
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (GreenhouseCell cell : cells) {
            if (cell == null) {
                continue;
            }
            if (cell.x() < 0 || cell.x() >= width || cell.y() < 0 || cell.y() >= height) {
                throw new IllegalArgumentException(
                        "cell " + cell.key() + " is outside the " + width + "x" + height + " board");
            }
            if (!seen.add(cell.key())) {
                throw new IllegalArgumentException("two cells claim " + cell.key());
            }
            copy.add(cell);
        }
        this.cells = List.copyOf(copy);
    }

    /** ms epoch of the scan that produced this board. */
    public long observedAt() {
        return observedAt;
    }

    public int width() {
        return width;
    }

    public int height() {
        return height;
    }

    /** Only occupied cells; unmodifiable. */
    public List<GreenhouseCell> cells() {
        return Collections.unmodifiableList(cells);
    }

    public int cellCount() {
        return cells.size();
    }

    /** How many cells carry a Crop Diagnostics countdown. */
    public int countdownCount() {
        int n = 0;
        for (GreenhouseCell cell : cells) {
            if (cell.hasNextStage()) {
                n++;
            }
        }
        return n;
    }

    public int mutationCount() {
        int n = 0;
        for (GreenhouseCell cell : cells) {
            if (cell.isMutation()) {
                n++;
            }
        }
        return n;
    }

    /**
     * Same board content, ignoring when it was observed.
     *
     * <p>This is what stops a periodic rescan from marking the store dirty every
     * few seconds: re-reading an unchanged greenhouse must not push an SSE
     * update or dirty the save file, because nothing the site cares about moved.
     */
    public boolean sameContent(GreenhouseBoard other) {
        if (other == null) {
            return false;
        }
        return width == other.width && height == other.height && cells.equals(other.cells);
    }

    public JsonObject toJson() {
        JsonObject o = new JsonObject();
        o.addProperty("observedAt", observedAt);
        JsonArray size = new JsonArray(2);
        size.add(width);
        size.add(height);
        o.add("size", size);
        JsonArray arr = new JsonArray(cells.size());
        for (GreenhouseCell cell : cells) {
            arr.add(cell.toJson());
        }
        o.add("cells", arr);
        return o;
    }

    /** @return the board, or null when the element is missing or unusable */
    public static GreenhouseBoard fromJson(JsonElement element) {
        if (element == null || !element.isJsonObject()) {
            return null;
        }
        JsonObject o = element.getAsJsonObject();
        long observedAt = o.has("observedAt") ? o.get("observedAt").getAsLong() : 0L;

        int width = 0;
        int height = 0;
        if (o.has("size") && o.get("size").isJsonArray()) {
            JsonArray size = o.getAsJsonArray("size");
            if (size.size() >= 2) {
                width = size.get(0).getAsInt();
                height = size.get(1).getAsInt();
            }
        }
        if (width <= 0 || height <= 0) {
            return null;
        }

        List<GreenhouseCell> cells = new ArrayList<>();
        if (o.has("cells") && o.get("cells").isJsonArray()) {
            for (JsonElement e : o.getAsJsonArray("cells")) {
                if (!e.isJsonObject()) {
                    continue;
                }
                GreenhouseCell cell = GreenhouseCell.fromJson(e.getAsJsonObject());
                if (cell != null) {
                    cells.add(cell);
                }
            }
        }
        try {
            return new GreenhouseBoard(observedAt, width, height, cells);
        } catch (IllegalArgumentException invalid) {
            // A stored board that violates its own size is not worth carrying
            // forward; treating it as "never observed" is the honest fallback.
            return null;
        }
    }

    @Override
    public String toString() {
        return "GreenhouseBoard[" + width + "x" + height + ", " + cells.size() + " cells]";
    }
}
