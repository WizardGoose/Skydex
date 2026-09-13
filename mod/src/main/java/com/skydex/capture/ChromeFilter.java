package com.skydex.capture;

import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Tells Hypixel's GUI furniture apart from actual items.
 *
 * <p>Storage and ender chest screens are menus, not containers: they are full of
 * filler panes, "Close" barriers, "Back" arrows and page-navigation heads. Left
 * unfiltered those land in the capture as items — a real export contained 218
 * such rows out of 2,134, including nine "Ender Chest Page N" panes.
 *
 * <p><b>The discriminator is the custom_data id, not the display name.</b>
 * Chrome has no Hypixel id, so its id falls back to the Minecraft registry path
 * ({@code BARRIER}, {@code BLACK_STAINED_GLASS_PANE}). Real items always have
 * one. That distinction matters more than it looks:
 * <ul>
 *   <li>the same export held {@code STAINED_GLASS_PANE:13} "Green Stained Glass
 *       Pane" — a genuinely stored pane, which a blanket "skip glass panes" rule
 *       would have deleted;</li>
 *   <li>it also held {@code BACKWATER_BOOTS} "Backwater Boots", which any
 *       substring match on "Back" would have eaten.</li>
 * </ul>
 * So an id-bearing item always passes, and the name patterns below are only ever
 * consulted for items that have no id at all.
 *
 * <p>Pure strings, no Minecraft types, so every rule is testable against the
 * real names observed in an export.
 */
public final class ChromeFilter {

    /**
     * Real items that are still noise in a storage listing. Matched on the
     * Hypixel id, never on a display name, so nothing else can be caught by it.
     * The SkyBlock menu is the one every player permanently carries in slot 8.
     */
    private static final Set<String> EXCLUDED_IDS = Set.of("SKYBLOCK_MENU");

    /** Single-word buttons that appear on menu screens. */
    private static final Set<String> BUTTON_NAMES = Set.of(
            "back", "go back", "close", "backpacks", "toolkits", "toolkit");

    /** "Backpack Slot 3", "Empty Backpack Slot 12". */
    private static final Pattern SLOT_PLACEHOLDER =
            Pattern.compile("^(empty\\s+)?backpack\\s+slot\\s+\\d+$", Pattern.CASE_INSENSITIVE);

    /** "Ender Chest Page 4", "Storage Page 2". */
    private static final Pattern PAGE_PLACEHOLDER =
            Pattern.compile("^[a-z ]*\\bpage\\s+\\d+$", Pattern.CASE_INSENSITIVE);

    /**
     * "Next Page →", "« First Page", "← Previous Page", "Last Page »".
     * Anchored on the words, so the arrow glyph can be anything or absent.
     */
    private static final Pattern PAGE_NAVIGATION = Pattern.compile(
            "^\\W*(first|previous|prev|next|last)\\s+page\\W*$", Pattern.CASE_INSENSITIVE);

    private ChromeFilter() {
    }

    /**
     * @param customDataId the {@code id} from custom_data, or null/blank when the
     *                     item has none — this is the deciding input
     * @param registryPath the Minecraft registry path, e.g. {@code barrier}
     * @param displayName  the hover name with colour codes stripped
     * @return true when this is menu furniture rather than an item
     */
    public static boolean isChrome(String customDataId, String registryPath, String displayName) {
        if (customDataId != null && !customDataId.isBlank()) {
            // Real item. The only rejections here are explicitly named ids.
            return EXCLUDED_IDS.contains(customDataId.trim().toUpperCase(Locale.ROOT));
        }

        String path = registryPath == null ? "" : registryPath.toLowerCase(Locale.ROOT);
        // Filler panes and the close button are never real once the id is gone.
        if (path.endsWith("glass_pane") || path.equals("barrier")) {
            return true;
        }

        String name = displayName == null ? "" : displayName.trim();
        // Hypixel blanks the name on pure spacer items.
        if (name.isEmpty()) {
            return true;
        }

        String lower = name.toLowerCase(Locale.ROOT);
        return BUTTON_NAMES.contains(lower)
                || SLOT_PLACEHOLDER.matcher(name).matches()
                || PAGE_PLACEHOLDER.matcher(name).matches()
                || PAGE_NAVIGATION.matcher(name).matches();
    }
}
