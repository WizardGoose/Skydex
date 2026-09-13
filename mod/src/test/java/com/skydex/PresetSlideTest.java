package com.skydex;

import com.skydex.gui.PresetSlide;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PresetSlideTest {

    @Test
    @DisplayName("the rail lands exactly at both ends in 220 milliseconds")
    void exactEndpoints() {
        assertEquals(0.0, PresetSlide.value(0.0, 1.0, 0L));
        assertEquals(1.0, PresetSlide.value(0.0, 1.0, PresetSlide.DURATION_MS));
        assertEquals(0.0, PresetSlide.value(1.0, 0.0, PresetSlide.DURATION_MS));
    }

    @Test
    @DisplayName("the accepted easing moves briskly without overshoot")
    void acceptedEasing() {
        double quarter = PresetSlide.ease(0.25);
        double half = PresetSlide.ease(0.5);
        assertTrue(quarter > 0.5, "the rail should get moving immediately");
        assertTrue(half > quarter && half < 1.0);
    }
}
