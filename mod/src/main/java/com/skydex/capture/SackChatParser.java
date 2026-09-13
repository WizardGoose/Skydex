package com.skydex.capture;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads the "[Sacks]" chat message's hover tooltip.
 *
 * <p>The message looks like {@code [Sacks] +1,007 items, -534 items. (Last 30s.)},
 * and each direction carries its own hover listing what moved:
 * <pre>
 * Added items:
 *   +3 Lump of Magma (Lava Fishing Sack)
 *   +1,433 ☘ Rough Citrine Gemstone (Gemstones Sack)
 *   +7 Mycelium (Mining Sack, Nether Sack, Lava Fishing Sack)
 * </pre>
 *
 * <p><b>The bracketed text is a list of sack names, not a number.</b> It is
 * neither a total nor a quantity — the only number on the line is the signed
 * change at the front. These are therefore <b>deltas to add</b>, never totals to
 * assign. Verified against captured chat components and against how SkyHanni,
 * Skyblocker and skyblock-api each parse the same line: all three add the delta,
 * and all three discard the brackets.
 *
 * <p>Pure strings — the caller flattens the hover into lines — so the patterns
 * are testable against real captured text.
 */
public final class SackChatParser {

    /** The marker that identifies the message. */
    public static final String MARKER = "[Sacks]";
    /** Hover headers, one per direction. */
    public static final String ADDED_HEADER = "Added items:";
    public static final String REMOVED_HEADER = "Removed items:";

    /**
     * Signed change, item name, then the sack list in brackets. Group 3 is
     * captured only so the line shape must match; its contents are discarded.
     */
    private static final Pattern LINE =
            Pattern.compile("([+-][\\d,]+)\\s+(.+?)\\s+\\(([^)]+)\\)");

    /**
     * Long hauls end with a bracket-free tail line ("+61 other items."). Without
     * noticing it we would silently under-report a big pickup.
     */
    private static final Pattern TRUNCATED =
            Pattern.compile("[+-][\\d,]+\\s+other items?\\.?", Pattern.CASE_INSENSITIVE);

    /**
     * Gemstone entries carry a leading icon and name a cut: "☘ Rough Citrine
     * Gemstone" is {@code ROUGH_CITRINE_GEM}, not {@code ..._GEMSTONE}.
     * Anchored on the trailing "Gemstone" so "Fine Flour" — a real item that
     * merely begins with a cut name — is left alone.
     */
    private static final Pattern GEMSTONE = Pattern.compile(
            "^(Rough|Flawed|Fine|Flawless)\\s+(.+?)\\s+Gemstones?$", Pattern.CASE_INSENSITIVE);

    /** Leading decoration: gem icons, bullets, stray punctuation. */
    private static final Pattern LEADING_DECORATION = Pattern.compile("^[^\\p{L}\\p{N}]+");

    private SackChatParser() {
    }

    /** One parsed hover: what moved, and whether the list was complete. */
    public record Update(Map<String, Long> deltas, boolean truncated) {

        public boolean isEmpty() {
            return deltas.isEmpty();
        }
    }

    /** True when this chat line is the sacks-change message. */
    public static boolean isSackMessage(String flattenedMessage) {
        return flattenedMessage != null && flattenedMessage.contains(MARKER);
    }

    /** True when a hover belongs to the sacks message rather than something else. */
    public static boolean isSackHover(String flattenedHover) {
        if (flattenedHover == null) {
            return false;
        }
        String trimmed = flattenedHover.stripLeading();
        return trimmed.startsWith(ADDED_HEADER) || trimmed.startsWith(REMOVED_HEADER);
    }

    /**
     * Parse hover lines into signed deltas.
     *
     * @param hoverLines the hover tooltip, one entry per line, colour codes
     *                   still allowed
     * @return the changes, and whether the game truncated the list
     */
    public static Update parseDeltas(List<String> hoverLines) {
        Map<String, Long> deltas = new LinkedHashMap<>();
        boolean truncated = false;
        if (hoverLines == null) {
            return new Update(deltas, false);
        }
        for (String raw : hoverLines) {
            String line = SackLoreParser.stripFormatting(raw).trim();
            if (line.isEmpty()) {
                continue;
            }
            Matcher m = LINE.matcher(line);
            if (m.find()) {
                // Group 3 is the sack list; deliberately unused.
                Optional<Long> delta = parseSigned(m.group(1));
                String id = toItemId(m.group(2));
                if (delta.isPresent() && !id.isEmpty() && delta.get() != 0) {
                    deltas.merge(id, delta.get(), Long::sum);
                }
                continue;
            }
            if (TRUNCATED.matcher(line).find()) {
                truncated = true;
            }
        }
        return new Update(deltas, truncated);
    }

    /** "+1,433" or "-2,161" to a signed value. */
    private static Optional<Long> parseSigned(String raw) {
        String text = raw.trim();
        boolean negative = text.startsWith("-");
        String digits = text.replaceAll("[^0-9]", "");
        if (digits.isEmpty()) {
            return Optional.empty();
        }
        try {
            long value = Long.parseLong(digits);
            return Optional.of(negative ? -value : value);
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    /**
     * Display name to Hypixel item id.
     *
     * <p>The hover gives names; the other mods resolve them through the NEU item
     * repository, which this mod does not ship. Inverting {@code prettify} is
     * exact for the plain materials that dominate sacks, and wrong for oddities
     * like trophy fish ("Blobfish §LBRONZE"). That is survivable because the
     * caller only applies deltas to ids a sack <i>screen</i> already established
     * — a name that inverts wrongly matches nothing and is dropped, rather than
     * inventing a phantom entry.
     */
    public static String toItemId(String displayName) {
        if (displayName == null || displayName.isBlank()) {
            return "";
        }
        String name = SackLoreParser.stripFormatting(displayName).trim();
        // Gem icons and similar decoration sit before the name proper.
        name = LEADING_DECORATION.matcher(name).replaceFirst("").trim();
        if (name.isEmpty()) {
            return "";
        }

        Matcher gem = GEMSTONE.matcher(name);
        if (gem.matches()) {
            return normalise(gem.group(1) + "_" + gem.group(2) + "_GEM");
        }
        return normalise(name);
    }

    private static String normalise(String text) {
        return text.toUpperCase(Locale.ROOT)
                .replaceAll("[^A-Z0-9]+", "_")
                .replaceAll("^_+|_+$", "");
    }
}
