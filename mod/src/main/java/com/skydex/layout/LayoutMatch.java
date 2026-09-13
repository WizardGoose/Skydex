package com.skydex.layout;

import com.skydex.garden.MutationNames;

import java.util.Map;

/**
 * Decides whether what is standing in a cell satisfies what the layout asked
 * for.
 *
 * <p><b>The two sides speak different vocabularies, and that is by design.</b>
 * {@code com.skydex.data.GreenhouseCell} spells the split out: a pushed layout
 * carries <i>display names</i> ("Cocoa Beans", "Choconut") because that is what
 * Transport 3's spec shows, while an observed cell carries <i>Hypixel id
 * style</i> ("COCOA", "CHOCONUT") because that is what the greenhouse section's
 * spec shows. Both stand as written, so exactly one normalisation step sits
 * between them. Until now that step lived on the site, which owned both ends of
 * the comparison. The overlay is the first thing in the mod that has to do it,
 * and this class is that step and the only one.
 *
 * <p><b>Normalising to the id side is the total direction.</b> Prettifying an id
 * into a display name is lossy for anything that is not simple title case, so
 * the comparison runs the other way: strip everything that could drift (case,
 * spaces, underscores, punctuation) via {@link MutationNames#normalise}, which
 * is reused rather than restated so a change to the drift rule cannot reach one
 * caller and miss the other.
 *
 * <p><b>Mutations need nothing more than that.</b> "Do Not Eat Shroom" and
 * {@code DO_NOT_EAT_SHROOM} both normalise to {@code DONOTEATSHROOM}, and the
 * same holds across all 40 ids, so mutation matching is plain equality.
 *
 * <p><b>Crops need a short alias table, and it is evidence, not guesswork.</b>
 * Crop ids on the observed side come from {@code CropIds}, which derives them
 * from the <i>Minecraft block registry path</i> ({@code carrots} to
 * {@code CARROTS}). Display names on the layout side come from the site's own
 * crop dataset. Those two disagree in five places and agree everywhere else, so
 * the table below has exactly five entries, each one a checked divergence rather
 * than a precaution:
 * <ul>
 *   <li><b>Plural block, singular name.</b> Minecraft names the crop blocks
 *       {@code carrots}, {@code potatoes} and {@code beetroots}; the crop is
 *       called "Carrot", "Potato", "Beetroot". One rule, three entries.</li>
 *   <li><b>Cocoa.</b> The block is {@code cocoa}; the crop is "Cocoa Beans".</li>
 *   <li><b>Dead plant.</b> The block is {@code dead_bush}; the site calls the
 *       state "Dead Plant".</li>
 * </ul>
 *
 * <p><b>Unknown names fail shut, and the direction of that failure is the whole
 * safety argument.</b> A name this class cannot resolve does not match, the cell
 * stays pending, and a ghost keeps being drawn over something that may already
 * be built. The opposite failure would paint a cell green and quietly tell the
 * player a job was finished when it was not. Over-prompting is recoverable by
 * looking; a false green is not, because nobody re-checks a cell that claims to
 * be done.
 *
 * <p>Pure string logic, no Minecraft types.
 */
public final class LayoutMatch {

    /**
     * Normalised layout name to normalised observed id, for the crops whose two
     * vocabularies genuinely differ. See the class doc for why each is here.
     *
     * <p>Keys and values are already in normalised form (letters and digits
     * only, upper case), so a lookup never has to normalise twice.
     */
    private static final Map<String, String> CROP_ALIASES = Map.of(
            // Minecraft blocks: carrots / potatoes / beetroots. Crops: singular.
            "CARROT", "CARROTS",
            "POTATO", "POTATOES",
            "BEETROOT", "BEETROOTS",
            // Block: cocoa. Crop: Cocoa Beans.
            "COCOABEANS", "COCOA",
            // Block: dead_bush. Site's name for the state: Dead Plant.
            "DEADPLANT", "DEADBUSH");

    private LayoutMatch() {
    }

    /**
     * The comparison form of any name or id: letters and digits only, upper
     * case.
     *
     * <p>Delegates rather than reimplements. The greenhouse scanner already
     * matches armour stand names through this exact rule, and two spellings of
     * "what counts as the same name" would eventually disagree about a cell.
     */
    public static String key(String text) {
        return MutationNames.normalise(text);
    }

    /**
     * The comparison form of a crop, with the vocabulary gap closed.
     *
     * <p>Applied to <b>both</b> sides. The table only ever maps a display-name
     * spelling onto its block-derived id, so running an id through it is a
     * no-op, and doing so keeps the two arguments symmetrical instead of relying
     * on the caller to remember which one needs translating.
     */
    public static String cropKey(String cropNameOrId) {
        String normalised = key(cropNameOrId);
        return CROP_ALIASES.getOrDefault(normalised, normalised);
    }

    /**
     * Compare one layout cell against what the world actually holds there.
     *
     * @param cell       the layout cell; null is treated as nothing asked for
     * @param observedId the crop id or mutation id read out of the world at this
     *                   cell, or null when the mod found nothing it recognises
     * @return {@link CellStatus#DONE} only on a positive match
     */
    public static CellStatus statusOf(LayoutCell cell, String observedId) {
        if (cell == null) {
            return CellStatus.EMPTY;
        }
        String have = key(observedId);
        if (have.isEmpty()) {
            return CellStatus.EMPTY;
        }
        String want;
        if (cell.isMutation()) {
            want = key(cell.mutation());
        } else {
            want = cropKey(cell.crop());
            have = cropKey(observedId);
        }
        if (want.isEmpty()) {
            // A cell with no readable target cannot be satisfied by anything.
            // Reporting a mismatch rather than DONE keeps the fail-shut rule.
            return CellStatus.MISMATCH;
        }
        return want.equals(have) ? CellStatus.DONE : CellStatus.MISMATCH;
    }

    /** How many crop spellings this class knows how to bridge. */
    public static int aliasCount() {
        return CROP_ALIASES.size();
    }
}
