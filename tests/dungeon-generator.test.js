import { generate, createRng, createBlankMap, placeStairs } from '../src/dungeon/generator.js';
import { TILE } from '../src/dungeon/tiles.js';

describe('generate() shape', () => {
  let dungeon;

  beforeEach(() => {
    dungeon = generate({ seed: 1 });
  });

  test('returns all required fields', () => {
    expect(dungeon).toHaveProperty('width');
    expect(dungeon).toHaveProperty('height');
    expect(dungeon).toHaveProperty('map');
    expect(dungeon).toHaveProperty('rooms');
    expect(dungeon).toHaveProperty('corridors');
    expect(dungeon).toHaveProperty('stairsUp');
    expect(dungeon).toHaveProperty('stairsDown');
  });

  test('map dimensions match width/height', () => {
    expect(dungeon.map).toHaveLength(dungeon.height);
    dungeon.map.forEach(row => expect(row).toHaveLength(dungeon.width));
  });

  test('produces exactly 9 rooms', () => {
    expect(dungeon.rooms).toHaveLength(9);
  });

  test('produces exactly 12 corridors', () => {
    expect(dungeon.corridors).toHaveLength(12);
  });

  test('default dimensions are 80×22', () => {
    expect(dungeon.width).toBe(80);
    expect(dungeon.height).toBe(22);
  });
});

describe('stair placement', () => {
  test('stairsUp and stairsDown are in different positions', () => {
    const d = generate({ seed: 5 });
    expect(d.stairsUp).not.toEqual(d.stairsDown);
  });

  test('stairsUp tile is STAIRS_UP', () => {
    const d = generate({ seed: 5 });
    expect(d.map[d.stairsUp.y][d.stairsUp.x].type).toBe(TILE.STAIRS_UP);
  });

  test('stairsDown tile is STAIRS_DOWN', () => {
    const d = generate({ seed: 5 });
    expect(d.map[d.stairsDown.y][d.stairsDown.x].type).toBe(TILE.STAIRS_DOWN);
  });

  test('stair coordinates are within map bounds', () => {
    const d = generate({ seed: 5 });
    expect(d.stairsUp.x).toBeGreaterThanOrEqual(0);
    expect(d.stairsUp.x).toBeLessThan(d.width);
    expect(d.stairsUp.y).toBeGreaterThanOrEqual(0);
    expect(d.stairsUp.y).toBeLessThan(d.height);
    expect(d.stairsDown.x).toBeGreaterThanOrEqual(0);
    expect(d.stairsDown.y).toBeGreaterThanOrEqual(0);
  });
});

describe('seed determinism', () => {
  test('same seed produces identical dungeons', () => {
    const a = generate({ seed: 42 });
    const b = generate({ seed: 42 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('different seeds produce different dungeons', () => {
    const a = generate({ seed: 1 });
    const b = generate({ seed: 2 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  test('no seed produces a dungeon without throwing', () => {
    expect(() => generate()).not.toThrow();
  });
});

describe('JSON serialization', () => {
  test('round-trips through JSON.stringify / JSON.parse', () => {
    const original = generate({ seed: 7 });
    const serialized = JSON.stringify(original);
    const restored = JSON.parse(serialized);
    expect(JSON.stringify(restored)).toBe(serialized);
  });

  test('all map cells survive round-trip with correct shape', () => {
    const d = generate({ seed: 7 });
    const restored = JSON.parse(JSON.stringify(d));
    restored.map.forEach(row => {
      row.forEach(cell => {
        expect(cell).toHaveProperty('type');
        expect(cell).toHaveProperty('visible');
        expect(cell).toHaveProperty('visited');
      });
    });
  });
});

describe('flood-fill connectivity', () => {
  /**
   * Collect all walkable (non-VOID, non-WALL) tiles and confirm they form
   * a single connected component via 4-directional flood fill.
   */
  function floodFill(map, startX, startY) {
    const visited = new Set();
    const queue = [[startX, startY]];
    const walkable = t => t !== TILE.VOID && t !== TILE.WALL;
    const key = (x, y) => `${x},${y}`;

    while (queue.length > 0) {
      const [x, y] = queue.shift();
      const k = key(x, y);
      if (visited.has(k)) continue;
      if (y < 0 || y >= map.length || x < 0 || x >= map[0].length) continue;
      if (!walkable(map[y][x].type)) continue;
      visited.add(k);
      queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return visited;
  }

  test('all walkable tiles are reachable from stairsUp', () => {
    const d = generate({ seed: 100 });
    const reached = floodFill(d.map, d.stairsUp.x, d.stairsUp.y);

    let totalWalkable = 0;
    d.map.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell.type !== TILE.VOID && cell.type !== TILE.WALL) {
          totalWalkable++;
          expect(reached.has(`${x},${y}`)).toBe(true);
        }
      });
    });
    expect(totalWalkable).toBeGreaterThan(0);
  });
});

describe('createRng', () => {
  test('seeded rng is deterministic', () => {
    const r1 = createRng(123);
    const r2 = createRng(123);
    const samples = 20;
    for (let i = 0; i < samples; i++) {
      expect(r1()).toBe(r2());
    }
  });

  test('returns values in [0, 1)', () => {
    const rng = createRng(999);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('createBlankMap', () => {
  test('all cells start as VOID with visible/visited false', () => {
    const map = createBlankMap(10, 5);
    expect(map).toHaveLength(5);
    map.forEach(row => {
      expect(row).toHaveLength(10);
      row.forEach(cell => {
        expect(cell.type).toBe(TILE.VOID);
        expect(cell.visible).toBe(false);
        expect(cell.visited).toBe(false);
      });
    });
  });
});
