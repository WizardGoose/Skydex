package com.skydex.capture;

import com.mojang.authlib.GameProfile;
import com.mojang.authlib.properties.Property;
import com.skydex.data.ItemEntry;
import com.skydex.data.ItemExtra;
import com.skydex.data.ItemNames;
import com.skydex.data.SkinTextures;
import net.minecraft.ChatFormatting;
import net.minecraft.world.item.component.ResolvableProfile;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.world.item.component.ItemLore;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

/**
 * Pulls the Hypixel identity out of an item stack.
 *
 * <p>On 26.x there is no legacy NBT tag: Hypixel's old {@code ExtraAttributes}
 * compound is flattened into the {@code custom_data} data component, so the id
 * is the top-level {@code "id"} key of that component's tag.
 *
 * <p>{@link CustomData#copyTag()} is public, which is why this mod needs no
 * mixin and no access widener to read it.
 */
public final class ItemIds {

    private static final String ID_KEY = "id";

    private ItemIds() {
    }

    /**
     * Hypixel internal id, e.g. {@code ENCHANTED_BROWN_MUSHROOM}. Falls back to
     * the registry path upper-cased for vanilla items, per the spec:
     * {@code minecraft:oak_log -> OAK_LOG}.
     */
    public static String hypixelId(ItemStack stack) {
        return hypixelId(stack, customData(stack));
    }

    /** {@link CustomData#copyTag()} copies the whole compound, so share one per item. */
    public static CompoundTag customData(ItemStack stack) {
        return stack.getOrDefault(DataComponents.CUSTOM_DATA, CustomData.EMPTY).copyTag();
    }

    private static String hypixelId(ItemStack stack, CompoundTag data) {
        String id = data.getStringOr(ID_KEY, "");
        if (!id.isEmpty()) {
            return id;
        }
        return BuiltInRegistries.ITEM.getKey(stack.getItem()).getPath().toUpperCase(Locale.ROOT);
    }

    /**
     * Structured detail for the site's tooltips, read straight out of
     * {@code custom_data}.
     *
     * <p>Key names: {@code enchantments} and {@code rarity_upgrades} are
     * confirmed against Skyblocker's own reads. {@code modifier},
     * {@code upgrade_level} and {@code dungeon_item_level} are the long-standing
     * ecosystem names but are not read anywhere in the reference clones, so they
     * could not be verified locally. A wrong key here fails safe: the field is
     * simply absent rather than wrong, and stars accept either spelling.
     */
    public static ItemExtra extraOf(ItemStack stack, CompoundTag data) {
        String skin = skinHash(stack);
        if (data.isEmpty()) {
            return skin == null ? ItemExtra.EMPTY : new ItemExtra(null, 0, null, false, skin);
        }
        // Hypixel stores the modifier lower case ("rapid"); the spec shows it
        // capitalised, and the site rebuilds display names by prefixing it.
        String modifier = data.getStringOr("modifier", "");
        String reforge = modifier.isBlank() ? null : ItemNames.prettify(modifier);

        int stars = data.getIntOr("upgrade_level", 0);
        if (stars <= 0) {
            stars = data.getIntOr("dungeon_item_level", 0);
        }

        boolean recombobulated = data.getIntOr("rarity_upgrades", 0) > 0;

        Map<String, Integer> enchantments = new TreeMap<>();
        CompoundTag ench = data.getCompoundOrEmpty("enchantments");
        for (String key : ench.keySet()) {
            int level = ench.getIntOr(key, 0);
            if (level > 0) {
                // Stored lower case ("big_brain"); the spec's shape is BIG_BRAIN.
                enchantments.put(key.toUpperCase(Locale.ROOT), level);
            }
        }
        return new ItemExtra(reforge, stars, enchantments, recombobulated, skin);
    }

    /**
     * Texture hash for a player_head, or null.
     *
     * <p>Custom heads carry a large share of SkyBlock's items — pets, abiphones,
     * many decorations — and none of them have a wiki image, so without this the
     * site cannot draw them at all.
     */
    public static String skinHash(ItemStack stack) {
        ResolvableProfile profile = stack.get(DataComponents.PROFILE);
        if (profile == null) {
            return null;
        }
        GameProfile gameProfile = profile.partialProfile();
        if (gameProfile == null) {
            return null;
        }
        for (Property property : gameProfile.properties().get("textures")) {
            String hash = SkinTextures.hashFromBase64(property.value());
            if (hash != null) {
                return hash;
            }
        }
        return null;
    }

    /**
     * True when this stack is Hypixel GUI furniture rather than an item.
     *
     * <p>Storage and ender chest screens are menus: filler panes, Close
     * barriers, page-navigation heads. See {@link ChromeFilter} for why the
     * custom_data id — not the display name — decides.
     */
    public static boolean isChrome(ItemStack stack) {
        return isChrome(stack, customData(stack));
    }

    private static boolean isChrome(ItemStack stack, CompoundTag data) {
        return ChromeFilter.isChrome(
                data.getStringOr(ID_KEY, ""),
                BuiltInRegistries.ITEM.getKey(stack.getItem()).getPath(),
                displayName(stack));
    }

    /** Display name with colour codes stripped. */
    public static String displayName(ItemStack stack) {
        return strip(stack.getHoverName());
    }

    /** Lore as plain strings. Styled lines keep any inline §-codes; we strip them. */
    public static List<String> lore(ItemStack stack) {
        ItemLore lore = stack.getOrDefault(DataComponents.LORE, ItemLore.EMPTY);
        List<Component> lines = lore.styledLines();
        List<String> out = new ArrayList<>(lines.size());
        for (Component line : lines) {
            out.add(line.getString());
        }
        return out;
    }

    /** Flatten a component to plain text with legacy colour codes removed. */
    public static String strip(Component component) {
        if (component == null) {
            return "";
        }
        return strip(component.getString());
    }

    /** {@code ChatFormatting.stripFormatting} is nullable; never propagate that. */
    public static String strip(String text) {
        if (text == null) {
            return "";
        }
        String stripped = ChatFormatting.stripFormatting(text);
        return stripped == null ? "" : stripped;
    }

    /** One stack as a spec item entry, with no container slot (sacks). */
    public static ItemEntry toEntry(ItemStack stack) {
        return toEntry(stack, ItemEntry.NO_SLOT);
    }

    /**
     * One stack as a spec item entry, tagged with its 0-based container slot so
     * the site can rebuild the container's real grid.
     */
    public static ItemEntry toEntry(ItemStack stack, int slot) {
        CompoundTag data = customData(stack);
        return new ItemEntry(hypixelId(stack, data), displayName(stack),
                stack.getCount(), extraOf(stack, data), slot);
    }
}
