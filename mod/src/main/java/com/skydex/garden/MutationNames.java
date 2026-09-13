package com.skydex.garden;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Turns what a greenhouse armour stand calls itself into a stable mutation id.
 *
 * <p>This is the legacy string-matching surface. Actual Hypixel captures put
 * names on equipped head items, not necessarily on their armour stands.
 * {@link PlantIdentity} reads those components for both crops and mutations.
 * A vanilla stem below a named head is part of that plant, not its identity.
 *
 * <p><b>Matching is two-tier, and the tiers mean different things.</b>
 * <ol>
 *   <li><b>Exact</b>: the stand's normalised name equals a known mutation's
 *       normalised name. This is the trustworthy tier.</li>
 *   <li><b>Containment</b>: a known mutation's normalised name appears inside
 *       the stand's normalised name, longest match winning. This catches names
 *       carrying decoration a future game update might add, and it also catches
 *       the decorative parts of multi-cell mutations (a stand named something
 *       like "godseedPillar" resolves to GODSEED). For board purposes that is
 *       the intended reading: a cell occupied by part of a Godseed is a Godseed
 *       cell. It is reported separately in the diagnostics so the difference
 *       between "matched cleanly" and "matched loosely" stays visible rather
 *       than silently inflating a cell count.</li>
 * </ol>
 *
 * <p>Normalising away case, spaces and punctuation is what makes tier 1 survive
 * the exact drift the research flagged as an open question: these display
 * strings are precisely the sort that change capitalisation between updates.
 *
 * <p><b>The texture-hash fallback is wired but unpopulated, on purpose.</b>
 * {@link #idForTexture} is the documented second identification route for the
 * handful of mutations whose names are unreliable, and it reads the hash through
 * the mod's existing player-head plumbing
 * ({@code ItemIds.skinHash} to {@code SkinTextures}). The table is empty because
 * this repo has no verbatim-captured head textures to fill it with, and
 * inventing hashes from a third-party mod's source would be exactly the
 * fabricated-fixture mistake this project has already caught itself making once.
 * {@link GreenhouseScanner} records the name and hash of every head it cannot
 * identify, so one playtest produces the real data this table needs.
 */
public final class MutationNames {

    /**
     * The 40 named mutations, cross-checked between two independent sources (a
     * third-party mod's own enum and the wiki's rarity-tier breakdown, which
     * agree 1:1). The ids are the display names in Hypixel's internal id style,
     * which is what the spec asks a {@code mutation} value to carry.
     *
     * <p>Grouped by the rarity tiers the wiki lists them under, purely so the
     * count stays auditable: 9 + 6 + 9 + 9 + 7 = 40.
     */
    public static final List<String> MUTATIONS = List.of(
            // tier 1 (9)
            "ASHWREATH", "CHOCONUT", "DUSTGRAIN", "GLOOMGOURD", "LONELILY",
            "SCOURROOT", "SHADEVINE", "VEILSHROOM", "WITHERBLOOM",
            // tier 2 (6)
            "CHOCOBERRY", "CINDERSHADE", "COALROOT", "CREAMBLOOM", "DUSKBLOOM", "THORNSHADE",
            // tier 3 (9)
            "BLASTBERRY", "CHEESEBITE", "CHLORONITE", "DO_NOT_EAT_SHROOM", "FLESHTRAP",
            "MAGIC_JELLYBEAN", "NOCTILUME", "SNOOZLING", "SOGGYBUD",
            // tier 4 (9)
            "CHORUS_FRUIT", "PLANTBOY_ADVANCE", "PUFFERCLOUD", "SHELLFRUIT", "STARTLEVINE",
            "STOPLIGHT_PETAL", "THUNDERLING", "TURTLELLINI", "ZOMBUD",
            // tier 5 (7)
            "ALL_IN_ALOE", "DEVOURER", "GLASSCORN", "GODSEED", "JERRYFLOWER",
            "PHANTOMLEAF", "TIMESTALK");

    /** Normalised form to canonical id. Insertion-ordered for stable longest-match. */
    private static final Map<String, String> BY_NORMALISED = buildIndex();

    /**
     * Texture hash to mutation id. Empty until real captures exist; see the
     * class doc for why it is not filled in from a third-party source.
     */
    private static final Map<String, String> BY_TEXTURE = Map.of();

    private MutationNames() {
    }

    private static Map<String, String> buildIndex() {
        Map<String, String> index = new LinkedHashMap<>();
        for (String id : MUTATIONS) {
            index.put(normalise(id), id);
        }
        return index;
    }

    /**
     * Strip everything that could drift: colour codes are already gone by the
     * time this is called, so what is left is case, spaces and punctuation.
     */
    public static String normalise(String text) {
        if (text == null) {
            return "";
        }
        StringBuilder out = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (Character.isLetterOrDigit(c)) {
                out.append(Character.toUpperCase(c));
            }
        }
        return out.toString();
    }

    /** @return the canonical id when the name matches exactly, else null */
    public static String idForExactName(String displayName) {
        String key = normalise(displayName);
        return key.isEmpty() ? null : BY_NORMALISED.get(key);
    }

    /**
     * Longest known mutation name contained in this display name.
     *
     * <p>Longest wins so that a hypothetical name containing two known ids
     * resolves deterministically rather than by map order.
     *
     * @return the canonical id, or null when nothing is contained
     */
    public static String idForContainedName(String displayName) {
        String key = normalise(displayName);
        if (key.isEmpty()) {
            return null;
        }
        String best = null;
        int bestLength = 0;
        for (Map.Entry<String, String> entry : BY_NORMALISED.entrySet()) {
            String candidate = entry.getKey();
            if (candidate.length() > bestLength && key.contains(candidate)) {
                best = entry.getValue();
                bestLength = candidate.length();
            }
        }
        return best;
    }

    /**
     * Identification by head texture, the documented fallback for names that
     * cannot be trusted.
     *
     * @return the canonical id, or null (always, until the table is populated)
     */
    public static String idForTexture(String textureHash) {
        if (textureHash == null || textureHash.isBlank()) {
            return null;
        }
        return BY_TEXTURE.get(textureHash.toLowerCase(Locale.ROOT));
    }

    /**
     * Whether the texture fallback has anything in it.
     *
     * <p>Surfaced in {@code /skydex status} so the owner is told the fallback
     * is inert rather than assuming it is covering for a name that drifted.
     */
    public static boolean hasTextureData() {
        return !BY_TEXTURE.isEmpty();
    }

    public static int knownCount() {
        return MUTATIONS.size();
    }
}
