package com.skydex.layout;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonSyntaxException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Strict parser for a pushed layout.
 *
 * <p>Deliberately unforgiving: this is the one endpoint that accepts data from
 * outside the mod, and a half-valid layout renders a wrong ghost that the
 * player would then build against. Every rejection carries a reason, which the
 * server returns in the 400 body.
 */
public final class LayoutParser {

    public static final int MAX_LABEL_LENGTH = 128;
    /** A greenhouse is small; this is generous and keeps a bad push cheap. */
    public static final int MAX_DIMENSION = 64;
    public static final int MAX_CELLS = 4096;

    private LayoutParser() {
    }

    public static GreenhouseLayout parse(String body) {
        if (body == null || body.isBlank()) {
            throw new LayoutFormatException("body is empty");
        }
        JsonObject root;
        try {
            JsonElement parsed = JsonParser.parseString(body);
            if (!parsed.isJsonObject()) {
                throw new LayoutFormatException("body must be a JSON object");
            }
            root = parsed.getAsJsonObject();
        } catch (JsonSyntaxException e) {
            throw new LayoutFormatException("body is not valid JSON");
        }
        return parse(root);
    }

    public static GreenhouseLayout parse(JsonObject root) {
        requireSchema(root);
        String label = requireLabel(root);
        int[] size = requireSize(root);
        List<LayoutCell> cells = requireCells(root, size[0], size[1]);
        return new GreenhouseLayout(label, size[0], size[1], cells);
    }

    private static void requireSchema(JsonObject root) {
        if (!root.has("schema")) {
            throw new LayoutFormatException("missing \"schema\"");
        }
        int schema;
        try {
            schema = root.get("schema").getAsInt();
        } catch (RuntimeException e) {
            throw new LayoutFormatException("\"schema\" must be an integer");
        }
        if (schema != GreenhouseLayout.SCHEMA) {
            throw new LayoutFormatException(
                    "unsupported schema " + schema + "; this mod understands schema "
                            + GreenhouseLayout.SCHEMA);
        }
    }

    private static String requireLabel(JsonObject root) {
        if (!root.has("label") || !root.get("label").isJsonPrimitive()) {
            throw new LayoutFormatException("missing \"label\"");
        }
        String label = root.get("label").getAsString();
        if (label.isBlank()) {
            throw new LayoutFormatException("\"label\" must not be blank");
        }
        if (label.length() > MAX_LABEL_LENGTH) {
            throw new LayoutFormatException(
                    "\"label\" must be at most " + MAX_LABEL_LENGTH + " characters");
        }
        return label.trim();
    }

    private static int[] requireSize(JsonObject root) {
        if (!root.has("size") || !root.get("size").isJsonArray()) {
            throw new LayoutFormatException("missing \"size\": expected [width, height]");
        }
        JsonArray size = root.getAsJsonArray("size");
        if (size.size() != 2) {
            throw new LayoutFormatException("\"size\" must have exactly 2 entries [width, height]");
        }
        int width = intAt(size, 0, "size[0]");
        int height = intAt(size, 1, "size[1]");
        if (width < 1 || height < 1) {
            throw new LayoutFormatException("\"size\" values must be at least 1");
        }
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            throw new LayoutFormatException(
                    "\"size\" values must be at most " + MAX_DIMENSION);
        }
        return new int[]{width, height};
    }

    private static int intAt(JsonArray array, int index, String what) {
        try {
            return array.get(index).getAsInt();
        } catch (RuntimeException e) {
            throw new LayoutFormatException("\"" + what + "\" must be an integer");
        }
    }

    private static List<LayoutCell> requireCells(JsonObject root, int width, int height) {
        if (!root.has("cells") || !root.get("cells").isJsonArray()) {
            throw new LayoutFormatException("missing \"cells\": expected an array");
        }
        JsonArray array = root.getAsJsonArray("cells");
        if (array.size() > MAX_CELLS) {
            throw new LayoutFormatException("too many cells (max " + MAX_CELLS + ")");
        }
        // Spec pin: overlaps should not occur, but if they do the LATER entry
        // wins — senders deliberately order mutations after crops so a mutation
        // overwrites the crop underneath it. Rejecting a duplicate would turn
        // that intended precedence into a hard failure.
        Map<String, LayoutCell> byPosition = new LinkedHashMap<>();

        for (int i = 0; i < array.size(); i++) {
            JsonElement element = array.get(i);
            if (!element.isJsonObject()) {
                throw new LayoutFormatException("cells[" + i + "] must be an object");
            }
            LayoutCell cell = parseCell(element.getAsJsonObject(), i, width, height);
            byPosition.put(cell.key(), cell);
        }
        return new ArrayList<>(byPosition.values());
    }

    private static LayoutCell parseCell(JsonObject o, int index, int width, int height) {
        int x = requireCellInt(o, "x", index);
        int y = requireCellInt(o, "y", index);
        if (x < 0 || x >= width || y < 0 || y >= height) {
            throw new LayoutFormatException("cells[" + index + "] (" + x + ", " + y
                    + ") is outside the " + width + "x" + height + " grid");
        }

        String crop = optionalString(o, "crop", index);
        String mutation = optionalString(o, "mutation", index);
        if (crop != null && mutation != null) {
            throw new LayoutFormatException(
                    "cells[" + index + "] has both \"crop\" and \"mutation\"; a cell must have exactly one");
        }
        if (crop == null && mutation == null) {
            throw new LayoutFormatException(
                    "cells[" + index + "] has neither \"crop\" nor \"mutation\"; a cell must have exactly one");
        }
        String ground = optionalString(o, "ground", index);
        Integer seconds = optionalSeconds(o, index);

        return crop != null
                ? LayoutCell.crop(x, y, crop, ground, seconds)
                : LayoutCell.mutation(x, y, mutation, ground, seconds);
    }

    private static int requireCellInt(JsonObject o, String key, int index) {
        if (!o.has(key) || !o.get(key).isJsonPrimitive()) {
            throw new LayoutFormatException("cells[" + index + "] is missing \"" + key + "\"");
        }
        try {
            return o.get(key).getAsInt();
        } catch (RuntimeException e) {
            throw new LayoutFormatException("cells[" + index + "] \"" + key + "\" must be an integer");
        }
    }

    /**
     * The sender's estimate for this cell, or null when it did not send one.
     *
     * <p>Absent is the ordinary case and means exactly one thing: show no timer
     * for this cell. The sender leaves the field out for anything it cannot
     * price honestly, so there is nothing to infer from its absence and nothing
     * to fall back on.
     *
     * <p>Present is held to the same standard as every other field here. A zero
     * or a negative would be a countdown that had already run out, and a
     * fraction is precision no growth model has, so both are rejected outright
     * rather than being rounded or clamped into something plausible. That keeps
     * absence as the single way to say "not known": if this parser quietly
     * repaired a bad number, a sender bug would surface in game as a wrong time
     * on a real cell instead of as a 400 the player can report.
     *
     * @return a positive whole number of seconds, or null when absent.
     */
    private static Integer optionalSeconds(JsonObject o, int index) {
        if (!o.has("seconds") || o.get("seconds").isJsonNull()) {
            return null;
        }
        JsonElement element = o.get("seconds");
        // A number, not a numeric-looking string. Coercing here would mean a
        // sender that had started shipping the wrong type went unnoticed on the
        // one field the player is asked to trust with their afternoon.
        if (!element.isJsonPrimitive() || !element.getAsJsonPrimitive().isNumber()) {
            throw new LayoutFormatException(
                    "cells[" + index + "] \"seconds\" must be a whole number of seconds");
        }
        double raw = element.getAsDouble();
        if (Double.isNaN(raw) || Double.isInfinite(raw) || raw != Math.floor(raw)) {
            throw new LayoutFormatException(
                    "cells[" + index + "] \"seconds\" must be a whole number of seconds");
        }
        long value = (long) raw;
        if (value < 1) {
            throw new LayoutFormatException(
                    "cells[" + index + "] \"seconds\" must be at least 1; omit the field when it is not known");
        }
        if (value > Integer.MAX_VALUE) {
            throw new LayoutFormatException(
                    "cells[" + index + "] \"seconds\" is out of range");
        }
        return (int) value;
    }

    /** @return the trimmed value, or null when absent. Present-but-blank is an error. */
    private static String optionalString(JsonObject o, String key, int index) {
        if (!o.has(key) || o.get(key).isJsonNull()) {
            return null;
        }
        if (!o.get(key).isJsonPrimitive()) {
            throw new LayoutFormatException("cells[" + index + "] \"" + key + "\" must be a string");
        }
        String value = o.get(key).getAsString();
        if (value.isBlank()) {
            throw new LayoutFormatException("cells[" + index + "] \"" + key + "\" must not be blank");
        }
        return value.trim();
    }
}
