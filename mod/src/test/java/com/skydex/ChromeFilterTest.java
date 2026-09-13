package com.skydex;

import com.skydex.capture.ChromeFilter;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Every name here was taken from a real exported island, where 218 of 2,134
 * captured rows turned out to be menu furniture.
 *
 * <p>The two "trap" cases matter most: that export also held a genuinely stored
 * {@code STAINED_GLASS_PANE:13} and a pair of {@code BACKWATER_BOOTS}. A blanket
 * "skip glass panes" rule would delete the first; any substring match on "Back"
 * would delete the second. Both survive because they carry a custom_data id.
 */
class ChromeFilterTest {

    private static boolean chrome(String id, String path, String name) {
        return ChromeFilter.isChrome(id, path, name);
    }

    // ------------------------------------------------------- real chrome

    @Test
    @DisplayName("filler panes are chrome, including the unnamed spacers")
    void fillerPanes() {
        // 84 of these in the export, with a blanked display name.
        assertTrue(chrome("", "black_stained_glass_pane", ""));
        assertTrue(chrome(null, "black_stained_glass_pane", " "));
        assertTrue(chrome("", "brown_stained_glass_pane", "Empty Backpack Slot 10"));
        assertTrue(chrome("", "purple_stained_glass_pane", "Ender Chest Page 1"));
        assertTrue(chrome("", "purple_stained_glass_pane", "Ender Chest Page 9"));
    }

    @Test
    @DisplayName("menu buttons are chrome")
    void menuButtons() {
        assertTrue(chrome("", "barrier", "Close"));
        assertTrue(chrome("", "arrow", "Back"));
        assertTrue(chrome("", "arrow", "Go Back"));
        assertTrue(chrome("", "chest", "Backpacks"));
        assertTrue(chrome("", "chest", "Toolkits"));
    }

    @Test
    @DisplayName("page navigation heads are chrome whatever arrow they use")
    void pageNavigation() {
        assertTrue(chrome("", "player_head", "Next Page →"));
        assertTrue(chrome("", "player_head", "Last Page »"));
        assertTrue(chrome("", "player_head", "« First Page"));
        assertTrue(chrome("", "player_head", "← Previous Page"));
        // Same words, no glyphs at all.
        assertTrue(chrome("", "player_head", "Next Page"));
        assertTrue(chrome("", "player_head", "Previous Page"));
    }

    @Test
    @DisplayName("slot placeholders are chrome, filled or empty")
    void slotPlaceholders() {
        assertTrue(chrome("", "player_head", "Backpack Slot 1"));
        assertTrue(chrome("", "player_head", "Backpack Slot 9"));
        assertTrue(chrome("", "brown_stained_glass_pane", "Empty Backpack Slot 18"));
    }

    // ------------------------------------------------------- the traps

    @Test
    @DisplayName("a genuinely stored glass pane survives, because it has an id")
    void realGlassPaneSurvives() {
        assertFalse(chrome("STAINED_GLASS_PANE:13", "green_stained_glass_pane",
                "Green Stained Glass Pane"));
        assertFalse(chrome("STAINED_GLASS_PANE:5", "lime_stained_glass_pane",
                "Lime Stained Glass Pane"));
    }

    @Test
    @DisplayName("Backwater Boots survive, which a substring match on 'Back' would not")
    void backwaterBootsSurvive() {
        assertFalse(chrome("BACKWATER_BOOTS", "leather_boots", "Backwater Boots"));
        assertFalse(chrome("BACKWATER_HELMET", "leather_helmet", "Backwater Helmet"));
        // A real item that literally is named after a page would still survive.
        assertFalse(chrome("SOME_REAL_ITEM", "paper", "Next Page →"));
    }

    @Test
    @DisplayName("an id-bearing item always passes, whatever it looks like")
    void idBearingAlwaysPasses() {
        assertFalse(chrome("ENCHANTED_BOOK", "enchanted_book", "Enchanted Book"));
        assertFalse(chrome("BARRIER_ITEM", "barrier", "Close"));
        assertFalse(chrome("SOME_ITEM", "black_stained_glass_pane", ""));
    }

    @Test
    @DisplayName("the SkyBlock menu is excluded by id, never by name")
    void skyblockMenuExcludedById() {
        assertTrue(chrome("SKYBLOCK_MENU", "nether_star", "SkyBlock Menu (Click)"));
        // Something merely NAMED that way is not touched.
        assertFalse(chrome("MY_ITEM", "nether_star", "SkyBlock Menu (Click)"));
    }

    // ------------------------------------------------------- real items

    @Test
    @DisplayName("ordinary stored items are never chrome")
    void ordinaryItemsPass() {
        assertFalse(chrome("ENCHANTED_COBBLESTONE", "cobblestone", "Enchanted Cobblestone"));
        assertFalse(chrome("HYPERION", "diamond_sword", "Heroic Hyperion"));
        assertFalse(chrome("PET_SKIN_ENDERMAN", "player_head", "Enderman Pet Skin"));
        assertFalse(chrome("ARACHNE_KEEPER_FRAGMENT", "prismarine_shard",
                "Arachne Keeper Fragment"));
    }

    @Test
    @DisplayName("an id-less item with an ordinary name is kept, not guessed away")
    void idlessOrdinaryItemKept() {
        // Vanilla-looking but plausibly real: no id, but nothing menu-like
        // about it either. Keeping it is the conservative choice.
        assertFalse(chrome("", "oak_log", "Oak Log"));
        assertFalse(chrome("", "diamond", "Diamond"));
        assertFalse(chrome(null, "cobblestone", "Cobblestone"));
    }
}
