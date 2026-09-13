package com.skydex.gametest;

import com.skydex.SkydexMod;
import com.skydex.data.GreenhouseBoard;
import com.skydex.data.GreenhouseCell;
import com.skydex.data.SnapshotStore;
import com.skydex.export.ExportSection;
import com.skydex.gui.SettingsLayout;
import com.skydex.gui.SkydexScreen;
import com.skydex.layout.GreenhouseLayout;
import com.skydex.layout.LayoutParser;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.TestInput;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotComparisonAlgorithm;
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotComparisonOptions;
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotOptions;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.locks.LockSupport;

/**
 * Captures the actual Skydex screen through Minecraft's client renderer.
 *
 * <p>An absent approved image is a deliberate failure after every candidate has
 * been written. This prevents a fresh capture from silently approving itself.
 */
@SuppressWarnings("UnstableApiUsage")
public final class SkydexGuiVisualTest implements FabricClientGameTest {

    private static final int WINDOW_WIDTH = 1920;
    private static final int WINDOW_HEIGHT = 1080;
    private static final int GUI_SCALE = 2;
    private static final float PIXEL_TOLERANCE = 0.0008f;
    private static final Path OUTPUT = Path.of(System.getProperty(
            "skydex.visual.output", "screenshots/skydex-gui")).toAbsolutePath();

    private static final String LONG_SHARE_LINK =
            "https://skydex.ca/greenhouse/share/"
                    + "KzOqMVI1MgjOT0-vrDHRya4xNKnRIx4kOSZisIgCAA?from=visual-approval";

    private final List<String> missingBaselines = new ArrayList<>();
    private final List<AssertionError> mismatches = new ArrayList<>();

    @Override
    public void runTest(ClientGameTestContext context) {
        SkydexMod mod = findSkydex();
        Screen previousScreen = context.computeOnClient(SkydexGuiVisualTest::currentScreen);
        GreenhouseLayout previousLayout = mod.layouts().layout();
        boolean previousOverlay = mod.layouts().overlayEnabled();
        boolean previousProjection = mod.layouts().projectionEnabled();
        Map<ExportSection, Boolean> previousSections = new EnumMap<>(ExportSection.class);
        for (ExportSection section : ExportSection.values()) {
            previousSections.put(section, mod.config().isExportSectionEnabled(section));
        }

        try {
            prepareWindow(context);

            mod.layouts().clear();
            context.setScreen(() -> new SkydexScreen(mod));
            context.waitForScreen(SkydexScreen.class);
            context.waitTicks(12);
            capture(context, "empty", false);

            loadFixture(mod);
            context.waitTicks(3);
            capture(context, "loaded", false);

            click(context, ClickTarget.SHARE_FIELD);
            context.getInput().typeChars(LONG_SHARE_LINK);
            context.waitTick();
            capture(context, "long_share_link", false);

            click(context, ClickTarget.PRESET_HANDLE);
            finishDrawerMotion(context);
            capture(context, "presets_open", true);

            click(context, ClickTarget.BOARD);
            context.waitTicks(2);
            capture(context, "presets_after_outside_click", true);

            click(context, ClickTarget.INCLUDED_DATA);
            context.waitTicks(2);
            capture(context, "included_data_open", true);
        } finally {
            mod.layouts().setLayout(previousLayout);
            mod.layouts().setOverlayEnabled(previousOverlay);
            mod.layouts().setProjectionEnabled(previousProjection);
            for (Map.Entry<ExportSection, Boolean> entry : previousSections.entrySet()) {
                mod.config().setExportSectionEnabled(entry.getKey(), entry.getValue());
            }
            context.setScreen(() -> previousScreen);
            context.restoreDefaultGameOptions();
        }

        reportCandidates();
        failOnChangedBaselines();
    }

    private static SkydexMod findSkydex() {
        return FabricLoader.getInstance()
                .getEntrypoints("client", ClientModInitializer.class)
                .stream()
                .filter(SkydexMod.class::isInstance)
                .map(SkydexMod.class::cast)
                .findFirst()
                .orElseThrow(() -> new AssertionError("The Skydex client entrypoint was not loaded"));
    }

    /** Minecraft 26.2 moved the active screen from Minecraft onto its GUI controller. */
    private static Screen currentScreen(Minecraft client) {
        try {
            Field field = Minecraft.class.getField("screen");
            return (Screen) field.get(client);
        } catch (ReflectiveOperationException movedIn262) {
            try {
                Field guiField = Minecraft.class.getField("gui");
                Object gui = guiField.get(client);
                Method screen = gui.getClass().getMethod("screen");
                return (Screen) screen.invoke(gui);
            } catch (ReflectiveOperationException unavailable) {
                throw new AssertionError("Could not read Minecraft's current screen", unavailable);
            }
        }
    }

    private static void prepareWindow(ClientGameTestContext context) {
        TestInput input = context.getInput();
        input.resizeWindow(WINDOW_WIDTH, WINDOW_HEIGHT);
        context.runOnClient(client -> {
            client.options.guiScale().set(GUI_SCALE);
            client.options.panoramaSpeed().set(0.0);
            client.resizeGui();
        });
        context.waitTicks(5);
    }

    private static void loadFixture(SkydexMod mod) {
        GreenhouseLayout layout = LayoutParser.parse("""
                {"schema":1,"label":"Wizard's Waterworks","size":[10,10],"cells":[
                  {"x":4,"y":2,"crop":"Wheat","ground":"farmland"},
                  {"x":5,"y":2,"crop":"Wheat","ground":"farmland"},
                  {"x":4,"y":3,"crop":"Dustgrain","ground":"farmland"},
                  {"x":5,"y":3,"crop":"Dustgrain","ground":"farmland"},
                  {"x":4,"y":4,"mutation":"Melon","ground":"farmland"},
                  {"x":5,"y":4,"mutation":"Gloomgourd","ground":"farmland"},
                  {"x":6,"y":4,"crop":"Melon","ground":"farmland"},
                  {"x":4,"y":5,"crop":"Wheat","ground":"farmland"},
                  {"x":5,"y":5,"mutation":"Gloomgourd","ground":"farmland"},
                  {"x":6,"y":5,"crop":"Melon","ground":"farmland"},
                  {"x":4,"y":6,"mutation":"Soggybud","ground":"farmland"},
                  {"x":5,"y":6,"mutation":"Soggybud","ground":"farmland"}
                ]}
                """);
        mod.layouts().setLayout(layout);
        // Match the approved browser frame so the checkbox itself is compared in
        // its selected state. The harness restores the player's real settings.
        mod.layouts().setOverlayEnabled(true);
        mod.layouts().setProjectionEnabled(true);

        SnapshotStore store = mod.stores().activate(
                "00000000-0000-0000-0000-000000000000",
                "Skydex Visual Fixture", "Pomegranate", "normal");
        store.recordGreenhouse(new GreenhouseBoard(1L, 10, 10, List.of(
                GreenhouseCell.crop(4, 2, "WHEAT"),
                GreenhouseCell.crop(5, 2, "WHEAT"),
                GreenhouseCell.crop(4, 5, "PUMPKIN"),
                GreenhouseCell.mutation(5, 6, "SOGGYBUD")
        )));

        for (ExportSection section : ExportSection.values()) {
            mod.config().setExportSectionEnabled(section, true);
        }
    }

    private void capture(ClientGameTestContext context, String state, boolean drawerVisible) {
        String name = "skydex_gui_" + minecraftVersion() + "_" + state;
        int regionWidth = SettingsLayout.rendered(
                SettingsLayout.PANEL_W + (drawerVisible ? SettingsLayout.DRAWER_W : 0)) * GUI_SCALE;
        int regionHeight = SettingsLayout.rendered(SettingsLayout.PANEL_H) * GUI_SCALE;
        int coreWidth = SettingsLayout.rendered(SettingsLayout.PANEL_W) * GUI_SCALE;
        int regionX = (WINDOW_WIDTH - coreWidth) / 2;
        int regionY = (WINDOW_HEIGHT - regionHeight) / 2;

        if (!hasApprovedBaseline(name)) {
            context.takeScreenshot(TestScreenshotOptions.of(name)
                    .disableCounterPrefix()
                    .withDeltaTicks(0.0f)
                    .withSize(WINDOW_WIDTH, WINDOW_HEIGHT)
                    .withDestinationDir(OUTPUT));
            missingBaselines.add(name);
            return;
        }

        try {
            context.assertScreenshotEquals(TestScreenshotComparisonOptions.of(name)
                    .disableCounterPrefix()
                    .withDeltaTicks(0.0f)
                    .withSize(WINDOW_WIDTH, WINDOW_HEIGHT)
                    .withDestinationDir(OUTPUT)
                    .withRegion(regionX, regionY, regionWidth, regionHeight)
                    .withAlgorithm(TestScreenshotComparisonAlgorithm
                            .meanSquaredDifference(PIXEL_TOLERANCE))
                    .saveWithFileName(name));
        } catch (AssertionError mismatch) {
            mismatches.add(mismatch);
        }
    }

    private static boolean hasApprovedBaseline(String name) {
        return SkydexGuiVisualTest.class.getClassLoader()
                .getResource("templates/" + name + ".png") != null;
    }

    private static String minecraftVersion() {
        return FabricLoader.getInstance().getModContainer("minecraft")
                .map(container -> container.getMetadata().getVersion().getFriendlyString())
                .orElse("unknown")
                .replaceAll("[^A-Za-z0-9]+", "_");
    }

    private static void click(ClientGameTestContext context, ClickTarget target) {
        PixelPoint point = context.computeOnClient(client -> {
            int guiWidth = client.getWindow().getGuiScaledWidth();
            int guiHeight = client.getWindow().getGuiScaledHeight();
            SettingsLayout layout = SettingsLayout.of(guiWidth, guiHeight);
            double xScale = client.getWindow().getWidth() / (double) guiWidth;
            double yScale = client.getWindow().getHeight() / (double) guiHeight;
            return target.resolve(layout, xScale, yScale);
        });
        context.getInput().setCursorPos(point.x(), point.y());
        context.getInput().pressMouse(0);
        context.waitTick();
    }

    private static void finishDrawerMotion(ClientGameTestContext context) {
        LockSupport.parkNanos(300_000_000L);
        context.waitTicks(2);
    }

    private void reportCandidates() {
        if (missingBaselines.isEmpty()) {
            return;
        }
        System.out.println("Skydex GUI candidates captured at " + OUTPUT
                + ". Awaiting Wizard approval for: " + String.join(", ", missingBaselines));
    }

    private void failOnChangedBaselines() {
        if (mismatches.isEmpty()) {
            return;
        }
        String message = "Skydex GUI changed from " + mismatches.size()
                + " Wizard-approved baseline(s). Actual and diff images: " + OUTPUT;
        AssertionError failure = new AssertionError(message);
        mismatches.forEach(failure::addSuppressed);
        throw failure;
    }

    private enum ClickTarget {
        SHARE_FIELD {
            @Override
            PixelPoint resolve(SettingsLayout layout, double xScale, double yScale) {
                return point(layout, layout.shareX() + 20,
                        layout.shareY() + SettingsLayout.SHARE_H / 2, xScale, yScale);
            }
        },
        PRESET_HANDLE {
            @Override
            PixelPoint resolve(SettingsLayout layout, double xScale, double yScale) {
                return point(layout, layout.arrowX() + SettingsLayout.ARROW_W / 2,
                        layout.arrowY() + SettingsLayout.ARROW_H / 2, xScale, yScale);
            }
        },
        BOARD {
            @Override
            PixelPoint resolve(SettingsLayout layout, double xScale, double yScale) {
                return point(layout, layout.boardX() + SettingsLayout.BOARD_SIZE / 2,
                        layout.boardY() + SettingsLayout.BOARD_SIZE / 2, xScale, yScale);
            }
        },
        INCLUDED_DATA {
            @Override
            PixelPoint resolve(SettingsLayout layout, double xScale, double yScale) {
                return point(layout, layout.rightX() + layout.dataWidth() / 2,
                        layout.exportY() + SettingsLayout.EXPORT_H / 2, xScale, yScale);
            }
        };

        abstract PixelPoint resolve(SettingsLayout layout, double xScale, double yScale);

        static PixelPoint point(
                SettingsLayout layout, int prototypeX, int prototypeY,
                double xScale, double yScale) {
            double screenX = layout.screenX + prototypeX * SettingsLayout.RENDER_SCALE;
            double screenY = layout.screenY + prototypeY * SettingsLayout.RENDER_SCALE;
            return new PixelPoint(screenX * xScale, screenY * yScale);
        }
    }

    private record PixelPoint(double x, double y) {
    }
}
