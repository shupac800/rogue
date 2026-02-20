/**
 * @module monster
 * Monster factory. No project dependencies.
 */

/**
 * @typedef {{
 *   x: number,
 *   y: number,
 *   hp: number,
 *   maxHp: number,
 *   attack: number,
 *   defense: number,
 *   name: string,
 *   char: string
 * }} Monster
 */

/**
 * Create a rat monster at the given position.
 * @param {number} x
 * @param {number} y
 * @returns {Monster}
 */
export function createMonster(x, y) {
  return { x, y, hp: 5, maxHp: 5, attack: 2, defense: 0, name: 'rat', char: 'r' };
}
