/**
 * @module player
 * Player entity factory. No project dependencies.
 */

import { createWeapon, createFood, createArmor } from './item.js';

/**
 * @typedef {{
 *   x: number,
 *   y: number,
 *   hp: number,
 *   maxHp: number,
 *   attack: number,
 *   baseDefense: number,
 *   defense: number,
 *   equippedWeapon: import('./item.js').WeaponItem | null,
 *   hitBonus: number,
 *   damageBonus: number,
 *   equippedArmor: import('./item.js').ArmorItem | null,
 *   gold: number,
 *   xp: number,
 *   xpLevel: number,
 *   rank: string,
 *   inventory: import('./item.js').Item[]
 * }} Player
 */

/** Rank title for each xpLevel index. */
export const RANKS = ['Apprentice', 'Guild Novice', 'Journeyman', 'Adventurer'];

/** Minimum XP required for each rank level. */
const XP_THRESHOLDS = [0, 5, 20, 80];

/** HP regen period (turns) for each xpLevel. Lower = faster. */
export const REGEN_RATES = [40, 30, 20, 10];

/**
 * Compute xpLevel from an xp value using XP_THRESHOLDS.
 * Returns the highest level whose threshold is met.
 * @param {number} xp
 * @returns {number}
 */
export function xpToLevel(xp) {
  let level = 0;
  for (let i = 1; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]) level = i;
  }
  return level;
}

/**
 * Create a new player entity at the given map position.
 * Returns a plain, JSON-serializable object.
 * @param {number} x - Starting column.
 * @param {number} y - Starting row.
 * @returns {Player}
 */
export function createPlayer(x, y) {
  const sword = createWeapon('+1/+1 sword', 1, 1);
  const leatherArmor = createArmor('leather armor', 3);
  return {
    x,
    y,
    hp: 4,
    maxHp: 20,
    attack: 3,
    hitBonus: sword.hitBonus,
    damageBonus: sword.damageBonus,
    equippedWeapon: sword,
    baseDefense: 1,
    defense: 1 + leatherArmor.ac,
    equippedArmor: leatherArmor,
    gold: 0,
    xp: 0,
    xpLevel: 0,
    rank: RANKS[0],
    inventory: [
      sword,
      leatherArmor,
      createFood('food ration'),
    ],
  };
}
