import { TILE, makeCell } from '../src/dungeon/tiles.js';
import { createBlankMap } from '../src/dungeon/generator.js';
import { computeFov, resetVisibility, isBlocking } from '../src/fov/index.js';

/**
 * Build a map of size w×h filled with FLOOR and a 1-tile WALL border.
 * All cells start with visible=false, visited=false.
 * @param {number} w
 * @param {number} h
 * @returns {Array<Array<{type:number,visible:boolean,visited:boolean}>>}
 */
function makeOpenMap(w, h) {
  const map = createBlankMap(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const onBorder = x === 0 || x === w - 1 || y === 0 || y === h - 1;
      map[y][x] = makeCell(onBorder ? TILE.WALL : TILE.FLOOR);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// isBlocking
// ---------------------------------------------------------------------------
describe('isBlocking', () => {
  test('VOID blocks', () => expect(isBlocking(TILE.VOID)).toBe(true));
  test('WALL blocks', () => expect(isBlocking(TILE.WALL)).toBe(true));
  test('FLOOR does not block', () => expect(isBlocking(TILE.FLOOR)).toBe(false));
  test('CORRIDOR does not block', () => expect(isBlocking(TILE.CORRIDOR)).toBe(false));
  test('DOOR blocks', () => expect(isBlocking(TILE.DOOR)).toBe(true));
  test('STAIRS_UP does not block', () => expect(isBlocking(TILE.STAIRS_UP)).toBe(false));
  test('STAIRS_DOWN does not block', () => expect(isBlocking(TILE.STAIRS_DOWN)).toBe(false));
});

// ---------------------------------------------------------------------------
// resetVisibility
// ---------------------------------------------------------------------------
describe('resetVisibility', () => {
  test('sets visible=false on all cells', () => {
    const map = makeOpenMap(10, 10);
    map.forEach(row => row.forEach(cell => { cell.visible = true; }));
    resetVisibility(map);
    map.forEach(row => row.forEach(cell => expect(cell.visible).toBe(false)));
  });

  test('leaves visited unchanged', () => {
    const map = makeOpenMap(10, 10);
    map[5][5].visited = true;
    map[3][3].visited = false;
    resetVisibility(map);
    expect(map[5][5].visited).toBe(true);
    expect(map[3][3].visited).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// radius = 0
// ---------------------------------------------------------------------------
describe('computeFov radius=0', () => {
  test('only origin is visible', () => {
    const map = makeOpenMap(15, 15);
    const origin = { x: 7, y: 7 };
    computeFov(map, origin, 0);
    expect(map[7][7].visible).toBe(true);
    expect(map[7][7].visited).toBe(true);
    // adjacent tiles should be dark
    expect(map[7][8].visible).toBe(false);
    expect(map[8][7].visible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// open room — cardinal visibility at radius
// ---------------------------------------------------------------------------
describe('computeFov open room', () => {
  const W = 21, H = 21;
  const cx = 10, cy = 10;
  const RADIUS = 5;
  let map;

  beforeEach(() => {
    map = makeOpenMap(W, H);
    computeFov(map, { x: cx, y: cy }, RADIUS);
  });

  test('origin is always visible', () => {
    expect(map[cy][cx].visible).toBe(true);
  });

  test('cardinal tile at radius is visible', () => {
    expect(map[cy][cx + RADIUS].visible).toBe(true); // east
    expect(map[cy][cx - RADIUS].visible).toBe(true); // west
    expect(map[cy + RADIUS][cx].visible).toBe(true); // south
    expect(map[cy - RADIUS][cx].visible).toBe(true); // north
  });

  test('tile one beyond radius is dark', () => {
    expect(map[cy][cx + RADIUS + 1].visible).toBe(false);
    expect(map[cy][cx - RADIUS - 1].visible).toBe(false);
  });

  test('visible tiles are also marked visited', () => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (map[y][x].visible) {
          expect(map[y][x].visited).toBe(true);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// wall blocking
// ---------------------------------------------------------------------------
describe('computeFov wall blocking', () => {
  test('wall face is visible', () => {
    const map = makeOpenMap(21, 21);
    // place a wall one step east of origin
    map[10][12] = makeCell(TILE.WALL);
    computeFov(map, { x: 10, y: 10 }, 8);
    expect(map[10][12].visible).toBe(true);
  });

  test('tile directly behind wall is dark', () => {
    const map = makeOpenMap(21, 21);
    map[10][12] = makeCell(TILE.WALL);
    computeFov(map, { x: 10, y: 10 }, 8);
    expect(map[10][13].visible).toBe(false);
  });

  test('tile beside wall (not in shadow) is still lit', () => {
    const map = makeOpenMap(21, 21);
    map[10][12] = makeCell(TILE.WALL);
    computeFov(map, { x: 10, y: 10 }, 8);
    expect(map[9][12].visible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// visited stickiness
// ---------------------------------------------------------------------------
describe('visited stickiness', () => {
  test('visited flag persists after player moves', () => {
    const map = makeOpenMap(21, 21);
    computeFov(map, { x: 10, y: 10 }, 5);
    // record which tiles were visited
    const wasVisited = map[10][15].visited; // east edge of radius
    expect(wasVisited).toBe(true);
    // move player far away
    computeFov(map, { x: 3, y: 3 }, 5);
    // old tile should no longer be visible but still visited
    expect(map[10][15].visible).toBe(false);
    expect(map[10][15].visited).toBe(true);
  });

  test('resetVisibility never clears visited', () => {
    const map = makeOpenMap(10, 10);
    map[5][5].visited = true;
    resetVisibility(map);
    expect(map[5][5].visited).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// edge cases — player near corners / border
// ---------------------------------------------------------------------------
describe('edge cases', () => {
  test('player at top-left inner corner does not throw', () => {
    const map = makeOpenMap(20, 20);
    expect(() => computeFov(map, { x: 1, y: 1 }, 5)).not.toThrow();
  });

  test('player at bottom-right inner corner does not throw', () => {
    const map = makeOpenMap(20, 20);
    expect(() => computeFov(map, { x: 18, y: 18 }, 5)).not.toThrow();
  });

  test('origin is always visible regardless of position', () => {
    const map = makeOpenMap(20, 20);
    computeFov(map, { x: 1, y: 1 }, 5);
    expect(map[1][1].visible).toBe(true);
    expect(map[1][1].visited).toBe(true);
  });

  test('large radius does not throw on small map', () => {
    const map = makeOpenMap(7, 7);
    expect(() => computeFov(map, { x: 3, y: 3 }, 100)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// JSON round-trip
// ---------------------------------------------------------------------------
describe('JSON round-trip', () => {
  test('visible and visited survive stringify/parse', () => {
    const map = makeOpenMap(15, 15);
    computeFov(map, { x: 7, y: 7 }, 4);
    const restored = JSON.parse(JSON.stringify(map));
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
        expect(restored[y][x].visible).toBe(map[y][x].visible);
        expect(restored[y][x].visited).toBe(map[y][x].visited);
      }
    }
  });
});
