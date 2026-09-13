package com.skydex.garden;

import com.google.gson.*;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.entity.decoration.ArmorStand;
import java.nio.file.*;
import java.util.*;

/** Local discovery archive, independent of the active layout and its visibility. */
public final class AutoPlantCapture {
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger("Skydex plant archive");
    private final Path directory;
    private final Set<String> saved = new HashSet<>();
    private final Map<String, String> pending = new HashMap<>();
    private final Map<String, Integer> stable = new HashMap<>();
    private ClientLevel level;
    private int ticks;
    public AutoPlantCapture(Path directory) { this.directory = directory; }
    public Path directory() { return directory; }

    public void tick(Minecraft client, boolean inGarden, PlantModels models) {
        if (client.level != level) {
            level = client.level; pending.clear(); stable.clear(); ticks = 0;
            if (level != null) load(models);
        }
        if (!inGarden || level == null || client.player == null || ticks++ % 20 != 0) return;
        var seen = new HashSet<String>();
        var nearby = level.getEntitiesOfClass(ArmorStand.class, client.player.getBoundingBox().inflate(32));
        for (var stand : nearby) {
            String id = PlantIdentity.id(stand);
            if (!GreenhouseCatalog.isKnown(id) || saved.contains(id) || !seen.add(id)) continue;
            BlockPos soil = null;
            var base = stand.blockPosition();
            for (int dy = 2; dy >= -16; dy--) {
                var pos = base.offset(0, dy, 0);
                var state = level.getBlockState(pos);
                var above = level.getBlockState(pos.above());
                if (BedBlocks.isExposedBed(BuiltInRegistries.BLOCK.getKey(state.getBlock()).getPath(),
                        BuiltInRegistries.BLOCK.getKey(above.getBlock()).getPath(), above.isSolidRender())) {
                    soil = pos; break;
                }
            }
            if (soil == null) continue;
            try {
                int size = GreenhouseCatalog.size(id);
                var capture = PlantModelCapture.capture(client, soil, id, size == 1 ? 1 : 3, 16);
                if (capture.get("matchingNames").getAsInt() == 0) continue;
                // Require three scans of the same loaded assembly. Animated poses can change;
                // identity, relative positions and block states must remain stable.
                var topology = new JsonArray();
                for (var element : capture.getAsJsonArray("entities")) {
                    var part = element.getAsJsonObject();
                    var tag = net.minecraft.nbt.TagParser.parseCompoundFully(part.get("data").getAsString());
                    var visual = new net.minecraft.nbt.CompoundTag();
                    for (String key : List.of("CustomName", "Pose", "Rotation", "Small", "Invisible", "ShowArms", "NoBasePlate",
                            "equipment", "attributes", "item", "block_state", "transformation", "billboard",
                            "brightness", "view_range", "width", "height", "item_display"))
                        if (tag.contains(key)) visual.put(key, tag.get(key).copy());
                    part.addProperty("data", visual.toString());
                    var identity = part.deepCopy(); identity.remove("data"); topology.add(identity);
                }
                String signature = soil.toShortString() + topology + capture.get("blocks");
                int count = signature.equals(pending.put(id, signature)) ? stable.getOrDefault(id, 0) + 1 : 1;
                stable.put(id, count);
                if (count < 3) continue;
                capture.addProperty("footprint", size);
                capture.addProperty("automatic", true);
                capture.addProperty("growthStage", "observed; maturity unverified");
                Files.createDirectories(directory);
                Path target = directory.resolve(id + ".json");
                // Never overwrite a prior capture, including one copied in by the user.
                if (!Files.exists(target)) {
                    Path temp = directory.resolve(id + ".json.tmp");
                    Files.writeString(temp, new GsonBuilder().setPrettyPrinting().create().toJson(capture));
                    try { Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE); }
                    catch (AtomicMoveNotSupportedException unsupported) { Files.move(temp, target); }
                }
                saved.add(id); pending.remove(id); stable.remove(id);
                if (size == 1) models.ingest(level, capture);
                LOG.info("Saved plant {} to {}", id, target);
                break; // At most one disk write each second.
            } catch (Exception error) {
                LOG.warn("Could not archive plant {}: {}", id, error.toString());
                pending.remove(id); stable.remove(id);
            }
        }
        pending.keySet().removeIf(id -> !seen.contains(id));
        stable.keySet().removeIf(id -> !seen.contains(id));
    }

    private void load(PlantModels models) {
        models.prepare(level);
        for (String id : GreenhouseCatalog.ids()) {
            Path file = directory.resolve(id + ".json");
            if (!Files.isRegularFile(file)) continue;
            try {
                if (Files.size(file) > 2_000_000) throw new IllegalArgumentException("Oversized plant archive");
                var capture = JsonParser.parseString(Files.readString(file)).getAsJsonObject();
                if (capture.get("schema").getAsInt() != 1 || !id.equals(capture.get("expectedCrop").getAsString()))
                    throw new IllegalArgumentException("Plant archive identity mismatch");
                saved.add(id);
                // Keep multi-cell evidence intact, without replaying disconnected columns as plants.
                if (GreenhouseCatalog.size(id) == 1) models.ingest(level, capture);
            } catch (Exception error) { LOG.warn("Could not load plant {}: {}", id, error.toString()); }
        }
    }
}
