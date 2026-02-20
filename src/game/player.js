/**
 * @module player
 * Player entity factory. No project dependencies.
 */

import { createWeapon, createFood } from './item.js';

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
 *   xpLevel: number,
 *   rank: string,
 *   inventory: import('./item.js').Item[]
 * }} Player
 */

/** Rank title for each xpLevel index. */
export const RANKS = ['Amateur', 'Brawler'];

/**
 * Compute xpLevel from an xp value.
 * 0 XP → level 0; 1+ XP → level 1 (table-driven, expand RANKS to add tiers).
 * @param {number} xp
 * @returns {number}
 */
export function xpToLevel(xp) {
  if (xp <= 0) return 0;
  return Math.min(RANKS.length - 1, 1);
}

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
    hp: 4,
    maxHp: 20,
    attack: 3,
    defense: 1,
    gold: 0,
    xp: 0,
    xpLevel: 0,
    rank: RANKS[0],
    inventory: [
      createWeapon('+1/+1 sword', 1, 1),
      createFood('food ration'),
    ],
  };
}
