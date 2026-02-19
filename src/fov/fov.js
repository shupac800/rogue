/**
 * @module fov
 * Recursive shadowcasting FOV (Björn Bergström algorithm).
 * Mutates cell.visible and cell.visited on the dungeon map.
 * All other game state is untouched.
 */

import { TILE } from '../dungeon/tiles.js';
import { OCTANTS } from './octants.js';

/**
 * Return true when the tile type blocks line of sight.
 * VOID and WALL block; all other types are transparent.
 * @param {number} type - A TILE value.
 * @returns {boolean}
 */
export function isBlocking(type) {
  return type === TILE.VOID || type === TILE.WALL;
}

/**
 * Reset visible flag on every cell to false.
 * visited flags are left untouched (sticky by design).
 * @param {Array<Array<{type:number,visible:boolean,visited:boolean}>>} map
 */
export function resetVisibility(map) {
  for (const row of map) {
    for (const cell of row) {
      cell.visible = false;
    }
  }
}

/**
 * Mark a single cell as currently visible and permanently visited.
 * Silently ignores out-of-bounds coordinates.
 * @param {Array<Array<{type:number,visible:boolean,visited:boolean}>>} map
 * @param {number} x
 * @param {number} y
 */
export function markVisible(map, x, y) {
  if (y < 0 || y >= map.length) return;
  if (x < 0 || x >= map[0].length) return;
  map[y][x].visible = true;
  map[y][x].visited = true;
}

/**
 * Scan one octant using recursive shadowcasting.
 * Marks tiles visible before the blocking check so wall faces are always lit.
 * @param {Array<Array<{type:number,visible:boolean,visited:boolean}>>} map
 * @param {{x:number,y:number}} origin
 * @param {number} radius
 * @param {(row:number,col:number)=>{dx:number,dy:number}} transform
 * @param {number} row - Current scan row (starts at 1).
 * @param {number} startSlope - Upper slope boundary of the visible arc [0..1].
 * @param {number} endSlope - Lower slope boundary of the visible arc [0..1].
 */
export function scanOctant(map, origin, radius, transform, row, startSlope, endSlope) {
  if (row > radius || startSlope < endSlope) return;

  const height = map.length;
  const width  = map[0]?.length ?? 0;
  let prevBlocked = false;
  let savedStart  = startSlope;

  for (let col = Math.floor(row * startSlope); col >= Math.ceil(row * endSlope); col--) {
    const { dx, dy } = transform(row, col);
    const wx = origin.x + dx;
    const wy = origin.y + dy;

    const inBounds = wx >= 0 && wx < width && wy >= 0 && wy < height;

    if (inBounds) markVisible(map, wx, wy);

    const blocked = !inBounds || isBlocking(map[wy][wx].type);

    if (prevBlocked) {
      if (!blocked) {
        prevBlocked = false;
        savedStart  = (col + 0.5) / row;
      }
    } else if (blocked) {
      prevBlocked = true;
      scanOctant(map, origin, radius, transform, row + 1, savedStart, (col + 0.5) / row);
    }
  }

  if (!prevBlocked) {
    scanOctant(map, origin, radius, transform, row + 1, savedStart, endSlope);
  }
}

/**
 * Compute the field of view from origin up to radius tiles away.
 * Resets all visible flags, then lights tiles in line of sight.
 * Previously visited tiles retain their visited flag (fog of war).
 * @param {Array<Array<{type:number,visible:boolean,visited:boolean}>>} map
 * @param {{x:number,y:number}} origin - Player position.
 * @param {number} radius - Maximum sight range in tiles.
 */
export function computeFov(map, origin, radius) {
  resetVisibility(map);
  markVisible(map, origin.x, origin.y);
  for (const transform of OCTANTS) {
    scanOctant(map, origin, radius, transform, 1, 1.0, 0.0);
  }
}
