package com.skydex;

import com.skydex.layout.GreenhouseLayout;
import com.skydex.layout.GridOrientation;
import com.skydex.layout.LayoutAnchor;
import com.skydex.layout.LayoutCell;
import com.skydex.layout.LayoutParser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The grid-to-world mapping decides where every ghost marker lands. Getting it
 * wrong puts the whole overlay in the wrong place, and that is miserable to
 * debug by eye in game — so it is pinned down hard here.
 */
class GridMappingTest {

    private static final int AX = 100;
    private static final int AY = 70;
    private static final int AZ = -50;

    private static LayoutAnchor anchor(GridOrientation orientation) {
        return new LayoutAnchor(AX, AY, AZ, orientation);
    }

    @Test
    @DisplayName("cell (0,0) is the anchor block itself in every orientation")
    void originIsInvariant() {
        for (GridOrientation orientation : GridOrientation.values()) {
            LayoutAnchor a = anchor(orientation);
            assertEquals(AX, a.worldX(0, 0), "worldX for " + orientation);
            assertEquals(AZ, a.worldZ(0, 0), "worldZ for " + orientation);
            assertEquals(AY, a.y());
        }
    }

    @Test
    @DisplayName("R0 runs grid x east (+X) and grid y south (+Z)")
    void defaultOrientation() {
        LayoutAnchor a = anchor(GridOrientation.R0);
        assertEquals(AX + 2, a.worldX(2, 1));
        assertEquals(AZ + 1, a.worldZ(2, 1));
        // Unit vectors.
        assertEquals(AX + 1, a.worldX(1, 0));
        assertEquals(AZ, a.worldZ(1, 0));
        assertEquals(AX, a.worldX(0, 1));
        assertEquals(AZ + 1, a.worldZ(0, 1));
    }

    @Test
    @DisplayName("R90 is a clockwise quarter turn: grid x runs south, grid y runs west")
    void rotated90() {
        LayoutAnchor a = anchor(GridOrientation.R90);
        assertEquals(AX, a.worldX(1, 0));
        assertEquals(AZ + 1, a.worldZ(1, 0));
        assertEquals(AX - 1, a.worldX(0, 1));
        assertEquals(AZ, a.worldZ(0, 1));
        assertEquals(AX - 1, a.worldX(2, 1));
        assertEquals(AZ + 2, a.worldZ(2, 1));
    }

    @Test
    @DisplayName("R180 mirrors both axes")
    void rotated180() {
        LayoutAnchor a = anchor(GridOrientation.R180);
        assertEquals(AX - 1, a.worldX(1, 0));
        assertEquals(AZ, a.worldZ(1, 0));
        assertEquals(AX, a.worldX(0, 1));
        assertEquals(AZ - 1, a.worldZ(0, 1));
        assertEquals(AX - 2, a.worldX(2, 1));
        assertEquals(AZ - 1, a.worldZ(2, 1));
    }

    @Test
    @DisplayName("R270 runs grid x north and grid y east")
    void rotated270() {
        LayoutAnchor a = anchor(GridOrientation.R270);
        assertEquals(AX, a.worldX(1, 0));
        assertEquals(AZ - 1, a.worldZ(1, 0));
        assertEquals(AX + 1, a.worldX(0, 1));
        assertEquals(AZ, a.worldZ(0, 1));
        assertEquals(AX + 1, a.worldX(2, 1));
        assertEquals(AZ - 2, a.worldZ(2, 1));
    }

    @Test
    @DisplayName("each quarter turn is the previous one rotated clockwise again")
    void quarterTurnsCompose() {
        // Rotating (dx,dz) clockwise from above is (-dz, dx). Applying the
        // orientation's own offsets must agree with rotating R0's result.
        for (int gx = -3; gx <= 3; gx++) {
            for (int gy = -3; gy <= 3; gy++) {
                int dx = GridOrientation.R0.offsetX(gx, gy);
                int dz = GridOrientation.R0.offsetZ(gx, gy);

                assertEquals(-dz, GridOrientation.R90.offsetX(gx, gy), "R90 x at " + gx + "," + gy);
                assertEquals(dx, GridOrientation.R90.offsetZ(gx, gy), "R90 z at " + gx + "," + gy);

                assertEquals(-dx, GridOrientation.R180.offsetX(gx, gy));
                assertEquals(-dz, GridOrientation.R180.offsetZ(gx, gy));

                assertEquals(dz, GridOrientation.R270.offsetX(gx, gy));
                assertEquals(-dx, GridOrientation.R270.offsetZ(gx, gy));
            }
        }
    }

    @Test
    @DisplayName("four rotations return to the start")
    void rotationCycles() {
        LayoutAnchor a = anchor(GridOrientation.R0);
        LayoutAnchor round = a.rotated().rotated().rotated().rotated();
        assertSame(GridOrientation.R0, round.orientation());
        // The corner never moves while the grid swings around it.
        assertEquals(a.x(), round.x());
        assertEquals(a.y(), round.y());
        assertEquals(a.z(), round.z());

        assertSame(GridOrientation.R90, GridOrientation.R0.next());
        assertSame(GridOrientation.R180, GridOrientation.R90.next());
        assertSame(GridOrientation.R270, GridOrientation.R180.next());
        assertSame(GridOrientation.R0, GridOrientation.R270.next());
    }

    @Test
    @DisplayName("distinct cells never collide on the same block")
    void mappingIsInjective() {
        for (GridOrientation orientation : GridOrientation.values()) {
            LayoutAnchor a = anchor(orientation);
            Set<String> seen = new HashSet<>();
            for (int gx = 0; gx < 10; gx++) {
                for (int gy = 0; gy < 7; gy++) {
                    String key = a.worldX(gx, gy) + ":" + a.worldZ(gx, gy);
                    assertTrue(seen.add(key),
                            orientation + " mapped two cells onto " + key);
                }
            }
            assertEquals(70, seen.size());
        }
    }

    @Test
    @DisplayName("a non-symmetric cell lands somewhere different in each orientation")
    void orientationsAreDistinct() {
        Set<String> positions = new HashSet<>();
        for (GridOrientation orientation : GridOrientation.values()) {
            LayoutAnchor a = anchor(orientation);
            positions.add(a.worldX(3, 1) + ":" + a.worldZ(3, 1));
        }
        assertEquals(4, positions.size(), "all four orientations should differ: " + positions);
    }

    @Test
    @DisplayName("the spec's example pair stays horizontally adjacent in all 4 rotations")
    void specExamplePairStaysAdjacent() {
        // Spec pin: x is the column and y the row, so {x:0,y:3} and {x:1,y:3}
        // are horizontal neighbours. Parsed from the spec body rather than
        // hand-built, so the coordinate convention is checked end to end.
        GreenhouseLayout layout = LayoutParser.parse(LayoutParserTest.SPEC_EXAMPLE);
        LayoutCell left = layout.cells().get(0);
        LayoutCell right = layout.cells().get(1);
        assertEquals(0, left.x());
        assertEquals(3, left.y());
        assertEquals(1, right.x());
        assertEquals(3, right.y());
        assertEquals("Cocoa Beans", left.crop());
        assertEquals("Choconut", right.mutation());

        for (GridOrientation orientation : GridOrientation.values()) {
            LayoutAnchor a = anchor(orientation);
            int dx = a.worldX(right) - a.worldX(left);
            int dz = a.worldZ(right) - a.worldZ(left);

            assertEquals(1, Math.abs(dx) + Math.abs(dz),
                    orientation + ": neighbours must stay exactly one block apart");
            assertTrue((dx == 0) != (dz == 0),
                    orientation + ": they must differ on exactly one axis, got dx=" + dx + " dz=" + dz);
        }

        // And specifically, grid-x runs along the axis each rotation implies.
        assertEquals(1, anchor(GridOrientation.R0).worldX(right) - anchor(GridOrientation.R0).worldX(left));
        assertEquals(0, anchor(GridOrientation.R0).worldZ(right) - anchor(GridOrientation.R0).worldZ(left));

        assertEquals(0, anchor(GridOrientation.R90).worldX(right) - anchor(GridOrientation.R90).worldX(left));
        assertEquals(1, anchor(GridOrientation.R90).worldZ(right) - anchor(GridOrientation.R90).worldZ(left));

        assertEquals(-1, anchor(GridOrientation.R180).worldX(right) - anchor(GridOrientation.R180).worldX(left));
        assertEquals(0, anchor(GridOrientation.R180).worldZ(right) - anchor(GridOrientation.R180).worldZ(left));

        assertEquals(0, anchor(GridOrientation.R270).worldX(right) - anchor(GridOrientation.R270).worldX(left));
        assertEquals(-1, anchor(GridOrientation.R270).worldZ(right) - anchor(GridOrientation.R270).worldZ(left));
    }

    @Test
    @DisplayName("grid (0,0) is the anchor corner and the grid extends from it")
    void gridExtendsFromAnchorCorner() {
        GreenhouseLayout layout = LayoutParser.parse("""
                {"schema":1,"label":"L","size":[10,10],"cells":[{"x":0,"y":0,"crop":"Wheat"}]}""");
        LayoutCell origin = layout.cells().get(0);
        for (GridOrientation orientation : GridOrientation.values()) {
            LayoutAnchor a = anchor(orientation);
            assertEquals(AX, a.worldX(origin), orientation.toString());
            assertEquals(AZ, a.worldZ(origin), orientation.toString());
        }
    }

    @Test
    @DisplayName("orientation survives a degrees round trip")
    void degreesRoundTrip() {
        for (GridOrientation orientation : GridOrientation.values()) {
            assertSame(orientation,
                    GridOrientation.fromDegrees(orientation.degrees(), GridOrientation.R0));
        }
        // Normalised, and unknown values fall back rather than throwing.
        assertSame(GridOrientation.R90, GridOrientation.fromDegrees(450, GridOrientation.R0));
        assertSame(GridOrientation.R270, GridOrientation.fromDegrees(-90, GridOrientation.R0));
        assertSame(GridOrientation.R180, GridOrientation.fromDegrees(37, GridOrientation.R180));
    }

    @Test
    @DisplayName("works away from the origin and across negative coordinates")
    void handlesNegativeCoordinates() {
        LayoutAnchor a = new LayoutAnchor(-1200, 64, -3400, GridOrientation.R90);
        assertEquals(-1200 - 4, a.worldX(0, 4));
        assertEquals(-3400 + 9, a.worldZ(9, 4));
        assertNotEquals(a.worldX(1, 1), a.worldX(2, 2));
    }
}
