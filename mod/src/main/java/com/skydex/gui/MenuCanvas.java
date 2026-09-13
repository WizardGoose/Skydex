package com.skydex.gui;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.font.FontRenderContext;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.util.HashMap;
import java.util.Map;

/** Cached offscreen menu artwork. No window, browser, network, or rendering thread. */
public final class MenuCanvas {
    public static final int TEXT=0xffd3dde5, MUTED=0xff8190a2, CYAN=0xff38bdf2, LINE=0xff262d34;
    private static final FontRenderContext METRICS=new FontRenderContext(null,true,true);
    private final Map<String,BufferedImage> images=new HashMap<>();
    private final Font regular=loadFont("montserrat_400.ttf"), medium=loadFont("montserrat_500.ttf"),
        space=loadFont("space_grotesk_400.ttf");
    public record Interaction(String value,int cursor,int selection,int start,boolean focused,
        boolean caret,boolean railOpen,boolean dataOpen,int scroll,int targetScroll,int inputScroll,String hover,String feedback,String error) {}
    private static Font loadFont(String name) {
        try(var stream=MenuCanvas.class.getResourceAsStream("/assets/skydex/font/"+name)) {
            if(stream==null) throw new IllegalStateException("Missing Skydex font: "+name);
            return Font.createFont(Font.TRUETYPE_FONT,stream);
        } catch(Exception e) {throw new IllegalStateException("Unable to load Skydex typography",e);}
    }
    private Font font(float size,boolean strong) {return (strong?medium:regular).deriveFont(size);}
    public double measure(String text) {return font(12,false).getStringBounds(text,METRICS).getWidth();}
    public int visibleStart(String value,int cursor,int start) {
        start=Math.min(cursor,start);
        while(start<cursor&&measure(value.substring(start,cursor))>706) start=value.offsetByCodePoints(start,1);
        while(start>0) {int before=value.offsetByCodePoints(start,-1);if(measure(value.substring(before,cursor))>706)break;start=before;}
        return start;
    }
    public int positionAt(String value,int start,double x) {
        int previous=start;
        for(int end=start;end<value.length();) {
            end=value.offsetByCodePoints(end,1);
            if(measure(value.substring(start,end))>x) {
                double a=measure(value.substring(start,previous)),b=measure(value.substring(start,end));
                return x<(a+b)/2?previous:end;
            }
            previous=end;
        }
        return value.length();
    }
    private BufferedImage image(String path) {
        return images.computeIfAbsent(path,key->{
            try(var stream=MenuCanvas.class.getResourceAsStream("/assets/skydex/"+key)) {
                return stream==null?new BufferedImage(1,1,BufferedImage.TYPE_INT_ARGB):ImageIO.read(stream);
            } catch(Exception e) {throw new IllegalStateException("Unable to read UI asset "+key,e);}
        });
    }
    private void art(Graphics2D g,String path,double x,double y,double w,double h,boolean smooth) {
        var img=image(path);
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION,smooth?RenderingHints.VALUE_INTERPOLATION_BICUBIC:RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR);
        var tx=new AffineTransform();tx.translate(x,y);tx.scale(w/img.getWidth(),h/img.getHeight());
        g.drawImage(img,tx,null);
    }
    private void crop(Graphics2D g,JsonObject item,double x,double y,double size) {
        if(!item.has("crop")||item.get("crop").isJsonNull()) {text(g,"?",x,y+size/2,12,false,MUTED);return;}
        String id=item.get("crop").getAsString();
        if(!id.matches("[a-z0-9_]+"))return;
        art(g,"greenhouse/crops/"+id+".png",x,y,size,size,false);
    }
    private static void fill(Graphics2D g,double x,double y,double w,double h,int color) {
        g.setColor(new Color(color,true));g.fill(new Rectangle2D.Double(x,y,w,h));
    }
    private static void box(Graphics2D g,MenuGeometry.Rect r,int bg,int border,int radius) {
        g.setColor(new Color(bg,true));g.fill(new RoundRectangle2D.Double(r.x(),r.y(),r.w(),r.h(),radius*2,radius*2));
        g.setColor(new Color(border,true));g.setStroke(new BasicStroke(1));
        g.draw(new RoundRectangle2D.Double(r.x()+.5,r.y()+.5,r.w()-1,r.h()-1,radius*2,radius*2));
    }
    private static void frame(Graphics2D g,int x,int width) {
        var outline=new RoundRectangle2D.Double(x+.5,.5,width-1,MenuGeometry.HEIGHT-1,12,12);
        g.setColor(new Color(0xff0a0e12,true));g.fill(outline);
        var header=new Area(outline);header.intersect(new Area(new Rectangle2D.Double(x,0,width,47)));
        g.setColor(new Color(0xff070a0d,true));g.fill(header);
        fill(g,x+1,47,width-2,1,LINE);
        g.setColor(new Color(0xff30353b,true));g.setStroke(new BasicStroke(1));g.draw(outline);
    }
    private void text(Graphics2D g,String value,double x,double centerY,float size,boolean strong,int color) {
        g.setFont(font(size,strong));g.setColor(new Color(color,true));
        var m=g.getFont().getLineMetrics(value.isEmpty()?"Ag":value,METRICS);
        g.drawString(value,(float)x,(float)(centerY+(m.getAscent()-m.getDescent())/2));
    }
    private void label(Graphics2D g,String value,double x,double y,double width,float size,boolean strong,int color) {
        Font f=font(size,strong);
        if(f.getStringBounds(value,METRICS).getWidth()>width) {
            int end=value.length();while(end>0&&f.getStringBounds(value.substring(0,end)+"…",METRICS).getWidth()>width)end=value.offsetByCodePoints(end,-1);
            value=value.substring(0,end)+"…";
        }
        text(g,value,x,y,size,strong,color);
    }
    private void right(Graphics2D g,String value,double right,double y,float size,int color) {
        text(g,value,right-font(size,false).getStringBounds(value,METRICS).getWidth(),y,size,false,color);
    }
    private static String string(JsonObject o,String key) {return o.has(key)&&!o.get(key).isJsonNull()?o.get(key).getAsString():"";}
    private void checkbox(Graphics2D g,int x,int y,boolean selected) {
        box(g,new MenuGeometry.Rect(x,y,15,15),selected?CYAN:0xff121820,selected?0xff72d5ff:0xff53606e,2);
        if(selected) {g.setColor(new Color(0xff063f53,true));g.setStroke(new BasicStroke(1.8f,BasicStroke.CAP_ROUND,BasicStroke.JOIN_ROUND));
            var path=new Path2D.Double();path.moveTo(x+3,y+7);path.lineTo(x+6,y+10);path.lineTo(x+12,y+4);g.draw(path);}
    }
    private void board(Graphics2D g,JsonObject layout,int x,int y,int size) {
        box(g,new MenuGeometry.Rect(x,y,size,size),0xff05080c,LINE,0);
        double gap=size>=200?2:1,inset=size>=200?5:4,cell=(size-2*inset-9*gap)/10;
        Map<Integer,JsonObject> placements=new HashMap<>();
        for(var value:layout.getAsJsonArray("placements")) {var p=value.getAsJsonObject();placements.put(p.get("index").getAsInt(),p);}
        for(int i=0;i<100;i++) {
            double cx=x+inset+(i%10)*(cell+gap),cy=y+inset+(i/10)*(cell+gap);
            fill(g,cx,cy,cell,cell,0xff121820);
            JsonObject p=placements.get(i);
            int border=LINE;
            if(p!=null) {
                art(g,"greenhouse/ground/farmland.png",cx,cy,cell,cell,false);
                fill(g,cx,cy,cell,cell,0x30030609);
                crop(g,p,cx+1,cy+1,Math.max(1,cell-2));
                border=switch(string(p,"state")) {case "correct"->0xff43d17a;case "next"->CYAN;case "mutation"->0xfff4b63f;case "replace"->0xffff5d68;default->LINE;};
            }
            g.setColor(new Color(border,true));g.setStroke(new BasicStroke(1));g.draw(new Rectangle2D.Double(cx+.5,cy+.5,cell-1,cell-1));
        }
    }
    public int itemHeight(JsonArray items,int width) {
        double px=0;int height=27;
        for(var value:items){double w=33+font(12,true).getStringBounds(string(value.getAsJsonObject(),"name"),METRICS).getWidth();
            if(px>0&&px+w>width){px=0;height+=35;}px+=Math.min(w,width)+11;}
        return height;
    }
    private void items(Graphics2D g,JsonArray items,int x,int y,int width,int height,int scroll) {
        Shape clip=g.getClip();g.clip(new Rectangle(x,y,width,height));
        double px=x,py=y-scroll;
        for(var value:items) {
            var item=value.getAsJsonObject();String name=string(item,"name");
            double w=33+font(12,true).getStringBounds(name,METRICS).getWidth();
            if(px>x&&px+w>x+width){px=x;py+=35;}
            crop(g,item,px,py,27);
            label(g,name,px+33,py+8,width-(px-x)-33,12,true,TEXT);
            text(g,"×"+string(item,"qty"),px+33,py+23,11,false,MUTED);
            px+=Math.min(w,width)+11;
        }
        g.setClip(clip);
    }
    public BufferedImage render(JsonObject state,Interaction ui,double scale) {
        var canvas=new BufferedImage((int)Math.ceil(MenuGeometry.WIDTH*scale),(int)Math.ceil(MenuGeometry.HEIGHT*scale),BufferedImage.TYPE_INT_ARGB);
        var g=canvas.createGraphics();g.scale(scale,scale);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING,RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING,RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS,RenderingHints.VALUE_FRACTIONALMETRICS_ON);
        frame(g,0,MenuGeometry.CORE_WIDTH);
        art(g,"gui/skydex_wordmark.png",18,12,132,25,true);
        fill(g,160,14,1,19,0xff30363c);text(g,string(state,"version"),171,24,11,false,MUTED);
        String connection=string(state,"connection").toUpperCase(java.util.Locale.ROOT);
        double connectionX=690-Math.min(220,font(10,false).getStringBounds(connection,METRICS).getWidth());
        label(g,connection,connectionX,24,220,10,false,MUTED);
        g.setColor(new Color(state.get("connected").getAsBoolean()?CYAN:MUTED,true));g.fill(new Ellipse2D.Double(connectionX-10,21,5,5));
        g.setColor(new Color(ui.hover().equals("arrow")?0xffa3e7ff:CYAN,true));g.setStroke(new BasicStroke(1.8f,BasicStroke.CAP_ROUND,BasicStroke.JOIN_ROUND));
        var arrow=new Path2D.Double();double center=732,dir=ui.railOpen()?-1:1;arrow.moveTo(center-dir*3,16);arrow.lineTo(center+dir*3,24);arrow.lineTo(center-dir*3,32);g.draw(arrow);
        box(g,MenuGeometry.SHARE,0xff060a0d,ui.error()!=null?0xffff5d68:ui.focused()?CYAN:LINE,4);
        drawInput(g,ui);
        var layout=state.getAsJsonObject("layout");
        text(g,"PLOT",15,107,10,false,MUTED);label(g,string(layout,"name"),15,121,185,14,true,TEXT);
        right(g,string(layout,"progress"),257,121,11,MUTED);
        var boardRect=MenuGeometry.BOARD;board(g,layout,boardRect.x(),boardRect.y(),boardRect.w());
        String[] legends={"Right","Place","Mutation","Replace"};int[] colors={0xff43d17a,CYAN,0xfff4b63f,0xffff5d68};int lx=15;
        for(int i=0;i<4;i++){box(g,new MenuGeometry.Rect(lx,383,6,6),0xff0a0e12,colors[i],0);text(g,legends[i],lx+10,386,9,false,MUTED);lx+=i==2?69:49;}
        fill(g,274,106,1,280,LINE);
        text(g,"CURRENT PLOT",290,112,10,false,MUTED);label(g,string(layout,"goal"),290,130,455,17,true,0xffeef7fb);
        if(state.get("hasLayout").getAsBoolean())text(g,string(layout,"cells")+" cells · saved on this device",290,149,11,false,MUTED);
        fill(g,290,157,455,1,LINE);fill(g,290,249,455,1,LINE);fill(g,499,158,1,91,LINE);
        text(g,string(layout,"targetLabel").toUpperCase(java.util.Locale.ROOT),290,172,10,false,MUTED);
        text(g,"INPUT CROPS",511,172,10,false,MUTED);
        right(g,""+total(layout.getAsJsonArray("targets")),490,172,10,MUTED);right(g,""+total(layout.getAsJsonArray("inputs")),740,172,10,MUTED);
        items(g,layout.getAsJsonArray("targets"),290,183,198,62,ui.targetScroll());items(g,layout.getAsJsonArray("inputs"),511,183,234,62,ui.inputScroll());
        box(g,MenuGeometry.HELPER,ui.hover().equals("helper")?0xff17212a:0xff10151b,LINE,4);
        checkbox(g,300,264,state.get("helper").getAsBoolean());text(g,"Placement helper",324,272,12,true,state.get("hasLayout").getAsBoolean()?TEXT:MUTED);
        box(g,MenuGeometry.MUTATIONS,ui.hover().equals("mutations")?0xff17212a:0xff10151b,LINE,4);
        checkbox(g,530,264,!state.has("showMutations")||state.get("showMutations").getAsBoolean());text(g,"Show mutations",554,272,12,true,TEXT);
        box(g,MenuGeometry.DATA,0xff151a20,ui.hover().equals("data")?CYAN:LINE,4);text(g,"Included data",300,314,12,true,TEXT);
        long selected=java.util.stream.StreamSupport.stream(state.getAsJsonArray("sections").spliterator(),false).filter(v->v.getAsJsonObject().get("enabled").getAsBoolean()).count();
        right(g,selected+" selected",586,314,11,0xff8dddf7);
        box(g,MenuGeometry.EXPORT,0xff151a20,ui.hover().equals("export")?CYAN:LINE,4);
        String copy=ui.feedback()==null?"Copy export code":ui.feedback();double cw=font(12,true).getStringBounds(copy,METRICS).getWidth();text(g,copy,674-cw/2,314,12,true,TEXT);
        if(layout.has("replacement")) {
            var r=layout.getAsJsonObject("replacement");fill(g,290,338,455,32,0xff191019);fill(g,290,338,2,32,0xffff5d68);
            text(g,"REPLACE",300,354,9,true,0xffff9da4);crop(g,r.getAsJsonObject("from"),350,343,21);
            String from=string(r.getAsJsonObject("from"),"name");label(g,from,378,354,130,11,true,TEXT);
            double next=385+Math.min(130,font(11,true).getStringBounds(from,METRICS).getWidth());
            g.setColor(new Color(MUTED,true));g.setStroke(new BasicStroke(1.2f,BasicStroke.CAP_ROUND,BasicStroke.JOIN_ROUND));
            Path2D replacementArrow=new Path2D.Double();replacementArrow.moveTo(next,354);replacementArrow.lineTo(next+9,354);replacementArrow.moveTo(next+6,351);replacementArrow.lineTo(next+9,354);replacementArrow.lineTo(next+6,357);g.draw(replacementArrow);
            crop(g,r.getAsJsonObject("to"),next+18,343,21);label(g,string(r.getAsJsonObject("to"),"name"),next+45,354,745-next-50,11,true,TEXT);
        }
        drawRail(g,state,ui);
        if(ui.dataOpen()) {
            box(g,MenuGeometry.OPTIONS,0xff03080d,0xff3d5163,4);
            int n=0;for(var v:state.getAsJsonArray("sections")){var section=v.getAsJsonObject();var rect=MenuGeometry.option(n++);
                checkbox(g,rect.x(),rect.y()+7,section.get("enabled").getAsBoolean());label(g,string(section,"label"),rect.x()+21,rect.y()+14.5,127,12,true,TEXT);}
        }
        g.dispose();return canvas;
    }
    private static int total(JsonArray items) {int n=0;for(var v:items)n+=v.getAsJsonObject().get("qty").getAsInt();return n;}
    private void drawInput(Graphics2D g,Interaction ui) {
        Shape clip=g.getClip();g.clip(new Rectangle(26,63,706,32));
        String value=ui.value();int start=Math.min(ui.start(),value.length());
        if(value.isEmpty())text(g,"Paste a Skydex Greenhouse share code or link",26,79,12,false,0xff68778b);
        else {
            int a=Math.max(start,Math.min(ui.cursor(),ui.selection())),b=Math.max(start,Math.max(ui.cursor(),ui.selection()));
            if(ui.focused()&&a!=b)fill(g,26+measure(value.substring(start,a)),68,measure(value.substring(a,b)),22,0xff245b77);
            text(g,value.substring(start),26,79,12,false,TEXT);
        }
        if(ui.focused()&&ui.caret()){double x=26+measure(value.substring(start,Math.max(start,ui.cursor())));fill(g,x,69,1,20,TEXT);}
        g.setClip(clip);
    }
    private void drawRail(Graphics2D g,JsonObject state,Interaction ui) {
        frame(g,MenuGeometry.CORE_WIDTH,MenuGeometry.RAIL_WIDTH);
        text(g,"Loadouts",775,24,13,true,TEXT);right(g,state.getAsJsonArray("loadouts").size()+" saved",997,24,11,0xff8dddf7);
        Shape clip=g.getClip();g.clip(new Rectangle(761,49,250,MenuGeometry.HEIGHT-51));int n=0;
        for(var value:state.getAsJsonArray("loadouts")) {
            var saved=value.getAsJsonObject();var r=MenuGeometry.preset(n++,ui.scroll());
            if(r.y()+r.h()<49||r.y()>MenuGeometry.HEIGHT)continue;
            boolean selected=string(saved,"id").equals(string(state.getAsJsonObject("layout"),"id"));
            if(selected||ui.hover().equals("preset:"+string(saved,"id")))fill(g,r.x(),r.y(),r.w(),r.h(),0xff101c25);
            if(selected)fill(g,r.x(),r.y(),2,r.h(),CYAN);
            board(g,saved,r.x()+6,r.y()+16,64);label(g,string(saved,"name"),r.x()+84,r.y()+40,143,12,true,TEXT);
            label(g,string(saved,"goal").replaceFirst("^(Grow|Plant) ",""),r.x()+84,r.y()+60,143,12,false,MUTED);
            fill(g,r.x(),r.y()+r.h()-1,r.w(),1,LINE);
        }g.setClip(clip);
    }
}
