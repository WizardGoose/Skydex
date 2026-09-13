package com.skydex;

import com.skydex.data.GreenhouseBoard;
import com.skydex.data.GreenhouseCell;
import com.skydex.gui.GreenhouseScreenModel;
import com.skydex.layout.GreenhouseLayout;
import com.skydex.layout.LayoutParser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class GreenhouseScreenModelTest {

    @Test
    @DisplayName("the UI separates correct, pending, mutation, replacement and ordinary live cells")
    void reconcilesLayoutWithLiveBoard() {
        GreenhouseLayout layout = LayoutParser.parse("""
                {"schema":1,"label":"Waterworks","size":[10,10],"cells":[
                  {"x":0,"y":0,"crop":"Wheat","ground":"farmland"},
                  {"x":1,"y":0,"crop":"Cactus","ground":"sand"},
                  {"x":2,"y":0,"mutation":"Soggybud","ground":"farmland"},
                  {"x":3,"y":0,"mutation":"Gloomgourd","ground":"farmland"}
                ]}
                """);
        GreenhouseBoard board = new GreenhouseBoard(100L, 10, 10, List.of(
                GreenhouseCell.crop(0, 0, "WHEAT"),
                GreenhouseCell.crop(3, 0, "PUMPKIN"),
                GreenhouseCell.crop(4, 0, "MELON")));

        GreenhouseScreenModel model = GreenhouseScreenModel.build(layout, board);
        assertEquals(100, model.cells().size());
        assertEquals(2, model.leftToPlace());
        assertEquals(1, model.mismatches());
        assertEquals(GreenhouseScreenModel.State.CORRECT, model.cell(0, 0).state());
        assertEquals(GreenhouseScreenModel.State.PENDING_CROP, model.cell(1, 0).state());
        assertEquals(GreenhouseScreenModel.State.PENDING_MUTATION, model.cell(2, 0).state());
        assertEquals(GreenhouseScreenModel.State.REPLACE, model.cell(3, 0).state());
        assertEquals("PUMPKIN", model.cell(3, 0).plantId(), "show what is actually wrong");
        assertEquals(1, model.replacements().size());
        assertEquals("PUMPKIN", model.replacements().get(0).actualId());
        assertEquals("Pumpkin", model.replacements().get(0).actualName());
        assertEquals("Gloomgourd", model.replacements().get(0).targetId());
        assertEquals("Gloomgourd", model.replacements().get(0).targetName());
        assertEquals(GreenhouseScreenModel.State.OBSERVED, model.cell(4, 0).state());
        assertEquals(GreenhouseScreenModel.State.EMPTY, model.cell(9, 9).state());
        assertEquals(null, model.cell(9, 9).ground(),
                "an unused cell stays visually empty instead of inventing farmland");

        assertEquals(2, model.needs().size());
        assertEquals("Cactus", model.needs().get(0).displayName());
        assertEquals(1, model.needs().get(0).count());
        assertEquals("Soggybud", model.needs().get(1).displayName());
    }

    @Test
    @DisplayName("without a layout the UI still shows the actual Greenhouse")
    void liveBoardDoesNotDependOnLayout() {
        GreenhouseBoard board = new GreenhouseBoard(100L, 10, 10,
                List.of(GreenhouseCell.mutation(5, 5, "SOGGYBUD")));
        GreenhouseScreenModel model = GreenhouseScreenModel.build(null, board);
        assertEquals(GreenhouseScreenModel.State.OBSERVED, model.cell(5, 5).state());
        assertEquals("SOGGYBUD", model.cell(5, 5).plantId());
        assertEquals(0, model.leftToPlace());
        assertEquals(0, model.mismatches());
        assertEquals(List.of(), model.replacements());
    }
}
