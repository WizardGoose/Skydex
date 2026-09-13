package com.skydex.render;

import com.skydex.garden.GreenhouseHeads;
import com.skydex.layout.*;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderContext;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.EntityModelSet;
import net.minecraft.client.model.object.skull.SkullModelBase;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.blockentity.SkullBlockRenderer;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.SkullBlock;
import net.minecraft.world.level.block.state.BlockState;
import java.util.*;

/** Head-only custom plant previews and native block crops, independent of observed assemblies. */
public final class PlantModelRenderer {
    private record Instance(PlantPlacement plant, Identifier skin, BlockState block) {}
    private List<Instance> instances = List.of();
    private ClientLevel level;
    private GreenhouseLayout lastLayout;
    private LayoutAnchor lastAnchor;
    private EntityModelSet modelSet;
    private SkullModelBase skull;
    private long submittedParts;
    private long submittedMutationParts;
    public long submittedParts() { return submittedParts; }
    public long submittedMutationParts() { return submittedMutationParts; }
    public int previewCount() { return instances.size(); }

    public void prepare(ClientLevel current, GreenhouseLayout layout, LayoutAnchor anchor) {
        if (current == null || layout == null || anchor == null) {
            instances = List.of(); level = current; lastLayout = null; lastAnchor = null;
            return;
        }
        if (current == level && layout == lastLayout && anchor == lastAnchor) return;
        level = current; lastLayout = layout; lastAnchor = anchor;
        var prepared = new ArrayList<Instance>();
        for (var plant : PlantPlacement.from(layout)) {
            String texture = GreenhouseHeads.texturePath(plant.id());
            BlockState block = nativeCrop(plant.id());
            if (texture != null || block != null)
                prepared.add(new Instance(plant, texture == null ? null : Identifier.fromNamespaceAndPath("skydex", texture), block));
        }
        instances = List.copyOf(prepared);
    }

    private static BlockState nativeCrop(String id) {
        return switch (id) {
            case "wheat" -> Blocks.WHEAT.defaultBlockState().setValue(net.minecraft.world.level.block.CropBlock.AGE, 7);
            case "carrot" -> Blocks.CARROTS.defaultBlockState().setValue(net.minecraft.world.level.block.CropBlock.AGE, 7);
            case "potato" -> Blocks.POTATOES.defaultBlockState().setValue(net.minecraft.world.level.block.CropBlock.AGE, 7);
            case "nether_wart" -> Blocks.NETHER_WART.defaultBlockState().setValue(net.minecraft.world.level.block.NetherWartBlock.AGE, 3);
            case "sugar_cane" -> Blocks.SUGAR_CANE.defaultBlockState();
            case "fire" -> Blocks.FIRE.defaultBlockState();
            case "dead_plant" -> Blocks.DEAD_BUSH.defaultBlockState();
            default -> null;
        };
    }

    public void render(LevelRenderContext context, LayoutProgress progress, int bedY, boolean showMutations) {
        if (lastAnchor == null) return;
        var client = Minecraft.getInstance();
        if (modelSet != client.getEntityModels()) {
            modelSet = client.getEntityModels();
            skull = SkullBlockRenderer.createModel(modelSet, SkullBlock.Types.PLAYER);
        }
        var camera = context.levelState().cameraRenderState;
        var pose = context.poseStack();
        var collector = context.submitNodeCollector();
        for (var instance : instances) {
            var plant = instance.plant();
            if (plant.mutation() && !showMutations) continue;
            var status = plant.status(progress, lastAnchor);
            if (status.isDone()) continue;
            double x = plant.centerX(lastAnchor), z = plant.centerZ(lastAnchor);
            if (camera.pos.distanceToSqr(new net.minecraft.world.phys.Vec3(x, bedY, z)) > 64 * 64) continue;
            var bounds = new PlantBounds();
            pose.pushPose();
            // Vanilla's floor-head transform centres a half-block skull inside this block.
            pose.translate(x - .5 - camera.pos.x, bedY + 1.01 - camera.pos.y, z - .5 - camera.pos.z);
            if (instance.skin() != null && skull != null) {
                pose.mulPose(SkullBlockRenderer.TRANSFORMATIONS.freeTransformations(0));
                SkullBlockRenderer.submitSkull(0, pose, PlantGhostCollector.wrap(collector, instance.skin(), bounds),
                        0xF000F0, skull, RenderTypes.entityTranslucent(instance.skin()), 0, null);
            } else if (instance.block() != null) {
                var state = instance.block();
                var parts = new ArrayList<net.minecraft.client.renderer.block.dispatch.BlockStateModelPart>();
                client.getModelManager().getBlockStateModelSet().get(state)
                        .collectParts(net.minecraft.util.RandomSource.create(42), parts);
                int[] tints = client.getBlockColors().getTintSources(state).stream()
                        .mapToInt(t -> t.color(state)).toArray();
                PlantGhostCollector.wrap(collector, null, bounds).submitBlockModel(pose,
                        RenderTypes.translucentMovingBlock(), parts, tints, 0xF000F0, OverlayTexture.NO_OVERLAY, 0);
            }
            pose.popPose();
            if (bounds.box() != null) {
                bounds.outline(collector, status == CellStatus.MISMATCH ? 0xFFFF5D68
                        : plant.mutation() ? 0xFFF4B63F : 0xFF24C3EF);
                submittedParts++;
                if (plant.mutation()) submittedMutationParts++;
            }
        }
    }
}
