package com.skydex;

import com.skydex.http.SkydexHttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Exercises the real socket. Port 0 lets the OS pick a free port so the test
 * never collides with a running game on the spec port.
 */
class SkydexHttpServerTest {

    private SkydexHttpServer server;
    private final AtomicReference<String> payload = new AtomicReference<>();
    private final AtomicLong version = new AtomicLong();
    private final List<InputStream> openStreams = new ArrayList<>();

    private String base() throws IOException {
        server = new SkydexHttpServer(0, "1.0.0+26.1.2", payload::get, version::get);
        server.start();
        return "http://127.0.0.1:" + server.port();
    }

    @AfterEach
    void tearDown() {
        for (InputStream in : openStreams) {
            try {
                in.close();
            } catch (IOException ignored) {
                // best effort
            }
        }
        if (server != null) {
            server.stop();
        }
    }

    private static HttpClient client() {
        return HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    }

    private static HttpResponse<String> get(String url) throws Exception {
        return client().send(HttpRequest.newBuilder(URI.create(url)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
    }

    // ------------------------------------------------------- json endpoints

    @Test
    @DisplayName("/v1/health returns the spec body with CORS")
    void health() throws Exception {
        HttpResponse<String> res = get(base() + "/v1/health");
        assertEquals(200, res.statusCode());
        assertEquals("{\"ok\":true,\"mod\":\"1.0.0+26.1.2\",\"schema\":1}", res.body());
        assertEquals("*", res.headers().firstValue("Access-Control-Allow-Origin").orElse(null));
    }

    @Test
    @DisplayName("/v1/island serves the latest snapshot verbatim")
    void island() throws Exception {
        String base = base();
        payload.set(Fixtures.snapshot().toMinifiedJson());

        HttpResponse<String> res = get(base + "/v1/island");
        assertEquals(200, res.statusCode());
        assertEquals(Fixtures.EXPECTED_JSON, res.body());
        assertEquals("*", res.headers().firstValue("Access-Control-Allow-Origin").orElse(null));
    }

    @Test
    @DisplayName("/v1/island reports 503 before anything has been captured")
    void islandBeforeCapture() throws Exception {
        assertEquals(503, get(base() + "/v1/island").statusCode());
    }

    @Test
    @DisplayName("spec constants: loopback bind and port 27916")
    void specConstants() {
        assertEquals(27916, SkydexHttpServer.DEFAULT_PORT);
        assertEquals("127.0.0.1", SkydexHttpServer.LOOPBACK);
    }

    @Test
    @DisplayName("start is idempotent and stop actually releases the port")
    void lifecycle() throws Exception {
        String base = base();
        server.start(); // no-op, must not throw
        assertEquals(200, get(base + "/v1/health").statusCode());

        server.stop();
        assertFalse(server.isRunning());
        server.stop(); // idempotent
    }

    // ------------------------------------------------------------------ sse

    /** Read one SSE frame, i.e. up to and including the terminating blank line. */
    private static String readFrame(InputStream in) throws IOException {
        StringBuilder sb = new StringBuilder();
        int b;
        while ((b = in.read()) != -1) {
            sb.append((char) b);
            int len = sb.length();
            if (len >= 2 && sb.charAt(len - 1) == '\n' && sb.charAt(len - 2) == '\n') {
                break;
            }
        }
        return sb.toString();
    }

    private InputStream openStream(String url) throws Exception {
        return openStream(url, null);
    }

    private InputStream openStream(String url, String origin) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(url)).GET();
        if (origin != null) {
            request.header("Origin", origin);
        }
        HttpResponse<InputStream> res = client().send(
                request.build(),
                HttpResponse.BodyHandlers.ofInputStream());
        assertEquals(200, res.statusCode());
        assertTrue(res.headers().firstValue("Content-Type").orElse("").startsWith("text/event-stream"),
                "content type was " + res.headers().firstValue("Content-Type"));
        assertEquals("*", res.headers().firstValue("Access-Control-Allow-Origin").orElse(null));
        InputStream in = res.body();
        openStreams.add(in);
        return in;
    }

    @Test
    @DisplayName("the newest browser origin becomes the human connection label")
    void connectionLabelFollowsBrowserOrigin() throws Exception {
        String base = base();
        assertTimeoutPreemptively(Duration.ofSeconds(15), () -> {
            readFrame(openStream(base + "/v1/events", "https://skydex.ca"));
            assertEquals("skydex.ca", server.connectionLabel());

            readFrame(openStream(base + "/v1/events", "http://localhost:5173"));
            assertEquals("local Skydex", server.connectionLabel());
        });
    }

    @Test
    @DisplayName("/v1/events sends the current snapshot immediately, exactly framed")
    void sseSendsSnapshotOnConnect() throws Exception {
        String base = base();
        payload.set(Fixtures.snapshot().toMinifiedJson());

        assertTimeoutPreemptively(Duration.ofSeconds(15), () -> {
            InputStream in = openStream(base + "/v1/events");
            assertEquals("event: island\ndata: " + Fixtures.EXPECTED_JSON + "\n\n", readFrame(in));
        });
    }

    @Test
    @DisplayName("/v1/events pushes again when the snapshot changes")
    void ssePushesOnChange() throws Exception {
        String base = base();
        payload.set(Fixtures.snapshot().toMinifiedJson());

        assertTimeoutPreemptively(Duration.ofSeconds(20), () -> {
            InputStream in = openStream(base + "/v1/events");
            readFrame(in); // initial

            String updated = "{\"schema\":1,\"exportedAt\":2,\"changed\":true}";
            payload.set(updated);
            version.incrementAndGet();

            assertEquals("event: island\ndata: " + updated + "\n\n", readFrame(in));
        });
    }

    @Test
    @DisplayName("a connect with nothing captured still opens the stream")
    void sseWithNoSnapshot() throws Exception {
        String base = base();
        assertTimeoutPreemptively(Duration.ofSeconds(15), () -> {
            InputStream in = openStream(base + "/v1/events");
            assertEquals(": heartbeat\n\n", readFrame(in));
        });
    }

    @Test
    @DisplayName("concurrent event streams are capped, oldest dropped first")
    void sseClientCap() throws Exception {
        String base = base();
        payload.set(Fixtures.snapshot().toMinifiedJson());

        assertTimeoutPreemptively(Duration.ofSeconds(30), () -> {
            for (int i = 0; i < SkydexHttpServer.MAX_SSE_CLIENTS + 2; i++) {
                InputStream in = openStream(base + "/v1/events");
                readFrame(in);
            }
            assertEquals(SkydexHttpServer.MAX_SSE_CLIENTS, server.sseClientCount());
        });
    }

    @Test
    @DisplayName("event streams do not starve the json endpoints")
    void sseDoesNotBlockPolling() throws Exception {
        String base = base();
        payload.set(Fixtures.snapshot().toMinifiedJson());

        assertTimeoutPreemptively(Duration.ofSeconds(30), () -> {
            // Fill every SSE slot; each holds a response stream open.
            for (int i = 0; i < SkydexHttpServer.MAX_SSE_CLIENTS; i++) {
                readFrame(openStream(base + "/v1/events"));
            }
            // The polling fallback must still answer.
            assertEquals(200, get(base + "/v1/health").statusCode());
            assertEquals(200, get(base + "/v1/island").statusCode());
        });
    }
}
