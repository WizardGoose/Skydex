package com.skydex.render;

import com.mojang.blaze3d.vertex.VertexConsumer;
import net.minecraft.world.phys.AABB;

/** Bounds of the submitted visible mesh, including native head poses and stems. */
public final class PlantBounds implements VertexConsumer {
    private float minX=Float.POSITIVE_INFINITY,minY=minX,minZ=minX;
    private float maxX=Float.NEGATIVE_INFINITY,maxY=maxX,maxZ=maxX;
    public AABB box() {return minX>maxX?null:new AABB(minX,minY,minZ,maxX,maxY,maxZ).inflate(.025);}
    public void outline(net.minecraft.client.renderer.SubmitNodeCollector collector,int color) {
        var box=box();if(box==null)return;
        collector.submitCustomGeometry(new com.mojang.blaze3d.vertex.PoseStack(),
                net.minecraft.client.renderer.rendertype.RenderTypes.linesTranslucent(),(pose,consumer)->{
            for(int i=0;i<4;i++) {
                double x=(i&1)==0?box.minX:box.maxX, y=(i&1)==0?box.minY:box.maxY;
                double z=(i&2)==0?box.minZ:box.maxZ, y2=(i&2)==0?box.minY:box.maxY;
                edge(consumer,box.minX,y,z,box.maxX,y,z,1,0,0,color);
                edge(consumer,x,box.minY,z,x,box.maxY,z,0,1,0,color);
                edge(consumer,x,y2,box.minZ,x,y2,box.maxZ,0,0,1,color);
            }
        });
    }
    private static void edge(VertexConsumer c,double x,double y,double z,double ex,double ey,double ez,
                             float nx,float ny,float nz,int color) {
        c.addVertex((float)x,(float)y,(float)z).setColor(color).setNormal(nx,ny,nz).setLineWidth(1.5f);
        c.addVertex((float)ex,(float)ey,(float)ez).setColor(color).setNormal(nx,ny,nz).setLineWidth(1.5f);
    }
    @Override public VertexConsumer addVertex(float x,float y,float z) {
        minX=Math.min(minX,x);minY=Math.min(minY,y);minZ=Math.min(minZ,z);
        maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);maxZ=Math.max(maxZ,z);return this;
    }
    @Override public VertexConsumer setColor(int r,int g,int b,int a){return this;}
    @Override public VertexConsumer setColor(int color){return this;}
    @Override public VertexConsumer setUv(float u,float v){return this;}
    @Override public VertexConsumer setUv1(int u,int v){return this;}
    @Override public VertexConsumer setUv2(int u,int v){return this;}
    @Override public VertexConsumer setNormal(float x,float y,float z){return this;}
    @Override public VertexConsumer setLineWidth(float width){return this;}
}
