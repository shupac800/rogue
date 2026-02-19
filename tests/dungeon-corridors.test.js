import { TILE } from '../src/dungeon/tiles.js';
import { buildSectors } from '../src/dungeon/room.js';
import { buildCorridorPairs, carveCorridor, isWallTile } from '../src/dungeon/corridor.js';
import { createBlankMap } from '../src/dungeon/generator.js';

const MAP_W = 80;
const MAP_H = 22;

describe('buildCorridorPairs', () => {
  const sectors = buildSectors(MAP_W, MAP_H);
  let pairs;

  beforeEach(() => {
    pairs = buildCorridorPairs(sectors);
  });

  test('returns exactly 12 pairs', () => {
    expect(pairs).toHaveLength(12);
  });

  test('all indices are in range 0–8', () => {
    pairs.forEach(({ fromIdx, toIdx }) => {
      expect(fromIdx).toBeGreaterThanOrEqual(0);
      expect(fromIdx).toBeLessThanOrEqual(8);
      expect(toIdx).toBeGreaterThanOrEqual(0);
      expect(toIdx).toBeLessThanOrEqual(8);
    });
  });

  test('no pair connects a sector to itself', () => {
    pairs.forEach(({ fromIdx, toIdx }) => {
      expect(fromIdx).not.toBe(toIdx);
    });
  });

  test('horizontal pairs are right-adjacent (toIdx === fromIdx + 1, same row)', () => {
    // First 6 should be horizontal adjacencies
    const hPairs = pairs.slice(0, 6);
    hPairs.forEach(({ fromIdx, toIdx }) => {
      expect(toIdx).toBe(fromIdx + 1);
      expect(Math.floor(fromIdx / 3)).toBe(Math.floor(toIdx / 3)); // same row
    });
  });

  test('vertical pairs are down-adjacent (toIdx === fromIdx + 3)', () => {
    const vPairs = pairs.slice(6, 12);
    vPairs.forEach(({ fromIdx, toIdx }) => {
      expect(toIdx).toBe(fromIdx + 3);
    });
  });

  test('all pairs are unique', () => {
    const keys = pairs.map(p => `${p.fromIdx}-${p.toIdx}`);
    expect(new Set(keys).size).toBe(12);
  });
});

describe('carveCorridor', () => {
  const rng = () => 0.5;

  test('all cells along horizontal leg are non-VOID after carve', () => {
    const map = createBlankMap(MAP_W, MAP_H);
    const from = { x: 5, y: 5 };
    const to = { x: 15, y: 10 };
    carveCorridor(map, from, to, rng);
    for (let x = 5; x <= 15; x++) {
      expect(map[5][x].type).not.toBe(TILE.VOID);
    }
  });

  test('all cells along vertical leg are non-VOID after carve', () => {
    const map = createBlankMap(MAP_W, MAP_H);
    const from = { x: 5, y: 5 };
    const to = { x: 15, y: 10 };
    carveCorridor(map, from, to, rng);
    for (let y = 5; y <= 10; y++) {
      expect(map[y][15].type).not.toBe(TILE.VOID);
    }
  });

  test('VOID cells become CORRIDOR', () => {
    const map = createBlankMap(MAP_W, MAP_H);
    const from = { x: 2, y: 2 };
    const to = { x: 8, y: 6 };
    carveCorridor(map, from, to, rng);
    // Middle of the horizontal leg should be CORRIDOR (was VOID)
    expect(map[2][5].type).toBe(TILE.CORRIDOR);
  });

  test('WALL cells become DOOR', () => {
    const map = createBlankMap(MAP_W, MAP_H);
    // Place a wall in the path
    map[5][10].type = TILE.WALL;
    const from = { x: 5, y: 5 };
    const to = { x: 15, y: 10 };
    carveCorridor(map, from, to, rng);
    expect(map[5][10].type).toBe(TILE.DOOR);
  });

  test('FLOOR cells are not overwritten', () => {
    const map = createBlankMap(MAP_W, MAP_H);
    map[5][10].type = TILE.FLOOR;
    const from = { x: 5, y: 5 };
    const to = { x: 15, y: 10 };
    carveCorridor(map, from, to, rng);
    expect(map[5][10].type).toBe(TILE.FLOOR);
  });

  test('returns Corridor object with from, to, bend', () => {
    const map = createBlankMap(MAP_W, MAP_H);
    const from = { x: 3, y: 3 };
    const to = { x: 12, y: 8 };
    const corridor = carveCorridor(map, from, to, rng);
    expect(corridor).toHaveProperty('from');
    expect(corridor).toHaveProperty('to');
    expect(corridor).toHaveProperty('bend');
    expect(corridor.bend).toEqual({ x: to.x, y: from.y });
  });
});

describe('isWallTile', () => {
  test('returns true for WALL tiles', () => {
    const map = createBlankMap(5, 5);
    map[2][2].type = TILE.WALL;
    expect(isWallTile(map, 2, 2)).toBe(true);
  });

  test('returns false for FLOOR tiles', () => {
    const map = createBlankMap(5, 5);
    map[2][2].type = TILE.FLOOR;
    expect(isWallTile(map, 2, 2)).toBe(false);
  });

  test('returns false for out-of-bounds coordinates', () => {
    const map = createBlankMap(5, 5);
    expect(isWallTile(map, -1, 0)).toBe(false);
    expect(isWallTile(map, 0, -1)).toBe(false);
    expect(isWallTile(map, 10, 0)).toBe(false);
  });
});
