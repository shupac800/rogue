/**
 * @module tiles
 * Tile type definitions and cell factory for the dungeon map.
 * No project dependencies — safe to import from anywhere.
 */

/**
 * Numeric tile-type enum.
 * @readonly
 * @enum {number}
 */
export const TILE = Object.freeze({
  VOID: 0,
  WALL: 1,
  FLOOR: 2,
  CORRIDOR: 3,
  DOOR: 4,
  STAIRS_UP: 5,
  STAIRS_DOWN: 6,
});

/**
 * Display character for each tile type.
 * @readonly
 * @type {Object.<number, string>}
 */
export const TILE_CHAR = Object.freeze({
  [TILE.VOID]: ' ',
  [TILE.WALL]: '#',
  [TILE.FLOOR]: '.',
  [TILE.CORRIDOR]: '+',
  [TILE.DOOR]: '+',
  [TILE.STAIRS_UP]: '<',
  [TILE.STAIRS_DOWN]: '>',
});

/**
 * Create a fresh map cell with default visibility state.
 * alwaysVisible: set true for permanently lit tiles (illuminated rooms);
 * resetVisibility will leave these cells visible every turn.
 * @param {number} type - One of the TILE values.
 * @returns {{ type: number, visible: boolean, visited: boolean, alwaysVisible: boolean }}
 */
export function makeCell(type) {
  return { type, visible: false, visited: false, alwaysVisible: false };
}
