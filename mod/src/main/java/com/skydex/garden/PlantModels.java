package com.skydex.garden;

import com.google.gson.*;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.*;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.TagValueInput;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.phys.AABB;

import java.util.*;

/** Local, observed plant assemblies. No guessed geometry and no world entities are spawned. */
public final class PlantModels {
    public record Head(double x, double y, double z, CompoundTag data) {}
    public record Stem(int y, BlockState state) {}
    public record Model(String id, List<Head> heads, List<Stem> stems) {}
    private final Map<String, Model> models = new HashMap<>();

    private ClientLevel level;
    private long revision;

    private static final org.slf4j.Logger LOGGER = org.slf4j.LoggerFactory.getLogger("Skydex plant models");

    public Model get(String id) {
        String canonical=GreenhouseCatalog.canonicalId(id);
        var live=models.get(canonical);
        if(live!=null || canonical==null)return live;
        // These greenhouse crops use native block models. Head-based crops and
        // mutations deliberately have no fabricated generic-plant fallback.
        BlockState block=switch(canonical) {
            case "wheat" -> net.minecraft.world.level.block.Blocks.WHEAT.defaultBlockState()
                    .setValue(net.minecraft.world.level.block.CropBlock.AGE,7);
            case "carrot" -> net.minecraft.world.level.block.Blocks.CARROTS.defaultBlockState()
                    .setValue(net.minecraft.world.level.block.CropBlock.AGE,7);
            case "potato" -> net.minecraft.world.level.block.Blocks.POTATOES.defaultBlockState()
                    .setValue(net.minecraft.world.level.block.CropBlock.AGE,7);
            case "nether_wart" -> net.minecraft.world.level.block.Blocks.NETHER_WART.defaultBlockState()
                    .setValue(net.minecraft.world.level.block.NetherWartBlock.AGE,3);
            case "sugar_cane" -> net.minecraft.world.level.block.Blocks.SUGAR_CANE.defaultBlockState();
            default -> null;
        };
        return block==null?null:new Model(canonical,List.of(),List.of(new Stem(1,block)));
    }
    public int size() { return models.size(); }
    public long revision() { return revision; }

    public void prepare(ClientLevel current) {
        if (current == level) return;
        level = current;
        models.clear(); revision++;
    }
    /** Reads names from the actual worn items, never the user's unverified expectedCrop label. */
    public void ingest(ClientLevel current, JsonObject capture) throws Exception {
        if (capture.get("schema").getAsInt() != 1) return;
        var entities = capture.getAsJsonArray("entities");
        var blocks = capture.getAsJsonArray("blocks");
        if (entities.size() > 128 || blocks.size() > 1024) return;
        Map<BlockPos, List<ArmorStand>> columns = new LinkedHashMap<>();
        for (var element : entities) {
            var part = element.getAsJsonObject();
            if (!"minecraft:armor_stand".equals(part.get("type").getAsString())) continue;
            double x = part.get("x").getAsDouble(), y = part.get("y").getAsDouble(), z = part.get("z").getAsDouble();
            if (!Double.isFinite(x+y+z) || Math.abs(x)>2 || Math.abs(z)>2 || y < -2 || y > 7) continue;
            var stand = new ArmorStand(current, x, y, z);
            stand.load(TagValueInput.create(ProblemReporter.DISCARDING, current.registryAccess(),
                    visualTag(TagParser.parseCompoundFully(part.get("data").getAsString()))));
            stand.setPos(x,y,z);
            if (PlantIdentity.id(stand) == null || stand.getItemBySlot(EquipmentSlot.HEAD).isEmpty()) continue;
            var column = new BlockPos((int)Math.floor(x), 0, (int)Math.floor(z));
            columns.computeIfAbsent(column, unused -> new ArrayList<>()).add(stand);
        }
        for (var column : columns.entrySet()) {
            var stems = new ArrayList<Stem>();
            for (var element : blocks) {
                var part = element.getAsJsonObject();
                int y = part.get("y").getAsInt();
                if (part.get("x").getAsInt()!=column.getKey().getX()
                        || part.get("z").getAsInt()!=column.getKey().getZ() || y<1 || y>6) continue;
                var state = NbtUtils.readBlockState(current.registryAccess().lookupOrThrow(net.minecraft.core.registries.Registries.BLOCK),
                        TagParser.parseCompoundFully(part.get("state").getAsString()));
                if (CropIds.isCrop(BuiltInRegistries.BLOCK.getKey(state.getBlock()).getPath())) stems.add(new Stem(y,state));
            }
            Model model = assemble(column.getKey(), column.getValue(), stems);
            if (model != null && capture.has("automatic") && capture.get("automatic").getAsBoolean()
                    && (!model.id().equals(capture.get("expectedCrop").getAsString())
                    || GreenhouseCatalog.size(model.id()) != 1)) continue;
            if (model != null) remember(model);
        }
    }

    /** Read currently loaded growing-media columns; no file-backed model library. */
    public void observe(ClientLevel current, int x, int y, int z, int width, int depth) {
        prepare(current);
        Map<BlockPos,List<ArmorStand>> columns = new HashMap<>();
        for (var stand : current.getEntitiesOfClass(ArmorStand.class, new AABB(x,y-2,z,x+width,y+7,z+depth))) {
            if (PlantIdentity.id(stand)==null || stand.getItemBySlot(EquipmentSlot.HEAD).isEmpty()) continue;
            var floor = new BlockPos((int)Math.floor(stand.getX()),y,(int)Math.floor(stand.getZ()));
            columns.computeIfAbsent(floor, unused->new ArrayList<>()).add(stand);
        }
        Map<String,Model> observed = new HashMap<>();
        for (var entry : columns.entrySet()) {
            var floor = entry.getKey();
            var below = current.getBlockState(floor);
            if (!BedBlocks.isBed(BuiltInRegistries.BLOCK.getKey(below.getBlock()).getPath())) continue;
            var stems = new ArrayList<Stem>();
            for (int dy=1;dy<=6;dy++) {
                var state=current.getBlockState(floor.above(dy));
                if (state.isAir()) break;
                // Never copy the greenhouse roof, glass, or surrounding construction.
                if (!CropIds.isCrop(BuiltInRegistries.BLOCK.getKey(state.getBlock()).getPath())) break;
                stems.add(new Stem(dy,state));
            }
            var model=assemble(floor,entry.getValue(),stems);
            if(model==null) continue;
            var previous=observed.get(model.id());
            if(previous==null || model.heads().size()+model.stems().size()>previous.heads().size()+previous.stems().size())
                observed.put(model.id(),model);
        }
        // Ordinary block crops also use their live block states. A named head always wins
        // over its support block, so a Lonelily stem cannot become a wheat template.
        for(int dx=0;dx<width;dx++)for(int dz=0;dz<depth;dz++) {
            var floor=new BlockPos(x+dx,y,z+dz);
            if(columns.containsKey(floor) || !current.hasChunkAt(floor))continue;
            if(!BedBlocks.isBed(BuiltInRegistries.BLOCK.getKey(current.getBlockState(floor).getBlock()).getPath()))continue;
            var first=current.getBlockState(floor.above());
            String id=GreenhouseCatalog.canonicalId(CropIds.fromBlockPath(BuiltInRegistries.BLOCK.getKey(first.getBlock()).getPath()));
            if(!GreenhouseCatalog.isKnown(id) || PlantIdentity.isMutation(id) || observed.containsKey(id))continue;
            var parts=new ArrayList<Stem>();
            for(int dy=1;dy<=6;dy++) {
                var state=current.getBlockState(floor.above(dy));
                if(!CropIds.isCrop(BuiltInRegistries.BLOCK.getKey(state.getBlock()).getPath()))break;
                parts.add(new Stem(dy,state));
            }
            observed.put(id,new Model(id,List.of(),List.copyOf(parts)));
        }
        for (var model : observed.values()) remember(model);
    }

    private Model assemble(BlockPos soil, List<ArmorStand> stands, List<Stem> stems) {
        if(stands.isEmpty() || stands.size()>16) return null;
        String id=PlantIdentity.id(stands.getFirst());
        if(stands.stream().anyMatch(s->!Objects.equals(id,PlantIdentity.id(s)))) return null;
        var heads=new ArrayList<Head>();
        for(var stand:stands) {
            var output=TagValueOutput.createWithContext(ProblemReporter.DISCARDING,stand.level().registryAccess());
            stand.saveWithoutId(output);
            heads.add(new Head(stand.getX()-soil.getX(),stand.getY()-soil.getY(),stand.getZ()-soil.getZ(),visualTag(output.buildResult())));
        }
        heads.sort(Comparator.comparingDouble(Head::y).thenComparingDouble(Head::x).thenComparingDouble(Head::z));
        stems.sort(Comparator.comparingInt(Stem::y));
        return new Model(id,List.copyOf(heads),List.copyOf(stems));
    }

    /** Keep render components only. No entity UUIDs, names, inventory, location or behaviour. */
    public static CompoundTag visualTag(CompoundTag source) {
        var out=new CompoundTag();
        for(String key:List.of("Pose","Rotation","Small","ShowArms","NoBasePlate"))
            if(source.contains(key)) out.put(key,source.get(key).copy());
        source.getCompound("equipment").ifPresent(equipment->{
            var onlyHead=new CompoundTag();
            if(equipment.contains("head")) onlyHead.put("head",equipment.get("head").copy());
            out.put("equipment",onlyHead);
        });
        source.getList("attributes").ifPresent(attributes->{
            var scale=new ListTag();
            for(var tag:attributes) if(tag instanceof CompoundTag attribute
                    && "minecraft:scale".equals(attribute.getStringOr("id",""))) scale.add(attribute.copy());
            out.put("attributes",scale);
        });
        out.putBoolean("Invisible",true); out.putBoolean("NoGravity",true);
        return out;
    }

    private static String signature(Model model) { return model.heads().toString()+model.stems().toString(); }
    private boolean remember(Model model) {
        var old=models.get(model.id());
        if(old!=null && signature(old).equals(signature(model))) return false;
        // A newly arriving single head cannot replace a previously complete multi-head assembly.
        if(old!=null && (old.heads().size()>model.heads().size() || old.stems().size()>model.stems().size())) return false;
        models.put(model.id(),model); revision++;
        LOGGER.info("Observed plant model {}: {} equipped parts, {} block parts",model.id(),model.heads().size(),model.stems().size());
        return true;
    }

}
