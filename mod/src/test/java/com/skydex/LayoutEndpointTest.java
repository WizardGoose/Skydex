package com.skydex;

import com.skydex.http.SkydexHttpServer;
import com.skydex.layout.GreenhouseLayout;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Transport 3 over a real socket. This is the only endpoint that accepts data
 * from outside the mod, so both halves matter: valid pushes land, and invalid
 * ones are refused with an explanation rather than half-applied.
 */
class LayoutEndpointTest {

    private SkydexHttpServer server;
    private final AtomicReference<GreenhouseLayout> received = new AtomicReference<>();

    private String base() throws IOException {
        server = new SkydexHttpServer(0, "test", () -> null, new AtomicLong()::get);
        server.setLayoutSink(received::set);
        server.start();
        return "http://127.0.0.1:" + server.port();
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop();
        }
    }

    private static HttpClient client() {
        return HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    }

    private static HttpResponse<String> post(String url, String body) throws Exception {
        return client().send(HttpRequest.newBuilder(URI.create(url))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body)).build(),
                HttpResponse.BodyHandlers.ofString());
    }

    @Test
    @DisplayName("a valid push is accepted and handed to the mod")
    void acceptsValidLayout() throws Exception {
        HttpResponse<String> res = post(base() + "/v1/layout", LayoutParserTest.SPEC_EXAMPLE);

        assertEquals(200, res.statusCode(), res.body());
        assertTrue(res.body().contains("\"ok\":true"), res.body());
        assertTrue(res.body().contains("Choconut x72"), res.body());

        GreenhouseLayout layout = received.get();
        assertNotNull(layout, "the sink should have received the layout");
        assertEquals("Choconut x72", layout.label());
        assertEquals(2, layout.cellCount());
    }

    @Test
    @DisplayName("a new push replaces the previous layout")
    void replacesPreviousLayout() throws Exception {
        String base = base();
        post(base + "/v1/layout", LayoutParserTest.SPEC_EXAMPLE);
        assertEquals(200, post(base + "/v1/layout", """
                {"schema":1,"label":"Second","size":[2,2],"cells":[{"x":1,"y":1,"crop":"Wheat"}]}""")
                .statusCode());

        assertEquals("Second", received.get().label());
    }

    @Test
    @DisplayName("malformed bodies are rejected with a reason, and nothing is stored")
    void rejectsMalformed() throws Exception {
        String base = base();

        HttpResponse<String> both = post(base + "/v1/layout", """
                {"schema":1,"label":"L","size":[2,2],
                 "cells":[{"x":0,"y":0,"crop":"Wheat","mutation":"Choconut"}]}""");
        assertEquals(400, both.statusCode());
        assertTrue(both.body().contains("exactly one"), both.body());

        assertEquals(400, post(base + "/v1/layout", "not json").statusCode());
        assertEquals(400, post(base + "/v1/layout", "{}").statusCode());
        assertEquals(400, post(base + "/v1/layout", """
                {"schema":1,"label":"L","size":[2,2],"cells":[{"x":5,"y":0,"crop":"Wheat"}]}""")
                .statusCode());

        assertNull(received.get(), "a rejected push must not be stored");
    }

    @Test
    @DisplayName("a 400 carries {\"reason\": ...} exactly as the site expects")
    void errorBodyUsesReasonKey() throws Exception {
        HttpResponse<String> res = post(base() + "/v1/layout", """
                {"schema":9,"label":"L","size":[1,1],"cells":[]}""");
        assertEquals(400, res.statusCode());
        assertTrue(res.body().startsWith("{\"reason\":\""), res.body());
        assertTrue(res.body().contains("unsupported schema 9"), res.body());
    }

    @Test
    @DisplayName("OPTIONS preflight is answered and advertises POST")
    void answersPreflight() throws Exception {
        HttpResponse<String> res = client().send(
                HttpRequest.newBuilder(URI.create(base() + "/v1/layout"))
                        .method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build(),
                HttpResponse.BodyHandlers.ofString());

        assertEquals(204, res.statusCode());
        assertEquals("*", res.headers().firstValue("Access-Control-Allow-Origin").orElse(null));
        assertTrue(res.headers().firstValue("Access-Control-Allow-Methods").orElse("").contains("POST"),
                "preflight must allow POST: " + res.headers().firstValue("Access-Control-Allow-Methods"));
    }

    @Test
    @DisplayName("GET on the layout endpoint is 405, not a silent success")
    void rejectsWrongMethod() throws Exception {
        HttpResponse<String> res = client().send(
                HttpRequest.newBuilder(URI.create(base() + "/v1/layout")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertEquals(405, res.statusCode());
    }

    @Test
    @DisplayName("an oversized body is refused rather than buffered")
    void rejectsOversizedBody() throws Exception {
        String huge = "{\"schema\":1,\"label\":\"" + "x".repeat(SkydexHttpServer.MAX_LAYOUT_BODY_BYTES)
                + "\",\"size\":[1,1],\"cells\":[]}";
        assertEquals(413, post(base() + "/v1/layout", huge).statusCode());
        assertNull(received.get());
    }

    @Test
    @DisplayName("with no sink wired the endpoint reports unavailable, not success")
    void reportsUnavailableWithoutSink() throws Exception {
        server = new SkydexHttpServer(0, "test", () -> null, new AtomicLong()::get);
        server.start();
        assertEquals(503, post("http://127.0.0.1:" + server.port() + "/v1/layout",
                LayoutParserTest.SPEC_EXAMPLE).statusCode());
    }
}
