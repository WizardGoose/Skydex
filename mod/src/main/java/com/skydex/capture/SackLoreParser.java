package com.skydex.capture;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;
import java.util.function.LongConsumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads the stored-count out of sack item lore.
 *
 * <p>In the sack GUI each slot <i>is</i> the stored item (its Hypixel id lives
 * in the item's {@code custom_data}), but the visible stack size is clamped to
 * 64 — the real amount is only in the lore, e.g.
 * <pre>§7Stored: §e12,345§7/§a20,000</pre>
 *
 * <p>So: id comes from the component, count comes from here. Hypixel
 * abbreviates large numbers ({@code 1.2M}), so plain, comma-grouped and
 * suffixed forms are all accepted.
 *
 * <p>No Minecraft types — callers hand us already-flattened lore strings.
 */
public final class SackLoreParser {

    /** The legacy section-sign colour code, e.g. {@code §7}. */
    private static final Pattern FORMATTING = Pattern.compile("§[0-9a-fk-orA-FK-OR]");

    /**
     * "Stored:" then the amount, optionally followed by "/max". The amount may
     * be comma grouped, may have a decimal part, and may carry a k/m/b suffix.
     */
    private static final Pattern STORED = Pattern.compile(
            "Stored\\s*:\\s*([0-9][0-9,.]*\\s*[kKmMbB]?)",
            Pattern.CASE_INSENSITIVE);

    /**
     * The Gemstones sack is the one category that does not use "Stored:" — it
     * lists each cut tier with its own " Amount: N" line.
     */
    private static final Pattern AMOUNT = Pattern.compile(
            "Amount\\s*:\\s*([0-9][0-9,.]*\\s*[kKmMbB]?)",
            Pattern.CASE_INSENSITIVE);

    /**
     * The Gemstones sack is the odd one out: a single slot holds every cut of
     * one gemstone, each on its own lore line, and the slot's id is always the
     * {@code ROUGH_} variant. Reading only the first count would record one tier
     * and silently lose the rest.
     *
     * <p>{@code FLAWLESS} is included deliberately — SkyOcean's equivalent list
     * stops at Fine, so those are simply never recorded there.
     */
    public static final List<String> GEMSTONE_TIERS =
            List.of("ROUGH", "FLAWED", "FINE", "FLAWLESS");

    private static final String ROUGH = "ROUGH";

    private SackLoreParser() {
    }

    /**
     * Expand one Gemstones-sack slot into an entry per cut.
     *
     * @param roughId the slot's own id, e.g. {@code ROUGH_RUBY_GEM}
     * @return derived id -> amount, e.g. {@code FLAWED_RUBY_GEM -> 512}; empty
     *         when this is not a gemstone slot
     */
    public static Map<String, Long> parseGemstoneEntries(String roughId, List<String> lore) {
        Map<String, Long> out = new LinkedHashMap<>();
        if (roughId == null || !roughId.contains(ROUGH) || lore == null) {
            return out;
        }
        for (String tier : GEMSTONE_TIERS) {
            parseTier(lore, tier).ifPresent(amount -> out.put(roughId.replace(ROUGH, tier), amount));
        }
        return out;
    }

    /** " Flawed: 1,024 ❤" -> 1024. Requires the colon so Flawless cannot match Flawed. */
    private static OptionalLong parseTier(List<String> lore, String tier) {
        Pattern pattern = Pattern.compile(
                "\\b" + tier + "\\s*:\\s*([0-9][0-9,.]*\\s*[kKmMbB]?)",
                Pattern.CASE_INSENSITIVE);
        for (String line : lore) {
            Matcher m = pattern.matcher(stripFormatting(line));
            if (m.find()) {
                return parseAmount(m.group(1));
            }
        }
        return OptionalLong.empty();
    }

    /**
     * The count for one sack slot: "Stored:" normally, " Amount:" for the
     * Gemstones sack.
     *
     * @return the amount, or empty when this item is not a sack entry — which
     *         is also how menu filler (glass panes, close buttons) gets skipped
     */
    public static OptionalLong parseSackCount(List<String> lore) {
        OptionalLong stored = parseStored(lore);
        if (stored.isPresent()) {
            return stored;
        }
        if (lore == null) {
            return OptionalLong.empty();
        }
        for (String line : lore) {
            Matcher m = AMOUNT.matcher(stripFormatting(line));
            if (m.find()) {
                return parseAmount(m.group(1));
            }
        }
        return OptionalLong.empty();
    }

    /** Remove legacy §-colour codes so patterns can match plain text. */
    public static String stripFormatting(String text) {
        if (text == null || text.isEmpty()) {
            return "";
        }
        return FORMATTING.matcher(text).replaceAll("");
    }

    /**
     * Parse the stored amount from a single lore line.
     *
     * @return the amount, or empty if this line is not a "Stored:" line
     */
    public static OptionalLong parseStoredLine(String loreLine) {
        if (loreLine == null) {
            return OptionalLong.empty();
        }
        Matcher m = STORED.matcher(stripFormatting(loreLine));
        if (!m.find()) {
            return OptionalLong.empty();
        }
        return parseAmount(m.group(1));
    }

    /**
     * Scan a whole lore block and return the first stored amount found.
     *
     * @return the amount, or empty if no line carries one
     */
    public static OptionalLong parseStored(List<String> lore) {
        if (lore == null) {
            return OptionalLong.empty();
        }
        for (String line : lore) {
            OptionalLong found = parseStoredLine(line);
            if (found.isPresent()) {
                return found;
            }
        }
        return OptionalLong.empty();
    }

    /**
     * Parse a Hypixel-style amount: {@code 12,345}, {@code 1.2M}, {@code 640}.
     *
     * @return the value, or empty if unparseable
     */
    public static OptionalLong parseAmount(String raw) {
        if (raw == null) {
            return OptionalLong.empty();
        }
        String s = stripFormatting(raw).trim().replace(",", "").replace(" ", "");
        if (s.isEmpty()) {
            return OptionalLong.empty();
        }
        long multiplier = 1L;
        char last = s.charAt(s.length() - 1);
        switch (Character.toLowerCase(last)) {
            case 'k' -> multiplier = 1_000L;
            case 'm' -> multiplier = 1_000_000L;
            case 'b' -> multiplier = 1_000_000_000L;
            default -> {
                // no suffix
            }
        }
        if (multiplier != 1L) {
            s = s.substring(0, s.length() - 1);
        }
        if (s.isEmpty()) {
            return OptionalLong.empty();
        }
        try {
            if (s.indexOf('.') >= 0) {
                double value = Double.parseDouble(s);
                return OptionalLong.of(Math.round(value * multiplier));
            }
            return OptionalLong.of(Long.parseLong(s) * multiplier);
        } catch (NumberFormatException e) {
            return OptionalLong.empty();
        }
    }
}
