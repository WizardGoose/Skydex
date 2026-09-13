package com.skydex.garden;

import java.util.Locale;
import java.util.Map;

/**
 * Turns a vanilla block into the crop id the spec wants in a greenhouse cell.
 *
 * <p>Ordinary crops in the greenhouse are real block states, so this is the
 * cheap half of the scan: read the block, name it, done. The naming rule is not
 * invented here. The spec already pins how a vanilla thing gets a Hypixel-style
 * id ("when absent, fall back to the minecraft registry id upper-cased, e.g.
 * minecraft:oak_log to OAK_LOG"), {@code ItemIds} already applies exactly that
 * rule to items, and the spec's own greenhouse example uses {@code PUMPKIN},
 * which is what that rule produces. So crops follow the same rule, and this
 * class is a <b>whitelist</b> rather than a translation table.
 *
 * <p>Whitelisting is the important part. The greenhouse is a building: glass,
 * floor blocks, decoration. Mapping any non-air block to an id would fill the
 * board with structure, so only blocks that are genuinely a planted thing count,
 * and everything else reads as an empty cell.
 *
 * <p>Two deliberate departures from a pure registry-path mapping, both because
 * the cell's <i>crop identity</i> is what the site diffs against a pushed
 * layout, not the block that happens to be rendering it:
 * <ul>
 *   <li>Pumpkin and melon <b>stems</b>, attached or not, report as PUMPKIN and
 *       MELON. A planted-but-ungrown pumpkin is still a pumpkin cell, and a
 *       layout that says "pumpkin here" is satisfied by a stem.</li>
 *   <li>Cocoa reports as COCOA rather than the block's own path, which is
 *       already {@code cocoa}, so this one is only called out to say it was
 *       checked rather than assumed.</li>
 * </ul>
 *
 * <p>Dead bush and fire are included because the source material lists them
 * alongside the crops: they are states a greenhouse cell can be in, and a burnt
 * or dead cell is real board information the site wants rather than an empty
 * cell that implies "nothing planted here".
 *
 * <p>Pure string logic, no Minecraft types: the caller passes the registry path
 * it already has, and every mapping stays testable off a game classpath.
 */
public final class CropIds {

    /**
     * Registry path to crop id. Everything absent from this map is not a crop
     * and leaves the cell empty.
     */
    private static final Map<String, String> BY_PATH = Map.ofEntries(
            Map.entry("wheat", "WHEAT"),
            Map.entry("carrots", "CARROTS"),
            Map.entry("potatoes", "POTATOES"),
            Map.entry("beetroots", "BEETROOTS"),
            Map.entry("nether_wart", "NETHER_WART"),
            Map.entry("sugar_cane", "SUGAR_CANE"),
            Map.entry("cactus", "CACTUS"),
            Map.entry("cocoa", "COCOA"),
            Map.entry("red_mushroom", "RED_MUSHROOM"),
            Map.entry("brown_mushroom", "BROWN_MUSHROOM"),
            Map.entry("pumpkin", "PUMPKIN"),
            Map.entry("melon", "MELON"),
            // Stems report as the fruit they will become; see the class doc.
            Map.entry("pumpkin_stem", "PUMPKIN"),
            Map.entry("attached_pumpkin_stem", "PUMPKIN"),
            Map.entry("melon_stem", "MELON"),
            Map.entry("attached_melon_stem", "MELON"),
            // Dead / burnt cell states, not decoration.
            Map.entry("dead_bush", "DEAD_BUSH"),
            Map.entry("fire", "FIRE"));

    private CropIds() {
    }

    /**
     * @param registryPath the block's registry path, e.g. {@code "wheat"} from
     *                     {@code minecraft:wheat}
     * @return the crop id, or null when this block is not a crop
     */
    public static String fromBlockPath(String registryPath) {
        if (registryPath == null || registryPath.isBlank()) {
            return null;
        }
        return BY_PATH.get(registryPath.trim().toLowerCase(Locale.ROOT));
    }

    public static boolean isCrop(String registryPath) {
        return fromBlockPath(registryPath) != null;
    }

    public static int knownCount() {
        return BY_PATH.size();
    }
}
