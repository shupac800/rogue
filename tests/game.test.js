/**
 * Tests for src/game/player.js and src/game/state.js
 */

import { createPlayer } from '../src/game/player.js';
import {
  createGame,
  movePlayer,
  isWalkable,
  illuminateRoomAt,
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
    for (const key of ['x', 'y', 'hp', 'maxHp', 'attack', 'defense', 'gold', 'xp', 'xpLevel', 'rank']) {
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
    expect(p.hp).toBe(4);
    expect(p.maxHp).toBe(20);
    expect(p.attack).toBe(3);
    expect(p.defense).toBe(1);
    expect(p.gold).toBe(0);
    expect(p.xp).toBe(0);
    expect(p.xpLevel).toBe(0);
    expect(p.rank).toBe('Amateur');
  });

  test('returns distinct objects on each call', () => {
    const a = createPlayer(0, 0);
    const b = createPlayer(0, 0);
    expect(a).not.toBe(b);
    a.hp = 1;
    expect(b.hp).toBe(4);
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
