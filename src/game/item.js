/**
 * @module item
 * Item typedefs and factory functions. No project dependencies.
 */

/**
 * @typedef {{ type: 'weapon', name: string, hitBonus: number, damageBonus: number }} WeaponItem
 * @typedef {{ type: 'food',   name: string }} FoodItem
 * @typedef {WeaponItem | FoodItem} Item
 */

/**
 * Create a weapon item.
 * @param {string} name
 * @param {number} hitBonus    - Added to the hit roll.
 * @param {number} damageBonus - Added to damage dealt.
 * @returns {WeaponItem}
 */
export function createWeapon(name, hitBonus, damageBonus) {
  return { type: 'weapon', name, hitBonus, damageBonus };
}

/**
 * Create a food item.
 * @param {string} name
 * @returns {FoodItem}
 */
export function createFood(name) {
  return { type: 'food', name };
}
