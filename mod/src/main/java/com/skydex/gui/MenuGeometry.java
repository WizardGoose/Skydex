package com.skydex.gui;

/** One physical-pixel coordinate system shared by drawing and hit testing. */
public final class MenuGeometry {
    public static final int CORE_WIDTH=760, RAIL_WIDTH=252, HEIGHT=400, WIDTH=1012;
    public record Rect(int x,int y,int w,int h) {
        public boolean contains(double px,double py) {return px>=x&&py>=y&&px<x+w&&py<y+h;}
    }
    public static final Rect SHARE=new Rect(15,61,730,36), ARROW=new Rect(717,8,30,32),
        BOARD=new Rect(15,133,242,242), HELPER=new Rect(290,254,224,36),
        MUTATIONS=new Rect(520,254,225,36),
        DATA=new Rect(290,294,307,40), EXPORT=new Rect(603,294,142,40),
        OPTIONS=new Rect(DATA.x()+(DATA.w()-325)/2,244,325,45), RAIL=new Rect(760,48,252,HEIGHT-48),
        TARGETS=new Rect(290,183,198,62), INPUTS=new Rect(511,183,234,62);
    public static Rect option(int n) { return new Rect(OPTIONS.x()+10+(n%2)*158,OPTIONS.y()+8+(n/2)*31,148,29); }
    public static Rect preset(int n,int scroll) { return new Rect(770,56+n*96-scroll,232,96); }
    public record View(double x,double y,double scale) {
        public double localX(double x) {return (x-this.x)/scale;}
        public double localY(double y) {return (y-this.y)/scale;}
    }
    public static View view(int framebufferWidth,int framebufferHeight) {
        double scale=Math.min(1,Math.min((framebufferWidth-24.0)/WIDTH,(framebufferHeight-24.0)/HEIGHT));
        scale=Math.max(0.1,scale);
        double left=framebufferWidth>1040?(framebufferWidth-CORE_WIDTH*scale)/2:(framebufferWidth-WIDTH*scale)/2;
        left=Math.min(left,framebufferWidth-12-WIDTH*scale);
        return new View(Math.max(12,left),Math.max(12,(framebufferHeight-HEIGHT*scale)/2),scale);
    }
    private MenuGeometry() {}
}
