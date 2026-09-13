package com.skydex.render;

import com.skydex.garden.GreenhouseCatalog;
import com.skydex.layout.*;
import java.util.*;

/** Groups the sender's occupied cells into one preview per complete plant footprint. */
public record PlantPlacement(String id, boolean mutation, List<LayoutCell> cells) {
    public PlantPlacement { cells = List.copyOf(cells); }

    public static List<PlantPlacement> from(GreenhouseLayout layout) {
        Map<String, LayoutCell> remaining = new HashMap<>();
        for (var cell : layout.cells()) remaining.put(cell.key(), cell);
        List<PlantPlacement> result = new ArrayList<>();
        for (var origin : layout.cells().stream()
                .sorted(Comparator.comparingInt(LayoutCell::y).thenComparingInt(LayoutCell::x)).toList()) {
            if (!remaining.containsKey(origin.key())) continue;
            String id = GreenhouseCatalog.canonicalId(origin.displayName());
            int size = GreenhouseCatalog.size(id);
            List<LayoutCell> footprint = new ArrayList<>();
            for (int y = 0; y < size; y++) for (int x = 0; x < size; x++) {
                var cell = remaining.get((origin.x() + x) + "," + (origin.y() + y));
                if (cell != null && cell.isMutation() == origin.isMutation()
                        && Objects.equals(id, GreenhouseCatalog.canonicalId(cell.displayName()))) footprint.add(cell);
            }
            // A clipped/overwritten footprint must never claim unrequested neighbouring cells.
            if (footprint.size() != size * size) footprint = List.of(origin);
            for (var cell : footprint) remaining.remove(cell.key());
            result.add(new PlantPlacement(id, origin.isMutation(), footprint));
        }
        return List.copyOf(result);
    }

    public double centerX(LayoutAnchor anchor) {
        return cells.stream().mapToInt(anchor::worldX).average().orElseThrow() + .5;
    }

    public double centerZ(LayoutAnchor anchor) {
        return cells.stream().mapToInt(anchor::worldZ).average().orElseThrow() + .5;
    }

    public CellStatus status(LayoutProgress progress, LayoutAnchor anchor) {
        boolean allDone = true, mismatch = false;
        for (var cell : cells) {
            var status = progress.at(anchor.worldX(cell), anchor.worldZ(cell));
            allDone &= status.isDone();
            mismatch |= status == CellStatus.MISMATCH;
        }
        return allDone ? CellStatus.DONE : mismatch ? CellStatus.MISMATCH : CellStatus.EMPTY;
    }
}
