package com.skydex.layout;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/**
 * The active layout, saved named loadouts, anchor, and helper state.
 * A push activates and retains its named loadout; repeated pushes of that name
 * update it. The anchor survives because the greenhouse has not moved.
 *
 * <p>Reads happen on the render thread every frame, writes on the HTTP thread
 * and the client thread, hence the volatile fields and synchronised mutators.
 */
public final class LayoutStore {

    private final java.util.LinkedHashMap<String, GreenhouseLayout> saved = new java.util.LinkedHashMap<>();

    public synchronized java.util.Map<String, GreenhouseLayout> savedLayouts() {
        return java.util.Collections.unmodifiableMap(new java.util.LinkedHashMap<>(saved));
    }

    public static String savedId(GreenhouseLayout layout) {
        return java.util.UUID.nameUUIDFromBytes(layout.label().getBytes(StandardCharsets.UTF_8)).toString();
    }

    public synchronized boolean selectSaved(String id) {
        GreenhouseLayout selected = saved.get(id);
        if (selected == null) return false;
        layout = selected;
        return true;
    }

    private final Path file;

    private volatile GreenhouseLayout layout;
    private volatile LayoutAnchor anchor;
    /** Spec: the overlay starts off. */
    private volatile boolean overlayEnabled;
    /**
     * Whether the overlay compares itself against the world, rather than drawing
     * every cell the same.
     *
     * <p>Off by default, and a separate switch rather than a replacement, so the
     * plain overlay stays exactly what it was. The comparison reads blocks and
     * entities every second; someone who only wants to see where the grid falls
     * should not be made to pay for that, and someone who liked the flat tiles
     * should not have them change under them.
     */
    private volatile boolean projectionEnabled;
    private volatile boolean showMutations = true;

    public boolean showMutations() { return showMutations; }

    public synchronized void setShowMutations(boolean enabled) { showMutations = enabled; }

    public boolean showsCell(LayoutCell cell) { return showMutations || !cell.isMutation(); }

    public LayoutStore(Path file) {
        this.file = file;
    }

    public Path file() {
        return file;
    }

    public GreenhouseLayout layout() {
        return layout;
    }

    public LayoutAnchor anchor() {
        return anchor;
    }

    public boolean overlayEnabled() {
        return overlayEnabled;
    }

    public boolean projectionEnabled() {
        return projectionEnabled;
    }

    /**
     * True when the overlay should be comparing cells against the world.
     *
     * <p>Both switches have to be on: the projection is a way of drawing the
     * overlay, so it cannot be showing while the overlay is not.
     */
    public boolean isProjecting() {
        return projectionEnabled && isRenderable();
    }

    public boolean hasLayout() {
        return layout != null;
    }

    /** True when there is something to draw and somewhere to draw it. */
    public boolean isRenderable() {
        return overlayEnabled && layout != null && anchor != null;
    }

    public String label() {
        GreenhouseLayout current = layout;
        return current == null ? null : current.label();
    }

    // ------------------------------------------------------------ mutations

    public synchronized void setLayout(GreenhouseLayout newLayout) {
        if (newLayout != null) saved.put(savedId(newLayout), newLayout);
        this.layout = newLayout;
    }

    /** Drops the layout but keeps the anchor, and stops drawing. */
    public synchronized void clear() {
        this.layout = null;
        this.overlayEnabled = false;
    }

    public synchronized void setAnchor(LayoutAnchor newAnchor) {
        this.anchor = newAnchor;
    }

    /** @return the new orientation, or null when there is no anchor yet */
    public synchronized GridOrientation rotate() {
        if (anchor == null) {
            return null;
        }
        anchor = anchor.rotated();
        return anchor.orientation();
    }

    public synchronized void setOverlayEnabled(boolean enabled) {
        this.overlayEnabled = enabled;
    }

    /** @return the new state */
    public synchronized boolean toggleOverlay() {
        overlayEnabled = !overlayEnabled;
        return overlayEnabled;
    }

    public synchronized void setProjectionEnabled(boolean enabled) {
        this.projectionEnabled = enabled;
    }

    /** @return the new state */
    public synchronized boolean toggleProjection() {
        projectionEnabled = !projectionEnabled;
        return projectionEnabled;
    }

    // ---------------------------------------------------------- persistence

    public synchronized void save() throws IOException {
        Path parent = file.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        JsonObject root = new JsonObject();
        com.google.gson.JsonArray loadouts = new com.google.gson.JsonArray();
        for (GreenhouseLayout item : saved.values()) loadouts.add(item.toJson());
        root.add("savedLayouts", loadouts);
        if (layout != null) {
            root.add("layout", layout.toJson());
        }
        if (anchor != null) {
            root.add("anchor", anchor.toJson());
        }
        root.addProperty("overlayEnabled", overlayEnabled);
        root.addProperty("projectionEnabled", projectionEnabled);
        root.addProperty("showMutations", showMutations);

        Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
        Files.writeString(tmp, root.toString(), StandardCharsets.UTF_8);
        try {
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (java.nio.file.AtomicMoveNotSupportedException e) {
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    /**
     * A stored layout that no longer parses is dropped rather than crashing the
     * mod — the site can always push it again.
     */
    public static LayoutStore load(Path file) {
        LayoutStore store = new LayoutStore(file);
        if (!Files.exists(file)) {
            return store;
        }
        try {
            JsonObject root = JsonParser.parseString(
                    Files.readString(file, StandardCharsets.UTF_8)).getAsJsonObject();
            if (root.has("savedLayouts") && root.get("savedLayouts").isJsonArray()) {
                for (var item : root.getAsJsonArray("savedLayouts")) {
                    try {
                        GreenhouseLayout parsed = LayoutParser.parse(item.getAsJsonObject());
                        store.saved.put(savedId(parsed), parsed);
                    } catch (RuntimeException invalid) {
                        // One invalid saved entry must not discard other loadouts.
                    }
                }
            }
            if (root.has("layout") && root.get("layout").isJsonObject()) {
                try {
                    store.setLayout(LayoutParser.parse(root.getAsJsonObject("layout")));
                } catch (LayoutFormatException e) {
                    store.layout = null;
                }
            }
            if (root.has("anchor") && root.get("anchor").isJsonObject()) {
                store.anchor = LayoutAnchor.fromJson(root.getAsJsonObject("anchor"));
            }
            store.overlayEnabled = root.has("overlayEnabled")
                    && root.get("overlayEnabled").getAsBoolean();
            // Absent in files written before the projection existed, which reads
            // as off — the same answer a fresh install gets.
            store.projectionEnabled = root.has("projectionEnabled")
                    && root.get("projectionEnabled").getAsBoolean();
            store.showMutations = !root.has("showMutations") || root.get("showMutations").getAsBoolean();
        } catch (IOException | RuntimeException e) {
            return new LayoutStore(file);
        }
        return store;
    }
}
