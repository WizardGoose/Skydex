package com.skydex;

import com.skydex.capture.ContainerCapture;
import com.skydex.command.SkydexCommand;
import com.skydex.config.SiteMode;
import com.skydex.config.SkydexConfig;
import com.skydex.config.DataDirectoryMigration;
import com.skydex.gui.MigrationNotice;
import com.skydex.data.IslandSnapshot;
import com.skydex.data.SnapshotStore;
import com.skydex.data.StoreManager;
import com.skydex.export.ExportCodec;
import com.skydex.export.ExportSection;
import com.skydex.garden.GreenhouseScanner;
import com.skydex.garden.GreenhouseDiagnostics;
import com.skydex.gui.SkydexScreen;
import com.skydex.gui.SkydexNativeScreen;
import com.skydex.http.SkydexHttpServer;
import com.skydex.layout.GreenhouseLayout;
import com.skydex.layout.GreenhouseShareDecoder;
import com.skydex.layout.GridOrientation;
import com.skydex.layout.LayoutAnchor;
import com.skydex.layout.LayoutStore;
import com.skydex.location.LocationTracker;
import com.skydex.render.LayoutOverlayRenderer;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.event.player.UseBlockCallback;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.world.InteractionResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Files;

/**
 * Client entrypoint.
 *
 * <p>Everything here is passive: the mod reads the scoreboard, the tab list and
 * the contents of screens the player opened themselves. It never sends a packet
 * or a command on the player's behalf, which is the constraint the spec sets
 * for Hypixel-rules compliance.
 *
 * <p>No mixins and no access widener — {@code CustomData.copyTag()} and the
 * Fabric screen/interaction events cover every hook needed, which keeps the mod
 * from breaking on Minecraft updates the way a mixin would.
 */
public final class SkydexMod implements ClientModInitializer {

    public static final String MOD_ID = "skydex";
    private static final Logger LOGGER = LoggerFactory.getLogger("Skydex");

    /** Rescan location/profile every second; it changes rarely. */
    private static final int LOCATION_INTERVAL_TICKS = 20;
    /** Flush dirty stores every 30 seconds. */
    private static final int SAVE_INTERVAL_TICKS = 600;

    private Path configFile;
    private SkydexConfig config;
    private StoreManager stores;
    private LocationTracker location;
    private ContainerCapture capture;
    private GreenhouseScanner greenhouse;
    private LayoutStore layouts;
    private LayoutOverlayRenderer overlay;
    private SkydexHttpServer httpServer;
    private String modVersion = "unknown";
    private Path migrationNoticeFile;
    private String migrationMessage;

    private int ticks;

    /** One fence per hook, so a failure in one does not silence the others. */
    private final CaptureGuard tickGuard = new CaptureGuard("tick");
    private final CaptureGuard screenGuard = new CaptureGuard("screen");
    private final CaptureGuard interactGuard = new CaptureGuard("block interaction");
    /**
     * Fenced separately from the tick so a failure in the world scan cannot take
     * container capture, location tracking or the inventory refresh down with
     * it. The scan touches entity and block lookups the other paths never do, so
     * it is the likeliest of them to meet something unexpected.
     */
    private final CaptureGuard greenhouseGuard = new CaptureGuard("greenhouse scan");
    /**
     * Opening a screen straight from a command loses the race with the chat
     * screen closing, so the request is parked here and honoured on the next
     * tick instead.
     */
    private Screen pendingScreen;

    @Override
    public void onInitializeClient() {
        Path configDir = SkydexConfig.resolveDataDirectory(
                FabricLoader.getInstance().getConfigDir());
        this.configFile = configDir.resolve("config.json");
        migrationNoticeFile = configDir.resolve(DataDirectoryMigration.NOTICE_FILE);
        if (Files.isRegularFile(migrationNoticeFile)) {
            try {
                migrationMessage = Files.readString(migrationNoticeFile);
            } catch (IOException e) {
                LOGGER.warn("Could not read saved-data migration notice", e);
            }
        }
        this.modVersion = FabricLoader.getInstance().getModContainer(MOD_ID)
                .map(c -> c.getMetadata().getVersion().getFriendlyString())
                .orElse("unknown");

        // Before anything else: load every class the tick, screen, chat and
        // render paths can reach. Left lazy, a class first touched hours into a
        // session can be read from a jar that has since been replaced on disk,
        // which is precisely what crashed the client once already.
        EagerClasses.loadAll();

        this.config = SkydexConfig.load(configFile);
        saveConfig();

        this.stores = new StoreManager(configDir);
        this.location = new LocationTracker();
        this.capture = new ContainerCapture(stores, location, config);
        this.greenhouse = new GreenhouseScanner(stores, location, config);
        this.layouts = LayoutStore.load(configDir.resolve("layout.json"));
        // Held rather than discarded: the overlay now also reads the world on
        // the client tick to work out which cells are already built, so it needs
        // ticking as well as registering.
        this.overlay = new LayoutOverlayRenderer(layouts, location);
        this.overlay.register();

        registerEvents();
        applySiteMode();

        LOGGER.info("Skydex {} ready ({} mode, data dir: {})",
                modVersion, config.siteMode.label(), configDir);
    }

    private void registerEvents() {
        ClientLifecycleEvents.CLIENT_STARTED.register(client -> {
            if (migrationMessage == null) return;
            try {
                MigrationNotice.show(client);
            } catch (ReflectiveOperationException e) {
                LOGGER.warn("Could not display migration toast; confirmation will appear in chat", e);
            }
        });
        // Every hook below runs on a vanilla thread, so each is fenced: a
        // failure disables that one path for the session instead of crashing
        // the client. A passive QoL mod is never worth taking the game down.
        ClientTickEvents.END_CLIENT_TICK.register(client -> tickGuard.run(() -> onTick(client)));

        ScreenEvents.AFTER_INIT.register((client, screen, width, height) -> screenGuard.run(() -> {
            capture.onScreenOpen(screen);
            ScreenEvents.remove(screen).register(
                    closed -> screenGuard.run(() -> capture.onScreenClose(closed)));
        }));

        UseBlockCallback.EVENT.register((player, level, hand, hit) -> {
            interactGuard.run(() -> {
                if (level.isClientSide() && config.captureEnabled) {
                    capture.onBlockInteract(Minecraft.getInstance(), hit.getBlockPos());
                }
            });
            // Purely observational: never consume the interaction.
            return InteractionResult.PASS;
        });

        ClientCommandRegistrationCallback.EVENT.register(
                (dispatcher, registry) -> SkydexCommand.register(dispatcher, this));

        ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> {
            stores.saveDirty();
            location.reset();
            capture.reset();
            greenhouse.reset();
        });

        ClientLifecycleEvents.CLIENT_STOPPING.register(client -> {
            stores.saveDirty();
            stopHttpServer();
        });
    }

    private void onTick(Minecraft client) {
        ticks++;
        if (migrationMessage != null && client.player != null) {
            client.player.sendSystemMessage(
                    net.minecraft.network.chat.Component.literal("[Skydex] " + migrationMessage));
            migrationMessage = null;
            try {
                Files.deleteIfExists(migrationNoticeFile);
            } catch (IOException e) {
                LOGGER.warn("Could not clear saved-data migration notice", e);
            }
        }
        if (pendingScreen != null) {
            Screen screen = pendingScreen;
            pendingScreen = null;
            client.setScreenAndShow(screen);
        }
        capture.tick();
        // Its own fence, and its own interval inside the scanner.
        greenhouseGuard.run(() -> greenhouse.tick(client));
        syncLayoutAnchorToGreenhouse();
        // Already fenced inside, and it returns immediately unless the player
        // turned the projection on.
        overlay.tick(client);

        if (ticks % LOCATION_INTERVAL_TICKS == 0) {
            location.update(client);
            if (location.isOnSkyBlock() && client.player != null) {
                stores.activate(
                        client.player.getUUID().toString(),
                        client.player.getName().getString(),
                        location.profileName(),
                        location.gameMode());
            }
        }
        if (ticks % SAVE_INTERVAL_TICKS == 0) {
            stores.saveDirty();
        }
    }

    // ------------------------------------------------------------ site mode

    /**
     * The bridge always stays on loopback.
     *
     * <p>Both skydex.ca and a locally hosted Skydex page connect to the same
     * 127.0.0.1 endpoint. The browser Origin tells the GUI which one connected;
     * no manual mode switch is needed.
     */
    public void applySiteMode() {
        startHttpServer();
    }

    /** Called by the GUI. Persists immediately so the choice survives a crash. */
    public void setSiteMode(SiteMode mode) {
        if (mode == null || config.siteMode == mode) {
            return;
        }
        config.siteMode = mode;
        saveConfig();
        // Kept for older commands/config files. Transport detection is now
        // automatic, so changing this legacy value no longer stops the bridge.
        applySiteMode();
    }

    public void saveConfig() {
        try {
            config.save(configFile);
        } catch (IOException e) {
            LOGGER.warn("Could not write config", e);
        }
    }

    private void startHttpServer() {
        if (httpServer != null && httpServer.isRunning()) {
            return;
        }
        httpServer = new SkydexHttpServer(
                config.httpPort, modVersion, stores::activeJson, stores::activeVersion);
        httpServer.setLayoutSink(this::acceptLayout);
        try {
            httpServer.start();
            LOGGER.info("Serving island data on http://127.0.0.1:{}/v1/island (events at /v1/events)",
                    httpServer.port());
        } catch (IOException e) {
            LOGGER.warn("Could not bind 127.0.0.1:{} - live transport disabled ({})",
                    config.httpPort, e.toString());
            httpServer = null;
        }
    }

    private void stopHttpServer() {
        if (httpServer != null) {
            httpServer.stop();
            httpServer = null;
        }
    }

    // --------------------------------------------------------------- layout

    /**
     * Called on an HTTP worker thread when the site pushes a layout. Storing it
     * is all that happens here — drawing is decided later, on the render
     * thread, and only on the private island.
     */
    private void acceptLayout(GreenhouseLayout layout) {
        layouts.setLayout(layout);
        saveLayouts();
        LOGGER.info("Loaded layout \"{}\" ({} cells)", layout.label(), layout.cellCount());
    }

    public void saveLayouts() {
        try {
            layouts.save();
        } catch (IOException e) {
            LOGGER.warn("Could not write layout", e);
        }
    }

    public LayoutStore layouts() {
        return layouts;
    }

    public LayoutOverlayRenderer overlay() {
        return overlay;
    }

    // -------------------------------------------------------------- actions

    /** Queue the settings screen; it opens on the next tick. */
    public void openSettings() {
        pendingScreen = new SkydexNativeScreen(this);
    }

    /**
     * Build the export code and put it on the clipboard.
     *
     * @return a human summary of what was copied, or null when nothing has been
     *         captured yet
     */
    public String copyExportCode() {
        SnapshotStore store = stores == null ? null : stores.active();
        if (store == null) {
            return null;
        }
        IslandSnapshot snapshot = store.toSnapshot(System.currentTimeMillis());
        snapshot = snapshot.onlySections(ExportSection.capturedSections()).onlySections(config.exportSections());
        String json = snapshot.toMinifiedJson();
        String code = ExportCodec.encode(json);
        Minecraft.getInstance().keyboardHandler.setClipboard(code);
        return humanBytes(code.length()) + " code (" + humanBytes(json.length()) + " uncompressed)";
    }

    /** Decode a current Skydex share code and make it the active helper layout. */
    public GreenhouseLayout importLayoutCode(String input) {
        GreenhouseLayout layout = GreenhouseShareDecoder.decode(input);
        acceptLayout(layout);
        return layout;
    }

    /**
     * The one player-facing helper switch.
     *
     * <p>The scanner already knows the real bed origin, so enabling the helper
     * anchors the layout there automatically. The two older render switches are
     * kept in the save format for compatibility, but the screen treats them as
     * one feature.
     */
    public void setPlacementHelperEnabled(boolean enabled) {
        layouts.setOverlayEnabled(enabled);
        layouts.setProjectionEnabled(enabled);
        if (enabled) {
            syncLayoutAnchorToGreenhouse();
        }
        saveLayouts();
    }

    public boolean placementHelperEnabled() {
        return layouts.overlayEnabled() && layouts.projectionEnabled();
    }

    private void syncLayoutAnchorToGreenhouse() {
        if (layouts == null || greenhouse == null || !placementHelperEnabled()) {
            return;
        }
        GreenhouseDiagnostics scan = greenhouse.diagnostics();
        if (scan == null || !scan.foundBed()) {
            return;
        }
        LayoutAnchor current = layouts.anchor();
        if (current != null
                && current.x() == scan.originX()
                && current.y() == scan.bedY()
                && current.z() == scan.originZ()
                && current.orientation() == GridOrientation.R0) {
            return;
        }
        layouts.setAnchor(new LayoutAnchor(
                scan.originX(), scan.bedY(), scan.originZ(), GridOrientation.R0));
        saveLayouts();
    }

    public void setExportSectionEnabled(ExportSection section, boolean enabled) {
        config.setExportSectionEnabled(section, enabled);
        saveConfig();
    }

    public static String humanBytes(int bytes) {
        if (bytes < 1024) {
            return bytes + " B";
        }
        return String.format("%.1f KB", bytes / 1024.0);
    }

    public SkydexConfig config() {
        return config;
    }

    public StoreManager stores() {
        return stores;
    }

    public LocationTracker location() {
        return location;
    }

    public GreenhouseScanner greenhouse() {
        return greenhouse;
    }

    public SkydexHttpServer httpServer() {
        return httpServer;
    }

    public String modVersion() {
        return modVersion;
    }
}
