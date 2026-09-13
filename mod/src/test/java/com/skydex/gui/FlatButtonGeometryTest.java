package com.skydex.gui;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FlatButtonGeometryTest {

    @Test
    @DisplayName("the preset handle uses supersampled mirrored image assets")
    void presetChevronAssetsAreMirroredAndVisible() throws IOException {
        BufferedImage right = image("preset_chevron_right.png");
        BufferedImage left = image("preset_chevron_left.png");

        assertEquals(28, right.getWidth());
        assertEquals(52, right.getHeight());
        assertEquals(right.getWidth(), left.getWidth());
        assertEquals(right.getHeight(), left.getHeight());

        int visible = 0;
        int antialiased = 0;
        for (int y = 0; y < right.getHeight(); y++) {
            for (int x = 0; x < right.getWidth(); x++) {
                int rightAlpha = right.getRGB(x, y) >>> 24;
                int leftAlpha = left.getRGB(right.getWidth() - 1 - x, y) >>> 24;
                assertTrue(Math.abs(rightAlpha - leftAlpha) <= 12,
                        "open and closed icons must share the same visual centre");
                if (rightAlpha > 24) {
                    visible++;
                }
                if (rightAlpha > 0 && rightAlpha < 210) {
                    antialiased++;
                }
            }
        }
        assertTrue(visible >= 150, "the icon must be a continuous mark, not isolated staircase dots");
        assertTrue(antialiased >= 20, "the source must retain antialiased edge coverage");
    }

    @Test
    @DisplayName("the hover chevron is brighter without changing its box")
    void presetChevronHoverKeepsTheSameBounds() throws IOException {
        BufferedImage normal = image("preset_chevron_right.png");
        BufferedImage hover = image("preset_chevron_right_hover.png");

        assertEquals(normal.getWidth(), hover.getWidth());
        assertEquals(normal.getHeight(), hover.getHeight());
        assertTrue(alphaSum(hover) > alphaSum(normal));
    }

    @Test
    @DisplayName("every preset chevron uses smooth clamped downsampling")
    void presetChevronsUseSmoothSampling() throws IOException {
        for (String name : new String[]{
                "preset_chevron_right.png", "preset_chevron_left.png",
                "preset_chevron_right_hover.png", "preset_chevron_left_hover.png"}) {
            try (InputStream stream = FlatButtonGeometryTest.class.getResourceAsStream(
                    "/assets/skydex/gui/" + name + ".mcmeta")) {
                assertNotNull(stream, name + " sampler metadata");
                JsonObject texture = JsonParser.parseReader(
                        new InputStreamReader(stream, StandardCharsets.UTF_8))
                        .getAsJsonObject().getAsJsonObject("texture");
                assertTrue(texture.get("blur").getAsBoolean());
                assertTrue(texture.get("clamp").getAsBoolean());
            }
        }
    }

    private static BufferedImage image(String name) throws IOException {
        try (InputStream stream = FlatButtonGeometryTest.class.getResourceAsStream(
                "/assets/skydex/gui/" + name)) {
            assertNotNull(stream, name);
            return ImageIO.read(stream);
        }
    }

    private static long alphaSum(BufferedImage image) {
        long total = 0;
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                total += image.getRGB(x, y) >>> 24;
            }
        }
        return total;
    }
}
