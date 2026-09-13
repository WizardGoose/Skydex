package com.skydex;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.skydex.garden.GreenhouseCatalog;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GreenhouseCatalogTest {

    @Test
    @DisplayName("the mod packages the same plant names, grounds and image ids as the site")
    void readsPackagedSiteCatalogue() {
        assertEquals("blastberry", com.skydex.garden.PlantIdentity.known("blastberry3"));
        assertEquals("startlevine", com.skydex.garden.PlantIdentity.known("startlevine0"));
        org.junit.jupiter.api.Assertions.assertNull(com.skydex.garden.PlantIdentity.known("blastberryRoots3"));
        org.junit.jupiter.api.Assertions.assertNull(com.skydex.garden.PlantIdentity.known("unrelated3"));
        assertEquals(1, GreenhouseCatalog.size("Choconut"));
        assertEquals(2, GreenhouseCatalog.size("Plantboy"));
        assertEquals(3, GreenhouseCatalog.size("Godseed"));
        assertEquals(1, GreenhouseCatalog.size(null));
        assertEquals("Potato", GreenhouseCatalog.displayName("POTATOES"));
        assertEquals("potato", GreenhouseCatalog.textureId("POTATOES"));
        assertEquals("Cocoa Beans", GreenhouseCatalog.displayName("COCOA"));
        assertEquals("cocoa_beans",GreenhouseCatalog.canonicalId("coco"));
        assertEquals("plantboy_advance",GreenhouseCatalog.canonicalId("Plantboy"));
        assertEquals("jerryflower",GreenhouseCatalog.canonicalId("jerryseed"));
        assertEquals("sand", GreenhouseCatalog.ground("cactus"));
        assertEquals("farmland", GreenhouseCatalog.ground("SOGGYBUD"));
        assertNotNull(GreenhouseCatalog.textureId("do_not_eat_shroom"));
        assertEquals(2, GreenhouseCatalog.requirements("Soggybud").size());
        assertEquals(new GreenhouseCatalog.Requirement("melon", 2),
                GreenhouseCatalog.requirements("Soggybud").get(0));
        assertEquals(new GreenhouseCatalog.Requirement("gloomgourd", 2),
                GreenhouseCatalog.requirements("Soggybud").get(1));
    }

    @Test
    @DisplayName("every catalogued plant and ground has its genuine packaged image")
    void packagesEveryCatalogueImage() throws Exception {
        JsonObject root;
        try (InputStream stream = GreenhouseCatalogTest.class.getResourceAsStream(
                "/assets/skydex/greenhouse/data.json")) {
            assertNotNull(stream);
            root = JsonParser.parseReader(
                    new InputStreamReader(stream, StandardCharsets.UTF_8)).getAsJsonObject();
        }

        Set<String> grounds = new LinkedHashSet<>();
        int plants = 0;
        for (String group : new String[]{"crops", "mutations"}) {
            for (var entry : root.getAsJsonObject(group).entrySet()) {
                JsonObject value = entry.getValue().getAsJsonObject();
                assertImage("/assets/skydex/greenhouse/crops/" + entry.getKey() + ".png");
                grounds.add(value.get("ground").getAsString());
                plants++;
            }
        }
        assertTrue(plants > 0, "the Greenhouse catalogue must not be empty");
        for (String ground : grounds) {
            assertImage("/assets/skydex/greenhouse/ground/" + ground + ".png");
        }
    }

    private static void assertImage(String path) throws Exception {
        try (InputStream stream = GreenhouseCatalogTest.class.getResourceAsStream(path)) {
            assertNotNull(stream, path);
            assertNotNull(ImageIO.read(stream), path);
        }
    }
}
