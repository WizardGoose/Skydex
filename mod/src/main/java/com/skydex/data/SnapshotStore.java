package com.skydex.data;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;

/**
 * Per-profile accumulator: merges observations over time, persists them, and
 * hands out spec-shaped snapshots.
 *
 * <p>Two merge rules carry the design:
 * <ul>
 *   <li><b>Chests merge by block position.</b> Re-opening a chest replaces that
 *       chest's contents rather than appending, and a chest unseen for
 *       {@link #CHEST_TTL_MS} is dropped so a torn-down island does not haunt
 *       the export.</li>
 *   <li><b>Ender chest and storage merge by page.</b> Both are paged screens on
 *       Hypixel, so the player only ever sees one page at a time. Replacing the
 *       whole section on every screen would delete the eight pages they did not
 *       just open; keying by page keeps each one until it is re-observed.</li>
 * </ul>
 *
 * <p>The on-disk format is the spec document plus a private {@code _pages}
 * object. Readers of the spec ignore unknown fields, and {@link #toSnapshot}
 * never emits {@code _pages} — the wire format stays exactly the contract.
 *
 * <p>All mutating methods are synchronised: capture runs on the client thread
 * while the HTTP worker reads.
 */
public final class SnapshotStore {

    /** Chests unseen for longer than this are pruned. Spec: 30 days. */
    public static final long CHEST_TTL_MS = 30L * 24L * 60L * 60L * 1000L;

    /**
     * How stale the site's copy of an unchanged greenhouse may get before a
     * rescan is pushed anyway. Long enough that standing in the greenhouse does
     * not churn the feed, short enough that "observed Xm ago" stays honest.
     */
    public static final long GREENHOUSE_REFRESH_MS = 5L * 60L * 1000L;

    private static final String PAGES = "_pages";

    private final Path file;

    private String playerUuid;
    private String playerName;
    private String profileName;
    private String gameMode;

    /** Keyed by "x,y,z". null until the first island chest is captured. */
    private Map<String, ChestRecord> chests;
    private Map<String, Long> sacks;
    private List<ItemEntry> inventory;
    /** Keyed by page label ("1".."9"). null until a page is captured. */
    private Map<String, List<ItemEntry>> enderChestPages;
    private Map<String, List<ItemEntry>> storagePages;
    /** null until the greenhouse has been observed once. */
    private GreenhouseBoard greenhouse;
    /** {@code observedAt} of the last greenhouse board the site was told about. */
    private long greenhouseNotifiedAt;

    private long lastUpdate;
    private boolean dirty;

    public SnapshotStore(Path file) {
        this.file = file;
    }

    public Path file() {
        return file;
    }

    /** Filename-safe key for a (player, profile) pair. */
    public static String storeKey(String playerUuid, String profileName) {
        String uuid = playerUuid == null || playerUuid.isBlank() ? "unknown" : playerUuid;
        String profile = profileName == null || profileName.isBlank() ? "default" : profileName;
        return sanitise(uuid) + "_" + sanitise(profile);
    }

    private static String sanitise(String s) {
        return s.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9._-]", "_");
    }

    // ------------------------------------------------------------- capture

    public synchronized void setPlayer(String uuid, String name) {
        if (!Objects.equals(playerUuid, uuid) || !Objects.equals(playerName, name)) {
            this.playerUuid = uuid;
            this.playerName = name;
            touch();
        }
    }

    public synchronized void setProfile(String name, String gameMode) {
        if (!Objects.equals(profileName, name) || !Objects.equals(this.gameMode, gameMode)) {
            this.profileName = name;
            this.gameMode = gameMode;
            touch();
        }
    }

    public synchronized void recordChest(int x, int y, int z, String name, long seenAt, List<ItemEntry> items) {
        if (chests == null) {
            chests = new LinkedHashMap<>();
        }
        String key = ChestRecord.key(x, y, z);
        ChestRecord existing = chests.get(key);
        if (existing == null) {
            chests.put(key, new ChestRecord(x, y, z, name, seenAt, items));
        } else {
            existing.update(name, seenAt, items);
        }
        touch();
    }

    /**
     * Merge observed sack totals. A sack screen shows one category, so entries
     * for other categories must survive.
     */
    public synchronized void recordSacks(Map<String, Long> observed) {
        if (sacks == null) {
            sacks = new TreeMap<>();
        }
        sacks.putAll(observed);
        touch();
    }

    /**
     * Apply signed deltas from the "[Sacks]" chat message.
     *
     * <p>Only ids a sack <b>screen</b> has already established are touched. Chat
     * gives display names, not ids, and this mod ships no name-to-id repository,
     * so a name that inverts wrongly would otherwise invent a phantom entry that
     * never goes away. Restricting to known ids makes a bad resolution a no-op
     * instead. Totals are clamped at zero.
     *
     * @return how many entries actually changed
     */
    public synchronized int addSacks(Map<String, Long> deltas) {
        if (sacks == null || deltas == null || deltas.isEmpty()) {
            return 0;
        }
        int updated = 0;
        for (Map.Entry<String, Long> delta : deltas.entrySet()) {
            Long current = sacks.get(delta.getKey());
            if (current == null) {
                continue;
            }
            long next = Math.max(0L, current + delta.getValue());
            if (next != current) {
                sacks.put(delta.getKey(), next);
                updated++;
            }
        }
        if (updated > 0) {
            touch();
        }
        return updated;
    }

    public synchronized void recordInventory(List<ItemEntry> items) {
        this.inventory = new ArrayList<>(items);
        touch();
    }

    public synchronized void recordEnderChestPage(String page, List<ItemEntry> items) {
        if (enderChestPages == null) {
            enderChestPages = new TreeMap<>(pageOrder());
        }
        enderChestPages.put(page == null ? "1" : page, new ArrayList<>(items));
        touch();
    }

    public synchronized void recordStoragePage(String page, List<ItemEntry> items) {
        if (storagePages == null) {
            storagePages = new TreeMap<>(pageOrder());
        }
        storagePages.put(page == null ? "1" : page, new ArrayList<>(items));
        touch();
    }

    /**
     * Replace the observed greenhouse board wholesale.
     *
     * <p>No merge, unlike chests and pages. The board is always read in one full
     * pass, so a merge would only ever resurrect crops the player has since
     * harvested. The spec says the same thing from the reader's side: a new
     * snapshot's greenhouse replaces the old one entirely.
     *
     * <p>An unchanged board still updates the stored {@code observedAt}, but
     * does not notify. Those are two different things and conflating them costs
     * something either way. Notifying on every rescan would push the site a
     * stream of SSE updates carrying no news, every couple of seconds. But
     * discarding the rescan entirely freezes the timestamp at first sighting, so
     * a board verified thirty seconds ago would render as "observed 3 hours
     * ago", which is not what the field means: it records when the board was
     * last <i>confirmed</i>, not when it last changed.
     *
     * <p>So the stamp moves silently, and a notification is forced only once
     * every {@link #GREENHOUSE_REFRESH_MS} so the site's idea of freshness
     * cannot drift arbitrarily far behind while the player stands still.
     *
     * @return true when the site was notified
     */
    public synchronized boolean recordGreenhouse(GreenhouseBoard board) {
        if (board == null) {
            return false;
        }
        if (board.sameContent(greenhouse)) {
            // Same board, newer confirmation. Keep the fresher stamp.
            this.greenhouse = board;
            if (board.observedAt() - greenhouseNotifiedAt < GREENHOUSE_REFRESH_MS) {
                return false;
            }
            greenhouseNotifiedAt = board.observedAt();
            touch();
            return true;
        }
        this.greenhouse = board;
        greenhouseNotifiedAt = board.observedAt();
        touch();
        return true;
    }

    /** Numeric where possible ("2" before "10"), lexicographic otherwise. */
    private static Comparator<String> pageOrder() {
        return (a, b) -> {
            try {
                return Integer.compare(Integer.parseInt(a), Integer.parseInt(b));
            } catch (NumberFormatException e) {
                return a.compareTo(b);
            }
        };
    }

    private void touch() {
        lastUpdate = System.currentTimeMillis();
        dirty = true;
    }

    public synchronized boolean isDirty() {
        return dirty;
    }

    public synchronized long lastUpdate() {
        return lastUpdate;
    }

    // -------------------------------------------------------------- counts

    public synchronized int chestCount() {
        return chests == null ? 0 : chests.size();
    }

    public synchronized int sackTypeCount() {
        return sacks == null ? 0 : sacks.size();
    }

    /** @return item count, or -1 when never captured */
    public synchronized int inventoryCount() {
        return inventory == null ? -1 : inventory.size();
    }

    public synchronized int enderChestPageCount() {
        return enderChestPages == null ? 0 : enderChestPages.size();
    }

    public synchronized int storagePageCount() {
        return storagePages == null ? 0 : storagePages.size();
    }

    /** @return occupied greenhouse cells, or -1 when never observed */
    public synchronized int greenhouseCellCount() {
        return greenhouse == null ? -1 : greenhouse.cellCount();
    }

    /** null when never observed. */
    public synchronized GreenhouseBoard greenhouse() {
        return greenhouse;
    }


    public synchronized String profileName() {
        return profileName;
    }

    public synchronized String gameMode() {
        return gameMode;
    }

    // ------------------------------------------------------------ snapshot

    /** Drop chests unseen for longer than the TTL. @return number removed */
    public synchronized int prune(long now) {
        if (chests == null) {
            return 0;
        }
        int before = chests.size();
        chests.entrySet().removeIf(e -> now - e.getValue().lastSeen() > CHEST_TTL_MS);
        int removed = before - chests.size();
        if (removed > 0) {
            dirty = true;
        }
        return removed;
    }

    /** Build the spec document. Sections never captured stay omitted. */
    public synchronized IslandSnapshot toSnapshot(long now) {
        prune(now);
        IslandSnapshot snapshot = new IslandSnapshot()
                .exportedAt(now)
                .player(playerUuid, playerName)
                .profile(profileName, gameMode);
        if (sacks != null) {
            snapshot.sacks(nonZeroSacks());
        }
        if (chests != null) {
            snapshot.chests(new ArrayList<>(chests.values()));
        }
        if (inventory != null) {
            snapshot.inventory(new ArrayList<>(inventory));
        }
        if (enderChestPages != null) {
            snapshot.enderChest(flatten(enderChestPages));
        }
        if (storagePages != null) {
            snapshot.storage(flatten(storagePages));
        }
        if (greenhouse != null) {
            snapshot.greenhouse(greenhouse);
        }
        return snapshot;
    }

    /**
     * Sack totals worth sending: everything the player actually has some of.
     *
     * <p>A zero is not a fact about the island, it is a leftover from how the
     * totals get established. Opening a sack screen or catching a "[Sacks]" chat
     * line records the id, and the count can then fall to zero as things are
     * used. Shipping those tells the site "you have none of this" for hundreds
     * of ids the player has simply never held, which is noise rather than data.
     *
     * <p><b>Only the wire drops them.</b> An id being <i>established</i> and its
     * count being <i>zero</i> are separate facts, and the delta path depends on
     * the first: {@link #addSacks} deliberately only touches ids a sack screen
     * has already introduced, so a chat line adding to a zeroed id must still
     * apply. The in-memory map therefore keeps its zeros, and so does the save
     * file, which is why {@link #save} puts the full map back afterwards.
     */
    private synchronized TreeMap<String, Long> nonZeroSacks() {
        TreeMap<String, Long> out = new TreeMap<>();
        for (Map.Entry<String, Long> e : sacks.entrySet()) {
            if (e.getValue() != null && e.getValue() > 0L) {
                out.put(e.getKey(), e.getValue());
            }
        }
        return out;
    }

    /** How many sack ids carry a real count, i.e. how many reach the site. */
    public synchronized int nonZeroSackTypeCount() {
        return sacks == null ? 0 : nonZeroSacks().size();
    }

    private static List<ItemEntry> flatten(Map<String, List<ItemEntry>> pages) {
        List<ItemEntry> all = new ArrayList<>();
        for (List<ItemEntry> page : pages.values()) {
            all.addAll(page);
        }
        return all;
    }

    public String toJson(long now) {
        return toSnapshot(now).toMinifiedJson();
    }

    // ---------------------------------------------------------- persistence

    /** Write atomically (temp file + move) so a crash mid-save cannot truncate the store. */
    public synchronized void save() throws IOException {
        Path parent = file.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        long stamp = lastUpdate == 0 ? System.currentTimeMillis() : lastUpdate;
        JsonObject root = toSnapshot(stamp).toJson();

        // The wire drops zero-count sacks; this file must not. Losing them would
        // lose the set of ids a sack screen has established, and after a restart
        // a "[Sacks]" chat line adding to one of them would silently do nothing,
        // because addSacks only touches ids it already knows.
        if (sacks != null && !sacks.isEmpty()) {
            JsonObject full = new JsonObject();
            for (Map.Entry<String, Long> e : sacks.entrySet()) {
                full.addProperty(e.getKey(), e.getValue());
            }
            root.add("sacks", full);
        }

        // Private sidecar: page granularity the wire format does not carry.
        JsonObject pages = new JsonObject();
        if (enderChestPages != null) {
            pages.add("enderChest", pagesToJson(enderChestPages));
        }
        if (storagePages != null) {
            pages.add("storage", pagesToJson(storagePages));
        }
        if (!pages.isEmpty()) {
            root.add(PAGES, pages);
        }

        Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
        Files.writeString(tmp, root.toString(), StandardCharsets.UTF_8);
        try {
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (java.nio.file.AtomicMoveNotSupportedException e) {
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
        }
        dirty = false;
    }

    private static JsonObject pagesToJson(Map<String, List<ItemEntry>> pages) {
        JsonObject o = new JsonObject();
        for (Map.Entry<String, List<ItemEntry>> e : pages.entrySet()) {
            JsonArray arr = new JsonArray(e.getValue().size());
            for (ItemEntry item : e.getValue()) {
                arr.add(item.toJson());
            }
            o.add(e.getKey(), arr);
        }
        return o;
    }

    public static SnapshotStore load(Path file) throws IOException {
        SnapshotStore store = new SnapshotStore(file);
        if (!Files.exists(file)) {
            return store;
        }
        String text = Files.readString(file, StandardCharsets.UTF_8);
        JsonObject root = JsonParser.parseString(text).getAsJsonObject();
        IslandSnapshot snapshot = IslandSnapshot.fromJson(root);

        store.playerUuid = snapshot.playerUuid();
        store.playerName = snapshot.playerName();
        store.profileName = snapshot.profileName();
        store.gameMode = snapshot.gameMode();
        store.lastUpdate = snapshot.exportedAt();
        if (snapshot.sacks() != null) {
            store.sacks = new TreeMap<>(snapshot.sacks());
        }
        if (snapshot.chests() != null) {
            store.chests = new LinkedHashMap<>();
            for (ChestRecord chest : snapshot.chests()) {
                store.chests.put(chest.key(), chest);
            }
        }
        store.inventory = snapshot.inventory();
        store.greenhouse = snapshot.greenhouse();
        if (store.greenhouse != null) {
            // Otherwise the first rescan after a restart would look overdue and
            // notify immediately, whatever it found.
            store.greenhouseNotifiedAt = store.greenhouse.observedAt();
        }

        JsonObject pages = root.has(PAGES) && root.get(PAGES).isJsonObject()
                ? root.getAsJsonObject(PAGES) : null;
        store.enderChestPages = readPages(pages, "enderChest", snapshot.enderChest());
        store.storagePages = readPages(pages, "storage", snapshot.storage());

        store.dirty = false;
        return store;
    }

    /**
     * Prefer the page sidecar; fall back to treating a flat list as page "1"
     * (files written before the sidecar existed, or hand-edited ones).
     */
    private static Map<String, List<ItemEntry>> readPages(
            JsonObject pages, String key, List<ItemEntry> flatFallback) {
        if (pages != null && pages.has(key) && pages.get(key).isJsonObject()) {
            Map<String, List<ItemEntry>> out = new TreeMap<>(pageOrder());
            for (Map.Entry<String, JsonElement> e : pages.getAsJsonObject(key).entrySet()) {
                List<ItemEntry> items = new ArrayList<>();
                for (JsonElement item : e.getValue().getAsJsonArray()) {
                    items.add(ItemEntry.fromJson(item));
                }
                out.put(e.getKey(), items);
            }
            return out;
        }
        if (flatFallback != null) {
            Map<String, List<ItemEntry>> out = new TreeMap<>(pageOrder());
            out.put("1", new ArrayList<>(flatFallback));
            return out;
        }
        return null;
    }
}
