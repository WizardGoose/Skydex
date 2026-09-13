package com.skydex;

import com.mojang.blaze3d.font.TrueTypeGlyphProvider;
import com.mojang.blaze3d.font.UnbakedGlyph;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.skydex.gui.SkydexFonts;
import net.minecraft.client.gui.font.providers.FreeTypeUtil;
import net.minecraft.network.chat.FontDescription;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.lwjgl.PointerBuffer;
import org.lwjgl.system.MemoryStack;
import org.lwjgl.system.MemoryUtil;
import org.lwjgl.util.freetype.FT_Face;
import org.lwjgl.util.freetype.FreeType;

import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.reflect.Field;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SkydexFontAssetsTest {

    private static final int OVERSAMPLE = 4;

    @Test
    @DisplayName("Skydex uses native TrueType faces with Minecraft weight compensation")
    void fontDefinitionsUseNativeTrueTypeFaces() throws Exception {
        // Minecraft's small FreeType rasterization is visibly lighter than Chromium's. The
        // Montserrat roles therefore use the next static weight while preserving the accepted
        // CSS size and geometry. This is a renderer compensation, not a type-system change.
        verifyDefinition("montserrat_ui", "montserrat_600.ttf", 14.0f, 600, 5.0f);
        verifyDefinition("montserrat_body", "montserrat_600.ttf", 12.0f, 600, 5.0f);
        verifyDefinition("montserrat_control", "montserrat_600.ttf", 12.0f, 600, 5.0f);
        verifyDefinition("montserrat_input", "montserrat_500.ttf", 12.0f, 500, 5.0f);
        verifyDefinition("montserrat_legend", "montserrat_500.ttf", 10.0f, 500, 3.0f);
        verifyDefinition("montserrat_menu", "montserrat_500.ttf", 11.0f, 500, 5.0f);
        verifyDefinition("montserrat_micro", "montserrat_600.ttf", 10.0f, 600, 3.0f);
        verifyDefinition("montserrat_lead", "montserrat_600.ttf", 17.0f, 600, 5.0f);
        verifyDefinition("montserrat_meta", "montserrat_500.ttf", 11.0f, 500, 5.0f);
        verifyDefinition("montserrat_meta_strong", "montserrat_600.ttf", 11.0f, 600, 5.0f);
        verifyDefinition("montserrat_drawer", "montserrat_600.ttf", 13.0f, 600, 5.0f);
        verifyDefinition("space_grotesk_version", "space_grotesk_500.ttf", 12.0f, 500, 5.0f);
        verifyDefinition("space_grotesk_meta", "space_grotesk_400.ttf", 11.0f, 400, 5.0f);
        verifyDefinition("space_grotesk_meta_strong", "space_grotesk_500.ttf", 11.0f, 500, 5.0f);
        verifyDefinition("space_grotesk_micro", "space_grotesk_500.ttf", 10.0f, 500, 3.0f);

        assertNull(resource("/assets/skydex/textures/font/space_grotesk.png"),
                "the clipped bitmap atlas must not return");
        assertNull(resource("/assets/skydex/textures/font/montserrat.png"),
                "the clipped bitmap atlas must not return");
    }

    @Test
    @DisplayName("whole production labels keep their real width and descenders")
    void productionLabelsRenderAsWholeText() throws Exception {
        Font ui = loadFont("montserrat_500.ttf").deriveFont(10.5f * OVERSAMPLE);
        String labels = "Paste a Skydex Greenhouse share code or link"
                + " No layout loaded Placement helper Included data Copy export code"
                + " Wizard's Waterworks WAITING Open presets Close presets ×…";
        assertEquals(-1, ui.canDisplayUpTo(labels), "every production label glyph is present");

        BufferedImage image = new BufferedImage(1024, 128, BufferedImage.TYPE_INT_ARGB);
        Graphics2D graphics = image.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING,
                    RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            graphics.setColor(Color.WHITE);
            graphics.setFont(ui);

            FontMetrics metrics = graphics.getFontMetrics();
            float promptWidth = metrics.stringWidth(
                    "Paste a Skydex Greenhouse share code or link") / (float) OVERSAMPLE;
            assertTrue(promptWidth >= 244.0f && promptWidth <= 247.0f,
                    "the full prompt must use Montserrat's natural advance, not atlas tracking: "
                            + promptWidth);

            int baseline = 56;
            graphics.drawString("Copy gypq", 4, baseline);
            assertTrue(hasInkBelow(image, baseline),
                    "g, y, p and q must retain their descenders instead of becoming other letters");
        } finally {
            graphics.dispose();
        }

    }

    @Test
    @DisplayName("Minecraft's font provider keeps complete-label advances and descenders")
    void minecraftProviderRendersCompleteLabels() throws Exception {
        try (TrueTypeGlyphProvider ui = minecraftFont("montserrat_500.ttf", 10.5f)) {
            float promptWidth = advance(ui, "Paste a Skydex Greenhouse share code or link");
            assertTrue(promptWidth >= 244.0f && promptWidth <= 247.0f,
                    "Minecraft must retain the natural full-label width: " + promptWidth);

            UnbakedGlyph y = ui.getGlyph('y');
            assertNotNull(y);
            Field height = y.getClass().getDeclaredField("height");
            Field bearingY = y.getClass().getDeclaredField("bearingY");
            height.setAccessible(true);
            bearingY.setAccessible(true);
            assertTrue(height.getInt(y) / (float) OVERSAMPLE > bearingY.getFloat(y),
                    "Minecraft's rasterized y must extend below its baseline");
        }

    }

    @Test
    @DisplayName("every rendered text component explicitly selects a Skydex face")
    void componentsSelectThePackagedFaces() {
        assertEquals(
                new FontDescription.Resource(Identifier.fromNamespaceAndPath(
                        SkydexMod.MOD_ID, "montserrat_ui")),
                SkydexFonts.ui("Interface").getStyle().getFont());
        assertEquals(
                new FontDescription.Resource(Identifier.fromNamespaceAndPath(
                        SkydexMod.MOD_ID, "montserrat_body")),
                SkydexFonts.body("Interface").getStyle().getFont());
        assertEquals(
                new FontDescription.Resource(Identifier.fromNamespaceAndPath(
                        SkydexMod.MOD_ID, "montserrat_control")),
                SkydexFonts.control("Interface").getStyle().getFont());
        assertEquals(
                new FontDescription.Resource(Identifier.fromNamespaceAndPath(
                        SkydexMod.MOD_ID, "montserrat_input")),
                SkydexFonts.input("Interface").getStyle().getFont());
        assertEquals(
                new FontDescription.Resource(Identifier.fromNamespaceAndPath(
                        SkydexMod.MOD_ID, "montserrat_legend")),
                SkydexFonts.legend("Interface").getStyle().getFont());
        assertEquals(
                new FontDescription.Resource(Identifier.fromNamespaceAndPath(
                        SkydexMod.MOD_ID, "montserrat_menu")),
                SkydexFonts.menu("Interface").getStyle().getFont());
        assertEquals(
                new FontDescription.Resource(Identifier.fromNamespaceAndPath(
                        SkydexMod.MOD_ID, "montserrat_micro")),
                SkydexFonts.micro("Interface").getStyle().getFont());
        assertEquals(
                new FontDescription.Resource(Identifier.fromNamespaceAndPath(
                        SkydexMod.MOD_ID, "montserrat_lead")),
                SkydexFonts.lead("Interface").getStyle().getFont());
        assertEquals(
                new FontDescription.Resource(Identifier.fromNamespaceAndPath(
                        SkydexMod.MOD_ID, "space_grotesk_version")),
                SkydexFonts.space("Interface").getStyle().getFont());
    }

    private static void verifyDefinition(
            String id, String fileName, float expectedSize, int expectedWeight,
            float expectedVerticalShift) throws Exception {
        String definitionPath = "/assets/skydex/font/" + id + ".json";
        try (InputStream stream = resource(definitionPath)) {
            assertNotNull(stream, definitionPath);
            JsonObject root = JsonParser.parseReader(
                    new InputStreamReader(stream, StandardCharsets.UTF_8)).getAsJsonObject();
            JsonArray providers = root.getAsJsonArray("providers");
            assertEquals(2, providers.size());

            JsonObject nativeFace = providers.get(0).getAsJsonObject();
            assertEquals("ttf", nativeFace.get("type").getAsString());
            String file = nativeFace.get("file").getAsString();
            assertEquals("skydex:" + fileName, file);
            assertEquals(expectedSize, nativeFace.get("size").getAsFloat());
            assertEquals((float) OVERSAMPLE, nativeFace.get("oversample").getAsFloat());
            JsonArray shift = nativeFace.getAsJsonArray("shift");
            assertNotNull(shift, "each role pins the baseline used by the accepted browser frame");
            assertEquals(0.0f, shift.get(0).getAsFloat());
            assertEquals(expectedVerticalShift, shift.get(1).getAsFloat());
            assertFalse(providers.asList().stream()
                    .map(element -> element.getAsJsonObject().get("type").getAsString())
                    .anyMatch("bitmap"::equals), "a bitmap provider recreates the spacing bug");
            assertEquals("reference", providers.get(1).getAsJsonObject().get("type").getAsString());

            String[] identifier = file.split(":", 2);
            assertNotNull(resource("/assets/" + identifier[0] + "/font/" + identifier[1]),
                    "Minecraft prefixes TrueType locations with font/, so the declared face must"
                            + " resolve inside the resource pack");
        }

        byte[] bytes;
        try (InputStream stream = resource("/assets/skydex/font/" + fileName)) {
            assertNotNull(stream, fileName);
            bytes = stream.readAllBytes();
        }
        ByteBuffer font = ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN);
        assertEquals(0x00010000, font.getInt(0), "Minecraft only accepts an actual TrueType face");
        assertEquals(expectedWeight, weightClass(font), "the web variable face must be pinned correctly");
        Font.createFont(Font.TRUETYPE_FONT, new ByteArrayInputStream(bytes));
    }

    private static Font loadFont(String fileName) throws Exception {
        try (InputStream stream = resource("/assets/skydex/font/" + fileName)) {
            assertNotNull(stream, fileName);
            return Font.createFont(Font.TRUETYPE_FONT, stream);
        }
    }

    private static InputStream resource(String path) {
        return SkydexFontAssetsTest.class.getResourceAsStream(path);
    }

    private static TrueTypeGlyphProvider minecraftFont(String fileName, float size) throws Exception {
        byte[] bytes;
        try (InputStream stream = resource("/assets/skydex/font/" + fileName)) {
            assertNotNull(stream, fileName);
            bytes = stream.readAllBytes();
        }

        ByteBuffer memory = MemoryUtil.memAlloc(bytes.length);
        memory.put(bytes).flip();
        try (MemoryStack stack = MemoryStack.stackPush()) {
            PointerBuffer facePointer = stack.mallocPointer(1);
            FreeTypeUtil.assertError(FreeType.FT_New_Memory_Face(
                    FreeTypeUtil.getLibrary(), memory, 0, facePointer), "Loading test font");
            FT_Face face = FT_Face.create(facePointer.get(0));
            FreeTypeUtil.assertError(FreeType.FT_Select_Charmap(
                    face, FreeType.FT_ENCODING_UNICODE), "Selecting test charmap");
            return new TrueTypeGlyphProvider(memory, face, size, OVERSAMPLE, 0.0f, 0.0f, "");
        } catch (Throwable failure) {
            MemoryUtil.memFree(memory);
            throw failure;
        }
    }

    private static float advance(TrueTypeGlyphProvider provider, String value) {
        return (float) value.codePoints()
                .mapToDouble(codepoint -> {
                    UnbakedGlyph glyph = provider.getGlyph(codepoint);
                    assertNotNull(glyph, "missing glyph U+" + Integer.toHexString(codepoint));
                    return glyph.info().getAdvance();
                })
                .sum();
    }

    private static int weightClass(ByteBuffer font) {
        int tableCount = Short.toUnsignedInt(font.getShort(4));
        for (int table = 0; table < tableCount; table++) {
            int record = 12 + table * 16;
            if (font.getInt(record) == 0x4F532F32) { // OS/2
                int offset = font.getInt(record + 8);
                return Short.toUnsignedInt(font.getShort(offset + 4));
            }
        }
        throw new AssertionError("TrueType face has no OS/2 table");
    }

    private static boolean hasInkBelow(BufferedImage image, int baseline) {
        for (int y = baseline + 1; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                if (((image.getRGB(x, y) >>> 24) & 0xFF) != 0) {
                    return true;
                }
            }
        }
        return false;
    }
}
