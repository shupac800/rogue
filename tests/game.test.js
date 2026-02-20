/**
 * Tests for src/game/player.js and src/game/state.js
 */

import { createPlayer } from '../src/game/player.js';
import {
  createGame,
  movePlayer,
  isWalkable,
  SIGHT_RADIUS,
} from '../src/game/state.js';
import { TILE } from '../src/dungeon/tiles.js';

// ---------------------------------------------------------------------------
// createPlayer
// ---------------------------------------------------------------------------

describe('createPlayer', () => {
  test('returns an object with the correct shape', () => {
    const p = createPlayer(3, 5);
    for (const key of ['x', 'y', 'hp', 'maxHp', 'attack', 'defense', 'gold', 'xp', 'level']) {
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
    expect(p.level).toBe(1);
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
