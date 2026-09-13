package com.skydex;

import com.skydex.layout.GridOrientation;
import com.skydex.layout.LayoutAnchor;
import com.skydex.layout.LayoutParser;
import com.skydex.layout.LayoutStore;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LayoutStoreTest {

    @Test
    @DisplayName("layout, anchor and overlay state survive a restart")
    void persistsEverything(@TempDir Path dir) throws IOException {
        Path file = dir.resolve("layout.json");
        LayoutStore store = new LayoutStore(file);
        store.setLayout(LayoutParser.parse(LayoutParserTest.SPEC_EXAMPLE));
        store.setAnchor(new LayoutAnchor(12, 70, -34, GridOrientation.R180));
        store.setOverlayEnabled(true);
        store.save();

        LayoutStore reloaded = LayoutStore.load(file);
        assertEquals("Choconut x72", reloaded.label());
        assertEquals(2, reloaded.layout().cellCount());
        assertEquals(10, reloaded.layout().width());

        LayoutAnchor anchor = reloaded.anchor();
        assertNotNull(anchor);
        assertEquals(12, anchor.x());
        assertEquals(70, anchor.y());
        assertEquals(-34, anchor.z());
        assertSame(GridOrientation.R180, anchor.orientation());

        assertTrue(reloaded.overlayEnabled());
        assertTrue(reloaded.isRenderable());
    }

    @Test
    @DisplayName("the overlay starts off")
    void overlayOffByDefault() {
        LayoutStore store = new LayoutStore(Path.of("unused.json"));
        assertFalse(store.overlayEnabled());
        assertFalse(store.hasLayout());
        assertFalse(store.isRenderable());
    }

    @Test
    @DisplayName("toggle flips the overlay and reports the new state")
    void togglesOverlay() {
        LayoutStore store = new LayoutStore(Path.of("unused.json"));
        assertTrue(store.toggleOverlay());
        assertTrue(store.overlayEnabled());
        assertFalse(store.toggleOverlay());
    }

    @Test
    @DisplayName("nothing is renderable without both a layout and an anchor")
    void needsBothLayoutAndAnchor() {
        LayoutStore store = new LayoutStore(Path.of("unused.json"));
        store.setOverlayEnabled(true);
        assertFalse(store.isRenderable(), "no layout, no anchor");

        store.setLayout(LayoutParser.parse(LayoutParserTest.SPEC_EXAMPLE));
        assertFalse(store.isRenderable(), "still no anchor");

        store.setAnchor(new LayoutAnchor(0, 64, 0, GridOrientation.R0));
        assertTrue(store.isRenderable());
    }

    @Test
    @DisplayName("a new push replaces the old layout but keeps the anchor")
    void pushReplacesLayoutKeepsAnchor() {
        LayoutStore store = new LayoutStore(Path.of("unused.json"));
        store.setAnchor(new LayoutAnchor(5, 70, 5, GridOrientation.R90));
        store.setLayout(LayoutParser.parse(LayoutParserTest.SPEC_EXAMPLE));
        store.setLayout(LayoutParser.parse("""
                {"schema":1,"label":"Second","size":[2,2],"cells":[{"x":0,"y":0,"crop":"Wheat"}]}"""));

        assertEquals("Second", store.label());
        assertEquals(1, store.layout().cellCount());
        // The greenhouse has not moved just because the plan changed.
        assertNotNull(store.anchor());
        assertEquals(5, store.anchor().x());
        assertSame(GridOrientation.R90, store.anchor().orientation());
    }

    @Test
    @DisplayName("clear drops the layout, stops drawing, and keeps the anchor")
    void clearKeepsAnchor() {
        LayoutStore store = new LayoutStore(Path.of("unused.json"));
        store.setAnchor(new LayoutAnchor(5, 70, 5, GridOrientation.R0));
        store.setLayout(LayoutParser.parse(LayoutParserTest.SPEC_EXAMPLE));
        store.setOverlayEnabled(true);

        store.clear();
        assertFalse(store.hasLayout());
        assertNull(store.label());
        assertFalse(store.overlayEnabled());
        assertNotNull(store.anchor());
    }

    @Test
    @DisplayName("rotate steps the anchor and returns the new orientation")
    void rotates() {
        LayoutStore store = new LayoutStore(Path.of("unused.json"));
        assertNull(store.rotate(), "no anchor yet, nothing to rotate");

        store.setAnchor(new LayoutAnchor(1, 2, 3, GridOrientation.R0));
        assertSame(GridOrientation.R90, store.rotate());
        assertSame(GridOrientation.R180, store.rotate());
        assertEquals(1, store.anchor().x(), "the corner must not move");
    }

    @Test
    @DisplayName("a corrupt or unparseable stored layout is dropped, not fatal")
    void survivesCorruptFile(@TempDir Path dir) throws IOException {
        Path file = dir.resolve("layout.json");
        Files.writeString(file, "{ not json", StandardCharsets.UTF_8);
        assertFalse(LayoutStore.load(file).hasLayout());

        // Structurally valid JSON, but a layout that no longer validates.
        Files.writeString(file, """
                {"layout":{"schema":1,"label":"L","size":[2,2],
                 "cells":[{"x":9,"y":9,"crop":"Wheat"}]},
                 "anchor":{"x":1,"y":2,"z":3,"orientation":90},"overlayEnabled":true}""",
                StandardCharsets.UTF_8);
        LayoutStore store = LayoutStore.load(file);
        assertFalse(store.hasLayout(), "out-of-bounds cell must invalidate the layout");
        // The anchor is independent and still usable.
        assertNotNull(store.anchor());
        assertSame(GridOrientation.R90, store.anchor().orientation());
    }

    @Test
    @DisplayName("loading a missing file yields an empty store")
    void missingFile(@TempDir Path dir) {
        LayoutStore store = LayoutStore.load(dir.resolve("nope.json"));
        assertFalse(store.hasLayout());
        assertNull(store.anchor());
    }
}
