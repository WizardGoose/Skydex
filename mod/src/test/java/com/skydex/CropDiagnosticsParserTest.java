package com.skydex;

import com.skydex.capture.ScreenKind;
import com.skydex.capture.TitleParser;
import com.skydex.garden.CropDiagnosticsParser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.OptionalLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * <b>Read this before trusting anything below.</b>
 *
 * <p>Every duration string in this file is a <b>format hypothesis</b>, not a
 * captured fixture. They were written from a prose description of what another
 * mod's regex is said to look for, and nobody on this project has yet opened a
 * Crop Diagnostics screen and read what Hypixel actually renders. This project
 * has a standing rule, adopted after catching itself doing exactly this, that
 * parser fixtures must be verbatim-captured game output.
 *
 * <p>So these tests do not claim the parser is correct. They claim two narrower
 * things that are worth having anyway:
 * <ol>
 *   <li>the duration arithmetic and the failure behaviour are right <i>given</i>
 *       a format, so when the real format arrives only the pattern needs
 *       revisiting, not the maths;</li>
 *   <li>the feature is still switched off, so no guessed countdown can reach
 *       the website in the meantime.</li>
 * </ol>
 *
 * <p>When a real screen is captured, the strings here should be replaced by that
 * capture, verbatim, and the flag flipped in the same change.
 */
class CropDiagnosticsParserTest {

    @Test
    @DisplayName("the countdown feature is still disabled pending a real fixture")
    void shipsDisabled() {
        // This is a gate, not a description. Flipping FIXTURE_PENDING without a
        // verbatim captured screen to test against should fail the build here,
        // which is the whole point of the assertion.
        assertTrue(CropDiagnosticsParser.FIXTURE_PENDING,
                "FIXTURE_PENDING was turned off. Do that only together with a real "
                        + "captured Crop Diagnostics screen committed as a fixture, and "
                        + "replace this test with assertions against that capture.");
        assertFalse(CropDiagnosticsParser.isEnabled());
    }

    @Test
    @DisplayName("the screen is classified so the capture path can dump a fixture")
    void screenIsClassified() {
        // Classification is safe to have while parsing is off: it is what routes
        // the screen to the log dump that produces the fixture in the first place.
        assertEquals(ScreenKind.CROP_DIAGNOSTICS, TitleParser.classify("Crop Diagnostics"));
        assertEquals(ScreenKind.CROP_DIAGNOSTICS, TitleParser.classify("crop diagnostics"));
        assertTrue(CropDiagnosticsParser.isDiagnosticsTitle("Crop Diagnostics"));
        assertFalse(CropDiagnosticsParser.isDiagnosticsTitle("Chest"));
        assertFalse(CropDiagnosticsParser.isDiagnosticsTitle(null));

        // And it must not have eaten any screen the mod already handles.
        assertEquals(ScreenKind.SACK, TitleParser.classify("Farming Sack"));
        assertEquals(ScreenKind.ENDER_CHEST, TitleParser.classify("Ender Chest (3/9)"));
        assertEquals(ScreenKind.STORAGE, TitleParser.classify("Storage (1/9)"));
        assertEquals(ScreenKind.OTHER, TitleParser.classify("Chest"));
    }

    @Test
    @DisplayName("HYPOTHESIS: full h/m/s duration sums correctly")
    void durationArithmetic() {
        assertEquals(OptionalLong.of(3_600_000L + 40 * 60_000L + 20_000L),
                CropDiagnosticsParser.parseDuration("1h 40m 20s"));
        assertEquals(OptionalLong.of(20_000L), CropDiagnosticsParser.parseDuration("20s"));
        assertEquals(OptionalLong.of(2 * 60_000L + 5_000L),
                CropDiagnosticsParser.parseDuration("2m 5s"));
        assertEquals(OptionalLong.of(86_400_000L), CropDiagnosticsParser.parseDuration("1d"));
    }

    @Test
    @DisplayName("HYPOTHESIS: a lore line with the label yields the duration")
    void parsesLoreLine() {
        assertEquals(OptionalLong.of(3_600_000L + 40 * 60_000L + 20_000L),
                CropDiagnosticsParser.parseNextStageLine("Next Stage: 1h 40m 20s"));
        assertEquals(OptionalLong.of(90_000L),
                CropDiagnosticsParser.parseNextStage(
                        List.of("Status: Growing", "Next Stage: 1m 30s", "Drops: something")));
    }

    @Test
    @DisplayName("no label, no reading: absent beats a confident wrong number")
    void failsShut() {
        assertEquals(OptionalLong.empty(), CropDiagnosticsParser.parseNextStage(List.of()));
        assertEquals(OptionalLong.empty(), CropDiagnosticsParser.parseNextStage(null));
        assertEquals(OptionalLong.empty(),
                CropDiagnosticsParser.parseNextStage(List.of("Status: Harvestable")));
        // A label with nothing parseable after it must not become zero, which
        // would render as "ready now" on the site.
        assertEquals(OptionalLong.empty(), CropDiagnosticsParser.parseNextStageLine("Next Stage: soon"));
        assertEquals(OptionalLong.empty(), CropDiagnosticsParser.parseDuration(""));
        assertEquals(OptionalLong.empty(), CropDiagnosticsParser.parseDuration(null));
    }

    @Test
    @DisplayName("a countdown becomes an absolute stamp, because snapshots are read later")
    void countdownBecomesEpoch() {
        assertEquals(1_000_100L, CropDiagnosticsParser.toNextStageAt(1_000_000L, 100L));
    }
}
