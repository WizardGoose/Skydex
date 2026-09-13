package com.skydex.location;

/**
 * Hypixel marks non-standard profiles with a glyph appended to the profile
 * name. Pure string logic, kept separate from {@link LocationTracker} so it can
 * be tested without a game classpath.
 *
 * <p>Spec vocabulary: {@code "ironman" | "normal" | "bingo" | "stranded" | null}.
 */
public final class GameModes {

    static final char ICON_IRONMAN = '♲';
    static final char ICON_BINGO = 'Ⓑ';
    static final char ICON_STRANDED = '☀';

    private GameModes() {
    }

    /**
     * @param rawProfile the profile name as shown, glyph included
     * @return the spec gamemode, or null when the profile is unknown — a
     *         readable profile with no glyph is a normal profile
     */
    public static String of(String rawProfile) {
        if (rawProfile == null || rawProfile.isBlank()) {
            return null;
        }
        if (rawProfile.indexOf(ICON_IRONMAN) >= 0) {
            return "ironman";
        }
        if (rawProfile.indexOf(ICON_BINGO) >= 0) {
            return "bingo";
        }
        if (rawProfile.indexOf(ICON_STRANDED) >= 0) {
            return "stranded";
        }
        return "normal";
    }

    /** The profile name with any gamemode glyph removed. */
    public static String stripIcons(String rawProfile) {
        if (rawProfile == null) {
            return null;
        }
        StringBuilder sb = new StringBuilder(rawProfile.length());
        for (int i = 0; i < rawProfile.length(); i++) {
            char c = rawProfile.charAt(i);
            if (c != ICON_IRONMAN && c != ICON_BINGO && c != ICON_STRANDED) {
                sb.append(c);
            }
        }
        return sb.toString().trim();
    }
}
