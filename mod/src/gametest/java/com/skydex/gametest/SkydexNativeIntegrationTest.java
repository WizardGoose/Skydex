package com.skydex.gametest;

import com.skydex.SkydexMod;
import com.skydex.gui.SkydexNativeScreen;
import com.skydex.gui.MenuGeometry;
import com.skydex.export.ExportSection;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotOptions;
import net.fabricmc.loader.api.FabricLoader;
import org.lwjgl.glfw.GLFW;
import java.nio.file.Path;
import java.util.concurrent.locks.LockSupport;
import java.util.function.BooleanSupplier;

public final class SkydexNativeIntegrationTest implements FabricClientGameTest {
    private static final String LINK="https://skydex.ca/greenhouse/share/KzOqMVI1MgjOT0-vrDHRya4xNKnRIx4kOSZisIgCAA";
    @Override public void runTest(ClientGameTestContext ctx) {
        check(!FabricLoader.getInstance().isModLoaded("grapheneui"),"No browser framework loaded");
        var mod=FabricLoader.getInstance().getEntrypoints("client",ClientModInitializer.class).stream().filter(SkydexMod.class::isInstance).map(SkydexMod.class::cast).findFirst().orElseThrow();
        if (Boolean.getBoolean("skydex.test.migration")) {
            var root = FabricLoader.getInstance().getConfigDir();
            check(!java.nio.file.Files.exists(root.resolve("skyindex")), "Retired data directory migrated at startup");
            check(mod.config().siteUrl.equals("https://migration-fixture.invalid"), "Existing settings loaded after conversion");
            try {
                check(java.nio.file.Files.readString(root.resolve("skydex/plant-models/migration-fixture.txt"))
                        .equals("synthetic saved plant"), "Saved plant archive preserved");
                check(java.nio.file.Files.exists(root.resolve("skydex/migration-notice.txt")), "Migration confirmation awaits player");
            } catch (java.io.IOException e) { throw new AssertionError(e); }
            System.out.println("SKYDEX_STARTUP_MIGRATION_PASS");
        }
        ctx.getInput().resizeWindow(1920,1080);
        ctx.setScreen(net.minecraft.client.gui.screens.TitleScreen::new);
        var notice = ctx.computeOnClient(client -> {
            try { return com.skydex.gui.MigrationNotice.show(client); }
            catch (ReflectiveOperationException e) { throw new AssertionError(e); }
        });
        settle(ctx);
        settle(ctx);
        capture(ctx, "migration-notice");
        ctx.runOnClient(client -> notice.forceHide());
        ctx.runOnClient(client->{client.options.guiScale().set(2);client.resizeGui();
            try{var m=SkydexGuiVisualTest.class.getDeclaredMethod("loadFixture",SkydexMod.class);m.setAccessible(true);m.invoke(null,mod);}catch(Exception e){throw new AssertionError(e);}
        });
        var original=mod.layouts().layout();
        var screen=ctx.computeOnClient(client->new SkydexNativeScreen(mod));
        long open=System.nanoTime();ctx.setScreen(()->screen);
        await(ctx,()->screen.rasterizations>0,10,"First native paint");
        System.out.println("SKYDEX_NATIVE_OPEN_MS="+(System.nanoTime()-open)/1_000_000+" PAINT_MS="+screen.firstPaintNanos/1_000_000);
        capture(ctx,"native-loaded");
        int renders=screen.rasterizations;settle(ctx);check(screen.rasterizations==renders,"Idle menu does not repaint/upload");
        click(ctx,MenuGeometry.ARROW);check((boolean)field(screen,"railOpen"),"Drawer opens");
        click(ctx,MenuGeometry.BOARD);check((boolean)field(screen,"railOpen"),"Click-away preserves drawer");
        capture(ctx,"native-open");
        click(ctx,MenuGeometry.SHARE);ctx.getInput().typeChars(LINK);
        await(ctx,()->mod.layouts().layout()!=original,5,"Auto-import reaches mod");
        int index=new java.util.ArrayList<>(mod.layouts().savedLayouts().keySet()).indexOf(com.skydex.layout.LayoutStore.savedId(original));
        click(ctx,MenuGeometry.preset(index,0));check(mod.layouts().label().equals(original.label()),"Preset selection reaches mod");
        boolean helper=mod.placementHelperEnabled();click(ctx,MenuGeometry.HELPER);check(mod.placementHelperEnabled()!=helper,"Helper checkbox reaches mod");
        boolean mutations=mod.layouts().showMutations();
        click(ctx,MenuGeometry.MUTATIONS);check(mod.layouts().showMutations()!=mutations,"Mutation checkbox reaches mod");
        check(com.skydex.layout.LayoutStore.load(mod.layouts().file()).showMutations()!=mutations,"Mutation visibility persists");
        capture(ctx,"native-mutations-off");
        click(ctx,MenuGeometry.MUTATIONS);check(mod.layouts().showMutations()==mutations,"Mutation checkbox restores view");
        click(ctx,MenuGeometry.DATA);boolean enabled=mod.config().isExportSectionEnabled(ExportSection.ISLAND_CHESTS);
        click(ctx,MenuGeometry.option(0));check(mod.config().isExportSectionEnabled(ExportSection.ISLAND_CHESTS)!=enabled,"Included data persists");capture(ctx,"native-data");
        click(ctx,MenuGeometry.DATA);ctx.runOnClient(client->client.keyboardHandler.setClipboard("before-export"));click(ctx,MenuGeometry.EXPORT);
        check(ctx.computeOnClient(client->!client.keyboardHandler.getClipboard().equals("before-export")),"Native clipboard export");
        click(ctx,MenuGeometry.SHARE);ctx.getInput().holdControl();ctx.getInput().pressKey(GLFW.GLFW_KEY_A);ctx.getInput().releaseControl();
        String longInput="https://skydex.ca/greenhouse/share/"+"LongInput".repeat(60);ctx.getInput().typeChars(longInput);settle(ctx);capture(ctx,"native-long-input");
        ctx.getInput().pressKey(GLFW.GLFW_KEY_ESCAPE);check((boolean)field(screen,"removed"),"Escape closes all menus from input");
        for(int scale:new int[]{1,3}) {
            ctx.runOnClient(client->{client.options.guiScale().set(scale);client.resizeGui();});
            ctx.setScreen(()->screen);await(ctx,()->!(boolean)field(screen,"removed"),5,"Reopen");
            // Preserve open rail state and test its fixed hit geometry after resizing.
            click(ctx,MenuGeometry.ARROW);click(ctx,MenuGeometry.ARROW);capture(ctx,"native-scale-"+scale);
            ctx.getInput().pressKey(GLFW.GLFW_KEY_ESCAPE);
        }
        ctx.setScreen(()->screen);
        ctx.getInput().resizeWindow(1280,720);settle(ctx);
        var fitted=MenuGeometry.view(1280,720);
        ctx.getInput().setCursorPos(fitted.x()+732*fitted.scale(),fitted.y()+24*fitted.scale());
        boolean beforeResizeClick=(boolean)field(screen,"railOpen");ctx.getInput().pressMouse(0);settle(ctx);
        check((boolean)field(screen,"railOpen")!=beforeResizeClick,"Pointer remains aligned after in-place resize");
        ctx.getInput().setCursorPos(20,20);settle(ctx);
        ctx.takeScreenshot(TestScreenshotOptions.of("native-resized").disableCounterPrefix().withSize(1280,720).withDestinationDir(Path.of(System.getProperty("skydex.visual.output"))));
        ctx.getInput().pressKey(GLFW.GLFW_KEY_ESCAPE);
        ctx.restoreDefaultGameOptions();System.out.println("SKYDEX_NATIVE_UI_PASS");
    }
    private static Object field(Object o,String name){try{var f=o.getClass().getDeclaredField(name);f.setAccessible(true);return f.get(o);}catch(Exception e){throw new AssertionError(e);}}
    private static void click(ClientGameTestContext ctx,MenuGeometry.Rect r) {var v=MenuGeometry.view(1920,1080);ctx.getInput().setCursorPos(v.x()+(r.x()+r.w()/2.0)*v.scale(),v.y()+(r.y()+r.h()/2.0)*v.scale());ctx.getInput().pressMouse(0);settle(ctx);}
    private static void capture(ClientGameTestContext ctx,String name){ctx.getInput().setCursorPos(20,20);settle(ctx);ctx.takeScreenshot(TestScreenshotOptions.of(name).disableCounterPrefix().withSize(1920,1080).withDestinationDir(Path.of(System.getProperty("skydex.visual.output"))));}
    private static void settle(ClientGameTestContext ctx){long end=System.nanoTime()+500_000_000;while(System.nanoTime()<end){ctx.waitTick();LockSupport.parkNanos(10_000_000);}}
    private static void await(ClientGameTestContext ctx,BooleanSupplier f,int seconds,String label){long end=System.nanoTime()+seconds*1_000_000_000L;while(!f.getAsBoolean()&&System.nanoTime()<end){ctx.waitTick();LockSupport.parkNanos(10_000_000);}check(f.getAsBoolean(),label);}
    private static void check(boolean b,String label){if(!b)throw new AssertionError(label);}
}
