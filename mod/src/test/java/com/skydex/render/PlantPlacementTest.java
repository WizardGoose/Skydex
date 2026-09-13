package com.skydex.render;

import com.google.gson.*;
import com.skydex.layout.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class PlantPlacementTest {
    private static List<LayoutCell> square(int x, int y, int size, String id) {
        var cells = new ArrayList<LayoutCell>();
        for (int dy = 0; dy < size; dy++) for (int dx = 0; dx < size; dx++)
            cells.add(LayoutCell.mutation(x + dx, y + dy, id, "farmland"));
        return cells;
    }

    private static GreenhouseLayout layout(List<LayoutCell> cells) {
        var root = new JsonObject(); root.addProperty("schema", 1); root.addProperty("label", "Test");
        root.add("size", JsonParser.parseString("[10,10]"));
        var array = new JsonArray(); cells.forEach(cell -> array.add(cell.toJson())); root.add("cells", array);
        return LayoutParser.parse(root);
    }

    @Test void adjacentLargePlantsEachGetOneHeadAndAllTheirCells() {
        var cells = square(0, 0, 3, "Godseed");
        cells.addAll(square(3, 0, 3, "GODSEED"));
        cells.addAll(square(0, 4, 2, "Plantboy"));
        cells.add(LayoutCell.crop(5, 5, "Wheat", null));
        Collections.reverse(cells); // Input order must not change grouping.
        var plants = PlantPlacement.from(layout(cells));
        assertEquals(4, plants.size());
        assertEquals(List.of(9, 9, 4, 1), plants.stream().map(p -> p.cells().size()).toList());
        assertEquals(23, plants.stream().flatMap(p -> p.cells().stream()).map(LayoutCell::key).distinct().count());
    }

    @Test void allRotationsKeepTheHeadAtTheFootprintCentre() {
        var plant = PlantPlacement.from(layout(square(2, 3, 3, "Godseed"))).getFirst();
        for (var orientation : GridOrientation.values()) {
            var anchor = new LayoutAnchor(100, 70, -20, orientation);
            assertEquals(anchor.worldX(3, 4) + .5, plant.centerX(anchor));
            assertEquals(anchor.worldZ(3, 4) + .5, plant.centerZ(anchor));
        }
        var two = PlantPlacement.from(layout(square(0, 0, 2, "Noctilume"))).getFirst();
        var anchor = new LayoutAnchor(100, 70, -20, GridOrientation.R0);
        assertEquals(101, two.centerX(anchor)); assertEquals(-19, two.centerZ(anchor));
    }

    @Test void incompleteFootprintsNeverExpandAcrossDifferentPlants() {
        var cells = square(0, 0, 3, "Godseed"); cells.removeLast();
        cells.add(LayoutCell.crop(2, 2, "Wheat", null));
        var plants = PlantPlacement.from(layout(cells));
        assertEquals(9, plants.size());
        assertTrue(plants.stream().allMatch(p -> p.cells().size() == 1));
    }

    @Test void largePreviewRemainsUntilEveryOccupiedCellMatches() {
        var plant = PlantPlacement.from(layout(square(0, 0, 3, "Godseed"))).getFirst();
        var anchor = new LayoutAnchor(100, 70, -20, GridOrientation.R90);
        var statuses = new HashMap<Long, CellStatus>();
        for (var cell : plant.cells()) statuses.put(LayoutProgress.pack(anchor.worldX(cell), anchor.worldZ(cell)), CellStatus.DONE);
        assertEquals(CellStatus.DONE, plant.status(new LayoutProgress(statuses), anchor));
        statuses.put(LayoutProgress.pack(anchor.worldX(2, 2), anchor.worldZ(2, 2)), CellStatus.EMPTY);
        assertEquals(CellStatus.EMPTY, plant.status(new LayoutProgress(statuses), anchor));
        statuses.put(LayoutProgress.pack(anchor.worldX(1, 2), anchor.worldZ(1, 2)), CellStatus.MISMATCH);
        assertEquals(CellStatus.MISMATCH, plant.status(new LayoutProgress(statuses), anchor));
    }
}
