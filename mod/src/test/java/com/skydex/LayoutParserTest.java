package com.skydex;

import com.skydex.layout.GreenhouseLayout;
import com.skydex.layout.LayoutCell;
import com.skydex.layout.LayoutFormatException;
import com.skydex.layout.LayoutParser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The layout endpoint is the only place the mod accepts outside data, and a
 * half-valid layout would render a wrong ghost the player then builds against.
 * So: accept the spec example exactly, reject everything else with a reason.
 */
class LayoutParserTest {

    /** The example straight out of the spec. */
    static final String SPEC_EXAMPLE = """
            {
              "schema": 1,
              "label": "Choconut x72",
              "size": [10, 10],
              "cells": [
                { "x": 0, "y": 3, "crop": "Cocoa Beans", "ground": "farmland" },
                { "x": 1, "y": 3, "mutation": "Choconut" }
              ]
            }
            """;

    private static LayoutFormatException reject(String body) {
        return assertThrows(LayoutFormatException.class, () -> LayoutParser.parse(body));
    }

    @Test
    @DisplayName("accepts the spec example and reads every field")
    void acceptsSpecExample() {
        GreenhouseLayout layout = LayoutParser.parse(SPEC_EXAMPLE);

        assertEquals("Choconut x72", layout.label());
        assertEquals(10, layout.width());
        assertEquals(10, layout.height());
        assertEquals(2, layout.cellCount());

        LayoutCell crop = layout.cells().get(0);
        assertEquals(0, crop.x());
        assertEquals(3, crop.y());
        assertEquals("Cocoa Beans", crop.crop());
        assertNull(crop.mutation());
        assertEquals("farmland", crop.ground());
        assertTrue(crop.hasGround());
        assertEquals("Cocoa Beans", crop.displayName());

        LayoutCell mutation = layout.cells().get(1);
        assertTrue(mutation.isMutation());
        assertEquals("Choconut", mutation.mutation());
        assertNull(mutation.crop());
        assertTrue(!mutation.hasGround());

        // The spec example predates the estimate and still parses. A sender that
        // prices nothing is the ordinary case, not a degraded one.
        assertNull(crop.seconds());
        assertFalse(crop.hasSeconds());
        assertFalse(mutation.hasSeconds());
    }

    /**
     * A push from a site that could price the plot.
     *
     * <p>Only the first cell carries a time. The second is a mutation the site's
     * growth model has no honest answer for, and the whole point of the field
     * being optional is that such a cell travels with nothing rather than with a
     * placeholder.
     */
    static final String TIMED_EXAMPLE = """
            {
              "schema": 1,
              "label": "Choconut x72",
              "size": [10, 10],
              "cells": [
                { "x": 0, "y": 3, "crop": "Cocoa Beans", "ground": "farmland", "seconds": 54857 },
                { "x": 1, "y": 3, "mutation": "Witherbloom" }
              ]
            }
            """;

    @Test
    @DisplayName("reads the optional estimate, and leaves the cell without one alone")
    void readsOptionalSeconds() {
        GreenhouseLayout layout = LayoutParser.parse(TIMED_EXAMPLE);

        LayoutCell priced = layout.cells().get(0);
        assertEquals(54857, priced.seconds().intValue());
        assertTrue(priced.hasSeconds());
        // Everything else about the cell still arrives.
        assertEquals("Cocoa Beans", priced.crop());
        assertEquals("farmland", priced.ground());

        LayoutCell unpriced = layout.cells().get(1);
        assertNull(unpriced.seconds(), "a cell the sender could not price carries nothing");
        assertFalse(unpriced.hasSeconds());
    }

    @Test
    @DisplayName("an explicit null estimate reads as absent rather than as a failure")
    void treatsNullSecondsAsAbsent() {
        GreenhouseLayout layout = LayoutParser.parse("""
                {"schema":1,"label":"L","size":[2,2],
                 "cells":[{"x":0,"y":0,"crop":"Wheat","seconds":null}]}""");

        assertFalse(layout.cells().get(0).hasSeconds());
    }

    @Test
    @DisplayName("an estimate that is not a wait is rejected rather than repaired")
    void rejectsSecondsThatIsNotAWait() {
        // Zero and below would be a countdown that had already run out, and the
        // sender is required to omit the field instead. Repairing it here would
        // turn a sender bug into a wrong time on a real cell in game.
        assertTrue(reject("""
                {"schema":1,"label":"L","size":[2,2],
                 "cells":[{"x":0,"y":0,"crop":"Wheat","seconds":0}]}""")
                .getMessage().contains("at least 1"));
        assertTrue(reject("""
                {"schema":1,"label":"L","size":[2,2],
                 "cells":[{"x":0,"y":0,"crop":"Wheat","seconds":-90}]}""")
                .getMessage().contains("at least 1"));

        // A fraction is precision no growth model has.
        assertTrue(reject("""
                {"schema":1,"label":"L","size":[2,2],
                 "cells":[{"x":0,"y":0,"crop":"Wheat","seconds":1.5}]}""")
                .getMessage().contains("whole number"));

        // A number, not a numeric-looking string, and not a structure.
        assertTrue(reject("""
                {"schema":1,"label":"L","size":[2,2],
                 "cells":[{"x":0,"y":0,"crop":"Wheat","seconds":"3600"}]}""")
                .getMessage().contains("whole number"));
        assertTrue(reject("""
                {"schema":1,"label":"L","size":[2,2],
                 "cells":[{"x":0,"y":0,"crop":"Wheat","seconds":{"h":2}}]}""")
                .getMessage().contains("whole number"));
        assertTrue(reject("""
                {"schema":1,"label":"L","size":[2,2],
                 "cells":[{"x":0,"y":0,"crop":"Wheat","seconds":true}]}""")
                .getMessage().contains("whole number"));
    }

    @Test
    @DisplayName("a huge estimate is refused rather than wrapping into a small one")
    void rejectsSecondsOutOfRange() {
        assertTrue(reject("""
                {"schema":1,"label":"L","size":[2,2],
                 "cells":[{"x":0,"y":0,"crop":"Wheat","seconds":9999999999}]}""")
                .getMessage().contains("out of range"));
    }

    @Test
    @DisplayName("the estimate survives a save and reload")
    void roundTripsTheEstimate() {
        GreenhouseLayout original = LayoutParser.parse(TIMED_EXAMPLE);
        GreenhouseLayout again = LayoutParser.parse(original.toJson());

        // Cell equality covers the estimate, so a field that stopped being
        // written would fail here rather than quietly reading back as absent.
        assertEquals(original.cells(), again.cells());
        assertEquals(54857, again.cells().get(0).seconds().intValue());
        assertNull(again.cells().get(1).seconds());
    }

    @Test
    @DisplayName("a cell must have exactly one of crop or mutation")
    void enforcesCropXorMutation() {
        String both = """
                {"schema":1,"label":"L","size":[2,2],
                 "cells":[{"x":0,"y":0,"crop":"Wheat","mutation":"Choconut"}]}""";
        assertTrue(reject(both).getMessage().contains("exactly one"), reject(both).getMessage());

        String neither = """
                {"schema":1,"label":"L","size":[2,2],
                 "cells":[{"x":0,"y":0,"ground":"farmland"}]}""";
        assertTrue(reject(neither).getMessage().contains("exactly one"));
    }

    @Test
    @DisplayName("cells outside the declared grid are rejected")
    void rejectsOutOfBounds() {
        String body = """
                {"schema":1,"label":"L","size":[2,2],"cells":[{"x":2,"y":0,"crop":"Wheat"}]}""";
        assertTrue(reject(body).getMessage().contains("outside"), reject(body).getMessage());

        String negative = """
                {"schema":1,"label":"L","size":[2,2],"cells":[{"x":0,"y":-1,"crop":"Wheat"}]}""";
        assertTrue(reject(negative).getMessage().contains("outside"));
    }

    @Test
    @DisplayName("on an overlap the later entry wins, because senders order mutations after crops")
    void laterEntryWinsOnOverlap() {
        GreenhouseLayout layout = LayoutParser.parse("""
                {"schema":1,"label":"L","size":[4,4],
                 "cells":[{"x":1,"y":1,"crop":"Cocoa Beans"},{"x":1,"y":1,"mutation":"Choconut"}]}""");

        assertEquals(1, layout.cellCount(), "an overlap collapses to one cell, not two");
        LayoutCell cell = layout.cells().get(0);
        assertTrue(cell.isMutation(), "the later entry (the mutation) must win");
        assertEquals("Choconut", cell.mutation());
        assertNull(cell.crop());
    }

    @Test
    @DisplayName("schema must be present and equal to 1")
    void enforcesSchema() {
        assertTrue(reject("""
                {"label":"L","size":[1,1],"cells":[]}""").getMessage().contains("schema"));
        assertTrue(reject("""
                {"schema":2,"label":"L","size":[1,1],"cells":[]}""")
                .getMessage().contains("unsupported schema 2"));
    }

    @Test
    @DisplayName("label must be present, non-blank and bounded")
    void enforcesLabel() {
        assertTrue(reject("""
                {"schema":1,"size":[1,1],"cells":[]}""").getMessage().contains("label"));
        assertTrue(reject("""
                {"schema":1,"label":"   ","size":[1,1],"cells":[]}""")
                .getMessage().contains("blank"));

        String tooLong = "{\"schema\":1,\"label\":\"" + "x".repeat(LayoutParser.MAX_LABEL_LENGTH + 1)
                + "\",\"size\":[1,1],\"cells\":[]}";
        assertTrue(reject(tooLong).getMessage().contains("at most"));
    }

    @Test
    @DisplayName("size must be two sane integers")
    void enforcesSize() {
        assertTrue(reject("""
                {"schema":1,"label":"L","cells":[]}""").getMessage().contains("size"));
        assertTrue(reject("""
                {"schema":1,"label":"L","size":[1,2,3],"cells":[]}""")
                .getMessage().contains("exactly 2"));
        assertTrue(reject("""
                {"schema":1,"label":"L","size":[0,4],"cells":[]}""")
                .getMessage().contains("at least 1"));

        String huge = "{\"schema\":1,\"label\":\"L\",\"size\":["
                + (LayoutParser.MAX_DIMENSION + 1) + ",4],\"cells\":[]}";
        assertTrue(reject(huge).getMessage().contains("at most"));
    }

    @Test
    @DisplayName("cells must be present and well formed")
    void enforcesCellShape() {
        assertTrue(reject("""
                {"schema":1,"label":"L","size":[2,2]}""").getMessage().contains("cells"));
        assertTrue(reject("""
                {"schema":1,"label":"L","size":[2,2],"cells":[5]}""")
                .getMessage().contains("must be an object"));
        assertTrue(reject("""
                {"schema":1,"label":"L","size":[2,2],"cells":[{"y":0,"crop":"W"}]}""")
                .getMessage().contains("\"x\""));
        assertTrue(reject("""
                {"schema":1,"label":"L","size":[2,2],"cells":[{"x":0,"y":0,"crop":"  "}]}""")
                .getMessage().contains("blank"));
        assertTrue(reject("""
                {"schema":1,"label":"L","size":[2,2],"cells":[{"x":0,"y":0,"crop":{"a":1}}]}""")
                .getMessage().contains("must be a string"));
    }

    @Test
    @DisplayName("an empty cell list is legal: a layout can be blank")
    void allowsEmptyCells() {
        GreenhouseLayout layout = LayoutParser.parse("""
                {"schema":1,"label":"Empty","size":[3,3],"cells":[]}""");
        assertEquals(0, layout.cellCount());
    }

    @Test
    @DisplayName("garbage input is rejected, not half-parsed")
    void rejectsGarbage() {
        assertTrue(reject("not json at all").getMessage().contains("not valid JSON"));
        assertTrue(reject("[1,2,3]").getMessage().contains("must be a JSON object"));
        assertTrue(reject("").getMessage().contains("empty"));
        assertThrows(LayoutFormatException.class, () -> LayoutParser.parse((String) null));
    }

    @Test
    @DisplayName("unknown extra fields are ignored, staying forward compatible")
    void ignoresUnknownFields() {
        GreenhouseLayout layout = LayoutParser.parse("""
                {"schema":1,"label":"L","size":[2,2],"somethingNew":true,
                 "cells":[{"x":0,"y":0,"crop":"Wheat","futureField":9}]}""");
        assertEquals(1, layout.cellCount());
    }

    @Test
    @DisplayName("a parsed layout re-serialises into something that parses again")
    void roundTripsThroughJson() {
        GreenhouseLayout original = LayoutParser.parse(SPEC_EXAMPLE);
        GreenhouseLayout again = LayoutParser.parse(original.toJson());

        assertEquals(original.label(), again.label());
        assertEquals(original.width(), again.width());
        assertEquals(original.cells(), again.cells());
    }
}
