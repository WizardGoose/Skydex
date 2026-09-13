package com.skydex.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.skydex.SkydexTheme;
import com.skydex.capture.ItemIds;
import com.skydex.garden.GreenhouseScanner;
import com.skydex.garden.MutationNames;
import com.skydex.layout.CellStatus;
import com.skydex.layout.EstimateFormat;
import com.skydex.layout.GreenhouseLayout;
import com.skydex.layout.LayoutAnchor;
import com.skydex.layout.LayoutCell;
import com.skydex.layout.LayoutMatch;
import com.skydex.layout.LayoutPalette;
import com.skydex.layout.LayoutStore;
import com.skydex.location.LocationTracker;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderContext;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

import java.util.HashMap;
import java.util.Map;

/**
 * Draws the greenhouse layout on the island floor, and — when the projection is
 * switched on — draws it against what has actually been built.
 *
 * <p>Display only, and permanently so: this class knows where blocks <i>should</i>
 * go and never places one. That is the line between the Litematica category
 * (allowed) and an auto-placement macro (banned). Comparing the plan with the
 * world does not move that line, because reading the client's own loaded chunks
 * is what the greenhouse scanner already does and no packet is sent to learn any
 * of it.
 *
 * <p><b>Two modes, and the plain one is untouched.</b> With the projection off
 * every cell draws the same flat tile it always has. With it on, a cell the
 * world already satisfies drops to a green tile and a cell still owed shows
 * its packaged head or native crop preview. The switch is separate rather
 * than a replacement so nobody's overlay changes under them, and so the
 * per-second world read is only paid for by someone who asked for it.
 *
 * <p><b>The world is read on the client tick, never in {@link #render}.</b> The
 * comparison touches block states and an entity query, and doing that per frame
 * would repeat at sixty times the rate anything can actually change: a player
 * places blocks at human speed. So the tick builds an immutable
 * {@link LayoutProgress} on its own interval, publishes it to a volatile field,
 * and the render thread only ever reads a finished one. That is the same split
 * the greenhouse scanner uses, for the same reasons.
 *
 * <p>26.1 notes, because none of this matches older tutorials:
 * <ul>
 *   <li>{@code WorldRenderEvents} no longer exists. It is
 *       {@link LevelRenderEvents} in the {@code ...rendering.v1.level} package,
 *       and the callback receives a {@link LevelRenderContext}.</li>
 *   <li>{@code RenderType} moved to {@code renderer.rendertype}, and the static
 *       instances to the plural holder {@link RenderTypes}.</li>
 *   <li>The camera position comes off the render state
 *       ({@code levelState().cameraRenderState.pos}), not a Camera argument.</li>
 * </ul>
 */
public final class LayoutOverlayRenderer {

    /** Shrinks each tile so neighbouring cells read as separate squares. */
    private static final double INSET = 0.06;
    /** The ground marker is a smaller square inside the cell tile. */
    private static final double GROUND_INSET = 0.30;
    /**
     * The ghost block is pulled in further than the tile under it.
     *
     * <p>Two things come of the same number. Adjacent pending cells keep a
     * visible gap instead of merging into one slab, and the ghost reads as
     * hovering inside its cell rather than claiming to be a real block, which
     * matters when the player is deciding what is already placed.
     */
    private static final double GHOST_INSET = 0.12;
    /** Lift off the floor to avoid z-fighting with the block top face. */
    private static final double Y_LIFT = 0.02;
    private static final double GROUND_Y_LIFT = 0.03;
    /** How far the anchor command will look for a target block. */
    public static final double ANCHOR_REACH = 5.0;

    /**
     * How often the world is compared against the layout, in client ticks.
     *
     * <p>One second. Blocks are placed by hand, so this is already far faster
     * than the thing it is watching, and it keeps a block-state read per cell
     * plus one entity query well clear of mattering.
     */
    public static final int SCAN_INTERVAL_TICKS = 20;

    /**
     * Vertical slack when matching an armour stand to a cell. Same value the
     * greenhouse scanner uses, so the two agree about which stand is in a cell.
     */
    private static final int STAND_Y_SLACK = 4;

    private final LayoutStore layouts;
    private final LocationTracker location;
    private final PlantModelRenderer plants = new PlantModelRenderer();
    public PlantModelRenderer plants() { return plants; }

    private String lastHoveredKey;
    private long lastHoveredRefreshTick = Long.MIN_VALUE;
    private int scanTicks;

    /** Written by the client thread, read by the render thread. */
    private volatile LayoutProgress progress = LayoutProgress.NONE;

    public LayoutOverlayRenderer(LayoutStore layouts, LocationTracker location) {
        this.layouts = layouts;
        this.location = location;
    }

    /** The render thread is the least forgiving place to throw. */
    private final com.skydex.CaptureGuard guard = new com.skydex.CaptureGuard("layout overlay");
    /**
     * Fenced apart from the render pass. The scan is the half that touches
     * entity and block lookups, so a failure there must not also stop the
     * drawing, which would otherwise make the overlay vanish with no clue why.
     */
    private final com.skydex.CaptureGuard scanGuard =
            new com.skydex.CaptureGuard("layout progress scan");

    public void register() {
        // Deferred geometry must enter the collector before its render passes drain it.
        LevelRenderEvents.COLLECT_SUBMITS.register(
                context -> guard.run(() -> render(context)));
    }

    private long renderedFrames;
    public long renderedFrames() { return renderedFrames; }

    /** What the last scan concluded; never null. */
    public LayoutProgress progress() {
        return progress;
    }

    // ----------------------------------------------------------------- scan

    /** Call every client tick; compares on its own interval. */
    public void tick(Minecraft client) {
        scanGuard.run(() -> scanTick(client));
    }

    private void scanTick(Minecraft client) {
        if (client != null && client.level == null) plants.prepare(null,null,null);
        if (!layouts.isProjecting() || !isInGarden()
                || client == null || client.level == null) {
            // Dropped rather than kept stale: a snapshot that outlived the
            // conditions it was read under would keep colouring cells green
            // after the player left the island.
            progress = LayoutProgress.NONE;
            scanTicks = 0;
            return;
        }
        // Post-increment, so switching the projection on scans at once instead
        // of leaving the player looking at plain tiles for up to a second.
        if (scanTicks++ % SCAN_INTERVAL_TICKS != 0) {
            return;
        }
        progress = scan(client.level);
        var anchor = layouts.anchor();
        if (anchor != null) {
            plants.prepare(client.level,layouts.layout(),anchor);
        }
    }

    private LayoutProgress scan(ClientLevel level) {
        GreenhouseLayout layout = layouts.layout();
        LayoutAnchor anchor = layouts.anchor();
        if (layout == null || anchor == null || layout.cells().isEmpty()) {
            return LayoutProgress.NONE;
        }

        Map<Long, String> mutations = readMutationStands(level, layout, anchor);
        Map<Long, CellStatus> statuses = new HashMap<>();
        BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();

        for (LayoutCell cell : layout.cells()) {
            int worldX = anchor.worldX(cell);
            int worldZ = anchor.worldZ(cell);
            long key = LayoutProgress.pack(worldX, worldZ);

            // Mutations first, then the block underneath, which is the order the
            // greenhouse scanner reads a board in: a mutation stands on ground
            // that may still hold its base crop, and the mutation is the
            // truthful answer for the cell.
            String observed = mutations.get(key);
            if (observed == null) {
                observed = GreenhouseScanner.cropAt(level, pos, worldX, anchor.y(), worldZ);
            }
            statuses.put(key, LayoutMatch.statusOf(cell, observed));
        }
        return new LayoutProgress(statuses);
    }

    /**
     * Every identifiable mutation standing over the layout, by world column.
     *
     * <p>One entity query for the whole grid rather than one per cell: the
     * layout can be hundreds of cells and the query cost is in walking the
     * region, not in its size.
     */
    private static Map<Long, String> readMutationStands(ClientLevel level, GreenhouseLayout layout,
                                                        LayoutAnchor anchor) {
        int minX = Integer.MAX_VALUE;
        int minZ = Integer.MAX_VALUE;
        int maxX = Integer.MIN_VALUE;
        int maxZ = Integer.MIN_VALUE;
        for (LayoutCell cell : layout.cells()) {
            int worldX = anchor.worldX(cell);
            int worldZ = anchor.worldZ(cell);
            minX = Math.min(minX, worldX);
            maxX = Math.max(maxX, worldX);
            minZ = Math.min(minZ, worldZ);
            maxZ = Math.max(maxZ, worldZ);
        }

        AABB box = new AABB(
                minX, anchor.y() - STAND_Y_SLACK, minZ,
                maxX + 1.0, anchor.y() + STAND_Y_SLACK, maxZ + 1.0);

        Map<Long, String> found = new HashMap<>();
        for (ArmorStand stand : level.getEntitiesOfClass(ArmorStand.class, box)) {
            String id = mutationIdOf(stand);
            if (id == null) {
                continue;
            }
            // First stand in a column wins, matching how the scanner fills a
            // cell once and then leaves it alone.
            found.putIfAbsent(LayoutProgress.pack(
                    (int) Math.floor(stand.getX()), (int) Math.floor(stand.getZ())), id);
        }
        return found;
    }

    /**
     * Identify a crop or mutation through the same worn-item-first route as the scanner.
     *
     * <p>The tiers themselves live in {@link MutationNames} and are called, not
     * copied, so the overlay and the scanner cannot come to different
     * conclusions about the same stand. What is deliberately absent here is the
     * scanner's bookkeeping — counting loose matches and remembering unknown
     * heads — because that feeds the diagnostics the site reads, and drawing a
     * marker needs only the answer.
     */
    private static String mutationIdOf(ArmorStand stand) {
        return com.skydex.garden.PlantIdentity.id(stand);
    }

    // --------------------------------------------------------------- drawing

    private void render(LevelRenderContext context) {
        if (!layouts.isRenderable() || !isInGarden()) {
            lastHoveredKey = null;
            return;
        }
        Minecraft client = Minecraft.getInstance();
        if (client.level == null || client.player == null) {
            return;
        }
        GreenhouseLayout layout = layouts.layout();
        LayoutAnchor anchor = layouts.anchor();
        if (layout == null || anchor == null || layout.cells().isEmpty()) {
            return;
        }

        boolean projecting = layouts.projectionEnabled();
        // Read once. The tick thread may replace it mid-pass, and half a frame
        // drawn against one snapshot and half against another would flicker.
        LayoutProgress snapshot = progress;

        Vec3 camera = context.levelState().cameraRenderState.pos;
        PoseStack poseStack = context.poseStack();
        SubmitNodeCollector submits = context.submitNodeCollector();
        // debugQuads: QUADS topology, translucent blending, depth-tested
        // (so the ghost reads as lying on the floor and is occluded by walls),
        // and back-face culling off.
        RenderType renderType = RenderTypes.debugQuads();
        BlockPos targeted = targetedBlock(client);
        LayoutCell hovered = null;
        CellStatus hoveredStatus = CellStatus.EMPTY;
        double surfaceY = anchor.y() + 1.0;

        for (LayoutCell cell : layout.cells()) {
            int worldX = anchor.worldX(cell);
            int worldZ = anchor.worldZ(cell);
            CellStatus status = projecting ? snapshot.at(worldX, worldZ) : CellStatus.EMPTY;
            if (!layouts.showsCell(cell)) continue;
            if (targeted != null && targeted.getX() == worldX && targeted.getZ() == worldZ
                    && Math.abs(targeted.getY() - anchor.y()) <= 1) {
                hovered = cell;
                hoveredStatus = status;
            }
        }

        poseStack.pushPose();
        // World space -> camera-relative render space. The submit collector
        // snapshots this pose for the later draw pass in both 26.1.2 and 26.2.
        poseStack.translate(-camera.x, -camera.y, -camera.z);
        submits.submitCustomGeometry(poseStack, renderType, (pose, consumer) -> {
            renderedFrames++;
            for (LayoutCell cell : layout.cells()) {
                if (!layouts.showsCell(cell)) continue;
                int worldX = anchor.worldX(cell);
                int worldZ = anchor.worldZ(cell);
                CellStatus status = projecting ? snapshot.at(worldX, worldZ) : CellStatus.EMPTY;

                if (projecting) {
                    // Placement state is a thin outline, never a glowing tile
                    // standing in for the textured preview rendered below.
                    int color = status.isDone() ? LayoutPalette.DONE_FILL
                            : status == CellStatus.MISMATCH ? LayoutPalette.MISMATCH_FILL
                            : LayoutPalette.fill(cell);
                    outline(consumer, pose, worldX, worldZ, surfaceY + Y_LIFT, INSET, color);
                    continue;
                }

                int fill = projecting && status == CellStatus.MISMATCH
                        ? LayoutPalette.MISMATCH_FILL : LayoutPalette.fill(cell);
                quad(consumer, pose, worldX, worldZ, surfaceY + Y_LIFT, INSET, fill);
                // Unknown assemblies retain a floor marker, never a fabricated crop-shaped model.
                if (cell.hasGround()) {
                    quad(consumer, pose, worldX, worldZ, surfaceY + GROUND_Y_LIFT, GROUND_INSET,
                            projecting ? LayoutPalette.GROUND_NOTE_FILL : LayoutPalette.GROUND_FILL);
                }
            }
        });

        poseStack.popPose();

        if (projecting) plants.render(context, snapshot, anchor.y(), layouts.showMutations());

        showHoveredLabel(client, hovered, hoveredStatus, projecting, snapshot);
    }

    /**
     * A greenhouse only exists in the Garden. Keeping this gate shared prevents
     * the scan and draw passes from silently disagreeing about the same world.
     */
    boolean isInGarden() {
        return location.isOnGarden();
    }

    /**
     * One flat tile.
     *
     * <p>A single winding is enough: {@link RenderTypes#debugQuads()} disables
     * back-face culling, so the tile reads from above and from below. Its
     * sibling {@code debugFilledBox()} does cull, which would make the marker
     * vanish when viewed from the wrong side.
     */
    private static void quad(VertexConsumer consumer, PoseStack.Pose pose,
                             int blockX, int blockZ, double y, double inset, int argb) {
        float x0 = (float) (blockX + inset);
        float x1 = (float) (blockX + 1.0 - inset);
        float z0 = (float) (blockZ + inset);
        float z1 = (float) (blockZ + 1.0 - inset);
        float fy = (float) y;

        int a = LayoutPalette.alpha(argb);
        int r = LayoutPalette.red(argb);
        int g = LayoutPalette.green(argb);
        int b = LayoutPalette.blue(argb);

        consumer.addVertex(pose, x0, fy, z0).setColor(r, g, b, a);
        consumer.addVertex(pose, x0, fy, z1).setColor(r, g, b, a);
        consumer.addVertex(pose, x1, fy, z1).setColor(r, g, b, a);
        consumer.addVertex(pose, x1, fy, z0).setColor(r, g, b, a);
    }

    private static void outline(VertexConsumer consumer, PoseStack.Pose pose,
                                int blockX, int blockZ, double y, double inset, int argb) {
        float x0=(float)(blockX+inset), x1=(float)(blockX+1-inset);
        float z0=(float)(blockZ+inset), z1=(float)(blockZ+1-inset), fy=(float)y;
        float edge=0.018f;
        float[][] edges={{x0,z0,x1,z0+edge},{x0,z1-edge,x1,z1},
                {x0,z0+edge,x0+edge,z1-edge},{x1-edge,z0+edge,x1,z1-edge}};
        for(float[] e:edges) {
            consumer.addVertex(pose,e[0],fy,e[1]).setColor(argb);
            consumer.addVertex(pose,e[0],fy,e[3]).setColor(argb);
            consumer.addVertex(pose,e[2],fy,e[3]).setColor(argb);
            consumer.addVertex(pose,e[2],fy,e[1]).setColor(argb);
        }
    }

    /**
     * The ghost block: six faces enclosing the space the thing will occupy.
     *
     * <p>Built out of the same quads as the floor tiles rather than out of
     * lines. It is the volume that says "a block goes here" — an outline says
     * "look at this space" — and staying on the one render type the overlay
     * already uses keeps every marker blending against the world by identical
     * rules.
     *
     * <p>Culling is off, so winding does not matter; each face only has to trace
     * its four corners in a ring rather than cross itself.
     */
    private static void box(VertexConsumer consumer, PoseStack.Pose pose,
                            int blockX, int blockZ, double yBottom, double yTop,
                            double inset, int argb) {
        float x0 = (float) (blockX + inset);
        float x1 = (float) (blockX + 1.0 - inset);
        float z0 = (float) (blockZ + inset);
        float z1 = (float) (blockZ + 1.0 - inset);
        float y0 = (float) yBottom;
        float y1 = (float) yTop;

        int a = LayoutPalette.alpha(argb);
        int r = LayoutPalette.red(argb);
        int g = LayoutPalette.green(argb);
        int b = LayoutPalette.blue(argb);

        // floor and ceiling
        face(consumer, pose, x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, r, g, b, a);
        face(consumer, pose, x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0, r, g, b, a);
        // the two faces across Z
        face(consumer, pose, x0, y0, z0, x0, y1, z0, x1, y1, z0, x1, y0, z0, r, g, b, a);
        face(consumer, pose, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, r, g, b, a);
        // the two faces across X
        face(consumer, pose, x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, r, g, b, a);
        face(consumer, pose, x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1, r, g, b, a);
    }

    /** Four corners, one colour. Spelled out because a quad has no shorter form. */
    private static void face(VertexConsumer consumer, PoseStack.Pose pose,
                             float ax, float ay, float az, float bx, float by, float bz,
                             float cx, float cy, float cz, float dx, float dy, float dz,
                             int r, int g, int b, int a) {
        consumer.addVertex(pose, ax, ay, az).setColor(r, g, b, a);
        consumer.addVertex(pose, bx, by, bz).setColor(r, g, b, a);
        consumer.addVertex(pose, cx, cy, cz).setColor(r, g, b, a);
        consumer.addVertex(pose, dx, dy, dz).setColor(r, g, b, a);
    }

    /** The block under the crosshair, or null when looking at nothing. */
    private static BlockPos targetedBlock(Minecraft client) {
        HitResult hit = client.hitResult;
        if (hit != null && hit.getType() == HitResult.Type.BLOCK && hit instanceof BlockHitResult block) {
            return block.getBlockPos();
        }
        return null;
    }

    /**
     * Name the cell the player is looking at, on the action bar.
     *
     * <p>Refreshed while the same cell remains targeted, since Minecraft expires
     * action-bar messages. While the projection is on, the cell's state counts
     * as part of the target: a cell that turns green under the player's gaze has
     * become different news, and keying only on position would leave the old
     * words sitting there.
     *
     * <p>The label stays on the action bar rather than floating in the world.
     * Naming every pending cell where it stands would be unreadable at the size
     * a greenhouse actually is, and one line where the player is already looking
     * says the same thing without covering the grid they are reading.
     *
     * <p>The growth estimate rides on this same line, for the same reason and
     * one more: this is already the mod's only per-cell surface, so a time put
     * anywhere else would be a second place to look for information about the
     * cell under the crosshair. It is a hedge rather than a clock, and it is
     * only ever shown on a cell still owed. See {@link EstimateFormat}.
     */
    private void showHoveredLabel(Minecraft client, LayoutCell hovered, CellStatus status,
                                  boolean projecting, LayoutProgress snapshot) {
        if (hovered == null) {
            lastHoveredKey = null;
            return;
        }
        // The estimate joins the key so a re-pushed layout that reprices this
        // cell replaces the line, rather than leaving the old time sitting there
        // because the cell and its status happen to be unchanged.
        String key = projecting ? hovered.key() + " " + status + " " + hovered.seconds() : hovered.key();
        long tick = client.level.getGameTime();
        if (key.equals(lastHoveredKey) && tick >= lastHoveredRefreshTick
                && tick - lastHoveredRefreshTick < 10) {
            return;
        }
        lastHoveredKey = key;
        lastHoveredRefreshTick = tick;

        MutableComponent label = Component.literal(hovered.displayName())
                .withStyle(Style.EMPTY.withColor(SkydexTheme.rgb(
                        projecting && status.isDone() ? SkydexTheme.SUCCESS : SkydexTheme.TEXT)));

        if (projecting) {
            label = label.append(Component.literal("  " + describe(status))
                    .withStyle(Style.EMPTY.withColor(SkydexTheme.rgb(colourFor(status)))));
            // The site's estimate, on the two conditions that make it true.
            //
            // Still owed, because a time on a cell that is already grown is a
            // countdown to something that has happened. And priced, because the
            // site leaves the field out for anything its growth model cannot
            // answer for, so there is nothing here to fall back on.
            //
            // The rule itself lives beside the wording, in a class with no
            // Minecraft types, so both are pinned by tests rather than by
            // launching the game and looking at the bar.
            if (EstimateFormat.shows(projecting, status, hovered)) {
                label = label.append(Component.literal("  " + EstimateFormat.format(hovered.seconds()))
                        .withStyle(Style.EMPTY.withColor(SkydexTheme.rgb(SkydexTheme.ACCENT))));
            }
            if (!snapshot.isEmpty()) {
                label = label.append(Component.literal("  " + snapshot.summary())
                        .withStyle(Style.EMPTY.withColor(SkydexTheme.rgb(SkydexTheme.MUTED))));
            }
        } else if (hovered.hasGround()) {
            // Coloured to match the marker it describes: the ground square on
            // the floor and the words naming it are then obviously the same
            // thing, which matters most when several cells are in view.
            label = label.append(Component.literal("  (" + hovered.ground() + ")")
                    .withStyle(Style.EMPTY.withColor(SkydexTheme.rgb(SkydexTheme.SUCCESS))));
        }
        setOverlayMessage(client, label);
    }

    /** Minecraft 26.2 moved action-bar messages from Gui to Gui.hud. */
    private static void setOverlayMessage(Minecraft client, Component message) {
        try {
            Object owner = client.gui;
            java.lang.reflect.Method method;
            try {
                method = owner.getClass().getMethod("setOverlayMessage", Component.class, boolean.class);
            } catch (NoSuchMethodException movedIn262) {
                owner = owner.getClass().getField("hud").get(owner);
                method = owner.getClass().getMethod("setOverlayMessage", Component.class, boolean.class);
            }
            method.invoke(owner, message, false);
        } catch (ReflectiveOperationException ignored) {
            // The helper geometry is still useful if a later patch moves the
            // optional hover label again.
        }
    }

    /** Plain words for a state, so the colour is never the only carrier. */
    private static String describe(CellStatus status) {
        return switch (status) {
            case DONE -> "done";
            case EMPTY -> "not placed yet";
            // Deliberately not called wrong. The usual cause is a mutation's
            // base crop sitting in the cell waiting to turn, which is the job
            // going correctly rather than a mistake.
            case MISMATCH -> "something else is here";
        };
    }

    private static int colourFor(CellStatus status) {
        return switch (status) {
            case DONE -> SkydexTheme.SUCCESS;
            case EMPTY -> SkydexTheme.MUTED;
            case MISMATCH -> SkydexTheme.DANGER;
        };
    }

    /**
     * Where {@code /skydex layout anchor} puts the origin: the block the
     * player is looking at within {@link #ANCHOR_REACH}, else the block they
     * are standing on.
     */
    public static BlockPos pickAnchorBlock(Minecraft client) {
        if (client.player == null) {
            return null;
        }
        HitResult hit = client.player.pick(ANCHOR_REACH, 0.0f, false);
        if (hit != null && hit.getType() == HitResult.Type.BLOCK && hit instanceof BlockHitResult block) {
            return block.getBlockPos();
        }
        return client.player.blockPosition().below();
    }
}
