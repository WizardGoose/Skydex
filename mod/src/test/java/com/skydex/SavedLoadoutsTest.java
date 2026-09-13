package com.skydex;

import com.skydex.layout.LayoutParser;
import com.skydex.layout.LayoutStore;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.nio.file.Files;
import static org.junit.jupiter.api.Assertions.*;

class SavedLoadoutsTest {
    @TempDir Path dir;
    private static com.skydex.layout.GreenhouseLayout layout(String name,String crop) {
        return LayoutParser.parse("{\"schema\":1,\"label\":\""+name+"\",\"size\":[10,10],\"cells\":[{\"x\":0,\"y\":0,\"crop\":\""+crop+"\"}]}");
    }
    @Test void savedSelectionsSurviveRestartAndSameNameUpdates() throws Exception {
        Path file=dir.resolve("layout.json"); var store=new LayoutStore(file);
        var first=layout("First","Wheat"); var second=layout("Second","Potato");
        store.setLayout(first); store.setLayout(second); store.save();
        var restored=LayoutStore.load(file);
        assertEquals(2,restored.savedLayouts().size());
        assertTrue(restored.selectSaved(LayoutStore.savedId(first)));
        assertEquals("First",restored.label());
        assertFalse(restored.selectSaved("missing"));
        assertEquals("First",restored.label());
        restored.setLayout(layout("First","Melon")); restored.save();
        assertEquals(2,LayoutStore.load(file).savedLayouts().size());
        assertEquals("Melon",LayoutStore.load(file).layout().cells().getFirst().displayName());
    }
    @Test void existingSingleLayoutMigratesWithoutLosingIt() throws Exception {
        Path file=dir.resolve("layout.json");
        Files.writeString(file,"{\"layout\":"+layout("Legacy","Wheat").toJson()+",\"overlayEnabled\":true}");
        var restored=LayoutStore.load(file);
        assertEquals("Legacy",restored.label()); assertEquals(1,restored.savedLayouts().size());
        assertTrue(restored.overlayEnabled());
        assertTrue(restored.showMutations());
    }

    @Test void mutationVisibilityPersistsWithoutChangingThePlanOrHelper() throws Exception {
        Path file=dir.resolve("layout.json"); var store=new LayoutStore(file);
        var plan=LayoutParser.parse("{\"schema\":1,\"label\":\"Mixed\",\"size\":[10,10],\"cells\":[{\"x\":0,\"y\":0,\"crop\":\"Cocoa Beans\"},{\"x\":1,\"y\":0,\"mutation\":\"Choconut\"}]}");
        store.setLayout(plan); store.setOverlayEnabled(true); store.setProjectionEnabled(true);
        store.setShowMutations(false); store.save();
        var restored=LayoutStore.load(file);
        assertFalse(restored.showMutations());
        assertTrue(restored.overlayEnabled()); assertTrue(restored.projectionEnabled());
        assertEquals(2,restored.layout().cellCount());
        assertTrue(restored.showsCell(plan.cells().get(0)));
        assertFalse(restored.showsCell(plan.cells().get(1)));
        restored.setShowMutations(true);
        assertTrue(restored.showsCell(plan.cells().get(1)));
    }
}
