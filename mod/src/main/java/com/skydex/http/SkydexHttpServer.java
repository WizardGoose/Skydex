package com.skydex.http;

import com.skydex.layout.GreenhouseLayout;
import com.skydex.layout.LayoutFormatException;
import com.skydex.layout.LayoutParser;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

/**
 * Transport 1 of the spec: a loopback-only HTTP server the website talks to.
 *
 * <ul>
 *   <li>{@code GET /v1/health} — liveness plus the mod version</li>
 *   <li>{@code GET /v1/island} — the latest snapshot (polling fallback)</li>
 *   <li>{@code GET /v1/events} — Server-Sent Events, the "instantly updated" path</li>
 * </ul>
 *
 * <p>Bound to 127.0.0.1 explicitly — never 0.0.0.0 — so nothing outside this
 * machine can reach it. It is read-only and serves only the player's own island
 * contents, which is why {@code Access-Control-Allow-Origin: *} is safe: any
 * origin that can reach the socket is already running on this machine.
 *
 * <p><b>SSE threading.</b> An SSE connection lives for minutes or hours, so the
 * handler must not keep its worker thread. It sends headers, writes the first
 * frame, registers the exchange and <i>returns without closing it</i> — the
 * response stream stays valid, and a single scheduler thread does all
 * subsequent writes. Holding the thread instead would deadlock the pool and
 * make /v1/island stop answering after a couple of browser tabs.
 *
 * <p>Deliberately JDK-only ({@code com.sun.net.httpserver}) so the mod ships
 * with zero third-party runtime dependencies.
 */
public final class SkydexHttpServer {

    public static final int DEFAULT_PORT = 27916;
    public static final String LOOPBACK = "127.0.0.1";

    /** Enough for a couple of tabs; beyond this the oldest stream is dropped. */
    public static final int MAX_SSE_CLIENTS = 4;
    /** Snapshot changes are coalesced to at most one push per second. */
    public static final long PUSH_INTERVAL_MS = 1_000L;
    /** Comment line keeps idle connections from being reaped. */
    public static final long HEARTBEAT_INTERVAL_MS = 25_000L;
    /** A greenhouse layout is a few KB; this is a generous ceiling. */
    public static final int MAX_LAYOUT_BODY_BYTES = 1024 * 1024;

    private final int port;
    private final String modVersion;
    private final Supplier<String> islandJson;
    private final LongSupplier snapshotVersion;

    private final Deque<SseClient> sseClients = new ArrayDeque<>();

    /** Set by the mod; null means layout pushes are not accepted yet. */
    private volatile Consumer<GreenhouseLayout> layoutSink;

    private HttpServer server;
    private ScheduledExecutorService scheduler;
    private long lastPushedVersion = Long.MIN_VALUE;

    /**
     * @param islandJson      supplies the latest snapshot as minified JSON, or
     *                        null when nothing is captured yet; called from
     *                        worker and scheduler threads, so must be safe
     * @param snapshotVersion a value that changes whenever the snapshot changes
     *                        (the store's last-update stamp). Polling this is
     *                        what triggers a push, which keeps the HTTP layer
     *                        decoupled from the capture layer.
     */
    public SkydexHttpServer(int port, String modVersion,
                              Supplier<String> islandJson, LongSupplier snapshotVersion) {
        this.port = port;
        this.modVersion = modVersion;
        this.islandJson = islandJson;
        this.snapshotVersion = snapshotVersion;
    }

    public synchronized boolean isRunning() {
        return server != null;
    }

    public synchronized int port() {
        return server != null ? server.getAddress().getPort() : port;
    }

    public int sseClientCount() {
        synchronized (sseClients) {
            return sseClients.size();
        }
    }

    /** The browser currently holding the newest live stream, or null. */
    public String connectionLabel() {
        synchronized (sseClients) {
            SseClient latest = sseClients.peekLast();
            return latest == null ? null : latest.label;
        }
    }

    // ------------------------------------------------------------ lifecycle

    public synchronized void start() throws IOException {
        if (server != null) {
            return;
        }
        HttpServer created = HttpServer.create(
                new InetSocketAddress(InetAddress.getByName(LOOPBACK), port), 0);
        created.createContext("/v1/health", this::handleHealth);
        created.createContext("/v1/island", this::handleIsland);
        created.createContext("/v1/events", this::handleEvents);
        created.createContext("/v1/layout", this::handleLayout);
        created.setExecutor(Executors.newFixedThreadPool(4, daemon("skydex-http")));
        created.start();
        this.server = created;

        this.scheduler = Executors.newSingleThreadScheduledExecutor(daemon("skydex-sse"));
        scheduler.scheduleWithFixedDelay(this::pushIfChanged,
                PUSH_INTERVAL_MS, PUSH_INTERVAL_MS, TimeUnit.MILLISECONDS);
        scheduler.scheduleWithFixedDelay(this::heartbeat,
                HEARTBEAT_INTERVAL_MS, HEARTBEAT_INTERVAL_MS, TimeUnit.MILLISECONDS);
    }

    public synchronized void stop() {
        if (scheduler != null) {
            scheduler.shutdownNow();
            scheduler = null;
        }
        closeAllSse();
        if (server != null) {
            server.stop(0);
            server = null;
        }
    }

    private static java.util.concurrent.ThreadFactory daemon(String name) {
        return r -> {
            Thread t = new Thread(r, name);
            t.setDaemon(true);
            return t;
        };
    }

    // -------------------------------------------------------- json handlers

    private void handleHealth(HttpExchange exchange) throws IOException {
        if (handledPreflightOrBadMethod(exchange)) {
            return;
        }
        respond(exchange, 200, "{\"ok\":true,\"mod\":\"" + escape(modVersion) + "\",\"schema\":1}");
    }

    private void handleIsland(HttpExchange exchange) throws IOException {
        if (handledPreflightOrBadMethod(exchange)) {
            return;
        }
        String body;
        try {
            body = islandJson.get();
        } catch (RuntimeException e) {
            respond(exchange, 500, "{\"ok\":false,\"error\":\"snapshot unavailable\"}");
            return;
        }
        if (body == null) {
            respond(exchange, 503, "{\"ok\":false,\"error\":\"no snapshot captured yet\"}");
            return;
        }
        respond(exchange, 200, body);
    }

    // ------------------------------------------------------ layout handler

    /** Where a validated pushed layout goes. Null until the mod wires it up. */
    public void setLayoutSink(Consumer<GreenhouseLayout> sink) {
        this.layoutSink = sink;
    }

    /**
     * Transport 3: the site pushes a greenhouse layout for the mod to draw.
     *
     * <p>The only endpoint that accepts outside data, so it validates strictly
     * and explains every rejection — a half-valid layout would render a wrong
     * ghost that the player then builds against.
     */
    private void handleLayout(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod();
        if ("OPTIONS".equalsIgnoreCase(method)) {
            addCors(exchange);
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return;
        }
        if (!"POST".equalsIgnoreCase(method)) {
            respond(exchange, 405, error("layout accepts POST"));
            return;
        }

        String body;
        try (InputStream in = exchange.getRequestBody()) {
            byte[] bytes = in.readNBytes(MAX_LAYOUT_BODY_BYTES + 1);
            if (bytes.length > MAX_LAYOUT_BODY_BYTES) {
                respond(exchange, 413, error("layout body is too large"));
                return;
            }
            body = new String(bytes, StandardCharsets.UTF_8);
        }

        Consumer<GreenhouseLayout> sink = layoutSink;
        if (sink == null) {
            respond(exchange, 503, error("mod is not ready to accept layouts"));
            return;
        }

        GreenhouseLayout layout;
        try {
            layout = LayoutParser.parse(body);
        } catch (LayoutFormatException e) {
            respond(exchange, 400, error(e.getMessage()));
            return;
        }

        try {
            sink.accept(layout);
        } catch (RuntimeException e) {
            respond(exchange, 500, error("could not store the layout"));
            return;
        }
        respond(exchange, 200, "{\"ok\":true,\"label\":\"" + escape(layout.label())
                + "\",\"cells\":" + layout.cellCount() + "}");
    }

    /**
     * Spec pin: a refusal carries {@code {"reason": "<human sentence>"}}. The
     * site surfaces that sentence to the player verbatim, so it has to read as
     * an explanation rather than a parser trace.
     */
    private static String error(String reason) {
        return "{\"reason\":\"" + escape(reason == null ? "invalid layout" : reason) + "\"}";
    }

    // --------------------------------------------------------- sse handler

    private void handleEvents(HttpExchange exchange) throws IOException {
        if (handledPreflightOrBadMethod(exchange)) {
            return;
        }
        addCors(exchange);
        exchange.getResponseHeaders().add("Content-Type", "text/event-stream");
        exchange.getResponseHeaders().add("Cache-Control", "no-cache, no-store");
        exchange.getResponseHeaders().add("Connection", "keep-alive");
        // 0 = streaming body of unknown length.
        exchange.sendResponseHeaders(200, 0);

        OutputStream out = exchange.getResponseBody();
        SseClient client = new SseClient(exchange, out, connectionLabel(exchange));
        try {
            // Whatever we have right now, so a fresh tab is never blank.
            String json = islandJson.get();
            client.write(json == null ? SseFrames.heartbeat() : SseFrames.island(json));
        } catch (IOException e) {
            client.close();
            return;
        }
        register(client);
        // Deliberately no exchange.close(): the stream stays open for pushes.
    }

    private void register(SseClient client) {
        List<SseClient> evicted = new ArrayList<>();
        synchronized (sseClients) {
            while (sseClients.size() >= MAX_SSE_CLIENTS) {
                SseClient oldest = sseClients.pollFirst();
                if (oldest == null) {
                    break;
                }
                evicted.add(oldest);
            }
            sseClients.addLast(client);
        }
        evicted.forEach(SseClient::close);
    }

    /** Runs on the scheduler thread; one push per interval at most. */
    private void pushIfChanged() {
        try {
            long version = snapshotVersion.getAsLong();
            if (version == lastPushedVersion) {
                return;
            }
            lastPushedVersion = version;
            if (sseClientCount() == 0) {
                return;
            }
            String json = islandJson.get();
            if (json != null) {
                broadcast(SseFrames.island(json));
            }
        } catch (RuntimeException e) {
            // Never let a bad snapshot kill the scheduler.
        }
    }

    private void heartbeat() {
        if (sseClientCount() > 0) {
            broadcast(SseFrames.heartbeat());
        }
    }

    private void broadcast(String frame) {
        List<SseClient> snapshot;
        synchronized (sseClients) {
            snapshot = new ArrayList<>(sseClients);
        }
        List<SseClient> dead = new ArrayList<>();
        for (SseClient client : snapshot) {
            try {
                client.write(frame);
            } catch (IOException e) {
                dead.add(client);
            }
        }
        if (!dead.isEmpty()) {
            synchronized (sseClients) {
                sseClients.removeAll(dead);
            }
            dead.forEach(SseClient::close);
        }
    }

    private void closeAllSse() {
        List<SseClient> all;
        synchronized (sseClients) {
            all = new ArrayList<>(sseClients);
            sseClients.clear();
        }
        all.forEach(SseClient::close);
    }

    /** One open event stream. */
    private static final class SseClient {
        private final HttpExchange exchange;
        private final OutputStream out;
        private final String label;

        SseClient(HttpExchange exchange, OutputStream out, String label) {
            this.exchange = exchange;
            this.out = out;
            this.label = label;
        }

        void write(String frame) throws IOException {
            out.write(frame.getBytes(StandardCharsets.UTF_8));
            out.flush();
        }

        void close() {
            try {
                out.close();
            } catch (IOException ignored) {
                // already gone
            }
            exchange.close();
        }
    }

    /** Turns the browser Origin into the short status the in-game header uses. */
    static String connectionLabel(HttpExchange exchange) {
        String origin = exchange.getRequestHeaders().getFirst("Origin");
        if (origin == null || origin.isBlank()) {
            return "local browser";
        }
        try {
            String host = java.net.URI.create(origin).getHost();
            if (host == null) {
                return "browser";
            }
            String normal = host.toLowerCase(java.util.Locale.ROOT);
            if (normal.equals("skydex.ca") || normal.equals("www.skydex.ca")) {
                return "skydex.ca";
            }
            if (normal.equals("localhost") || normal.equals(LOOPBACK) || normal.equals("::1")) {
                return "local Skydex";
            }
        } catch (IllegalArgumentException ignored) {
            // A malformed Origin is still a browser connection, just not one
            // whose host is safe to repeat in the GUI.
        }
        return "browser";
    }

    // ---------------------------------------------------------------- utils

    /** @return true when the exchange is already finished and the caller should stop */
    private boolean handledPreflightOrBadMethod(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod();
        if ("OPTIONS".equalsIgnoreCase(method)) {
            addCors(exchange);
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return true;
        }
        if (!"GET".equalsIgnoreCase(method) && !"HEAD".equalsIgnoreCase(method)) {
            respond(exchange, 405, "{\"ok\":false,\"error\":\"method not allowed\"}");
            return true;
        }
        return false;
    }

    private void addCors(HttpExchange exchange) {
        exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "*");
    }

    private void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        addCors(exchange);
        exchange.getResponseHeaders().add("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().add("Cache-Control", "no-store");
        boolean head = "HEAD".equalsIgnoreCase(exchange.getRequestMethod());
        exchange.sendResponseHeaders(status, head ? -1 : bytes.length);
        if (!head) {
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(bytes);
            }
        }
        exchange.close();
    }

    private static String escape(String s) {
        if (s == null) {
            return "";
        }
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
