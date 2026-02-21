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
import { createMonster, monstersForLevel } from './monster.js';

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
  const article = /^[aeiou]/i.test(item.name) ? 'an' : 'a';
  state.messages = [`You drop ${article} ${item.name}`];
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
  const restored = Math.floor(Math.random() * 8) + 1;
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + restored);
  const article = /^[aeiou]/i.test(item.name) ? 'an' : 'a';
  state.messages = [`You eat ${article} ${item.name}`];
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
  computeFov(newDungeon.map, state.player, SIGHT_RADIUS);
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
}

/**
 * Read a scroll: consume it from inventory and apply its effect.
 * @param {GameState} state
 * @param {import('./item.js').ScrollItem} item
 */
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
        computeFov(dungeon.map, player, SIGHT_RADIUS);
        illuminateRoomAt(dungeon.map, dungeon.rooms, player.x, player.y);
      }
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
    case 'scare monster':      state.messages = ['The monsters seem frightened']; break;
    case 'hold monster':       state.messages = ['The monsters freeze momentarily']; break;
    case 'aggravate monsters': state.messages = ['You hear the monsters stir']; break;
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
        const prevLevel = player.xpLevel;
        const newLevel = xpToLevel(player.xp);
        state.messages.push(`You have defeated the ${target.name}`);
        if (newLevel > prevLevel) {
          promotePlayer(player, prevLevel, newLevel);
          state.messages.push(`You have earned the rank of ${player.rank}`);
        }
      }
    }
    state.monsters = monsters.filter(m => m.hp > 0);
    state.turn += 1;
    computeFov(map, player, SIGHT_RADIUS);
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
  computeFov(map, player, SIGHT_RADIUS);
  stepMonsters(state);
  handleDeath(state);
  regenHp(state);
}
