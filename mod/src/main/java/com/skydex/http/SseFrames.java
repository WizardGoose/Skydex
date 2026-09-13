package com.skydex.http;

/**
 * Server-Sent Events wire format.
 *
 * <p>Kept as pure string building so the exact bytes on the wire are testable
 * without opening a socket — SSE is whitespace-sensitive (a missing blank line
 * means the browser never dispatches the event), so "looks right" is not good
 * enough.
 */
public final class SseFrames {

    /** The only event name the spec defines. */
    public static final String EVENT_ISLAND = "island";

    private SseFrames() {
    }

    /**
     * One island message: {@code event: island\ndata: <json>\n\n}.
     *
     * <p>The payload is minified JSON and so contains no newlines. Any that do
     * sneak in are stripped rather than emitted, because a raw newline inside
     * {@code data:} would split the frame and corrupt the stream.
     */
    public static String island(String minifiedJson) {
        String data = minifiedJson == null ? "" : flatten(minifiedJson);
        return "event: " + EVENT_ISLAND + "\ndata: " + data + "\n\n";
    }

    /**
     * A comment line. Carries no event, but keeps proxies and the browser from
     * dropping an idle connection.
     */
    public static String heartbeat() {
        return ": heartbeat\n\n";
    }

    private static String flatten(String s) {
        if (s.indexOf('\n') < 0 && s.indexOf('\r') < 0) {
            return s;
        }
        return s.replace("\r", "").replace("\n", "");
    }
}
