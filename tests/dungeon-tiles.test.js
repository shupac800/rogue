import { TILE, TILE_CHAR, makeCell } from '../src/dungeon/tiles.js';

describe('TILE enum', () => {
  test('all values are unique integers', () => {
    const values = Object.values(TILE);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
    values.forEach(v => expect(Number.isInteger(v)).toBe(true));
  });

  test('is frozen (immutable)', () => {
    expect(Object.isFrozen(TILE)).toBe(true);
    // ES modules run in strict mode — assignment to frozen object throws
    expect(() => { TILE.VOID = 99; }).toThrow(TypeError);
    expect(TILE.VOID).toBe(0);
  });

  test('contains expected keys', () => {
    const keys = ['VOID', 'WALL', 'FLOOR', 'CORRIDOR', 'DOOR', 'STAIRS_UP', 'STAIRS_DOWN'];
    keys.forEach(k => expect(TILE).toHaveProperty(k));
  });
});

describe('TILE_CHAR map', () => {
  test('is frozen', () => {
    expect(Object.isFrozen(TILE_CHAR)).toBe(true);
  });

  test('has an entry for every TILE value', () => {
    Object.values(TILE).forEach(v => {
      expect(TILE_CHAR).toHaveProperty(String(v));
      expect(typeof TILE_CHAR[v]).toBe('string');
      expect(TILE_CHAR[v].length).toBeGreaterThan(0);
    });
  });
});

describe('makeCell', () => {
  test('returns object with correct shape', () => {
    const cell = makeCell(TILE.FLOOR);
    expect(cell).toEqual({ type: TILE.FLOOR, visible: false, visited: false });
  });

  test('each call returns a new object', () => {
    const a = makeCell(TILE.WALL);
    const b = makeCell(TILE.WALL);
    expect(a).not.toBe(b);
  });

  test('accepts every tile type without throwing', () => {
    Object.values(TILE).forEach(v => {
      expect(() => makeCell(v)).not.toThrow();
    });
  });
});
