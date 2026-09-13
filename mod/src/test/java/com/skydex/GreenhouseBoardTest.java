package com.skydex;

import com.skydex.data.GreenhouseBoard;
import com.skydex.data.GreenhouseCell;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The greenhouse section is a hard contract with the website, which is being
 * built against the same spec in parallel, so the field names and the shape are
 * pinned byte-exactly here rather than described.
 */
class GreenhouseBoardTest {

    private static final long OBSERVED = 1754092800000L;
    private static final long NEXT_STAGE = 1754099000000L;

    /** The spec's own worked example, character for character. */
    private static final String SPEC_EXAMPLE =
            "{\"observedAt\":1754092800000,\"size\":[10,10],\"cells\":["
                    + "{\"x\":0,\"y\":3,\"crop\":\"PUMPKIN\"},"
                    + "{\"x\":1,\"y\":3,\"mutation\":\"CHOCONUT\",\"nextStageAt\":1754099000000}]}";

    private static GreenhouseBoard specExample() {
        return new GreenhouseBoard(OBSERVED, 10, 10, List.of(
                GreenhouseCell.crop(0, 3, "PUMPKIN"),
                GreenhouseCell.mutation(1, 3, "CHOCONUT").withNextStageAt(NEXT_STAGE)));
    }

    @Test
    @DisplayName("serialises byte-exactly to the spec's example")
    void matchesSpecExample() {
        assertEquals(SPEC_EXAMPLE, specExample().toJson().toString());
    }

    @Test
    @DisplayName("json round-trips into an equal document")
    void roundTrips() {
        GreenhouseBoard parsed = GreenhouseBoard.fromJson(JsonParser.parseString(SPEC_EXAMPLE));
        assertNotNull(parsed);
        assertEquals(SPEC_EXAMPLE, parsed.toJson().toString());
        assertEquals(OBSERVED, parsed.observedAt());
        assertEquals(10, parsed.width());
        assertEquals(10, parsed.height());
        assertEquals(2, parsed.cellCount());
        assertEquals(1, parsed.mutationCount());
        assertEquals(1, parsed.countdownCount());
    }

    @Test
    @DisplayName("a cell carries crop XOR mutation, and nextStageAt only when read")
    void cellShape() {
        GreenhouseCell crop = GreenhouseCell.crop(2, 7, "WHEAT");
        assertNull(crop.mutation());
        assertFalse(crop.isMutation());
        assertFalse(crop.hasNextStage());
        assertEquals("{\"x\":2,\"y\":7,\"crop\":\"WHEAT\"}", crop.toJson().toString());

        GreenhouseCell mutation = GreenhouseCell.mutation(2, 7, "GODSEED");
        assertTrue(mutation.isMutation());
        assertNull(mutation.crop());
        // Absent means "no fresh reading", never "ready now", so the key is
        // omitted rather than emitted as zero.
        assertEquals("{\"x\":2,\"y\":7,\"mutation\":\"GODSEED\"}", mutation.toJson().toString());
    }

    @Test
    @DisplayName("cells outside the board are a validation error, not a silent clamp")
    void rejectsOutOfRangeCells() {
        assertThrows(IllegalArgumentException.class, () -> new GreenhouseBoard(
                OBSERVED, 10, 10, List.of(GreenhouseCell.crop(10, 0, "WHEAT"))));
        assertThrows(IllegalArgumentException.class, () -> new GreenhouseBoard(
                OBSERVED, 10, 10, List.of(GreenhouseCell.crop(0, -1, "WHEAT"))));
        assertThrows(IllegalArgumentException.class, () -> new GreenhouseBoard(
                OBSERVED, 0, 10, List.of()));
    }

    @Test
    @DisplayName("two cells cannot claim the same coordinate")
    void rejectsDuplicateCells() {
        assertThrows(IllegalArgumentException.class, () -> new GreenhouseBoard(
                OBSERVED, 10, 10, List.of(
                        GreenhouseCell.crop(3, 3, "WHEAT"),
                        GreenhouseCell.mutation(3, 3, "ZOMBUD"))));
    }

    @Test
    @DisplayName("an observed but bare greenhouse is a real, emittable state")
    void emptyBoardIsLegal() {
        GreenhouseBoard empty = new GreenhouseBoard(OBSERVED, 10, 10, List.of());
        assertEquals(0, empty.cellCount());
        // "verified empty" is a different fact from "never observed", and only
        // the latter is omitted from the snapshot.
        assertEquals("{\"observedAt\":1754092800000,\"size\":[10,10],\"cells\":[]}",
                empty.toJson().toString());
    }

    @Test
    @DisplayName("content comparison ignores the timestamp so rescans stay quiet")
    void sameContentIgnoresObservedAt() {
        GreenhouseBoard first = specExample();
        GreenhouseBoard laterSameBoard = new GreenhouseBoard(OBSERVED + 60_000L, 10, 10, List.of(
                GreenhouseCell.crop(0, 3, "PUMPKIN"),
                GreenhouseCell.mutation(1, 3, "CHOCONUT").withNextStageAt(NEXT_STAGE)));
        assertTrue(first.sameContent(laterSameBoard));
        assertFalse(first.sameContent(null));

        GreenhouseBoard changed = new GreenhouseBoard(OBSERVED, 10, 10, List.of(
                GreenhouseCell.crop(0, 3, "MELON"),
                GreenhouseCell.mutation(1, 3, "CHOCONUT").withNextStageAt(NEXT_STAGE)));
        assertFalse(first.sameContent(changed));

        // A fresh countdown is new information even when the board is identical.
        GreenhouseBoard newCountdown = new GreenhouseBoard(OBSERVED, 10, 10, List.of(
                GreenhouseCell.crop(0, 3, "PUMPKIN"),
                GreenhouseCell.mutation(1, 3, "CHOCONUT").withNextStageAt(NEXT_STAGE + 5_000L)));
        assertFalse(first.sameContent(newCountdown));
    }

    @Test
    @DisplayName("unreadable stored boards degrade to 'never observed'")
    void malformedInputIsRefused() {
        assertNull(GreenhouseBoard.fromJson(null));
        assertNull(GreenhouseBoard.fromJson(JsonParser.parseString("[]")));
        assertNull(GreenhouseBoard.fromJson(JsonParser.parseString("{\"cells\":[]}")),
                "a board with no size is not usable");
        // A stored board violating its own size must not be carried forward.
        assertNull(GreenhouseBoard.fromJson(JsonParser.parseString(
                "{\"observedAt\":1,\"size\":[2,2],\"cells\":[{\"x\":9,\"y\":9,\"crop\":\"WHEAT\"}]}")));
        // A cell with neither crop nor mutation is dropped rather than smuggled on.
        GreenhouseBoard partial = GreenhouseBoard.fromJson(JsonParser.parseString(
                "{\"observedAt\":1,\"size\":[10,10],\"cells\":["
                        + "{\"x\":0,\"y\":0},{\"x\":1,\"y\":0,\"crop\":\"WHEAT\"}]}"));
        assertNotNull(partial);
        assertEquals(1, partial.cellCount());
    }

    @Test
    @DisplayName("reader tolerates unknown cell fields")
    void forwardCompatible() {
        GreenhouseBoard parsed = GreenhouseBoard.fromJson(JsonParser.parseString(
                "{\"observedAt\":1,\"size\":[10,10],\"somethingNew\":true,\"cells\":["
                        + "{\"x\":0,\"y\":0,\"crop\":\"WHEAT\",\"futureField\":42}]}"));
        assertNotNull(parsed);
        assertEquals(1, parsed.cellCount());
        assertEquals("WHEAT", parsed.cells().get(0).crop());
    }
}
