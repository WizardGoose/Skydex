package com.skydex.export;

import java.util.Locale;

/**
 * One independently selectable section in a clipboard export.
 *
 * <p>The enum ids are persisted, while the labels are player-facing. Keeping
 * those two separate lets wording improve without invalidating a config file.
 */
public enum ExportSection {

    SACKS("sacks", "Sacks"),
    ISLAND_CHESTS("islandChests", "Island chests"),
    INVENTORY("inventory", "Inventory"),
    ENDER_CHEST("enderChest", "Ender chest"),
    STORAGE("storage", "Storage & backpacks"),
    GREENHOUSE("greenhouse", "Greenhouse board");

    private final String id;
    private final String label;

    ExportSection(String id, String label) {
        this.id = id;
        this.label = label;
    }

    public String id() {
        return id;
    }

    public String label() {
        return label;
    }

    /** Captured by the mod because these contents are absent from the profile API. */
    public static java.util.Set<ExportSection> capturedSections() {
        return java.util.Collections.unmodifiableSet(java.util.EnumSet.of(ISLAND_CHESTS, GREENHOUSE));
    }

    public static ExportSection fromId(String value) {
        if (value == null) {
            return null;
        }
        String wanted = value.trim().toLowerCase(Locale.ROOT);
        for (ExportSection section : values()) {
            if (section.id.toLowerCase(Locale.ROOT).equals(wanted)) {
                return section;
            }
        }
        return null;
    }
}
