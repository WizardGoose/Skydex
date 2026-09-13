package com.skydex;

import com.skydex.data.GreenhouseBoard;
import com.skydex.data.GreenhouseCell;
import com.skydex.data.IslandSnapshot;
import com.skydex.data.SnapshotStore;
import com.skydex.export.ExportCodec;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * How the greenhouse section behaves as part of a snapshot: when it appears,
 * when it does not, which transports carry it, and what a rescan does to the
 * live feed.
 */
class GreenhouseCaptureTest {

    private static GreenhouseBoard board(long observedAt, String cropAtZero) {
        return new GreenhouseBoard(observedAt, 10, 10, List.of(
                GreenhouseCell.crop(0, 0, cropAtZero),
                GreenhouseCell.mutation(4, 5, "GODSEED")));
    }

    @Test
    @DisplayName("omitted until first observed, never sent empty")
    void omittedUntilObserved() {
        // The site distinguishes "no data" from "verified empty", so an
        // unobserved greenhouse must not appear at all.
        String json = Fixtures.snapshot().toMinifiedJson();
        assertFalse(json.contains("greenhouse"), json);
        assertNull(Fixtures.snapshot().greenhouse());
    }

    @Test
    @DisplayName("an observed board appears in the snapshot in the spec's shape")
    void observedBoardIsEmitted() {
        String json = Fixtures.snapshot().greenhouse(board(1754092800000L, "PUMPKIN")).toMinifiedJson();
        assertTrue(json.contains("\"greenhouse\":{\"observedAt\":1754092800000,\"size\":[10,10],"
                        + "\"cells\":[{\"x\":0,\"y\":0,\"crop\":\"PUMPKIN\"},"
                        + "{\"x\":4,\"y\":5,\"mutation\":\"GODSEED\"}]}"),
                json);
    }

    @Test
    @DisplayName("the clipboard code carries the greenhouse, unlike the API-covered sections")
    void survivesTheExportTrim() {
        // The Hypixel API does not expose the greenhouse at all, and a whole
        // board is a hundred cells at most, so the spec puts it in both
        // transports even though inventory and storage are dropped.
        IslandSnapshot trimmed = Fixtures.snapshot()
                .greenhouse(board(1754092800000L, "PUMPKIN"))
                .withoutApiCoveredSections();
        assertNotNull(trimmed.greenhouse());
        String json = trimmed.toMinifiedJson();
        assertTrue(json.contains("\"greenhouse\""), json);
        assertFalse(json.contains("\"inventory\""), json);

        // And it still survives the real encode/decode the clipboard uses.
        IslandSnapshot decoded = IslandSnapshot.fromJson(
                ExportCodec.decode(ExportCodec.encode(json)));
        assertNotNull(decoded.greenhouse());
        assertEquals(2, decoded.greenhouse().cellCount());
    }

    @Test
    @DisplayName("snapshot json round-trips the greenhouse")
    void roundTripsThroughSnapshotJson() {
        String json = Fixtures.snapshot().greenhouse(board(1754092800000L, "PUMPKIN")).toMinifiedJson();
        IslandSnapshot parsed = IslandSnapshot.fromJson(json);
        assertEquals(json, parsed.toMinifiedJson());
        assertEquals("GODSEED", parsed.greenhouse().cells().get(1).mutation());
    }

    @Test
    @DisplayName("a rescan that changes nothing does not dirty the store or bump the feed")
    void unchangedRescanIsQuiet(@TempDir Path dir) throws IOException {
        // The scanner runs on a timer. If an identical board still counted as a
        // change, the site would get an SSE push every couple of seconds
        // carrying no news, and the save file would rewrite just as often.
        SnapshotStore store = new SnapshotStore(dir.resolve("s.json"));
        assertEquals(-1, store.greenhouseCellCount(), "never observed reads as -1, not 0");

        assertTrue(store.recordGreenhouse(board(1_000L, "PUMPKIN")), "first observation is a change");
        assertEquals(2, store.greenhouseCellCount());
        store.save();
        assertFalse(store.isDirty());

        assertFalse(store.recordGreenhouse(board(2_000L, "PUMPKIN")),
                "same board at a later time is not worth notifying about");
        assertFalse(store.isDirty(), "an unchanged rescan must not dirty the store");

        // ...but the freshness stamp still moves. observedAt records when the
        // board was last CONFIRMED, not when it last changed, so discarding the
        // rescan entirely would make a board verified a second ago render on the
        // site as "observed hours ago".
        assertEquals(2_000L, store.greenhouse().observedAt(),
                "an unchanged rescan must still refresh observedAt");

        assertTrue(store.recordGreenhouse(board(3_000L, "MELON")), "a different crop is a change");
        assertTrue(store.isDirty());
        assertFalse(store.recordGreenhouse(null), "a null board is not a change");
    }

    @Test
    @DisplayName("an unchanged board is pushed anyway once the site's copy gets stale")
    void staleUnchangedBoardIsRefreshed(@TempDir Path dir) throws IOException {
        // Silently refreshing the stamp keeps the feed quiet, but on its own it
        // lets the site's idea of freshness fall arbitrarily far behind while
        // the player stands in the greenhouse. So a push is forced eventually.
        SnapshotStore store = new SnapshotStore(dir.resolve("s.json"));
        long t0 = 1_000_000L;
        assertTrue(store.recordGreenhouse(board(t0, "PUMPKIN")));
        store.save();

        long justUnder = t0 + SnapshotStore.GREENHOUSE_REFRESH_MS - 1;
        assertFalse(store.recordGreenhouse(board(justUnder, "PUMPKIN")));
        assertFalse(store.isDirty());

        long justOver = t0 + SnapshotStore.GREENHOUSE_REFRESH_MS;
        assertTrue(store.recordGreenhouse(board(justOver, "PUMPKIN")),
                "past the refresh window an unchanged board must be pushed anyway");
        assertTrue(store.isDirty());

        // The window restarts from the push, not from the first sighting.
        assertFalse(store.recordGreenhouse(board(justOver + 1, "PUMPKIN")));
    }

    @Test
    @DisplayName("a reload does not make the first rescan look overdue")
    void reloadDoesNotForceAnImmediatePush(@TempDir Path dir) throws IOException {
        Path file = dir.resolve("s.json");
        SnapshotStore store = new SnapshotStore(file);
        store.setProfile("Strawberry", "normal");
        store.recordGreenhouse(board(5_000_000L, "PUMPKIN"));
        store.save();

        SnapshotStore reloaded = SnapshotStore.load(file);
        assertFalse(reloaded.recordGreenhouse(board(5_000_001L, "PUMPKIN")),
                "a rescan right after a restart must not count as overdue");
        assertFalse(reloaded.isDirty());
    }

    @Test
    @DisplayName("a new board replaces the old one wholesale, never merges")
    void replacesWholesale(@TempDir Path dir) {
        SnapshotStore store = new SnapshotStore(dir.resolve("s.json"));
        store.recordGreenhouse(board(1_000L, "PUMPKIN"));
        // Harvested down to one cell: merging would resurrect the other.
        store.recordGreenhouse(new GreenhouseBoard(2_000L, 10, 10,
                List.of(GreenhouseCell.crop(0, 0, "PUMPKIN"))));
        assertEquals(1, store.greenhouseCellCount());
        assertEquals(0, store.greenhouse().mutationCount());
    }

    @Test
    @DisplayName("the board survives a save and reload")
    void persists(@TempDir Path dir) throws IOException {
        Path file = dir.resolve("store.json");
        SnapshotStore store = new SnapshotStore(file);
        store.setPlayer(Fixtures.UUID, "WizardGoose");
        store.setProfile("Strawberry", "ironman");
        store.recordGreenhouse(board(1754092800000L, "PUMPKIN"));
        store.save();

        SnapshotStore reloaded = SnapshotStore.load(file);
        assertEquals(2, reloaded.greenhouseCellCount());
        GreenhouseBoard back = reloaded.greenhouse();
        assertNotNull(back);
        assertEquals(1754092800000L, back.observedAt());
        assertEquals("GODSEED", back.cells().get(1).mutation());
        assertFalse(reloaded.isDirty());

        // A store that never saw one stays "never observed" after a reload.
        SnapshotStore fresh = new SnapshotStore(dir.resolve("empty.json"));
        fresh.setProfile("Other", "normal");
        fresh.save();
        assertEquals(-1, SnapshotStore.load(dir.resolve("empty.json")).greenhouseCellCount());
    }
}
