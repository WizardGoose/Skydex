package com.skydex.mixin.client;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.textures.FilterMode;
import com.skydex.gui.SmoothFontAtlases;
import net.minecraft.client.gui.font.TextRenderable;
import net.minecraft.client.gui.render.TextureSetup;
import net.minecraft.client.renderer.state.gui.GlyphRenderState;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Replaces Minecraft's nearest-neighbour sampler only for marked Skydex glyphs. */
@Mixin(GlyphRenderState.class)
abstract class GlyphRenderStateMixin {

    @Shadow
    @Final
    private TextRenderable renderable;

    @Inject(method = "textureSetup", at = @At("HEAD"), cancellable = true)
    private void skydex$useSmoothFontSampler(CallbackInfoReturnable<TextureSetup> callback) {
        if (!SmoothFontAtlases.contains(renderable.textureView())) {
            return;
        }
        callback.setReturnValue(TextureSetup.singleTextureWithLightmap(
                renderable.textureView(),
                RenderSystem.getSamplerCache().getClampToEdge(FilterMode.LINEAR)));
    }
}
