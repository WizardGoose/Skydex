package com.skydex.gui;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class MenuCanvasTest {
    @Test void longInputUsesTheSameMetricsForCursorAndClick() {
        var canvas=new MenuCanvas();String value="https://skydex.ca/greenhouse/share/"+"WheatPotato".repeat(100);
        int start=canvas.visibleStart(value,value.length(),0);
        assertTrue(start>0);assertTrue(canvas.measure(value.substring(start))<=706);
        for(int n=start;n<value.length();n++)assertEquals(n,canvas.positionAt(value,start,canvas.measure(value.substring(start,n))));
        assertEquals(0,canvas.visibleStart(value,0,start));
    }
    @Test void viewCoordinatesRoundTripAndKeepDrawerOnscreen() {
        for(int width:new int[]{854,1280,1920,2560}) {
            var view=MenuGeometry.view(width,1080);
            assertEquals(732,view.localX(view.x()+732*view.scale()),.0001);
            assertTrue(view.x()+1012*view.scale()<=width);
            assertTrue(view.y()+MenuGeometry.HEIGHT*view.scale()<=1080);
        }
    }
    @Test void overflowingCropListsExposeTheirScrollableHeight() {
        var canvas=new MenuCanvas();var items=new com.google.gson.JsonArray();
        for(int i=0;i<6;i++){var item=new com.google.gson.JsonObject();item.addProperty("name","Long crop name "+i);items.add(item);}
        assertTrue(canvas.itemHeight(items,198)>62);
    }
}
