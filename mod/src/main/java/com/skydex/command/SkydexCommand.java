package com.skydex.command;

import com.mojang.brigadier.Command;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.context.CommandContext;
import com.skydex.SkydexMod;
import com.skydex.data.GreenhouseBoard;
import com.skydex.data.SnapshotStore;
import com.skydex.garden.CropDiagnosticsParser;
import com.skydex.garden.GreenhouseDiagnostics;
import com.skydex.garden.GreenhouseScanner;
import com.skydex.http.SkydexHttpServer;
import com.skydex.layout.GridOrientation;
import com.skydex.layout.LayoutAnchor;
import com.skydex.layout.LayoutStore;
import com.skydex.render.LayoutOverlayRenderer;
import com.skydex.render.LayoutProgress;
import com.skydex.SkydexTheme;
import net.fabricmc.fabric.api.client.command.v2.ClientCommands;
import net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;

/**
 * {@code /skydex} (settings GUI), {@code copy}, {@code status} and
 * {@code layout [anchor|rotate|clear]}.
 *
 * <p>Chat is the mod's other surface, and the one that holds the diagnostics
 * the settings screen refuses. It cannot be made of glass, but it can at least
 * be made of the same colours: the tag carries the site's own blue rather than
 * the nearest vanilla enum, which was a visibly different one.
 */
public final class SkydexCommand {

    /**
     * The real Index blue. The vanilla AQUA that stood here is a much lighter
     * cyan, so the tag never matched the accent the GUI draws.
     */
    private static final Style ACCENT = colour(SkydexTheme.ACCENT);

    /** One spelling of the tag, so the prefix cannot drift between helpers. */
    private static final String TAG = "[Skydex] ";

    private SkydexCommand() {
    }

    public static void register(CommandDispatcher<FabricClientCommandSource> dispatcher,
                                SkydexMod mod) {
        dispatcher.register(ClientCommands.literal("skydex")
                .then(ClientCommands.literal("copy").executes(ctx -> copy(ctx, mod)))
                .then(ClientCommands.literal("status").executes(ctx -> status(ctx, mod)))
                .then(ClientCommands.literal("captureplant")
                        .then(ClientCommands.argument("crop", com.mojang.brigadier.arguments.StringArgumentType.greedyString())
                                .executes(ctx -> capturePlant(ctx, mod))))
                .then(ClientCommands.literal("layout")
                        .then(ClientCommands.literal("anchor").executes(ctx -> anchor(ctx, mod)))
                        .then(ClientCommands.literal("rotate").executes(ctx -> rotate(ctx, mod)))
                        .then(ClientCommands.literal("progress")
                                .executes(ctx -> toggleProjection(ctx, mod)))
                        .then(ClientCommands.literal("clear").executes(ctx -> clearLayout(ctx, mod)))
                        .executes(ctx -> toggleOverlay(ctx, mod)))
                .executes(ctx -> openSettings(ctx, mod)));
    }

    // --------------------------------------------------------------- layout

    private static int capturePlant(CommandContext<FabricClientCommandSource> ctx, SkydexMod mod) {
        if (!mod.location().isOnGarden()) {
            error(ctx, "Plant capture is only available in the Garden.");
            return 0;
        }
        var client = Minecraft.getInstance();
        var soil = com.skydex.garden.PlantModelCapture.targetedSoil(client);
        if (soil == null) {
            error(ctx, "Look at the soil directly beneath the plant, within 8 blocks.");
            return 0;
        }
        try {
            var data = com.skydex.garden.PlantModelCapture.capture(client, soil,
                    com.mojang.brigadier.arguments.StringArgumentType.getString(ctx, "crop"));
            var directory = net.fabricmc.loader.api.FabricLoader.getInstance().getGameDir().resolve("skydex-model-captures");
            var file = com.skydex.garden.PlantModelCapture.save(directory, data);
            info(ctx, "Local plant capture: " + data.getAsJsonArray("entities").size() + " entity parts, "
                    + data.get("matchingNames").getAsInt() + " matching names. Saved " + file.getFileName());
            line(ctx, "Nearby parts are candidates, not a verified complete model. Nothing was uploaded.");
            return Command.SINGLE_SUCCESS;
        } catch (Exception ex) {
            error(ctx, "Plant capture failed: " + ex.getMessage());
            return 0;
        }
    }

    private static int toggleOverlay(CommandContext<FabricClientCommandSource> ctx, SkydexMod mod) {
        LayoutStore layouts = mod.layouts();
        if (!layouts.hasLayout()) {
            error(ctx, "No layout loaded. Push one from the Skydex site first.");
            return Command.SINGLE_SUCCESS;
        }
        boolean on = layouts.toggleOverlay();
        mod.saveLayouts();
        if (on && layouts.anchor() == null) {
            info(ctx, "Overlay on, but no anchor yet - stand at the greenhouse corner "
                    + "and run /skydex layout anchor.");
            return Command.SINGLE_SUCCESS;
        }
        info(ctx, "Overlay " + (on ? "on" : "off") + " (" + layouts.label() + ")");
        return Command.SINGLE_SUCCESS;
    }

    /**
     * Turn the built-versus-unbuilt comparison on or off.
     *
     * <p>Every reason it might draw nothing is reported here rather than left
     * for the player to discover by staring at an unchanged floor: no layout, no
     * anchor, and the overlay itself being off are three different problems with
     * three different fixes.
     */
    private static int toggleProjection(CommandContext<FabricClientCommandSource> ctx,
                                        SkydexMod mod) {
        LayoutStore layouts = mod.layouts();
        if (!layouts.hasLayout()) {
            error(ctx, "No layout loaded. Push one from the Skydex site first.");
            return Command.SINGLE_SUCCESS;
        }
        boolean on = layouts.toggleProjection();
        mod.saveLayouts();
        info(ctx, "Progress view " + (on ? "on" : "off")
                + (on ? " - built cells go green, the rest get a ghost block." : ""));
        if (on && !layouts.overlayEnabled()) {
            line(ctx, "The overlay itself is off, so nothing is drawn yet - "
                    + "run /skydex layout to turn it on.");
        }
        if (on && layouts.anchor() == null) {
            line(ctx, "No anchor yet - stand at the greenhouse corner "
                    + "and run /skydex layout anchor.");
        }
        return Command.SINGLE_SUCCESS;
    }

    private static int anchor(CommandContext<FabricClientCommandSource> ctx, SkydexMod mod) {
        BlockPos pos = LayoutOverlayRenderer.pickAnchorBlock(Minecraft.getInstance());
        if (pos == null) {
            error(ctx, "Could not work out where you are.");
            return Command.SINGLE_SUCCESS;
        }
        LayoutStore layouts = mod.layouts();
        GridOrientation orientation = layouts.anchor() == null
                ? GridOrientation.R0
                : layouts.anchor().orientation();
        layouts.setAnchor(new LayoutAnchor(pos.getX(), pos.getY(), pos.getZ(), orientation));
        mod.saveLayouts();

        info(ctx, "Anchor set to " + pos.getX() + ", " + pos.getY() + ", " + pos.getZ()
                + " - grid runs " + orientation.description() + ".");
        line(ctx, "Not lined up? Run /skydex layout rotate.");
        return Command.SINGLE_SUCCESS;
    }

    private static int rotate(CommandContext<FabricClientCommandSource> ctx, SkydexMod mod) {
        GridOrientation orientation = mod.layouts().rotate();
        if (orientation == null) {
            error(ctx, "No anchor yet - run /skydex layout anchor first.");
            return Command.SINGLE_SUCCESS;
        }
        mod.saveLayouts();
        info(ctx, "Grid now runs " + orientation.description() + ".");
        return Command.SINGLE_SUCCESS;
    }

    private static int clearLayout(CommandContext<FabricClientCommandSource> ctx, SkydexMod mod) {
        if (!mod.layouts().hasLayout()) {
            error(ctx, "No layout loaded.");
            return Command.SINGLE_SUCCESS;
        }
        String label = mod.layouts().label();
        mod.layouts().clear();
        mod.saveLayouts();
        info(ctx, "Cleared layout \"" + label + "\".");
        return Command.SINGLE_SUCCESS;
    }

    private static int openSettings(CommandContext<FabricClientCommandSource> ctx, SkydexMod mod) {
        mod.openSettings();
        return Command.SINGLE_SUCCESS;
    }

    private static int copy(CommandContext<FabricClientCommandSource> ctx, SkydexMod mod) {
        String summary = mod.copyExportCode();
        if (summary == null) {
            error(ctx, "Nothing captured yet - join SkyBlock and open a container first.");
            return Command.SINGLE_SUCCESS;
        }
        info(ctx, "Copied " + summary + " to your clipboard. Paste it into Skydex.");
        return Command.SINGLE_SUCCESS;
    }

    private static int status(CommandContext<FabricClientCommandSource> ctx, SkydexMod mod) {
        SnapshotStore store = mod.stores() == null ? null : mod.stores().active();
        info(ctx, "Skydex " + mod.modVersion());
        line(ctx, "Site mode: " + mod.config().siteMode.label());

        if (store == null) {
            line(ctx, "Profile: not detected yet (are you on SkyBlock?)");
        } else {
            String profile = store.profileName() == null ? "unknown" : store.profileName();
            String mode = store.gameMode() == null ? "unknown" : store.gameMode();
            line(ctx, "Profile: " + profile + " (" + mode + ")");
            line(ctx, "Island chests: " + store.chestCount());
            int sackTypes = store.sackTypeCount();
            int sackSent = store.nonZeroSackTypeCount();
            line(ctx, "Sack item types: " + sackSent
                    + (sackTypes > sackSent ? " (" + (sackTypes - sackSent) + " empty, not sent)" : ""));
            line(ctx, "Ender chest pages: " + store.enderChestPageCount());
            line(ctx, "Storage pages: " + store.storagePageCount());
            int inv = store.inventoryCount();
            line(ctx, "Inventory: " + (inv < 0 ? "not captured" : inv + " stacks"));
            line(ctx, "Greenhouse: " + describeGreenhouse(store.greenhouse()));
        }

        SkydexHttpServer server = mod.httpServer();
        if (server != null && server.isRunning()) {
            line(ctx, "Local server: on - http://127.0.0.1:" + server.port() + "/v1/island");
            line(ctx, "Live streams connected: " + server.sseClientCount());
        } else {
            line(ctx, "Local server: off"
                    + (mod.config().siteMode.usesLocalServer() ? " (failed to bind)" : " (GitHub Pages mode)"));
        }
        LayoutStore layouts = mod.layouts();
        if (layouts.hasLayout()) {
            line(ctx, "Layout: " + layouts.label() + " (" + layouts.layout().cellCount()
                    + " cells, overlay " + (layouts.overlayEnabled() ? "on" : "off") + ")");
            line(ctx, "Anchor: " + (layouts.anchor() == null ? "not set" : layouts.anchor().toString()));
            line(ctx, "Progress view: " + describeProjection(mod, layouts));
        } else {
            line(ctx, "Layout: none loaded");
        }
        line(ctx, "Location: " + (mod.location().isOnSkyBlock()
                ? (mod.location().isOnPrivateIsland() ? "private island" : mod.location().area())
                : "not on SkyBlock"));
        greenhouseScan(ctx, mod);
        return Command.SINGLE_SUCCESS;
    }

    /**
     * The projection's state, and its count when it has one.
     *
     * <p>"On" alone would be ambiguous while the count is still zero, because a
     * projection that has not scanned yet and a greenhouse with nothing built
     * both show no green. Saying which is the difference between waiting and
     * something being wrong.
     */
    private static String describeProjection(SkydexMod mod, LayoutStore layouts) {
        if (!layouts.projectionEnabled()) {
            return "off";
        }
        LayoutProgress progress = mod.overlay() == null
                ? LayoutProgress.NONE
                : mod.overlay().progress();
        if (progress.isEmpty()) {
            return "on, nothing scanned yet (needs the overlay on, an anchor, "
                    + "and you standing on your island)";
        }
        return "on - " + progress.summary();
    }

    /** What is stored, as opposed to what the last scan saw. */
    private static String describeGreenhouse(GreenhouseBoard board) {
        if (board == null) {
            return "not observed yet";
        }
        String summary = board.cellCount() + " cells (" + board.mutationCount() + " mutations";
        if (board.countdownCount() > 0) {
            summary += ", " + board.countdownCount() + " countdowns";
        }
        return summary + ")";
    }

    /**
     * The live scan state.
     *
     * <p>Printed even when nothing was captured, and especially then: the two
     * position constants behind the scan are inference, and a scan that captured
     * nothing because they look wrong is the single most useful thing this
     * command can say. Silence would be indistinguishable from "no greenhouse
     * here", which is the confusion the whole self-check exists to prevent.
     */
    private static void greenhouseScan(CommandContext<FabricClientCommandSource> ctx, SkydexMod mod) {
        GreenhouseScanner scanner = mod.greenhouse();
        if (scanner == null) {
            return;
        }
        GreenhouseDiagnostics d = scanner.diagnostics();
        line(ctx, "Greenhouse scan: " + d.summary());

        // The scan does not depend on the area name, but if it found nothing it
        // is worth saying whether the player is even on the Garden, because
        // "no greenhouse in this plot" is the expected answer anywhere else.
        if (d.status() == GreenhouseDiagnostics.Status.NO_GREENHOUSE
                && !mod.location().isOnGarden()) {
            line(ctx, "  (you are not on the Garden, so that is expected)");
        }

        if (d.status() == GreenhouseDiagnostics.Status.OFF_GARDEN_BOARD) {
            warn(ctx, "  If you ARE standing in your greenhouse, the sidebar's area name has "
                    + "changed and needs updating in the mod. If you are not, this is just "
                    + "another island's NPC and nothing is wrong.");
        }
        if (!d.measuredOffset().isEmpty()) {
            // The single line worth relaying: it turns searching for the bed
            // into knowing where it is.
            line(ctx, "  Carpenter offset: " + d.measuredOffset());
        }
        if (!d.unknownHeads().isEmpty()) {
            line(ctx, "Unidentified mutation heads (" + d.unknownHeads().size() + "):");
            for (String head : d.unknownHeads()) {
                line(ctx, "  " + head);
            }
        }
        if (d.looseNameMatches() > 0) {
            line(ctx, "  " + d.looseNameMatches() + " cell(s) matched by partial name, not exactly");
        }
        if (!CropDiagnosticsParser.isEnabled()) {
            line(ctx, "  Crop countdowns: off (parser awaits a real captured screen)");
        }
    }

    /**
     * A theme colour as chat wears it.
     *
     * <p>Chat carries no alpha, so the palette's ARGB is narrowed to RGB here
     * rather than being written out a second time as its own literal.
     */
    private static Style colour(int argb) {
        return Style.EMPTY.withColor(SkydexTheme.rgb(argb));
    }

    /** Loud enough to stop on, and unprefixed: it qualifies the line above it. */
    private static void warn(CommandContext<FabricClientCommandSource> ctx, String message) {
        ctx.getSource().sendFeedback(Component.literal(message).withStyle(colour(SkydexTheme.GOLD)));
    }

    private static void info(CommandContext<FabricClientCommandSource> ctx, String message) {
        ctx.getSource().sendFeedback(Component.literal(TAG).withStyle(ACCENT)
                .append(Component.literal(message).withStyle(colour(SkydexTheme.TEXT))));
    }

    private static void line(CommandContext<FabricClientCommandSource> ctx, String message) {
        ctx.getSource().sendFeedback(
                Component.literal("  " + message).withStyle(colour(SkydexTheme.MUTED)));
    }

    private static void error(CommandContext<FabricClientCommandSource> ctx, String message) {
        ctx.getSource().sendFeedback(Component.literal(TAG).withStyle(ACCENT)
                .append(Component.literal(message).withStyle(colour(SkydexTheme.DANGER))));
    }
}
