package com.skydex;

import com.skydex.config.IncludeMode;
import com.skydex.config.SiteMode;
import com.skydex.config.SkydexConfig;
import com.skydex.export.ExportSection;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.EnumSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SkydexConfigTest {

    @Test
    @DisplayName("new and existing installs always use Skydex storage")
    void resolvesRenamedDataDirectory(@TempDir Path dir) throws IOException {
        Path skydex = dir.resolve("skydex");
        Path legacy = dir.resolve("skyindex");

        assertEquals(skydex, SkydexConfig.resolveDataDirectory(dir));

        Files.createDirectories(legacy);
        Files.writeString(legacy.resolve("config.json"), "saved settings");
        Files.createDirectories(legacy.resolve("plant-models"));
        Files.writeString(legacy.resolve("plant-models/cheesebite.json"), "saved plant");
        assertEquals(skydex, SkydexConfig.resolveDataDirectory(dir));
        assertFalse(Files.exists(legacy));
        assertEquals("saved settings", Files.readString(skydex.resolve("config.json")));
        assertEquals("saved plant", Files.readString(skydex.resolve("plant-models/cheesebite.json")));
        assertTrue(Files.readString(skydex.resolve("migration-notice.txt")).contains("preserved"));
        assertEquals(skydex, SkydexConfig.resolveDataDirectory(dir));
    }

    @Test
    void mergesMissingDataAndPreservesConflicts(@TempDir Path dir) throws IOException {
        Path legacy = Files.createDirectories(dir.resolve("skyindex"));
        Path current = Files.createDirectories(dir.resolve("skydex"));
        Files.writeString(legacy.resolve("config.json"), "old settings");
        Files.writeString(current.resolve("config.json"), "current settings");
        Files.writeString(legacy.resolve("layout.json"), "saved layout");
        Files.createDirectories(legacy.resolve("profiles"));
        Files.writeString(legacy.resolve("profiles/one.json"), "profile");
        Files.writeString(current.resolve("profiles"), "conflicting file");
        assertEquals(current, SkydexConfig.resolveDataDirectory(dir));
        assertFalse(Files.exists(legacy));
        assertEquals("current settings", Files.readString(current.resolve("config.json")));
        assertEquals("saved layout", Files.readString(current.resolve("layout.json")));
        assertTrue(Files.readString(current.resolve("migration-notice.txt")).contains("migration-backups"));
        assertEquals("conflicting file", Files.readString(current.resolve("profiles")));
        try (var backups = Files.list(current.resolve("migration-backups"))) {
            Path backup = backups.findFirst().orElseThrow();
            assertEquals("old settings", Files.readString(backup.resolve("config.json")));
            assertEquals("profile", Files.readString(backup.resolve("profiles/one.json")));
        }
        assertEquals(current, SkydexConfig.resolveDataDirectory(dir));
    }

    @Test
    void refusesInvalidDestinationWithoutLosingData(@TempDir Path dir) throws IOException {
        Path legacy = Files.createDirectories(dir.resolve("skyindex"));
        Files.writeString(legacy.resolve("layout.json"), "keep me");
        Files.writeString(dir.resolve("skydex"), "blocking file");
        org.junit.jupiter.api.Assertions.assertThrows(java.io.UncheckedIOException.class,
                () -> SkydexConfig.resolveDataDirectory(dir));
        assertEquals("keep me", Files.readString(legacy.resolve("layout.json")));
    }

    @Test
    @DisplayName("default is Locally hosted, which means the server runs")
    void defaults() {
        SkydexConfig config = new SkydexConfig();
        assertEquals(SiteMode.LOCAL, config.siteMode);
        assertTrue(config.siteMode.usesLocalServer());
        assertEquals(27916, config.httpPort);
        assertTrue(config.captureEnabled);
        assertEquals(EnumSet.allOf(ExportSection.class), config.exportSections());
    }

    @Test
    @DisplayName("legacy site-mode values remain readable during automatic transport migration")
    void legacySiteModeValuesRemainReadable() {
        assertFalse(SiteMode.GITHUB_PAGES.usesLocalServer(),
                "the retired mode keeps its historical value for old config files");
        assertEquals("GitHub Pages", SiteMode.GITHUB_PAGES.label());
        assertEquals("Locally Hosted", SiteMode.LOCAL.label());
    }

    @Test
    @DisplayName("the six export checkboxes persist independently")
    void exportSectionsPersist(@TempDir Path dir) throws IOException {
        Path file = dir.resolve("config.json");
        SkydexConfig config = new SkydexConfig();
        config.setExportSectionEnabled(ExportSection.ISLAND_CHESTS, false);
        config.setExportSectionEnabled(ExportSection.ENDER_CHEST, false);
        config.save(file);

        SkydexConfig reloaded = SkydexConfig.load(file);
        assertFalse(reloaded.isExportSectionEnabled(ExportSection.ISLAND_CHESTS));
        assertFalse(reloaded.isExportSectionEnabled(ExportSection.ENDER_CHEST));
        assertTrue(reloaded.isExportSectionEnabled(ExportSection.SACKS));
        assertTrue(reloaded.isExportSectionEnabled(ExportSection.INVENTORY));
        assertTrue(reloaded.isExportSectionEnabled(ExportSection.STORAGE));
        assertTrue(reloaded.isExportSectionEnabled(ExportSection.GREENHOUSE));
    }

    @Test
    @DisplayName("the old three-section toggle migrates into the new dropdown")
    void oldToggleMigratesIntoDropdown(@TempDir Path dir) throws IOException {
        Path file = dir.resolve("config.json");
        Files.writeString(file, "{\"siteMode\":\"local\",\"includeInventoryInExport\":\"off\"}",
                StandardCharsets.UTF_8);

        SkydexConfig migrated = SkydexConfig.load(file);
        assertEquals(EnumSet.of(ExportSection.SACKS, ExportSection.ISLAND_CHESTS,
                ExportSection.GREENHOUSE), migrated.exportSections());
    }

    @Test
    @DisplayName("untouched, the export toggle follows the site mode")
    void includeDefaultFollowsMode() {
        SkydexConfig config = new SkydexConfig();
        assertEquals(IncludeMode.AUTO, config.includeInventoryMode);

        // Locally Hosted: the live feed carries these, so the code stays small.
        config.siteMode = SiteMode.LOCAL;
        assertFalse(config.includeInventoryInExport());

        // GitHub Pages: the code is the only way the hosted site can get them.
        config.siteMode = SiteMode.GITHUB_PAGES;
        assertTrue(config.includeInventoryInExport());
    }

    @Test
    @DisplayName("an explicit choice outranks the site mode in both directions")
    void explicitChoiceWins() {
        SkydexConfig config = new SkydexConfig();

        // Turned ON while on Locally Hosted, where the default would be off.
        config.siteMode = SiteMode.LOCAL;
        config.setIncludeInventoryInExport(true);
        assertTrue(config.includeInventoryInExport());
        config.siteMode = SiteMode.GITHUB_PAGES;
        assertTrue(config.includeInventoryInExport(), "switching mode must not undo the choice");

        // Turned OFF while on GitHub Pages, where the default would be on.
        config.setIncludeInventoryInExport(false);
        assertFalse(config.includeInventoryInExport());
        config.siteMode = SiteMode.LOCAL;
        assertFalse(config.includeInventoryInExport());
    }

    @Test
    @DisplayName("an explicit choice survives a restart; an untouched one stays automatic")
    void explicitChoicePersists(@TempDir Path dir) throws IOException {
        Path file = dir.resolve("config.json");

        SkydexConfig untouched = new SkydexConfig();
        untouched.siteMode = SiteMode.GITHUB_PAGES;
        untouched.save(file);
        SkydexConfig reloadedAuto = SkydexConfig.load(file);
        assertEquals(IncludeMode.AUTO, reloadedAuto.includeInventoryMode);
        assertTrue(reloadedAuto.includeInventoryInExport(), "still follows GitHub Pages");

        SkydexConfig chosen = new SkydexConfig();
        chosen.siteMode = SiteMode.GITHUB_PAGES;
        chosen.setIncludeInventoryInExport(false);
        chosen.save(file);
        assertTrue(Files.readString(file, StandardCharsets.UTF_8).contains("\"includeInventoryInExport\": \"off\""));

        SkydexConfig reloaded = SkydexConfig.load(file);
        assertEquals(IncludeMode.OFF, reloaded.includeInventoryMode);
        assertFalse(reloaded.includeInventoryInExport(),
                "an explicit off must survive, even on GitHub Pages");
    }

    @Test
    @DisplayName("the older boolean form migrates without stranding anyone on the old default")
    void migratesLegacyBoolean(@TempDir Path dir) throws IOException {
        Path file = dir.resolve("config.json");

        // The previous build always wrote false, so it cannot mean "chosen".
        Files.writeString(file, "{\"siteMode\":\"githubPages\",\"includeInventoryInExport\":false}",
                StandardCharsets.UTF_8);
        SkydexConfig migrated = SkydexConfig.load(file);
        assertEquals(IncludeMode.AUTO, migrated.includeInventoryMode);
        assertTrue(migrated.includeInventoryInExport(), "picks up the new GitHub Pages default");

        // A stored true could only have come from someone turning it on.
        Files.writeString(file, "{\"siteMode\":\"local\",\"includeInventoryInExport\":true}",
                StandardCharsets.UTF_8);
        SkydexConfig kept = SkydexConfig.load(file);
        assertEquals(IncludeMode.ON, kept.includeInventoryMode);
        assertTrue(kept.includeInventoryInExport());
    }

    @Test
    @DisplayName("site mode survives a save/load round trip")
    void persistsSiteMode(@TempDir Path dir) throws IOException {
        Path file = dir.resolve("config.json");
        SkydexConfig config = new SkydexConfig();
        config.siteMode = SiteMode.GITHUB_PAGES;
        config.chatFeedback = true;
        config.save(file);

        String written = Files.readString(file, StandardCharsets.UTF_8);
        assertTrue(written.contains("\"siteMode\": \"githubPages\""), written);

        SkydexConfig reloaded = SkydexConfig.load(file);
        assertEquals(SiteMode.GITHUB_PAGES, reloaded.siteMode);
        assertTrue(reloaded.chatFeedback);
    }

    @Test
    @DisplayName("an unknown or missing mode falls back to the default")
    void lenientModeParsing(@TempDir Path dir) throws IOException {
        assertEquals(SiteMode.LOCAL, SiteMode.fromId("nonsense", SiteMode.defaultMode()));
        assertEquals(SiteMode.LOCAL, SiteMode.fromId(null, SiteMode.defaultMode()));
        assertEquals(SiteMode.GITHUB_PAGES, SiteMode.fromId("  GITHUBPAGES ", SiteMode.LOCAL));

        Path file = dir.resolve("c.json");
        Files.writeString(file, "{\"siteMode\":\"whatever\"}", StandardCharsets.UTF_8);
        assertEquals(SiteMode.LOCAL, SkydexConfig.load(file).siteMode);
    }

    @Test
    @DisplayName("a corrupt config file falls back to defaults instead of failing to load")
    void corruptFileFallsBack(@TempDir Path dir) throws IOException {
        Path file = dir.resolve("c.json");
        Files.writeString(file, "{ this is not json", StandardCharsets.UTF_8);

        SkydexConfig config = SkydexConfig.load(file);
        assertEquals(SiteMode.LOCAL, config.siteMode);
        assertEquals(27916, config.httpPort);
    }

    @Test
    @DisplayName("an out-of-range port is ignored rather than used")
    void rejectsBadPort(@TempDir Path dir) throws IOException {
        Path file = dir.resolve("c.json");
        Files.writeString(file, "{\"httpPort\":99999}", StandardCharsets.UTF_8);
        assertEquals(27916, SkydexConfig.load(file).httpPort);
    }

    @Test
    @DisplayName("loading a missing file yields defaults")
    void missingFile(@TempDir Path dir) {
        assertEquals(SiteMode.LOCAL, SkydexConfig.load(dir.resolve("nope.json")).siteMode);
    }
}
