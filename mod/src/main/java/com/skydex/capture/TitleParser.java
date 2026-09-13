package com.skydex.capture;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Classifies a container screen from its title.
 *
 * <p>Hypixel screens are only identifiable by their title text, so this is the
 * guessiest part of the mod — which is exactly why it lives here as pure string
 * logic with tests, rather than inline in the capture path.
 *
 * <p>Titles must already be stripped of colour codes.
 */
public final class TitleParser {

    /** "Ender Chest (3/9)" -> 3. */
    private static final Pattern PAGE = Pattern.compile("\\((\\d+)\\s*/\\s*\\d+\\)");

    private TitleParser() {
    }

    public static ScreenKind classify(String title) {
        if (title == null) {
            return ScreenKind.OTHER;
        }
        String lower = title.trim().toLowerCase(Locale.ROOT);
        if (lower.isEmpty()) {
            return ScreenKind.OTHER;
        }
        // "Farming Sack", "Gemstones Sack", "Sack of Sacks"
        if (lower.endsWith(" sack") || lower.endsWith(" sacks") || lower.equals("sack of sacks")) {
            return ScreenKind.SACK;
        }
        if (lower.startsWith("ender chest")) {
            return ScreenKind.ENDER_CHEST;
        }
        // Checked before the generic backpack/storage rules so a future
        // "Crop Diagnostics" variant cannot be swallowed by one of them.
        if (com.skydex.garden.CropDiagnosticsParser.isDiagnosticsTitle(title)) {
            return ScreenKind.CROP_DIAGNOSTICS;
        }
        if (lower.contains("backpack") || lower.startsWith("storage")) {
            return ScreenKind.STORAGE;
        }
        return ScreenKind.OTHER;
    }

    /**
     * Stable key for a paged screen: the page number when the title carries one
     * ("Ender Chest (3/9)"), otherwise the title itself — which keeps two
     * differently-named backpacks apart.
     */
    public static String pageOf(String title) {
        if (title == null || title.isBlank()) {
            return "1";
        }
        Matcher m = PAGE.matcher(title);
        if (m.find()) {
            return m.group(1);
        }
        return title.trim();
    }
}
