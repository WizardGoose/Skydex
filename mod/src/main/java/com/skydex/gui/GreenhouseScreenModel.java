package com.skydex.gui;

import com.skydex.data.GreenhouseBoard;
import com.skydex.data.GreenhouseCell;
import com.skydex.garden.GreenhouseCatalog;
import com.skydex.layout.CellStatus;
import com.skydex.layout.GreenhouseLayout;
import com.skydex.layout.LayoutCell;
import com.skydex.layout.LayoutMatch;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** A fixed 10 by 10, headlessly testable view of layout versus live board. */
public final class GreenhouseScreenModel {

    public static final int SIZE = 10;

    private final List<Cell> cells;
    private final List<Need> needs;
    private final List<Replacement> replacements;
    private final int leftToPlace;
    private final int mismatches;

    private GreenhouseScreenModel(
            List<Cell> cells, List<Need> needs, List<Replacement> replacements,
            int leftToPlace, int mismatches) {
        this.cells = List.copyOf(cells);
        this.needs = List.copyOf(needs);
        this.replacements = List.copyOf(replacements);
        this.leftToPlace = leftToPlace;
        this.mismatches = mismatches;
    }

    public static GreenhouseScreenModel build(GreenhouseLayout layout, GreenhouseBoard board) {
        Map<String, LayoutCell> wanted = new LinkedHashMap<>();
        if (layout != null) {
            for (LayoutCell cell : layout.cells()) {
                if (inside(cell.x(), cell.y())) {
                    wanted.put(cell.key(), cell);
                }
            }
        }

        Map<String, GreenhouseCell> observed = new LinkedHashMap<>();
        if (board != null) {
            for (GreenhouseCell cell : board.cells()) {
                if (inside(cell.x(), cell.y())) {
                    observed.put(cell.key(), cell);
                }
            }
        }

        List<Cell> cells = new ArrayList<>(SIZE * SIZE);
        Map<String, NeedCount> needCounts = new LinkedHashMap<>();
        List<Replacement> replacements = new ArrayList<>();
        int pending = 0;
        int wrong = 0;

        for (int y = 0; y < SIZE; y++) {
            for (int x = 0; x < SIZE; x++) {
                String key = x + "," + y;
                LayoutCell target = wanted.get(key);
                GreenhouseCell actual = observed.get(key);

                if (target == null) {
                    String shown = actual == null ? null : actual.id();
                    String ground = actual == null ? null : GreenhouseCatalog.ground(shown);
                    cells.add(new Cell(x, y, shown, ground,
                            actual == null ? State.EMPTY : State.OBSERVED));
                    continue;
                }

                CellStatus status = LayoutMatch.statusOf(target, actual == null ? null : actual.id());
                String targetId = target.displayName();
                String ground = target.hasGround()
                        ? target.ground() : GreenhouseCatalog.ground(targetId);
                if (status == CellStatus.DONE) {
                    cells.add(new Cell(x, y, actual == null ? targetId : actual.id(), ground, State.CORRECT));
                } else if (status == CellStatus.EMPTY) {
                    State state = target.isMutation() ? State.PENDING_MUTATION : State.PENDING_CROP;
                    cells.add(new Cell(x, y, targetId, ground, state));
                    pending++;
                    String canonical = GreenhouseCatalog.canonicalId(targetId);
                    String needKey = canonical == null ? targetId : canonical;
                    NeedCount count = needCounts.get(needKey);
                    if (count == null) {
                        needCounts.put(needKey, new NeedCount(targetId, target.isMutation(), 1));
                    } else {
                        count.count++;
                    }
                } else {
                    String actualId = actual == null ? targetId : actual.id();
                    cells.add(new Cell(x, y, actualId, ground, State.REPLACE));
                    replacements.add(new Replacement(
                            actualId, GreenhouseCatalog.displayName(actualId),
                            targetId, GreenhouseCatalog.displayName(targetId)));
                    wrong++;
                }
            }
        }

        List<Need> needs = new ArrayList<>(needCounts.size());
        for (NeedCount count : needCounts.values()) {
            needs.add(new Need(count.id, GreenhouseCatalog.displayName(count.id), count.count,
                    count.mutation));
        }
        return new GreenhouseScreenModel(cells, needs, replacements, pending, wrong);
    }

    private static boolean inside(int x, int y) {
        return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
    }

    public List<Cell> cells() { return cells; }
    public Cell cell(int x, int y) { return cells.get(y * SIZE + x); }
    public List<Need> needs() { return needs; }
    public List<Replacement> replacements() { return replacements; }
    public int leftToPlace() { return leftToPlace; }
    public int mismatches() { return mismatches; }

    public enum State {
        EMPTY,
        OBSERVED,
        CORRECT,
        PENDING_CROP,
        PENDING_MUTATION,
        REPLACE
    }

    public record Cell(int x, int y, String plantId, String ground, State state) {
    }

    public record Need(String plantId, String displayName, int count, boolean mutation) {
    }

    public record Replacement(
            String actualId, String actualName, String targetId, String targetName) {
    }

    private static final class NeedCount {
        private final String id;
        private final boolean mutation;
        private int count;

        private NeedCount(String id, boolean mutation, int count) {
            this.id = id;
            this.mutation = mutation;
            this.count = count;
        }
    }
}
