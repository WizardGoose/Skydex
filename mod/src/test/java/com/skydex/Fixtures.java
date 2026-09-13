package com.skydex;

import com.skydex.data.ChestRecord;
import com.skydex.data.IslandSnapshot;
import com.skydex.data.ItemEntry;
import com.skydex.data.ItemExtra;
import com.skydex.data.ItemNames;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Shared fixture so the schema and codec tests agree on one document. */
public final class Fixtures {

    public static final long TS = 1754092800000L;
    public static final String UUID = "e1f0c4d2-0000-4000-8000-000000000001";

    private Fixtures() {
    }

    /**
     * A snapshot with sacks, one chest and an inventory captured, but ender
     * chest and storage never observed — so those two must be absent from the
     * JSON entirely.
     */
    public static IslandSnapshot snapshot() {
        TreeMap<String, Long> sacks = new TreeMap<>();
        sacks.put("ENCHANTED_BROWN_MUSHROOM", 25600L);

        ChestRecord chest = new ChestRecord(12, 70, -34, "Chest", TS,
                List.of(new ItemEntry("OAK_LOG", "Oak Log", 64, ItemExtra.EMPTY, 4)));

        return new IslandSnapshot()
                .exportedAt(TS)
                .player(UUID, "WizardGoose")
                .profile("Strawberry", "ironman")
                .sacks(sacks)
                .chests(List.of(chest))
                .inventory(List.of(new ItemEntry(
                        "ASPECT_OF_THE_END", "Aspect of the End", 1, ItemExtra.EMPTY, 0)));
    }

    /**
     * Byte-exact expected serialisation. Guards every field name in the spec.
     *
     * <p>Note the two item entries differ on purpose: {@code OAK_LOG}'s name is
     * exactly its title-cased id so it is <b>omitted</b>, while
     * {@code ASPECT_OF_THE_END} prettifies to "Aspect Of The End" (capital Of)
     * and so its real name must survive.
     */
    public static final String EXPECTED_JSON =
            "{\"schema\":1,"
                    + "\"exportedAt\":1754092800000,"
                    + "\"player\":{\"uuid\":\"e1f0c4d2-0000-4000-8000-000000000001\",\"name\":\"WizardGoose\"},"
                    + "\"profile\":{\"name\":\"Strawberry\",\"gameMode\":\"ironman\"},"
                    + "\"sacks\":{\"ENCHANTED_BROWN_MUSHROOM\":25600},"
                    + "\"chests\":[{\"pos\":[12,70,-34],\"name\":\"Chest\",\"lastSeen\":1754092800000,"
                    + "\"items\":[{\"id\":\"OAK_LOG\",\"count\":64,\"slot\":4}]}],"
                    + "\"inventory\":[{\"id\":\"ASPECT_OF_THE_END\",\"name\":\"Aspect of the End\","
                    + "\"count\":1,\"slot\":0}]}";

    /** The same snapshot as a clipboard code would carry it: no API-covered sections. */
    public static final String EXPECTED_EXPORT_JSON =
            "{\"schema\":1,"
                    + "\"exportedAt\":1754092800000,"
                    + "\"player\":{\"uuid\":\"e1f0c4d2-0000-4000-8000-000000000001\",\"name\":\"WizardGoose\"},"
                    + "\"profile\":{\"name\":\"Strawberry\",\"gameMode\":\"ironman\"},"
                    + "\"sacks\":{\"ENCHANTED_BROWN_MUSHROOM\":25600},"
                    + "\"chests\":[{\"pos\":[12,70,-34],\"name\":\"Chest\",\"lastSeen\":1754092800000,"
                    + "\"items\":[{\"id\":\"OAK_LOG\",\"count\":64,\"slot\":4}]}]}";

    /**
     * A realistic island: 40 chests of 20 stacks each, mostly plain items whose
     * names are redundant, some with real display names. Used to measure what
     * the size levers actually buy.
     */
    public static IslandSnapshot bigSnapshot() {
        // A real island holds hundreds of DISTINCT ids, not ten repeated ones.
        // Variety matters for an honest measurement: a repetitive fixture lets
        // gzip hide the redundant names and understates what omitting them buys.
        List<String> plain = distinctIds();
        // Gear carries the structured detail a tooltip needs.
        String[][] fancy = {
                {"ASPECT_OF_THE_END", "Withered Aspect of the End ✪✪✪", "Withered", "3"},
                {"HYPERION", "Heroic Hyperion ✪✪✪✪✪", "Heroic", "5"},
                {"NECRON_CHESTPLATE", "Ancient Necron's Chestplate ✪", "Ancient", "1"},
                {"TERMINATOR", "Fabled Terminator ✪✪✪✪", "Fabled", "4"},
                {"DAEDALUS_AXE", "Fierce Daedalus Axe", "Fierce", "0"},
        };
        String[] enchantIds = {
                "SHARPNESS", "GIANT_KILLER", "ULTIMATE_WISE", "CRITICAL", "LOOTING",
                "BIG_BRAIN", "SCAVENGER", "EXECUTE", "FIRST_STRIKE", "LETHALITY",
        };

        List<ChestRecord> chests = new ArrayList<>();
        int cursor = 0;
        for (int c = 0; c < 25; c++) {
            List<ItemEntry> items = new ArrayList<>();
            for (int i = 0; i < 27; i++) {
                // Roughly one in eight items is a renamed/reforged piece whose
                // display name genuinely differs and must still be shipped.
                if (i % 8 == 3) {
                    String[] f = fancy[(c + i) % fancy.length];
                    Map<String, Integer> ench = new LinkedHashMap<>();
                    for (int e = 0; e < 4; e++) {
                        ench.put(enchantIds[(c + i + e) % enchantIds.length], 1 + ((c + e) % 6));
                    }
                    items.add(new ItemEntry(f[0], f[1], 1,
                            new ItemExtra(f[2], Integer.parseInt(f[3]), ench, (c + i) % 3 == 0), i));
                } else if (i % 8 == 6) {
                    // Enchanted books: one shared id, so the enchant is the
                    // only thing that makes the entry mean anything.
                    Map<String, Integer> ench = new LinkedHashMap<>();
                    ench.put(enchantIds[(c + i) % enchantIds.length], 1 + (c % 7));
                    items.add(new ItemEntry("ENCHANTED_BOOK", "Enchanted Book", 1,
                            new ItemExtra(null, 0, ench, false), i));
                } else {
                    String id = plain.get(cursor++ % plain.size());
                    items.add(new ItemEntry(id, ItemNames.prettify(id), 1 + (cursor % 64),
                            ItemExtra.EMPTY, i));
                }
            }
            chests.add(new ChestRecord(c % 9, 70 + c / 9, -c, "Chest", TS, items));
        }

        TreeMap<String, Long> sacks = new TreeMap<>();
        for (int i = 0; i < 120; i++) {
            sacks.put(plain.get(i % plain.size()) + "_SACKED_" + i, 1_000L + i * 977L);
        }

        return new IslandSnapshot()
                .exportedAt(TS)
                .player(UUID, "WizardGoose")
                .profile("Strawberry", "ironman")
                .sacks(sacks)
                .chests(chests)
                // Real sizes: 36 inventory slots, 9 ender chest pages and 18
                // storage backpacks of 45 slots each. These three are the bulk
                // of a real island, which is why the code drops them.
                .inventory(flatItems(plain, 36, 1))
                .enderChest(flatItems(plain, 9 * 45, 2))
                .storage(flatItems(plain, 18 * 45, 3));
    }

    private static List<ItemEntry> flatItems(List<String> ids, int count, int stride) {
        List<ItemEntry> items = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            String id = ids.get((i * (7 + stride)) % ids.size());
            items.add(new ItemEntry(id, ItemNames.prettify(id), 1 + (i % 64),
                    ItemExtra.EMPTY, i % 45));
        }
        return items;
    }

    /** ~200 plausible distinct SkyBlock item ids. */
    private static List<String> distinctIds() {
        String[] prefixes = {"ENCHANTED", "SUPER_ENCHANTED", "MUTANT", "REFINED", "FINE", "FLAWED"};
        String[] materials = {
                "COBBLESTONE", "IRON_INGOT", "COAL", "DIAMOND", "LAPIS_LAZULI", "REDSTONE",
                "GOLD_INGOT", "EMERALD", "QUARTZ", "OBSIDIAN", "GLOWSTONE_DUST", "SUGAR_CANE",
                "BREAD", "CARROT", "POTATO", "PUMPKIN", "MELON", "CACTUS_GREEN", "BROWN_MUSHROOM",
                "RED_MUSHROOM", "NETHER_WART", "STRING", "BONE", "GUNPOWDER", "SLIME_BALL",
                "BLAZE_ROD", "GHAST_TEAR", "ENDER_PEARL", "MAGMA_CREAM", "SPIDER_EYE",
                "ROTTEN_FLESH", "LEATHER", "RABBIT_HIDE", "MUTTON", "PORK", "RAW_FISH",
        };
        List<String> ids = new ArrayList<>();
        for (String material : materials) {
            ids.add(material);
            for (String prefix : prefixes) {
                ids.add(prefix + "_" + material);
                if (ids.size() >= 200) {
                    return ids;
                }
            }
        }
        return ids;
    }
}
