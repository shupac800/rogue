/**
 * @module corridor
 * Corridor pair generation and L-shaped corridor carving.
 */

import { TILE, makeCell } from './tiles.js';

/**
 * @typedef {{ fromIdx: number, toIdx: number }} CorridorPair
 * @typedef {{ from: {x:number,y:number}, to: {x:number,y:number}, bend: {x:number,y:number} }} Corridor
 */

/**
 * Build the 12 adjacent sector pairs (6 horizontal + 6 vertical) for a 3×3 grid.
 * Sectors are indexed in row-major order (0-8).
 * @param {Array} sectors - Array of 9 sectors (used for length validation only).
 * @returns {CorridorPair[]} 12 pairs.
 */
export function buildCorridorPairs(sectors) {
  const pairs = [];
  // Horizontal adjacencies: (0,1),(1,2),(3,4),(4,5),(6,7),(7,8)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      pairs.push({ fromIdx: row * 3 + col, toIdx: row * 3 + col + 1 });
    }
  }
  // Vertical adjacencies: (0,3),(1,4),(2,5),(3,6),(4,7),(5,8)
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 2; row++) {
      pairs.push({ fromIdx: row * 3 + col, toIdx: (row + 1) * 3 + col });
    }
  }
  return pairs;
}

/**
 * Test whether map[y][x] is currently a WALL tile.
 * @param {Array} map - map[y][x]
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function isWallTile(map, x, y) {
  if (y < 0 || y >= map.length || x < 0 || x >= map[0].length) return false;
  return map[y][x].type === TILE.WALL;
}

/**
 * Carve a single cell of a corridor path.
 * VOID → CORRIDOR, WALL → DOOR, FLOOR unchanged.
 * @param {Array} map
 * @param {number} x
 * @param {number} y
 */
function carveStep(map, x, y) {
  if (y < 0 || y >= map.length || x < 0 || x >= map[0].length) return;
  const current = map[y][x].type;
  if (current === TILE.VOID) {
    map[y][x] = makeCell(TILE.CORRIDOR);
  } else if (current === TILE.WALL) {
    map[y][x] = makeCell(TILE.DOOR);
  }
  // FLOOR and existing CORRIDOR/DOOR tiles are left unchanged
}

/**
 * Carve an L-shaped corridor between two points (horizontal leg first, then vertical).
 * @param {Array} map - map[y][x]
 * @param {{ x: number, y: number }} from - Start point (room center).
 * @param {{ x: number, y: number }} to   - End point (room center).
 * @param {() => number} rng - Returns float in [0, 1); reserved for future variation.
 * @returns {Corridor}
 */
export function carveCorridor(map, from, to, rng) {
  const bend = { x: to.x, y: from.y };

  // Horizontal leg: from.y, from.x → bend.x
  const x0 = Math.min(from.x, bend.x);
  const x1 = Math.max(from.x, bend.x);
  for (let x = x0; x <= x1; x++) {
    carveStep(map, x, from.y);
  }

  // Vertical leg: bend.x, from.y → to.y
  const y0 = Math.min(from.y, to.y);
  const y1 = Math.max(from.y, to.y);
  for (let y = y0; y <= y1; y++) {
    carveStep(map, bend.x, y);
  }

  return { from: { ...from }, to: { ...to }, bend: { ...bend } };
}
