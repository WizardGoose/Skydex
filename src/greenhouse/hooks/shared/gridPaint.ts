export type GridCell = readonly [number, number];

/** A placement opens its details only for a stationary primary-button click. */
export const isPlacementInfoClick = (
  button: number,
  deltaX: number,
  deltaY: number,
  threshold = 5,
): boolean => button === 0 && deltaX < threshold && deltaY < threshold;

/** Every grid cell crossed by a pointer move, including both ends. */
export const gridLineCells = (from: GridCell, to: GridCell): [number, number][] => {
  let row = from[0];
  let col = from[1];
  const endRow = to[0];
  const endCol = to[1];
  const dCol = Math.abs(endCol - col);
  const dRow = Math.abs(endRow - row);
  const stepCol = col < endCol ? 1 : -1;
  const stepRow = row < endRow ? 1 : -1;
  let error = dCol - dRow;
  const cells: [number, number][] = [];

  while (true) {
    cells.push([row, col]);
    if (row === endRow && col === endCol) return cells;
    const doubled = error * 2;
    if (doubled > -dRow) {
      error -= dRow;
      col += stepCol;
    }
    if (doubled < dCol) {
      error += dCol;
      row += stepRow;
    }
  }
};
