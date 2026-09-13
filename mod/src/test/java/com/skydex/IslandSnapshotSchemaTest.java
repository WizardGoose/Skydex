package com.skydex;

import com.skydex.data.IslandSnapshot;
import com.skydex.data.ItemEntry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The website is built against island-data-spec.md in parallel with this mod,
 * so field names are a hard contract. These tests fail loudly on any rename.
 */
class IslandSnapshotSchemaTest {

    @Test
    @DisplayName("fixture serialises byte-exactly to the spec shape")
    void serialisesToSpecShape() {
        assertEquals(Fixtures.EXPECTED_JSON, Fixtures.snapshot().toMinifiedJson());
    }

    @Test
    @DisplayName("uncaptured sections are omitted, not emitted empty")
    void omitsUncapturedSections() {
        String json = Fixtures.snapshot().toMinifiedJson();
        assertFalse(json.contains("enderChest"), "enderChest was never captured, must be absent");
        assertFalse(json.contains("\"storage\""), "storage was never captured, must be absent");
    }

    @Test
    @DisplayName("a captured-but-empty section is emitted as []")
    void emitsVerifiedEmptySection() {
        String json = new IslandSnapshot()
                .exportedAt(Fixtures.TS)
                .player(Fixtures.UUID, "WizardGoose")
                .profile("Strawberry", "normal")
                .enderChest(List.of())
                .toMinifiedJson();
        assertTrue(json.contains("\"enderChest\":[]"),
                "verified-empty must be [] so the site can tell it from 'no data': " + json);
    }

    @Test
    @DisplayName("unknown gameMode serialises as literal null, not a dropped key")
    void nullGameModeIsExplicit() {
        String json = new IslandSnapshot()
                .exportedAt(Fixtures.TS)
                .player(Fixtures.UUID, "WizardGoose")
                .profile("Strawberry", null)
                .toMinifiedJson();
        assertTrue(json.contains("\"gameMode\":null"), json);
    }

    @Test
    @DisplayName("schema constant is 1 and is emitted first")
    void schemaVersionPinned() {
        assertEquals(1, IslandSnapshot.SCHEMA);
        assertTrue(Fixtures.snapshot().toMinifiedJson().startsWith("{\"schema\":1,"));
    }

    @Test
    @DisplayName("json round-trips back into an equal document")
    void roundTripsThroughJson() {
        String json = Fixtures.snapshot().toMinifiedJson();
        IslandSnapshot parsed = IslandSnapshot.fromJson(json);

        assertEquals(json, parsed.toMinifiedJson());
        assertEquals("Strawberry", parsed.profileName());
        assertEquals("ironman", parsed.gameMode());
        assertNotNull(parsed.chests());
        assertEquals(1, parsed.chests().size());
        assertEquals(12, parsed.chests().get(0).x());
        assertEquals(-34, parsed.chests().get(0).z());
        assertEquals(25600L, parsed.sacks().get("ENCHANTED_BROWN_MUSHROOM"));

        // Omitted stays omitted, i.e. still "never captured" after a reload.
        assertNull(parsed.enderChest());
        assertNull(parsed.storage());
    }

    @Test
    @DisplayName("reader ignores unknown extra fields (forward compatible)")
    void ignoresUnknownFields() {
        String json = "{\"schema\":1,\"exportedAt\":1,\"somethingNew\":{\"a\":1},"
                + "\"player\":{\"uuid\":\"u\",\"name\":\"n\"},"
                + "\"profile\":{\"name\":\"p\",\"gameMode\":null},"
                + "\"inventory\":[{\"id\":\"X\",\"name\":\"X\",\"count\":2,\"future\":true}]}";
        IslandSnapshot parsed = IslandSnapshot.fromJson(json);
        assertEquals("p", parsed.profileName());
        assertNull(parsed.gameMode());
        assertEquals(List.of(new ItemEntry("X", "X", 2)), parsed.inventory());
    }
}
