package com.skydex.capture;

import com.skydex.SkydexTheme;
import com.skydex.config.SkydexConfig;
import com.skydex.data.ItemEntry;
import com.skydex.data.SnapshotStore;
import com.skydex.data.StoreManager;
import com.skydex.garden.CropDiagnosticsParser;
import com.skydex.location.LocationTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;
import net.minecraft.network.chat.contents.TranslatableContents;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.ChestBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.ChestType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;

/**
 * Captures container contents passively.
 *
 * <p>Two timing rules drive the design:
 * <ul>
 *   <li>Container slots arrive over several ticks after a screen opens, so
 *       capturing on open would record a half-empty chest. We capture when the
 *       contents have been <i>stable</i> for {@link #STABLE_TICKS} ticks, and
 *       again on close. The merge is keyed by position, so capturing twice is
 *       harmless and the later one wins.</li>
 *   <li>The screen itself never tells us which block it belongs to, so we
 *       remember the last chest the player right-clicked and pair it with the
 *       next container screen that opens.</li>
 * </ul>
 */
public final class ContainerCapture {

    private static final Logger LOGGER = LoggerFactory.getLogger("Skydex");

    /** How long a remembered block interaction stays valid. */
    private static final long INTERACT_WINDOW_MS = 5_000L;
    /** Ticks of unchanged contents before we trust a capture. */
    private static final int STABLE_TICKS = 10;

    private final StoreManager stores;
    private final LocationTracker location;
    private final SkydexConfig config;

    private BlockPos pendingPos;
    private long pendingPosTime;

    private AbstractContainerScreen<?> openScreen;
    private BlockPos openScreenPos;
    private long lastSignature;
    private int stableTicks;
    private boolean capturedThisScreen;
    /** One fixture dump per screen open, not one per stable-tick capture. */
    private boolean loggedDiagnosticsScreen;

    public ContainerCapture(StoreManager stores, LocationTracker location, SkydexConfig config) {
        this.stores = stores;
        this.location = location;
        this.config = config;
    }

    // ------------------------------------------------------- block tracking

    /**
     * Remember a right-clicked chest so the screen that follows can be keyed by
     * position. Double chests are canonicalised to one of their two halves so a
     * single physical chest never yields two records.
     */
    public void onBlockInteract(Minecraft client, BlockPos pos) {
        if (client.level == null) {
            return;
        }
        BlockState state = client.level.getBlockState(pos);
        if (!(state.getBlock() instanceof ChestBlock)) {
            pendingPos = null;
            return;
        }
        pendingPos = canonicalChestPos(state, pos);
        pendingPosTime = System.currentTimeMillis();
    }

    /**
     * For a double chest, pick the lexicographically smaller of the two halves.
     * Which half the player clicked then stops mattering.
     */
    static BlockPos canonicalChestPos(BlockState state, BlockPos pos) {
        ChestType type;
        try {
            type = state.getValue(ChestBlock.TYPE);
        } catch (IllegalArgumentException e) {
            return pos;
        }
        if (type == ChestType.SINGLE) {
            return pos;
        }
        // Vanilla's own pairing logic, rather than re-deriving it from FACING.
        return lower(pos, ChestBlock.getConnectedBlockPos(pos, state));
    }

    private static BlockPos lower(BlockPos a, BlockPos b) {
        if (a.getX() != b.getX()) {
            return a.getX() < b.getX() ? a : b;
        }
        if (a.getY() != b.getY()) {
            return a.getY() < b.getY() ? a : b;
        }
        return a.getZ() <= b.getZ() ? a : b;
    }

    // ------------------------------------------------------ screen lifecycle

    public void onScreenOpen(Screen screen) {
        if (!(screen instanceof AbstractContainerScreen<?> container)) {
            return;
        }
        ScreenKind kind = TitleParser.classify(ItemIds.strip(screen.getTitle()).trim());
        if (kind == ScreenKind.SACK || kind == ScreenKind.ENDER_CHEST || kind == ScreenKind.STORAGE) {
            return;
        }
        if (openScreen == container) {
            // Screen init runs again on window resize. Re-running the setup
            // below would re-check the interaction window and, on a chest left
            // open for a while, drop the block position we still need.
            return;
        }
        openScreen = container;
        lastSignature = Long.MIN_VALUE;
        stableTicks = 0;
        capturedThisScreen = false;
        loggedDiagnosticsScreen = false;

        boolean fresh = System.currentTimeMillis() - pendingPosTime <= INTERACT_WINDOW_MS;
        openScreenPos = fresh ? pendingPos : null;
    }

    public void onScreenClose(Screen screen) {
        if (openScreen != null && openScreen == screen) {
            // Final state wins: the player may have moved items while it was open.
            capture(openScreen);
        }
        openScreen = null;
        openScreenPos = null;
        stableTicks = 0;
    }

    /** Call every client tick. Captures once the contents settle. */
    public void tick() {
        AbstractContainerScreen<?> screen = openScreen;
        if (screen == null || !config.captureEnabled) {
            return;
        }
        long signature = signature(screen.getMenu());
        if (signature != lastSignature) {
            lastSignature = signature;
            stableTicks = 0;
            capturedThisScreen = false;
            return;
        }
        if (capturedThisScreen) {
            return;
        }
        if (++stableTicks >= STABLE_TICKS) {
            capture(screen);
            capturedThisScreen = true;
        }
    }

    /** Cheap change detector over the container half of the menu. */
    private static long signature(AbstractContainerMenu menu) {
        long hash = 1L;
        for (Slot slot : menu.slots) {
            if (slot.container instanceof Inventory) {
                continue;
            }
            ItemStack stack = slot.getItem();
            hash = hash * 31L + (stack.isEmpty() ? 0 : stack.getItem().hashCode());
            hash = hash * 31L + stack.getCount();
        }
        return hash;
    }

    // ------------------------------------------------------------- capturing

    private void capture(AbstractContainerScreen<?> screen) {
        SnapshotStore store = stores.active();
        if (store == null || !config.captureEnabled || !location.isOnSkyBlock()) {
            return;
        }
        String title = ItemIds.strip(screen.getTitle()).trim();

        // Handled before the chrome filter and the empty-contents guard, because
        // while this path is fixture-pending its whole job is to dump the screen
        // exactly as it arrived, furniture included.
        if (TitleParser.classify(title) == ScreenKind.CROP_DIAGNOSTICS) {
            onCropDiagnostics(title, screen.getMenu());
            return;
        }

        List<SlottedStack> contents = containerStacks(screen.getMenu());
        if (contents.isEmpty()) {
            return;
        }

        String recorded = switch (TitleParser.classify(title)) {
            // Unreachable: handled above, before the contents are filtered.
            case CROP_DIAGNOSTICS -> null;
            case SACK, ENDER_CHEST, STORAGE -> null;
            case OTHER -> {
                // Only a real vanilla chest block on the private island counts.
                if (isVanillaChest(screen.getTitle())
                        && location.isOnPrivateIsland()
                        && openScreenPos != null) {
                    store.recordChest(openScreenPos.getX(), openScreenPos.getY(), openScreenPos.getZ(),
                            title, System.currentTimeMillis(), toEntries(contents));
                    yield "chest at " + openScreenPos.getX() + ", " + openScreenPos.getY()
                            + ", " + openScreenPos.getZ() + " (" + contents.size() + " stacks)";
                }
                yield null;
            }
        };
        if (recorded != null && config.chatFeedback) {
            sendChat("Recorded " + recorded);
        }
    }

    /**
     * Client-side only: this never sends anything to the server.
     *
     * <p>Muted body text on purpose. This line fires once per container and is
     * off by default because of it; when it is on, it should sit under the
     * conversation rather than in it.
     */
    private static void sendChat(String message) {
        Minecraft client = Minecraft.getInstance();
        if (client.player == null) {
            return;
        }
        client.player.sendSystemMessage(
                Component.literal("[Skydex] ")
                        .withStyle(Style.EMPTY.withColor(SkydexTheme.rgb(SkydexTheme.ACCENT)))
                        .append(Component.literal(message)
                                .withStyle(Style.EMPTY.withColor(SkydexTheme.rgb(SkydexTheme.MUTED)))));
    }

    /**
     * A real island chest has a <i>translatable</i> title ("container.chest").
     * Hypixel's menu GUIs use literal titles, so this keeps fake chest-shaped
     * menus out of the island chest list.
     */
    static boolean isVanillaChest(Component title) {
        return title.getContents() instanceof TranslatableContents translatable
                && translatable.getKey().startsWith("container.chest");
    }

    /**
     * The Crop Diagnostics screen: dump it, record nothing.
     *
     * <p>This mod has a standing rule that a parser's fixtures must be
     * verbatim-captured game output rather than reconstructed from another
     * mod's regex, and no such capture of this screen exists yet. So the
     * countdown parser ships disabled
     * ({@link CropDiagnosticsParser#FIXTURE_PENDING}) and this hook does the
     * only useful thing available: it writes the screen to the client log
     * exactly as received, so opening the screen once in game produces the real
     * fixture the parser needs.
     *
     * <p>Nothing here reaches the snapshot. A guessed countdown would not look
     * broken on the website, it would look like a working clock quietly lying
     * about when a crop is ready, and that is worse than having no clock.
     */
    private void onCropDiagnostics(String title, AbstractContainerMenu menu) {
        if (CropDiagnosticsParser.isEnabled()) {
            // Deliberately unreachable until a real fixture exists and the flag
            // is flipped. Left as the seam that read will be wired into, so the
            // enabling change is one obvious place rather than a rewrite.
            return;
        }
        if (loggedDiagnosticsScreen) {
            return;
        }
        loggedDiagnosticsScreen = true;

        StringBuilder dump = new StringBuilder();
        dump.append("Skydex Crop Diagnostics capture (parser is fixture-pending, nothing recorded)\n");
        dump.append("title: ").append(title).append('\n');
        for (Slot slot : menu.slots) {
            if (slot.container instanceof Inventory) {
                continue;
            }
            ItemStack stack = slot.getItem();
            if (stack.isEmpty()) {
                continue;
            }
            dump.append("slot ").append(slot.getContainerSlot())
                    .append(": ").append(ItemIds.displayName(stack)).append('\n');
            for (String line : ItemIds.lore(stack)) {
                dump.append("    | ").append(line).append('\n');
            }
        }
        LOGGER.info("{}", dump);
        if (config.chatFeedback) {
            sendChat("Logged a Crop Diagnostics screen (not recorded: parser awaits a real fixture)");
        }
    }

    /** One occupied slot: its container-local index and what is in it. */
    private record SlottedStack(int slot, ItemStack stack) {
    }

    /**
     * Slots backed by the player's own inventory are not part of the container.
     *
     * <p>{@link Slot#getContainerSlot()} rather than the menu-wide index, so a
     * chest reads 0-53 and a paged ender chest reads 0-53 per page, which is
     * what makes the page-keyed persistence line up.
     */
    private static List<SlottedStack> containerStacks(AbstractContainerMenu menu) {
        List<SlottedStack> stacks = new ArrayList<>();
        for (Slot slot : menu.slots) {
            if (slot.container instanceof Inventory) {
                continue;
            }
            ItemStack stack = slot.getItem();
            // Menu furniture is not contents. Filtered here so every capture
            // path -- chests, ender chest, storage and sacks -- gets it.
            if (!stack.isEmpty() && !ItemIds.isChrome(stack)) {
                stacks.add(new SlottedStack(slot.getContainerSlot(), stack));
            }
        }
        return stacks;
    }

    /**
     * One entry per occupied slot, never merged: identical stacks in different
     * slots stay separate so the site can draw the container as it really looks,
     * gaps included.
     */
    private static List<ItemEntry> toEntries(List<SlottedStack> stacks) {
        List<ItemEntry> entries = new ArrayList<>(stacks.size());
        for (SlottedStack slotted : stacks) {
            entries.add(ItemIds.toEntry(slotted.stack(), slotted.slot()));
        }
        return entries;
    }

    /**
     * Sack slots clamp their stack size to 64, so the lore holds the truth.
     * Items with no stored-count line are menu filler and are skipped, which is
     * also what keeps glass panes out of the totals.
     */
    private static String captureSacks(SnapshotStore store, String title, List<SlottedStack> contents) {
        // Rune items carry no usable Hypixel id, so capturing this screen would
        // record plausible-looking but wrong ids. Absent beats wrong.
        if ("Runes Sack".equalsIgnoreCase(title.trim())) {
            return null;
        }
        // Sacks are aggregates keyed by id, so the slot a stack happens to sit
        // in is meaningless here and is deliberately not carried through.
        Map<String, Long> totals = new LinkedHashMap<>();
        for (SlottedStack slotted : contents) {
            ItemStack stack = slotted.stack();
            String id = ItemIds.hypixelId(stack);
            if (id.isEmpty()) {
                continue;
            }
            List<String> lore = ItemIds.lore(stack);

            // A Gemstones-sack slot holds every cut of one gemstone under the
            // ROUGH_ id, so it expands into several entries rather than one.
            Map<String, Long> gemstones = SackLoreParser.parseGemstoneEntries(id, lore);
            if (!gemstones.isEmpty()) {
                gemstones.forEach((gemId, amount) -> totals.merge(gemId, amount, Long::sum));
                continue;
            }

            OptionalLong count = SackLoreParser.parseSackCount(lore);
            if (count.isPresent()) {
                totals.merge(id, count.getAsLong(), Long::sum);
            }
        }
        if (totals.isEmpty()) {
            return null;
        }
        store.recordSacks(totals);
        return totals.size() + " sack item types";
    }

    /** The player's own inventory, readable without any screen being open. */
    public void captureInventory(Minecraft client) {
        SnapshotStore store = stores.active();
        if (store == null || !config.captureEnabled || !config.captureInventory
                || client.player == null || !location.isOnSkyBlock()) {
            return;
        }
        Inventory inventory = client.player.getInventory();
        List<ItemEntry> entries = new ArrayList<>();
        for (int i = 0; i < inventory.getContainerSize(); i++) {
            ItemStack stack = inventory.getItem(i);
            if (!stack.isEmpty() && !ItemIds.isChrome(stack)) {
                // The inventory index is the slot: 0-8 hotbar, 9-35 main.
                entries.add(ItemIds.toEntry(stack, i));
            }
        }
        store.recordInventory(entries);
    }

    public void reset() {
        openScreen = null;
        openScreenPos = null;
        pendingPos = null;
        stableTicks = 0;
    }
}
