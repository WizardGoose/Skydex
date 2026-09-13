package com.skydex.garden;

import java.util.Locale;
import java.util.Set;

/**
 * What a greenhouse's plantable floor is made of.
 *
 * <p>Used to find the bed empirically rather than computing where it ought to
 * be. The arithmetic approach failed on the owner's real greenhouse: the
 * constants put the grid at x=91 z=-5 while his aerial view showed the planted
 * bed visibly off to one side. Whatever the reason, a number taken from
 * somebody else's mod is not evidence about his island, and a number that is
 * wrong by a few blocks is undetectable from inside the arithmetic. Looking for
 * the floor is evidence.
 *
 * <p>Deliberately generous, and deliberately growing media only. Generous
 * because the exact palette is not established and a miss means the feature
 * finds nothing at all; growing media only because the point is to find the
 * <i>plantable</i> area rather than the building, so glass, stone and
 * decoration must not qualify.
 *
 * <p>When no bed is found, {@link GreenhouseScanner} reports the block types it
 * did see in the search area. If the real floor is something absent from this
 * list, one playtest names it.
 */
public final class BedBlocks {

    /**
     * Registry paths that count as plantable floor.
     *
     * <p>Includes the sand and soul families because cactus and nether wart need
     * them, and the dirt family in all its forms because that is what the
     * owner's greenhouse floor looks like.
     */
    private static final Set<String> BED = Set.of(
            "farmland",
            "dirt",
            "coarse_dirt",
            "rooted_dirt",
            "podzol",
            "grass_block",
            "mycelium",
            "dirt_path",
            "moss_block",
            "mud",
            "muddy_mangrove_roots",
            "soul_sand",
            "soul_soil",
            "sand",
            "red_sand",
            "clay");

    private BedBlocks() {
    }

    /**
     * @param registryPath the block's registry path, e.g. {@code "farmland"}
     * @return true when this block could be part of a plantable bed
     */
    public static boolean isBed(String registryPath) {
        if (registryPath == null || registryPath.isBlank()) {
            return false;
        }
        return BED.contains(registryPath.trim().toLowerCase(Locale.ROOT));
    }

    public static int knownCount() {
        return BED.size();
    }

    /** Buried growing media is the building foundation, not a planting surface. */
    public static boolean isExposedBed(String floor, String above, boolean solidAbove) {
        return isBed(floor) && !isBed(above) && (!solidAbove || CropIds.isCrop(above));
    }
}
