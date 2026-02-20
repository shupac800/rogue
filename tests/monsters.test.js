/**
 * Tests for monster.js, combat.js, and ai.js
 */

import { createMonster } from '../src/game/monster.js';
import { resolveCombat } from '../src/game/combat.js';
import { spawnMonsters, stepMonsters } from '../src/game/ai.js';
import { generate } from '../src/dungeon/generator.js';
import { TILE } from '../src/dungeon/tiles.js';

// ---------------------------------------------------------------------------
// createMonster
// ---------------------------------------------------------------------------

describe('createMonster', () => {
  test('returns an object with the correct shape', () => {
    const m = createMonster(3, 5);
    for (const key of ['x', 'y', 'hp', 'maxHp', 'attack', 'defense', 'name', 'char']) {
      expect(m).toHaveProperty(key);
    }
  });

  test('places the monster at the given coordinates', () => {
    const m = createMonster(7, 12);
    expect(m.x).toBe(7);
    expect(m.y).toBe(12);
  });

  test('sets correct starting stats', () => {
    const m = createMonster(0, 0);
    expect(m.hp).toBe(5);
    expect(m.maxHp).toBe(5);
    expect(m.attack).toBe(2);
    expect(m.defense).toBe(0);
    expect(m.name).toBe('rat');
    expect(m.char).toBe('r');
  });

  test('returns distinct objects on each call', () => {
    const a = createMonster(0, 0);
    const b = createMonster(0, 0);
    expect(a).not.toBe(b);
    a.hp = 1;
    expect(b.hp).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// resolveCombat
// ---------------------------------------------------------------------------

describe('resolveCombat', () => {
  test('damage = attack - defense', () => {
    const attacker = { attack: 5 };
    const defender = { hp: 10, defense: 2 };
    const { damage } = resolveCombat(attacker, defender);
    expect(damage).toBe(3);
  });

  test('minimum damage is 1 when defense >= attack', () => {
    const attacker = { attack: 1 };
    const defender = { hp: 10, defense: 5 };
    const { damage } = resolveCombat(attacker, defender);
    expect(damage).toBe(1);
  });

  test('mutates defender.hp', () => {
    const attacker = { attack: 4 };
    const defender = { hp: 10, defense: 1 };
    resolveCombat(attacker, defender);
    expect(defender.hp).toBe(7);
  });

  test('lethal hit drives hp below zero', () => {
    const attacker = { attack: 10 };
    const defender = { hp: 3, defense: 0 };
    resolveCombat(attacker, defender);
    expect(defender.hp).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// spawnMonsters
// ---------------------------------------------------------------------------

describe('spawnMonsters', () => {
  const SEED = 42;
  let dungeon;

  beforeEach(() => { dungeon = generate({ seed: SEED }); });

  test('spawns rooms-1 monsters (one per non-start room)', () => {
    const monsters = spawnMonsters(dungeon, () => Math.random());
    expect(monsters.length).toBe(dungeon.rooms.length - 1);
  });

  test('no monster is placed at the stairsUp position', () => {
    const monsters = spawnMonsters(dungeon, () => Math.random());
    const atStart = monsters.some(
      m => m.x === dungeon.stairsUp.x && m.y === dungeon.stairsUp.y
    );
    expect(atStart).toBe(false);
  });

  test('each monster is placed on a floor-like tile', () => {
    const walkable = new Set([TILE.FLOOR, TILE.CORRIDOR, TILE.DOOR, TILE.STAIRS_UP, TILE.STAIRS_DOWN]);
    const monsters = spawnMonsters(dungeon, () => Math.random());
    for (const m of monsters) {
      expect(walkable.has(dungeon.map[m.y][m.x].type)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Helpers for stepMonsters tests
// ---------------------------------------------------------------------------

/**
 * Build a minimal state object for stepMonsters.
 * The dungeon is a generated level. Player and monsters are positioned manually.
 */
function makeState(dungeon, player, monsters) {
  return { dungeon, player, monsters };
}

/**
 * Find a room center that is NOT the stairsUp position.
 */
function nonStartCenter(dungeon) {
  for (const room of dungeon.rooms) {
    const cx = room.x + Math.floor(room.width / 2);
    const cy = room.y + Math.floor(room.height / 2);
    if (cx !== dungeon.stairsUp.x || cy !== dungeon.stairsUp.y) {
      return { x: cx, y: cy };
    }
  }
  throw new Error('No non-start room found');
}

// ---------------------------------------------------------------------------
// stepMonsters — attack
// ---------------------------------------------------------------------------

describe('stepMonsters — attack', () => {
  let dungeon;
  beforeEach(() => { dungeon = generate({ seed: 7 }); });

  test('monster adjacent to player reduces player.hp', () => {
    const center = nonStartCenter(dungeon);
    // Place player one step to the right of monster
    const player = { x: center.x + 1, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    const monster = createMonster(center.x, center.y);
    const state = makeState(dungeon, player, [monster]);

    // Make the player cell walkable for this test
    dungeon.map[player.y][player.x] = { type: TILE.FLOOR, visible: true, visited: true };
    dungeon.map[monster.y][monster.x] = { type: TILE.FLOOR, visible: true, visited: true };

    stepMonsters(state);
    expect(player.hp).toBeLessThan(20);
  });

  test('attack damage is at least 1', () => {
    const center = nonStartCenter(dungeon);
    const player = { x: center.x + 1, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 100 };
    const monster = createMonster(center.x, center.y);
    const state = makeState(dungeon, player, [monster]);

    dungeon.map[player.y][player.x] = { type: TILE.FLOOR, visible: true, visited: true };
    dungeon.map[monster.y][monster.x] = { type: TILE.FLOOR, visible: true, visited: true };

    stepMonsters(state);
    expect(player.hp).toBe(19); // damage = max(1, 2-100) = 1
  });
});

// ---------------------------------------------------------------------------
// stepMonsters — move
// ---------------------------------------------------------------------------

describe('stepMonsters — move', () => {
  let dungeon;
  beforeEach(() => { dungeon = generate({ seed: 7 }); });

  test('monster in range but not adjacent moves closer to player', () => {
    const center = nonStartCenter(dungeon);
    // Place monster 3 steps left of center; player at center
    const mx = center.x - 3;
    const my = center.y;
    const player = { x: center.x, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    const monster = createMonster(mx, my);
    const state = makeState(dungeon, player, [monster]);

    // Carve a clear floor path
    for (let x = mx; x <= center.x; x++) {
      dungeon.map[my][x] = { type: TILE.FLOOR, visible: true, visited: true };
    }

    const beforeDist = Math.abs(player.x - monster.x);
    stepMonsters(state);
    const afterDist = Math.abs(player.x - monster.x);
    expect(afterDist).toBeLessThan(beforeDist);
  });
});

// ---------------------------------------------------------------------------
// stepMonsters — wait
// ---------------------------------------------------------------------------

describe('stepMonsters — wait', () => {
  let dungeon;
  beforeEach(() => { dungeon = generate({ seed: 7 }); });

  test('monster out of sight range does not move', () => {
    const center = nonStartCenter(dungeon);
    // Monster very far from player (>8 Chebyshev)
    const monster = createMonster(center.x, center.y);
    const player = { x: center.x + 20, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    const state = makeState(dungeon, player, [monster]);

    const origX = monster.x;
    const origY = monster.y;
    stepMonsters(state);
    expect(monster.x).toBe(origX);
    expect(monster.y).toBe(origY);
    expect(player.hp).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// dead monster cleanup
// ---------------------------------------------------------------------------

describe('dead monster cleanup', () => {
  let dungeon;
  beforeEach(() => { dungeon = generate({ seed: 7 }); });

  test('dead monsters are removed from state.monsters after stepMonsters', () => {
    const center = nonStartCenter(dungeon);
    const player = { x: center.x, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    const dead = createMonster(center.x + 5, center.y);
    dead.hp = 0; // already dead
    const alive = createMonster(center.x + 20, center.y); // out of range, won't act
    const state = makeState(dungeon, player, [dead, alive]);

    stepMonsters(state);
    expect(state.monsters).not.toContain(dead);
    expect(state.monsters).toContain(alive);
  });

  test('monster killed by player attack is absent after step', () => {
    const center = nonStartCenter(dungeon);
    const player = { x: center.x, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    // Rat with 1 hp; player attack=3, so resolveCombat kills it
    const monster = createMonster(center.x + 1, center.y);
    monster.hp = 1;
    const state = makeState(dungeon, player, [monster]);

    dungeon.map[center.y][center.x + 1] = { type: TILE.FLOOR, visible: true, visited: true };

    // Simulate what movePlayer does on bump-attack
    resolveCombat(player, monster);
    state.monsters = state.monsters.filter(m => m.hp > 0);

    expect(state.monsters.length).toBe(0);
  });
});
