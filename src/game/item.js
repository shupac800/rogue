/**
 * @module item
 * Item typedefs, factory functions, and random dungeon item generation.
 * No project dependencies.
 */

/**
 * @typedef {{ type: 'weapon', name: string, hitBonus: number, damageBonus: number }} WeaponItem
 * @typedef {{ type: 'food',   name: string }} FoodItem
 * @typedef {{ type: 'potion', name: string }} PotionItem
 * @typedef {{ type: 'scroll', name: string }} ScrollItem
 * @typedef {{ type: 'armor',  name: string, ac: number }} ArmorItem
 * @typedef {{ type: 'ring',   name: string }} RingItem
 * @typedef {{ type: 'wand',   name: string, charges: number }} WandItem
 * @typedef {WeaponItem|FoodItem|PotionItem|ScrollItem|ArmorItem|RingItem|WandItem} Item
 */

// ---------------------------------------------------------------------------
// Item name tables
// ---------------------------------------------------------------------------

const FOODS   = ['food ration', 'slime mold'];
const POTIONS = [
  'healing', 'extra healing', 'poison', 'confusion', 'blindness',
  'haste self', 'see invisible', 'gain strength', 'raise level', 'restore strength',
  'levitation', 'monster detection', 'hallucination', 'paralysis',
];
const SCROLLS = [
  'identify', 'enchant weapon', 'enchant armor', 'magic mapping',
  'teleportation', 'remove curse', 'scare monster', 'hold monster',
  'aggravate monsters', 'light', 'create monster', 'protect armor',
];
const WEAPON_NAMES = ['mace', 'long sword', 'dagger', 'spear', 'short bow', 'two handed sword'];
const ARMORS = [
  { name: 'leather armor',    ac: 3 },
  { name: 'ring mail',        ac: 4 },
  { name: 'studded leather armor',  ac: 4 },
  { name: 'scale mail',       ac: 5 },
  { name: 'chain mail',       ac: 6 },
  { name: 'splint mail',      ac: 7 },
  { name: 'banded mail',      ac: 7 },
  { name: 'plate mail',       ac: 8 },
];
const RINGS = [
  'protection', 'add strength', 'sustain strength', 'searching',
  'see invisible', 'regeneration', 'slow digestion', 'stealth',
  'increase damage', 'dexterity', 'maintain armor',
];
const WANDS = [
  'light', 'magic missile', 'teleport away', 'slow monster',
  'polymorph', 'drain life', 'cancellation', 'fire', 'cold', 'lightning',
];

/** @param {any[]} arr @param {()=>number} rng */
function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Create a weapon item.
 * @param {string} name
 * @param {number} hitBonus    - Bonus to the hit roll.
 * @param {number} damageBonus - Bonus to damage dealt.
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

/**
 * Create a potion item.
 * @param {string} effect
 * @returns {PotionItem}
 */
export function createPotion(effect) {
  return { type: 'potion', name: `potion of ${effect}` };
}

/**
 * Create a scroll item.
 * @param {string} title
 * @returns {ScrollItem}
 */
export function createScroll(title) {
  return { type: 'scroll', name: `scroll of ${title}` };
}

/**
 * Create an armor item.
 * @param {string} name
 * @param {number} ac - Armor class value (higher = better protection).
 * @returns {ArmorItem}
 */
export function createArmor(name, ac) {
  return { type: 'armor', name, ac };
}

/**
 * Create a ring item.
 * @param {string} effect
 * @returns {RingItem}
 */
export function createRing(effect) {
  return { type: 'ring', name: `ring of ${effect}` };
}

/**
 * Create a wand item.
 * @param {string} effect
 * @param {number} charges
 * @returns {WandItem}
 */
export function createWand(effect, charges) {
  return { type: 'wand', name: `wand of ${effect}`, charges };
}

// ---------------------------------------------------------------------------
// Random dungeon item generation
// ---------------------------------------------------------------------------

/**
 * Rarity thresholds (cumulative). 50% rooms get no item.
 * Food is common; weapons/armor uncommon; rings/wands rare.
 */
const THRESHOLDS = [0.50, 0.70, 0.82, 0.94, 0.97, 0.99, 1.00];

/**
 * Generate a random item for dungeon placement, or null (50% chance).
 * @param {() => number} rng
 * @returns {Item|null}
 */
export function generateDungeonItem(rng) {
  const roll = rng();
  if (roll < THRESHOLDS[0]) return null;
  if (roll < THRESHOLDS[1]) return createFood(pick(FOODS, rng));
  if (roll < THRESHOLDS[2]) return createPotion(pick(POTIONS, rng));
  if (roll < THRESHOLDS[3]) return createScroll(pick(SCROLLS, rng));
  if (roll < THRESHOLDS[4]) return createWeapon(pick(WEAPON_NAMES, rng), 0, 0);
  if (roll < THRESHOLDS[5]) { const a = pick(ARMORS, rng); return createArmor(a.name, a.ac); }
  if (roll < THRESHOLDS[6]) return createRing(pick(RINGS, rng));
  return createWand(pick(WANDS, rng), 3 + Math.floor(rng() * 5));
}
