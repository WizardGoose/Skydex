package com.skydex.garden;

import java.util.List;
import java.util.Locale;
import java.util.OptionalLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads the growth countdown out of the Crop Diagnostics screen.
 *
 * <p><b>SHIPPED DISABLED. THE FORMAT BELOW IS A HYPOTHESIS, NOT A FIXTURE.</b>
 *
 * <p>This project has a standing rule, adopted after catching itself doing the
 * opposite: a parser's fixtures must be verbatim-captured game output, never
 * reconstructed from another mod's regex. The Crop Diagnostics screen is
 * described in the research as a container GUI whose lore carries a line like
 * {@code "Next Stage: 1h 40m 20s"}, and that description came from reading a
 * third-party mod, not from opening the screen. A third-party mod's source is a
 * hint about where to look. It is not evidence of what Hypixel actually renders,
 * and a parser tuned to a guessed format will happily produce confident,
 * wrong timestamps.
 *
 * <p>So the code is here, tested against strings that are openly labelled as
 * format hypotheses, and {@link #FIXTURE_PENDING} keeps every caller from
 * writing a single {@code nextStageAt} into the snapshot. What the mod does
 * instead, while pending, is <b>capture the fixture</b>: when the player opens a
 * Crop Diagnostics screen, {@code ContainerCapture} logs its title and lore
 * verbatim to the client log and records nothing. One playtest therefore
 * produces exactly the material needed to either confirm this format or replace
 * it, after which flipping the flag is a deliberate, evidence-backed edit.
 *
 * <p>Failing shut matters more than usual here. A wrong countdown does not look
 * broken on the site; it looks like a working clock that is quietly lying about
 * when a crop is ready. Absent beats wrong.
 */
public final class CropDiagnosticsParser {

    /**
     * While true, no countdown reaches the snapshot.
     *
     * <p>Flip this only together with a verbatim captured screen committed as a
     * real fixture. {@code CropDiagnosticsParserTest} asserts it is still true,
     * so turning it on without revisiting the tests fails the build.
     */
    public static final boolean FIXTURE_PENDING = true;

    /** Container title this screen is expected to carry. Also a hypothesis. */
    public static final String SCREEN_TITLE = "Crop Diagnostics";

    /**
     * A "next stage" label followed by a duration. Written fresh from the
     * described shape rather than copied: the source mods are copyleft and this
     * mod is MIT, so nothing here is a transcription of their patterns.
     */
    private static final Pattern NEXT_STAGE =
            Pattern.compile("next\\s*stage\\s*:?\\s*(.+)", Pattern.CASE_INSENSITIVE);

    /** One duration term, e.g. {@code 40m}. Days through seconds. */
    private static final Pattern TERM =
            Pattern.compile("(\\d+)\\s*([dhms])", Pattern.CASE_INSENSITIVE);

    private CropDiagnosticsParser() {
    }

    /** True once a real fixture exists and the flag has been flipped. */
    public static boolean isEnabled() {
        return !FIXTURE_PENDING;
    }

    /** Whether a container title looks like the Crop Diagnostics screen. */
    public static boolean isDiagnosticsTitle(String strippedTitle) {
        if (strippedTitle == null) {
            return false;
        }
        return strippedTitle.trim().toLowerCase(Locale.ROOT).startsWith(
                SCREEN_TITLE.toLowerCase(Locale.ROOT));
    }

    /**
     * Find the countdown in a lore block.
     *
     * @return remaining time in milliseconds, or empty when no line carries one
     */
    public static OptionalLong parseNextStage(List<String> lore) {
        if (lore == null) {
            return OptionalLong.empty();
        }
        for (String line : lore) {
            OptionalLong parsed = parseNextStageLine(line);
            if (parsed.isPresent()) {
                return parsed;
            }
        }
        return OptionalLong.empty();
    }

    /** One lore line. Public so a future real fixture can be asserted line by line. */
    public static OptionalLong parseNextStageLine(String line) {
        if (line == null || line.isBlank()) {
            return OptionalLong.empty();
        }
        Matcher m = NEXT_STAGE.matcher(line.trim());
        if (!m.find()) {
            return OptionalLong.empty();
        }
        return parseDuration(m.group(1));
    }

    /**
     * A duration written as terms, e.g. {@code "1h 40m 20s"}.
     *
     * <p>Any subset in any order is accepted, because which terms appear depends
     * on how much time is left and that is not worth being brittle about.
     *
     * @return milliseconds, or empty when the text holds no usable term
     */
    public static OptionalLong parseDuration(String text) {
        if (text == null || text.isBlank()) {
            return OptionalLong.empty();
        }
        Matcher m = TERM.matcher(text);
        long total = 0L;
        boolean found = false;
        while (m.find()) {
            long value;
            try {
                value = Long.parseLong(m.group(1));
            } catch (NumberFormatException tooBig) {
                // A number that cannot be a duration is not one; ignore the term
                // rather than letting it throw out of a capture path.
                continue;
            }
            long unit = switch (Character.toLowerCase(m.group(2).charAt(0))) {
                case 'd' -> 86_400_000L;
                case 'h' -> 3_600_000L;
                case 'm' -> 60_000L;
                default -> 1_000L;
            };
            total += value * unit;
            found = true;
        }
        return found ? OptionalLong.of(total) : OptionalLong.empty();
    }

    /**
     * Turn a remaining duration into the absolute stamp the spec carries.
     *
     * <p>The spec's {@code nextStageAt} is an epoch, not a countdown, because a
     * countdown is only meaningful at the instant it was read and the site may
     * display the snapshot much later.
     */
    public static long toNextStageAt(long now, long remainingMs) {
        return now + remainingMs;
    }
}
