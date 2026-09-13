package com.skydex;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

/**
 * Forces every capture and codec class to load at startup.
 *
 * <p>The JVM loads classes lazily, so a class only reached from a tick or screen
 * handler may not be loaded until the player happens to trigger it — possibly
 * hours in. If the mod jar is replaced on disk in the meantime, the classloader
 * is still holding the old zip directory and reads the new file at stale
 * offsets. That is exactly what crashed the client: {@code SackLoreParser} had
 * never loaded, the player opened a composter, the sack path touched it for the
 * first time, and the read landed in the middle of a different file.
 *
 * <p>Loading everything up front costs a few milliseconds and closes that window
 * entirely: after startup there is nothing left to lazily read. It does not make
 * swapping a live jar safe — {@link com.skydex.SkydexMod} cannot fix the
 * deployment process — but it removes the mod's own contribution to it.
 *
 * <p>{@code SkydexEagerClassesTest} fails the build if a class is added to the
 * capture or export packages without appearing here.
 */
public final class EagerClasses {

    private static final Logger LOGGER = LoggerFactory.getLogger("Skydex");

    /**
     * Every class reachable from a tick, screen, chat or render handler, plus
     * the codecs the export command reaches. Order is irrelevant.
     */
    public static final List<String> LOADED_EAGERLY = List.of(
            // Nested classes are listed individually and deliberately. A nested
            // class is a separate class file with its own entry in the jar, and
            // it loads on FIRST USE, not with its owner. That makes them the
            // worst case for the hazard this list exists for, not an exception
            // to it: ContainerCapture$1 is the switch map over ScreenKind, so it
            // is first touched when a container is captured, and
            // GreenhouseScanner$Scan only when a scan is fully corroborated,
            // both of which can be hours into a session.
            "com.skydex.capture.ContainerCapture$1",
            "com.skydex.capture.ContainerCapture$SlottedStack",
            "com.skydex.capture.SackChatParser$Update",
            "com.skydex.export.BinaryCodec$Pool",
            "com.skydex.export.CompactCodec$Pool",
            "com.skydex.export.ExportCodec$MaxCompressionGzip",
            "com.skydex.garden.GreenhouseDiagnostics$Status",
            "com.skydex.garden.GreenhouseScanner$Located",
            "com.skydex.garden.GreenhouseScanner$Scan",
            "com.skydex.http.SkydexHttpServer$SseClient",
            // The switch map over CellStatus, first touched when the player
            // looks at a cell with the progress view on.
            "com.skydex.render.LayoutOverlayRenderer$1",
            // http: reached from the server's own worker threads
            "com.skydex.http.SkydexHttpServer",
            "com.skydex.http.SseFrames",
            // capture: reached from tick / screen / chat handlers
            "com.skydex.capture.ChromeFilter",
            "com.skydex.capture.ContainerCapture",
            "com.skydex.capture.ItemIds",
            "com.skydex.capture.SackChatListener",
            "com.skydex.capture.SackChatParser",
            "com.skydex.capture.SackLoreParser",
            "com.skydex.capture.ScreenKind",
            "com.skydex.capture.TitleParser",
            // export: reached from the copy command
            "com.skydex.export.BinaryCodec",
            "com.skydex.export.BinaryFormatException",
            "com.skydex.export.BinaryReader",
            "com.skydex.export.BinaryWriter",
            "com.skydex.export.CompactCodec",
            "com.skydex.export.ExportCodec",
            "com.skydex.export.ExportSection",
            // garden: reached from the tick handler's greenhouse scan
            "com.skydex.garden.BedBlocks",
            "com.skydex.garden.PlantModelCapture",
            "com.skydex.garden.PlantIdentity",
            "com.skydex.garden.PlantModels",
            "com.skydex.garden.PlantModels$Head",
            "com.skydex.garden.PlantModels$Stem",
            "com.skydex.garden.PlantModels$Model",
            "com.skydex.garden.BedShape",
            "com.skydex.garden.BedShape$Bed",
            "com.skydex.garden.GreenhouseOffset",
            "com.skydex.garden.GreenhouseDiagnostics$Source",
            "com.skydex.garden.CropDiagnosticsParser",
            "com.skydex.garden.CropIds",
            "com.skydex.garden.GardenGrid",
            "com.skydex.garden.GreenhouseDiagnostics",
            "com.skydex.garden.GreenhouseCatalog",
            "com.skydex.garden.GreenhouseHeads",
            "com.skydex.garden.GreenhouseCatalog$Entry",
            "com.skydex.garden.GreenhouseCatalog$Requirement",
            "com.skydex.garden.GreenhouseScanner",
            "com.skydex.garden.MutationNames",
            // data: reached from every capture path
            "com.skydex.data.ChestRecord",
            "com.skydex.data.GreenhouseBoard",
            "com.skydex.data.GreenhouseCell",
            "com.skydex.data.IslandSnapshot",
            "com.skydex.data.ItemEntry",
            "com.skydex.data.ItemExtra",
            "com.skydex.data.ItemNames",
            "com.skydex.data.SkinTextures",
            "com.skydex.data.SnapshotStore",
            "com.skydex.data.StoreManager",
            // layout + render: reached from the render thread
            "com.skydex.layout.CellStatus",
            "com.skydex.layout.EstimateFormat",
            "com.skydex.layout.GreenhouseLayout",
            "com.skydex.layout.GreenhouseShareDecoder",
            "com.skydex.layout.GridOrientation",
            "com.skydex.layout.LayoutAnchor",
            "com.skydex.layout.LayoutCell",
            "com.skydex.layout.LayoutFormatException",
            "com.skydex.layout.LayoutMatch",
            "com.skydex.layout.LayoutPalette",
            "com.skydex.layout.LayoutParser",
            "com.skydex.layout.LayoutStore",
            "com.skydex.render.LayoutOverlayRenderer",
            "com.skydex.render.LayoutProgress",
            "com.skydex.render.PlantModelRenderer",
            "com.skydex.render.PlantModelRenderer$Instance",
            "com.skydex.render.PlantPlacement",
            "com.skydex.render.PlantGhostCollector",
            "com.skydex.render.PlantBounds",
            "com.skydex.garden.AutoPlantCapture",
            // location: reached from the tick handler
            "com.skydex.location.GardenAreas",
            "com.skydex.location.GameModes",
            "com.skydex.location.LocationTracker");

    private EagerClasses() {
    }

    /**
     * Initialise every listed class. A class literal alone does not guarantee
     * initialisation, so each is loaded explicitly.
     */
    public static void loadAll() {
        int loaded = 0;
        ClassLoader loader = EagerClasses.class.getClassLoader();
        for (String name : LOADED_EAGERLY) {
            try {
                Class.forName(name, true, loader);
                loaded++;
            } catch (Throwable failure) {
                // A class that will not load is a real problem, but not one
                // worth refusing to start over.
                LOGGER.warn("Could not preload {}", name, failure);
            }
        }
        LOGGER.debug("Preloaded {} of {} classes", loaded, LOADED_EAGERLY.size());
    }
}
