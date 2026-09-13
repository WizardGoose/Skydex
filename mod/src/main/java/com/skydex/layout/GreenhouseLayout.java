package com.skydex.layout;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.Collections;
import java.util.List;

/**
 * A validated greenhouse layout pushed by the website (Transport 3).
 *
 * <p>Purely a display artefact: the mod draws where things go, the player
 * places every block by hand. Automatic placement is permanently out of scope
 * — that is the line between Litematica-style display and a banned macro.
 */
public final class GreenhouseLayout {

    public static final int SCHEMA = 1;

    private final String label;
    private final int width;
    private final int height;
    private final List<LayoutCell> cells;

    GreenhouseLayout(String label, int width, int height, List<LayoutCell> cells) {
        this.label = label;
        this.width = width;
        this.height = height;
        this.cells = List.copyOf(cells);
    }

    /** Shown in game so the player knows what is loaded. */
    public String label() {
        return label;
    }

    public int width() {
        return width;
    }

    public int height() {
        return height;
    }

    /** Only occupied cells; unmodifiable. */
    public List<LayoutCell> cells() {
        return Collections.unmodifiableList(cells);
    }

    public int cellCount() {
        return cells.size();
    }

    public JsonObject toJson() {
        JsonObject o = new JsonObject();
        o.addProperty("schema", SCHEMA);
        o.addProperty("label", label);
        JsonArray size = new JsonArray(2);
        size.add(width);
        size.add(height);
        o.add("size", size);
        JsonArray arr = new JsonArray(cells.size());
        for (LayoutCell cell : cells) {
            arr.add(cell.toJson());
        }
        o.add("cells", arr);
        return o;
    }

    @Override
    public String toString() {
        return "GreenhouseLayout[" + label + " " + width + "x" + height
                + ", " + cells.size() + " cells]";
    }
}
