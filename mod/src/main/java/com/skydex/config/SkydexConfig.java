package com.skydex.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;
import com.skydex.export.ExportSection;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

/**
 * Tiny hand-rolled config so the mod needs no config library.
 *
 * <p>A corrupt file falls back to defaults rather than preventing the mod from
 * loading — losing settings is annoying, failing to load is not acceptable.
 */
public final class SkydexConfig {

    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    /**
     * Every install writes to {@code config/skydex}; older data is migrated first.
     */
    public static Path resolveDataDirectory(Path configRoot) {
        try {
            return DataDirectoryMigration.resolve(configRoot);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not migrate saved Skydex data", e);
        }
    }

    /** The Vite dev server the site currently runs on. */
    public static final String DEFAULT_SITE_URL = "http://localhost:5173";

    /** Retained only so existing config files and commands continue to load. */
    public SiteMode siteMode = SiteMode.defaultMode();
    /** Master switch for all capture. */
    public boolean captureEnabled = true;
    /** Spec-pinned port. Configurable only as an escape hatch for port clashes. */
    public int httpPort = com.skydex.http.SkydexHttpServer.DEFAULT_PORT;
    /** Retired Open-site destination, retained for config compatibility. */
    public String siteUrl = DEFAULT_SITE_URL;
    /** Capture the player inventory alongside containers. */
    public boolean captureInventory = true;
    /**
     * The retired one-toggle form of the export selection.
     *
     * <p>It remains only to migrate old files and commands into the six
     * independent export groups used by the current screen.
     */
    public IncludeMode includeInventoryMode = IncludeMode.AUTO;
    /** The six groups shown by the export dropdown. Fresh installs include all. */
    private EnumSet<ExportSection> exportSections = EnumSet.allOf(ExportSection.class);
    /** Chat line whenever a container is recorded. Off: it is noisy. */
    public boolean chatFeedback = false;

    public static SkydexConfig load(Path file) {
        SkydexConfig config = new SkydexConfig();
        if (!Files.exists(file)) {
            return config;
        }
        try {
            JsonObject o = JsonParser.parseString(
                    Files.readString(file, StandardCharsets.UTF_8)).getAsJsonObject();
            config.siteMode = SiteMode.fromId(str(o, "siteMode"), SiteMode.defaultMode());
            config.captureEnabled = bool(o, "captureEnabled", config.captureEnabled);
            config.captureInventory = bool(o, "captureInventory", config.captureInventory);
            config.includeInventoryMode = readIncludeMode(o);
            config.exportSections = readExportSections(o, config.includeInventoryMode, config.siteMode);
            config.chatFeedback = bool(o, "chatFeedback", config.chatFeedback);
            String url = str(o, "siteUrl");
            if (url != null && !url.isBlank()) {
                config.siteUrl = url.trim();
            }
            if (o.has("httpPort") && o.get("httpPort").isJsonPrimitive()) {
                int port = o.get("httpPort").getAsInt();
                if (port > 0 && port <= 65535) {
                    config.httpPort = port;
                }
            }
        } catch (Exception e) {
            return new SkydexConfig();
        }
        return config;
    }

    public void save(Path file) throws IOException {
        Path parent = file.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        Files.writeString(file, GSON.toJson(toJson()), StandardCharsets.UTF_8);
    }

    JsonObject toJson() {
        JsonObject o = new JsonObject();
        o.addProperty("siteMode", siteMode.id());
        o.addProperty("captureEnabled", captureEnabled);
        o.addProperty("httpPort", httpPort);
        o.addProperty("captureInventory", captureInventory);
        o.addProperty("includeInventoryInExport", includeInventoryMode.id());
        JsonArray sections = new JsonArray();
        for (ExportSection section : ExportSection.values()) {
            if (exportSections.contains(section)) {
                sections.add(section.id());
            }
        }
        o.add("exportSections", sections);
        o.addProperty("chatFeedback", chatFeedback);
        o.addProperty("siteUrl", siteUrl);
        return o;
    }

    /** Does the clipboard code carry inventory/ender chest/storage right now? */
    public boolean includeInventoryInExport() {
        return includeInventoryMode.effective(siteMode);
    }

    /** Record the player's explicit choice, which then outranks the site mode. */
    public void setIncludeInventoryInExport(boolean include) {
        this.includeInventoryMode = IncludeMode.explicit(include);
        setExportSectionEnabled(ExportSection.INVENTORY, include);
        setExportSectionEnabled(ExportSection.ENDER_CHEST, include);
        setExportSectionEnabled(ExportSection.STORAGE, include);
    }

    /** Immutable snapshot in stable enum order. */
    public Set<ExportSection> exportSections() {
        return Collections.unmodifiableSet(EnumSet.copyOf(exportSections));
    }

    public boolean isExportSectionEnabled(ExportSection section) {
        return section != null && exportSections.contains(section);
    }

    public void setExportSectionEnabled(ExportSection section, boolean enabled) {
        if (section == null) {
            return;
        }
        if (enabled) {
            exportSections.add(section);
        } else {
            exportSections.remove(section);
        }
        if (section == ExportSection.INVENTORY
                || section == ExportSection.ENDER_CHEST
                || section == ExportSection.STORAGE) {
            boolean all = exportSections.contains(ExportSection.INVENTORY)
                    && exportSections.contains(ExportSection.ENDER_CHEST)
                    && exportSections.contains(ExportSection.STORAGE);
            boolean none = !exportSections.contains(ExportSection.INVENTORY)
                    && !exportSections.contains(ExportSection.ENDER_CHEST)
                    && !exportSections.contains(ExportSection.STORAGE);
            if (all || none) {
                includeInventoryMode = IncludeMode.explicit(all);
            }
        }
    }

    private static EnumSet<ExportSection> readExportSections(
            JsonObject o, IncludeMode legacyMode, SiteMode siteMode) {
        if (o.has("exportSections") && o.get("exportSections").isJsonArray()) {
            EnumSet<ExportSection> selected = EnumSet.noneOf(ExportSection.class);
            for (JsonElement element : o.getAsJsonArray("exportSections")) {
                if (!element.isJsonPrimitive()) {
                    continue;
                }
                ExportSection section = ExportSection.fromId(element.getAsString());
                if (section != null) {
                    selected.add(section);
                }
            }
            return selected;
        }

        // Files written before the dropdown had one three-section toggle.
        // Preserve that choice, while the three always-included groups remain.
        EnumSet<ExportSection> migrated = EnumSet.of(
                ExportSection.SACKS, ExportSection.ISLAND_CHESTS, ExportSection.GREENHOUSE);
        if (legacyMode.effective(siteMode)) {
            migrated.add(ExportSection.INVENTORY);
            migrated.add(ExportSection.ENDER_CHEST);
            migrated.add(ExportSection.STORAGE);
        }
        return migrated;
    }

    /**
     * Reads the setting, migrating the older boolean form.
     *
     * <p>The previous build always wrote this key, so a stored {@code false} is
     * indistinguishable from "never touched" and is treated as untouched — that
     * is what lets existing GitHub Pages users pick up the new default. A stored
     * {@code true} could only have come from someone deliberately turning it on,
     * so it is kept as an explicit choice.
     */
    private static IncludeMode readIncludeMode(JsonObject o) {
        if (!o.has("includeInventoryInExport") || !o.get("includeInventoryInExport").isJsonPrimitive()) {
            return IncludeMode.AUTO;
        }
        JsonPrimitive value = o.getAsJsonPrimitive("includeInventoryInExport");
        if (value.isBoolean()) {
            return value.getAsBoolean() ? IncludeMode.ON : IncludeMode.AUTO;
        }
        return IncludeMode.fromId(value.getAsString(), IncludeMode.AUTO);
    }

    private static boolean bool(JsonObject o, String key, boolean fallback) {
        if (!o.has(key) || !o.get(key).isJsonPrimitive()) {
            return fallback;
        }
        return o.get(key).getAsBoolean();
    }

    private static String str(JsonObject o, String key) {
        if (!o.has(key) || !o.get(key).isJsonPrimitive()) {
            return null;
        }
        return o.get(key).getAsString();
    }
}
