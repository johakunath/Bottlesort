// Towers are drawn at the same scale as the small bottles (one segment = one
// segment of liquid) and stand directly beside the center grid.
export const TOWER_ASPECT = 5.84;   // SHAPES.tower.vbH / 100
export const TOWER_GAP = 0.05;      // extra gap beyond the row padding, in bottle widths

export function boardLayout(shapes, width, height) {
  const towers = shapes.flatMap((shape, i) => shape === 'tower' ? [i] : []);
  const center = shapes.flatMap((shape, i) => shape !== 'tower' ? [i] : []);
  const towerUnits = towers.length * (1 + TOWER_GAP);
  const availableWidth = Math.max(40, width - 14);
  const availableHeight = Math.max(80, height - (towers.length ? 96 : 64));
  const aspect = center.some(i => shapes[i] === 'tall') ? 3.2 : 2.4;
  function size(rows) {
    const perRow = Math.ceil(center.length / rows);
    const gridHeight = rows * aspect + (rows - 1) * 0.5 + 0.3;
    const height = Math.max(gridHeight, towers.length ? TOWER_ASPECT + 0.3 : 0);
    // CSS uses a minimum 6px gap, including on crowded phone boards.
    return Math.min(
      (availableWidth - (perRow - 1) * 6) / (perRow + 0.6 + towerUnits),
      availableWidth / (perRow * 1.2 + 0.4 + towerUnits),
      availableHeight / height);
  }
  let rows = 1, best = size(1);
  for (let r = 2; r <= Math.min(5, center.length); r++) {
    const candidate = size(r);
    if (candidate > best * 1.04) { rows = r; best = candidate; }
  }
  const bottleWidth = Math.max(12, Math.min(100, Math.floor(best)));
  const grid = [];
  const base = Math.floor(center.length / rows), extra = center.length % rows;
  let offset = 0;
  for (let r = 0; r < rows; r++) {
    const count = base + (r >= rows - extra ? 1 : 0);   // shorter rows on top, full rows beside the towers
    grid.push(center.slice(offset, offset + count)); offset += count;
  }
  return { towers, grid, bottleWidth, towerWidth: bottleWidth, towerHeight: Math.round(bottleWidth * TOWER_ASPECT), towerGap: bottleWidth * TOWER_GAP };
}
