package com.skydex;

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

class SkydexWordmarkAssetTest {

    @Test
    @DisplayName("the GUI packages the canonical transparent Skydex wordmark artwork")
    void canonicalWordmarkIsACompleteImage() throws IOException {
        BufferedImage image;
        try (InputStream stream = getClass().getResourceAsStream(
                "/assets/skydex/gui/skydex_wordmark.png")) {
            assertNotNull(stream, "the wordmark must ship with the mod");
            image = ImageIO.read(stream);
        }

        assertEquals(300, image.getWidth());
        assertEquals(56, image.getHeight());
        assertEquals(0, alpha(image.getRGB(0, 0)));
        assertEquals(0, alpha(image.getRGB(image.getWidth() - 1, image.getHeight() - 1)));

        int white = 0;
        int blue = 0;
        int transparent = 0;
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                int pixel = image.getRGB(x, y);
                if (pixel == 0xFFE8EDF3) {
                    white++;
                } else if (pixel == 0xFF38BDF2) {
                    blue++;
                }
                if (alpha(pixel) == 0) {
                    transparent++;
                }
            }
        }

        assertTrue(white > 2_000, "the slate half of the canonical seam is missing");
        assertTrue(blue > 2_000, "the Skydex-blue half of the canonical seam is missing");
        assertTrue(transparent > image.getWidth() * image.getHeight() / 2,
                "the wordmark must not bring a banner or box with it");
    }

    @Test
    @DisplayName("the canonical wordmark is sampled smoothly without wrapping its transparent edge")
    void canonicalWordmarkUsesSmoothClampedSampling() throws IOException {
        try (InputStream stream = getClass().getResourceAsStream(
                "/assets/skydex/gui/skydex_wordmark.png.mcmeta")) {
            assertNotNull(stream, "the wordmark must declare its non-pixel-art sampler");
            JsonObject texture = JsonParser.parseReader(
                    new InputStreamReader(stream, StandardCharsets.UTF_8))
                    .getAsJsonObject().getAsJsonObject("texture");
            assertTrue(texture.get("blur").getAsBoolean());
            assertTrue(texture.get("clamp").getAsBoolean());
        }
    }

    private static int alpha(int argb) {
        return argb >>> 24;
    }
}
