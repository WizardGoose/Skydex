package com.skydex;

import com.skydex.data.ItemEntry;
import com.skydex.data.ItemExtra;
import com.skydex.data.ItemNames;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@code extra} is what turns "Enchanted Book x51" into something a tooltip can
 * actually say. Every book shares one id, so the enchantment is the only thing
 * distinguishing them.
 */
class ItemExtraTest {

    private static Map<String, Integer> ench(String id, int level) {
        Map<String, Integer> m = new LinkedHashMap<>();
        m.put(id, level);
        return m;
    }

    @Test
    @DisplayName("an enchanted book carries its enchantment, keeping the shared id")
    void bookCarriesEnchantment() {
        ItemEntry book = new ItemEntry("ENCHANTED_BOOK", "Enchanted Book", 1,
                new ItemExtra(null, 0, ench("BIG_BRAIN", 3), false));

        assertEquals("{\"id\":\"ENCHANTED_BOOK\",\"count\":1,\"extra\":{\"ench\":{\"BIG_BRAIN\":3}}}",
                book.toJson().toString());
        // The id must NOT be mangled to encode the enchant.
        assertEquals("ENCHANTED_BOOK", book.id());
        assertEquals(book, ItemEntry.fromJson(book.toJson()));
    }

    @Test
    @DisplayName("all four fields serialise together in spec order")
    void allFieldsTogether() {
        ItemEntry item = new ItemEntry("HYPERION", "Heroic Hyperion", 1,
                new ItemExtra("Heroic", 5, ench("ULTIMATE_WISE", 5), true));

        assertEquals("{\"id\":\"HYPERION\",\"count\":1,"
                        + "\"extra\":{\"reforge\":\"Heroic\",\"stars\":5,"
                        + "\"ench\":{\"ULTIMATE_WISE\":5},\"recomb\":true}}",
                item.toJson().toString());
        assertEquals(item, ItemEntry.fromJson(item.toJson()));
    }

    @Test
    @DisplayName("an empty extra is omitted entirely")
    void emptyExtraOmitted() {
        assertTrue(ItemExtra.EMPTY.isEmpty());
        assertNull(ItemExtra.EMPTY.toJson());

        String json = new ItemEntry("ENCHANTED_BREAD", "Enchanted Bread", 64).toJson().toString();
        assertEquals("{\"id\":\"ENCHANTED_BREAD\",\"count\":64}", json);
        assertFalse(json.contains("extra"));
    }

    @Test
    @DisplayName("individually absent or zero fields are dropped")
    void dropsAbsentFields() {
        assertEquals("{\"stars\":3}", new ItemExtra(null, 3, Map.of(), false).toJson().toString());
        assertEquals("{\"recomb\":true}", new ItemExtra("", 0, Map.of(), true).toJson().toString());
        assertEquals("{\"reforge\":\"Rapid\"}",
                new ItemExtra("Rapid", 0, null, false).toJson().toString());
        // Zero and negative stars are absent, not "0".
        assertTrue(new ItemExtra(null, 0, Map.of(), false).isEmpty());
        assertTrue(new ItemExtra(null, -2, Map.of(), false).isEmpty());
    }

    @Test
    @DisplayName("a level-zero enchantment is not shipped")
    void dropsZeroLevelEnchantments() {
        assertTrue(new ItemExtra(null, 0, ench("SHARPNESS", 0), false).isEmpty());
    }

    // ------------------------------------------------- name / reforge interaction

    @Test
    @DisplayName("a reforged name is omitted, because reforge + id rebuilds it exactly")
    void omitsReconstructableReforgedName() {
        ItemEntry bow = new ItemEntry("JUJU_SHORTBOW", "Rapid Juju Shortbow", 1,
                new ItemExtra("Rapid", 0, Map.of(), false));

        String json = bow.toJson().toString();
        assertEquals("{\"id\":\"JUJU_SHORTBOW\",\"count\":1,\"extra\":{\"reforge\":\"Rapid\"}}", json);
        // Lossless: the name comes back identical.
        assertEquals("Rapid Juju Shortbow", ItemEntry.fromJson(bow.toJson()).name());
        assertEquals(bow, ItemEntry.fromJson(bow.toJson()));
    }

    @Test
    @DisplayName("a name that is more than reforge + id is still shipped")
    void keepsNamesThatDiffer() {
        // Stars in the display name are not reconstructable from reforge alone.
        ItemEntry starred = new ItemEntry("JUJU_SHORTBOW", "Rapid Juju Shortbow ✪✪✪", 1,
                new ItemExtra("Rapid", 3, Map.of(), false));
        assertTrue(starred.toJson().toString().contains("\"name\":\"Rapid Juju Shortbow ✪✪✪\""));
        assertEquals(starred, ItemEntry.fromJson(starred.toJson()));

        // Small-word casing still differs.
        ItemEntry aote = new ItemEntry("ASPECT_OF_THE_END", "Aspect of the End", 1);
        assertTrue(aote.toJson().toString().contains("\"name\":\"Aspect of the End\""));

        // A renamed item keeps its name even with a reforge present.
        ItemEntry renamed = new ItemEntry("JUJU_SHORTBOW", "My Bow", 1,
                new ItemExtra("Rapid", 0, Map.of(), false));
        assertTrue(renamed.toJson().toString().contains("\"name\":\"My Bow\""));
        assertEquals(renamed, ItemEntry.fromJson(renamed.toJson()));
    }

    @Test
    @DisplayName("the reconstruction rule is exactly 'reforge + space + prettified id'")
    void reconstructionRule() {
        assertEquals("Rapid Juju Shortbow", ItemNames.expected("JUJU_SHORTBOW", "Rapid"));
        assertEquals("Juju Shortbow", ItemNames.expected("JUJU_SHORTBOW", null));
        assertEquals("Juju Shortbow", ItemNames.expected("JUJU_SHORTBOW", "  "));
        assertTrue(ItemNames.isRedundant("JUJU_SHORTBOW", "Rapid Juju Shortbow", "Rapid"));
        assertFalse(ItemNames.isRedundant("JUJU_SHORTBOW", "Rapid Juju Shortbow", null));
    }

    // ------------------------------------------------------------ round trips

    @Test
    @DisplayName("unknown extra fields are ignored rather than fatal")
    void ignoresUnknownExtraFields() {
        ItemEntry parsed = ItemEntry.fromJson(com.google.gson.JsonParser.parseString(
                "{\"id\":\"HYPERION\",\"count\":1,\"extra\":{\"stars\":5,\"somethingNew\":42}}"));
        assertEquals(5, parsed.extra().stars());
        assertEquals("Hyperion", parsed.name());
    }

    @Test
    @DisplayName("a malformed or absent extra reads as empty, not as a crash")
    void toleratesBadExtra() {
        assertTrue(ItemExtra.fromJson(null).isEmpty());
        assertTrue(ItemEntry.fromJson(com.google.gson.JsonParser.parseString(
                "{\"id\":\"X\",\"count\":1,\"extra\":\"nonsense\"}")).extra().isEmpty());
    }

    @Test
    @DisplayName("enchantment order is stable so codes are reproducible")
    void enchantmentOrderIsStable() {
        Map<String, Integer> unordered = new LinkedHashMap<>();
        unordered.put("ZEALOT", 1);
        unordered.put("BIG_BRAIN", 3);
        unordered.put("ANGLER", 2);

        assertEquals("{\"ench\":{\"ANGLER\":2,\"BIG_BRAIN\":3,\"ZEALOT\":1}}",
                new ItemExtra(null, 0, unordered, false).toJson().toString());
    }
}
