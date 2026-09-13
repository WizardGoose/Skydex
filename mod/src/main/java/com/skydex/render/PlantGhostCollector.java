package com.skydex.render;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.OrderedSubmitNodeCollector;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.resources.Identifier;

/** Changes only opacity on the native submitted model; all poses and UVs remain Minecraft's. */
public final class PlantGhostCollector {
    public static final int OPACITY=0x50;
    public static long submittedBlockQuads;
    private PlantGhostCollector() {}

    public static SubmitNodeCollector wrap(SubmitNodeCollector target, Identifier skin, PlantBounds bounds) {
        return (SubmitNodeCollector) proxy(target,skin,bounds,SubmitNodeCollector.class);
    }

    @SuppressWarnings({"unchecked","rawtypes"})
    private static Object proxy(OrderedSubmitNodeCollector target, Identifier skin, PlantBounds bounds, Class<?> api) {
        return Proxy.newProxyInstance(api.getClassLoader(),new Class<?>[]{api},(self,method,args)->{
            if(method.isDefault()) return InvocationHandler.invokeDefault(self,method,args);
            if(method.getName().equals("order")) {
                return proxy(((SubmitNodeCollector)target).order((Integer)args[0]),skin,bounds,OrderedSubmitNodeCollector.class);
            }
            if(method.getName().equals("submitModel") && args.length==10) {
                args[6]=((Integer)args[6]&0xFFFFFF)|(OPACITY<<24);
                if(skin!=null) args[3]=RenderTypes.entityTranslucent(skin);
                var model=(net.minecraft.client.model.Model)args[0];
                model.setupAnim(args[1]);
                model.renderToBuffer((com.mojang.blaze3d.vertex.PoseStack)args[2],bounds,(Integer)args[4],(Integer)args[5],(Integer)args[6]);
            }
            if(method.getName().equals("submitBlockModel")) {
                var pose=(com.mojang.blaze3d.vertex.PoseStack)args[0];
                var parts=(java.util.List<net.minecraft.client.renderer.block.dispatch.BlockStateModelPart>)args[2];
                int[] tints=((int[])args[3]).clone();
                var quads=new java.util.ArrayList<net.minecraft.client.resources.model.geometry.BakedQuad>();
                for(var part:parts) {
                    quads.addAll(part.getQuads(null));
                    for(var direction:net.minecraft.core.Direction.values())quads.addAll(part.getQuads(direction));
                }
                submittedBlockQuads+=quads.size();
                for(var quad:quads) for(int i=0;i<4;i++)bounds.addVertex(pose.last(),quad.position(i));
                int light=(Integer)args[4],overlay=(Integer)args[5];
                var byAtlas=quads.stream().collect(java.util.stream.Collectors.groupingBy(
                        q->q.materialInfo().sprite().atlasLocation()));
                for(var atlas:byAtlas.entrySet())target.submitCustomGeometry(pose,RenderTypes.entityTranslucent(
                        atlas.getKey()),(p,consumer)->{
                    var instance=new com.mojang.blaze3d.vertex.QuadInstance();
                    instance.setLightCoords(light);instance.setOverlayCoords(overlay);
                    for(var quad:atlas.getValue()) {
                        int tint=quad.materialInfo().tintIndex();
                        int color=tint>=0&&tint<tints.length?tints[tint]:0xFFFFFF;
                        instance.setColor((color&0xFFFFFF)|(OPACITY<<24));
                        consumer.putBakedQuad(p,quad,instance);
                    }
                });
                return null;
            }
            try {return method.invoke(target,args);}
            catch(java.lang.reflect.InvocationTargetException e){throw e.getCause();}
        });
    }
}
