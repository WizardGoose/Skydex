package com.skydex;

import com.skydex.data.*;
import com.skydex.export.ExportSection;
import com.skydex.garden.BedBlocks;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class CaptureScopeTest {
    @TempDir Path directory;
    @Test void wireDropsApiDuplicatesWithoutDeletingLegacyData() throws Exception {
        var stores=new StoreManager(directory);
        var store=stores.activate("00000000-0000-0000-0000-000000000001","Fixture","Test","normal");
        store.recordSacks(Map.of("WHEAT",42L));
        store.recordInventory(List.of());
        store.recordEnderChestPage("0",List.of());
        store.recordStoragePage("0",List.of());
        store.recordChest(1,2,3,"Chest",System.currentTimeMillis(),List.of());
        store.recordGreenhouse(new GreenhouseBoard(1,10,10,List.of()));
        var wire=com.google.gson.JsonParser.parseString(stores.activeJson()).getAsJsonObject();
        for(String key:List.of("sacks","inventory","enderChest","storage"))assertFalse(wire.has(key),key);
        assertTrue(wire.has("chests"));assertTrue(wire.has("greenhouse"));
        store.save();assertEquals(42L,SnapshotStore.load(store.file()).toSnapshot(1).sacks().get("WHEAT"));
        assertEquals(java.util.Set.of(ExportSection.ISLAND_CHESTS,ExportSection.GREENHOUSE),ExportSection.capturedSections());
    }
    @Test void foundationCannotOutrankExposedPlantingFloor() {
        assertFalse(BedBlocks.isExposedBed("dirt","farmland",false));
        assertFalse(BedBlocks.isExposedBed("dirt","oak_planks",true));
        assertTrue(BedBlocks.isExposedBed("farmland","wheat",false));
        assertTrue(BedBlocks.isExposedBed("farmland","air",false));
        assertTrue(BedBlocks.isExposedBed("farmland","melon",true));
        assertTrue(BedBlocks.isExposedBed("dirt","pumpkin",true));
    }
}
