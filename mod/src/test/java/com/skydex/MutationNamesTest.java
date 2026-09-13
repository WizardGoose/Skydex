package com.skydex;

import com.skydex.garden.MutationNames;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The armour stand's display name is the only thing on the client that says
 * which mutation a cell holds, and those strings are exactly the sort that
 * change capitalisation or spacing between game updates. So the matching is
 * tested for tolerance of that drift, and separately for the property that makes
 * the loose tier safe to have at all.
 */
class MutationNamesTest {

    @Test
    @DisplayName("40 mutations, all distinct")
    void countMatchesBothSources() {
        // Two independent sources agree on 40 (a third-party enum, and the
        // wiki's rarity breakdown of 9+6+9+9+7). The wiki's headline says 47,
        // which is an open question for the owner's playtest rather than
        // something to encode here.
        assertEquals(40, MutationNames.knownCount());
        assertEquals(40, new HashSet<>(MutationNames.MUTATIONS).size(), "duplicate mutation id");
    }

    @Test
    @DisplayName("ids are in Hypixel internal id style")
    void idsAreUpperSnake() {
        for (String id : MutationNames.MUTATIONS) {
            assertTrue(id.matches("[A-Z][A-Z0-9_]*"), "not an internal-style id: " + id);
            assertFalse(id.startsWith("_") || id.endsWith("_"), "stray underscore: " + id);
        }
    }

    @Test
    @DisplayName("exact matching survives case, spacing and punctuation drift")
    void exactMatchIgnoresCosmetics() {
        assertEquals("CHOCONUT", MutationNames.idForExactName("Choconut"));
        assertEquals("CHOCONUT", MutationNames.idForExactName("choconut"));
        assertEquals("CHOCONUT", MutationNames.idForExactName("CHOCONUT"));

        // Multi-word names arrive spaced in game and underscored in the id.
        assertEquals("DO_NOT_EAT_SHROOM", MutationNames.idForExactName("Do Not Eat Shroom"));
        assertEquals("MAGIC_JELLYBEAN", MutationNames.idForExactName("Magic Jellybean"));
        assertEquals("PLANTBOY_ADVANCE", MutationNames.idForExactName("PlantBoy Advance"));
        assertEquals("ALL_IN_ALOE", MutationNames.idForExactName("All In Aloe"));
        assertEquals("STOPLIGHT_PETAL", MutationNames.idForExactName("Stoplight  Petal"));
    }

    @Test
    @DisplayName("an unknown name matches nothing rather than guessing")
    void unknownNamesReturnNull() {
        assertNull(MutationNames.idForExactName("Definitely Not A Mutation"));
        assertNull(MutationNames.idForExactName(""));
        assertNull(MutationNames.idForExactName(null));
        assertNull(MutationNames.idForContainedName("   "));
    }

    /**
     * The property that makes the containment tier deterministic. If one
     * mutation's normalised name were ever a substring of another's, a decorated
     * name could resolve to either and the answer would depend on map order.
     */
    @Test
    @DisplayName("no mutation name is a substring of another")
    void namesAreMutuallyNonContaining() {
        List<String> ids = MutationNames.MUTATIONS;
        for (String a : ids) {
            for (String b : ids) {
                if (a.equals(b)) {
                    continue;
                }
                String na = MutationNames.normalise(a);
                String nb = MutationNames.normalise(b);
                assertFalse(nb.contains(na),
                        a + " is contained in " + b + ", which makes loose matching ambiguous");
            }
        }
    }

    @Test
    @DisplayName("containment catches decorated names, longest match winning")
    void containmentTier() {
        // Decorative parts of a multi-cell mutation carry a suffixed name.
        assertEquals("GODSEED", MutationNames.idForContainedName("godseedPillar"));
        assertEquals("CHOCONUT", MutationNames.idForContainedName("Choconut (ready)"));
        // Exact matching must NOT accept these; that is what keeps the two tiers
        // reportable separately in the diagnostics.
        assertNull(MutationNames.idForExactName("godseedPillar"));
        assertNull(MutationNames.idForContainedName("nothing relevant here"));
    }

    @Test
    @DisplayName("every known mutation resolves through both tiers")
    void allMutationsResolve() {
        for (String id : MutationNames.MUTATIONS) {
            String spaced = id.replace('_', ' ');
            assertEquals(id, MutationNames.idForExactName(spaced), "exact tier missed " + id);
            assertEquals(id, MutationNames.idForContainedName("[" + spaced + "]"),
                    "loose tier missed " + id);
        }
    }

    @Test
    @DisplayName("the texture fallback is wired but honestly empty")
    void textureFallbackIsInert() {
        // Populating this from a third-party mod's source rather than a real
        // captured head is exactly the fabricated-fixture mistake this project
        // has a standing rule against. It stays empty until a playtest fills it.
        assertFalse(MutationNames.hasTextureData());
        assertNull(MutationNames.idForTexture("0123456789abcdef0123456789abcdef"));
        assertNull(MutationNames.idForTexture(null));
        assertNull(MutationNames.idForTexture(""));
    }

    @Test
    @DisplayName("normalising strips everything that is not a letter or digit")
    void normalisation() {
        assertEquals("CHOCONUT", MutationNames.normalise("  cho-co_nut "));
        assertEquals("", MutationNames.normalise("!!! ???"));
        assertEquals("", MutationNames.normalise(null));
        Set<String> normalised = new HashSet<>();
        for (String id : MutationNames.MUTATIONS) {
            assertTrue(normalised.add(MutationNames.normalise(id)),
                    "two mutations normalise to the same key: " + id);
        }
    }
}
