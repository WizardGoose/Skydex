package com.skydex.garden;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * Finds the greenhouse bed inside a patch of scanned ground.
 *
 * <p>Pure array logic with no Minecraft types, so the part of the detection most
 * likely to be subtly wrong is the part that can be tested exhaustively. The
 * caller hands over a boolean grid of "is this block plantable floor" and gets
 * back the rectangle the bed occupies.
 *
 * <p>The bed is found as the <b>largest connected patch</b>, not the largest
 * rectangle of solid true. That distinction matters in practice: a real bed has
 * crops standing in it, decoration, maybe a path, so it is a rectangle with
 * holes. Requiring a perfect rectangle would find nothing. Taking the bounding
 * box of the biggest connected patch tolerates the holes, and the fill ratio is
 * then reported so the caller can reject a patch that is really an L-shaped
 * scattering of dirt rather than a bed.
 *
 * <p>Connectivity is 4-way. Diagonal connectivity would let two separate beds
 * touching at a corner merge into one bounding box covering both plus the gap.
 */
public final class BedShape {

    /**
     * A found bed: where it starts in grid coordinates, how big it is, and how
     * convincing it was.
     *
     * @param minX      first column of the bounding box
     * @param minZ      first row of the bounding box
     * @param width     columns spanned
     * @param height    rows spanned
     * @param cells     how many floor blocks the patch actually contains
     * @param fillRatio {@code cells} over the bounding box area, 0 to 1
     */
    public record Bed(int minX, int minZ, int width, int height, int cells, double fillRatio) {

        public int area() {
            return width * height;
        }

        public int maxX() {
            return minX + width - 1;
        }

        public int maxZ() {
            return minZ + height - 1;
        }

        /** True when the patch fills enough of its box to be a bed and not a smear. */
        public boolean isConvincing(int minCells, double minFill) {
            return cells >= minCells && fillRatio >= minFill && width >= 2 && height >= 2;
        }
    }

    private BedShape() {
    }

    /**
     * The largest connected patch of floor in the grid.
     *
     * @param floor {@code floor[x][z]}, true where the block is plantable
     * @return the patch's bounding box, or null when the grid is empty
     */
    public static Bed largestPatch(boolean[][] floor) {
        if (floor == null || floor.length == 0 || floor[0].length == 0) {
            return null;
        }
        int width = floor.length;
        int height = floor[0].length;
        boolean[][] seen = new boolean[width][height];

        Bed best = null;
        for (int x = 0; x < width; x++) {
            for (int z = 0; z < height; z++) {
                if (!floor[x][z] || seen[x][z]) {
                    continue;
                }
                Bed patch = flood(floor, seen, x, z);
                if (best == null || patch.cells() > best.cells()) {
                    best = patch;
                }
            }
        }
        return best;
    }

    /**
     * Walk one connected patch, recording its extent.
     *
     * <p>Iterative rather than recursive: a 31x31 search area is 961 cells, and
     * a recursive flood fill on a fully-floored one would be a thousand frames
     * deep on the client thread.
     */
    private static Bed flood(boolean[][] floor, boolean[][] seen, int startX, int startZ) {
        int width = floor.length;
        int height = floor[0].length;

        int minX = startX;
        int maxX = startX;
        int minZ = startZ;
        int maxZ = startZ;
        int cells = 0;

        Deque<int[]> queue = new ArrayDeque<>();
        queue.add(new int[]{startX, startZ});
        seen[startX][startZ] = true;

        while (!queue.isEmpty()) {
            int[] at = queue.removeFirst();
            int x = at[0];
            int z = at[1];
            cells++;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);

            for (int[] step : new int[][]{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}) {
                int nx = x + step[0];
                int nz = z + step[1];
                if (nx < 0 || nz < 0 || nx >= width || nz >= height) {
                    continue;
                }
                if (floor[nx][nz] && !seen[nx][nz]) {
                    seen[nx][nz] = true;
                    queue.add(new int[]{nx, nz});
                }
            }
        }

        int boxWidth = maxX - minX + 1;
        int boxHeight = maxZ - minZ + 1;
        double fill = (double) cells / (double) (boxWidth * boxHeight);
        return new Bed(minX, minZ, boxWidth, boxHeight, cells, fill);
    }
}
