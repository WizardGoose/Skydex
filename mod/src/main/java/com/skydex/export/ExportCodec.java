package com.skydex.export;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.zip.Deflater;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

/**
 * Transport 2 of the spec: {@code SKYDEX-} + base64url(gzip(minified JSON)).
 *
 * <p>This is the half of a contract whose other half is the site's
 * {@code src/island/code.ts}. The rule on both sides is <b>emit one, read
 * many</b>: exactly one prefix goes out, every prefix the format has ever worn
 * comes in.
 *
 * <p><b>Why the separator is a dash, and where the version went.</b> The dash
 * is the brand form of the prefix, chosen with the hazard in full view:
 * base64url's alphabet is {@code A-Z a-z 0-9 - _}, so a dash is also a PAYLOAD
 * character, and a "split at the first dash" parser would be leaning on the
 * accident that the fixed prefix contains none. Neither side splits. Both match
 * the literal prefix and slice by the length of whatever matched, so the dash in
 * the separator seat and the dashes inside the payload never meet.
 *
 * <p>The version digit went with the dot. The retired prefixes carried it
 * ({@code SKYINDEX1.}, {@code SKYDEX1.}, both still read below); the emitted
 * prefix is versionless because the JSON inside carries {@code schema}, which is
 * where a format change actually announces itself and what the site's
 * {@code validateSnapshot} gates on. A schema bump keeps this prefix. Only an
 * incompatible WIRE format takes a new one, such as {@code SKYDEX2-}, and
 * {@link #decode} then calls it a version mismatch rather than a foreign string.
 *
 * <p>Padding: per the spec we <b>emit unpadded</b> base64url, but {@link #decode}
 * accepts padded and whitespace-mangled input, because codes get pasted out of
 * Discord and chat clients.
 */
public final class ExportCodec {

    /** The one prefix {@link #encode} emits. */
    public static final String PREFIX = "SKYDEX-";

    /**
     * The pre-Skydex family name.
     *
     * Used only to recognize codes copied before the rename.
     */
    public static final String LEGACY_FAMILY = "SKYINDEX";

    /**
     * Prefixes {@link #decode} accepts, newest first.
     *
     * <p>{@code SKYDEX1.} is a short-lived dot form emitted during the rename,
     * so codes carrying it are rare but real. {@code SKYINDEX1.} is the same
     * format under the pre-Skydex name, and every install of this mod predating
     * the rename emits it. The wire format is identical across all three; only
     * the label differs, so refusing either would break codes in circulation to
     * buy nothing.
     */
    private static final String[] READ_PREFIXES = {PREFIX, "SKYDEX1.", LEGACY_FAMILY + "1."};

    /**
     * Family names, used only to tell "wrong version" from "not one of ours".
     *
     * <p>Both names appear for the reason {@link #READ_PREFIXES} carries both: a
     * {@code SKYINDEX2.} code deserves "wrong version" rather than "this is not
     * ours". Nothing ever shipped under the older {@code WZSKY} family, so it is
     * absent rather than deprecated, and a {@code WZSKY1.} code gets the generic
     * rejection instead of a version message implying we once spoke it.
     */
    private static final String[] FAMILIES = {"SKYDEX", LEGACY_FAMILY};

    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DECODER = Base64.getUrlDecoder();

    private ExportCodec() {
    }

    /** JSON text -> shareable code. */
    public static String encode(String minifiedJson) {
        return PREFIX + ENCODER.encodeToString(gzip(minifiedJson.getBytes(StandardCharsets.UTF_8)));
    }

    /**
     * Shareable code -> JSON text, reading every prefix the format has worn.
     * Throws {@link IllegalArgumentException} on a bad code.
     *
     * <p>No caller in the mod reaches this: the mod produces codes and the site
     * consumes them. It exists so the transport can be round-tripped in a test
     * rather than trusted on faith, and so the two halves of the contract can be
     * read side by side.
     */
    public static String decode(String code) {
        if (code == null) {
            throw new IllegalArgumentException("code is null");
        }
        // All whitespace, not only the ends. Codes get pasted out of chat clients
        // that hard-wrap them, and base64url never contains whitespace, so
        // removing it can only ever repair a paste.
        String clean = code.replaceAll("\\s", "");
        if (clean.isEmpty()) {
            throw new IllegalArgumentException("code is empty");
        }

        String matched = null;
        for (String candidate : READ_PREFIXES) {
            if (clean.startsWith(candidate)) {
                matched = candidate;
                break;
            }
        }
        if (matched == null) {
            throw new IllegalArgumentException(rejection(clean));
        }

        // matched.length(), never PREFIX.length(): a legacy prefix is longer, and
        // slicing by the wrong one would hand base64url three stray characters of
        // prefix and fail as a damaged code on a perfectly good paste.
        String payload = clean.substring(matched.length());
        if (payload.isEmpty()) {
            throw new IllegalArgumentException(
                    "code has a prefix but no data after it; it may have been cut short when copied");
        }
        // Tolerate padding from a producer that emits it.
        while (payload.endsWith("=")) {
            payload = payload.substring(0, payload.length() - 1);
        }
        return new String(gunzip(DECODER.decode(payload)), StandardCharsets.UTF_8);
    }

    /**
     * Why a code that matched no readable prefix was refused.
     *
     * <p>Family first, then version, because the useful distinction is "ours,
     * wrong version" against "not ours" and only the family name can tell them
     * apart once the version has left the prefix.
     */
    private static String rejection(String clean) {
        for (String family : FAMILIES) {
            if (!clean.startsWith(family)) {
                continue;
            }
            return "this is a Skydex code from a different version (" + version(clean, family)
                    + "); this mod reads " + PREFIX + " codes";
        }
        return "not a Skydex code (expected prefix " + PREFIX + ")";
    }

    /**
     * The family name plus everything up to and including its first separator: a
     * dot for the retired dot-era prefixes, a dash for anything in the current
     * style.
     *
     * <p>A code with neither is malformed rather than versioned, so it falls back
     * to a slice long enough to show the family and a little of what followed.
     * That slice is clamped, because the whole string may be shorter than it.
     */
    private static String version(String clean, String family) {
        String rest = clean.substring(family.length());
        for (int i = 0; i < rest.length(); i++) {
            char c = rest.charAt(i);
            if (c == '.' || c == '-') {
                return clean.substring(0, family.length() + i + 1);
            }
        }
        return clean.substring(0, Math.min(clean.length(), family.length() + 4));
    }

    public static byte[] gzip(byte[] raw) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(Math.max(64, raw.length / 4));
        try (GZIPOutputStream gz = new MaxCompressionGzip(out)) {
            gz.write(raw);
        } catch (IOException e) {
            throw new UncheckedIOException("gzip failed", e);
        }
        return out.toByteArray();
    }

    /**
     * {@link GZIPOutputStream} defaults to level 6. The code is built once and
     * pasted by hand, so spending a few extra milliseconds for a shorter string
     * is unambiguously the right trade.
     */
    private static final class MaxCompressionGzip extends GZIPOutputStream {
        MaxCompressionGzip(java.io.OutputStream out) throws IOException {
            super(out);
            this.def.setLevel(Deflater.BEST_COMPRESSION);
        }
    }

    public static byte[] gunzip(byte[] compressed) {
        try (GZIPInputStream gz = new GZIPInputStream(new java.io.ByteArrayInputStream(compressed))) {
            return gz.readAllBytes();
        } catch (IOException e) {
            throw new IllegalArgumentException("payload is not valid gzip data", e);
        }
    }
}
