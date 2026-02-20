/**
 * @module state
 * Game state factory and mutation functions.
 * Manages the dungeon, player, turn counter, and FOV.
 */

import { TILE } from '../dungeon/tiles.js';
import { generate, createRng } from '../dungeon/generator.js';
import { computeFov } from '../fov/index.js';
import { findRoomContaining } from '../dungeon/room.js';
import { createPlayer, xpToLevel, RANKS } from './player.js';
import { spawnMonsters, stepMonsters } from './ai.js';
import { resolveCombat } from './combat.js';
import { generateDungeonItem } from './item.js';

/** Maximum sight range in tiles. Used by FOV and accessible in tests. */
export const SIGHT_RADIUS = 1;

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
    // TODO: restore 20% chance: if (rng() >= 0.2) continue;
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
  const article = /^[aeiou]/i.test(item.name) ? 'an' : 'a';
  state.messages.push(`You pick up ${article} ${item.name}`);
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
  state.messages.push('You died');
}

/**
 * Recompute player.defense from baseDefense plus any equipped armor.
 * @param {import('./player.js').Player} player
 */
function recomputeDefense(player) {
  player.defense = player.baseDefense + (player.equippedArmor?.ac ?? 0);
}

/**
 * Recompute player.hitBonus and player.damageBonus from equipped weapon.
 * @param {import('./player.js').Player} player
 */
function recomputeWeapon(player) {
  player.hitBonus    = player.equippedWeapon?.hitBonus    ?? 0;
  player.damageBonus = player.equippedWeapon?.damageBonus ?? 0;
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
  state.player.inventory.splice(idx, 1);
  state.dungeonItems.push({ x, y, item });
  const article = /^[aeiou]/i.test(item.name) ? 'an' : 'a';
  state.messages = [`You drop ${article} ${item.name}`];
}

export function illuminateRoomAt(map, rooms, x, y) {
  const room = findRoomContaining(rooms, x, y);
  if (room?.illuminated) revealRoom(map, room);
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
export function movePlayer(state, dx, dy) {
  const { dungeon, player, monsters } = state;
  const { map } = dungeon;
  const nx = player.x + dx;
  const ny = player.y + dy;

  if (ny < 0 || ny >= map.length) return;
  if (nx < 0 || nx >= map[0].length) return;
  if (!isWalkable(map[ny][nx].type)) return;

  state.messages = [];

  const target = monsters.find(m => m.hp > 0 && m.x === nx && m.y === ny);
  if (target) {
    const { hit, tier } = resolveCombat(player, target);
    if (!hit) {
      state.messages.push(`You miss the ${target.name}`);
    } else {
      state.messages.push(PLAYER_HIT_MSGS[tier](target.name));
      if (target.hp <= 0) {
        player.xp += target.xp;
        player.xpLevel = xpToLevel(player.xp);
        player.rank = RANKS[player.xpLevel];
        state.messages.push(`You have defeated the ${target.name}`);
      }
    }
    state.monsters = monsters.filter(m => m.hp > 0);
    state.turn += 1;
    computeFov(map, player, SIGHT_RADIUS);
    stepMonsters(state);
    handleDeath(state);
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
  computeFov(map, player, SIGHT_RADIUS);
  stepMonsters(state);
  handleDeath(state);
}
