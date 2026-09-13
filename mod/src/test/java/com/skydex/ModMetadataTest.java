package com.skydex;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Entrypoint wiring smoke test.
 *
 * <p>The mod cannot be launched here (no display), and a wrong entrypoint class
 * name in {@code fabric.mod.json} fails only at game start with a hard crash.
 * This catches that statically: the declared entrypoint must correspond to a
 * class that actually compiled.
 */
class ModMetadataTest {

    private static JsonObject modJson() throws IOException {
        Path file = Path.of("src/main/resources/fabric.mod.json");
        assertTrue(Files.exists(file), "fabric.mod.json missing at " + file.toAbsolutePath());
        return JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8)).getAsJsonObject();
    }

    @Test
    @DisplayName("declared client entrypoint resolves to a compiled class")
    void entrypointClassExists() throws IOException {
        JsonArray client = modJson().getAsJsonObject("entrypoints").getAsJsonArray("client");
        assertEquals(1, client.size(), "expected exactly one client entrypoint");

        String fqcn = client.get(0).getAsString();
        Path classFile = Path.of("build/classes/java/main")
                .resolve(fqcn.replace('.', '/') + ".class");
        assertTrue(Files.exists(classFile),
                "entrypoint " + fqcn + " has no compiled class at " + classFile.toAbsolutePath());
    }

    @Test
    @DisplayName("metadata exposes Skydex as the compiled mod identity")
    void metadataIsConsistent() throws IOException {
        JsonObject json = modJson();
        assertEquals(1, json.get("schemaVersion").getAsInt());
        assertEquals("skydex", json.get("id").getAsString());
        assertEquals("Skydex", json.get("name").getAsString());
        assertEquals("client", json.get("environment").getAsString());
        JsonArray mixins = json.getAsJsonArray("mixins");
        assertEquals(1, mixins.size());
        assertEquals("skydex.client.mixins.json", mixins.get(0).getAsString(),
                "the Skydex-only smooth text renderer must ship with the mod");

        JsonObject depends = json.getAsJsonObject("depends");
        assertEquals("${minecraft_version}", depends.get("minecraft").getAsString(),
                "the packaged metadata must follow the Gradle target");
        // Both supported targets require a Java 25 runtime.
        assertEquals(">=25", depends.get("java").getAsString());
        assertEquals(">=${fabric_api_version}", depends.get("fabric-api").getAsString(),
                "each Minecraft build must declare its matching tested Fabric API");
    }

    @Test
    void packagedVersionFollowsReleaseAndMinecraftTarget() throws IOException {
        Properties properties = new Properties();
        try (var reader = Files.newBufferedReader(Path.of("gradle.properties"))) { properties.load(reader); }
        var packaged = JsonParser.parseString(Files.readString(Path.of("build/resources/main/fabric.mod.json")))
                .getAsJsonObject();
        String minecraft = packaged.getAsJsonObject("depends").get("minecraft").getAsString();
        assertEquals(properties.getProperty("mod_version") + "+" + minecraft, packaged.get("version").getAsString());
        assertFalse(packaged.toString().contains("${"), "all artifact version placeholders must be expanded");
    }

    @Test
    @DisplayName("Gradle produces Skydex artifacts and resources")
    void buildIdentityIsSkydex() throws IOException {
        Properties properties = new Properties();
        try (var reader = Files.newBufferedReader(Path.of("gradle.properties"),
                StandardCharsets.UTF_8)) {
            properties.load(reader);
        }
        assertEquals("skydex", properties.getProperty("archives_base_name"));
        assertEquals("com.skydex", properties.getProperty("maven_group"));
        assertTrue(Files.readString(Path.of("settings.gradle"), StandardCharsets.UTF_8)
                .contains("rootProject.name = 'skydex'"));

        Path assets = Path.of("src/main/resources/assets");
        assertTrue(Files.isDirectory(assets.resolve("skydex")));
        assertFalse(Files.exists(assets.resolve("skyindex")),
                "the retired asset namespace must not be packaged");
    }
}
