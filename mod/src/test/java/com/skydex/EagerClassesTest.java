package com.skydex;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Guards the eager-load list against drift.
 *
 * <p>The list only protects against the lazy-class-load hazard if it is
 * complete, and completeness is exactly the sort of thing that rots the moment
 * someone adds a class. So the build fails when a class appears in a
 * tick-reachable package without being registered — the person adding it finds
 * out immediately, rather than a player finding out with a crash.
 */
class EagerClassesTest {

    /**
     * Packages whose classes are reachable from tick, screen, chat or render.
     *
     * <p>Adding a package here is part of adding a package to the mod: the guard
     * only guards what it is pointed at, and a new tick-reachable package that
     * nobody listed is exactly the silent gap this test exists to close.
     */
    private static final List<String> COVERED_PACKAGES =
            List.of("capture", "export", "data", "layout", "render", "location", "garden", "http");

    private static final Path CLASSES = Path.of("build/classes/java/main");

    /**
     * Every compiled class in a covered package, <b>including nested ones</b>.
     *
     * <p>Nested classes used to be filtered out here, on the stated grounds that
     * they "load with their owner". They do not. A nested class is a separate
     * class file with its own jar entry and its own lazy initialisation, so it
     * loads on first use like any other. That made them the worst case for the
     * hazard rather than an exemption from it: the ones most likely to go
     * untouched for hours are exactly the ones on rare code paths.
     */
    private static Set<String> compiledClasses() throws IOException {
        Set<String> onDisk = new TreeSet<>();
        for (String pkg : COVERED_PACKAGES) {
            Path dir = CLASSES.resolve("com/skydex").resolve(pkg);
            if (!Files.isDirectory(dir)) {
                continue;
            }
            try (Stream<Path> files = Files.list(dir)) {
                files.map(p -> p.getFileName().toString())
                        .filter(n -> n.endsWith(".class"))
                        .map(n -> "com.skydex." + pkg + "." + n.substring(0, n.length() - 6))
                        .forEach(onDisk::add);
            }
        }
        return onDisk;
    }

    @Test
    @DisplayName("every class in a tick-reachable package is registered for eager loading")
    void listCoversEveryReachableClass() throws IOException {
        assertTrue(Files.isDirectory(CLASSES),
                "compiled classes not found at " + CLASSES.toAbsolutePath());

        Set<String> missing = new TreeSet<>(compiledClasses());
        missing.removeAll(new TreeSet<>(EagerClasses.LOADED_EAGERLY));
        assertTrue(missing.isEmpty(),
                "these classes are reachable from a game thread but are not in "
                        + "EagerClasses.LOADED_EAGERLY, so they would load lazily: " + missing);
    }

    @Test
    @DisplayName("the list has no stale entries and no duplicates")
    void listIsClean() throws IOException {
        Set<String> distinct = new TreeSet<>(EagerClasses.LOADED_EAGERLY);
        assertEquals(EagerClasses.LOADED_EAGERLY.size(), distinct.size(),
                "the eager list contains duplicates");

        // The other half of the guard, which this test's name has always
        // promised and never actually checked. It matters most for the
        // compiler-generated nested names now on the list: if a toolchain change
        // renames one, the entry silently stops protecting anything, and only a
        // both-ways comparison notices.
        Set<String> stale = new TreeSet<>(distinct);
        stale.removeAll(compiledClasses());
        assertTrue(stale.isEmpty(),
                "these entries are registered but no longer exist, so they protect nothing: " + stale);
    }

    @Test
    @DisplayName("loading everything is safe to call and idempotent")
    void loadAllIsSafe() {
        // Classes that touch Minecraft types will fail to initialise off a game
        // classpath; loadAll must survive that rather than throwing at startup.
        EagerClasses.loadAll();
        EagerClasses.loadAll();
    }
}
