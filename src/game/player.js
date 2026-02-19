/**
 * @module player
 * Player entity factory. No project dependencies.
 */

/**
 * @typedef {{
 *   x: number,
 *   y: number,
 *   hp: number,
 *   maxHp: number,
 *   attack: number,
 *   defense: number,
 *   gold: number,
 *   xp: number,
 *   level: number
 * }} Player
 */

/**
 * Create a new player entity at the given map position.
 * Returns a plain, JSON-serializable object.
 * @param {number} x - Starting column.
 * @param {number} y - Starting row.
 * @returns {Player}
 */
export function createPlayer(x, y) {
  return {
    x,
    y,
    hp: 20,
    maxHp: 20,
    attack: 3,
    defense: 1,
    gold: 0,
    xp: 0,
    level: 1,
  };
}
