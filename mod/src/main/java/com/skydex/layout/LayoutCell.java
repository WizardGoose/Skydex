package com.skydex.layout;

import com.google.gson.JsonObject;

import java.util.Objects;

/**
 * One occupied cell of a greenhouse layout.
 *
 * <p>Spec rule: a cell carries <b>either</b> a {@code crop} or a
 * {@code mutation}, never both and never neither. {@code ground} is an optional
 * extra ("this cell needs farmland under it"), and so is {@code seconds}.
 *
 * <p>{@code seconds} is how long the sender expects this cell to take. The mod
 * does not and cannot work it out: growth speed is a player stat run through a
 * wiki formula, and the mod can see the plot but neither the stat nor the
 * formula. So the site computes it and this class carries it. Null means the
 * sender had no honest answer, and that is the only thing null means - a sender
 * that cannot price a cell leaves the field out rather than sending a zero, so
 * "absent" never has to be told apart from "already finished".
 */
public final class LayoutCell {

    private final int x;
    private final int y;
    private final String crop;
    private final String mutation;
    private final String ground;
    private final Integer seconds;

    LayoutCell(int x, int y, String crop, String mutation, String ground, Integer seconds) {
        this.x = x;
        this.y = y;
        this.crop = crop;
        this.mutation = mutation;
        this.ground = ground;
        this.seconds = seconds;
    }

    public static LayoutCell crop(int x, int y, String crop, String ground) {
        return crop(x, y, crop, ground, null);
    }

    public static LayoutCell crop(int x, int y, String crop, String ground, Integer seconds) {
        return new LayoutCell(x, y, Objects.requireNonNull(crop), null, ground, seconds);
    }

    public static LayoutCell mutation(int x, int y, String mutation, String ground) {
        return mutation(x, y, mutation, ground, null);
    }

    public static LayoutCell mutation(int x, int y, String mutation, String ground, Integer seconds) {
        return new LayoutCell(x, y, null, Objects.requireNonNull(mutation), ground, seconds);
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

    /** null when the layout does not care what is underneath. */
    public String ground() {
        return ground;
    }

    public boolean isMutation() {
        return mutation != null;
    }

    /** null when the sender could not price this cell. Never zero. */
    public Integer seconds() {
        return seconds;
    }

    public boolean hasGround() {
        return ground != null && !ground.isBlank();
    }

    /** True when there is a wait worth showing the player. */
    public boolean hasSeconds() {
        return seconds != null && seconds > 0;
    }

    /** What to show when the player looks at this cell. */
    public String displayName() {
        return isMutation() ? mutation : crop;
    }

    /** Grid key, used to reject duplicates. */
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
        if (ground != null) {
            o.addProperty("ground", ground);
        }
        // Last, matching the order the site writes it, so a saved layout and the
        // body it came from read the same way side by side.
        if (seconds != null) {
            o.addProperty("seconds", seconds);
        }
        return o;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof LayoutCell other)) {
            return false;
        }
        return x == other.x && y == other.y
                && Objects.equals(crop, other.crop)
                && Objects.equals(mutation, other.mutation)
                && Objects.equals(ground, other.ground)
                && Objects.equals(seconds, other.seconds);
    }

    @Override
    public int hashCode() {
        return Objects.hash(x, y, crop, mutation, ground, seconds);
    }

    @Override
    public String toString() {
        return "LayoutCell[" + x + "," + y + " " + displayName() + "]";
    }
}
