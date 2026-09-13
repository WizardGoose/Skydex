package com.skydex.gui;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.skydex.data.GreenhouseBoard;
import com.skydex.garden.GreenhouseCatalog;
import com.skydex.layout.GreenhouseLayout;
import com.skydex.layout.LayoutCell;
import com.skydex.layout.LayoutStore;

import java.util.LinkedHashMap;
import java.util.Map;

/** Data-only projection. The packaged HTML owns all geometry and typography. */
public final class WebUiModel {
    private WebUiModel() {}

    public static JsonObject layout(GreenhouseLayout layout, GreenhouseBoard board) {
        JsonObject out = new JsonObject();
        out.addProperty("id", layout == null ? "" : LayoutStore.savedId(layout));
        out.addProperty("name", layout == null ? "No layout loaded" : layout.label());
        out.addProperty("cells", layout == null ? 0 : layout.cellCount());
        GreenhouseScreenModel model = GreenhouseScreenModel.build(layout, board);
        int total = layout == null ? 0 : layout.cellCount();
        out.addProperty("progress", board == null ? "" : Math.max(0, total - model.leftToPlace() - model.mismatches()) + " / " + total);
        JsonArray placements = new JsonArray();
        for (var cell : model.cells()) {
            if (cell.plantId() == null) continue;
            JsonObject item = item(cell.plantId(), 1);
            item.addProperty("index", cell.y() * 10 + cell.x());
            item.addProperty("state", switch (cell.state()) {
                case CORRECT -> "correct";
                case PENDING_CROP -> "next";
                case PENDING_MUTATION -> "mutation";
                case REPLACE -> "replace";
                default -> "observed";
            });
            placements.add(item);
        }
        out.add("placements", placements);
        Map<String, Integer> counts = new LinkedHashMap<>();
        if (layout != null) for (LayoutCell cell : layout.cells()) {
            if (cell.isMutation()) counts.merge(GreenhouseCatalog.canonicalId(cell.displayName()), 1, Integer::sum);
        }
        // Intermediates used to grow another mutation are inputs, not final targets.
        var intermediate = new java.util.HashSet<String>();
        for (String id : counts.keySet()) for (var requirement : GreenhouseCatalog.requirements(id)) intermediate.add(requirement.cropId());
        counts.keySet().removeIf(intermediate::contains);
        boolean mutations = !counts.isEmpty();
        if (counts.isEmpty() && layout != null) for (LayoutCell cell : layout.cells()) {
            counts.merge(GreenhouseCatalog.canonicalId(cell.displayName()), 1, Integer::sum);
        }
        JsonArray targets = new JsonArray();
        Map<String, Integer> inputs = new LinkedHashMap<>();
        counts.forEach((id, count) -> {
            targets.add(item(id, count));
            for (var requirement : GreenhouseCatalog.requirements(id)) inputs.merge(requirement.cropId(), requirement.count() * count, Integer::sum);
        });
        JsonArray inputItems = new JsonArray();
        inputs.forEach((id, count) -> inputItems.add(item(id, count)));
        out.add("targets", targets);
        out.add("inputs", inputItems);
        out.addProperty("targetLabel", mutations ? "Target mutations" : "Targets");
        String summary = counts.entrySet().stream().map(e -> e.getValue() + " " + GreenhouseCatalog.displayName(e.getKey())).collect(java.util.stream.Collectors.joining(", "));
        out.addProperty("goal", layout == null ? "Import a layout" : (mutations ? "Grow " : "Plant ") + summary);
        if (!model.replacements().isEmpty()) {
            var replacement = model.replacements().getFirst();
            JsonObject row = new JsonObject();
            row.add("from", item(replacement.actualId(), 1));
            row.add("to", item(replacement.targetId(), 1));
            out.add("replacement", row);
        }
        return out;
    }

    private static JsonObject item(String id, int count) {
        JsonObject out = new JsonObject();
        out.addProperty("name", GreenhouseCatalog.displayName(id));
        out.addProperty("crop", GreenhouseCatalog.textureId(id));
        out.addProperty("qty", count);
        return out;
    }
}
