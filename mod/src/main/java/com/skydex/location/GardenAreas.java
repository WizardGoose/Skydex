package com.skydex.location;

import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Decides whether the sidebar is describing the Garden.
 *
 * <p>Pure string logic, split out of {@link LocationTracker} so it can be tested
 * against real captured sidebar text. This check has now been wrong twice, in
 * opposite directions, and both times because it was written against an idea of
 * the wording rather than the wording itself:
 *
 * <ol>
 *   <li>first it matched only {@code "Garden"}, and the owner's Garden reports
 *       {@code "Plot - 3"} on a plot, so his real greenhouse was rejected;</li>
 *   <li>then it whole-matched {@code "The Garden"}, and his line actually
 *       renders as {@code "The Garden  x1"} with a private-use glyph and
 *       a count suffix, so it was rejected again.</li>
 * </ol>
 *
 * <p>Loose substring matching broke on looseness, and strict whole-line matching
 * broke on decoration. The fix is to stop matching raw text at all:
 * {@link #normalise} reduces a line to its words first, and only then is it
 * compared. Decoration is discarded rather than anticipated, which is what makes
 * this robust to the next glyph nobody has seen yet.
 *
 * <p><b>Observed ground truth</b> (owner's client, verbatim from logs):
 * <ul>
 *   <li>at the barn: {@code "The Garden  x1"};</li>
 *   <li>on a plot: {@code "Plot - 3"}, {@code "Plot - 2"};</li>
 *   <li>the area line: {@code "Garden"}, carrying the area glyph.</li>
 * </ul>
 */
public final class GardenAreas {

    /** Hypixel's area glyph and the ironman/recycle marker both live here. */
    private static final int PRIVATE_USE_START = 0xE000;
    private static final int PRIVATE_USE_END = 0xF8FF;

    /**
     * Trailing decoration: player-count markers like {@code "x1"}, and any bare
     * number. Anything else after the area name means the line is describing
     * something other than where the player is.
     */
    private static final Pattern DECORATION = Pattern.compile("^(x\\d+|\\d+)$");

    /** Hypixel numbers the ring plots 1 to 24; the centre is the barn. */
    private static final int MAX_PLOT = 24;

    private GardenAreas() {
    }

    /** True when any sidebar line says the player is on the Garden. */
    public static boolean isGarden(List<String> sidebarLines) {
        if (sidebarLines == null) {
            return false;
        }
        for (String line : sidebarLines) {
            if (isGardenLine(line)) {
                return true;
            }
        }
        return false;
    }

    /**
     * One sidebar line, however it is decorated.
     *
     * <p>The line must <b>name</b> the Garden: it starts with the area name, and
     * whatever follows must be decoration rather than more words. That is what
     * separates {@code "The Garden  x1"} (the player is there) from
     * {@code "Garden Visitors: 3"} (a line that merely mentions it).
     */
    public static boolean isGardenLine(String line) {
        String[] words = normalise(line);
        if (words.length == 0) {
            return false;
        }
        int consumed = matchAreaName(words);
        if (consumed <= 0) {
            return false;
        }
        for (int i = consumed; i < words.length; i++) {
            if (!DECORATION.matcher(words[i]).matches()) {
                return false;
            }
        }
        return true;
    }

    /**
     * How many leading words the area name takes up, or -1 if it is not there.
     *
     * <p>Longest first: "the garden" must be tried before "garden".
     */
    private static int matchAreaName(String[] words) {
        if (words.length >= 2 && words[0].equals("the") && words[1].equals("garden")) {
            return 2;
        }
        if (words[0].equals("garden")) {
            return 1;
        }
        // "plot - 3", however it was spaced before normalising.
        if (words.length >= 3 && words[0].equals("plot") && words[1].equals("-")
                && isPlotNumber(words[2])) {
            return 3;
        }
        return -1;
    }

    private static boolean isPlotNumber(String word) {
        if (word.isEmpty() || word.length() > 2) {
            return false;
        }
        for (int i = 0; i < word.length(); i++) {
            if (!Character.isDigit(word.charAt(i))) {
                return false;
            }
        }
        int n = Integer.parseInt(word);
        return n >= 1 && n <= MAX_PLOT;
    }

    /** The plot number in a location line, or -1 when it is not a plot line. */
    public static int plotNumber(String line) {
        String[] words = normalise(line);
        if (words.length >= 3 && words[0].equals("plot") && words[1].equals("-")
                && isPlotNumber(words[2])) {
            return Integer.parseInt(words[2]);
        }
        return -1;
    }

    /**
     * A sidebar line reduced to lower-case words.
     *
     * <p>Everything that is not a letter, digit or dash becomes a separator, so
     * colour codes, private-use glyphs, punctuation and runs of spaces all
     * vanish together. Dashes survive as their own word, which is what keeps
     * "Plot - 3" and "Plot-3" the same thing.
     */
    public static String[] normalise(String line) {
        if (line == null || line.isEmpty()) {
            return new String[0];
        }
        StringBuilder flat = new StringBuilder(line.length() + 4);
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '-') {
                // Its own word, so spacing around it stops mattering.
                flat.append(" - ");
            } else if (Character.isLetterOrDigit(c) && !isPrivateUse(c)) {
                flat.append(Character.toLowerCase(c));
            } else {
                flat.append(' ');
            }
        }
        String text = flat.toString().trim();
        return text.isEmpty() ? new String[0] : text.split("\\s+");
    }

    /**
     * Private-use characters are glyphs, never text.
     *
     * <p>{@link Character#isLetterOrDigit} reports them as letters, so without
     * this an icon would survive normalisation and glue itself to a real word.
     */
    private static boolean isPrivateUse(char c) {
        return c >= PRIVATE_USE_START && c <= PRIVATE_USE_END;
    }

    /** Debug helper: the normalised form as one string. */
    public static String normalisedText(String line) {
        return String.join(" ", normalise(line)).toLowerCase(Locale.ROOT);
    }
}
