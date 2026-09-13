package com.skydex.gui;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class TextureUvTest {

    @Test
    @DisplayName("greenhouse images sample the complete texture on both axes")
    void fullTextureCoordinatesSpanBothAxes() {
        TextureUv uv = TextureUv.FULL;
        assertEquals(0.0f, uv.u0());
        assertEquals(1.0f, uv.u1());
        assertEquals(0.0f, uv.v0());
        assertEquals(1.0f, uv.v1());
        assertEquals(1.0f, uv.u1() - uv.u0());
        assertEquals(1.0f, uv.v1() - uv.v0());
    }
}
