package com.skydex.gui;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.toasts.SystemToast;
import net.minecraft.client.gui.components.toasts.ToastManager;
import net.minecraft.network.chat.Component;

/** Visible at the title screen, with a persistent chat confirmation on joining. */
public final class MigrationNotice {
    public static final SystemToast.SystemToastId ID = new SystemToast.SystemToastId(12000L);
    private MigrationNotice() {}

    public static SystemToast show(Minecraft client) throws ReflectiveOperationException {
        ToastManager manager;
        try {
            // 26.2 moved the same toast manager from Minecraft to Gui.
            manager = (ToastManager) client.gui.getClass().getMethod("toastManager").invoke(client.gui);
        } catch (NoSuchMethodException ignored) {
            manager = (ToastManager) client.getClass().getMethod("getToastManager").invoke(client);
        }
        SystemToast.addOrUpdate(manager, ID, Component.literal("Skydex data converted"),
                Component.literal("Saved data now uses config/skydex."));
        return manager.getToast(SystemToast.class, ID);
    }
}
