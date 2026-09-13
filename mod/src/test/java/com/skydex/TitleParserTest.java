package com.skydex;

import com.skydex.capture.ScreenKind;
import com.skydex.capture.TitleParser;
import com.skydex.location.GameModes;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Hypixel screens are only identifiable by title text, so this is the guessiest
 * logic in the mod and the most worth pinning down.
 */
class TitleParserTest {

    @Test
    @DisplayName("sack screens are recognised")
    void classifiesSacks() {
        assertEquals(ScreenKind.SACK, TitleParser.classify("Farming Sack"));
        assertEquals(ScreenKind.SACK, TitleParser.classify("Mining Sack"));
        assertEquals(ScreenKind.SACK, TitleParser.classify("Gemstones Sack"));
        assertEquals(ScreenKind.SACK, TitleParser.classify("Sack of Sacks"));
    }

    @Test
    @DisplayName("ender chest pages are recognised")
    void classifiesEnderChest() {
        assertEquals(ScreenKind.ENDER_CHEST, TitleParser.classify("Ender Chest (1/9)"));
        assertEquals(ScreenKind.ENDER_CHEST, TitleParser.classify("Ender Chest"));
    }

    @Test
    @DisplayName("storage and backpacks are recognised")
    void classifiesStorage() {
        assertEquals(ScreenKind.STORAGE, TitleParser.classify("Storage"));
        assertEquals(ScreenKind.STORAGE, TitleParser.classify("Large Backpack (Slot #3)"));
        assertEquals(ScreenKind.STORAGE, TitleParser.classify("Jumbo Backpack"));
    }

    @Test
    @DisplayName("a plain chest falls through to OTHER so the block-position path can claim it")
    void classifiesChestAsOther() {
        assertEquals(ScreenKind.OTHER, TitleParser.classify("Chest"));
        assertEquals(ScreenKind.OTHER, TitleParser.classify("Large Chest"));
        assertEquals(ScreenKind.OTHER, TitleParser.classify("Bazaar"));
        assertEquals(ScreenKind.OTHER, TitleParser.classify(""));
        assertEquals(ScreenKind.OTHER, TitleParser.classify(null));
    }

    @Test
    @DisplayName("page number is taken from an (n/m) suffix")
    void parsesPages() {
        assertEquals("3", TitleParser.pageOf("Ender Chest (3/9)"));
        assertEquals("1", TitleParser.pageOf("Ender Chest (1/9)"));
        assertEquals("12", TitleParser.pageOf("Storage (12/18)"));
    }

    @Test
    @DisplayName("pageless titles key by title so two backpacks stay separate")
    void pagelessTitlesKeyByTitle() {
        assertEquals("Jumbo Backpack", TitleParser.pageOf("Jumbo Backpack"));
        assertEquals("Large Backpack", TitleParser.pageOf("  Large Backpack  "));
        assertEquals("1", TitleParser.pageOf(""));
        assertEquals("1", TitleParser.pageOf(null));
    }

    @Test
    @DisplayName("gamemode comes from the profile glyph")
    void detectsGameMode() {
        assertEquals("ironman", GameModes.of("Strawberry ♲"));
        assertEquals("bingo", GameModes.of("Mango Ⓑ"));
        assertEquals("stranded", GameModes.of("Papaya ☀"));
        assertEquals("normal", GameModes.of("Strawberry"));
        assertNull(GameModes.of(""));
        assertNull(GameModes.of(null));
    }

    @Test
    @DisplayName("glyphs are stripped from the stored profile name")
    void stripsGameModeIcons() {
        assertEquals("Strawberry", GameModes.stripIcons("Strawberry ♲"));
        assertEquals("Mango", GameModes.stripIcons("Mango Ⓑ"));
        assertEquals("Strawberry", GameModes.stripIcons("Strawberry"));
        assertNull(GameModes.stripIcons(null));
    }
}
