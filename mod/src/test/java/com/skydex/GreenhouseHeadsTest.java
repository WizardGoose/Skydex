package com.skydex;

import com.google.gson.JsonParser;
import com.skydex.garden.GreenhouseCatalog;
import com.skydex.garden.GreenhouseHeads;
import org.junit.jupiter.api.Test;
import javax.imageio.ImageIO;
import java.io.ByteArrayInputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.HexFormat;
import static org.junit.jupiter.api.Assertions.*;

class GreenhouseHeadsTest {
    @Test void everyCataloguePlantHasExactlyOnePreviewSource() {
        var covered = new HashSet<>(GreenhouseHeads.ids());
        assertTrue(covered.stream().noneMatch(GreenhouseHeads.NATIVE_CROPS::contains));
        covered.addAll(GreenhouseHeads.NATIVE_CROPS);
        assertEquals(GreenhouseCatalog.ids(), covered);
        assertEquals(50, GreenhouseHeads.ids().size());
        assertEquals(GreenhouseHeads.texturePath("Lonelily"), GreenhouseHeads.texturePath("Lonelilly"));
        assertNotNull(GreenhouseHeads.texturePath("Plantboy"));
        assertNull(GreenhouseHeads.texturePath("unknown_future_plant"));
        assertNull(GreenhouseHeads.texturePath(null));
        assertNull(GreenhouseHeads.texturePath("wheat"));
    }

    @Test void everySkinIsAnOriginalMinecraftTextureWithUsableHeadUvs() throws Exception {
        try (var stream = getClass().getResourceAsStream("/assets/skydex/greenhouse/heads.json")) {
            assertNotNull(stream);
            var textures = JsonParser.parseReader(new InputStreamReader(stream, StandardCharsets.UTF_8))
                    .getAsJsonObject().getAsJsonObject("textures");
            for (var entry : textures.entrySet()) {
                try (var skin = getClass().getResourceAsStream("/assets/skydex/" + GreenhouseHeads.texturePath(entry.getKey()))) {
                    assertNotNull(skin, entry.getKey());
                    byte[] bytes = skin.readAllBytes();
                    String actual = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
                    assertEquals(entry.getValue().getAsString().replaceFirst("^0+", ""),
                            actual.replaceFirst("^0+", ""), entry.getKey());
                    var image = ImageIO.read(new ByteArrayInputStream(bytes));
                    assertNotNull(image, entry.getKey());
                    assertEquals(64, image.getWidth(), entry.getKey());
                    assertEquals(64, image.getHeight(), entry.getKey());
                }
            }
        }
    }
}
