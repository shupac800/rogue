/**
 * @module state
 * Game state factory and mutation functions.
 * Manages the dungeon, player, turn counter, and FOV.
 */

import { TILE } from '../dungeon/tiles.js';
import { generate, createRng } from '../dungeon/generator.js';
import { computeFov } from '../fov/index.js';
import { findRoomContaining } from '../dungeon/room.js';
import { createPlayer, xpToLevel, RANKS, REGEN_RATES, HP_PER_RANK, XP_THRESHOLDS } from './player.js';
import { spawnMonsters, stepMonsters } from './ai.js';
import { resolveCombat } from './combat.js';
import { generateDungeonItem } from './item.js';
import { createMonster, monstersForLevel, MONSTER_TABLE } from './monster.js';

/** Maximum sight range in tiles. Used by FOV and accessible in tests. */
export const SIGHT_RADIUS = 1;

/**
 * Return the indefinite article ('a' or 'an') for a noun phrase.
 * @param {string} noun
 * @returns {'a'|'an'}
 */
function article(noun) { return /^[aeiou]/i.test(noun) ? 'an' : 'a'; }

/** Maximum range (in map cells) for player-thrown missiles. */
export const MAX_MISSILE_RANGE = 11;

/** Chebyshev radius within which scare monster affects monsters (in addition to room). */
export const SCARE_MONSTER_RADIUS = 10;

/** Chebyshev radius within which hold monster paralyzes monsters. */
export const HOLD_MONSTER_RADIUS = 10;

/** Maximum food the player can carry. */
const FOOD_MAX = 1300;

/** Hunger thresholds in descending order; each fires a message when crossed. */
const HUNGER_THRESHOLDS = [
  { food: 900, msg: 'You are getting hungry' },
  { food: 400, msg: 'You are very hungry' },
  { food: 150, msg: 'You are famished' },
  { food:  20, msg: 'You are starving' },
];

/**
 * Return the hunger label for a food value, or '' when well-fed.
 * @param {number} food
 * @returns {string}
 */
export function hungerLabel(food) {
  if (food <=  20) return 'Starving';
  if (food <= 150) return 'Famished';
  if (food <= 400) return 'Very Hungry';
  if (food <= 900) return 'Hungry';
  return '';
}

/**
 * Return the effective FOV radius for the player.
 * Blindness reduces it to 0; otherwise returns SIGHT_RADIUS.
 * @param {import('./player.js').Player} player
 * @returns {number}
 */
function fovRadius(player) {
  return player.statusEffects.blindness > 0 ? 0 : SIGHT_RADIUS;
}

/**
 * Apply a status effect to any entity that has a statusEffects object.
 * Uses max(current, duration) so a longer active effect is never shortened.
 * @param {{ statusEffects: Record<string, number> }} entity
 * @param {string} effect
 * @param {number} duration
 */
export function applyEffect(entity, effect, duration) {
  entity.statusEffects[effect] = Math.max(entity.statusEffects[effect] ?? 0, duration);
}

/**
 * Decrement all active player status-effect counters by one turn.
 * Pushes expiry messages when a counter reaches zero.
 * @param {GameState} state
 */
function tickPlayerEffects(state) {
  const e = state.player.statusEffects;
  if (e.paralysis > 0 && --e.paralysis === 0) state.messages.push('You can move again');
  if (e.confusion > 0 && --e.confusion === 0) state.messages.push('You feel less confused');
  if (e.blindness  > 0 && --e.blindness  === 0) state.messages.push('Your vision returns');
}

/** Player-attack message for each hit tier (0 = glancing, 3 = devastating). */
const PLAYER_HIT_MSGS = [
  name => `You hit the ${name}`,
  name => `You have injured the ${name}`,
  name => `You scored an excellent hit on the ${name}`,
  name => `You clobbered the ${name}`,
];

/** Tile types the player can walk onto. */
const WALKABLE = new Set([
  TILE.FLOOR,
  TILE.CORRIDOR,
  TILE.DOOR,
  TILE.STAIRS_UP,
  TILE.STAIRS_DOWN,
]);

/**
 * Return true when the tile type is one the player may enter.
 * Independent from fov/isBlocking — walkability and opacity are separate concerns.
 * @param {number} type - A TILE value.
 * @returns {boolean}
 */
export function isWalkable(type) {
  return WALKABLE.has(type);
}

/**
 * @typedef {{ x: number, y: number, amount: number }} GoldItem
 * @typedef {{ x: number, y: number, item: import('./item.js').Item }} DungeonItem
 */

/**
 * @typedef {{
 *   dungeon: import('../dungeon/generator.js').Dungeon,
 *   player: import('./player.js').Player,
 *   playerName: string,
 *   dungeonLevel: number,
 *   turn: number,
 *   monsters: import('./monster.js').Monster[],
 *   goldItems: GoldItem[],
 *   dungeonItems: DungeonItem[],
 *   messages: string[],
 *   dead: boolean,
 *   causeOfDeath: string|null
 * }} GameState
 */

/**
 * Place gold items in rooms. Each room has a 20% chance of containing one
 * pile. Amount scales with dungeonLevel: 2 to min(80, dungeonLevel * 16).
 * Never places gold at the player's starting position (stairsUp).
 * @param {import('../dungeon/room.js').Room[]} rooms
 * @param {() => number} rng
 * @param {number} dungeonLevel
 * @param {{ x: number, y: number }} stairsUp
 * @returns {GoldItem[]}
 */
function placeGoldItems(rooms, rng, dungeonLevel, stairsUp) {
  const items = [];
  for (const room of rooms) {
    if (rng() >= 0.25) continue;
    const x = room.x + Math.floor(rng() * room.width);
    const y = room.y + Math.floor(rng() * room.height);
    const maxAmount = Math.min(80, dungeonLevel * 16);
    const amount = 2 + Math.floor((rng() + rng() + rng()) / 3 * (maxAmount - 1));
    if (x === stairsUp.x && y === stairsUp.y) continue;
    items.push({ x, y, amount });
  }
  return items;
}

/**
 * If a gold item exists at (x, y), add its amount to player.gold, remove it,
 * and push a pickup message.
 * @param {GameState} state
 * @param {number} x
 * @param {number} y
 */
function pickupGold(state, x, y) {
  const idx = state.goldItems.findIndex(g => g.x === x && g.y === y);
  if (idx === -1) return;
  const { amount } = state.goldItems[idx];
  state.player.gold += amount;
  state.goldItems.splice(idx, 1);
  state.messages.push(`You pick up ${amount} gold pieces`);
}

/**
 * Place items randomly in rooms. Each room has a 50% chance of no item;
 * among rooms that get one, food is most common and wands are rarest.
 * Never places an item at the player's starting position (stairsUp).
 * @param {import('../dungeon/room.js').Room[]} rooms
 * @param {() => number} rng
 * @param {{ x: number, y: number }} stairsUp
 * @returns {DungeonItem[]}
 */
function placeDungeonItems(rooms, rng, stairsUp) {
  const items = [];
  for (const room of rooms) {
    const item = generateDungeonItem(rng);
    if (!item) continue;
    const x = room.x + Math.floor(rng() * room.width);
    const y = room.y + Math.floor(rng() * room.height);
    if (x === stairsUp.x && y === stairsUp.y) continue;
    items.push({ x, y, item });
  }
  return items;
}

/**
 * If a dungeon item exists at (x, y), move it to player inventory and push
 * a pickup message. No-op if no item is at that position.
 * @param {GameState} state
 * @param {number} x
 * @param {number} y
 */
function pickupDungeonItem(state, x, y) {
  const idx = state.dungeonItems.findIndex(d => d.x === x && d.y === y);
  if (idx === -1) return;
  const { item } = state.dungeonItems[idx];
  state.player.inventory.push(item);
  state.dungeonItems.splice(idx, 1);
  state.messages.push(`You pick up ${article(item.name)} ${item.name}`);
}

/**
 * Create a new game state for a fresh dungeon level.
 * Generates the dungeon, places the player on the up-stairs, and computes
 * the initial field of view.
 * @param {{ width?: number, height?: number, seed?: number, dungeonLevel?: number, playerName?: string }} [options={}]
 * @returns {GameState}
 */
export function createGame(options = {}) {
  const dungeonLevel = options.dungeonLevel ?? 1;
  const dungeon = generate(options);
  const player = createPlayer(dungeon.stairsUp.x, dungeon.stairsUp.y);
  const monsterRng = createRng(options.seed !== undefined ? options.seed ^ 0xdeadbeef : undefined);
  const monsters = spawnMonsters(dungeon, monsterRng, dungeonLevel);
  const goldItems = placeGoldItems(dungeon.rooms, monsterRng, dungeonLevel, dungeon.stairsUp);
  const dungeonItems = placeDungeonItems(dungeon.rooms, monsterRng, dungeon.stairsUp);
  const playerName = options.playerName ?? 'Adventurer';
  const welcomeMessage = 'Welcome to the Dungeons of Doom';
  const state = { dungeon, player, playerName, dungeonLevel, turn: 0, monsters, goldItems, dungeonItems, messages: [welcomeMessage, `Good luck ${playerName}!`], dead: false, causeOfDeath: null };
  computeFov(dungeon.map, player, SIGHT_RADIUS);
  illuminateRoomAt(dungeon.map, dungeon.rooms, player.x, player.y);
  return state;
}

/**
 * Permanently reveal all cells covering a room (interior + perimeter walls).
 * Sets visible, visited, and alwaysVisible on each cell so they survive
 * future resetVisibility calls.
 * @param {Array<Array<{type:number,visible:boolean,visited:boolean,alwaysVisible:boolean}>>} map
 * @param {import('../dungeon/room.js').Room} room
 */
function revealRoom(map, room) {
  for (let dy = -1; dy <= room.height; dy++) {
    for (let dx = -1; dx <= room.width; dx++) {
      const cx = room.x + dx;
      const cy = room.y + dy;
      if (cy < 0 || cy >= map.length || cx < 0 || cx >= map[0].length) continue;
      map[cy][cx].visible = true;
      map[cy][cx].visited = true;
      map[cy][cx].alwaysVisible = true;
    }
  }
}

/**
 * If (x, y) lies inside an illuminated room, permanently reveal that room.
 * No-op when the point is outside all rooms or the room is not illuminated.
 * Call this whenever the player is placed inside a room.
 * @param {Array<Array<{type:number,visible:boolean,visited:boolean,alwaysVisible:boolean}>>} map
 * @param {import('../dungeon/room.js').Room[]} rooms
 * @param {number} x
 * @param {number} y
 */
/**
 * If the player is dead and not yet marked so, set state.dead and push the
 * death message. No-op if player is alive or death was already recorded.
 * @param {GameState} state
 */
function handleDeath(state) {
  if (state.player.hp > 0 || state.dead) return;
  state.dead = true;
  state.messages.push('You have died');
}

/**
 * Recompute ring bonus fields from all equipped rings.
 * Effects: 'protection' → +1 ringDefenseBonus, 'increase damage' → +1 ringDamageBonus,
 * 'dexterity' → +1 ringHitBonus. All other rings are stubs (no stat change).
 * @param {import('./player.js').Player} player
 */
function recomputeRings(player) {
  let defense = 0, damage = 0, hit = 0;
  for (const ring of player.equippedRings) {
    if (!ring) continue;
    const effect = ring.name.replace(/^ring of /, '');
    if (effect === 'protection')       defense += 1;
    else if (effect === 'increase damage') damage += 1;
    else if (effect === 'dexterity')   hit    += 1;
  }
  player.ringDefenseBonus = defense;
  player.ringDamageBonus  = damage;
  player.ringHitBonus     = hit;
}

/**
 * Recompute player.defense from baseDefense plus any equipped armor and rings.
 * @param {import('./player.js').Player} player
 */
function recomputeDefense(player) {
  player.defense = player.baseDefense + (player.equippedArmor?.ac ?? 0) + player.ringDefenseBonus;
}

/**
 * Recompute player.hitBonus and player.damageBonus from equipped weapon and rings.
 * @param {import('./player.js').Player} player
 */
function recomputeWeapon(player) {
  player.hitBonus    = (player.equippedWeapon?.hitBonus    ?? 0) + player.ringHitBonus;
  player.damageBonus = (player.equippedWeapon?.damageBonus ?? 0) + player.ringDamageBonus;
}

/**
 * Wield a weapon, replacing any currently wielded weapon.
 * @param {GameState} state
 * @param {import('./item.js').WeaponItem} weapon
 */
export function wieldWeapon(state, weapon) {
  state.player.equippedWeapon = weapon;
  recomputeWeapon(state.player);
  state.messages = [`You wield ${weapon.name}`];
}

/**
 * Stow the currently wielded weapon. No-op if none is wielded.
 * @param {GameState} state
 */
export function unwieldWeapon(state) {
  if (!state.player.equippedWeapon) return;
  const { name } = state.player.equippedWeapon;
  state.player.equippedWeapon = null;
  recomputeWeapon(state.player);
  state.messages = [`You put away ${name}`];
}

/**
 * Equip an armor item, replacing any currently worn armor.
 * Recomputes player.defense and sets state.messages.
 * @param {GameState} state
 * @param {import('./item.js').ArmorItem} armor
 */
export function wearArmor(state, armor) {
  state.player.equippedArmor = armor;
  recomputeDefense(state.player);
  state.messages = [`You are now wearing ${armor.name}`];
}

/**
 * Remove the currently worn armor. No-op if no armor is equipped.
 * Recomputes player.defense and sets state.messages.
 * @param {GameState} state
 */
export function removeArmor(state) {
  if (!state.player.equippedArmor) return;
  const { name } = state.player.equippedArmor;
  state.player.equippedArmor = null;
  recomputeDefense(state.player);
  state.messages = [`You remove ${name}`];
}

/**
 * Equip a ring in the specified slot (0 = left, 1 = right).
 * No-op if slotIndex is invalid or the slot is already occupied.
 * @param {GameState} state
 * @param {import('./item.js').RingItem} ring
 * @param {0|1} slotIndex
 */
export function putOnRing(state, ring, slotIndex) {
  if (slotIndex !== 0 && slotIndex !== 1) return;
  if (state.player.equippedRings[slotIndex]) {
    state.messages = ['You are already wearing a ring on that hand'];
    return;
  }
  state.player.equippedRings[slotIndex] = ring;
  recomputeRings(state.player);
  recomputeDefense(state.player);
  recomputeWeapon(state.player);
  const side = slotIndex === 0 ? 'left' : 'right';
  state.messages = [`You put on ${ring.name} (${side} hand)`];
}

/**
 * Remove the ring from the specified slot (0 = left, 1 = right).
 * No-op if slotIndex is invalid or the slot is empty.
 * @param {GameState} state
 * @param {0|1} slotIndex
 */
export function removeRing(state, slotIndex) {
  if (slotIndex !== 0 && slotIndex !== 1) return;
  const ring = state.player.equippedRings[slotIndex];
  if (!ring) return;
  state.player.equippedRings[slotIndex] = null;
  recomputeRings(state.player);
  recomputeDefense(state.player);
  recomputeWeapon(state.player);
  const side = slotIndex === 0 ? 'left' : 'right';
  state.messages = [`You remove ${ring.name} (${side} hand)`];
}

/**
 * Drop an item from the player's inventory onto the current tile.
 * If the item is equipped armor, it is removed first.
 * @param {GameState} state
 * @param {import('./item.js').Item} item
 */
export function dropItem(state, item) {
  const { x, y } = state.player;
  const tileType = state.dungeon.map[y][x].type;
  const tileOccupied =
    tileType === TILE.STAIRS_UP ||
    tileType === TILE.STAIRS_DOWN ||
    tileType === TILE.DOOR ||
    state.dungeonItems.some(d => d.x === x && d.y === y) ||
    state.goldItems.some(g => g.x === x && g.y === y);
  if (tileOccupied) {
    state.messages = ["Can't drop that here"];
    return;
  }
  const idx = state.player.inventory.indexOf(item);
  if (idx === -1) return;
  if (item === state.player.equippedArmor) {
    state.messages = ["Remove it before dropping"];
    return;
  }
  if (item === state.player.equippedWeapon) {
    state.messages = ["Unwield it before dropping"];
    return;
  }
  if (state.player.equippedRings.includes(item)) {
    state.messages = ["Remove it before dropping"];
    return;
  }
  state.player.inventory.splice(idx, 1);
  state.dungeonItems.push({ x, y, item });
  state.messages = [`You drop ${article(item.name)} ${item.name}`];
}

/**
 * Eat a food item: remove it from inventory and restore 1–8 HP (capped at maxHp).
 * No-op if item is not in inventory.
 * @param {GameState} state
 * @param {import('./item.js').FoodItem} item
 */
export function eatFood(state, item) {
  const idx = state.player.inventory.indexOf(item);
  if (idx === -1) return;
  state.player.inventory.splice(idx, 1);
  const { player } = state;
  const hpRestored = Math.floor(Math.random() * 8) + 1;
  player.hp = Math.min(player.maxHp, player.hp + hpRestored);
  player.food = FOOD_MAX;
  state.messages = [`You eat ${article(item.name)} ${item.name}`];
}

/**
 * Quaff a potion: remove it from inventory and apply its effect.
 * No-op if item is not in inventory.
 * @param {GameState} state
 * @param {import('./item.js').PotionItem} item
 */
export function quaffPotion(state, item) {
  const idx = state.player.inventory.indexOf(item);
  if (idx === -1) return;
  state.player.inventory.splice(idx, 1);
  const { player } = state;
  const effect = item.name.replace(/^potion of /, '');
  switch (effect) {
    case 'healing':
      player.hp = Math.min(player.maxHp, player.hp + Math.floor(Math.random() * 8) + 8);
      state.messages = ['You feel better'];
      break;
    case 'extra healing':
      player.hp = player.maxHp;
      state.messages = ['You feel much better'];
      break;
    case 'poison':
      player.hp -= Math.floor(Math.random() * 8) + 1;
      state.messages = ['You feel very sick'];
      handleDeath(state);
      break;
    case 'gain strength':
      player.attack += 1;
      state.messages = ['You feel stronger'];
      break;
    case 'restore strength':
      state.messages = ['You feel yourself again'];
      break;
    case 'raise level': {
      const newLevel = Math.min(RANKS.length - 1, player.xpLevel + 1);
      if (newLevel > player.xpLevel) {
        promotePlayer(player, player.xpLevel, newLevel);
        state.messages = ['You suddenly feel more skillful',`You have earned the rank of ${player.rank}`];
      } else {
        state.messages = ['You feel more experienced, but it has no effect'];
      }
      break;
    }
    case 'confusion':
      applyEffect(player, 'confusion', 15);
      state.messages = ['You feel confused'];
      break;
    case 'paralysis':
      applyEffect(player, 'paralysis', 15);
      state.messages = ['You cannot move!'];
      break;
    case 'blindness':
      applyEffect(player, 'blindness', 100);
      state.messages = ['Everything goes dark'];
      break;
    default:
      state.messages = ['Red Bull gives you wings? Nothing happens'];
  }
}

export function illuminateRoomAt(map, rooms, x, y) {
  const room = findRoomContaining(rooms, x, y);
  if (room?.illuminated) revealRoom(map, room);
}

/**
 * Replace the current dungeon level with a newly generated one.
 * Preserves the player object but updates position, dungeon, monsters, gold,
 * and items. Recomputes FOV and illuminates the arrival room.
 * @param {GameState} state
 * @param {number} newLevel
 * @param {(dungeon: import('../dungeon/generator.js').Dungeon) => {x:number,y:number}} getPos
 * @param {string} message
 */
function changeDungeonLevel(state, newLevel, getPos, message) {
  const newDungeon = generate({ dungeonLevel: newLevel });
  const monsterRng = createRng();
  const monsters = spawnMonsters(newDungeon, monsterRng, newLevel);
  const goldItems = placeGoldItems(newDungeon.rooms, monsterRng, newLevel, newDungeon.stairsUp);
  const dungeonItems = placeDungeonItems(newDungeon.rooms, monsterRng, newDungeon.stairsUp);
  const { x, y } = getPos(newDungeon);
  state.player.x = x;
  state.player.y = y;
  state.dungeon = newDungeon;
  state.dungeonLevel = newLevel;
  state.monsters = monsters;
  state.goldItems = goldItems;
  state.dungeonItems = dungeonItems;
  state.messages = [message];
  computeFov(newDungeon.map, state.player, fovRadius(state.player));
  illuminateRoomAt(newDungeon.map, newDungeon.rooms, x, y);
}

/**
 * Descend to the next dungeon level if the player stands on down-stairs.
 * Replaces the dungeon, monsters, gold, and items; preserves the player.
 * No-op if the player is not on a down-staircase.
 * @param {GameState} state
 */
export function descendStairs(state) {
  const { player, dungeon } = state;
  if (dungeon.map[player.y][player.x].type !== TILE.STAIRS_DOWN) {
    state.messages = ['You see no down staircase here'];
    return;
  }
  const newLevel = state.dungeonLevel + 1;
  changeDungeonLevel(state, newLevel, d => d.stairsUp, `You descend to dungeon level ${newLevel}`);
}

/**
 * Ascend to the previous dungeon level if the player stands on up-stairs.
 * On level 1, ends the game (player escaped). Preserves the player.
 * No-op if the player is not on an up-staircase.
 * @param {GameState} state
 */
export function ascendStairs(state) {
  const { player, dungeon } = state;
  if (dungeon.map[player.y][player.x].type !== TILE.STAIRS_UP) {
    state.messages = ['You see no up staircase here'];
    return;
  }
  if (state.dungeonLevel === 1) {
    state.dead = true;
    state.causeOfDeath = 'escaped the dungeon';
    state.messages = ['You escape from the Dungeons of Doom!'];
    return;
  }
  const newLevel = state.dungeonLevel - 1;
  changeDungeonLevel(state, newLevel, d => d.stairsDown, `You ascend to dungeon level ${newLevel}`);
}

/**
 * Promote the player from prevLevel to newLevel.
 * Sums the max HP increases for every rank gained, scales current HP to the
 * same percentage of the new max (rounded, minimum 1), and updates rank fields.
 * @param {import('./player.js').Player} player
 * @param {number} prevLevel
 * @param {number} newLevel
 */
function promotePlayer(player, prevLevel, newLevel) {
  const ratio = player.hp / player.maxHp; // how healthy are we right now?
  for (let lv = prevLevel + 1; lv <= newLevel; lv++) player.maxHp += HP_PER_RANK[lv];
  player.hp = Math.max(1, Math.round(ratio * player.maxHp));
  player.xpLevel = newLevel;
  player.rank = RANKS[newLevel];
}

/**
 * Cheat: immediately promote the player one rank (no-op at max rank).
 * @param {GameState} state
 */
export function cheatRankUp(state) {
  const newLevel = Math.min(RANKS.length - 1, state.player.xpLevel + 1);
  if (newLevel > state.player.xpLevel) {
    state.player.xp = XP_THRESHOLDS[newLevel];
    promotePlayer(state.player, state.player.xpLevel, newLevel);
    state.messages = [`You have cheated your way to ${state.player.rank}`];
  }
}

/**
 * Restore 1 HP if the player is alive, below max HP, and the turn count is
 * a multiple of the rank-appropriate regen rate. No-op otherwise.
 * @param {GameState} state
 */
function regenHp(state) {
  const { player } = state;
  if (state.dead || player.hp >= player.maxHp) return;
  const rate = REGEN_RATES[player.xpLevel];
  if (state.turn % rate === 0) player.hp += 1;
  if (player.hp < player.maxHp && player.equippedRings.some(r => r?.name === 'ring of regeneration')) {
    player.hp += 1;
  }
}

/**
 * Decrement the player's food counter once per turn (half rate with slow
 * digestion ring). Pushes threshold messages when each level is crossed.
 * Deals 1 HP starvation damage when food reaches 0.
 * @param {GameState} state
 */
function tickHunger(state) {
  if (state.dead) return;
  const { player } = state;
  const slowDigestion = player.equippedRings.some(r => r?.name === 'ring of slow digestion');
  if (slowDigestion && state.turn % 2 !== 0) return;
  if (player.food > 0) player.food--;
  for (const t of HUNGER_THRESHOLDS) {
    if (player.food === t.food) state.messages.push(t.msg);
  }
  if (player.food === 0) {
    player.hp -= 1;
    if (player.hp <= 0) state.causeOfDeath = 'starvation';
    handleDeath(state);
  }
}

/**
 * Read a scroll: consume it from inventory and apply its effect.
 * @param {GameState} state
 * @param {import('./item.js').ScrollItem} item
 */
/**
 * Return all living monsters within Chebyshev `radius` of the player,
 * unioned with all living monsters inside the player's room (if any).
 * @param {GameState} state
 * @param {number} radius
 * @returns {import('./monster.js').Monster[]}
 */
function monstersNearPlayer(state, radius) {
  const { player, dungeon } = state;
  const room = findRoomContaining(dungeon.rooms, player.x, player.y);
  return state.monsters.filter(m => {
    if (m.hp <= 0) return false;
    const cheb = Math.max(Math.abs(m.x - player.x), Math.abs(m.y - player.y));
    if (cheb <= radius) return true;
    if (room &&
        m.x >= room.x && m.x < room.x + room.width &&
        m.y >= room.y && m.y < room.y + room.height) return true;
    return false;
  });
}

export function readScroll(state, item) {
  const idx = state.player.inventory.indexOf(item);
  if (idx === -1) return;
  state.player.inventory.splice(idx, 1);
  const effect = item.name.replace(/^scroll of /, '');
  const { player, dungeon } = state;
  switch (effect) {
    case 'enchant weapon': {
      if (!player.equippedWeapon) { state.messages = ['Nothing happens']; break; }
      player.equippedWeapon.hitBonus    += 1;
      player.equippedWeapon.damageBonus += 1;
      recomputeWeapon(player);
      state.messages = ['Your weapon glows blue'];
      break;
    }
    case 'enchant armor': {
      if (!player.equippedArmor) { state.messages = ['Nothing happens']; break; }
      player.equippedArmor.ac += 1;
      recomputeDefense(player);
      state.messages = ['Your armor glows blue'];
      break;
    }
    case 'magic mapping': {
      for (const row of dungeon.map)
        for (const cell of row) cell.visited = true;
      state.messages = ['The dungeon layout flashes before your eyes'];
      break;
    }
    case 'teleportation': {
      const candidates = [];
      for (let ty = 0; ty < dungeon.map.length; ty++)
        for (let tx = 0; tx < dungeon.map[ty].length; tx++)
          if (dungeon.map[ty][tx].type === TILE.FLOOR || dungeon.map[ty][tx].type === TILE.CORRIDOR)
            candidates.push({ x: tx, y: ty });
      if (candidates.length > 0) {
        const pos = candidates[Math.floor(Math.random() * candidates.length)];
        player.x = pos.x;
        player.y = pos.y;
        computeFov(dungeon.map, player, fovRadius(player));
        illuminateRoomAt(dungeon.map, dungeon.rooms, player.x, player.y);
      }
      applyEffect(player, 'confusion', 5);
      state.messages = ['You feel dizzy and reappear elsewhere'];
      break;
    }
    case 'light': {
      illuminateRoomAt(dungeon.map, dungeon.rooms, player.x, player.y);
      state.messages = ['The room floods with light'];
      break;
    }
    case 'create monster': {
      const templates = monstersForLevel(state.dungeonLevel);
      const template = templates[Math.floor(Math.random() * templates.length)];
      let spawned = false;
      outer: for (let r = 1; r <= 3; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const mx = player.x + dx;
            const my = player.y + dy;
            if (my < 0 || my >= dungeon.map.length || mx < 0 || mx >= dungeon.map[0].length) continue;
            if (!isWalkable(dungeon.map[my][mx].type)) continue;
            if (state.monsters.some(m => m.x === mx && m.y === my)) continue;
            state.monsters.push(createMonster(template, mx, my));
            state.messages = ['You hear something stir nearby'];
            spawned = true;
            break outer;
          }
        }
      }
      if (!spawned) state.messages = ['Nothing happens'];
      break;
    }
    case 'identify':           state.messages = ['You feel knowledgeable']; break;
    case 'scare monster': {
      const targets = monstersNearPlayer(state, SCARE_MONSTER_RADIUS);
      for (const m of targets) m.statusEffects.scared = Math.max(m.statusEffects.scared, 10);
      state.messages = [targets.length > 0 ? 'The monsters flee in terror!' : 'The scroll crumbles to dust'];
      break;
    }
    case 'hold monster': {
      const targets = monstersNearPlayer(state, HOLD_MONSTER_RADIUS);
      for (const m of targets) applyEffect(m, 'paralysis', 10);
      state.messages = [targets.length > 0 ? 'The monsters freeze!' : 'The scroll crumbles to dust'];
      break;
    }
    case 'aggravate monsters':
      for (const m of state.monsters) { m.aggression = 3; m.provoked = true; }
      state.messages = ['You hear the monsters stir angrily'];
      break;
    case 'remove curse':       state.messages = ['You feel a sense of relief']; break;
    case 'protect armor':      state.messages = ['Your armor glows briefly']; break;
    default: state.messages = ['Nothing happens'];
  }
}

/**
 * Attempt to move the player by (dx, dy).
 * Mutates state in place. Turn only advances on a valid move (including wait).
 * Returns early without mutating if the destination is out of bounds or blocked.
 * @param {GameState} state
 * @param {number} dx - Column delta (-1, 0, or 1).
 * @param {number} dy - Row delta (-1, 0, or 1).
 * @returns {void}
 */

/**
 * Walk from the player in direction (dx, dy) and return the first living
 * monster encountered before hitting a wall or map edge. Returns null if
 * the path is clear.
 * @param {GameState} state
 * @param {number} dx
 * @param {number} dy
 * @returns {import('./monster.js').Monster|null}
 */
function findMonsterInLine(state, dx, dy) {
  const { dungeon: { map }, player, monsters } = state;
  let x = player.x + dx;
  let y = player.y + dy;
  while (y >= 0 && y < map.length && x >= 0 && x < map[0].length) {
    if (!isWalkable(map[y][x].type)) break;
    const m = monsters.find(m => m.hp > 0 && m.x === x && m.y === y);
    if (m) return m;
    x += dx;
    y += dy;
  }
  return null;
}

/**
 * Return a random walkable map position, or null if none exists.
 * @param {GameState} state
 * @returns {{ x: number, y: number }|null}
 */
function randomWalkablePos(state) {
  const { dungeon: { map } } = state;
  const candidates = [];
  for (let y = 0; y < map.length; y++)
    for (let x = 0; x < map[y].length; x++)
      if (isWalkable(map[y][x].type)) candidates.push({ x, y });
  return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
}

/**
 * Apply a single wand effect to a target monster.
 * Mutates state.messages and target; may replace entry in state.monsters.
 * @param {GameState} state
 * @param {import('./monster.js').Monster} target
 * @param {string} effect
 */
function applyWandEffect(state, target, effect) {
  const { player } = state;
  switch (effect) {
    case 'magic missile': {
      const dmg = 6 + Math.floor(Math.random() * 6);
      target.hp -= dmg;
      state.messages.push(`The missile strikes the ${target.name}!`);
      break;
    }
    case 'fire': {
      const dmg = 8 + Math.floor(Math.random() * 8);
      target.hp -= dmg;
      state.messages.push(`A bolt of fire engulfs the ${target.name}!`);
      break;
    }
    case 'cold': {
      const dmg = 6 + Math.floor(Math.random() * 8);
      target.hp -= dmg;
      state.messages.push(`A blast of cold hits the ${target.name}!`);
      break;
    }
    case 'lightning': {
      const dmg = 12 + Math.floor(Math.random() * 8);
      target.hp -= dmg;
      state.messages.push(`A bolt of lightning strikes the ${target.name}!`);
      break;
    }
    case 'drain life':
      target.hp = Math.max(1, Math.floor(target.hp / 2));
      state.messages.push(`The ${target.name} looks weaker`);
      break;
    case 'teleport away': {
      const pos = randomWalkablePos(state);
      if (pos) { target.x = pos.x; target.y = pos.y; }
      state.messages.push(`The ${target.name} vanishes!`);
      break;
    }
    case 'slow monster':
      applyEffect(target, 'confusion', 20);
      state.messages.push(`The ${target.name} slows down`);
      break;
    case 'polymorph': {
      const template = MONSTER_TABLE[Math.floor(Math.random() * MONSTER_TABLE.length)];
      const replacement = createMonster(template, target.x, target.y);
      const ti = state.monsters.indexOf(target);
      if (ti !== -1) state.monsters[ti] = replacement;
      state.messages.push(`The ${target.name} transforms!`);
      return; // replacement is not target; skip kill check
    }
    case 'cancellation':
      target.statusEffects = { paralysis: 0, confusion: 0 };
      target.aggression = 0;
      target.provoked = false;
      state.messages.push(`The ${target.name} looks subdued`);
      break;
    default:
      state.messages.push('Nothing happens');
  }
  if (target.hp <= 0) {
    player.xp += target.xp;
    const prevLevel = player.xpLevel;
    const newLevel = xpToLevel(player.xp);
    state.messages.push(`You have defeated the ${target.name}`);
    if (newLevel > prevLevel) {
      promotePlayer(player, prevLevel, newLevel);
      state.messages.push(`You have earned the rank of ${player.rank}`);
    }
  }
}

/**
 * Apply the thrown-potion effect to a target monster.
 * @param {GameState} state
 * @param {import('./monster.js').Monster} target
 * @param {string} effect
 */
function applyPotionToMonster(state, target, effect) {
  switch (effect) {
    case 'healing':
      target.hp = Math.min(target.maxHp, target.hp + 8);
      state.messages.push(`The ${target.name} looks healthier`);
      break;
    case 'extra healing':
      target.hp = target.maxHp;
      state.messages.push(`The ${target.name} looks much healthier`);
      break;
    case 'poison':
      target.hp -= 8 + Math.floor(Math.random() * 8);
      state.messages.push(`The ${target.name} looks very sick`);
      break;
    case 'confusion':
      applyEffect(target, 'confusion', 15);
      state.messages.push(`The ${target.name} looks confused`);
      break;
    case 'paralysis':
      applyEffect(target, 'paralysis', 15);
      state.messages.push(`The ${target.name} freezes!`);
      break;
    case 'blindness':
      applyEffect(target, 'confusion', 25);
      state.messages.push(`The ${target.name} stumbles about`);
      break;
    default:
      state.messages.push(`The potion shatters harmlessly`);
  }
}

/**
 * Compute the trajectory of a thrown item without mutating game state.
 * Potions always hit; all other items hit on a 75% roll (25% miss chance).
 * @param {GameState} state
 * @param {import('./item.js').Item} item
 * @param {number} dx
 * @param {number} dy
 * @returns {{ path: Array<{x:number,y:number}>, hitMonster: import('./monster.js').Monster|null, landPos: {x:number,y:number}|null }}
 */
export function computeThrowPath(state, item, dx, dy) {
  const { dungeon: { map }, player, monsters } = state;
  const path = [];
  let cx = player.x + dx;
  let cy = player.y + dy;
  let hitMonster = null;
  let landPos = null;

  while (path.length < MAX_MISSILE_RANGE &&
         cy >= 0 && cy < map.length && cx >= 0 && cx < map[0].length &&
         isWalkable(map[cy][cx].type)) {
    path.push({ x: cx, y: cy });
    const m = monsters.find(m => m.hp > 0 && m.x === cx && m.y === cy);
    if (m) {
      const hit = item.type === 'potion' || Math.random() >= 0.25;
      if (hit) { hitMonster = m; break; }
    }
    landPos = { x: cx, y: cy };
    cx += dx;
    cy += dy;
  }

  return { path, hitMonster, landPos };
}

/**
 * Resolve a throw after animation: removes item from inventory, applies
 * damage or effect to hitMonster (or places item at landPos), then advances
 * the turn exactly like movePlayer does.
 * @param {GameState} state
 * @param {import('./item.js').Item} item
 * @param {import('./monster.js').Monster|null} hitMonster
 * @param {{x:number,y:number}|null} landPos
 */
export function resolveThrow(state, item, hitMonster, landPos) {
  const { player } = state;
  const idx = player.inventory.indexOf(item);
  if (idx !== -1) player.inventory.splice(idx, 1);
  if (item === player.equippedWeapon) { player.equippedWeapon = null; recomputeWeapon(player); }
  if (item === player.equippedArmor)  { player.equippedArmor  = null; recomputeDefense(player); }
  const ringSlot = player.equippedRings.indexOf(item);
  if (ringSlot !== -1) {
    player.equippedRings[ringSlot] = null;
    recomputeRings(player); recomputeDefense(player); recomputeWeapon(player);
  }

  state.messages = [];

  if (hitMonster) {
    hitMonster.provoked = true;
    if (item.type === 'weapon') {
      const maxRaw = player.attack * 4;
      const baseRaw = 1 + Math.floor(Math.random() * maxRaw);
      const damage = Math.max(1, baseRaw - hitMonster.defense + item.damageBonus);
      const tier = Math.min(3, Math.floor((baseRaw - 1) / Math.max(1, player.attack)));
      hitMonster.hp -= damage;
      state.messages.push(PLAYER_HIT_MSGS[tier](hitMonster.name));
    } else if (item.type === 'potion') {
      applyPotionToMonster(state, hitMonster, item.name.replace(/^potion of /, ''));
    } else {
      state.messages.push(`The ${item.name} bounces off the ${hitMonster.name}`);
    }
    if (hitMonster.hp <= 0) {
      player.xp += hitMonster.xp;
      const prevLevel = player.xpLevel;
      const newLevel = xpToLevel(player.xp);
      state.messages.push(`You have defeated the ${hitMonster.name}`);
      if (hitMonster.name === 'leprechaun') {
        const amount = 100 + Math.floor(Math.random() * 150);
        state.goldItems.push({ x: hitMonster.x, y: hitMonster.y, amount });
      }
      if (newLevel > prevLevel) {
        promotePlayer(player, prevLevel, newLevel);
        state.messages.push(`You have earned the rank of ${player.rank}`);
      }
    }
  } else {
    if (landPos) state.dungeonItems.push({ x: landPos.x, y: landPos.y, item });
    state.messages.push(`The ${item.name} hits the floor`);
  }

  state.monsters = state.monsters.filter(m => m.hp > 0);
  state.turn += 1;
  tickPlayerEffects(state);
  computeFov(state.dungeon.map, player, fovRadius(player));
  stepMonsters(state);
  handleDeath(state);
  regenHp(state);
  tickHunger(state);
}

/**
 * Zap a wand from the player's inventory in direction (dx, dy).
 * Consumes one charge, fires a beam, and advances the turn.
 * No-op if the wand is not in inventory or has no charges.
 * @param {GameState} state
 * @param {import('./item.js').WandItem} wand
 * @param {number} dx
 * @param {number} dy
 */
export function zapWand(state, wand, dx, dy) {
  if (!state.player.inventory.includes(wand)) return;
  if (wand.charges <= 0) {
    state.messages = ['The wand is empty'];
    return;
  }
  wand.charges--;
  state.messages = [];
  const effect = wand.name.replace(/^wand of /, '');
  if (effect === 'light') {
    illuminateRoomAt(state.dungeon.map, state.dungeon.rooms, state.player.x, state.player.y);
    state.messages.push('The room floods with light');
  } else {
    const target = findMonsterInLine(state, dx, dy);
    if (target) {
      applyWandEffect(state, target, effect);
    } else {
      state.messages.push('The wand zaps harmlessly into the darkness');
    }
  }
  state.monsters = state.monsters.filter(m => m.hp > 0);
  state.turn += 1;
  tickPlayerEffects(state);
  computeFov(state.dungeon.map, state.player, fovRadius(state.player));
  stepMonsters(state);
  handleDeath(state);
  regenHp(state);
  tickHunger(state);
}

export function movePlayer(state, dx, dy) {
  const { dungeon, player, monsters } = state;
  const { map } = dungeon;

  // Paralysis: skip movement but still advance time.
  if (player.statusEffects.paralysis > 0) {
    state.messages = ['You are paralyzed!'];
    state.turn += 1;
    tickPlayerEffects(state);
    computeFov(map, player, fovRadius(player));
    stepMonsters(state);
    handleDeath(state);
    regenHp(state);
    return;
  }

  // Confusion: ignore input and move in a random direction instead.
  const confused = player.statusEffects.confusion > 0;
  if (confused) {
    const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,0],[0,1],[1,-1],[1,0],[1,1]];
    [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
  }

  const nx = player.x + dx;
  const ny = player.y + dy;

  // Out-of-bounds or unwalkable: confused players waste the turn; others no-op.
  if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[0].length || !isWalkable(map[ny]?.[nx]?.type)) {
    if (!confused) return;
    state.messages = [];
    state.turn += 1;
    tickPlayerEffects(state);
    computeFov(map, player, fovRadius(player));
    stepMonsters(state);
    handleDeath(state);
    regenHp(state);
    return;
  }

  state.messages = [];

  const target = monsters.find(m => m.hp > 0 && m.x === nx && m.y === ny);
  if (target) {
    target.provoked = true;
    const { hit, tier } = resolveCombat(player, target);
    if (!hit) {
      state.messages.push(`You miss the ${target.name}`);
    } else {
      state.messages.push(PLAYER_HIT_MSGS[tier](target.name));
      if (target.hp <= 0) {
        player.xp += target.xp;
        const prevLevel = player.xpLevel;
        const newLevel = xpToLevel(player.xp);
        state.messages.push(`You have defeated the ${target.name}`);
        if (target.name === 'leprechaun') {
          const amount = 100 + Math.floor(Math.random() * 150);
          state.goldItems.push({ x: target.x, y: target.y, amount });
        }
        if (newLevel > prevLevel) {
          promotePlayer(player, prevLevel, newLevel);
          state.messages.push(`You have earned the rank of ${player.rank}`);
        }
      }
    }
    state.monsters = monsters.filter(m => m.hp > 0);
    state.turn += 1;
    tickPlayerEffects(state);
    computeFov(map, player, fovRadius(player));
    stepMonsters(state);
    handleDeath(state);
    regenHp(state);
    return;
  }

  player.x = nx;
  player.y = ny;
  if (map[ny][nx].type === TILE.DOOR) {
    illuminateRoomAt(map, dungeon.rooms, nx + dx, ny + dy);
  }
  pickupGold(state, nx, ny);
  pickupDungeonItem(state, nx, ny);
  state.turn += 1;
  tickPlayerEffects(state);
  computeFov(map, player, fovRadius(player));
  stepMonsters(state);
  handleDeath(state);
  regenHp(state);
  tickHunger(state);
}
