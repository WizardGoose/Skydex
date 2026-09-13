package com.skydex.gametest;

import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.entrypoint.PreLaunchEntrypoint;
import java.nio.file.Files;
import java.io.UncheckedIOException;
import java.io.IOException;

/** Synthetic old-install data, created before the real mod initializes. */
public final class MigrationFixture implements PreLaunchEntrypoint {
    @Override public void onPreLaunch() {
        if (!Boolean.getBoolean("skydex.test.migration")) return;
        var root = FabricLoader.getInstance().getConfigDir().resolve("skyindex");
        try {
            Files.createDirectories(root.resolve("plant-models"));
            Files.writeString(root.resolve("config.json"),
                    "{\"siteUrl\":\"https://migration-fixture.invalid\"}");
            Files.writeString(root.resolve("plant-models/migration-fixture.txt"), "synthetic saved plant");
        } catch (IOException e) { throw new UncheckedIOException(e); }
    }
}
