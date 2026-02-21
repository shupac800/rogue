/**
 * Tests for src/game/player.js and src/game/state.js
 */

import { createPlayer, REGEN_RATES, HP_PER_RANK, XP_THRESHOLDS } from '../src/game/player.js';
import {
  createGame,
  movePlayer,
  isWalkable,
  illuminateRoomAt,
  dropItem,
  descendStairs,
  ascendStairs,
  quaffPotion,
  readScroll,
  cheatRankUp,
  wearArmor,
  removeArmor,
  wieldWeapon,
  unwieldWeapon,
  putOnRing,
  removeRing,
  SIGHT_RADIUS,
} from '../src/game/state.js';
import { TILE } from '../src/dungeon/tiles.js';
import { findRoomContaining } from '../src/dungeon/room.js';

// ---------------------------------------------------------------------------
// createPlayer
// ---------------------------------------------------------------------------

describe('createPlayer', () => {
  test('returns an object with the correct shape', () => {
    const p = createPlayer(3, 5);
    for (const key of ['x', 'y', 'hp', 'maxHp', 'attack', 'defense', 'gold', 'xp', 'xpLevel', 'rank', 'equippedWeapon', 'hitBonus', 'damageBonus']) {
      expect(p).toHaveProperty(key);
    }
  });

  test('places the player at the given coordinates', () => {
    const p = createPlayer(7, 12);
    expect(p.x).toBe(7);
    expect(p.y).toBe(12);
  });

  test('sets correct starting stats', () => {
    const p = createPlayer(0, 0);
    expect(p.hp).toBe(5);
    expect(p.maxHp).toBe(5);
    expect(p.attack).toBe(3);
    expect(p.defense).toBe(4); // baseDefense 1 + leather armor AC 3
    expect(p.gold).toBe(0);
    expect(p.xp).toBe(0);
    expect(p.xpLevel).toBe(0);
    expect(p.rank).toBe('');
  });

  test('returns distinct objects on each call', () => {
    const a = createPlayer(0, 0);
    const b = createPlayer(0, 0);
    expect(a).not.toBe(b);
    a.hp = 1;
    expect(b.hp).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// isWalkable
// ---------------------------------------------------------------------------

describe('isWalkable', () => {
  test('returns false for VOID',       () => expect(isWalkable(TILE.VOID)).toBe(false));
  test('returns false for WALL',       () => expect(isWalkable(TILE.WALL)).toBe(false));
  test('returns true for FLOOR',       () => expect(isWalkable(TILE.FLOOR)).toBe(true));
  test('returns true for CORRIDOR',    () => expect(isWalkable(TILE.CORRIDOR)).toBe(true));
  test('returns true for DOOR',        () => expect(isWalkable(TILE.DOOR)).toBe(true));
  test('returns true for STAIRS_UP',   () => expect(isWalkable(TILE.STAIRS_UP)).toBe(true));
  test('returns true for STAIRS_DOWN', () => expect(isWalkable(TILE.STAIRS_DOWN)).toBe(true));
});

// ---------------------------------------------------------------------------
// createGame
// ---------------------------------------------------------------------------

describe('createGame', () => {
  const SEED = 42;
  let state;

  beforeEach(() => { state = createGame({ seed: SEED }); });

  test('returns an object with dungeon, player, and turn', () => {
    expect(state).toHaveProperty('dungeon');
    expect(state).toHaveProperty('player');
    expect(state).toHaveProperty('turn');
  });

  test('places the player on the stairsUp tile', () => {
    expect(state.player.x).toBe(state.dungeon.stairsUp.x);
    expect(state.player.y).toBe(state.dungeon.stairsUp.y);
  });

  test('starts at turn 0', () => {
    expect(state.turn).toBe(0);
  });

  test('computes initial FOV — player tile is visible', () => {
    const { player, dungeon: { map } } = state;
    expect(map[player.y][player.x].visible).toBe(true);
  });

  test('initial FOV marks player tile as visited', () => {
    const { player, dungeon: { map } } = state;
    expect(map[player.y][player.x].visited).toBe(true);
  });

  test('is JSON round-trippable', () => {
    const clone = JSON.parse(JSON.stringify(state));
    expect(clone.player.x).toBe(state.player.x);
    expect(clone.player.y).toBe(state.player.y);
    expect(clone.turn).toBe(state.turn);
    expect(clone.dungeon.width).toBe(state.dungeon.width);
  });

  test('SIGHT_RADIUS is a positive integer', () => {
    expect(Number.isInteger(SIGHT_RADIUS)).toBe(true);
    expect(SIGHT_RADIUS).toBeGreaterThan(0);
  });

  test('starting room is revealed when illuminated (DL1 → all rooms lit)', () => {
    // DL1: all rooms illuminated; player starts in the stairsUp room
    const { dungeon: { map, rooms }, player } = state;
    const startRoom = findRoomContaining(rooms, player.x, player.y);
    expect(startRoom).not.toBeNull();
    expect(startRoom.illuminated).toBe(true);
    const cx = startRoom.x + Math.floor(startRoom.width / 2);
    const cy = startRoom.y + Math.floor(startRoom.height / 2);
    expect(map[cy][cx].alwaysVisible).toBe(true);
  });

  test('goldItems is an array', () => {
    expect(Array.isArray(state.goldItems)).toBe(true);
  });

  test('each gold item has x, y, and amount >= 2', () => {
    for (const g of state.goldItems) {
      expect(typeof g.x).toBe('number');
      expect(typeof g.y).toBe('number');
      expect(g.amount).toBeGreaterThanOrEqual(2);
    }
  });

  test('gold item amounts respect DL1 maximum (≤ 16)', () => {
    const many = [];
    for (let s = 0; s < 200; s++) many.push(...createGame({ seed: s }).goldItems);
    for (const g of many) expect(g.amount).toBeLessThanOrEqual(16);
  });

  test('gold item amounts respect DL5 maximum (≤ 80)', () => {
    const many = [];
    for (let s = 0; s < 200; s++) many.push(...createGame({ seed: s, dungeonLevel: 5 }).goldItems);
    for (const g of many) expect(g.amount).toBeLessThanOrEqual(80);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find a walkable cell in the entire map that has at least one blocked
 * cardinal neighbour. Positions the player there and returns the (dx, dy)
 * toward the blocked tile.
 * @param {object} state
 * @returns {{ dx: number, dy: number }}
 */
function setupAdjacentToWall(state) {
  const { dungeon: { map }, player } = state;
  const dirs = [
    { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
    { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
  ];
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[0].length; x++) {
      if (!isWalkable(map[y][x].type)) continue;
      for (const { dx, dy } of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (ny >= 0 && ny < map.length && nx >= 0 && nx < map[0].length) {
          if (!isWalkable(map[ny][nx].type)) {
            player.x = x;
            player.y = y;
            return { dx, dy };
          }
        }
      }
    }
  }
  throw new Error('No walkable cell with a blocked neighbour found');
}

/**
 * Find a walkable cardinal neighbour of the player.
 * @param {object} state
 * @returns {{ dx: number, dy: number }}
 */
function findOpenNeighbour(state) {
  const { dungeon: { map }, player } = state;
  const dirs = [
    { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
    { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
  ];
  for (const { dx, dy } of dirs) {
    const nx = player.x + dx;
    const ny = player.y + dy;
    if (ny >= 0 && ny < map.length && nx >= 0 && nx < map[0].length) {
      if (isWalkable(map[ny][nx].type)) return { dx, dy };
    }
  }
  throw new Error('No open neighbour found — try a different seed');
}

// ---------------------------------------------------------------------------
// movePlayer — success
// ---------------------------------------------------------------------------

describe('movePlayer — success', () => {
  let state;
  beforeEach(() => { state = createGame({ seed: 1 }); });

  test('updates player position on a valid move', () => {
    const { dx, dy } = findOpenNeighbour(state);
    const origX = state.player.x;
    const origY = state.player.y;
    movePlayer(state, dx, dy);
    expect(state.player.x).toBe(origX + dx);
    expect(state.player.y).toBe(origY + dy);
  });

  test('increments the turn counter on a valid move', () => {
    const { dx, dy } = findOpenNeighbour(state);
    movePlayer(state, dx, dy);
    expect(state.turn).toBe(1);
  });

  test('recomputes FOV after a valid move — new tile visible', () => {
    const { dx, dy } = findOpenNeighbour(state);
    movePlayer(state, dx, dy);
    const { player, dungeon: { map } } = state;
    expect(map[player.y][player.x].visible).toBe(true);
  });

  test('visited flags are sticky across moves', () => {
    const firstX = state.player.x;
    const firstY = state.player.y;
    const { dx, dy } = findOpenNeighbour(state);
    movePlayer(state, dx, dy);
    expect(state.dungeon.map[firstY][firstX].visited).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// movePlayer — blocked
// ---------------------------------------------------------------------------

describe('movePlayer — blocked', () => {
  let state;
  beforeEach(() => { state = createGame({ seed: 42 }); });

  test('does not update position when moving into a wall', () => {
    const { dx, dy } = setupAdjacentToWall(state);
    const origX = state.player.x;
    const origY = state.player.y;
    movePlayer(state, dx, dy);
    expect(state.player.x).toBe(origX);
    expect(state.player.y).toBe(origY);
  });

  test('does not increment turn when move is blocked', () => {
    const { dx, dy } = setupAdjacentToWall(state);
    movePlayer(state, dx, dy);
    expect(state.turn).toBe(0);
  });

  test('does not update position on out-of-bounds move', () => {
    state.player.x = 0;
    state.player.y = 0;
    movePlayer(state, -1, 0);
    expect(state.player.x).toBe(0);
    expect(state.player.y).toBe(0);
  });

  test('does not increment turn on out-of-bounds move', () => {
    state.player.x = 0;
    state.player.y = 0;
    movePlayer(state, 0, -1);
    expect(state.turn).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// movePlayer — wait (dx=0, dy=0)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// movePlayer — door illumination
// ---------------------------------------------------------------------------

/**
 * Scan the map for a DOOR tile that has a walkable non-door approach tile and
 * a room interior tile on the far side. Returns the approach position, move
 * direction, door position, and the room beyond, or null if none found.
 * @param {object} state
 * @returns {{ fromX:number, fromY:number, dx:number, dy:number, doorX:number, doorY:number, room:object }|null}
 */
function findIlluminatedDoorApproach(state) {
  const { dungeon: { map, rooms } } = state;
  const dirs = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
  for (let y = 1; y < map.length - 1; y++) {
    for (let x = 1; x < map[0].length - 1; x++) {
      if (map[y][x].type !== TILE.DOOR) continue;
      for (const { dx, dy } of dirs) {
        const fromX = x - dx;
        const fromY = y - dy;
        const beyondX = x + dx;
        const beyondY = y + dy;
        if (!isWalkable(map[fromY][fromX].type)) continue;
        if (map[fromY][fromX].type === TILE.DOOR) continue;
        const room = findRoomContaining(rooms, beyondX, beyondY);
        if (room?.illuminated) return { fromX, fromY, dx, dy, doorX: x, doorY: y, room };
      }
    }
  }
  return null;
}

describe('movePlayer — door illumination', () => {
  // DL1 → all rooms illuminated
  let state;
  beforeEach(() => {
    state = createGame({ seed: 42 });
    state.monsters = []; // avoid accidental combat
  });

  test('stepping onto a door of an illuminated room reveals the room interior', () => {
    const approach = findIlluminatedDoorApproach(state);
    expect(approach).not.toBeNull();
    const { fromX, fromY, dx, dy, room } = approach;
    state.player.x = fromX;
    state.player.y = fromY;
    movePlayer(state, dx, dy);
    const cx = room.x + Math.floor(room.width / 2);
    const cy = room.y + Math.floor(room.height / 2);
    expect(state.dungeon.map[cy][cx].alwaysVisible).toBe(true);
    expect(state.dungeon.map[cy][cx].visited).toBe(true);
  });

  test('illuminated room cells remain visible after subsequent turns', () => {
    const approach = findIlluminatedDoorApproach(state);
    const { fromX, fromY, dx, dy, room } = approach;
    state.player.x = fromX;
    state.player.y = fromY;
    movePlayer(state, dx, dy);
    // Take a second turn (wait) to trigger another resetVisibility
    movePlayer(state, 0, 0);
    const cx = room.x + Math.floor(room.width / 2);
    const cy = room.y + Math.floor(room.height / 2);
    expect(state.dungeon.map[cy][cx].visible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// movePlayer — gold pickup
// ---------------------------------------------------------------------------

describe('movePlayer — gold pickup', () => {
  let state;
  beforeEach(() => {
    state = createGame({ seed: 42 });
    state.monsters = [];
  });

  test('walking onto a gold item adds its amount to player.gold', () => {
    const goldItem = { x: state.player.x + 1, y: state.player.y, amount: 25 };
    state.goldItems = [goldItem];
    state.dungeon.map[goldItem.y][goldItem.x].type = 2; // FLOOR, ensure walkable
    movePlayer(state, 1, 0);
    if (state.player.x === goldItem.x && state.player.y === goldItem.y) {
      expect(state.player.gold).toBe(25);
      expect(state.goldItems).toHaveLength(0);
    }
  });

  test('picking up gold pushes a message', () => {
    const goldItem = { x: state.player.x + 1, y: state.player.y, amount: 10 };
    state.goldItems = [goldItem];
    state.dungeon.map[goldItem.y][goldItem.x].type = 2;
    movePlayer(state, 1, 0);
    if (state.player.x === goldItem.x) {
      expect(state.messages.some(m => m.includes('10'))).toBe(true);
    }
  });

  test('walking onto an empty cell does not change player.gold', () => {
    state.goldItems = [];
    const before = state.player.gold;
    movePlayer(state, 0, 0);
    expect(state.player.gold).toBe(before);
  });
});

describe('movePlayer — wait', () => {
  let state;
  beforeEach(() => { state = createGame({ seed: 42 }); });

  test('advances the turn counter when waiting in place', () => {
    movePlayer(state, 0, 0);
    expect(state.turn).toBe(1);
  });

  test('does not change player position when waiting', () => {
    const origX = state.player.x;
    const origY = state.player.y;
    movePlayer(state, 0, 0);
    expect(state.player.x).toBe(origX);
    expect(state.player.y).toBe(origY);
  });
});

// ---------------------------------------------------------------------------
// dropItem
// ---------------------------------------------------------------------------

describe('dropItem', () => {
  let state;
  beforeEach(() => {
    state = createGame({ seed: 42 });
    state.monsters = [];
    state.goldItems = [];
    state.dungeonItems = [];
    // Move player off the up-stairs to a plain floor tile
    const { map } = state.dungeon;
    outer: for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[0].length; x++) {
        if (map[y][x].type === TILE.FLOOR) { state.player.x = x; state.player.y = y; break outer; }
      }
    }
  });

  test('drops a non-equipped item onto the floor', () => {
    const food = state.player.inventory.find(i => i.type === 'food');
    const before = state.player.inventory.length;
    dropItem(state, food);
    expect(state.player.inventory.length).toBe(before - 1);
    expect(state.dungeonItems.some(d => d.item === food)).toBe(true);
  });

  test('cannot drop wielded weapon', () => {
    const weapon = state.player.equippedWeapon;
    const before = state.player.inventory.length;
    dropItem(state, weapon);
    expect(state.player.inventory.length).toBe(before);
    expect(state.messages[0]).toMatch(/unwield it before dropping/i);
  });

  test('cannot drop equipped armor', () => {
    const armor = state.player.equippedArmor;
    const before = state.player.inventory.length;
    dropItem(state, armor);
    expect(state.player.inventory.length).toBe(before);
    expect(state.messages[0]).toMatch(/remove it before dropping/i);
  });

  test('can drop unequipped armor', () => {
    const armor = state.player.equippedArmor;
    state.player.equippedArmor = null;
    const before = state.player.inventory.length;
    dropItem(state, armor);
    expect(state.player.inventory.length).toBe(before - 1);
  });

  test('cannot drop on a door tile', () => {
    const { map } = state.dungeon;
    outer: for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[0].length; x++) {
        if (map[y][x].type === TILE.DOOR) { state.player.x = x; state.player.y = y; break outer; }
      }
    }
    const food = state.player.inventory.find(i => i.type === 'food');
    const before = state.player.inventory.length;
    dropItem(state, food);
    expect(state.player.inventory.length).toBe(before);
    expect(state.messages[0]).toMatch(/can't drop that here/i);
  });
});

// ---------------------------------------------------------------------------
// HP regeneration
// ---------------------------------------------------------------------------

describe('HP regeneration', () => {
  let state;
  beforeEach(() => {
    state = createGame({ seed: 42 });
    state.monsters = [];
    state.player.hp = 1; // damaged
  });

  test('REGEN_RATES has one entry per rank and decreases with level', () => {
    expect(REGEN_RATES).toHaveLength(15);
    for (let i = 1; i < REGEN_RATES.length; i++) {
      expect(REGEN_RATES[i]).toBeLessThan(REGEN_RATES[i - 1]);
    }
  });

  test('restores 1 HP when turn count reaches the regen rate', () => {
    state.turn = REGEN_RATES[0] - 1;
    movePlayer(state, 0, 0); // turn becomes REGEN_RATES[0]
    expect(state.player.hp).toBe(2);
  });

  test('does not restore HP on a turn that is not a rate multiple', () => {
    state.turn = 0; // turn will become 1, not a multiple of 40
    movePlayer(state, 0, 0);
    expect(state.player.hp).toBe(1);
  });

  test('does not restore HP when already at max', () => {
    state.player.hp = state.player.maxHp;
    state.turn = REGEN_RATES[0] - 1;
    movePlayer(state, 0, 0);
    expect(state.player.hp).toBe(state.player.maxHp);
  });

  test('does not restore HP when player is dead', () => {
    state.player.hp = 0;
    state.dead = true;
    state.turn = REGEN_RATES[0] - 1;
    movePlayer(state, 0, 0);
    expect(state.player.hp).toBe(0);
  });

  test('higher xpLevel uses a faster (lower) regen rate', () => {
    state.player.xpLevel = 3; // Journeyman: rate = 32
    state.turn = REGEN_RATES[3] - 1;
    movePlayer(state, 0, 0);
    expect(state.player.hp).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// descendStairs
// ---------------------------------------------------------------------------

describe('descendStairs', () => {
  let state;
  beforeEach(() => { state = createGame({ seed: 42 }); });

  test('no-op when player is not on down-stairs', () => {
    state.player.x = state.dungeon.stairsUp.x;
    state.player.y = state.dungeon.stairsUp.y;
    const levelBefore = state.dungeonLevel;
    descendStairs(state);
    expect(state.dungeonLevel).toBe(levelBefore);
    expect(state.messages[0]).toMatch(/no down staircase/i);
  });

  test('increments dungeonLevel by 1', () => {
    state.player.x = state.dungeon.stairsDown.x;
    state.player.y = state.dungeon.stairsDown.y;
    descendStairs(state);
    expect(state.dungeonLevel).toBe(2);
  });

  test('places player on the up-stairs of the new level', () => {
    state.player.x = state.dungeon.stairsDown.x;
    state.player.y = state.dungeon.stairsDown.y;
    descendStairs(state);
    expect(state.player.x).toBe(state.dungeon.stairsUp.x);
    expect(state.player.y).toBe(state.dungeon.stairsUp.y);
  });

  test('replaces monsters with a new set', () => {
    state.player.x = state.dungeon.stairsDown.x;
    state.player.y = state.dungeon.stairsDown.y;
    const before = state.monsters;
    descendStairs(state);
    expect(state.monsters).not.toBe(before);
  });

  test('sets a descent message', () => {
    state.player.x = state.dungeon.stairsDown.x;
    state.player.y = state.dungeon.stairsDown.y;
    descendStairs(state);
    expect(state.messages[0]).toMatch(/descend/i);
  });
});

// ---------------------------------------------------------------------------
// ascendStairs
// ---------------------------------------------------------------------------

describe('ascendStairs', () => {
  let state;
  beforeEach(() => { state = createGame({ seed: 42 }); });

  test('no-op when player is not on up-stairs', () => {
    state.player.x = state.dungeon.stairsDown.x;
    state.player.y = state.dungeon.stairsDown.y;
    const levelBefore = state.dungeonLevel;
    ascendStairs(state);
    expect(state.dungeonLevel).toBe(levelBefore);
    expect(state.messages[0]).toMatch(/no up staircase/i);
  });

  test('ends game when on level 1', () => {
    state.player.x = state.dungeon.stairsUp.x;
    state.player.y = state.dungeon.stairsUp.y;
    ascendStairs(state);
    expect(state.dead).toBe(true);
    expect(state.causeOfDeath).toBe('escaped the dungeon');
  });

  test('escape message shown on level 1', () => {
    state.player.x = state.dungeon.stairsUp.x;
    state.player.y = state.dungeon.stairsUp.y;
    ascendStairs(state);
    expect(state.messages[0]).toMatch(/escape/i);
  });

  test('decrements dungeonLevel by 1 when above level 1', () => {
    state.player.x = state.dungeon.stairsDown.x;
    state.player.y = state.dungeon.stairsDown.y;
    descendStairs(state); // now on level 2
    state.player.x = state.dungeon.stairsUp.x;
    state.player.y = state.dungeon.stairsUp.y;
    ascendStairs(state); // back to level 1
    expect(state.dungeonLevel).toBe(1);
  });

  test('places player on down-stairs of the new level', () => {
    state.player.x = state.dungeon.stairsDown.x;
    state.player.y = state.dungeon.stairsDown.y;
    descendStairs(state); // level 2
    state.player.x = state.dungeon.stairsUp.x;
    state.player.y = state.dungeon.stairsUp.y;
    ascendStairs(state); // back to level 1
    expect(state.player.x).toBe(state.dungeon.stairsDown.x);
    expect(state.player.y).toBe(state.dungeon.stairsDown.y);
  });
});

// ---------------------------------------------------------------------------
// HP on rank-up
// ---------------------------------------------------------------------------

describe('HP on rank-up', () => {
  function raiseLevel(state) {
    const potion = { type: 'potion', name: 'potion of raise level' };
    state.player.inventory.push(potion);
    quaffPotion(state, potion);
  }

  test('HP_PER_RANK increases with rank index', () => {
    for (let i = 2; i < HP_PER_RANK.length; i++) {
      expect(HP_PER_RANK[i]).toBeGreaterThanOrEqual(HP_PER_RANK[i - 1]);
    }
  });

  test('maxHp increases by HP_PER_RANK[1] when promoting from rank 0', () => {
    const state = createGame({ seed: 42 });
    const before = state.player.maxHp;
    raiseLevel(state);
    expect(state.player.maxHp).toBe(before + HP_PER_RANK[1]);
  });

  test('current HP is scaled to the same percentage of new maxHp', () => {
    const state = createGame({ seed: 42 });
    state.player.hp = Math.floor(state.player.maxHp / 2);
    const ratio = state.player.hp / state.player.maxHp;
    raiseLevel(state);
    const expected = Math.max(1, Math.round(ratio * state.player.maxHp));
    expect(state.player.hp).toBe(expected);
  });

  test('HP is never reduced below 1 on promotion', () => {
    const state = createGame({ seed: 42 });
    state.player.hp = 1;
    state.player.maxHp = 1000; // contrived: ~0.1% ratio rounds to 0 without the clamp
    raiseLevel(state);
    expect(state.player.hp).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// cheatRankUp
// ---------------------------------------------------------------------------

describe('cheatRankUp', () => {
  let state;
  beforeEach(() => { state = createGame({ seed: 42 }); state.monsters = []; });

  test('increments xpLevel by 1', () => {
    const before = state.player.xpLevel;
    cheatRankUp(state);
    expect(state.player.xpLevel).toBe(before + 1);
  });

  test('sets player.xp to the XP_THRESHOLDS for the new level', () => {
    cheatRankUp(state);
    expect(state.player.xp).toBe(XP_THRESHOLDS[state.player.xpLevel]);
  });

  test('updates rank string', () => {
    cheatRankUp(state);
    expect(state.player.rank).toBeTruthy();
    expect(typeof state.player.rank).toBe('string');
  });

  test('increases maxHp', () => {
    const before = state.player.maxHp;
    cheatRankUp(state);
    expect(state.player.maxHp).toBeGreaterThan(before);
  });

  test('sets a cheat message', () => {
    cheatRankUp(state);
    expect(state.messages[0]).toMatch(/cheat|rank/i);
  });

  test('no-op at max rank', () => {
    state.player.xpLevel = 14; // RANKS.length - 1
    state.player.rank = 'Wizard';
    cheatRankUp(state);
    expect(state.player.xpLevel).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// readScroll
// ---------------------------------------------------------------------------

/** Helper: give the player a scroll and return it. */
function giveScroll(state, title) {
  const scroll = { type: 'scroll', name: `scroll of ${title}` };
  state.player.inventory.push(scroll);
  return scroll;
}

describe('readScroll — scroll consumed', () => {
  let state;
  beforeEach(() => { state = createGame({ seed: 42 }); state.monsters = []; });

  test('removes the scroll from inventory (identify)', () => {
    const s = giveScroll(state, 'identify');
    const before = state.player.inventory.length;
    readScroll(state, s);
    expect(state.player.inventory.length).toBe(before - 1);
    expect(state.player.inventory.includes(s)).toBe(false);
  });

  test('removes the scroll from inventory (enchant weapon)', () => {
    const s = giveScroll(state, 'enchant weapon');
    const before = state.player.inventory.length;
    readScroll(state, s);
    expect(state.player.inventory.length).toBe(before - 1);
  });

  test('no-op when item is not in inventory', () => {
    const s = { type: 'scroll', name: 'scroll of identify' };
    const before = state.player.inventory.length;
    readScroll(state, s);
    expect(state.player.inventory.length).toBe(before);
  });
});

describe('readScroll — enchant weapon', () => {
  let state;
  beforeEach(() => { state = createGame({ seed: 42 }); state.monsters = []; });

  test('increases equippedWeapon hitBonus by 1', () => {
    const before = state.player.equippedWeapon.hitBonus;
    readScroll(state, giveScroll(state, 'enchant weapon'));
    expect(state.player.equippedWeapon.hitBonus).toBe(before + 1);
  });

  test('increases equippedWeapon damageBonus by 1', () => {
    const before = state.player.equippedWeapon.damageBonus;
    readScroll(state, giveScroll(state, 'enchant weapon'));
    expect(state.player.equippedWeapon.damageBonus).toBe(before + 1);
  });

  test('updates player.hitBonus via recomputeWeapon', () => {
    const before = state.player.hitBonus;
    readScroll(state, giveScroll(state, 'enchant weapon'));
    expect(state.player.hitBonus).toBe(before + 1);
  });

  test('updates player.damageBonus via recomputeWeapon', () => {
    const before = state.player.damageBonus;
    readScroll(state, giveScroll(state, 'enchant weapon'));
    expect(state.player.damageBonus).toBe(before + 1);
  });

  test('no-op when no weapon equipped', () => {
    state.player.equippedWeapon = null;
    const s = giveScroll(state, 'enchant weapon');
    readScroll(state, s);
    expect(state.messages[0]).toMatch(/nothing happens/i);
  });
});

describe('readScroll — enchant armor', () => {
  let state;
  beforeEach(() => { state = createGame({ seed: 42 }); state.monsters = []; });

  test('increases equippedArmor.ac by 1', () => {
    const before = state.player.equippedArmor.ac;
    readScroll(state, giveScroll(state, 'enchant armor'));
    expect(state.player.equippedArmor.ac).toBe(before + 1);
  });

  test('updates player.defense via recomputeDefense', () => {
    const before = state.player.defense;
    readScroll(state, giveScroll(state, 'enchant armor'));
    expect(state.player.defense).toBe(before + 1);
  });

  test('no-op when no armor equipped', () => {
    state.player.equippedArmor = null;
    readScroll(state, giveScroll(state, 'enchant armor'));
    expect(state.messages[0]).toMatch(/nothing happens/i);
  });
});

describe('readScroll — magic mapping', () => {
  let state;
  beforeEach(() => { state = createGame({ seed: 42 }); state.monsters = []; });

  test('marks all map cells as visited', () => {
    readScroll(state, giveScroll(state, 'magic mapping'));
    const { map } = state.dungeon;
    for (const row of map)
      for (const cell of row)
        expect(cell.visited).toBe(true);
  });
});

describe('readScroll — teleportation', () => {
  let state;
  beforeEach(() => { state = createGame({ seed: 42 }); state.monsters = []; });

  test('moves the player to a different position', () => {
    const origX = state.player.x;
    const origY = state.player.y;
    // Run several times to reduce flakiness (player might teleport to same spot)
    let moved = false;
    for (let i = 0; i < 10 && !moved; i++) {
      const s = giveScroll(state, 'teleportation');
      readScroll(state, s);
      if (state.player.x !== origX || state.player.y !== origY) moved = true;
    }
    expect(moved).toBe(true);
  });

  test('new player position is walkable', () => {
    readScroll(state, giveScroll(state, 'teleportation'));
    const { map } = state.dungeon;
    expect(isWalkable(map[state.player.y][state.player.x].type)).toBe(true);
  });

  test('sets a dizzy message', () => {
    readScroll(state, giveScroll(state, 'teleportation'));
    expect(state.messages[0]).toMatch(/dizzy/i);
  });
});

describe('readScroll — light', () => {
  let state;
  beforeEach(() => { state = createGame({ seed: 42 }); state.monsters = []; });

  test('illuminated room cells become alwaysVisible', () => {
    const { dungeon: { map, rooms }, player } = state;
    // Reset alwaysVisible on the player's room first
    const room = rooms.find(r =>
      player.x >= r.x && player.x < r.x + r.width &&
      player.y >= r.y && player.y < r.y + r.height
    );
    if (room) {
      for (let dy = -1; dy <= room.height; dy++)
        for (let dx = -1; dx <= room.width; dx++) {
          const cell = map[room.y + dy]?.[room.x + dx];
          if (cell) cell.alwaysVisible = false;
        }
      room.illuminated = true;
    }
    readScroll(state, giveScroll(state, 'light'));
    if (room) {
      const cx = room.x + Math.floor(room.width / 2);
      const cy = room.y + Math.floor(room.height / 2);
      expect(map[cy][cx].alwaysVisible).toBe(true);
    }
  });
});

describe('readScroll — create monster', () => {
  let state;
  beforeEach(() => { state = createGame({ seed: 42 }); state.monsters = []; });

  test('increases monster count by 1 when space is available', () => {
    const before = state.monsters.length;
    readScroll(state, giveScroll(state, 'create monster'));
    expect(state.monsters.length).toBe(before + 1);
  });

  test('new monster is within 3 tiles of the player', () => {
    readScroll(state, giveScroll(state, 'create monster'));
    const m = state.monsters[state.monsters.length - 1];
    const dist = Math.max(Math.abs(m.x - state.player.x), Math.abs(m.y - state.player.y));
    expect(dist).toBeLessThanOrEqual(3);
  });

  test('new monster is on a walkable tile', () => {
    readScroll(state, giveScroll(state, 'create monster'));
    const m = state.monsters[state.monsters.length - 1];
    expect(isWalkable(state.dungeon.map[m.y][m.x].type)).toBe(true);
  });
});

describe('readScroll — aggravate monsters', () => {
  let state;
  beforeEach(() => { state = createGame({ seed: 42 }); });

  test('sets all monsters aggression to 3', () => {
    readScroll(state, giveScroll(state, 'aggravate monsters'));
    for (const m of state.monsters) expect(m.aggression).toBe(3);
  });

  test('marks all monsters as provoked', () => {
    readScroll(state, giveScroll(state, 'aggravate monsters'));
    for (const m of state.monsters) expect(m.provoked).toBe(true);
  });

  test('sets a message', () => {
    readScroll(state, giveScroll(state, 'aggravate monsters'));
    expect(state.messages[0]).toMatch(/stir/i);
  });
});

describe('readScroll — stub scrolls', () => {
  let state;
  beforeEach(() => { state = createGame({ seed: 42 }); state.monsters = []; });

  const stubs = [
    ['identify',      /knowledgeable/i],
    ['scare monster', /frightened/i],
    ['hold monster',  /freeze/i],
    ['remove curse',  /relief/i],
    ['protect armor', /glows briefly/i],
  ];

  for (const [title, pattern] of stubs) {
    test(`${title} sets a message without throwing`, () => {
      readScroll(state, giveScroll(state, title));
      expect(state.messages[0]).toMatch(pattern);
    });
  }
});

// ---------------------------------------------------------------------------
// putOnRing / removeRing
// ---------------------------------------------------------------------------

import { createRing } from '../src/game/item.js';

describe('putOnRing / removeRing', () => {
  let state;

  beforeEach(() => {
    state = createGame({ seed: 1 });
  });

  /** Helper: add a ring of the given effect to player inventory and return it. */
  function giveRing(effect) {
    const ring = createRing(effect);
    state.player.inventory.push(ring);
    return ring;
  }

  test('player starts with equippedRings [null, null]', () => {
    expect(state.player.equippedRings).toEqual([null, null]);
  });

  test('player starts with all ring bonus fields at 0', () => {
    expect(state.player.ringDefenseBonus).toBe(0);
    expect(state.player.ringDamageBonus).toBe(0);
    expect(state.player.ringHitBonus).toBe(0);
  });

  test('putOnRing equips ring to slot 0', () => {
    const ring = giveRing('protection');
    putOnRing(state, ring, 0);
    expect(state.player.equippedRings[0]).toBe(ring);
  });

  test('putOnRing equips ring to slot 1 and message says "right"', () => {
    const ring = giveRing('dexterity');
    putOnRing(state, ring, 1);
    expect(state.player.equippedRings[1]).toBe(ring);
    expect(state.messages[0]).toMatch(/right/i);
  });

  test('putOnRing message includes ring name and "left"', () => {
    const ring = giveRing('protection');
    putOnRing(state, ring, 0);
    expect(state.messages[0]).toMatch(/ring of protection/);
    expect(state.messages[0]).toMatch(/left/i);
  });

  test('putOnRing rejects occupied slot and leaves existing ring unchanged', () => {
    const ring1 = giveRing('protection');
    const ring2 = giveRing('dexterity');
    putOnRing(state, ring1, 0);
    putOnRing(state, ring2, 0);
    expect(state.player.equippedRings[0]).toBe(ring1);
    expect(state.messages[0]).toMatch(/already wearing/i);
  });

  test('can equip two different rings simultaneously', () => {
    const ring1 = giveRing('protection');
    const ring2 = giveRing('increase damage');
    putOnRing(state, ring1, 0);
    putOnRing(state, ring2, 1);
    expect(state.player.equippedRings[0]).toBe(ring1);
    expect(state.player.equippedRings[1]).toBe(ring2);
  });

  test('removeRing clears the slot', () => {
    const ring = giveRing('protection');
    putOnRing(state, ring, 0);
    removeRing(state, 0);
    expect(state.player.equippedRings[0]).toBeNull();
  });

  test('removeRing message includes ring name', () => {
    const ring = giveRing('dexterity');
    putOnRing(state, ring, 0);
    removeRing(state, 0);
    expect(state.messages[0]).toMatch(/ring of dexterity/);
  });

  test('removeRing on empty slot does not throw', () => {
    expect(() => removeRing(state, 0)).not.toThrow();
  });

  test('protection ring adds +1 to player.defense', () => {
    const before = state.player.defense;
    const ring = giveRing('protection');
    putOnRing(state, ring, 0);
    expect(state.player.defense).toBe(before + 1);
  });

  test('two protection rings add +2 to ringDefenseBonus', () => {
    putOnRing(state, giveRing('protection'), 0);
    putOnRing(state, giveRing('protection'), 1);
    expect(state.player.ringDefenseBonus).toBe(2);
    expect(state.player.defense).toBe(state.player.baseDefense + (state.player.equippedArmor?.ac ?? 0) + 2);
  });

  test('increase damage ring adds +1 to player.damageBonus', () => {
    const before = state.player.damageBonus;
    const ring = giveRing('increase damage');
    putOnRing(state, ring, 0);
    expect(state.player.damageBonus).toBe(before + 1);
  });

  test('dexterity ring adds +1 to player.hitBonus', () => {
    const before = state.player.hitBonus;
    const ring = giveRing('dexterity');
    putOnRing(state, ring, 0);
    expect(state.player.hitBonus).toBe(before + 1);
  });

  test('stub ring (slow digestion) does not change any stat', () => {
    const before = { defense: state.player.defense, hitBonus: state.player.hitBonus, damageBonus: state.player.damageBonus };
    putOnRing(state, giveRing('slow digestion'), 0);
    expect(state.player.defense).toBe(before.defense);
    expect(state.player.hitBonus).toBe(before.hitBonus);
    expect(state.player.damageBonus).toBe(before.damageBonus);
  });

  test('removing protection ring restores defense to pre-ring value', () => {
    const before = state.player.defense;
    const ring = giveRing('protection');
    putOnRing(state, ring, 0);
    removeRing(state, 0);
    expect(state.player.defense).toBe(before);
  });

  test('ring defense bonus persists through wearArmor / removeArmor cycle', () => {
    const ring = giveRing('protection');
    putOnRing(state, ring, 0);
    const bonusedDefense = state.player.defense;
    wearArmor(state, state.player.equippedArmor); // re-equip same armor — triggers recomputeDefense
    expect(state.player.ringDefenseBonus).toBe(1);
    expect(state.player.defense).toBe(bonusedDefense);
  });

  test('ring hit bonus persists through unwieldWeapon / wieldWeapon cycle', () => {
    const ring = giveRing('dexterity');
    putOnRing(state, ring, 0);
    const beforeHit = state.player.hitBonus;
    const weapon = state.player.inventory.find(i => i.type === 'weapon');
    unwieldWeapon(state);
    wieldWeapon(state, weapon);
    expect(state.player.hitBonus).toBe(beforeHit);
  });
});
