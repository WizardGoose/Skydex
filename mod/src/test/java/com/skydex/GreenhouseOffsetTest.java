package com.skydex;

import com.skydex.garden.GreenhouseOffset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The Carpenter-relative offset is the eventual primary placement route, and it
 * ships switched off because nobody has measured it yet.
 *
 * <p>Same discipline as the Crop Diagnostics parser: the machinery is complete
 * and inert, and it gets switched on by evidence rather than by confidence. The
 * previous attempt at placing the bed by arithmetic used numbers borrowed from
 * another mod, and they were wrong on the owner's island in a way the arithmetic
 * could not detect. This time the constant comes from a real measurement of a
 * real greenhouse.
 */
class GreenhouseOffsetTest {

    @Test
    @DisplayName("the offset is still unmeasured, so nothing is placed from it")
    void shipsUnknown() {
        // A gate, not a description. Turning KNOWN on without filling in real
        // measured values fails here, which is the point.
        assertFalse(GreenhouseOffset.KNOWN,
                "GreenhouseOffset.KNOWN was turned on. Do that only with DX/DY/DZ taken from a "
                        + "reported real detection, and update this test to assert those values.");
        assertFalse(GreenhouseOffset.isKnown());
        assertEquals(0, GreenhouseOffset.DX);
        assertEquals(0, GreenhouseOffset.DY);
        assertEquals(0, GreenhouseOffset.DZ);
    }

    @Test
    @DisplayName("an unknown offset never claims to agree with anything")
    void unknownAgreesWithNothing() {
        // Guards the branch order in the scanner: while unknown, agreement must
        // be false so the found bed is always what gets used.
        assertFalse(GreenhouseOffset.agreesWith(10, 70, 20, 10, 70, 20));
        assertFalse(GreenhouseOffset.agreesWith(10, 70, 20, 99, 99, 99));
    }

    @Test
    @DisplayName("the measured delta is reported as a relayable line")
    void describesTheMeasurement() {
        // Carpenter at (100, 70, 200), bed corner at (97, 68, 203).
        String measured = GreenhouseOffset.describeMeasured(100, 70, 200, 97, 68, 203, 10, 10);
        assertTrue(measured.contains("dx=-3"), measured);
        assertTrue(measured.contains("dy=-2"), measured);
        assertTrue(measured.contains("dz=3"), measured);
        assertTrue(measured.contains("10x10"), measured);
    }

    @Test
    @DisplayName("applying the offset is the exact inverse of measuring it")
    void applyInvertsMeasure() {
        // Once KNOWN flips, these are what place the bed, so the arithmetic has
        // to round-trip exactly.
        int cx = 100;
        int cy = 70;
        int cz = 200;
        assertEquals(cx + GreenhouseOffset.DX, GreenhouseOffset.originX(cx));
        assertEquals(cy + GreenhouseOffset.DY, GreenhouseOffset.bedY(cy));
        assertEquals(cz + GreenhouseOffset.DZ, GreenhouseOffset.originZ(cz));

        // Negative coordinates behave, which is where the old grid arithmetic
        // was most fragile.
        assertEquals(-50 + GreenhouseOffset.DX, GreenhouseOffset.originX(-50));
        assertEquals(-5 + GreenhouseOffset.DZ, GreenhouseOffset.originZ(-5));
    }

    @Test
    @DisplayName("the bed size that comes with the offset is a sane default")
    void defaultSize() {
        assertEquals(10, GreenhouseOffset.WIDTH);
        assertEquals(10, GreenhouseOffset.HEIGHT);
    }
}
