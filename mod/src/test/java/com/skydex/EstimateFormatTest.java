package com.skydex;

import com.skydex.layout.CellStatus;
import com.skydex.layout.EstimateFormat;
import com.skydex.layout.LayoutCell;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The one number in this mod the player is invited to plan an afternoon around.
 *
 * <p>Two rules, and they fail in opposite directions, so both are pinned here.
 * The wording has to stay hedged: the tilde is what separates an estimate the
 * site computed from a clock the mod is keeping, and the mod is not keeping one.
 * And the rule about when to show anything at all has to stay strict, because a
 * time on a cell that is already grown is worse than no time at all - it is the
 * one output that would send someone away from a plot that was ready.
 */
class EstimateFormatTest {

    private static LayoutCell priced(int seconds) {
        return LayoutCell.crop(0, 0, "Cocoa Beans", null, seconds);
    }

    private static final LayoutCell UNPRICED = LayoutCell.crop(0, 0, "Cocoa Beans", null);

    @Test
    @DisplayName("minutes under an hour")
    void formatsMinutes() {
        assertEquals("~45m", EstimateFormat.format(45 * 60));
        assertEquals("~1m", EstimateFormat.format(60));
        assertEquals("~59m", EstimateFormat.format(59 * 60 + 59), "seconds are dropped, not rounded up");
    }

    @Test
    @DisplayName("hours and minutes up to a day")
    void formatsHours() {
        assertEquals("~2h 15m", EstimateFormat.format(2 * 3600 + 15 * 60));
        assertEquals("~2h", EstimateFormat.format(2 * 3600), "a whole hour drops the empty minutes");
        assertEquals("~23h 59m", EstimateFormat.format(24 * 3600 - 1));
    }

    @Test
    @DisplayName("days and hours beyond a day")
    void formatsDays() {
        assertEquals("~1d 3h", EstimateFormat.format(24 * 3600 + 3 * 3600));
        assertEquals("~1d", EstimateFormat.format(24 * 3600), "a whole day drops the empty hours");
        assertEquals("~3d 4h", EstimateFormat.format(3 * 86400 + 4 * 3600 + 59 * 60));
    }

    @Test
    @DisplayName("the unit rolls over exactly at 60m and at 24h")
    void pinsTheBoundaries() {
        // One second either side of each boundary, so a change to the rollover
        // cannot pass by moving only the value on the boundary itself.
        assertEquals("~59m", EstimateFormat.format(3599));
        assertEquals("~1h", EstimateFormat.format(3600));
        assertEquals("~1h", EstimateFormat.format(3601));

        assertEquals("~23h 59m", EstimateFormat.format(86399));
        assertEquals("~1d", EstimateFormat.format(86400));
        assertEquals("~1d", EstimateFormat.format(86401));
    }

    @Test
    @DisplayName("never states a longer wait than it was given")
    void neverRoundsUp() {
        // Under a minute is reported as under a minute. Calling it "~1m" would
        // be the only place this function overstates, and overstating is what
        // makes someone walk away from a plot that was about to be ready.
        assertEquals("~<1m", EstimateFormat.format(59));
        assertEquals("~<1m", EstimateFormat.format(1));
    }

    @Test
    @DisplayName("survives a value the parser would never have let through")
    void isTotal() {
        // The parser refuses anything below 1, so these cannot arrive from a
        // push. Handled anyway: a formatter that threw would take down the
        // frame it was called from, and the overlay draws every frame.
        assertEquals("~<1m", EstimateFormat.format(0));
        assertEquals("~<1m", EstimateFormat.format(-1));
        assertEquals("~<1m", EstimateFormat.format(Integer.MIN_VALUE));
        assertTrue(EstimateFormat.format(Integer.MAX_VALUE).startsWith("~"));
    }

    @Test
    @DisplayName("always carries the tilde, because it is an estimate and not a clock")
    void alwaysHedges() {
        for (int seconds : new int[]{1, 59, 60, 3599, 3600, 86399, 86400, 1_000_000}) {
            assertTrue(EstimateFormat.format(seconds).startsWith("~"),
                    "no tilde on " + seconds + ": " + EstimateFormat.format(seconds));
        }
    }

    @Test
    @DisplayName("a cell that is already green never shows a time")
    void neverShowsOnDone() {
        // The whole reason the rule exists. A grown cell counting down to
        // something that has happened is the one output worth refusing.
        assertFalse(EstimateFormat.shows(true, CellStatus.DONE, priced(3600)));
    }

    @Test
    @DisplayName("a cell still owed shows its time, whether it is empty or holding something else")
    void showsOnPending() {
        assertTrue(EstimateFormat.shows(true, CellStatus.EMPTY, priced(3600)));
        // A mismatch is usually the base crop sitting there waiting to turn,
        // which is the wait the estimate is describing.
        assertTrue(EstimateFormat.shows(true, CellStatus.MISMATCH, priced(3600)));
    }

    @Test
    @DisplayName("a cell the sender could not price shows nothing")
    void showsNothingWithoutAnEstimate() {
        assertFalse(EstimateFormat.shows(true, CellStatus.EMPTY, UNPRICED));
        assertFalse(EstimateFormat.shows(true, CellStatus.MISMATCH, UNPRICED));
    }

    @Test
    @DisplayName("nothing is shown while the layout is not being compared against the world")
    void showsNothingWithoutTheProjection() {
        // With the projection off no cell is known to be pending, so every one
        // of them might already be grown. Silence is the only honest answer.
        for (CellStatus status : CellStatus.values()) {
            assertFalse(EstimateFormat.shows(false, status, priced(3600)), status.name());
        }
    }

    @Test
    @DisplayName("a missing cell or status is not a cell to show anything for")
    void failsShut() {
        assertFalse(EstimateFormat.shows(true, CellStatus.EMPTY, null));
        assertFalse(EstimateFormat.shows(true, null, priced(3600)));
    }
}
