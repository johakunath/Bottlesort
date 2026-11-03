// Tower bottles occupy side rails; ordinary bottles retain a centered grid.
export function boardLayout(shapes, width, height) {
  const towers = shapes.flatMap((shape, i) => shape === 'tower' ? [i] : []);
  const center = shapes.flatMap((shape, i) => shape !== 'tower' ? [i] : []);
  const towerHeight = Math.max(90, height - 72);
  const towerWidth = towerHeight / 10;
  const sideInset = towers.length ? towerWidth * 0.85 + 8 : 7;
  const availableWidth = Math.max(40, width - sideInset * 2);
  const availableHeight = Math.max(80, height - (towers.length ? 96 : 64));
  const aspect = center.some(i => shapes[i] === 'tall') ? 3.2 : 2.4;
  function size(rows) {
    const perRow = Math.ceil(center.length / rows);
    // CSS uses a minimum 6px gap, including on crowded phone boards.
    return Math.min((availableWidth - (perRow - 1) * 6) / (perRow + 0.6), availableWidth / (perRow * 1.2 + 0.4), availableHeight / (rows * aspect + (rows - 1) * 0.5 + 0.3));
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
    const count = base + (r < extra ? 1 : 0);
    grid.push(center.slice(offset, offset + count)); offset += count;
  }
  return { towers, grid, bottleWidth, towerWidth, towerHeight };
}
