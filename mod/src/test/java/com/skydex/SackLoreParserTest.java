package com.skydex;

import com.skydex.capture.SackLoreParser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.OptionalLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Sack slots clamp their visible stack size to 64, so the lore is the only
 * source of truth for the real amount.
 */
class SackLoreParserTest {

    private static long stored(String line) {
        OptionalLong v = SackLoreParser.parseStoredLine(line);
        assertTrue(v.isPresent(), "expected a stored count in: " + line);
        return v.getAsLong();
    }

    @Test
    @DisplayName("parses a coloured Stored line with a max")
    void parsesColouredLine() {
        assertEquals(12345L, stored("§7Stored: §e12,345§7/§a20,000"));
    }

    @Test
    @DisplayName("parses a plain Stored line")
    void parsesPlainLine() {
        assertEquals(12345L, stored("Stored: 12,345/20,000"));
    }

    @Test
    @DisplayName("parses an abbreviated amount")
    void parsesAbbreviated() {
        assertEquals(1_200_000L, stored("§7Stored: §e1.2M§7/§a20M"));
        assertEquals(64_000L, stored("§7Stored: §e64k§7/§a20M"));
        assertEquals(2_000_000_000L, stored("Stored: 2B/4B"));
    }

    @Test
    @DisplayName("parses a bare amount with no max")
    void parsesNoMax() {
        assertEquals(640L, stored("§7Stored: §e640"));
    }

    @Test
    @DisplayName("zero is a real value, not a parse failure")
    void parsesZero() {
        assertEquals(0L, stored("§7Stored: §e0§7/§a20,000"));
    }

    @Test
    @DisplayName("non-stored lore lines are ignored")
    void ignoresOtherLines() {
        assertFalse(SackLoreParser.parseStoredLine("§7Right-click to open!").isPresent());
        assertFalse(SackLoreParser.parseStoredLine("§eClick to view").isPresent());
        assertFalse(SackLoreParser.parseStoredLine("").isPresent());
        assertFalse(SackLoreParser.parseStoredLine(null).isPresent());
    }

    @Test
    @DisplayName("finds the Stored line inside a full lore block")
    void scansLoreBlock() {
        List<String> lore = List.of(
                "§7Sack of the farm",
                "",
                "§7Stored: §e12,345§7/§a20,000",
                "",
                "§eClick to pick up!");
        assertEquals(12345L, SackLoreParser.parseStored(lore).getAsLong());
    }

    @Test
    @DisplayName("strips legacy colour codes")
    void stripsFormatting() {
        assertEquals("Stored: 12,345/20,000",
                SackLoreParser.stripFormatting("§7Stored: §e12,345§7/§a20,000"));
        assertEquals("Enchanted Brown Mushroom",
                SackLoreParser.stripFormatting("§aEnchanted Brown Mushroom"));
        // Obfuscation/format codes (k-o) and reset (r) must go too.
        assertEquals("hi", SackLoreParser.stripFormatting("§khi§r"));
    }

    @Test
    @DisplayName("the Gemstones sack uses ' Amount:' instead of 'Stored:'")
    void parsesGemstoneAmountLine() {
        List<String> lore = List.of(
                "§8Rough Ruby Gemstone",
                "§7 Amount: §e2,048",
                "§eClick to pick up!");
        assertEquals(2048L, SackLoreParser.parseSackCount(lore).getAsLong());
    }

    @Test
    @DisplayName("sack count prefers Stored: when both lines exist")
    void prefersStoredOverAmount() {
        List<String> lore = List.of("§7Stored: §e12,345§7/§a20,000", "§7 Amount: §e999");
        assertEquals(12345L, SackLoreParser.parseSackCount(lore).getAsLong());
    }

    @Test
    @DisplayName("menu filler with no count line is skipped, which is how glass panes are excluded")
    void skipsFillerItems() {
        assertFalse(SackLoreParser.parseSackCount(List.of("§7Close", "§eClick!")).isPresent());
        assertFalse(SackLoreParser.parseSackCount(List.of()).isPresent());
        assertFalse(SackLoreParser.parseSackCount(null).isPresent());
    }

    /** One Gemstones-sack slot: every cut of one gemstone, under the ROUGH_ id. */
    private static final List<String> GEMSTONE_LORE = List.of(
            "§8Ruby Gemstone",
            "",
            "§7 Rough: §a12,345 §7❤",
            "§7 Flawed: §a1,024 §7❤",
            "§7 Fine: §a64 §7❤",
            "§7 Flawless: §a2 §7❤",
            "",
            "§eClick to pick up!");

    @Test
    @DisplayName("a gemstone slot expands into one entry per cut")
    void expandsGemstoneTiers() {
        Map<String, Long> entries =
                SackLoreParser.parseGemstoneEntries("ROUGH_RUBY_GEM", GEMSTONE_LORE);

        assertEquals(4, entries.size(), entries.toString());
        assertEquals(12345L, entries.get("ROUGH_RUBY_GEM"));
        assertEquals(1024L, entries.get("FLAWED_RUBY_GEM"));
        assertEquals(64L, entries.get("FINE_RUBY_GEM"));
        assertEquals(2L, entries.get("FLAWLESS_RUBY_GEM"));
    }

    @Test
    @DisplayName("Flawless is captured, which SkyOcean's tier list misses")
    void capturesFlawless() {
        assertTrue(SackLoreParser.GEMSTONE_TIERS.contains("FLAWLESS"));
        assertEquals(2L, SackLoreParser.parseGemstoneEntries("ROUGH_RUBY_GEM", GEMSTONE_LORE)
                .get("FLAWLESS_RUBY_GEM"));
    }

    @Test
    @DisplayName("Flawed and Flawless do not match each other")
    void tiersDoNotCrossMatch() {
        Map<String, Long> onlyFlawless = SackLoreParser.parseGemstoneEntries(
                "ROUGH_JADE_GEM", List.of("§7 Flawless: §a7 §7❤"));
        assertEquals(1, onlyFlawless.size(), onlyFlawless.toString());
        assertEquals(7L, onlyFlawless.get("FLAWLESS_JADE_GEM"));

        Map<String, Long> onlyFlawed = SackLoreParser.parseGemstoneEntries(
                "ROUGH_JADE_GEM", List.of("§7 Flawed: §a9 §7❤"));
        assertEquals(1, onlyFlawed.size(), onlyFlawed.toString());
        assertEquals(9L, onlyFlawed.get("FLAWED_JADE_GEM"));
    }

    @Test
    @DisplayName("tiers that are absent are simply not recorded")
    void omitsMissingTiers() {
        Map<String, Long> entries = SackLoreParser.parseGemstoneEntries(
                "ROUGH_AMBER_GEM", List.of("§7 Rough: §a5 §7❤", "§7 Fine: §a1 §7❤"));
        assertEquals(2, entries.size());
        assertTrue(entries.containsKey("ROUGH_AMBER_GEM"));
        assertTrue(entries.containsKey("FINE_AMBER_GEM"));
        assertFalse(entries.containsKey("FLAWED_AMBER_GEM"));
    }

    @Test
    @DisplayName("gemstone tiers accept abbreviated amounts, which SkyOcean reads as zero")
    void gemstoneAbbreviations() {
        Map<String, Long> entries = SackLoreParser.parseGemstoneEntries(
                "ROUGH_SAPPHIRE_GEM", List.of("§7 Rough: §a1.2M §7❤", "§7 Flawed: §a64k §7❤"));
        assertEquals(1_200_000L, entries.get("ROUGH_SAPPHIRE_GEM"));
        assertEquals(64_000L, entries.get("FLAWED_SAPPHIRE_GEM"));
    }

    @Test
    @DisplayName("a non-gemstone slot expands to nothing")
    void ignoresNonGemstones() {
        assertTrue(SackLoreParser.parseGemstoneEntries("ENCHANTED_BREAD",
                List.of("§7Stored: §e12,345§7/§a20,000")).isEmpty());
        assertTrue(SackLoreParser.parseGemstoneEntries(null, GEMSTONE_LORE).isEmpty());
        assertTrue(SackLoreParser.parseGemstoneEntries("ROUGH_RUBY_GEM", null).isEmpty());
        // Rough id but no tier lines: not a gemstone slot after all.
        assertTrue(SackLoreParser.parseGemstoneEntries("ROUGH_RUBY_GEM",
                List.of("§7Some other lore")).isEmpty());
    }

    @Test
    @DisplayName("amount parser handles the shapes Hypixel uses")
    void parsesAmounts() {
        assertEquals(1234L, SackLoreParser.parseAmount("1,234").getAsLong());
        assertEquals(1500L, SackLoreParser.parseAmount("1.5k").getAsLong());
        assertEquals(7L, SackLoreParser.parseAmount("7").getAsLong());
        assertFalse(SackLoreParser.parseAmount("").isPresent());
        assertFalse(SackLoreParser.parseAmount("lots").isPresent());
        assertFalse(SackLoreParser.parseAmount(null).isPresent());
    }
}
