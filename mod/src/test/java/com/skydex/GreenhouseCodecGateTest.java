package com.skydex;

import com.skydex.data.GreenhouseBoard;
import com.skydex.data.GreenhouseCell;
import com.skydex.data.IslandSnapshot;
import com.skydex.export.BinaryCodec;
import com.skydex.export.CompactCodec;
import com.skydex.export.ExportCodec;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A tripwire over a gap that is harmless only because it is dormant.
 *
 * <p>The repo carries two finished but unwired v2 codecs, kept after the
 * measurement that decided emission stays v1. Neither knows about the
 * greenhouse section: they were written before it existed and enumerate the
 * sections they carry explicitly, so a greenhouse would be dropped in silence
 * rather than rejected. Nothing is broken today, because nothing calls them to
 * produce a code.
 *
 * <p>That is precisely the kind of gap that gets discovered by a user. So the
 * gate is asserted rather than trusted: flipping emission to v2 fails the first
 * test below, and the failure message names the section that would go missing.
 * The second test pins the gap itself, so that closing it forces a look back at
 * this gate rather than leaving a stale comment behind.
 */
class GreenhouseCodecGateTest {

    private static IslandSnapshot withGreenhouse() {
        return Fixtures.snapshot().greenhouse(new GreenhouseBoard(Fixtures.TS, 10, 10, List.of(
                GreenhouseCell.crop(0, 3, "PUMPKIN"),
                GreenhouseCell.mutation(1, 3, "CHOCONUT"))));
    }

    @Test
    @DisplayName("emission is still v1, which is the only codec that carries the greenhouse")
    void emissionIsStillV1() {
        String emitted = ExportCodec.encode(withGreenhouse().toMinifiedJson());

        // Asserted against what encode actually produces rather than against the
        // shape of the prefix constant. The v1 prefix carries no version digit to
        // compare, and the question this gate asks is not "what is it called" but
        // "which codec produced it".
        String moved = "Export emission moved off v1. Before shipping that: CompactCodec and "
                + "BinaryCodec both DROP the greenhouse section silently. Teach them "
                + "to carry it, then update this test.";
        assertTrue(emitted.startsWith(ExportCodec.PREFIX), moved + " Emitted: "
                + emitted.substring(0, Math.min(16, emitted.length())));
        assertFalse(emitted.startsWith(CompactCodec.PREFIX), moved);
        assertFalse(emitted.startsWith(BinaryCodec.PREFIX), moved);

        // And prove the live path really does carry it, rather than only
        // asserting the version number.
        IslandSnapshot back = IslandSnapshot.fromJson(
                ExportCodec.decode(ExportCodec.encode(withGreenhouse().toMinifiedJson())));
        assertNotNull(back.greenhouse(), "the wired v1 path must carry the greenhouse");
        assertEquals(2, back.greenhouse().cellCount());
        assertEquals("CHOCONUT", back.greenhouse().cells().get(1).mutation());
    }

    @Test
    @DisplayName("the dormant v2 codecs still drop the greenhouse, as the gate above assumes")
    void dormantCodecsStillDropIt() {
        IslandSnapshot viaCompact = CompactCodec.decode(CompactCodec.encode(withGreenhouse()));
        assertNull(viaCompact.greenhouse(),
                "CompactCodec now carries the greenhouse. Good, but the gate in "
                        + "emissionIsStillV1 was written assuming it did not: revisit both.");

        IslandSnapshot viaBinary = BinaryCodec.decodeCode(BinaryCodec.encodeCode(withGreenhouse()));
        assertNull(viaBinary.greenhouse(),
                "BinaryCodec now carries the greenhouse. Good, but the gate in "
                        + "emissionIsStillV1 was written assuming it did not: revisit both.");

        // The rest of the document still survives, so the gap really is confined
        // to the one section.
        assertNotNull(viaCompact.chests());
        assertEquals(1, viaCompact.chests().size());
    }
}
