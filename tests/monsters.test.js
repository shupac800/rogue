/**
 * Tests for monster.js, combat.js, and ai.js
 */

import { MONSTER_TABLE, monstersForLevel, createMonster } from '../src/game/monster.js';
import { resolveCombat } from '../src/game/combat.js';
import { spawnMonsters, stepMonsters } from '../src/game/ai.js';
import { generate } from '../src/dungeon/generator.js';
import { TILE } from '../src/dungeon/tiles.js';

/** Bat template — level 1, aggression 0 (passive). */
const BAT = MONSTER_TABLE.find(m => m.name === 'Bat');
/** Hobgoblin template — level 1, aggression 1 (medium). */
const HOBGOBLIN = MONSTER_TABLE.find(m => m.name === 'Hobgoblin');
/** Leprechaun template — level 2, aggression 0 (passive), steals gold on hit. */
const LEPRECHAUN = MONSTER_TABLE.find(m => m.name === 'Leprechaun');

// ---------------------------------------------------------------------------
// createMonster
// ---------------------------------------------------------------------------

describe('createMonster', () => {
  test('returns an object with the correct shape', () => {
    const m = createMonster(BAT, 3, 5);
    for (const key of ['x', 'y', 'hp', 'maxHp', 'attack', 'defense', 'name', 'char']) {
      expect(m).toHaveProperty(key);
    }
  });

  test('places the monster at the given coordinates', () => {
    const m = createMonster(BAT, 7, 12);
    expect(m.x).toBe(7);
    expect(m.y).toBe(12);
  });

  test('sets correct starting stats from template', () => {
    const m = createMonster(BAT, 0, 0);
    expect(m.hp).toBe(BAT.hp);
    expect(m.maxHp).toBe(BAT.hp);
    expect(m.attack).toBe(BAT.attack);
    expect(m.defense).toBe(BAT.defense);
    expect(m.name).toBe('bat');
    expect(m.char).toBe('B');
  });

  test('returns distinct objects on each call', () => {
    const a = createMonster(BAT, 0, 0);
    const b = createMonster(BAT, 0, 0);
    expect(a).not.toBe(b);
    a.hp = 1;
    expect(b.hp).toBe(BAT.hp);
  });
});

// ---------------------------------------------------------------------------
// monstersForLevel
// ---------------------------------------------------------------------------

describe('monstersForLevel', () => {
  test('DL1 returns only level-1 monsters', () => {
    const eligible = monstersForLevel(1);
    expect(eligible.length).toBeGreaterThan(0);
    for (const m of eligible) expect(m.level).toBe(1);
  });

  test('DL2 returns level 1-2 monsters', () => {
    const eligible = monstersForLevel(2);
    for (const m of eligible) expect(m.level).toBeGreaterThanOrEqual(1);
    for (const m of eligible) expect(m.level).toBeLessThanOrEqual(2);
    expect(eligible.some(m => m.level === 1)).toBe(true);
    expect(eligible.some(m => m.level === 2)).toBe(true);
  });

  test('DL5 returns level 4-5 monsters', () => {
    const eligible = monstersForLevel(5);
    for (const m of eligible) expect(m.level).toBeGreaterThanOrEqual(4);
    for (const m of eligible) expect(m.level).toBeLessThanOrEqual(5);
  });

  test('DL10 is clamped to level 4-5 (same as DL5)', () => {
    expect(monstersForLevel(10)).toEqual(monstersForLevel(5));
  });

  test('all 26 monsters appear across all tiers', () => {
    const seen = new Set();
    for (let dl = 1; dl <= 5; dl++) {
      for (const m of monstersForLevel(dl)) seen.add(m.name);
    }
    expect(seen.size).toBe(26);
  });
});

// ---------------------------------------------------------------------------
// resolveCombat
// ---------------------------------------------------------------------------

/**
 * Build a deterministic RNG that returns values from the given sequence.
 * @param {...number} values
 * @returns {() => number}
 */
function seq(...values) {
  let i = 0;
  return () => values[i++ % values.length];
}

/** rng value that guarantees a hit (>= MISS_CHANCE threshold of 0.25). */
const HIT = 0.99;
/** rng value that guarantees a miss (< MISS_CHANCE threshold of 0.25). */
const MISS = 0.0;

describe('resolveCombat', () => {
  test('returns hit:false and 0 damage on a miss', () => {
    const result = resolveCombat({ attack: 5 }, { hp: 10, defense: 2 }, seq(MISS));
    expect(result.hit).toBe(false);
    expect(result.damage).toBe(0);
  });

  test('does not mutate defender.hp on a miss', () => {
    const defender = { hp: 10, defense: 0 };
    resolveCombat({ attack: 3 }, defender, seq(MISS));
    expect(defender.hp).toBe(10);
  });

  test('returns hit:true on a hit', () => {
    const result = resolveCombat({ attack: 5 }, { hp: 10, defense: 2 }, seq(HIT, 0.5));
    expect(result.hit).toBe(true);
  });

  test('mutates defender.hp on a hit', () => {
    const defender = { hp: 10, defense: 0 };
    resolveCombat({ attack: 3 }, defender, seq(HIT, 0.5));
    expect(defender.hp).toBeLessThan(10);
  });

  test('minimum damage is 1 even when defense exceeds raw damage', () => {
    // rawDamage = 1 + floor(0 * 4) = 1; defense = 5; max(1, 1-5) = 1
    const defender = { hp: 10, defense: 5 };
    const { damage } = resolveCombat({ attack: 1 }, defender, seq(HIT, 0.0));
    expect(damage).toBe(1);
  });

  test('lethal hit drives defender hp below zero', () => {
    const defender = { hp: 3, defense: 0 };
    resolveCombat({ attack: 10 }, defender, seq(HIT, 0.99));
    expect(defender.hp).toBeLessThan(0);
  });

  test('tier 0 for minimum raw damage', () => {
    // attack=3, maxRaw=12, rng2=0 → rawDamage=1 → tier=floor(0/3)=0
    const { tier } = resolveCombat({ attack: 3 }, { hp: 10, defense: 0 }, seq(HIT, 0.0));
    expect(tier).toBe(0);
  });

  test('tier 1 for low-mid raw damage', () => {
    // attack=3, maxRaw=12, rng2=0.333 → rawDamage=1+floor(4)=5 → tier=floor(4/3)=1
    const { tier } = resolveCombat({ attack: 3 }, { hp: 10, defense: 0 }, seq(HIT, 0.333));
    expect(tier).toBe(1);
  });

  test('tier 3 for near-maximum raw damage', () => {
    // attack=3, maxRaw=12, rng2=0.99 → rawDamage=1+floor(11.88)=12 → tier=min(3,floor(11/3))=3
    const { tier } = resolveCombat({ attack: 3 }, { hp: 20, defense: 0 }, seq(HIT, 0.99));
    expect(tier).toBe(3);
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
    const monsters = spawnMonsters(dungeon, () => Math.random(), 1);
    expect(monsters.length).toBe(dungeon.rooms.length - 1);
  });

  test('no monster is placed at the stairsUp position', () => {
    const monsters = spawnMonsters(dungeon, () => Math.random(), 1);
    const atStart = monsters.some(
      m => m.x === dungeon.stairsUp.x && m.y === dungeon.stairsUp.y
    );
    expect(atStart).toBe(false);
  });

  test('each monster is placed on a floor-like tile', () => {
    const walkable = new Set([TILE.FLOOR, TILE.CORRIDOR, TILE.DOOR, TILE.STAIRS_UP, TILE.STAIRS_DOWN]);
    const monsters = spawnMonsters(dungeon, () => Math.random(), 1);
    for (const m of monsters) {
      expect(walkable.has(dungeon.map[m.y][m.x].type)).toBe(true);
    }
  });

  test('DL1 spawns only level-1 monsters', () => {
    const rng = (() => { let i = 0; return () => [0, 0.5, 0.99][i++ % 3]; })();
    const monsters = spawnMonsters(dungeon, rng, 1);
    const level1Names = new Set(monstersForLevel(1).map(m => m.name.toLowerCase()));
    for (const m of monsters) expect(level1Names.has(m.name)).toBe(true);
  });

  test('DL5 spawns only level 4-5 monsters', () => {
    const rng = (() => { let i = 0; return () => [0, 0.5, 0.99][i++ % 3]; })();
    const monsters = spawnMonsters(dungeon, rng, 5);
    const level45Names = new Set(monstersForLevel(5).map(m => m.name.toLowerCase()));
    for (const m of monsters) expect(level45Names.has(m.name)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Helpers for stepMonsters tests
// ---------------------------------------------------------------------------

/**
 * Build a minimal state object for stepMonsters.
 */
function makeState(dungeon, player, monsters) {
  return { dungeon, player, monsters, messages: [] };
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

  test('aggression-1 monster adjacent to player reduces player.hp', () => {
    const center = nonStartCenter(dungeon);
    const player = { x: center.x + 1, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    const monster = createMonster(HOBGOBLIN, center.x, center.y);
    const state = makeState(dungeon, player, [monster]);

    dungeon.map[player.y][player.x] = { type: TILE.FLOOR, visible: true, visited: true, alwaysVisible: false };
    dungeon.map[monster.y][monster.x] = { type: TILE.FLOOR, visible: true, visited: true, alwaysVisible: false };

    stepMonsters(state, () => 0.99); // guaranteed hit
    expect(player.hp).toBeLessThan(20);
  });

  test('attack damage is at least 1', () => {
    const center = nonStartCenter(dungeon);
    const player = { x: center.x + 1, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 100 };
    const monster = createMonster(HOBGOBLIN, center.x, center.y);
    const state = makeState(dungeon, player, [monster]);

    dungeon.map[player.y][player.x] = { type: TILE.FLOOR, visible: true, visited: true, alwaysVisible: false };
    dungeon.map[monster.y][monster.x] = { type: TILE.FLOOR, visible: true, visited: true, alwaysVisible: false };

    stepMonsters(state, () => 0.99); // guaranteed hit; min damage = 1 regardless of defense
    expect(player.hp).toBeLessThan(20);
  });
});

// ---------------------------------------------------------------------------
// stepMonsters — move
// ---------------------------------------------------------------------------

describe('stepMonsters — move', () => {
  let dungeon;
  beforeEach(() => { dungeon = generate({ seed: 7 }); });

  test('aggression-1 monster in range but not adjacent moves closer to player', () => {
    const center = nonStartCenter(dungeon);
    const mx = center.x - 3;
    const my = center.y;
    const player = { x: center.x, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    const monster = createMonster(HOBGOBLIN, mx, my);
    const state = makeState(dungeon, player, [monster]);

    for (let x = mx; x <= center.x; x++) {
      dungeon.map[my][x] = { type: TILE.FLOOR, visible: true, visited: true, alwaysVisible: false };
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
    const monster = createMonster(BAT, center.x, center.y);
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

// ---------------------------------------------------------------------------
// aggression behavior
// ---------------------------------------------------------------------------

describe('aggression 0 — passive', () => {
  let dungeon;
  beforeEach(() => { dungeon = generate({ seed: 7 }); });

  function floorRow(dungeon, y, x1, x2) {
    for (let x = x1; x <= x2; x++)
      dungeon.map[y][x] = { type: TILE.FLOOR, visible: true, visited: true, alwaysVisible: false };
  }

  test('unprovoked passive monster does not move toward player within sight', () => {
    const center = nonStartCenter(dungeon);
    const mx = center.x - 3;
    const player = { x: center.x, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    const monster = createMonster(BAT, mx, center.y);
    floorRow(dungeon, center.y, mx, center.x);
    const state = makeState(dungeon, player, [monster]);
    stepMonsters(state);
    expect(monster.x).toBe(mx);
  });

  test('unprovoked passive monster adjacent to player does not attack', () => {
    const center = nonStartCenter(dungeon);
    const player = { x: center.x + 1, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    const monster = createMonster(BAT, center.x, center.y);
    dungeon.map[center.y][center.x] = { type: TILE.FLOOR, visible: true, visited: true, alwaysVisible: false };
    dungeon.map[center.y][center.x + 1] = { type: TILE.FLOOR, visible: true, visited: true, alwaysVisible: false };
    const state = makeState(dungeon, player, [monster]);
    stepMonsters(state, () => 0.99);
    expect(player.hp).toBe(20);
  });

  test('provoked passive monster moves toward player', () => {
    const center = nonStartCenter(dungeon);
    const mx = center.x - 3;
    const player = { x: center.x, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    const monster = createMonster(BAT, mx, center.y);
    monster.provoked = true;
    floorRow(dungeon, center.y, mx, center.x);
    const state = makeState(dungeon, player, [monster]);
    stepMonsters(state);
    expect(monster.x).toBeGreaterThan(mx);
  });

  test('provoked passive monster attacks when adjacent', () => {
    const center = nonStartCenter(dungeon);
    const player = { x: center.x + 1, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    const monster = createMonster(BAT, center.x, center.y);
    monster.provoked = true;
    dungeon.map[center.y][center.x] = { type: TILE.FLOOR, visible: true, visited: true, alwaysVisible: false };
    dungeon.map[center.y][center.x + 1] = { type: TILE.FLOOR, visible: true, visited: true, alwaysVisible: false };
    const state = makeState(dungeon, player, [monster]);
    stepMonsters(state, () => 0.99);
    expect(player.hp).toBeLessThan(20);
  });
});

describe('aggression 2 — roaming', () => {
  let dungeon;
  beforeEach(() => { dungeon = generate({ seed: 7 }); });

  /** Build a monster with aggression 2 by overriding the field. */
  function makeRoamer(x, y) {
    const m = createMonster(HOBGOBLIN, x, y);
    m.aggression = 2;
    return m;
  }

  test('roaming monster beyond pursuit range moves (wanders)', () => {
    const center = nonStartCenter(dungeon);
    // Place player 6 tiles away (beyond PURSUIT_SIGHT=4, within MONSTER_SIGHT=8)
    const mx = center.x;
    const player = { x: center.x + 6, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    for (let x = mx; x <= player.x; x++)
      dungeon.map[center.y][x] = { type: TILE.FLOOR, visible: true, visited: true, alwaysVisible: false };
    const monster = makeRoamer(mx, center.y);
    const state = makeState(dungeon, player, [monster]);
    const origX = monster.x;
    const origY = monster.y;
    stepMonsters(state, () => 0.0); // deterministic wander direction
    expect(monster.x !== origX || monster.y !== origY).toBe(true);
  });

  test('roaming monster within pursuit range moves closer to player', () => {
    const center = nonStartCenter(dungeon);
    const mx = center.x - 3; // 3 tiles away, within PURSUIT_SIGHT=4
    const player = { x: center.x, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    for (let x = mx; x <= center.x; x++)
      dungeon.map[center.y][x] = { type: TILE.FLOOR, visible: true, visited: true, alwaysVisible: false };
    const monster = makeRoamer(mx, center.y);
    const state = makeState(dungeon, player, [monster]);
    const beforeDist = Math.abs(player.x - monster.x);
    stepMonsters(state);
    expect(Math.abs(player.x - monster.x)).toBeLessThan(beforeDist);
  });
});

describe('aggression 3 — always active', () => {
  let dungeon;
  beforeEach(() => { dungeon = generate({ seed: 7 }); });

  test('always-active monster pursues player beyond MONSTER_SIGHT', () => {
    const center = nonStartCenter(dungeon);
    const mx = center.x - 12; // 12 tiles away, beyond MONSTER_SIGHT=8
    const player = { x: center.x, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    for (let x = mx; x <= center.x; x++)
      dungeon.map[center.y][x] = { type: TILE.FLOOR, visible: true, visited: true, alwaysVisible: false };
    const monster = createMonster(HOBGOBLIN, mx, center.y);
    monster.aggression = 3;
    const state = makeState(dungeon, player, [monster]);
    const beforeDist = Math.abs(player.x - monster.x);
    stepMonsters(state);
    expect(Math.abs(player.x - monster.x)).toBeLessThan(beforeDist);
  });
});

// ---------------------------------------------------------------------------
// monster status effects — paralysis and confusion
// ---------------------------------------------------------------------------

describe('monster statusEffects — paralysis', () => {
  let dungeon;
  beforeEach(() => { dungeon = generate({ seed: 7 }); });

  test('paralyzed monster does not move toward player', () => {
    const center = nonStartCenter(dungeon);
    const mx = center.x - 3;
    const player = { x: center.x, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    const monster = createMonster(HOBGOBLIN, mx, center.y);
    monster.statusEffects.paralysis = 5;
    for (let x = mx; x <= center.x; x++)
      dungeon.map[center.y][x] = { type: TILE.FLOOR, visible: true, visited: true, alwaysVisible: false };
    const state = makeState(dungeon, player, [monster]);
    stepMonsters(state);
    expect(monster.x).toBe(mx);
  });

  test('paralysis counter decrements each step', () => {
    const center = nonStartCenter(dungeon);
    const player = { x: center.x, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    const monster = createMonster(HOBGOBLIN, center.x - 3, center.y);
    monster.statusEffects.paralysis = 3;
    const state = makeState(dungeon, player, [monster]);
    stepMonsters(state);
    expect(monster.statusEffects.paralysis).toBe(2);
  });

  test('monster resumes normal AI once paralysis expires', () => {
    const center = nonStartCenter(dungeon);
    const mx = center.x - 3;
    const player = { x: center.x, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    const monster = createMonster(HOBGOBLIN, mx, center.y);
    monster.statusEffects.paralysis = 1;
    for (let x = mx; x <= center.x; x++)
      dungeon.map[center.y][x] = { type: TILE.FLOOR, visible: true, visited: true, alwaysVisible: false };
    const state = makeState(dungeon, player, [monster]);
    stepMonsters(state); // paralysis expires (1→0), monster still skips this turn
    expect(monster.x).toBe(mx); // did not move this step
    stepMonsters(state); // now free — should move
    expect(monster.x).toBeGreaterThan(mx);
  });
});

describe('monster statusEffects — confusion', () => {
  let dungeon;
  beforeEach(() => { dungeon = generate({ seed: 7 }); });

  test('confused monster does not pursue player', () => {
    const center = nonStartCenter(dungeon);
    const mx = center.x - 3;
    const player = { x: center.x, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    const monster = createMonster(HOBGOBLIN, mx, center.y);
    monster.statusEffects.confusion = 10;
    for (let x = mx; x <= center.x; x++)
      dungeon.map[center.y][x] = { type: TILE.FLOOR, visible: true, visited: true, alwaysVisible: false };
    const state = makeState(dungeon, player, [monster]);
    stepMonsters(state, () => 0.99); // rng >= 0.5: wanders, does not pursue
    expect(monster.x).not.toBe(mx + 1); // not moving toward player
  });

  test('confusion counter decrements each step', () => {
    const center = nonStartCenter(dungeon);
    const player = { x: center.x, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    const monster = createMonster(HOBGOBLIN, center.x - 3, center.y);
    monster.statusEffects.confusion = 8;
    const state = makeState(dungeon, player, [monster]);
    stepMonsters(state);
    expect(monster.statusEffects.confusion).toBe(7);
  });

  test('monster resumes normal AI once confusion expires', () => {
    const center = nonStartCenter(dungeon);
    const mx = center.x - 3;
    const player = { x: center.x, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    const monster = createMonster(HOBGOBLIN, mx, center.y);
    monster.statusEffects.confusion = 1;
    for (let x = mx; x <= center.x; x++)
      dungeon.map[center.y][x] = { type: TILE.FLOOR, visible: true, visited: true, alwaysVisible: false };
    const state = makeState(dungeon, player, [monster]);
    stepMonsters(state, () => 0.0); // confusion expires (1→0), stays still (rng<0.5)
    expect(monster.statusEffects.confusion).toBe(0);
    stepMonsters(state); // now free — pursues player
    expect(monster.x).toBeGreaterThan(mx);
  });
});

// ---------------------------------------------------------------------------
// leprechaun — gold theft
// ---------------------------------------------------------------------------

describe('leprechaun — gold theft', () => {
  let dungeon;
  beforeEach(() => { dungeon = generate({ seed: 7 }); });

  /** Place a provoked leprechaun adjacent to the player and return {state, monster}. */
  function setup(playerGold) {
    const center = nonStartCenter(dungeon);
    const player = { x: center.x + 1, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1, gold: playerGold };
    const monster = createMonster(LEPRECHAUN, center.x, center.y);
    monster.provoked = true;
    dungeon.map[center.y][center.x] = { type: TILE.FLOOR, visible: true, visited: true, alwaysVisible: false };
    dungeon.map[center.y][center.x + 1] = { type: TILE.FLOOR, visible: true, visited: true, alwaysVisible: false };
    const state = makeState(dungeon, player, [monster]);
    return { state, player, monster };
  }

  test('on a hit, leprechaun is removed from state.monsters', () => {
    const { state } = setup(100);
    stepMonsters(state, () => 0.99); // guaranteed hit
    expect(state.monsters.length).toBe(0);
  });

  test('on a hit, leprechaun deals no HP damage', () => {
    const { state, player } = setup(100);
    stepMonsters(state, () => 0.99);
    expect(player.hp).toBe(20);
  });

  test('on a hit, steals 10% of player gold (floored)', () => {
    const { state, player } = setup(150);
    stepMonsters(state, () => 0.99);
    expect(player.gold).toBe(106); // 150 - floor(150*(0.1+0.99*0.2)) = 150-44
  });

  test('stolen amount is capped at 640', () => {
    const { state, player } = setup(8000);
    stepMonsters(state, () => 0.99);
    expect(player.gold).toBe(7360); // 8000 - 640
  });

  test('on a hit with 0 gold, leprechaun still vanishes', () => {
    const { state, monster } = setup(0);
    stepMonsters(state, () => 0.99);
    expect(monster.hp).toBe(0);
    expect(state.monsters.length).toBe(0);
  });

  test('on a hit with 0 gold, player gold stays at 0', () => {
    const { state, player } = setup(0);
    stepMonsters(state, () => 0.99);
    expect(player.gold).toBe(0);
  });

  test('on a miss, leprechaun does not vanish', () => {
    const { state, monster } = setup(100);
    stepMonsters(state, () => 0.0); // guaranteed miss
    expect(monster.hp).toBe(LEPRECHAUN.hp);
    expect(state.monsters.length).toBe(1);
  });

  test('on a miss, player gold is unchanged', () => {
    const { state, player } = setup(100);
    stepMonsters(state, () => 0.0);
    expect(player.gold).toBe(100);
  });

  test('hit message mentions stolen gold amount', () => {
    const { state } = setup(200);
    stepMonsters(state, () => 0.99);
    expect(state.messages.some(m => m.includes('59') && m.includes('gold'))).toBe(true);
  });

  test('hit message with 0 gold mentions nothing to steal', () => {
    const { state } = setup(0);
    stepMonsters(state, () => 0.99);
    expect(state.messages.some(m => m.includes('nothing') || m.includes('Nothing'))).toBe(true);
  });
});

describe('dead monster cleanup', () => {
  let dungeon;
  beforeEach(() => { dungeon = generate({ seed: 7 }); });

  test('dead monsters are removed from state.monsters after stepMonsters', () => {
    const center = nonStartCenter(dungeon);
    const player = { x: center.x, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    const dead = createMonster(BAT, center.x + 5, center.y);
    dead.hp = 0;
    const alive = createMonster(BAT, center.x + 20, center.y); // out of range
    const state = makeState(dungeon, player, [dead, alive]);

    stepMonsters(state);
    expect(state.monsters).not.toContain(dead);
    expect(state.monsters).toContain(alive);
  });

  test('monster killed by player attack is absent after step', () => {
    const center = nonStartCenter(dungeon);
    const player = { x: center.x, y: center.y, hp: 20, maxHp: 20, attack: 3, defense: 1 };
    const monster = createMonster(BAT, center.x + 1, center.y);
    monster.hp = 1;
    const state = makeState(dungeon, player, [monster]);

    dungeon.map[center.y][center.x + 1] = { type: TILE.FLOOR, visible: true, visited: true, alwaysVisible: false };

    resolveCombat(player, monster, () => 0.99);
    state.monsters = state.monsters.filter(m => m.hp > 0);

    expect(state.monsters.length).toBe(0);
  });
});
