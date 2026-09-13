package com.skydex;

/**
 * The Skydex palette: one source for every colour the mod shows a player,
 * whether that is the settings screen, a chat line, or a ghost tile lying on
 * the island floor.
 *
 * <p>The look is the site's frosted glass. Minecraft can blur what sits behind
 * a GUI stratum, so the frost itself is real rather than painted on, and these
 * constants describe only the tint laid over it: panels are translucent and
 * thin out toward the bottom, borders are a hairline of white at low alpha,
 * and exactly one blue carries every active state.
 *
 * <p>Values are ARGB ints, the form the fill and text calls take. Chat colours
 * are plain RGB with no alpha channel, so {@link #rgb(int)} drops the alpha
 * rather than restating the same six digits in a second place.
 *
 * <p>Nothing here is a Minecraft type, so the classes that depend on this one
 * stay testable without a client.
 */
public final class SkydexTheme {

    // ------------------------------------------------------------ the glass

    /**
     * The full window behind the panel.
     *
     * <p>Deliberately translucent. The blurred world showing through is what
     * separates glass from a painted backdrop, and a wash heavy enough to hide
     * the world would throw away the only real frost the renderer offers.
     */
    public static final int SCRIM = 0x8F05080C;

    /** Panel ground at its top edge. */
    public static final int PANEL_TOP = 0xF20A0D12;
    /**
     * Panel ground at its bottom edge.
     *
     * <p>The pane thins as it falls, which is the whole of the glass read; one
     * flat alpha across the card looks like paper. The range lives in the two
     * ends of a single gradient because layering a second fill over the first
     * could only ever add opacity, never take it away.
     */
    public static final int PANEL_BOTTOM = 0xE611151B;

    /** Hairline border: white, barely there, and never boxed inside another. */
    public static final int BORDER = 0x21E8EDF3;

    // --------------------------------------------------------- the controls

    /** A control at rest: a touch brighter than the pane under it. */
    public static final int SURFACE = 0x0CFFFFFF;
    /** The same control under the pointer, or holding keyboard focus. */
    public static final int SURFACE_HOVER = 0x16FFFFFF;
    /** A control that is switched on, tinted by the accent rather than filled with it. */
    public static final int SURFACE_SELECTED = 0x1338BDF2;

    // -------------------------------------------------------------- the ink

    /** Index blue: active states, highlights, progress. */
    public static final int ACCENT = 0xFF38BDF2;
    /** A value worth attention, as opposed to a label describing one. */
    public static final int GOLD = 0xFFF7B232;
    /** Primary type. */
    public static final int TEXT = 0xFFE8EDF3;
    /** Secondary type: labels, hints, indented detail rows. */
    public static final int MUTED = 0xFF8793A3;
    /** Confirmation, and the marker for a cell that wants a specific ground block. */
    public static final int SUCCESS = 0xFF43D17A;
    /** Failure. Same family as {@link #SUCCESS} so the pair reads as one set. */
    public static final int DANGER = 0xFFFF5D68;

    /** The groove a progress fill sits in: near black, and darker than any panel. */
    public static final int GROOVE = 0xCC05070B;

    private SkydexTheme() {
    }

    // ---------------------------------------------------------- conversions

    /** Drop the alpha, for the chat colour API, which takes plain RGB. */
    public static int rgb(int argb) {
        return argb & 0xFFFFFF;
    }

    /** The same colour at a different alpha, so a tint keeps one definition. */
    public static int withAlpha(int argb, int alpha) {
        return ((alpha & 0xFF) << 24) | (argb & 0xFFFFFF);
    }

    /**
     * The same colour at half brightness.
     *
     * <p>Used for the line under a progress fill, which is what gives the fill
     * an edge instead of letting it bleed into the groove. Deriving it beats
     * naming a second constant per fill colour, and it keeps a gold bar and a
     * blue bar built the same way.
     */
    public static int darken(int argb) {
        int r = ((argb >> 16) & 0xFF) / 2;
        int g = ((argb >> 8) & 0xFF) / 2;
        int b = (argb & 0xFF) / 2;
        return (argb & 0xFF000000) | (r << 16) | (g << 8) | b;
    }
}
