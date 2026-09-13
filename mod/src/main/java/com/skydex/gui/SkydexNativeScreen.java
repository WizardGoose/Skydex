package com.skydex.gui;

import com.google.gson.JsonObject;
import com.mojang.blaze3d.platform.NativeImage;
import com.skydex.SkydexMod;
import com.skydex.SkydexTheme;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import org.lwjgl.glfw.GLFW;
import java.awt.image.DataBufferInt;
import java.util.ArrayList;

/** Minecraft input and two cached texture slices. Drawer motion never rerasterizes text. */
public final class SkydexNativeScreen extends Screen {
    private static MenuCanvas sharedCanvas;
    private final MenuController controller;
    private MenuCanvas canvas;
    private JsonObject state;
    private TextInput input;
    private DynamicTexture texture;
    private final Identifier textureId=Identifier.fromNamespaceAndPath("skydex","menu/"+java.util.UUID.randomUUID());
    private MenuCanvas.Interaction lastPaint;
    private double paintedScale;
    private boolean railOpen,dataOpen,removed,dirty=true;
    private int scroll,targetScroll,inputScroll,start,ticks;
    private String hover="",keyboardFocus="",feedback,error;
    private long changedAt,feedbackUntil,animationAt;
    private double animationFrom;
    public int rasterizations;
    public long firstPaintNanos;
    public SkydexNativeScreen(SkydexMod mod) {super(Component.literal("Skydex"));controller=new MenuController(mod);}
    @Override protected void init() {
        removed=false;
        if(sharedCanvas==null)sharedCanvas=new MenuCanvas();canvas=sharedCanvas;
        if(input==null) {
            input=new TextInput();input.setMaxLength(16384);input.setBordered(false);
            input.setResponder(value->{changedAt=System.nanoTime();error=null;dirty=true;});
        }
        addWidget(input);refresh();dirty=true;
    }
    private void refresh() {var next=controller.snapshot();if(!next.equals(state)){
        if(state!=null&&!next.getAsJsonObject("layout").equals(state.getAsJsonObject("layout"))){targetScroll=0;inputScroll=0;}
        state=next;dirty=true;}}
    @Override public void tick() {
        if(++ticks%5==0)refresh();
        if(changedAt!=0&&System.nanoTime()-changedAt>=300_000_000L) {
            changedAt=0;if(!input.getValue().isBlank()) {
                try {controller.importCode(input.getValue());error=null;}catch(RuntimeException e){error=e.getMessage();}
                refresh();dirty=true;
            }
        }
        if(feedback!=null&&System.nanoTime()>feedbackUntil){feedback=null;dirty=true;}
    }
    private MenuGeometry.View view() {return MenuGeometry.view(minecraft.getWindow().getWidth(),minecraft.getWindow().getHeight());}
    private double guiScale() {return minecraft.getWindow().getWidth()/(double)width;}
    private double railProgress() {
        double t=Math.min(1,(System.nanoTime()-animationAt)/220_000_000.0),ease=1-Math.pow(1-t,3);
        return animationFrom+((railOpen?1:0)-animationFrom)*ease;
    }
    @Override public void extractBackground(GuiGraphicsExtractor g,int x,int y,float dt) {
        if(minecraft.options.getMenuBackgroundBlurriness()>=1)g.blurBeforeThisStratum();
        g.fill(0,0,width,height,SkydexTheme.SCRIM);
    }
    @Override public void extractRenderState(GuiGraphicsExtractor g,int mouseX,int mouseY,float dt) {
        long begin=System.nanoTime();var v=view();double gs=guiScale();
        String nextHover=hit(v.localX(mouseX*gs),v.localY(mouseY*gs));
        if(!nextHover.equals(hover)){hover=nextHover;dirty=true;}
        start=canvas.visibleStart(input.getValue(),input.getCursorPosition(),start);
        var ui=new MenuCanvas.Interaction(input.getValue(),input.getCursorPosition(),input.selection,start,input.isFocused(),
            !input.isFocused()||System.nanoTime()/500_000_000L%2==0,railOpen,dataOpen,scroll,targetScroll,inputScroll,hover.isEmpty()?keyboardFocus:hover,feedback,error);
        if(dirty||!ui.equals(lastPaint)||paintedScale!=v.scale()) {
            var image=canvas.render(state,ui,v.scale());
            if(texture==null||texture.getPixels().getWidth()!=image.getWidth()||texture.getPixels().getHeight()!=image.getHeight()) {
                if(texture!=null)minecraft.getTextureManager().release(textureId);
                texture=new DynamicTexture(()->"Skydex menu",new NativeImage(image.getWidth(),image.getHeight(),false));
                minecraft.getTextureManager().register(textureId,texture);
            }
            int[] argb=((DataBufferInt)image.getRaster().getDataBuffer()).getData();
            var pixels=texture.getPixels();
            for(int y=0,index=0;y<image.getHeight();y++)for(int x=0;x<image.getWidth();x++)pixels.setPixel(x,y,argb[index++]);
            texture.upload();rasterizations++;lastPaint=ui;paintedScale=v.scale();dirty=false;
            if(firstPaintNanos==0)firstPaintNanos=System.nanoTime()-begin;
        }
        g.pose().pushMatrix();
        g.pose().translate((float)(v.x()/gs),(float)(v.y()/gs));g.pose().scale((float)(1/gs));
        int cw=(int)Math.round(MenuGeometry.CORE_WIDTH*v.scale()),rh=(int)Math.round(MenuGeometry.HEIGHT*v.scale()),rw=(int)Math.round(MenuGeometry.RAIL_WIDTH*v.scale());
        double progress=railProgress();
        if(progress>0) {
            g.enableScissor(cw,0,(int)Math.ceil(cw+rw*progress),rh);
            int left=cw-(int)Math.round(rw*(1-progress));
            g.blit(textureId,left,0,left+rw,rh,760f/1012,1,0,1);g.disableScissor();
        }
        g.blit(textureId,0,0,cw,rh,0,760f/1012,0,1);g.pose().popMatrix();
    }
    private String hit(double x,double y) {
        if(dataOpen&&MenuGeometry.OPTIONS.contains(x,y)) {
            int n=0;for(var item:state.getAsJsonArray("sections")){if(MenuGeometry.option(n++).contains(x,y))return "section:"+item.getAsJsonObject().get("id").getAsString();}
            return "options";
        }
        if(MenuGeometry.ARROW.contains(x,y))return "arrow";
        if(MenuGeometry.SHARE.contains(x,y))return "share";
        if(MenuGeometry.HELPER.contains(x,y))return "helper";
        if(MenuGeometry.MUTATIONS.contains(x,y))return "mutations";
        if(MenuGeometry.DATA.contains(x,y))return "data";
        if(MenuGeometry.EXPORT.contains(x,y))return "export";
        if(railOpen&&railProgress()>.98&&MenuGeometry.RAIL.contains(x,y)) {
            int n=0;for(var item:state.getAsJsonArray("loadouts")){if(MenuGeometry.preset(n++,scroll).contains(x,y))return "preset:"+item.getAsJsonObject().get("id").getAsString();}
        }return "";
    }
    private void activate(String target) {
        switch(target) {
            case "arrow"->{animationFrom=railProgress();animationAt=System.nanoTime();railOpen=!railOpen;}
            case "data"->dataOpen=!dataOpen;
            case "helper"->controller.toggleHelper();
            case "mutations"->controller.toggleMutations();
            case "export"->{feedback=controller.exportCode();feedbackUntil=System.nanoTime()+1_200_000_000L;}
            default->{if(target.startsWith("preset:"))controller.select(target.substring(7));else if(target.startsWith("section:"))controller.toggleSection(target.substring(8));}
        }refresh();dirty=true;
    }
    @Override public boolean mouseClicked(MouseButtonEvent event,boolean doubleClick) {
        if(event.button()!=0)return false;var v=view();double x=v.localX(event.x()*guiScale()),y=v.localY(event.y()*guiScale());
        String target=hit(x,y);keyboardFocus="";
        input.setFocused(target.equals("share"));setFocused(input.isFocused()?input:null);
        if(input.isFocused()) {
            int pos=canvas.positionAt(input.getValue(),start,x-26);input.moveCursorTo(pos,(event.modifiers()&GLFW.GLFW_MOD_SHIFT)!=0);
            if(doubleClick){input.moveCursorToStart(false);input.moveCursorToEnd(true);}
            dirty=true;return true;
        }
        if(dataOpen&&!target.equals("data")&&!target.startsWith("section:")&&!target.equals("options"))dataOpen=false;
        activate(target);return !target.isEmpty();
    }
    @Override public boolean mouseDragged(MouseButtonEvent event,double dx,double dy) {
        if(input.isFocused()&&event.button()==0){var v=view();input.moveCursorTo(canvas.positionAt(input.getValue(),start,v.localX(event.x()*guiScale())-26),true);dirty=true;return true;}
        return false;
    }
    @Override public boolean mouseScrolled(double x,double y,double horizontal,double vertical) {
        var v=view();double localX=v.localX(x*guiScale()),localY=v.localY(y*guiScale());
        if(!dataOpen&&(MenuGeometry.TARGETS.contains(localX,localY)||MenuGeometry.INPUTS.contains(localX,localY))) {
            boolean target=MenuGeometry.TARGETS.contains(localX,localY);int maximum=Math.max(0,canvas.itemHeight(state.getAsJsonObject("layout").getAsJsonArray(target?"targets":"inputs"),target?198:234)-62);
            int next=Math.max(0,Math.min(maximum,(target?targetScroll:inputScroll)-(int)(vertical*24)));
            if(target)targetScroll=next;else inputScroll=next;dirty=true;return true;
        }
        if(railOpen&&MenuGeometry.RAIL.contains(localX,localY)) {
            scroll=Math.max(0,Math.min(Math.max(0,state.getAsJsonArray("loadouts").size()*96-(MenuGeometry.HEIGHT-60)),scroll-(int)(vertical*32)));dirty=true;return true;
        }return false;
    }
    @Override public boolean keyPressed(KeyEvent event) {
        if(event.key()==GLFW.GLFW_KEY_ESCAPE){onClose();return true;}
        if(event.key()==GLFW.GLFW_KEY_TAB) {
            var order=new ArrayList<String>();order.add("share");order.add("arrow");order.add("helper");order.add("mutations");order.add("data");order.add("export");
            if(dataOpen)for(var item:state.getAsJsonArray("sections"))order.add("section:"+item.getAsJsonObject().get("id").getAsString());
            if(railOpen)for(var item:state.getAsJsonArray("loadouts"))order.add("preset:"+item.getAsJsonObject().get("id").getAsString());
            int n=order.indexOf(input.isFocused()?"share":keyboardFocus),step=(event.modifiers()&GLFW.GLFW_MOD_SHIFT)!=0?-1:1;
            keyboardFocus=order.get(Math.floorMod(n+step,order.size()));input.setFocused(keyboardFocus.equals("share"));setFocused(input.isFocused()?input:null);dirty=true;return true;
        }
        if(!input.isFocused()&&(event.key()==GLFW.GLFW_KEY_ENTER||event.key()==GLFW.GLFW_KEY_SPACE)){activate(keyboardFocus);return true;}
        return super.keyPressed(event);
    }
    @Override public void removed() {removed=true;if(texture!=null){minecraft.getTextureManager().release(textureId);texture=null;}lastPaint=null;dirty=true;super.removed();}
    @Override public boolean isPauseScreen(){return false;}
    private final class TextInput extends EditBox {
        private int selection;
        TextInput(){super(minecraft.font,0,0,730,36,Component.literal("Greenhouse share code"));}
        @Override public void setHighlightPos(int position){super.setHighlightPos(position);selection=position;}
        @Override public void extractWidgetRenderState(GuiGraphicsExtractor g,int x,int y,float dt){}
    }
}
