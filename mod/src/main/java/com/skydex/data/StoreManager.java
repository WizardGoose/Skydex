package com.skydex.data;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Owns one {@link SnapshotStore} per (player, profile) pair and tracks which is
 * currently active.
 *
 * <p>Keeping profiles apart matters: an ironman profile's chests are not the
 * main profile's chests, and merging them would silently corrupt both.
 */
public final class StoreManager {

    private final Path dir;
    private final Map<String, SnapshotStore> stores = new ConcurrentHashMap<>();
    private volatile SnapshotStore active;

    public StoreManager(Path dir) {
        this.dir = dir;
    }

    public Path dir() {
        return dir;
    }

    /** @return the active store, or null before the player is on a known profile */
    public SnapshotStore active() {
        return active;
    }

    /**
     * Point at the store for this player/profile, loading it from disk the
     * first time. Safe to call every tick: it is a no-op once resolved.
     */
    public SnapshotStore activate(String uuid, String playerName, String profileName, String gameMode) {
        String key = SnapshotStore.storeKey(uuid, profileName);
        SnapshotStore store = stores.computeIfAbsent(key, k -> {
            Path file = dir.resolve(k + ".json");
            try {
                return SnapshotStore.load(file);
            } catch (IOException | RuntimeException e) {
                // A corrupt or unreadable store must not stop capture; start fresh.
                return new SnapshotStore(file);
            }
        });
        store.setPlayer(uuid, playerName);
        store.setProfile(profileName, gameMode);
        this.active = store;
        return store;
    }

    /** @return the JSON the HTTP endpoint serves, or null when nothing is captured */
    public String activeJson() {
        SnapshotStore store = active;
        if (store == null) {
            return null;
        }
        // Keep legacy snapshots on disk, but never resend API-backed inventory data.
        return store.toSnapshot(System.currentTimeMillis())
                .onlySections(com.skydex.export.ExportSection.capturedSections()).toMinifiedJson();
    }

    /**
     * A value that changes whenever the active snapshot changes.
     *
     * <p>The SSE layer polls this instead of being called on every capture,
     * which keeps the HTTP server decoupled from the capture path and gives the
     * spec's ≥1 s debounce for free.
     *
     * @return the active store's last-update stamp, or 0 when there is none
     */
    public long activeVersion() {
        SnapshotStore store = active;
        return store == null ? 0L : store.lastUpdate();
    }

    /** Persist every dirty store. @return how many were written */
    public int saveDirty() {
        int saved = 0;
        for (SnapshotStore store : stores.values()) {
            if (!store.isDirty()) {
                continue;
            }
            try {
                store.save();
                saved++;
            } catch (IOException e) {
                // Reported by the caller; losing one save is not fatal.
            }
        }
        return saved;
    }
}
