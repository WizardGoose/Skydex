package com.skydex.mixin.client;

import com.skydex.gui.SmoothFontAtlases;
import net.minecraft.client.gui.font.GlyphStitcher;
import net.minecraft.client.renderer.texture.AbstractTexture;
import net.minecraft.resources.Identifier;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyArg;

/** Marks only Skydex's TrueType atlases for smooth GUI sampling. */
@Mixin(GlyphStitcher.class)
abstract class GlyphStitcherMixin {

    @Shadow
    @Final
    private Identifier texturePrefix;

    @ModifyArg(
            method = "stitch",
            at = @At(
                    value = "INVOKE",
                    target = "Lnet/minecraft/client/renderer/texture/TextureManager;register("
                            + "Lnet/minecraft/resources/Identifier;"
                            + "Lnet/minecraft/client/renderer/texture/AbstractTexture;)V"),
            index = 1)
    private AbstractTexture skydex$useSmoothSampler(AbstractTexture texture) {
        if (texturePrefix.getNamespace().equals("skydex")
                && (texturePrefix.getPath().startsWith("montserrat_")
                || texturePrefix.getPath().startsWith("space_grotesk"))) {
            SmoothFontAtlases.add(texture.getTextureView());
        }
        return texture;
    }
}
