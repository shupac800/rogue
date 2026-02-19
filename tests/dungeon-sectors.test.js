import { buildSectors } from '../src/dungeon/room.js';

const MAP_W = 80;
const MAP_H = 22;

describe('buildSectors', () => {
  let sectors;

  beforeEach(() => {
    sectors = buildSectors(MAP_W, MAP_H);
  });

  test('returns exactly 9 sectors', () => {
    expect(sectors).toHaveLength(9);
  });

  test('all sector dimensions are positive', () => {
    sectors.forEach(s => {
      expect(s.width).toBeGreaterThan(0);
      expect(s.height).toBeGreaterThan(0);
    });
  });

  test('sectors cover the full map width', () => {
    // Check each row sums to MAP_W
    for (let row = 0; row < 3; row++) {
      const rowSectors = sectors.slice(row * 3, row * 3 + 3);
      const totalW = rowSectors.reduce((sum, s) => sum + s.width, 0);
      expect(totalW).toBe(MAP_W);
    }
  });

  test('sectors cover the full map height', () => {
    // Check each column sums to MAP_H
    for (let col = 0; col < 3; col++) {
      const colSectors = [sectors[col], sectors[3 + col], sectors[6 + col]];
      const totalH = colSectors.reduce((sum, s) => sum + s.height, 0);
      expect(totalH).toBe(MAP_H);
    }
  });

  test('no horizontal gaps or overlaps within a row', () => {
    for (let row = 0; row < 3; row++) {
      const rowSectors = sectors.slice(row * 3, row * 3 + 3);
      let expected = 0;
      rowSectors.forEach(s => {
        expect(s.x).toBe(expected);
        expected += s.width;
      });
    }
  });

  test('no vertical gaps or overlaps within a column', () => {
    for (let col = 0; col < 3; col++) {
      const colSectors = [sectors[col], sectors[3 + col], sectors[6 + col]];
      let expected = 0;
      colSectors.forEach(s => {
        expect(s.y).toBe(expected);
        expected += s.height;
      });
    }
  });

  test('first sector starts at origin', () => {
    expect(sectors[0].x).toBe(0);
    expect(sectors[0].y).toBe(0);
  });
});
