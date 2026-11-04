// Every bottle is drawn so one segment covers the same on-screen area:
// small shapes get a volume scale (flask ~1.31x round), towers match round.
// Towers stand directly beside the center grid.
import { SHAPES, isTowerShape } from './bottle-design.js';
import { volumeScale } from './pour-physics.js';

export const TOWER_GAP = 0.05;      // extra gap beyond the row padding, in bottle widths

export function boardLayout(shapes, width, height) {
  const towers = shapes.flatMap((shape, i) => isTowerShape(shape) ? [i] : []);
  const center = shapes.flatMap((shape, i) => !isTowerShape(shape) ? [i] : []);
  const scale = shapes.map(s => isTowerShape(s) ? 1 : volumeScale(s));
  const aspect = shapes.map(s => SHAPES[s]?.aspect || 2.4);
  const towerAspect = Math.max(0, ...towers.map(i => aspect[i]));
  const towerUnits = towers.length * (1 + TOWER_GAP);
  const availableWidth = Math.max(40, width - 14);
  const availableHeight = Math.max(80, height - (towers.length ? 96 : 64));

  function split(rows) {
    const grid = [], base = Math.floor(center.length / rows), extra = center.length % rows;
    let offset = 0;
    for (let r = 0; r < rows; r++) {
      const count = base + (r >= rows - extra ? 1 : 0);   // shorter rows on top, full rows beside the towers
      grid.push(center.slice(offset, offset + count)); offset += count;
    }
    return grid;
  }
  function size(rows) {
    let best = Infinity, gridHeight = (rows - 1) * 0.5 + 0.3;
    for (const row of split(rows)) {
      const n = row.length, widths = row.reduce((sum, i) => sum + scale[i], 0);
      // CSS uses a minimum 6px gap (0.2 bottle widths otherwise) and 0.3 bw row padding.
      best = Math.min(best,
        (availableWidth - (n - 1) * 6) / (widths + 0.6 + towerUnits),
        availableWidth / (widths + 0.2 * (n - 1) + 0.6 + towerUnits));
      gridHeight += Math.max(0, ...row.map(i => aspect[i] * scale[i]));
    }
    const needed = Math.max(gridHeight, towers.length ? towerAspect + 0.3 : 0);
    return Math.min(best, availableHeight / needed);
  }
  let rows = 1, best = size(1);
  for (let r = 2; r <= Math.min(5, center.length); r++) {
    const candidate = size(r);
    if (candidate > best * 1.04) { rows = r; best = candidate; }
  }
  const bottleWidth = Math.max(12, Math.min(100, Math.floor(best)));
  return {
    towers, grid: split(rows), bottleWidth, scale,
    towerWidth: bottleWidth, towerHeight: Math.round(bottleWidth * towerAspect), towerGap: bottleWidth * TOWER_GAP
  };
}
