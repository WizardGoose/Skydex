package com.skydex;

import com.skydex.data.IslandSnapshot;
import com.skydex.data.SnapshotStore;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * An id being <b>established</b> and its count being <b>zero</b> are separate
 * facts, and only one of them belongs on the wire.
 *
 * <p>A live audit of the owner's real snapshot found 138 of 511 sack entries
 * sitting at zero, about 3 KB of "you have none of this" for ids he has never
 * held. Those come from how totals get established: a sack screen or a
 * "[Sacks]" chat line introduces the id, and the count can then fall to zero.
 *
 * <p>The zeros still matter internally, because {@link SnapshotStore#addSacks}
 * deliberately only adjusts ids a sack screen has already introduced. Dropping
 * them from memory would make a chat delta on a zeroed id silently do nothing.
 * So they stay in memory and on disk, and only the wire omits them.
 */
class SackZeroCountTest {

    private static Map<String, Long> sacks() {
        Map<String, Long> observed = new LinkedHashMap<>();
        observed.put("ENCHANTED_BROWN_MUSHROOM", 25600L);
        observed.put("WHEAT", 0L);
        observed.put("SEEDS", 0L);
        observed.put("POTATO_ITEM", 12L);
        return observed;
    }

    @Test
    @DisplayName("the wire never carries a zero-count sack")
    void wireOmitsZeros(@TempDir Path dir) {
        SnapshotStore store = new SnapshotStore(dir.resolve("s.json"));
        store.recordSacks(sacks());

        IslandSnapshot snapshot = store.toSnapshot(Fixtures.TS);
        assertEquals(2, snapshot.sacks().size(), "only the ids with something in them ship");
        assertEquals(25600L, snapshot.sacks().get("ENCHANTED_BROWN_MUSHROOM"));
        assertEquals(12L, snapshot.sacks().get("POTATO_ITEM"));
        assertNull(snapshot.sacks().get("WHEAT"));

        String json = snapshot.toMinifiedJson();
        assertFalse(json.contains("\"WHEAT\":0"), json);
        assertFalse(json.contains(":0,"), "no zero-valued sack entry may reach the wire: " + json);
    }

    @Test
    @DisplayName("a zeroed id stays established, so a chat delta still applies")
    void zeroedIdRemainsEstablished(@TempDir Path dir) {
        SnapshotStore store = new SnapshotStore(dir.resolve("s.json"));
        store.recordSacks(sacks());

        // The whole reason the zeros are kept: this must land.
        assertEquals(1, store.addSacks(Map.of("WHEAT", 64L)));
        assertEquals(64L, store.toSnapshot(Fixtures.TS).sacks().get("WHEAT"));

        // And an id that was never established still must not be invented, which
        // is what stops a misread chat name from creating a phantom entry.
        assertEquals(0, store.addSacks(Map.of("NEVER_SEEN", 64L)));
        assertNull(store.toSnapshot(Fixtures.TS).sacks().get("NEVER_SEEN"));
    }

    @Test
    @DisplayName("counts driven back to zero drop off the wire but stay established")
    void countDrivenToZero(@TempDir Path dir) {
        SnapshotStore store = new SnapshotStore(dir.resolve("s.json"));
        store.recordSacks(sacks());

        assertEquals(1, store.addSacks(Map.of("POTATO_ITEM", -12L)));
        assertNull(store.toSnapshot(Fixtures.TS).sacks().get("POTATO_ITEM"),
                "spent down to nothing, so it stops being sent");
        // Still known, so it can come back without another screen open.
        assertEquals(1, store.addSacks(Map.of("POTATO_ITEM", 5L)));
        assertEquals(5L, store.toSnapshot(Fixtures.TS).sacks().get("POTATO_ITEM"));
    }

    @Test
    @DisplayName("zeros survive a restart, so deltas still work on the next session")
    void zerosPersist(@TempDir Path dir) throws IOException {
        Path file = dir.resolve("store.json");
        SnapshotStore store = new SnapshotStore(file);
        store.setPlayer(Fixtures.UUID, "WizardGoose");
        store.setProfile("Pomegranate", "ironman");
        store.recordSacks(sacks());
        store.save();

        SnapshotStore reloaded = SnapshotStore.load(file);
        // Had the save file been trimmed like the wire, this would be 0 and the
        // chat delta path would quietly stop working after every restart.
        assertEquals(1, reloaded.addSacks(Map.of("SEEDS", 32L)),
                "a zeroed id must still be established after a reload");
        assertEquals(32L, reloaded.toSnapshot(Fixtures.TS).sacks().get("SEEDS"));
        // The wire is still clean after the round trip.
        assertFalse(reloaded.toSnapshot(Fixtures.TS).toMinifiedJson().contains("\"WHEAT\""));
    }

    @Test
    @DisplayName("the status line reports what is sent, and how many are held back")
    void countsAreReportable(@TempDir Path dir) {
        SnapshotStore store = new SnapshotStore(dir.resolve("s.json"));
        store.recordSacks(sacks());
        assertEquals(4, store.sackTypeCount(), "everything established");
        assertEquals(2, store.nonZeroSackTypeCount(), "everything actually sent");
        assertTrue(store.sackTypeCount() > store.nonZeroSackTypeCount());
    }
}
