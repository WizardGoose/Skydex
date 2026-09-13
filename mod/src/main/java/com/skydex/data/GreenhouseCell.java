package com.skydex.data;

import com.google.gson.JsonObject;

import java.util.Objects;

/**
 * One occupied cell of an OBSERVED greenhouse board.
 *
 * <p>Deliberately the same coordinate pins as {@link com.skydex.layout.LayoutCell}
 * (Transport 3, the site-to-mod push direction): {@code x} is the column,
 * {@code y} is the row, both 0-based, and both directions anchor to the same
 * corner. That is what lets the site line "what the player actually planted" up
 * against "what the site told them to plant", cell for cell, with no coordinate
 * translation in between.
 *
 * <p><b>The coordinates align. The values do not, and that is intended.</b> The
 * two directions speak different vocabularies, each pinned by its own half of
 * the spec:
 * <ul>
 *   <li>an <b>observed</b> cell carries Hypixel internal id style, as the
 *       greenhouse section's example shows ({@code "PUMPKIN"},
 *       {@code "CHOCONUT"});</li>
 *   <li>a <b>pushed layout</b> cell carries display names, as Transport 3's
 *       example shows ({@code "Cocoa Beans"}, {@code "Choconut"}).</li>
 * </ul>
 * Both stand as written. Comparing a cell across the two directions therefore
 * needs exactly one normalisation step, and it belongs on the site, which owns
 * both ends of that comparison. In this codebase the two halves of that
 * conversion are {@link ItemNames#prettify} (id to display name) and its
 * inverse, upper-casing and replacing spaces with underscores. Normalising to
 * the id side is the safer direction: it is the total one, since prettifying is
 * lossy for names that are not simple title case.
 *
 * <p>Spec rule, same as the layout push: a cell carries <b>either</b> a
 * {@code crop} or a {@code mutation}, never both and never neither.
 *
 * <p>{@code nextStageAt} is the one field the push direction has no equivalent
 * for. It is an absolute ms epoch derived from the Crop Diagnostics screen's
 * countdown, and it is optional per cell because that reading is per crop and
 * only exists when the player deliberately inspected that crop. Absent means
 * "no fresh reading", never "not growing".
 *
 * <p>No Minecraft types on purpose, so the whole wire contract stays testable
 * off a game classpath.
 */
public final class GreenhouseCell {

    /** Sentinel for "no countdown reading for this cell". */
    public static final long NO_NEXT_STAGE = 0L;

    private final int x;
    private final int y;
    private final String crop;
    private final String mutation;
    private final long nextStageAt;

    private GreenhouseCell(int x, int y, String crop, String mutation, long nextStageAt) {
        this.x = x;
        this.y = y;
        this.crop = crop;
        this.mutation = mutation;
        this.nextStageAt = nextStageAt;
    }

    public static GreenhouseCell crop(int x, int y, String crop) {
        return new GreenhouseCell(x, y, Objects.requireNonNull(crop), null, NO_NEXT_STAGE);
    }

    public static GreenhouseCell mutation(int x, int y, String mutation) {
        return new GreenhouseCell(x, y, null, Objects.requireNonNull(mutation), NO_NEXT_STAGE);
    }

    /** The same cell with a countdown attached. */
    public GreenhouseCell withNextStageAt(long ms) {
        return new GreenhouseCell(x, y, crop, mutation, ms);
    }

    public int x() {
        return x;
    }

    public int y() {
        return y;
    }

    /** null when this is a mutation cell. */
    public String crop() {
        return crop;
    }

    /** null when this is a crop cell. */
    public String mutation() {
        return mutation;
    }

    public boolean isMutation() {
        return mutation != null;
    }

    /** ms epoch, or {@link #NO_NEXT_STAGE} when the player has not diagnosed this cell. */
    public long nextStageAt() {
        return nextStageAt;
    }

    public boolean hasNextStage() {
        return nextStageAt > NO_NEXT_STAGE;
    }

    /** What the cell holds, whichever kind it is. */
    public String id() {
        return isMutation() ? mutation : crop;
    }

    /** Grid key, used to reject duplicates while scanning. */
    public String key() {
        return x + "," + y;
    }

    public JsonObject toJson() {
        JsonObject o = new JsonObject();
        o.addProperty("x", x);
        o.addProperty("y", y);
        if (crop != null) {
            o.addProperty("crop", crop);
        }
        if (mutation != null) {
            o.addProperty("mutation", mutation);
        }
        if (hasNextStage()) {
            o.addProperty("nextStageAt", nextStageAt);
        }
        return o;
    }

    public static GreenhouseCell fromJson(JsonObject o) {
        int x = o.has("x") ? o.get("x").getAsInt() : 0;
        int y = o.has("y") ? o.get("y").getAsInt() : 0;
        String crop = str(o, "crop");
        String mutation = str(o, "mutation");
        long next = o.has("nextStageAt") && !o.get("nextStageAt").isJsonNull()
                ? o.get("nextStageAt").getAsLong()
                : NO_NEXT_STAGE;
        if (mutation != null) {
            return new GreenhouseCell(x, y, null, mutation, next);
        }
        // A cell with neither is not legal on the wire; treating it as a crop
        // cell with a null id would smuggle an invalid entry onwards, so the
        // reader rejects it instead.
        if (crop == null) {
            return null;
        }
        return new GreenhouseCell(x, y, crop, null, next);
    }

    private static String str(JsonObject o, String key) {
        if (!o.has(key) || o.get(key).isJsonNull()) {
            return null;
        }
        String value = o.get(key).getAsString();
        return value.isBlank() ? null : value;
    }

    /**
     * Content equality, used to decide whether a rescan actually changed
     * anything. {@code nextStageAt} counts: a fresh countdown is new information
     * the site wants even when the board itself is unchanged.
     */
    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof GreenhouseCell other)) {
            return false;
        }
        return x == other.x && y == other.y
                && nextStageAt == other.nextStageAt
                && Objects.equals(crop, other.crop)
                && Objects.equals(mutation, other.mutation);
    }

    @Override
    public int hashCode() {
        return Objects.hash(x, y, crop, mutation, nextStageAt);
    }

    @Override
    public String toString() {
        return "GreenhouseCell[" + x + "," + y + " " + id() + "]";
    }
}
