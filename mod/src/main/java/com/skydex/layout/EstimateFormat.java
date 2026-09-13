package com.skydex.layout;

/**
 * How long a cell has left, in words, always hedged.
 *
 * <p>The tilde is not decoration and is never dropped. The number behind it is
 * the site's growth model run over the player's stats, which is a good estimate
 * and not a clock: it assumes the plot is planted the moment the layout is, and
 * it cannot know when the player actually gets round to it. A bare "2h 15m"
 * reads as a countdown someone is keeping; "~2h 15m" reads as the guess it is.
 *
 * <p>Two units at most, largest first, and the smaller one dropped when it is
 * zero. A greenhouse wait is measured in hours, so a player reading this over a
 * crosshair wants the shape of the wait rather than its seconds.
 *
 * <p>Pure and static, with no Minecraft types, so the wording is pinned by tests
 * rather than by looking at it in game.
 */
public final class EstimateFormat {

    private static final int MINUTE = 60;
    private static final int HOUR = 60 * MINUTE;
    private static final int DAY = 24 * HOUR;

    private EstimateFormat() {
    }

    /**
     * Whether this cell gets a time at all.
     *
     * <p>Three conditions, and each one is a way of being wrong that is worse
     * than saying nothing:
     *
     * <ul>
     *   <li>{@code projecting} - only then is the layout being compared against
     *       the world, so only then does the mod know which cells are still
     *       owed. With it off nothing is known to be pending and a time would be
     *       a claim about a cell that may already be grown.</li>
     *   <li>still pending - a countdown on a finished cell counts down to
     *       something that has already happened.</li>
     *   <li>priced - the sender leaves the field out for every cell its growth
     *       model cannot answer for, and there is no second source to fall back
     *       on. Absent means absent.</li>
     * </ul>
     *
     * <p>Lives here rather than inside the renderer so the rule can be tested
     * without a game running. A null cell is not a cell and gets nothing.
     */
    public static boolean shows(boolean projecting, CellStatus status, LayoutCell cell) {
        return projecting && cell != null && status != null && status.isPending() && cell.hasSeconds();
    }

    /**
     * "~45m", "~2h 15m", "~1d 3h".
     *
     * <p>Anything under a minute is reported as under a minute rather than
     * rounded to one, because rounding up would be the only place this function
     * states a longer wait than it was given. The parser refuses a seconds value
     * below 1, so a non-positive number cannot arrive from a push; it is handled
     * anyway, as the same "no useful wait" answer, because a formatter that
     * throws would take the whole overlay frame down with it.
     */
    public static String format(int seconds) {
        if (seconds < MINUTE) {
            return "~<1m";
        }
        if (seconds < HOUR) {
            return "~" + (seconds / MINUTE) + "m";
        }
        if (seconds < DAY) {
            int hours = seconds / HOUR;
            int minutes = (seconds % HOUR) / MINUTE;
            return minutes > 0 ? "~" + hours + "h " + minutes + "m" : "~" + hours + "h";
        }
        int days = seconds / DAY;
        int hours = (seconds % DAY) / HOUR;
        return hours > 0 ? "~" + days + "d " + hours + "h" : "~" + days + "d";
    }
}
