/**
 * @module room
 * Sector layout, room generation, and room carving utilities.
 */

import { TILE, makeCell } from './tiles.js';

/**
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 * @typedef {Rect} Room   Interior bounds; walls are carved 1 tile outside.
 * @typedef {Rect} Sector Map sub-region assigned to one room.
 */

/** Fixed column widths summing to MAP_WIDTH (80). */
const COL_WIDTHS = [26, 26, 28];
/** Fixed row heights summing to MAP_HEIGHT (22). */
const ROW_HEIGHTS = [7, 7, 8];

/**
 * Divide the map into a 3×3 grid of sectors.
 * Each sector is a non-overlapping rectangle covering the whole map.
 * @param {number} mapWidth
 * @param {number} mapHeight
 * @returns {Sector[]} Array of 9 sectors in row-major order.
 */
export function buildSectors(mapWidth, mapHeight) {
  const sectors = [];
  let offsetY = 0;
  for (let row = 0; row < 3; row++) {
    let offsetX = 0;
    for (let col = 0; col < 3; col++) {
      sectors.push({
        x: offsetX,
        y: offsetY,
        width: COL_WIDTHS[col],
        height: ROW_HEIGHTS[row],
      });
      offsetX += COL_WIDTHS[col];
    }
    offsetY += ROW_HEIGHTS[row];
  }
  return sectors;
}

/**
 * Generate a random room placed within a sector with 2-tile padding.
 * Minimum interior size is 3×3.
 * @param {Sector} sector
 * @param {() => number} rng - Returns a float in [0, 1).
 * @returns {Room}
 */
export function generateRoom(sector, rng) {
  const pad = 2;
  // Available space for the room interior (walls add 1 on each side, padding adds pad on each side)
  const outerPad = pad + 1; // wall thickness + padding
  const maxInteriorW = sector.width - outerPad * 2;
  const maxInteriorH = sector.height - outerPad * 2;

  const minInterior = 3;
  const interiorW = minInterior + Math.floor(rng() * (maxInteriorW - minInterior + 1));
  const interiorH = minInterior + Math.floor(rng() * (maxInteriorH - minInterior + 1));

  // Clamp to safe range
  const safeW = Math.max(minInterior, Math.min(interiorW, maxInteriorW));
  const safeH = Math.max(minInterior, Math.min(interiorH, maxInteriorH));

  // Position the interior within the sector (accounting for walls + padding)
  const maxOriginX = sector.x + sector.width - outerPad - safeW;
  const maxOriginY = sector.y + sector.height - outerPad - safeH;
  const minOriginX = sector.x + outerPad;
  const minOriginY = sector.y + outerPad;

  const rangeX = Math.max(0, maxOriginX - minOriginX);
  const rangeY = Math.max(0, maxOriginY - minOriginY);

  const x = minOriginX + Math.floor(rng() * (rangeX + 1));
  const y = minOriginY + Math.floor(rng() * (rangeY + 1));

  return { x, y, width: safeW, height: safeH };
}

/**
 * Carve a room into the map: WALL perimeter + FLOOR interior.
 * @param {Cell[][]} map - map[y][x]
 * @param {Room} room
 */
export function carveRoom(map, room) {
  const { x, y, width, height } = room;
  for (let dy = -1; dy <= height; dy++) {
    for (let dx = -1; dx <= width; dx++) {
      const mx = x + dx;
      const my = y + dy;
      if (my < 0 || my >= map.length || mx < 0 || mx >= map[0].length) continue;
      const isPerimeter = dx === -1 || dx === width || dy === -1 || dy === height;
      map[my][mx] = makeCell(isPerimeter ? TILE.WALL : TILE.FLOOR);
    }
  }
}

/**
 * Return the center coordinate of a room's interior.
 * @param {Room} room
 * @returns {{ x: number, y: number }}
 */
export function roomCenter(room) {
  return {
    x: room.x + Math.floor(room.width / 2),
    y: room.y + Math.floor(room.height / 2),
  };
}
