package com.skydex.garden;

import com.skydex.capture.ItemIds;
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.decoration.ArmorStand;

/** Plant identity belongs to the worn item on Hypixel's otherwise unnamed stands. */
public final class PlantIdentity {
    private PlantIdentity() {}

    public static String id(ArmorStand stand) {
        var head = stand.getItemBySlot(EquipmentSlot.HEAD);
        var name = head.get(DataComponents.CUSTOM_NAME);
        String id = known(name == null ? null : ItemIds.strip(name));
        if (id == null && stand.hasCustomName()) id = known(ItemIds.strip(stand.getCustomName()));
        if (id == null) id = GreenhouseCatalog.canonicalId(MutationNames.idForTexture(
                head.isEmpty() ? null : ItemIds.skinHash(head)));
        return id;
    }

    public static String known(String name) {
        String id = GreenhouseCatalog.canonicalId(name);
        // Hypixel's equipped-head names can end with a numeric variant/stage,
        // e.g. blastberry3 and startlevine0. Only accept a known full base name.
        if (!GreenhouseCatalog.isKnown(id) && name != null)
            id = GreenhouseCatalog.canonicalId(name.trim().replaceFirst("[0-9]+$", ""));
        return GreenhouseCatalog.isKnown(id) ? id : null;
    }

    public static boolean isMutation(String id) {
        return id != null && MutationNames.MUTATIONS.contains(id.toUpperCase(java.util.Locale.ROOT));
    }
}
