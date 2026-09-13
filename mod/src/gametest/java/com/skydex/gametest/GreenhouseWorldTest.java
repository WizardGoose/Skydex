package com.skydex.gametest;

import com.skydex.SkydexMod;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotOptions;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.decoration.ArmorStand;
import java.nio.file.Path;

/** Synthetic world fixture. Does not connect to Hypixel or modify a user world. */
public final class GreenhouseWorldTest implements FabricClientGameTest {
    @Override public void runTest(ClientGameTestContext ctx) {
        ctx.getInput().resizeWindow(1920,1080);
        var mod=FabricLoader.getInstance().getEntrypoints("client",ClientModInitializer.class).stream()
                .filter(SkydexMod.class::isInstance).map(SkydexMod.class::cast).findFirst().orElseThrow();
        try(var world=ctx.worldBuilder().create()) {
            var server=world.getServer();
            server.runCommand("gamemode spectator @a");
            server.runCommand("tp @a 101 78 -4 180 40");
            waitForChunks(world,"waitForChunksDownload");
            server.runCommand("fill 88 70 -26 115 90 0 air");
            server.runCommand("fill 93 70 -21 109 71 -8 dirt");
            server.runCommand("fill 93 72 -21 109 72 -8 oak_planks");
            server.runCommand("fill 96 72 -18 105 72 -9 farmland[moisture=7]");
            server.runCommand("scoreboard objectives add skydex_test dummy {text:'SKYBLOCK'}");
            server.runCommand("scoreboard objectives setdisplay sidebar skydex_test");
            server.runCommand("team add garden_test");
            server.runCommand("team modify garden_test prefix {text:'Garden'}");
            server.runCommand("team join garden_test greenhouse_line");
            server.runCommand("scoreboard players set greenhouse_line skydex_test 1");
            server.runCommand("tp @a 101 78 -4 180 40");
            server.runOnServer(s->{var level=s.overworld();
                var npc=new ArmorStand(level,101,75,-7);npc.setCustomName(Component.literal("Carpenter"));
                npc.setNoGravity(true);level.addFreshEntity(npc);});
            waitForChunks(world,"waitForChunksRender");
            ctx.runOnClient(client->{mod.config().captureEnabled=true;mod.greenhouse().reset();
                mod.importLayoutCode("https://skydex.ca/greenhouse/share/KzOqMVI1MgjOT0-vrDHRya4xNKnRIx4kOSZisIgCAA");
                mod.layouts().setAnchor(null);mod.setPlacementHelperEnabled(true);});
            try {ctx.waitFor(client->mod.greenhouse().diagnostics().foundBed(),200);}
            catch(AssertionError error){ctx.runOnClient(client->System.out.println("WORLD_FIXTURE_STATE "+mod.greenhouse().diagnostics().summary()+" sidebar="+mod.location().sidebar()+" skyblock="+mod.location().isOnSkyBlock()+" player="+client.player.position()));throw error;}
            ctx.runOnClient(client->{var d=mod.greenhouse().diagnostics();
                if(d.originX()!=96||d.originZ()!=-18||d.bedY()!=72)
                    throw new AssertionError("Expected exposed bed at 96,72,-18; got "+d.summary());});
            ctx.waitFor(client->mod.overlay().renderedFrames()>0,100);
            ctx.waitTicks(20);
            ctx.takeScreenshot(TestScreenshotOptions.of("greenhouse-world-ghosts").disableCounterPrefix()
                    .withSize(1920,1080).withDestinationDir(Path.of(System.getProperty("skydex.visual.output"))));
            System.out.println("SKYDEX_WORLD_GEOMETRY_PASS rendered="+mod.overlay().renderedFrames());
            var originalLayout=mod.layouts().layout();
            ctx.runOnClient(client->{
                mod.config().captureEnabled=false;
                mod.greenhouse().reset();
                // A saved observation must not become current placement advice on opening the menu.
                mod.stores().active().recordGreenhouse(new com.skydex.data.GreenhouseBoard(
                        System.currentTimeMillis()-86_400_000,10,10,java.util.List.of(
                        com.skydex.data.GreenhouseCell.mutation(2,0,"CHEESEBITE"))));
                try { mod.layouts().setLayout(com.skydex.layout.LayoutParser.parse(
                        "{\"schema\":1,\"label\":\"Choconut Patch\",\"size\":[10,10],\"cells\":[{\"x\":2,\"y\":0,\"mutation\":\"Choconut\"}]}"));
                } catch(Exception e) { throw new AssertionError(e); }
                assertPlanOnly(mod);
                if(mod.stores().active().greenhouse().cellCount()!=1)
                    throw new AssertionError("Historical board must remain available for export");
            });
            ctx.setScreen(()->new com.skydex.gui.SkydexNativeScreen(mod));
            ctx.waitTicks(10);
            ctx.takeScreenshot(TestScreenshotOptions.of("greenhouse-saved-board-hidden").disableCounterPrefix()
                    .withSize(1920,1080).withDestinationDir(Path.of(System.getProperty("skydex.visual.output"))));
            ctx.setScreen(()->null);
            ctx.runOnClient(client->mod.config().captureEnabled=true);
            ctx.waitFor(client->mod.greenhouse().currentBoard(client)!=null,100);
            server.runOnServer(s->{
                var plant=new ArmorStand(s.overworld(),98.5,73,-17.5);
                plant.setNoGravity(true);plant.setInvisible(true);
                var head=new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.PLAYER_HEAD);
                head.set(net.minecraft.core.component.DataComponents.CUSTOM_NAME,Component.literal("Cheesebite"));
                plant.setItemSlot(net.minecraft.world.entity.EquipmentSlot.HEAD,head);
                s.overworld().addFreshEntity(plant);
            });
            ctx.waitFor(client->new com.skydex.gui.MenuController(mod).snapshot()
                    .getAsJsonObject("layout").has("replacement"),100);
            server.runCommand("team modify garden_test prefix {text:'Your Island'}");
            ctx.waitFor(client->!mod.location().isOnGarden(),100);
            ctx.runOnClient(client->{
                assertPlanOnly(mod);
                if(mod.stores().active().greenhouse().cellCount()!=1)
                    throw new AssertionError("Leaving Garden must preserve the saved observation");
            });
            ctx.setScreen(()->new com.skydex.gui.SkydexNativeScreen(mod));
            ctx.waitTicks(5);
            ctx.takeScreenshot(TestScreenshotOptions.of("greenhouse-private-island-plan").disableCounterPrefix()
                    .withSize(1920,1080).withDestinationDir(Path.of(System.getProperty("skydex.visual.output"))));
            ctx.setScreen(()->null);
            server.runCommand("kill @e[type=minecraft:armor_stand,x=98,y=72,z=-18,dx=1,dy=3,dz=1]");
            server.runCommand("team modify garden_test prefix {text:'Garden'}");
            ctx.waitFor(client->mod.greenhouse().currentBoard(client)!=null
                    && mod.greenhouse().currentBoard(client).cellCount()==0,100);
            ctx.runOnClient(client->{
                if(new com.skydex.gui.MenuController(mod).snapshot().getAsJsonObject("layout").has("replacement"))
                    throw new AssertionError("A fresh empty scan must remove the old replacement warning");
                var active=mod.stores().active();
                mod.stores().activate(client.player.getUUID().toString(),"Test Player","Other Test Profile","");
                assertPlanOnly(mod);
                mod.stores().activate(client.player.getUUID().toString(),client.player.getName().getString(),
                        mod.location().profileName(),mod.location().gameMode());
                if(mod.stores().active()!=active) throw new AssertionError("Restore original profile");
                mod.layouts().setLayout(originalLayout);
            });
            System.out.println("SKYDEX_LIVE_BOARD_SCOPE_PASS");
            server.runOnServer(s->{
                var plant=new ArmorStand(s.overworld(),101.5,73,-14.5);
                plant.setNoGravity(true);plant.setInvisible(true);
                plant.setHeadPose(new net.minecraft.core.Rotations(15,30,0));
                var head=new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.PLAYER_HEAD);
                head.set(net.minecraft.core.component.DataComponents.CUSTOM_NAME,Component.literal("Choconut"));
                head.set(net.minecraft.core.component.DataComponents.ITEM_MODEL,net.minecraft.resources.Identifier.parse("minecraft:player_head"));
                plant.setItemSlot(net.minecraft.world.entity.EquipmentSlot.HEAD,head);
                s.overworld().addFreshEntity(plant);
            });
            ctx.waitFor(client->client.level.getEntitiesOfClass(ArmorStand.class,
                    new net.minecraft.world.phys.AABB(100,71,-16,103,79,-13)).stream()
                    .anyMatch(e->"choconut".equals(com.skydex.garden.PlantIdentity.id(e))),100);
            ctx.runOnClient(client->{
                var captured=com.skydex.garden.PlantModelCapture.capture(client,new net.minecraft.core.BlockPos(101,72,-15),"Choconut");
                if(captured.get("matchingNames").getAsInt()!=1)throw new AssertionError("Capture must identify the named fixture");
                var parts=captured.getAsJsonArray("entities");
                if(parts.size()!=1)throw new AssertionError("Capture must exclude the Carpenter and player");
                String data=parts.get(0).getAsJsonObject().get("data").getAsString();
                if(!data.contains("Pose")||!data.contains("player_head")||data.contains("UUID"))
                    throw new AssertionError("Capture must preserve model/pose and remove entity UUID: "+data);
                try {var path=com.skydex.garden.PlantModelCapture.save(
                        Path.of(System.getProperty("skydex.visual.output")).resolve("plant-capture-test"),captured);
                    if(!java.nio.file.Files.readString(path).contains("Choconut"))throw new AssertionError("Capture file round trip");
                } catch(java.io.IOException e){throw new AssertionError(e);}
                var live=new com.skydex.garden.PlantModels();
                live.observe(client.level,100,72,-16,3,3);
                if(live.get("Choconut")==null)throw new AssertionError("Live model available without a capture file");
                live.observe(client.level,0,72,0,3,3);
                if(live.get("Choconut")==null)throw new AssertionError("Learned model must survive leaving its specimen");
                try {
                    var archiveDir=java.nio.file.Files.createTempDirectory("skydex-auto-plants-");
                    var archive=new com.skydex.garden.AutoPlantCapture(archiveDir);
                    var learned=new com.skydex.garden.PlantModels();
                    for(int tick=0;tick<61;tick++)archive.tick(client,true,learned);
                    var file=archiveDir.resolve("choconut.json");
                    if(!java.nio.file.Files.exists(file))throw new AssertionError("Automatic capture must save without manual commands");
                    var saved=java.nio.file.Files.readString(file);
                    var modified=java.nio.file.Files.getLastModifiedTime(file);
                    for(int tick=0;tick<61;tick++)archive.tick(client,true,learned);
                    if(!modified.equals(java.nio.file.Files.getLastModifiedTime(file)))throw new AssertionError("Known plants must not be dumped repeatedly");
                    var reloaded=new com.skydex.garden.PlantModels();
                    new com.skydex.garden.AutoPlantCapture(archiveDir).tick(client,false,reloaded);
                    if(reloaded.get("Choconut")==null)throw new AssertionError("Saved plant must reload without Garden scanning");
                    if(saved.contains("\"UUID\"")||!saved.contains("automatic"))throw new AssertionError("Automatic archive contents");
                    System.out.println("SKYDEX_AUTO_PLANT_ARCHIVE_PASS");
                } catch(java.io.IOException error) {throw new AssertionError(error);}
                for(String id:java.util.List.of("Wheat","Carrot","Potato","Nether Wart","Sugar Cane"))
                    if(live.get(id)==null || live.get(id).stems().isEmpty())
                        throw new AssertionError("Native crop model must be available before planting: "+id);
                System.out.println("SKYDEX_PLANT_CAPTURE_PASS");
            });
            String captureDir=System.getProperty("skydex.test.captures");
            if(captureDir!=null) {
                var fixtures=new com.skydex.garden.PlantModels();
                ctx.runOnClient(client->{
                    var models=fixtures;
                    models.prepare(client.level);
                    try(var paths=java.nio.file.Files.list(Path.of(captureDir))) {
                        for(var path:paths.filter(p->p.toString().endsWith(".json")).toList())
                            models.ingest(client.level,com.google.gson.JsonParser.parseString(java.nio.file.Files.readString(path)).getAsJsonObject());
                    }catch(Exception e){throw new AssertionError(e);}
                    if(models.get("Gloomgourd")==null||models.get("Gloomgourd").heads().size()!=2)
                        throw new AssertionError("Real Gloomgourd must retain both head parts");
                    if(models.get("Choconut")==null||models.get("Choconut").stems().isEmpty())
                        throw new AssertionError("Real Choconut must retain its stem");
                    if(models.get("Lonelilly")==null)throw new AssertionError("Real item-name alias must identify Lonelilly");
                    if(java.nio.file.Files.exists(Path.of(captureDir).resolve("blastberry.json"))) {
                        if(models.get("Blastberry")==null || models.get("Startlevine")==null)
                            throw new AssertionError("Recovered numbered head names must produce both plant models");
                        System.out.println("SKYDEX_RECOVERED_PLANTS_PASS blastberry,startlevine");
                    }
                    for(String id:com.skydex.garden.GreenhouseCatalog.ids()) {
                        var stand=new ArmorStand(client.level,0,0,0);
                        var head=new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.PLAYER_HEAD);
                        head.set(net.minecraft.core.component.DataComponents.CUSTOM_NAME,Component.literal(id));
                        stand.setItemSlot(net.minecraft.world.entity.EquipmentSlot.HEAD,head);
                        if(!com.skydex.garden.GreenhouseCatalog.canonicalId(id).equals(com.skydex.garden.PlantIdentity.id(stand)))
                            throw new AssertionError("Item-name recognition: "+id);
                        head.set(net.minecraft.core.component.DataComponents.CUSTOM_NAME,Component.literal(id+"3"));
                        if(!id.equals(com.skydex.garden.PlantIdentity.id(stand)))
                            throw new AssertionError("Numbered item-name recognition: "+id);
                    }
                    System.out.println("SKYDEX_PLANT_IDENTITIES_PASS count="+com.skydex.garden.GreenhouseCatalog.ids().size());
                    try {
                        mod.layouts().setLayout(com.skydex.layout.LayoutParser.parse("{\"schema\":1,\"label\":\"Plant render proof\",\"size\":[10,10],\"cells\":[{\"x\":2,\"y\":6,\"mutation\":\"Choconut\"},{\"x\":4,\"y\":6,\"mutation\":\"Gloomgourd\"},{\"x\":6,\"y\":6,\"mutation\":\"Lonelily\"},{\"x\":8,\"y\":6,\"crop\":\"Wheat\"}]}"));
                    }catch(Exception e){throw new AssertionError(e);}
                    mod.layouts().setAnchor(new com.skydex.layout.LayoutAnchor(96,72,-18,com.skydex.layout.GridOrientation.R0));
                    mod.setPlacementHelperEnabled(true);
                    mod.overlay().plants().prepare(client.level,mod.layouts().layout(),mod.layouts().anchor());
                });
                // Recreate the real Lonelilly head over wheat and exercise scanner -> GUI data.
                var lily=fixtures.get("Lonelilly");
                server.runCommand("setblock 100 73 -12 wheat[age=7]");
                server.runOnServer(s->{
                    for(var part:lily.heads()) {
                        var stand=new ArmorStand(s.overworld(),0,0,0);
                        stand.load(net.minecraft.world.level.storage.TagValueInput.create(
                                net.minecraft.util.ProblemReporter.DISCARDING,s.registryAccess(),part.data().copy()));
                        stand.setPos(100+part.x(),72+part.y(),-12+part.z());
                        s.overworld().addFreshEntity(stand);
                    }
                });
                ctx.waitFor(client->{
                    var active=mod.stores().active(); var board=active==null?null:active.greenhouse();
                    return board!=null && board.cells().stream().anyMatch(c->c.x()==4&&c.y()==6&&"LONELILY".equals(c.mutation()));
                },200);
                ctx.runOnClient(client->{
                    var board=mod.stores().active().greenhouse();
                    var ui=com.skydex.gui.WebUiModel.layout(null,board);
                    boolean correct=false;
                    for(var p:ui.getAsJsonArray("placements")) {
                        var cell=p.getAsJsonObject();
                        if(cell.get("index").getAsInt()==64) correct="lonelily".equals(cell.get("crop").getAsString());
                    }
                    if(!correct)throw new AssertionError("Grid must show Lonelily instead of its wheat stem");
                    System.out.println("SKYDEX_LONELILY_GRID_PASS");
                });
                server.runCommand("kill @e[type=minecraft:armor_stand]");
                server.runCommand("setblock 100 73 -12 air");
                // Real plants at the back; the layout ghosts belong to separate empty cells in front.
                server.runOnServer(s->{
                    int x=98;
                    for(String id:java.util.List.of("Choconut","Gloomgourd","Lonelilly")) {
                        var model=fixtures.get(id);
                        for(var part:model.heads()) {
                            var stand=new ArmorStand(s.overworld(),0,0,0);
                            stand.load(net.minecraft.world.level.storage.TagValueInput.create(
                                    net.minecraft.util.ProblemReporter.DISCARDING,s.registryAccess(),part.data().copy()));
                            stand.setPos(x+part.x(),72+part.y(),-17+part.z());
                            s.overworld().addFreshEntity(stand);
                        }
                        for(var stem:model.stems())s.overworld().setBlock(new net.minecraft.core.BlockPos(x,72+stem.y(),-17),stem.state(),3);
                        x+=2;
                    }
                });
                server.runCommand("setblock 104 73 -17 wheat[age=7]");
                server.runCommand("tp @a 101 75 -6 180 22");
                ctx.waitFor(client->mod.overlay().plants().previewCount()==4,200);
                ctx.waitFor(client->mod.overlay().plants().submittedParts()>30,200);
                ctx.waitTicks(100);
                ctx.takeScreenshot(TestScreenshotOptions.of("greenhouse-native-plants").disableCounterPrefix()
                        .withSize(1920,1080).withDestinationDir(Path.of(System.getProperty("skydex.visual.output"))));
                System.out.println("SKYDEX_NATIVE_PLANT_MODELS_PASS");
                System.out.println("SKYDEX_GHOST_BLOCK_QUADS="+com.skydex.render.PlantGhostCollector.submittedBlockQuads);
                if(com.skydex.render.PlantGhostCollector.submittedBlockQuads==0)
                    throw new AssertionError("Transparent crop and stem geometry must be submitted");
                ctx.runOnClient(client->mod.layouts().setShowMutations(false));
                ctx.waitTicks(5);
                long hidden=ctx.computeOnClient(client->mod.overlay().plants().submittedMutationParts());
                long crops=ctx.computeOnClient(client->mod.overlay().plants().submittedParts());
                ctx.waitTicks(10);
                if(ctx.computeOnClient(client->mod.overlay().plants().submittedMutationParts())!=hidden)
                    throw new AssertionError("Hidden mutation models must not be submitted");
                if(ctx.computeOnClient(client->mod.overlay().plants().submittedParts())<=crops)
                    throw new AssertionError("Crop ghosts must remain visible when mutations are hidden");
                ctx.takeScreenshot(TestScreenshotOptions.of("greenhouse-mutations-hidden").disableCounterPrefix()
                        .withSize(1920,1080).withDestinationDir(Path.of(System.getProperty("skydex.visual.output"))));
                ctx.runOnClient(client->mod.layouts().setShowMutations(true));
                ctx.waitFor(client->mod.overlay().plants().submittedMutationParts()>hidden,100);
                System.out.println("SKYDEX_MUTATION_VISIBILITY_PASS");
            }
        } finally {ctx.restoreDefaultGameOptions();}
        ctx.runOnClient(client->{
            if(mod.greenhouse().currentBoard(client)!=null)
                throw new AssertionError("Unloaded world must not retain a live board");
        });
    }
    private static void assertPlanOnly(SkydexMod mod) {
        var layout=new com.skydex.gui.MenuController(mod).snapshot().getAsJsonObject("layout");
        if(layout.has("replacement") || !layout.get("progress").getAsString().isEmpty())
            throw new AssertionError("No current scan means no replacement warning or progress");
        if(layout.getAsJsonArray("placements").size()!=1
                || !layout.getAsJsonArray("placements").get(0).getAsJsonObject().get("crop").getAsString().equals("choconut"))
            throw new AssertionError("Only planned Choconut should display without a current scan");
    }
    private static void waitForChunks(Object world,String method) {
        try {
            var api=net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext.class;
            java.lang.reflect.Method accessor;
            try {accessor=api.getMethod("getConnection");}catch(NoSuchMethodException oldApi){accessor=api.getMethod("getClientLevel");}
            accessor.getReturnType().getMethod(method).invoke(accessor.invoke(world));
        } catch(ReflectiveOperationException error){throw new AssertionError("World test connection API",error);}
    }
}
