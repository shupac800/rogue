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
 *   equippedRings: [import('./item.js').RingItem | null, import('./item.js').RingItem | null],
 *   ringDefenseBonus: number,
 *   ringDamageBonus: number,
 *   ringHitBonus: number,
 *   gold: number,
 *   xp: number,
 *   xpLevel: number,
 *   rank: string,
 *   inventory: import('./item.js').Item[]
 * }} Player
 */

/** Rank title for each xpLevel index. Index 0 is the starting rank (no title). */
export const RANKS = [
  '', 'Guild Novice', 'Apprentice', 'Journeyman', 'Adventurer',
  'Fighter', 'Warrior', 'Rogue', 'Champion', 'Master Rogue',
  'Warlord', 'Hero', 'Guild Master', 'DragonLord', 'Wizard',
];

/** Minimum XP required for each rank level. */
export const XP_THRESHOLDS = [
  0, 5, 20, 80, 200,
  500, 1000, 2000, 4000, 8000,
  15000, 30000, 60000, 120000, 250000,
];

/** HP regen period (turns) for each xpLevel. Lower = faster. */
export const REGEN_RATES = [
  40, 38, 35, 32, 29,
  26, 23, 20, 18, 16,
  14, 12, 10, 8, 5,
];

/**
 * Max HP increase granted when reaching each rank (indexed by new xpLevel).
 * Index 0 unused (no promotion to rank 0); values grow with rank.
 */
export const HP_PER_RANK = [
  0, 3, 4, 5, 6,
  7, 8, 9, 10, 12,
  14, 16, 18, 20, 25,
];

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
    hp: 5,
    maxHp: 5,
    attack: 3,
    hitBonus: sword.hitBonus,
    damageBonus: sword.damageBonus,
    equippedWeapon: sword,
    baseDefense: 1,
    defense: 1 + leatherArmor.ac,
    equippedArmor: leatherArmor,
    equippedRings: [null, null],
    ringDefenseBonus: 0,
    ringDamageBonus: 0,
    ringHitBonus: 0,
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
