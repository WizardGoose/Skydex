package com.skydex.gui;

import com.mojang.blaze3d.textures.GpuTextureView;

import java.util.Collections;
import java.util.Set;
import java.util.WeakHashMap;

/** Identity set of Skydex font atlases; weak keys disappear after a resource reload. */
public final class SmoothFontAtlases {

    private static final Set<GpuTextureView> ATLASES =
            Collections.synchronizedSet(Collections.newSetFromMap(new WeakHashMap<>()));

    private SmoothFontAtlases() {
    }

    public static void add(GpuTextureView atlas) {
        ATLASES.add(atlas);
    }

    public static boolean contains(GpuTextureView atlas) {
        return ATLASES.contains(atlas);
    }
}
