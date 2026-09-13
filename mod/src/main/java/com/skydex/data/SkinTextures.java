package com.skydex.data;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pulls the texture hash out of a player-head profile.
 *
 * <p>A head's skin lives in a {@code textures} property whose value is base64
 * of a small JSON document holding a Mojang texture URL. Only the trailing hex
 * segment is worth shipping — the host and path are constant, and the hash is
 * what the site needs to build an image URL.
 *
 * <p>Pure JDK so the decoding is testable from a fixture string rather than
 * needing a real item stack.
 */
public final class SkinTextures {

    /**
     * The hex segment after {@code /texture/}. Length-bounded so a stray path
     * that merely contains the word cannot masquerade as a hash.
     */
    private static final Pattern TEXTURE_HASH = Pattern.compile("/texture/([0-9a-fA-F]{16,128})");

    private SkinTextures() {
    }

    /** @return the hash, or null when the value is missing or unreadable */
    public static String hashFromBase64(String base64Value) {
        if (base64Value == null || base64Value.isBlank()) {
            return null;
        }
        String json;
        try {
            json = new String(Base64.getDecoder().decode(base64Value.trim()), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            // Not base64 at all; nothing to salvage.
            return null;
        }
        return hashFromJson(json);
    }

    /** @return the hash, or null when the document carries no texture URL */
    public static String hashFromJson(String texturesJson) {
        if (texturesJson == null || texturesJson.isEmpty()) {
            return null;
        }
        Matcher m = TEXTURE_HASH.matcher(texturesJson);
        return m.find() ? m.group(1) : null;
    }
}
