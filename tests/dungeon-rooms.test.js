import { TILE, makeCell } from '../src/dungeon/tiles.js';
import { buildSectors, generateRoom, carveRoom, roomCenter } from '../src/dungeon/room.js';
import { createBlankMap } from '../src/dungeon/generator.js';

const MAP_W = 80;
const MAP_H = 22;

function seededRng(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = s + 0x6d2b79f5 | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('generateRoom', () => {
  const sectors = buildSectors(MAP_W, MAP_H);

  test('room interior fits within sector bounds (all sectors)', () => {
    const rng = seededRng(42);
    sectors.forEach(sector => {
      const room = generateRoom(sector, rng);
      // Interior must be inside the sector
      expect(room.x).toBeGreaterThanOrEqual(sector.x);
      expect(room.y).toBeGreaterThanOrEqual(sector.y);
      expect(room.x + room.width).toBeLessThanOrEqual(sector.x + sector.width);
      expect(room.y + room.height).toBeLessThanOrEqual(sector.y + sector.height);
    });
  });

  test('room interior is at least 3×3', () => {
    const rng = seededRng(99);
    sectors.forEach(sector => {
      const room = generateRoom(sector, rng);
      expect(room.width).toBeGreaterThanOrEqual(3);
      expect(room.height).toBeGreaterThanOrEqual(3);
    });
  });

  test('room walls (1 tile outside) fit within map', () => {
    const rng = seededRng(7);
    sectors.forEach(sector => {
      const room = generateRoom(sector, rng);
      expect(room.x - 1).toBeGreaterThanOrEqual(0);
      expect(room.y - 1).toBeGreaterThanOrEqual(0);
      expect(room.x + room.width).toBeLessThan(MAP_W);
      expect(room.y + room.height).toBeLessThan(MAP_H);
    });
  });

  test('all rooms illuminated on dungeon level 1', () => {
    const rng = seededRng(42);
    sectors.forEach(sector => {
      const room = generateRoom(sector, rng, 1);
      expect(room.illuminated).toBe(true);
    });
  });

  test('no rooms illuminated on dungeon level 5', () => {
    const rng = seededRng(42);
    sectors.forEach(sector => {
      const room = generateRoom(sector, rng, 5);
      expect(room.illuminated).toBe(false);
    });
  });

  test('no rooms illuminated on dungeon level 6 (beyond max)', () => {
    const rng = seededRng(42);
    sectors.forEach(sector => {
      const room = generateRoom(sector, rng, 6);
      expect(room.illuminated).toBe(false);
    });
  });
});

describe('carveRoom', () => {
  test('interior cells are FLOOR', () => {
    const map = createBlankMap(MAP_W, MAP_H);
    const room = { x: 5, y: 5, width: 4, height: 4 };
    carveRoom(map, room);
    for (let dy = 0; dy < room.height; dy++) {
      for (let dx = 0; dx < room.width; dx++) {
        expect(map[room.y + dy][room.x + dx].type).toBe(TILE.FLOOR);
      }
    }
  });

  test('perimeter cells are WALL', () => {
    const map = createBlankMap(MAP_W, MAP_H);
    const room = { x: 5, y: 5, width: 4, height: 4 };
    carveRoom(map, room);
    // Top/bottom walls
    for (let dx = -1; dx <= room.width; dx++) {
      expect(map[room.y - 1][room.x + dx].type).toBe(TILE.WALL);
      expect(map[room.y + room.height][room.x + dx].type).toBe(TILE.WALL);
    }
    // Left/right walls
    for (let dy = -1; dy <= room.height; dy++) {
      expect(map[room.y + dy][room.x - 1].type).toBe(TILE.WALL);
      expect(map[room.y + dy][room.x + room.width].type).toBe(TILE.WALL);
    }
  });

  test('cells beyond the perimeter remain VOID', () => {
    const map = createBlankMap(MAP_W, MAP_H);
    const room = { x: 10, y: 10, width: 3, height: 3 };
    carveRoom(map, room);
    // Two tiles outside should still be VOID
    expect(map[room.y - 2][room.x].type).toBe(TILE.VOID);
    expect(map[room.y][room.x - 2].type).toBe(TILE.VOID);
  });
});

describe('roomCenter', () => {
  test('center is inside the room interior', () => {
    const room = { x: 4, y: 6, width: 5, height: 4 };
    const center = roomCenter(room);
    expect(center.x).toBeGreaterThanOrEqual(room.x);
    expect(center.x).toBeLessThan(room.x + room.width);
    expect(center.y).toBeGreaterThanOrEqual(room.y);
    expect(center.y).toBeLessThan(room.y + room.height);
  });

  test('center of 1×1 room equals its origin', () => {
    const room = { x: 3, y: 3, width: 1, height: 1 };
    expect(roomCenter(room)).toEqual({ x: 3, y: 3 });
  });
});
