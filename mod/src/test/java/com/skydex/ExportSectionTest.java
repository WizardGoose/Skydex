package com.skydex;

import com.skydex.data.GreenhouseBoard;
import com.skydex.data.IslandSnapshot;
import com.skydex.export.ExportSection;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.EnumSet;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ExportSectionTest {

    @Test
    @DisplayName("the export dropdown removes exactly the unchecked groups")
    void selectsIndependentGroups() {
        IslandSnapshot snapshot = Fixtures.snapshot()
                .enderChest(List.of())
                .storage(List.of())
                .greenhouse(new GreenhouseBoard(1L, 10, 10, List.of()));
        String json = snapshot.onlySections(EnumSet.of(
                ExportSection.SACKS,
                ExportSection.ENDER_CHEST,
                ExportSection.GREENHOUSE)).toMinifiedJson();

        assertTrue(json.contains("\"sacks\""), json);
        assertTrue(json.contains("\"enderChest\":[]"), json);
        assertTrue(json.contains("\"greenhouse\""), json);
        assertFalse(json.contains("\"chests\""), json);
        assertFalse(json.contains("\"inventory\""), json);
        assertFalse(json.contains("\"storage\""), json);
        assertTrue(json.contains("\"player\""), "identity always remains");
        assertTrue(json.contains("\"profile\""), "profile always remains");
    }

    @Test
    @DisplayName("choosing no groups still yields an attributable envelope")
    void emptySelectionKeepsIdentity() {
        String json = Fixtures.snapshot().onlySections(EnumSet.noneOf(ExportSection.class))
                .toMinifiedJson();
        assertTrue(json.contains("\"player\""), json);
        assertTrue(json.contains("\"profile\""), json);
        assertFalse(json.contains("\"sacks\""), json);
        assertFalse(json.contains("\"chests\""), json);
        assertFalse(json.contains("\"inventory\""), json);
    }
}
