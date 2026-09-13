package com.skydex;

import com.skydex.data.ItemEntry;
import com.skydex.data.ItemNames;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The omit-redundant-name rule only saves bytes safely if this matches the
 * site's {@code prettify} exactly. A mismatch would silently replace a real
 * display name with a differently-cased guess, so the cases below mirror the
 * site's implementation:
 * {@code lowercase -> split on [_\s:]+ -> capitalise each word -> join " "}.
 */
class ItemNamesTest {

    @Test
    @DisplayName("prettify matches the spec example")
    void matchesSpecExample() {
        assertEquals("Enchanted Bread", ItemNames.prettify("ENCHANTED_BREAD"));
        assertEquals("Enchanted Brown Mushroom", ItemNames.prettify("ENCHANTED_BROWN_MUSHROOM"));
        assertEquals("Oak Log", ItemNames.prettify("OAK_LOG"));
    }

    @Test
    @DisplayName("splits on colons and whitespace too, like the site's regex")
    void splitsOnAllSeparators() {
        assertEquals("Minecraft Oak Log", ItemNames.prettify("minecraft:oak_log"));
        assertEquals("Already Spaced", ItemNames.prettify("already spaced"));
        assertEquals("Mixed Up Id", ItemNames.prettify("MIXED_up  id"));
    }

    @Test
    @DisplayName("repeated and edge separators collapse rather than making blank words")
    void collapsesSeparators() {
        assertEquals("A B", ItemNames.prettify("A__B"));
        assertEquals("A B", ItemNames.prettify("_A_B_"));
        assertEquals("Solo", ItemNames.prettify("__solo__"));
        assertEquals("", ItemNames.prettify("___"));
        assertEquals("", ItemNames.prettify(""));
        assertEquals("", ItemNames.prettify(null));
    }

    @Test
    @DisplayName("digits and single letters survive")
    void handlesDigitsAndShortWords() {
        assertEquals("Rune 1", ItemNames.prettify("RUNE_1"));
        assertEquals("A", ItemNames.prettify("a"));
        assertEquals("Tier 3 Sack", ItemNames.prettify("TIER_3_SACK"));
    }

    @Test
    @DisplayName("a name equal to the prettified id is redundant; anything else is not")
    void detectsRedundantNames() {
        assertTrue(ItemNames.isRedundant("OAK_LOG", "Oak Log"));
        assertTrue(ItemNames.isRedundant("OAK_LOG", null));

        // Small-word casing differs, so the real name must be kept.
        assertFalse(ItemNames.isRedundant("ASPECT_OF_THE_END", "Aspect of the End"));
        // Reforges, stars and renames all differ.
        assertFalse(ItemNames.isRedundant("HYPERION", "Heroic Hyperion ✪✪✪✪✪"));
        assertFalse(ItemNames.isRedundant("OAK_LOG", "My Special Log"));
    }

    @Test
    @DisplayName("an omitted name round-trips back to the same entry")
    void omissionIsLossless() {
        ItemEntry plain = new ItemEntry("ENCHANTED_BREAD", "Enchanted Bread", 64);
        String json = plain.toJson().toString();
        assertEquals("{\"id\":\"ENCHANTED_BREAD\",\"count\":64}", json);
        assertEquals(plain, ItemEntry.fromJson(plain.toJson()));

        ItemEntry fancy = new ItemEntry("ASPECT_OF_THE_END", "Aspect of the End", 1);
        assertTrue(fancy.toJson().toString().contains("\"name\":\"Aspect of the End\""));
        assertEquals(fancy, ItemEntry.fromJson(fancy.toJson()));
    }
}
