package com.skydex.gametest;

import com.google.gson.*;
import com.skydex.SkydexMod;
import com.skydex.garden.*;
import com.skydex.layout.*;
import com.skydex.render.*;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotOptions;
import net.fabricmc.loader.api.FabricLoader;
import java.nio.file.*;
import java.util.*;

/** Real rendering on an empty bed, with no plant entities, archive or skin download. */
public final class GreenhouseHeadPreviewTest implements FabricClientGameTest {
    @Override public void runTest(ClientGameTestContext ctx) {
        ctx.getInput().resizeWindow(1920,1080);
        var mod=FabricLoader.getInstance().getEntrypoints("client",ClientModInitializer.class).stream()
                .filter(SkydexMod.class::isInstance).map(SkydexMod.class::cast).findFirst().orElseThrow();
        try(var world=ctx.worldBuilder().create()) {
            var server=world.getServer();
            server.runCommand("gamemode spectator @a");
            server.runCommand("tp @a 15 91 43 180 43");
            waitForChunks(world,"waitForChunksDownload");
            server.runCommand("fill -2 72 -2 34 91 34 air");
            server.runCommand("fill -2 70 -2 34 70 34 dirt");
            server.runCommand("fill -2 71 -2 34 71 34 oak_planks");
            server.runCommand("fill 0 71 0 31 71 31 farmland[moisture=7]");
            server.runCommand("time set noon");
            server.runCommand("weather clear");
            server.runCommand("scoreboard objectives add skydex_heads dummy {text:'SKYBLOCK'}");
            server.runCommand("scoreboard objectives setdisplay sidebar skydex_heads");
            server.runCommand("team add garden_heads");
            server.runCommand("team modify garden_heads prefix {text:'Garden'}");
            server.runCommand("team join garden_heads greenhouse_line");
            server.runCommand("scoreboard players set greenhouse_line skydex_heads 1");
            waitForChunks(world,"waitForChunksRender");
            var all=new ArrayList<LayoutCell>();
            int index=0;
            for(var id:GreenhouseCatalog.ids().stream().sorted().toList()) {
                boolean mutation=PlantIdentity.isMutation(id);
                add(all,id,(index%8)*4,(index/8)*4,mutation); index++;
            }
            var anchor=new LayoutAnchor(0,71,0,GridOrientation.R0);
            var catalogue=layout(all,32);
            ctx.runOnClient(client->{
                mod.layouts().setLayout(catalogue);mod.layouts().setAnchor(anchor);
                mod.setPlacementHelperEnabled(true);mod.layouts().setShowMutations(true);
                mod.overlay().plants().prepare(client.level,catalogue,anchor);
                check(mod.overlay().plants().previewCount()==57,"All 57 previews exist without specimen plants");
                for(var id:GreenhouseHeads.ids()) {
                    var resource=net.minecraft.resources.Identifier.fromNamespaceAndPath("skydex",GreenhouseHeads.texturePath(id));
                    check(client.getResourceManager().getResource(resource).isPresent(),"Packaged skin "+id);
                }
                check(client.level.getEntitiesOfClass(net.minecraft.world.entity.decoration.ArmorStand.class,
                        new net.minecraft.world.phys.AABB(-2,70,-2,34,92,34)).isEmpty(),"No armour stands in preview bed");
            });
            ctx.waitFor(client->mod.location().isOnGarden(),200);
            ctx.waitFor(client->mod.overlay().plants().submittedParts()>114,200);
            ctx.waitTicks(20);capture(ctx,"greenhouse-heads-all-plants");
            check(ctx.computeOnClient(client->mod.overlay().plants().submittedMutationParts())>0,"Mutation skins submitted");
            check(PlantGhostCollector.submittedBlockQuads>0,"Native crop quads submitted");

            var sample=new ArrayList<LayoutCell>();
            add(sample,"choconut",1,7,true); add(sample,"gloomgourd",3,7,true);
            add(sample,"lonelily",5,7,true); add(sample,"cocoa_beans",7,7,false);
            add(sample,"wheat",9,7,false); add(sample,"plantboy_advance",1,2,true);
            add(sample,"godseed",5,1,true);
            var representative=layout(sample,10);
            ctx.runOnClient(client->{mod.layouts().setLayout(representative);mod.layouts().setAnchor(anchor);});
            server.runCommand("tp @a 5 77 14 180 29");
            ctx.waitFor(client->mod.overlay().plants().previewCount()==7,100);
            ctx.waitTicks(30);capture(ctx,"greenhouse-heads-preview");
            long mutations=ctx.computeOnClient(client->mod.overlay().plants().submittedMutationParts());
            ctx.runOnClient(client->mod.layouts().setShowMutations(false));ctx.waitTicks(5);
            long hidden=ctx.computeOnClient(client->mod.overlay().plants().submittedMutationParts());
            long crops=ctx.computeOnClient(client->mod.overlay().plants().submittedParts());
            ctx.waitTicks(15);
            check(ctx.computeOnClient(client->mod.overlay().plants().submittedMutationParts())==hidden,"Hidden mutations stop drawing");
            check(ctx.computeOnClient(client->mod.overlay().plants().submittedParts())>crops,"Ordinary crops stay visible");
            capture(ctx,"greenhouse-heads-mutations-hidden");
            ctx.runOnClient(client->mod.layouts().setShowMutations(true));
            ctx.waitFor(client->mod.overlay().plants().submittedMutationParts()>hidden,100);
            server.runCommand("setblock 9 72 7 wheat[age=7]");
            ctx.waitFor(client->mod.overlay().progress().at(9,7).isDone(),100);
            ctx.waitTicks(15);capture(ctx,"greenhouse-heads-built-crop");
            // All four orientations share exactly one head for each larger footprint.
            for(var rotation:GridOrientation.values()) ctx.runOnClient(client->{
                var rotated=anchor.withOrientation(rotation);
                mod.overlay().plants().prepare(client.level,representative,rotated);
                check(mod.overlay().plants().previewCount()==7,"Footprints survive "+rotation);
            });
            ctx.runOnClient(client->{
                mod.layouts().setAnchor(anchor);mod.overlay().plants().prepare(null,null,null);
                check(mod.overlay().plants().previewCount()==0,"Leaving a world clears previews");
                mod.overlay().plants().prepare(client.level,representative,anchor);
                check(mod.overlay().plants().previewCount()==7,"Previews reload without captured models");
            });
            System.out.println("SKYDEX_HEAD_PREVIEWS_PASS catalogue=57 skins=50 mutations=40 no_plant_entities=true mutations_submitted="+mutations);
        } finally {ctx.restoreDefaultGameOptions();}
    }

    private static void add(List<LayoutCell> cells,String id,int x,int y,boolean mutation) {
        for(int dy=0;dy<GreenhouseCatalog.size(id);dy++)for(int dx=0;dx<GreenhouseCatalog.size(id);dx++)
            cells.add(mutation?LayoutCell.mutation(x+dx,y+dy,id,GreenhouseCatalog.ground(id))
                    :LayoutCell.crop(x+dx,y+dy,id,GreenhouseCatalog.ground(id)));
    }
    private static GreenhouseLayout layout(List<LayoutCell> cells,int width) {
        var root=new JsonObject();root.addProperty("schema",1);root.addProperty("label","Greenhouse head previews");
        var size=new JsonArray();size.add(width);size.add(width);root.add("size",size);
        var array=new JsonArray();cells.forEach(cell->array.add(cell.toJson()));root.add("cells",array);
        return LayoutParser.parse(root);
    }
    private static void capture(ClientGameTestContext ctx,String name) {
        ctx.takeScreenshot(TestScreenshotOptions.of(name).disableCounterPrefix().withSize(1920,1080)
                .withDestinationDir(Path.of(System.getProperty("skydex.visual.output"))));
    }
    private static void waitForChunks(Object world,String method) {
        try {
            var api=net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext.class;
            java.lang.reflect.Method accessor;
            try {accessor=api.getMethod("getConnection");}catch(NoSuchMethodException oldApi){accessor=api.getMethod("getClientLevel");}
            accessor.getReturnType().getMethod(method).invoke(accessor.invoke(world));
        } catch(ReflectiveOperationException error){throw new AssertionError(error);}
    }
    private static void check(boolean value,String message) {if(!value)throw new AssertionError(message);}
}
