package com.skydex;

import com.skydex.export.ExportCodec;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Transport 2: {@code SKYDEX-} + base64url(gzip(minified JSON)).
 *
 * <p>The governing rule, shared with the site's {@code src/island/code.ts}, is
 * emit one and read many. These tests hold both halves of it: exactly one prefix
 * leaves {@code encode}, and every prefix the format has worn is accepted by
 * {@code decode}.
 */
class ExportCodecTest {

    /** A legacy code carrying the same payload, built by relabelling a fresh one. */
    private static String relabelled(String code, String legacyPrefix) {
        return legacyPrefix + code.substring(ExportCodec.PREFIX.length());
    }

    @Test
    @DisplayName("round-trips the fixture snapshot unchanged")
    void roundTripsFixture() {
        String json = Fixtures.snapshot().toMinifiedJson();
        String code = ExportCodec.encode(json);

        assertTrue(code.startsWith("SKYDEX-"), code.substring(0, Math.min(16, code.length())));
        assertEquals(json, ExportCodec.decode(code));
    }

    @Test
    @DisplayName("payload is base64url alphabet only (no + / =)")
    void payloadIsUrlSafe() {
        String code = ExportCodec.encode(Fixtures.snapshot().toMinifiedJson());
        String payload = code.substring(ExportCodec.PREFIX.length());
        assertTrue(payload.matches("[A-Za-z0-9_-]+"),
                "must be url-safe and unpadded for the website to decode: " + payload);
    }

    @Test
    @DisplayName("decoder also accepts padded base64url")
    void acceptsPaddedInput() {
        String json = Fixtures.snapshot().toMinifiedJson();
        byte[] gz = ExportCodec.gzip(json.getBytes(StandardCharsets.UTF_8));
        String padded = ExportCodec.PREFIX + Base64.getUrlEncoder().encodeToString(gz);
        assertEquals(json, ExportCodec.decode(padded));
    }

    @Test
    @DisplayName("decoder tolerates whitespace from a clipboard paste")
    void toleratesWhitespace() {
        String json = Fixtures.snapshot().toMinifiedJson();
        String code = ExportCodec.encode(json);
        String mangled = "  " + code.substring(0, 20) + "\n" + code.substring(20) + "\r\n";
        assertEquals(json, ExportCodec.decode(mangled));
    }

    @Test
    @DisplayName("the emitted prefix is exactly SKYDEX-, versionless")
    void prefixIsPinned() {
        assertEquals("SKYDEX-", ExportCodec.PREFIX);
        assertTrue(ExportCodec.encode("{}").startsWith("SKYDEX-"));

        // No version digit in the prefix. The schema number lives in the payload,
        // which is what the site's validateSnapshot reads.
        assertFalse(ExportCodec.PREFIX.matches(".*\\d.*"), ExportCodec.PREFIX);
    }

    @Test
    @DisplayName("the pre-Skydex family name is held at its old spelling on purpose")
    void familyNameIsHeld() {
        // Existing clipboard codes stay readable; this prefix is never emitted.
        assertEquals("SKYINDEX", ExportCodec.LEGACY_FAMILY);
    }

    @Test
    @DisplayName("emit one: no legacy prefix is ever produced")
    void emitsOnlyTheCurrentPrefix() {
        String code = ExportCodec.encode(Fixtures.snapshot().toMinifiedJson());
        assertFalse(code.startsWith("SKYINDEX1."), code.substring(0, Math.min(16, code.length())));
        assertFalse(code.startsWith("SKYDEX1."), code.substring(0, Math.min(16, code.length())));
    }

    @Test
    @DisplayName("read many: codes under both retired prefixes still decode")
    void readsLegacyPrefixes() {
        String json = Fixtures.snapshot().toMinifiedJson();
        String code = ExportCodec.encode(json);

        // The wire format is identical across all three labels, so relabelling a
        // fresh code produces exactly what an older mod build would have emitted.
        assertEquals(json, ExportCodec.decode(relabelled(code, "SKYINDEX1.")),
                "codes from every install predating the rename must still read");
        assertEquals(json, ExportCodec.decode(relabelled(code, "SKYDEX1.")),
                "codes from the short-lived dot form must still read");
    }

    @Test
    @DisplayName("legacy codes are sliced by their own length, not the current one")
    void slicesByTheMatchedPrefix() {
        // The failure this guards is silent: SKYINDEX1. is three characters
        // longer than SKYDEX-, so slicing by the wrong constant would leave
        // stray prefix characters at the front of the payload and report a
        // perfectly good paste as damaged.
        String json = "{\"schema\":1}";
        String legacy = relabelled(ExportCodec.encode(json), "SKYINDEX1.");
        assertEquals(10, "SKYINDEX1.".length());
        assertEquals(7, ExportCodec.PREFIX.length());
        assertEquals(json, ExportCodec.decode(legacy));
    }

    @Test
    @DisplayName("a future wire format is rejected as ours-but-different, not as garbage")
    void rejectsFutureVersion() {
        String payload = ExportCodec.encode("{}").substring(ExportCodec.PREFIX.length());

        // The dash form a future incompatible wire format would take.
        IllegalArgumentException next = assertThrows(IllegalArgumentException.class,
                () -> ExportCodec.decode("SKYDEX2-" + payload));
        assertTrue(next.getMessage().contains("different version"), next.getMessage());
        assertTrue(next.getMessage().contains("SKYDEX2-"), next.getMessage());
        assertTrue(next.getMessage().contains("SKYDEX-"), next.getMessage());

        // And the same courtesy under the older family name, so a v2 code from
        // the dormant proposal is met with a version message rather than a shrug.
        IllegalArgumentException old = assertThrows(IllegalArgumentException.class,
                () -> ExportCodec.decode("SKYINDEX2." + payload));
        assertTrue(old.getMessage().contains("different version"), old.getMessage());
        assertTrue(old.getMessage().contains("SKYINDEX2."), old.getMessage());
    }

    @Test
    @DisplayName("a family name with no separator still names a version rather than throwing")
    void versionSliceIsClamped() {
        // The version slice runs past the end of a bare family name, so it is
        // clamped. Getting this wrong throws StringIndexOutOfBounds from inside
        // the error path, which would replace a readable refusal with a crash.
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> ExportCodec.decode("SKYDEX"));
        assertTrue(e.getMessage().contains("SKYDEX"), e.getMessage());
    }

    @Test
    @DisplayName("the retired WZSKY prefix is just a foreign code")
    void rejectsRetiredPrefix() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> ExportCodec.decode("WZSKY1.abc"));
        assertTrue(e.getMessage().contains("not a Skydex code"), e.getMessage());
    }

    @Test
    @DisplayName("garbage and prefix-only input throw rather than return junk")
    void rejectsGarbage() {
        assertThrows(IllegalArgumentException.class, () -> ExportCodec.decode("hello world"));
        assertThrows(IllegalArgumentException.class, () -> ExportCodec.decode("SKYDEX-not-gzip-data"));
        assertThrows(IllegalArgumentException.class, () -> ExportCodec.decode(null));
        assertThrows(IllegalArgumentException.class, () -> ExportCodec.decode(""));

        // A prefix with nothing after it is its own failure, not a base64 one.
        IllegalArgumentException empty = assertThrows(IllegalArgumentException.class,
                () -> ExportCodec.decode(ExportCodec.PREFIX));
        assertTrue(empty.getMessage().contains("no data after it"), empty.getMessage());
    }

    @Test
    @DisplayName("the payload carries the schema number the site validates")
    void payloadCarriesSchema() {
        // The prefix is versionless, so this field is the only thing announcing
        // the format. The site's validateSnapshot refuses a snapshot without it
        // and refuses any value other than 1, which makes this the load-bearing
        // half of the rename.
        String code = ExportCodec.encode(Fixtures.snapshot().toMinifiedJson());
        String json = ExportCodec.decode(code);

        assertTrue(code.startsWith("SKYDEX-"), code.substring(0, Math.min(16, code.length())));
        assertTrue(json.contains("\"schema\":1"),
                "the site gates on schema == 1: " + json.substring(0, Math.min(60, json.length())));
    }

    @Test
    @DisplayName("gzip actually shrinks a realistic repetitive payload")
    void compressionHelps() {
        StringBuilder sb = new StringBuilder("{\"schema\":1,\"chests\":[");
        for (int i = 0; i < 200; i++) {
            sb.append("{\"pos\":[").append(i).append(",70,0],\"name\":\"Chest\",\"lastSeen\":1754092800000,")
                    .append("\"items\":[{\"id\":\"ENCHANTED_COBBLESTONE\",\"name\":\"Enchanted Cobblestone\",\"count\":64}]},");
        }
        sb.setLength(sb.length() - 1);
        sb.append("]}");
        String json = sb.toString();

        String code = ExportCodec.encode(json);
        assertEquals(json, ExportCodec.decode(code));
        assertTrue(code.length() < json.length() / 4,
                "expected strong compression, got " + code.length() + " from " + json.length());
    }

    @Test
    @DisplayName("unicode item names survive the round trip")
    void handlesUnicode() {
        String json = "{\"schema\":1,\"items\":[{\"name\":\"§6Ultimate ✦ Wither ⚔\"}]}";
        assertEquals(json, ExportCodec.decode(ExportCodec.encode(json)));
    }
}
