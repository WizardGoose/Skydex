package com.skydex;

import com.skydex.layout.CellStatus;
import com.skydex.layout.LayoutCell;
import com.skydex.layout.LayoutMatch;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

/**
 * The overlay's one comparison, and the place a wrong answer would be worst.
 *
 * <p>A false DONE paints a cell green and tells the player a job is finished.
 * Nobody re-checks a cell that claims to be done, so that error survives; a
 * false PENDING only draws a ghost over something already built, which the next
 * glance corrects. Several tests below exist purely to pin that asymmetry: when
 * this class cannot resolve a name, it must fail toward the recoverable side.
 */
class LayoutMatchTest {

    private static LayoutCell crop(String name) {
        return LayoutCell.crop(0, 0, name, null);
    }

    private static LayoutCell mutation(String name) {
        return LayoutCell.mutation(0, 0, name, null);
    }

    // ------------------------------------------------------------ the easy half

    @Test
    @DisplayName("a crop whose display name already matches its block id is done")
    void matchesPlainCropNames() {
        assertEquals(CellStatus.DONE, LayoutMatch.statusOf(crop("Wheat"), "WHEAT"));
        assertEquals(CellStatus.DONE, LayoutMatch.statusOf(crop("Melon"), "MELON"));
        assertEquals(CellStatus.DONE, LayoutMatch.statusOf(crop("Pumpkin"), "PUMPKIN"));
        assertEquals(CellStatus.DONE, LayoutMatch.statusOf(crop("Cactus"), "CACTUS"));
    }

    @Test
    @DisplayName("a space on one side and an underscore on the other are the same name")
    void spacesAndUnderscoresAgree() {
        assertEquals(CellStatus.DONE, LayoutMatch.statusOf(crop("Nether Wart"), "NETHER_WART"));
        assertEquals(CellStatus.DONE, LayoutMatch.statusOf(crop("Sugar Cane"), "SUGAR_CANE"));
        assertEquals(CellStatus.DONE, LayoutMatch.statusOf(crop("Brown Mushroom"), "BROWN_MUSHROOM"));
        assertEquals(CellStatus.DONE, LayoutMatch.statusOf(crop("Red Mushroom"), "RED_MUSHROOM"));
    }

    @Test
    @DisplayName("case and punctuation cannot change the answer")
    void ignoresCaseAndPunctuation() {
        assertEquals(CellStatus.DONE, LayoutMatch.statusOf(crop("cocoa beans"), "COCOA"));
        assertEquals(CellStatus.DONE, LayoutMatch.statusOf(crop("COCOA-BEANS"), "cocoa"));
        assertEquals(CellStatus.DONE, LayoutMatch.statusOf(crop("  Wheat  "), "wheat"));
    }

    // ------------------------------------------------------- the vocabulary gap

    @Test
    @DisplayName("Minecraft's plural crop blocks match the singular crop names")
    void bridgesPluralBlockNames() {
        // The blocks are carrots / potatoes / beetroots; the crops are not.
        assertEquals(CellStatus.DONE, LayoutMatch.statusOf(crop("Carrot"), "CARROTS"));
        assertEquals(CellStatus.DONE, LayoutMatch.statusOf(crop("Potato"), "POTATOES"));
        assertEquals(CellStatus.DONE, LayoutMatch.statusOf(crop("Beetroot"), "BEETROOTS"));
    }

    @Test
    @DisplayName("Cocoa Beans matches the cocoa block, and Dead Plant the dead bush")
    void bridgesRenamedCrops() {
        assertEquals(CellStatus.DONE, LayoutMatch.statusOf(crop("Cocoa Beans"), "COCOA"));
        assertEquals(CellStatus.DONE, LayoutMatch.statusOf(crop("Dead Plant"), "DEAD_BUSH"));
    }

    @Test
    @DisplayName("the bridge works whichever side the display spelling arrives on")
    void aliasesApplyToBothSides() {
        // Normalising both arguments through the same table is what makes the
        // comparison symmetrical, rather than relying on the caller to know
        // which side needed translating.
        assertEquals(CellStatus.DONE, LayoutMatch.statusOf(crop("COCOA"), "Cocoa Beans"));
        assertEquals(CellStatus.DONE, LayoutMatch.statusOf(crop("Cocoa Beans"), "Cocoa Beans"));
    }

    @Test
    @DisplayName("the alias table stays small enough to justify entry by entry")
    void aliasTableIsTheKnownDivergencesOnly() {
        // Five checked divergences, not a pile of precautions. A sixth should
        // arrive with a reason, and this is what makes someone write one.
        assertEquals(5, LayoutMatch.aliasCount());
    }

    // ----------------------------------------------------------------- mutations

    @Test
    @DisplayName("mutation names match their ids without needing the crop table")
    void matchesMutations() {
        assertEquals(CellStatus.DONE, LayoutMatch.statusOf(mutation("Choconut"), "CHOCONUT"));
        assertEquals(CellStatus.DONE, LayoutMatch.statusOf(mutation("Witherbloom"), "WITHERBLOOM"));
        assertEquals(CellStatus.DONE,
                LayoutMatch.statusOf(mutation("Do Not Eat Shroom"), "DO_NOT_EAT_SHROOM"));
        assertEquals(CellStatus.DONE,
                LayoutMatch.statusOf(mutation("Magic Jellybean"), "MAGIC_JELLYBEAN"));
    }

    @Test
    @DisplayName("the crop aliases stay out of mutation matching")
    void mutationsDoNotUseCropAliases() {
        // The table's five entries are all crop divergences. Letting them reach
        // mutation names would be inventing an equivalence nobody checked, so
        // the mutation path compares the plain normalised names.
        assertEquals(CellStatus.MISMATCH, LayoutMatch.statusOf(mutation("Cocoa Beans"), "COCOA"));
    }

    // ---------------------------------------------------------------- fail shut

    @Test
    @DisplayName("an empty cell is empty, not a match")
    void nothingPlantedIsEmpty() {
        assertEquals(CellStatus.EMPTY, LayoutMatch.statusOf(crop("Wheat"), null));
        assertEquals(CellStatus.EMPTY, LayoutMatch.statusOf(crop("Wheat"), ""));
        assertEquals(CellStatus.EMPTY, LayoutMatch.statusOf(crop("Wheat"), "   "));
        assertEquals(CellStatus.EMPTY, LayoutMatch.statusOf(mutation("Choconut"), null));
    }

    @Test
    @DisplayName("the wrong thing in the cell is a mismatch, never done")
    void wrongContentIsNotDone() {
        assertEquals(CellStatus.MISMATCH, LayoutMatch.statusOf(crop("Wheat"), "CARROTS"));
        assertEquals(CellStatus.MISMATCH, LayoutMatch.statusOf(crop("Pumpkin"), "MELON"));
        assertEquals(CellStatus.MISMATCH, LayoutMatch.statusOf(mutation("Choconut"), "WITHERBLOOM"));
    }

    @Test
    @DisplayName("a mutation's base crop reads as a mismatch, which is the job in progress")
    void baseCropUnderAMutationIsNotDone() {
        // Choconut is grown from cocoa. Seeing cocoa in the cell is the middle
        // of the job, so the ghost must stay and the cell must not go green.
        assertEquals(CellStatus.MISMATCH, LayoutMatch.statusOf(mutation("Choconut"), "COCOA"));
    }

    @Test
    @DisplayName("a crop the mod cannot read out of the world never turns green")
    void unreadableCropsStayPending() {
        // Sunflower, Moonflower, Wild Rose and Fermento are on the site's crop
        // list but are not vanilla blocks CropIds can name, so the world read
        // returns either nothing or something else. Both must leave the cell
        // pending rather than guessing it done.
        assertNotEquals(CellStatus.DONE, LayoutMatch.statusOf(crop("Sunflower"), null));
        assertNotEquals(CellStatus.DONE, LayoutMatch.statusOf(crop("Sunflower"), "WHEAT"));
        assertNotEquals(CellStatus.DONE, LayoutMatch.statusOf(crop("Wild Rose"), "DEAD_BUSH"));
    }

    @Test
    @DisplayName("an unnamed target cannot be satisfied by anything")
    void blankTargetIsNeverDone() {
        assertEquals(CellStatus.EMPTY, LayoutMatch.statusOf(null, "WHEAT"));
        // A name made only of punctuation normalises away to nothing. Matching
        // that against a real crop would make every cell done at once.
        assertEquals(CellStatus.MISMATCH, LayoutMatch.statusOf(crop("---"), "WHEAT"));
    }
}
