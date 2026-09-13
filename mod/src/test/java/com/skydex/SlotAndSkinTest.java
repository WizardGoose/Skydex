package com.skydex;

import com.skydex.data.ChestRecord;
import com.skydex.data.IslandSnapshot;
import com.skydex.data.ItemEntry;
import com.skydex.data.ItemExtra;
import com.skydex.data.SkinTextures;
import com.skydex.data.SnapshotStore;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Slots let the site draw a container the way it actually looks in game — the
 * owner's "comfort and similarity" goal — so identical stacks in different
 * slots must stay separate, and the slot has to survive the round trip.
 */
class SlotAndSkinTest {

    private static final String HASH =
            "9e0e0c4e1f0d4e4a8b6c2f1d0a3b5c7e9f1a2b3c4d5e6f708192a3b4c5d6e7f8";

    /** What a real player_head textures property decodes to. */
    private static final String TEXTURES_JSON = "{\"timestamp\":1754092800000,"
            + "\"profileId\":\"e1f0c4d200004000800000000000001\","
            + "\"profileName\":\"WizardGoose\",\"signatureRequired\":true,"
            + "\"textures\":{\"SKIN\":{\"url\":\"http://textures.minecraft.net/texture/" + HASH + "\"}}}";

    // -------------------------------------------------------------- slots

    @Test
    @DisplayName("slot survives the round trip and is omitted when absent")
    void slotRoundTrips() {
        ItemEntry slotted = new ItemEntry("OAK_LOG", "Oak Log", 64, ItemExtra.EMPTY, 17);
        assertEquals("{\"id\":\"OAK_LOG\",\"count\":64,\"slot\":17}", slotted.toJson().toString());
        assertEquals(17, ItemEntry.fromJson(slotted.toJson()).slot());
        assertEquals(slotted, ItemEntry.fromJson(slotted.toJson()));

        ItemEntry unslotted = new ItemEntry("OAK_LOG", "Oak Log", 64);
        assertEquals("{\"id\":\"OAK_LOG\",\"count\":64}", unslotted.toJson().toString());
        assertFalse(unslotted.hasSlot());
        assertEquals(ItemEntry.NO_SLOT, ItemEntry.fromJson(unslotted.toJson()).slot());
    }

    @Test
    @DisplayName("slot 0 is a real slot, not treated as absent")
    void slotZeroIsReal() {
        ItemEntry first = new ItemEntry("OAK_LOG", "Oak Log", 1, ItemExtra.EMPTY, 0);
        assertTrue(first.hasSlot());
        assertTrue(first.toJson().toString().contains("\"slot\":0"));
        assertEquals(0, ItemEntry.fromJson(first.toJson()).slot());
    }

    @Test
    @DisplayName("identical stacks in different slots are never merged")
    void identicalStacksStaySeparate() {
        ItemEntry a = new ItemEntry("ENCHANTED_BREAD", "Enchanted Bread", 64, ItemExtra.EMPTY, 0);
        ItemEntry b = new ItemEntry("ENCHANTED_BREAD", "Enchanted Bread", 64, ItemExtra.EMPTY, 1);

        // Same item, different slot: distinct entries, so a Set would keep both.
        assertFalse(a.equals(b));

        SnapshotStore store = new SnapshotStore(Path.of("unused.json"));
        store.recordChest(1, 70, 1, "Chest", Fixtures.TS, List.of(a, b));

        List<ItemEntry> items = store.toSnapshot(Fixtures.TS).chests().get(0).items();
        assertEquals(2, items.size(), "two occupied slots must stay two entries");
        assertEquals(0, items.get(0).slot());
        assertEquals(1, items.get(1).slot());
    }

    @Test
    @DisplayName("gaps are implied by missing slot numbers, not by empty entries")
    void gapsAreImplied() {
        // Slots 0 and 8 occupied, everything between empty.
        ChestRecord chest = new ChestRecord(0, 70, 0, "Chest", Fixtures.TS, List.of(
                new ItemEntry("OAK_LOG", "Oak Log", 1, ItemExtra.EMPTY, 0),
                new ItemEntry("OAK_LOG", "Oak Log", 1, ItemExtra.EMPTY, 8)));

        String json = chest.toJson().toString();
        assertTrue(json.contains("\"slot\":0"), json);
        assertTrue(json.contains("\"slot\":8"), json);
        assertEquals(2, chest.items().size(), "empty slots are absent, not sent as nulls");
    }

    @Test
    @DisplayName("sacks are aggregates and never carry a slot")
    void sacksNeverCarrySlot() {
        SnapshotStore store = new SnapshotStore(Path.of("unused.json"));
        store.recordSacks(Map.of("ENCHANTED_BREAD", 25_600L));

        IslandSnapshot snapshot = store.toSnapshot(Fixtures.TS);
        String json = snapshot.toMinifiedJson();

        // The sacks section is a flat id -> count map; there is nowhere to put a
        // slot, and nothing in it should look like one.
        assertEquals(Map.of("ENCHANTED_BREAD", 25_600L), snapshot.sacks());
        assertTrue(json.contains("\"sacks\":{\"ENCHANTED_BREAD\":25600}"), json);
        assertFalse(json.contains("slot"), json);
    }

    @Test
    @DisplayName("page-local slots keep pages distinct rather than colliding")
    void pageLocalSlots() {
        SnapshotStore store = new SnapshotStore(Path.of("unused.json"));
        // Both pages have something in slot 0; the page key keeps them apart.
        store.recordEnderChestPage("1",
                List.of(new ItemEntry("OAK_LOG", "Oak Log", 1, ItemExtra.EMPTY, 0)));
        store.recordEnderChestPage("2",
                List.of(new ItemEntry("ENCHANTED_BREAD", "Enchanted Bread", 1, ItemExtra.EMPTY, 0)));

        List<ItemEntry> flat = store.toSnapshot(Fixtures.TS).enderChest();
        assertEquals(2, flat.size());
        assertEquals(0, flat.get(0).slot());
        assertEquals(0, flat.get(1).slot());
        assertEquals("OAK_LOG", flat.get(0).id());
        assertEquals("ENCHANTED_BREAD", flat.get(1).id());
    }

    // --------------------------------------------------------------- skin

    @Test
    @DisplayName("the texture hash is pulled out of a real profile value")
    void extractsSkinHash() {
        String base64 = Base64.getEncoder()
                .encodeToString(TEXTURES_JSON.getBytes(StandardCharsets.UTF_8));
        assertEquals(HASH, SkinTextures.hashFromBase64(base64));
        assertEquals(HASH, SkinTextures.hashFromJson(TEXTURES_JSON));
    }

    @Test
    @DisplayName("https and bare urls both work")
    void acceptsUrlVariants() {
        assertEquals(HASH, SkinTextures.hashFromJson(
                "{\"textures\":{\"SKIN\":{\"url\":\"https://textures.minecraft.net/texture/" + HASH + "\"}}}"));
    }

    @Test
    @DisplayName("junk input yields null rather than an exception or a bogus hash")
    void toleratesJunk() {
        assertNull(SkinTextures.hashFromBase64(null));
        assertNull(SkinTextures.hashFromBase64(""));
        assertNull(SkinTextures.hashFromBase64("!!!not base64!!!"));
        assertNull(SkinTextures.hashFromJson("{\"textures\":{}}"));
        assertNull(SkinTextures.hashFromJson(null));
        // Too short to be a hash: must not match.
        assertNull(SkinTextures.hashFromJson("{\"url\":\"http://x/texture/abc\"}"));
    }

    @Test
    @DisplayName("skin ships in extra and round-trips")
    void skinRoundTrips() {
        ItemEntry head = new ItemEntry("PET_SKIN_ENDERMAN", "Enderman Pet Skin", 1,
                new ItemExtra(null, 0, null, false, HASH), 3);

        String json = head.toJson().toString();
        assertTrue(json.contains("\"skin\":\"" + HASH + "\""), json);
        assertTrue(json.contains("\"slot\":3"), json);
        assertEquals(head, ItemEntry.fromJson(head.toJson()));
        assertEquals(HASH, ItemEntry.fromJson(head.toJson()).extra().skin());
    }

    @Test
    @DisplayName("a skin alone is enough to make extra worth sending")
    void skinAloneIsNotEmpty() {
        ItemExtra skinOnly = new ItemExtra(null, 0, null, false, HASH);
        assertFalse(skinOnly.isEmpty());
        assertEquals("{\"skin\":\"" + HASH + "\"}", skinOnly.toJson().toString());
        assertTrue(new ItemExtra(null, 0, null, false, "  ").isEmpty());
    }
}
