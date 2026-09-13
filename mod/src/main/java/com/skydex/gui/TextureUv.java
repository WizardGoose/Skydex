package com.skydex.gui;

/** UV order used by Minecraft's 26.x GUI blitter: u0, u1, v0, v1. */
record TextureUv(float u0, float u1, float v0, float v1) {

    static final TextureUv FULL = new TextureUv(0.0f, 1.0f, 0.0f, 1.0f);
}
