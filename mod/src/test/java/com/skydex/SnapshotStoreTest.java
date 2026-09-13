package com.skydex;

import com.skydex.data.IslandSnapshot;
import com.skydex.data.ItemEntry;
import com.skydex.data.SnapshotStore;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SnapshotStoreTest {

    private static final long NOW = Fixtures.TS;

    @Test
    @DisplayName("re-opening a chest replaces its contents, it does not duplicate the chest")
    void mergesChestsByPosition(@TempDir Path dir) {
        SnapshotStore store = new SnapshotStore(dir.resolve("s.json"));
        store.recordChest(1, 70, 1, "Chest", NOW, List.of(new ItemEntry("OAK_LOG", "Oak Log", 32)));
        store.recordChest(1, 70, 1, "Chest", NOW + 1000, List.of(new ItemEntry("OAK_LOG", "Oak Log", 64)));
        store.recordChest(2, 70, 1, "Large Chest", NOW, List.of());

        assertEquals(2, store.chestCount());
        IslandSnapshot snapshot = store.toSnapshot(NOW + 2000);
        var first = snapshot.chests().stream().filter(c -> c.x() == 1).findFirst().orElseThrow();
        assertEquals(1, first.items().size());
        assertEquals(64, first.items().get(0).count());
        assertEquals(NOW + 1000, first.lastSeen());
    }

    @Test
    @DisplayName("chests unseen for over 30 days are pruned")
    void prunesStaleChests(@TempDir Path dir) {
        SnapshotStore store = new SnapshotStore(dir.resolve("s.json"));
        long old = NOW - SnapshotStore.CHEST_TTL_MS - 1;
        store.recordChest(1, 70, 1, "Chest", old, List.of());
        store.recordChest(2, 70, 1, "Chest", NOW, List.of());

        assertEquals(2, store.chestCount());
        assertEquals(1, store.prune(NOW));
        assertEquals(1, store.chestCount());
        assertEquals(2, store.toSnapshot(NOW).chests().get(0).x());
    }

    @Test
    @DisplayName("a chest exactly at the TTL boundary survives")
    void keepsChestAtBoundary(@TempDir Path dir) {
        SnapshotStore store = new SnapshotStore(dir.resolve("s.json"));
        store.recordChest(1, 70, 1, "Chest", NOW - SnapshotStore.CHEST_TTL_MS, List.of());
        assertEquals(0, store.prune(NOW));
        assertEquals(1, store.chestCount());
    }

    @Test
    @DisplayName("nothing captured yet means the sections are absent, not empty")
    void omitsUntouchedSections(@TempDir Path dir) {
        SnapshotStore store = new SnapshotStore(dir.resolve("s.json"));
        store.setPlayer(Fixtures.UUID, "WizardGoose");
        store.setProfile("Strawberry", "ironman");

        IslandSnapshot snapshot = store.toSnapshot(NOW);
        assertNull(snapshot.chests());
        assertNull(snapshot.sacks());
        assertNull(snapshot.inventory());

        String json = snapshot.toMinifiedJson();
        assertTrue(json.contains("\"profile\":{\"name\":\"Strawberry\",\"gameMode\":\"ironman\"}"), json);
        assertTrue(!json.contains("chests"), json);
    }

    @Test
    @DisplayName("save/load survives a restart, including omitted-section state")
    void persistsAcrossRestart(@TempDir Path dir) throws IOException {
        // Wall-clock, not the fixed fixture stamp: save() prunes against real
        // time, so a chest dated a year ago would be (correctly) dropped.
        long now = System.currentTimeMillis();
        Path file = dir.resolve("profile.json");
        SnapshotStore store = new SnapshotStore(file);
        store.setPlayer(Fixtures.UUID, "WizardGoose");
        store.setProfile("Strawberry", "ironman");
        store.recordChest(4, 71, -9, "Chest", now, List.of(new ItemEntry("ENCHANTED_DIAMOND", "Enchanted Diamond", 12)));
        store.recordSacks(Map.of("ENCHANTED_BROWN_MUSHROOM", 25600L));
        store.save();

        SnapshotStore reloaded = SnapshotStore.load(file);
        assertEquals(1, reloaded.chestCount());
        assertEquals(1, reloaded.sackTypeCount());
        assertEquals("Strawberry", reloaded.profileName());
        assertEquals("ironman", reloaded.gameMode());

        IslandSnapshot snapshot = reloaded.toSnapshot(now);
        assertNotNull(snapshot.chests());
        assertEquals(12, snapshot.chests().get(0).items().get(0).count());
        // never captured before the restart, still never captured after
        assertNull(snapshot.inventory());
        assertNull(snapshot.enderChest());
    }

    @Test
    @DisplayName("loading a missing file yields an empty store rather than throwing")
    void loadMissingFile(@TempDir Path dir) throws IOException {
        SnapshotStore store = SnapshotStore.load(dir.resolve("nope.json"));
        assertEquals(0, store.chestCount());
        assertNull(store.toSnapshot(NOW).chests());
    }

    @Test
    @DisplayName("store keys are filename safe")
    void storeKeysAreSafe() {
        assertEquals("e1f0c4d2-0000-4000-8000-000000000001_strawberry",
                SnapshotStore.storeKey(Fixtures.UUID, "Strawberry"));
        assertEquals("unknown_default", SnapshotStore.storeKey(null, null));
        assertTrue(SnapshotStore.storeKey("../../etc", "a/b\\c").matches("[a-z0-9._-]+"));
    }

    @Test
    @DisplayName("opening one ender chest page does not wipe the others")
    void mergesPagedSections(@TempDir Path dir) throws IOException {
        long now = System.currentTimeMillis();
        Path file = dir.resolve("p.json");
        SnapshotStore store = new SnapshotStore(file);
        store.recordEnderChestPage("1", List.of(new ItemEntry("A", "A", 1)));
        store.recordEnderChestPage("2", List.of(new ItemEntry("B", "B", 2)));
        assertEquals(2, store.enderChestPageCount());
        assertEquals(2, store.toSnapshot(now).enderChest().size());

        // Re-opening page 1 replaces only page 1.
        store.recordEnderChestPage("1", List.of(new ItemEntry("C", "C", 3)));
        assertEquals(2, store.enderChestPageCount());
        List<ItemEntry> flat = store.toSnapshot(now).enderChest();
        assertEquals(List.of(new ItemEntry("C", "C", 3), new ItemEntry("B", "B", 2)), flat);

        // Pages survive a restart, so a later single-page open cannot erase the rest.
        store.save();
        SnapshotStore reloaded = SnapshotStore.load(file);
        assertEquals(2, reloaded.enderChestPageCount());
        reloaded.recordEnderChestPage("1", List.of(new ItemEntry("D", "D", 4)));
        assertEquals(2, reloaded.toSnapshot(now).enderChest().size());
    }

    @Test
    @DisplayName("sack totals from different categories accumulate")
    void mergesSackCategories(@TempDir Path dir) {
        SnapshotStore store = new SnapshotStore(dir.resolve("p.json"));
        store.recordSacks(Map.of("WHEAT", 100L));
        store.recordSacks(Map.of("COBBLESTONE", 200L));
        assertEquals(2, store.sackTypeCount());
        store.recordSacks(Map.of("WHEAT", 150L));
        assertEquals(2, store.sackTypeCount());
        assertEquals(150L, store.toSnapshot(System.currentTimeMillis()).sacks().get("WHEAT"));
    }
}
