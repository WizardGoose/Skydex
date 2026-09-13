package com.skydex.garden;

import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.skydex.capture.ItemIds;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.NbtUtils;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.entity.Display;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.UUID;

/** Explicit local diagnostic capture, never part of the website snapshot. */
public final class PlantModelCapture {
    private PlantModelCapture() {}

    public static BlockPos targetedSoil(Minecraft client) {
        if (client.player == null || client.level == null) return null;
        var hit = client.player.pick(8, 0, false);
        if (!(hit instanceof BlockHitResult block) || hit.getType() != HitResult.Type.BLOCK) return null;
        for (int down = 0; down <= 6; down++) {
            var pos = block.getBlockPos().below(down);
            var state = client.level.getBlockState(pos);
            var above = client.level.getBlockState(pos.above());
            if (BedBlocks.isExposedBed(BuiltInRegistries.BLOCK.getKey(state.getBlock()).getPath(),
                    BuiltInRegistries.BLOCK.getKey(above.getBlock()).getPath(), above.isSolidRender())) return pos;
        }
        return null;
    }

    public static JsonObject capture(Minecraft client, BlockPos soil, String requestedId) {
        return capture(client, soil, requestedId, 1, 6);
    }

    public static JsonObject capture(Minecraft client, BlockPos soil, String requestedId, int radius, int height) {
        if (radius < 1 || radius > 3 || height < 6 || height > 16) throw new IllegalArgumentException("Capture bounds");
        if (client.level == null) throw new IllegalStateException("No loaded world");
        String id = GreenhouseCatalog.canonicalId(requestedId);
        if (!GreenhouseCatalog.isKnown(id)) throw new IllegalArgumentException("Unknown crop or mutation");
        JsonObject root = new JsonObject();
        root.addProperty("schema", 1);
        root.addProperty("expectedCrop", id);
        root.addProperty("association", "Unverified nearby parts; neighbours may be included");
        JsonArray blocks = new JsonArray();
        for (int dx = -radius; dx <= radius; dx++) for (int dz = -radius; dz <= radius; dz++) for (int dy = 0; dy <= height; dy++) {
            var pos = soil.offset(dx, dy, dz);
            if (!client.level.hasChunkAt(pos)) throw new IllegalStateException("Plant area is not fully loaded");
            var state = client.level.getBlockState(pos);
            if (state.isAir()) continue;
            var part = new JsonObject();
            part.addProperty("x", dx); part.addProperty("y", dy); part.addProperty("z", dz);
            part.addProperty("state", NbtUtils.writeBlockState(state).toString());
            blocks.add(part);
        }
        JsonArray entities = new JsonArray();
        int matchingNames = 0;
        var area = new AABB(soil.getX()-radius, soil.getY()-2, soil.getZ()-radius,
                soil.getX()+radius+1, soil.getY()+height+1, soil.getZ()+radius+1);
        for (var entity : client.level.getEntities(null, area)) {
            if (!(entity instanceof ArmorStand) && !(entity instanceof Display)) continue;
            if (entities.size() >= 128) throw new IllegalStateException("Too many nearby parts; choose an isolated plant");
            String name = entity.hasCustomName() ? ItemIds.strip(entity.getCustomName()).trim() : "";
            if (name.toLowerCase(java.util.Locale.ROOT).contains("carpenter")) continue;
            var output = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, client.level.registryAccess());
            entity.saveWithoutId(output);
            var tag = output.buildResult();
            for (String key : new String[]{"UUID", "Pos", "Motion", "Passengers", "Leash", "leash"}) tag.remove(key);
            var part = new JsonObject();
            part.addProperty("type", BuiltInRegistries.ENTITY_TYPE.getKey(entity.getType()).toString());
            part.addProperty("name", name);
            part.addProperty("x", entity.getX()-soil.getX());
            part.addProperty("y", entity.getY()-soil.getY());
            part.addProperty("z", entity.getZ()-soil.getZ());
            part.addProperty("data", tag.toString());
            String matched = entity instanceof ArmorStand stand ? PlantIdentity.id(stand) : MutationNames.idForExactName(name);
            if (matched == null) matched = MutationNames.idForContainedName(name);
            boolean matches = id.equals(GreenhouseCatalog.canonicalId(matched));
            part.addProperty("nameMatchesExpected", matches);
            if (matches) matchingNames++;
            entities.add(part);
        }
        root.add("blocks", blocks); root.add("entities", entities);
        root.addProperty("matchingNames", matchingNames);
        return root;
    }

    public static Path save(Path directory, JsonObject capture) throws IOException {
        Files.createDirectories(directory);
        Path file = directory.resolve("plant-" + UUID.randomUUID() + ".json");
        Files.writeString(file, new GsonBuilder().setPrettyPrinting().create().toJson(capture), StandardOpenOption.CREATE_NEW);
        return file;
    }
}
