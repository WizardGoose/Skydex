package com.skydex.render;

import com.skydex.layout.LayoutStore;
import com.skydex.location.LocationTracker;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LayoutOverlayLocationTest {

    @Test
    @DisplayName("the world helper runs on a Garden plot")
    void gardenPlotIsSupported() throws Exception {
        LayoutOverlayRenderer renderer = rendererAt(List.of("The Garden", "Plot - 3"));

        assertTrue(renderer.isInGarden());
    }

    @Test
    @DisplayName("a private island is not mistaken for the Garden")
    void privateIslandIsNotSupported() throws Exception {
        LayoutOverlayRenderer renderer = rendererAt(List.of("Your Island"));

        assertFalse(renderer.isInGarden());
    }

    private static LayoutOverlayRenderer rendererAt(List<String> sidebar) throws Exception {
        LocationTracker location = new LocationTracker();
        set(location, "onSkyBlock", true);
        set(location, "sidebar", sidebar);
        return new LayoutOverlayRenderer(new LayoutStore(Path.of("unused.json")), location);
    }

    private static void set(LocationTracker location, String name, Object value) throws Exception {
        Field field = LocationTracker.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(location, value);
    }
}
