/**
 * @module state
 * Game state factory and mutation functions.
 * Manages the dungeon, player, turn counter, and FOV.
 */

import { TILE } from '../dungeon/tiles.js';
import { generate, createRng } from '../dungeon/generator.js';
import { computeFov } from '../fov/index.js';
import { findRoomContaining } from '../dungeon/room.js';
import { createPlayer } from './player.js';
import { spawnMonsters, stepMonsters } from './ai.js';
import { resolveCombat } from './combat.js';

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
 *   messages: string[],
 *   dead: boolean,
 *   causeOfDeath: string|null
 * }} GameState
 */

/**
 * Place gold items in rooms. Each room has a 20% chance of containing one
 * pile. Amount scales with dungeonLevel: 2 to min(80, dungeonLevel * 16).
 * @param {import('../dungeon/room.js').Room[]} rooms
 * @param {() => number} rng
 * @param {number} dungeonLevel
 * @returns {GoldItem[]}
 */
function placeGoldItems(rooms, rng, dungeonLevel) {
  const items = [];
  for (const room of rooms) {
    // TODO: restore 20% chance: if (rng() >= 0.2) continue;
    const x = room.x + Math.floor(rng() * room.width);
    const y = room.y + Math.floor(rng() * room.height);
    const maxAmount = Math.min(80, dungeonLevel * 16);
    const amount = 2 + Math.floor((rng() + rng() + rng()) / 3 * (maxAmount - 1));
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
  const goldItems = placeGoldItems(dungeon.rooms, monsterRng, dungeonLevel);
  const playerName = options.playerName ?? 'Adventurer';
  const welcomeMessage = 'Welcome to the Dungeons of Doom';
  const state = { dungeon, player, playerName, dungeonLevel, turn: 0, monsters, goldItems, messages: [welcomeMessage, `Good luck ${playerName}!`], dead: false, causeOfDeath: null };
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
      if (target.hp <= 0) state.messages.push(`You have defeated the ${target.name}`);
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
  state.turn += 1;
  computeFov(map, player, SIGHT_RADIUS);
  stepMonsters(state);
  handleDeath(state);
}
