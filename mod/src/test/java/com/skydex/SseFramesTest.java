package com.skydex;

import com.skydex.http.SseFrames;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * SSE is whitespace-sensitive: without the terminating blank line the browser
 * never dispatches the event, and a stray newline inside {@code data:} splits
 * the frame. So the bytes are asserted exactly.
 */
class SseFramesTest {

    @Test
    @DisplayName("island frame is exactly 'event: island\\ndata: {...}\\n\\n'")
    void islandFrameIsExact() {
        assertEquals("event: island\ndata: {\"a\":1}\n\n", SseFrames.island("{\"a\":1}"));
    }

    @Test
    @DisplayName("a real snapshot frames correctly")
    void framesRealSnapshot() {
        String json = Fixtures.snapshot().toMinifiedJson();
        String frame = SseFrames.island(json);

        assertEquals("event: island\ndata: " + Fixtures.EXPECTED_JSON + "\n\n", frame);
        assertTrue(frame.endsWith("\n\n"), "must end with a blank line");
        // Exactly one newline inside the payload region: the one after data.
        assertEquals(3, frame.chars().filter(c -> c == '\n').count());
    }

    @Test
    @DisplayName("event name matches the spec")
    void eventNamePinned() {
        assertEquals("island", SseFrames.EVENT_ISLAND);
    }

    @Test
    @DisplayName("newlines in the payload are stripped rather than corrupting the stream")
    void flattensNewlines() {
        assertEquals("event: island\ndata: {\"a\":1}\n\n",
                SseFrames.island("{\"a\":\n1}".replace("\n", "\n")));
        assertEquals("event: island\ndata: ab\n\n", SseFrames.island("a\r\nb"));
    }

    @Test
    @DisplayName("null payload does not produce a malformed frame")
    void handlesNull() {
        assertEquals("event: island\ndata: \n\n", SseFrames.island(null));
    }

    @Test
    @DisplayName("heartbeat is a comment line, so it dispatches no event")
    void heartbeatIsComment() {
        assertEquals(": heartbeat\n\n", SseFrames.heartbeat());
        assertTrue(SseFrames.heartbeat().startsWith(":"));
    }
}
