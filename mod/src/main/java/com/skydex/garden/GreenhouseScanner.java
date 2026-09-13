package com.skydex.garden;

import com.skydex.capture.ItemIds;
import com.skydex.config.SkydexConfig;
import com.skydex.data.GreenhouseBoard;
import com.skydex.data.GreenhouseCell;
import com.skydex.data.SnapshotStore;
import com.skydex.data.StoreManager;
import com.skydex.location.LocationTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

/**
 * Reads the greenhouse board out of the world, passively.
 *
 * <p>Everything here is client state the server has already sent: loaded chunks
 * and tracked entities. No command is sent, no packet is requested, nothing is
 * placed or broken.
 *
 * <p><b>The bed is found, not calculated.</b> The first version computed where
 * the plantable grid ought to be from the player's coordinates and two constants
 * borrowed from other people's mods. On the owner's real greenhouse that put the
 * grid at x=91 z=-5 while the actual planted bed sat visibly to one side, and
 * the scan read zero cells while every corroboration passed. That is the failure
 * arithmetic cannot detect from the inside: a number wrong by a few blocks still
 * produces a confident answer.
 *
 * <p>So position now comes from evidence, in order of authority:
 * <ol>
 *   <li><b>A manual anchor</b>, if the player set one. They can see the bed; the
 *       mod is inferring it. If detection disagrees, the player wins and the
 *       disagreement is reported.</li>
 *   <li><b>The bed itself</b>, found by searching around the Carpenter for a
 *       connected patch of plantable floor. Its bounding box gives both origin
 *       and dimensions, so a greenhouse that is not 10x10 is read correctly
 *       rather than cropped to a guess.</li>
 * </ol>
 * The old constants survive only as {@link GardenGrid#GREENHOUSE_Y}, a hint used
 * to describe drift, never to place the grid.
 *
 * <p>Finding the bed is also what makes an empty board honest. An empty reading
 * used to be ambiguous, because it could mean either an empty greenhouse or a
 * misplaced grid. Having located the floor, "nothing is planted" is a real
 * observation and is sent as one.
 */
public final class GreenhouseScanner {

    private static final Logger LOGGER = LoggerFactory.getLogger("Skydex");

    /** Rescan every 2 seconds. Cheap, and covers arriving without a change event. */
    public static final int SCAN_INTERVAL_TICKS = 40;

    /** Substring that identifies the greenhouse NPC, matched case-insensitively. */
    public static final String CARPENTER_NAME = "CARPENTER";

    /** Horizontal radius of the bed search around the Carpenter. */
    public static final int SEARCH_RADIUS = 15;

    /** Y levels searched, relative to the Carpenter's feet. */
    public static final int SEARCH_BELOW = 6;
    public static final int SEARCH_ABOVE = 3;

    /** A patch smaller than this is decoration, not a bed. */
    public static final int MIN_BED_CELLS = 16;

    /** How solid the patch must be inside its own bounding box. */
    public static final double MIN_BED_FILL = 0.55;

    /** Largest bed we will believe, so a whole dirt floor is not mistaken for one. */
    public static final int MAX_BED_SIDE = 24;

    /** Vertical slack when matching an armour stand to a cell. */
    private static final int STAND_Y_SLACK = 4;

    /** How far to look for the Carpenter from the player. */
    private static final int CARPENTER_Y_RANGE = 40;
    private static final int CARPENTER_RADIUS = 48;

    private final StoreManager stores;
    private final LocationTracker location;
    private final SkydexConfig config;

    /** Published by the client thread, read by the command thread. */
    private volatile GreenhouseDiagnostics diagnostics = GreenhouseDiagnostics.idle();

    private int ticks;
    /** Last status written to the log, so a repeating condition warns once. */
    private GreenhouseDiagnostics.Status lastLoggedStatus;

    /**
     * Carpenter position the cached bed belongs to, as "x,y,z".
     *
     * <p>The search is the expensive part of a scan, and the Carpenter does not
     * wander, so it runs on first sight and then not again until the NPC moves.
     * That is what keeps a rescan every two seconds nearly free while the player
     * stands in the greenhouse.
     */
    private String verifiedForCarpenter;
    private Located cachedBed;
    private ClientLevel scanLevel;
    private SnapshotStore observedStore;
    private GreenhouseBoard liveBoard;

    /** A stalled or failed scan must not leave actionable placement advice behind. */
    private static final long LIVE_BOARD_MAX_AGE_MS = 5_000;

    public GreenhouseScanner(StoreManager stores, LocationTracker location, SkydexConfig config) {
        this.stores = stores;
        this.location = location;
        this.config = config;
    }

    public GreenhouseDiagnostics diagnostics() {
        return diagnostics;
    }

    /** Current-world evidence only. Persisted snapshots remain available for export. */
    public GreenhouseBoard currentBoard(Minecraft client) {
        if (client == null || client.player == null || client.level == null
                || client.level != scanLevel || !config.captureEnabled || !location.isOnGarden()
                || liveBoard == null || stores.active() != observedStore) {
            return null;
        }
        long age = System.currentTimeMillis() - liveBoard.observedAt();
        return age >= 0 && age <= LIVE_BOARD_MAX_AGE_MS ? liveBoard : null;
    }

    private void updateWorld(Minecraft client) {
        ClientLevel level = client == null ? null : client.level;
        if (level != scanLevel) {
            reset();
            scanLevel = level;
        }
    }

    /** Call every client tick; scans on its own interval. */
    public void tick(Minecraft client) {
        updateWorld(client);
        if (!config.captureEnabled || !location.isOnGarden() || stores.active() != observedStore) {
            liveBoard = null;
        }
        if (++ticks % SCAN_INTERVAL_TICKS != 0) {
            return;
        }
        scan(client);
    }

    // ----------------------------------------------------------------- scan

    void scan(Minecraft client) {
        updateWorld(client);
        liveBoard = null;
        if (!config.captureEnabled || client == null || client.player == null || client.level == null
                || !location.isOnSkyBlock()) {
            diagnostics = GreenhouseDiagnostics.idle();
            return;
        }
        long now = System.currentTimeMillis();
        if (!GardenGrid.isInsideGarden(client.player.getX(), client.player.getZ())) {
            diagnostics = GreenhouseDiagnostics.outsideGarden(now);
            return;
        }
        ClientLevel level = client.level;

        // The greenhouse NPC establishes that there is a greenhouse at all, and
        // anchors the search for its bed.
        Entity carpenter = findCarpenter(level,
                client.player.getX(), client.player.getY(), client.player.getZ());
        if (carpenter == null) {
            diagnostics = GreenhouseDiagnostics.noGreenhouse(now);
            return;
        }

        // The sidebar has to agree this is the Garden, or the Hub's own
        // Carpenter would produce a fictional board. Checked before the search
        // so standing in the Hub costs nothing.
        if (!location.isOnGarden()) {
            diagnostics = GreenhouseDiagnostics.offGardenBoard(now, location.area());
            logOnce(diagnostics);
            return;
        }

        Located bed = locate(level, carpenter);
        if (bed == null) {
            diagnostics = GreenhouseDiagnostics.noBed(now, describeFailedSearch(level, carpenter));
            logOnce(diagnostics);
            return;
        }

        Scan result = readBoard(level, bed);
        GreenhouseBoard board = new GreenhouseBoard(now, bed.width, bed.height, result.cells);

        SnapshotStore store = stores.active();
        GreenhouseDiagnostics d;
        if (store == null) {
            d = GreenhouseDiagnostics.heldNoProfile(now, bed.source,
                    bed.originX, bed.originZ, bed.bedY, bed.width, bed.height, board.cellCount());
        } else {
            store.recordGreenhouse(board);
            observedStore = store;
            liveBoard = board;
            d = GreenhouseDiagnostics.observed(now, bed.source, bed.originX, bed.originZ,
                    bed.bedY, bed.width, bed.height, board.cellCount(), result.looseMatches,
                    result.unknownHeads(), bed.note);
            lastLoggedStatus = null;
        }
        diagnostics = bed.measured.isEmpty() ? d : d.withMeasuredOffset(bed.measured);
    }

    /**
     * Where the bed is, by the cheapest route that is actually trustworthy.
     *
     * <p>Order matters and is the point of the design:
     * <ol>
     *   <li>a bed already found for this same Carpenter is reused, so repeated
     *       scans cost nothing;</li>
     *   <li>if the Carpenter offset is known, the bed is placed straight from
     *       the NPC's feet, then verified once against a real search;</li>
     *   <li>otherwise the bed is searched for, and the offset it implies is
     *       measured and reported so it can become the constant.</li>
     * </ol>
     *
     * <p>When placement and search disagree, the <b>search wins</b>. A found bed
     * is evidence; an offset is a generalisation from one greenhouse, and the
     * whole reason the previous approach failed was trusting a generalisation
     * over what was actually there.
     */
    private Located locate(ClientLevel level, Entity carpenter) {
        int cx = (int) Math.floor(carpenter.getX());
        int cy = (int) Math.floor(carpenter.getY());
        int cz = (int) Math.floor(carpenter.getZ());
        String key = cx + "," + cy + "," + cz;

        if (key.equals(verifiedForCarpenter) && cachedBed != null) {
            return cachedBed;
        }

        Located found = findBed(level, carpenter);
        Located result;
        if (found != null) {
            String measured = GreenhouseOffset.describeMeasured(cx, cy, cz,
                    found.originX, found.bedY, found.originZ, found.width, found.height);
            if (GreenhouseOffset.isKnown()
                    && !GreenhouseOffset.agreesWith(cx, cy, cz, found.originX, found.bedY, found.originZ)) {
                // Loud on purpose: the constant has drifted, and the found bed
                // is what gets used until it is corrected.
                LOGGER.warn("Skydex greenhouse: the Carpenter offset disagrees with the real bed. "
                        + "Measured {}. Using the bed that was actually found.", measured);
            } else if (!GreenhouseOffset.isKnown()) {
                LOGGER.info("Skydex greenhouse offset measured: {}. "
                        + "Report this line so it can become the built-in constant.", measured);
            }
            result = found.withMeasured(measured);
        } else if (GreenhouseOffset.isKnown()) {
            // Nothing found, but the structure is known well enough to place it.
            result = new Located(
                    GreenhouseOffset.originX(cx), GreenhouseOffset.originZ(cz),
                    GreenhouseOffset.bedY(cy), GreenhouseOffset.WIDTH, GreenhouseOffset.HEIGHT,
                    GreenhouseDiagnostics.Source.CARPENTER,
                    "placed from the Carpenter, no bed found to confirm it", "");
        } else {
            result = null;
        }

        verifiedForCarpenter = key;
        cachedBed = result;
        return result;
    }

    private void logOnce(GreenhouseDiagnostics d) {
        if (d.status() == lastLoggedStatus) {
            return;
        }
        lastLoggedStatus = d.status();
        LOGGER.warn("Skydex captured no greenhouse data: {}", d.summary());
    }

    // --------------------------------------------------------------- finding

    /** A located bed, in world coordinates. */
    private static final class Located {
        final int originX;
        final int originZ;
        final int bedY;
        final int width;
        final int height;
        final GreenhouseDiagnostics.Source source;
        final String note;
        /** The Carpenter-relative offset this bed implies, when it was searched for. */
        final String measured;

        Located(int originX, int originZ, int bedY, int width, int height,
                GreenhouseDiagnostics.Source source, String note, String measured) {
            this.originX = originX;
            this.originZ = originZ;
            this.bedY = bedY;
            this.width = width;
            this.height = height;
            this.source = source;
            this.note = note == null ? "" : note;
            this.measured = measured == null ? "" : measured;
        }

        Located withMeasured(String value) {
            return new Located(originX, originZ, bedY, width, height, source, note, value);
        }
    }

    /**
     * The greenhouse NPC near the player.
     *
     * <p>Only an entity's own custom name counts, never a player's display name,
     * so somebody nicknamed "Carpenter" cannot conjure a greenhouse.
     */
    private static Entity findCarpenter(ClientLevel level, double px, double py, double pz) {
        AABB around = new AABB(
                px - CARPENTER_RADIUS, py - CARPENTER_Y_RANGE, pz - CARPENTER_RADIUS,
                px + CARPENTER_RADIUS, py + CARPENTER_Y_RANGE, pz + CARPENTER_RADIUS);
        List<Entity> found = level.getEntities((Entity) null, around, GreenhouseScanner::isCarpenter);
        return found.isEmpty() ? null : found.get(0);
    }

    static boolean isCarpenter(Entity entity) {
        if (entity == null || entity instanceof net.minecraft.world.entity.player.Player) {
            return false;
        }
        if (!entity.hasCustomName()) {
            return false;
        }
        String name = ItemIds.strip(entity.getCustomName()).toUpperCase(Locale.ROOT);
        return name.contains(CARPENTER_NAME);
    }

    /**
     * Search for the planting bed around the Carpenter.
     *
     * <p>Every Y level in range is tried and the largest convincing patch wins.
     * The old hardcoded level gets no special weight, because it has already been
     * wrong once and weighting it would only make the same mistake stickier.
     */
    private Located findBed(ClientLevel level, Entity carpenter) {
        int cx = (int) Math.floor(carpenter.getX());
        int cy = (int) Math.floor(carpenter.getY());
        int cz = (int) Math.floor(carpenter.getZ());
        int size = SEARCH_RADIUS * 2 + 1;
        BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();

        BedShape.Bed best = null;
        int bestY = 0;
        for (int y = cy - SEARCH_BELOW; y <= cy + SEARCH_ABOVE; y++) {
            boolean[][] floor = new boolean[size][size];
            for (int dx = 0; dx < size; dx++) {
                for (int dz = 0; dz < size; dz++) {
                    pos.set(cx - SEARCH_RADIUS + dx, y, cz - SEARCH_RADIUS + dz);
                    BlockPos above = pos.above();
                    floor[dx][dz] = BedBlocks.isExposedBed(pathOf(level, pos),
                            pathOf(level, above), level.getBlockState(above).isSolidRender());
                }
            }
            BedShape.Bed patch = BedShape.largestPatch(floor);
            if (patch == null || !patch.isConvincing(MIN_BED_CELLS, MIN_BED_FILL)
                    || patch.width() > MAX_BED_SIDE || patch.height() > MAX_BED_SIDE) {
                continue;
            }
            if (best == null || patch.cells() > best.cells()) {
                best = patch;
                bestY = y;
            }
        }
        if (best == null) {
            return null;
        }
        return new Located(
                cx - SEARCH_RADIUS + best.minX(),
                cz - SEARCH_RADIUS + best.minZ(),
                bestY, best.width(), best.height(),
                GreenhouseDiagnostics.Source.DETECTED, "", "");
    }

    /**
     * What the search actually saw, so a failure is actionable.
     *
     * <p>"No bed found" on its own is nothing the owner can act on. The block
     * types that were there instead are: if the real floor is made of something
     * {@link BedBlocks} does not know about, this names it, and one playtest
     * closes the gap.
     */
    private String describeFailedSearch(ClientLevel level, Entity carpenter) {
        int cx = (int) Math.floor(carpenter.getX());
        int cy = (int) Math.floor(carpenter.getY());
        int cz = (int) Math.floor(carpenter.getZ());
        int size = SEARCH_RADIUS * 2 + 1;
        Map<String, Integer> seen = new TreeMap<>();
        BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();

        // Sampled every other block: this only has to name the palette, and it
        // runs on the client thread.
        for (int y = cy - SEARCH_BELOW; y <= cy + SEARCH_ABOVE; y++) {
            for (int dx = 0; dx < size; dx += 2) {
                for (int dz = 0; dz < size; dz += 2) {
                    pos.set(cx - SEARCH_RADIUS + dx, y, cz - SEARCH_RADIUS + dz);
                    if (level.getBlockState(pos).isAir()) {
                        continue;
                    }
                    seen.merge(pathOf(level, pos), 1, Integer::sum);
                }
            }
        }
        String common = seen.entrySet().stream()
                .sorted((a, b) -> Integer.compare(b.getValue(), a.getValue()))
                .limit(5)
                .map(e -> e.getKey() + " x" + e.getValue())
                .reduce((a, b) -> a + ", " + b)
                .orElse("nothing but air");
        return "searched " + size + "x" + size + " around the Carpenter at x=" + cx + " z=" + cz
                + ", y " + (cy - SEARCH_BELOW) + " to " + (cy + SEARCH_ABOVE)
                + ". Commonest blocks there: " + common;
    }

    private static String pathOf(ClientLevel level, BlockPos pos) {
        return BuiltInRegistries.BLOCK.getKey(level.getBlockState(pos).getBlock()).getPath();
    }

    // ---------------------------------------------------------------- board

    /** One pass's findings: the cells plus what was odd about them. */
    private static final class Scan {
        final List<GreenhouseCell> cells = new ArrayList<>();
        int looseMatches;
        final Map<String, String> unknown = new LinkedHashMap<>();

        List<String> unknownHeads() {
            List<String> out = new ArrayList<>(unknown.size());
            unknown.forEach((name, hash) ->
                    out.add(name + " (" + (hash == null ? "no texture" : hash) + ")"));
            return out;
        }
    }

    /**
     * Mutations first, then crops in whatever cells the mutations left empty.
     *
     * <p>That order matches the layout push's rule for a contested cell: a
     * mutation stands on ground that may still hold a crop block, and the
     * mutation is the truthful answer for the cell.
     */
    private Scan readBoard(ClientLevel level, Located bed) {
        Scan scan = new Scan();
        boolean[][] taken = new boolean[bed.width][bed.height];

        for (ArmorStand stand : standsOver(level, bed)) {
            int col = (int) Math.floor(stand.getX()) - bed.originX;
            int row = (int) Math.floor(stand.getZ()) - bed.originZ;
            if (col < 0 || row < 0 || col >= bed.width || row >= bed.height || taken[col][row]) {
                continue;
            }
            String displayName = stand.hasCustomName()
                    ? ItemIds.strip(stand.getCustomName()).trim()
                    : "";
            String id = PlantIdentity.id(stand);
            if (id == null) {
                id = MutationNames.idForContainedName(displayName);
                if (id != null) {
                    scan.looseMatches++;
                }
            }
            if (id == null) {
                id = MutationNames.idForTexture(headTexture(stand));
            }
            if (id == null) {
                if (!displayName.isEmpty()) scan.unknown.putIfAbsent(displayName, headTexture(stand));
                continue;
            }
            taken[col][row] = true;
            scan.cells.add(PlantIdentity.isMutation(id)
                    ? GreenhouseCell.mutation(col, row, id.toUpperCase(java.util.Locale.ROOT))
                    : GreenhouseCell.crop(col, row, id.toUpperCase(java.util.Locale.ROOT)));
        }

        BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
        for (int col = 0; col < bed.width; col++) {
            for (int row = 0; row < bed.height; row++) {
                if (taken[col][row]) {
                    continue;
                }
                String crop = cropAt(level, pos, bed.originX + col, bed.bedY, bed.originZ + row);
                if (crop != null) {
                    scan.cells.add(GreenhouseCell.crop(col, row, crop));
                }
            }
        }
        return scan;
    }

    private static List<ArmorStand> standsOver(ClientLevel level, Located bed) {
        AABB box = new AABB(
                bed.originX, bed.bedY - STAND_Y_SLACK, bed.originZ,
                bed.originX + bed.width, bed.bedY + STAND_Y_SLACK, bed.originZ + bed.height);
        return level.getEntitiesOfClass(ArmorStand.class, box);
    }

    /**
     * The crop standing in one cell, or null.
     *
     * <p>Read from the block above the bed, which is where a planted crop sits.
     * The bed level itself is checked second, since a crop that replaces its own
     * ground is worth catching.
     *
     * <p>Public because the layout overlay asks the same question of the same
     * world and must get the same answer. Two spellings of "what is planted
     * here" would eventually disagree — the stem rules in {@link CropIds} are
     * exactly the sort of thing that gets extended in one place and forgotten in
     * the other — and the visible symptom would be a ghost block hovering over a
     * cell the scanner is simultaneously reporting as planted.
     *
     * @param pos a scratch position the caller owns; mutated, never retained
     */
    public static String cropAt(ClientLevel level, BlockPos.MutableBlockPos pos,
                                int x, int bedY, int z) {
        for (int dy = 1; dy >= 0; dy--) {
            pos.set(x, bedY + dy, z);
            BlockState state = level.getBlockState(pos);
            if (state.isAir()) {
                continue;
            }
            String crop = CropIds.fromBlockPath(
                    BuiltInRegistries.BLOCK.getKey(state.getBlock()).getPath());
            if (crop != null) {
                return crop;
            }
        }
        return null;
    }

    /** Texture hash of the head the stand wears, via the mod's existing skin plumbing. */
    private static String headTexture(ArmorStand stand) {
        ItemStack head = stand.getItemBySlot(EquipmentSlot.HEAD);
        return head.isEmpty() ? null : ItemIds.skinHash(head);
    }

    public void reset() {
        diagnostics = GreenhouseDiagnostics.idle();
        lastLoggedStatus = null;
        verifiedForCarpenter = null;
        cachedBed = null;
        scanLevel = null;
        observedStore = null;
        liveBoard = null;
        ticks = 0;
    }
}
