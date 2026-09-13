package com.skydex.gui;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.function.ToIntFunction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SkydexEditBoxGeometryTest {

    private static final ToIntFunction<String> FOUR_PIXELS_PER_CHARACTER = value -> value.length() * 4;

    @Test
    @DisplayName("a long share URL is clipped as one measured run with its cursor visible")
    void longShareUrlKeepsCursorInsideTheField() {
        String url = "skydex.ca/greenhouse/share/KzOqMVI1MgjOT0-vrDHRya4x";
        SkydexEditBox.TextWindow window = SkydexEditBox.textWindow(
                url, url.length(), 0, 80, FOUR_PIXELS_PER_CHARACTER);

        assertTrue(window.start() > 0);
        assertEquals(url.length(), window.end());
        assertTrue(FOUR_PIXELS_PER_CHARACTER.applyAsInt(
                url.substring(window.start(), window.end())) <= 80);
    }

    @Test
    @DisplayName("the input baseline is vertically centred in its visible box")
    void inputTextIsVerticallyCentred() {
        int top = SkydexEditBox.centeredTextY(100, SettingsLayout.SHARE_H);
        assertEquals((SettingsLayout.SHARE_H - SkydexEditBox.TEXT_HEIGHT) / 2, top - 100);
    }

    @Test
    @DisplayName("click positions use the same measured run as the rendered URL")
    void clickUsesRenderedFontGeometry() {
        String value = "skydex.ca/share";
        SkydexEditBox.TextWindow window = new SkydexEditBox.TextWindow(0, value.length());
        assertEquals(2, SkydexEditBox.hitIndex(value, window, 9, FOUR_PIXELS_PER_CHARACTER));
        assertEquals(value.length(), SkydexEditBox.hitIndex(
                value, window, 999, FOUR_PIXELS_PER_CHARACTER));
    }
}
