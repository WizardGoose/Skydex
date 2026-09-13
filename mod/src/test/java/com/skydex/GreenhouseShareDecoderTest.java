package com.skydex;

import com.skydex.layout.GreenhouseLayout;
import com.skydex.layout.GreenhouseShareDecoder;
import com.skydex.layout.LayoutCell;
import com.skydex.layout.LayoutFormatException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GreenhouseShareDecoderTest {

    private static final String CURRENT = "KzOqMVI1MgjOT0-vrDHRya4xNKnRIx4kOSZisIgCAA";

    @Test
    @DisplayName("the current website fixture decodes byte-for-byte into the same layout")
    void decodesCurrentSiteFixture() {
        GreenhouseLayout layout = GreenhouseShareDecoder.decode(CURRENT);
        assertEquals("2 Soggy", layout.label());
        assertEquals(10, layout.width());
        assertEquals(10, layout.height());
        assertEquals(6, layout.cellCount());

        Map<String, LayoutCell> cells = layout.cells().stream()
                .collect(Collectors.toMap(LayoutCell::key, Function.identity()));
        assertEquals("Melon", cells.get("5,4").crop());
        assertEquals("Melon", cells.get("5,5").crop());
        assertEquals("Gloomgourd", cells.get("3,4").mutation());
        assertEquals("Gloomgourd", cells.get("3,5").mutation());
        assertEquals("Soggybud", cells.get("4,4").mutation());
        assertEquals("Soggybud", cells.get("4,5").mutation());
        assertTrue(cells.values().stream().allMatch(c -> "farmland".equals(c.ground())));
    }

    @Test
    @DisplayName("a canonical skydex.ca link and a bare code are the same import")
    void extractsCanonicalLink() {
        GreenhouseLayout bare = GreenhouseShareDecoder.decode(CURRENT);
        GreenhouseLayout link = GreenhouseShareDecoder.decode(
                "https://skydex.ca/greenhouse/share/" + CURRENT + "?from=discord");
        assertEquals(bare.toJson(), link.toJson());
    }

    @Test
    @DisplayName("legacy and unrelated URLs are not mistaken for current share codes")
    void rejectsOtherUrlShapes() {
        LayoutFormatException error = assertThrows(LayoutFormatException.class,
                () -> GreenhouseShareDecoder.decode(
                        "https://api.skyshards.com/share/" + CURRENT));
        assertTrue(error.getMessage().contains("current"), error.getMessage());
    }

    @Test
    @DisplayName("damaged base64 is refused without half-loading a layout")
    void rejectsDamagedCode() {
        LayoutFormatException error = assertThrows(LayoutFormatException.class,
                () -> GreenhouseShareDecoder.decode(CURRENT.substring(0, 20) + "!"));
        assertFalse(error.getMessage().isBlank());
    }
}
