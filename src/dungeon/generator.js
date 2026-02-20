/**
 * @module generator
 * Dungeon generation orchestrator.
 * Combines sectors, rooms, corridors and stair placement into a full Dungeon.
 */

import { TILE, makeCell } from './tiles.js';
import { buildSectors, generateRoom, carveRoom, roomCenter } from './room.js';
import { buildCorridorPairs, carveCorridor } from './corridor.js';

/** Default map dimensions matching the 80×22 viewport. */
const DEFAULT_WIDTH = 80;
const DEFAULT_HEIGHT = 22;

/**
 * Create a seeded pseudo-random number generator (mulberry32).
 * Falls back to Math.random when no seed is provided.
 * @param {number} [seed]
 * @returns {() => number} Function returning a float in [0, 1).
 */
export function createRng(seed) {
  if (seed === undefined || seed === null) return () => Math.random();
  let s = seed >>> 0;
  return function mulberry32() {
    s |= 0; s = s + 0x6d2b79f5 | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create a 2-D map filled with VOID cells.
 * Indexed as map[y][x].
 * @param {number} width
 * @param {number} height
 * @returns {Array<Array<{type:number,visible:boolean,visited:boolean}>>}
 */
export function createBlankMap(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => makeCell(TILE.VOID))
  );
}

/**
 * Place STAIRS_UP and STAIRS_DOWN in the floor centers of two different rooms.
 * @param {Array} map
 * @param {Array<{x:number,y:number,width:number,height:number}>} rooms
 * @param {() => number} rng
 * @returns {{ stairsUp: {x:number,y:number}, stairsDown: {x:number,y:number} }}
 */
export function placeStairs(map, rooms, rng) {
  const upIdx = Math.floor(rng() * rooms.length);
  let downIdx;
  do {
    downIdx = Math.floor(rng() * rooms.length);
  } while (downIdx === upIdx);

  const stairsUp = roomCenter(rooms[upIdx]);
  const stairsDown = roomCenter(rooms[downIdx]);

  map[stairsUp.y][stairsUp.x] = makeCell(TILE.STAIRS_UP);
  map[stairsDown.y][stairsDown.x] = makeCell(TILE.STAIRS_DOWN);

  return { stairsUp, stairsDown };
}

/**
 * @typedef {{
 *   width: number,
 *   height: number,
 *   map: Array<Array<{type:number,visible:boolean,visited:boolean}>>,
 *   rooms: Array<{x:number,y:number,width:number,height:number,illuminated:boolean}>,
 *   corridors: Array<{from:{x:number,y:number},to:{x:number,y:number},bend:{x:number,y:number}}>,
 *   stairsUp: {x:number,y:number},
 *   stairsDown: {x:number,y:number}
 * }} Dungeon
 */

/**
 * Generate a complete dungeon level.
 * All returned data is JSON-serializable (plain objects + primitives only).
 * @param {{ width?: number, height?: number, seed?: number, dungeonLevel?: number }} [options={}]
 * @returns {Dungeon}
 */
export function generate(options = {}) {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;

  const dungeonLevel = options.dungeonLevel ?? 1;
  const rng = createRng(options.seed);
  const map = createBlankMap(width, height);
  const sectors = buildSectors(width, height);

  const rooms = [];
  for (const sector of sectors) {
    const room = generateRoom(sector, rng, dungeonLevel);
    carveRoom(map, room);
    rooms.push(room);
  }

  const pairs = buildCorridorPairs(sectors);
  const corridors = [];
  for (const { fromIdx, toIdx } of pairs) {
    const from = roomCenter(rooms[fromIdx]);
    const to = roomCenter(rooms[toIdx]);
    const corridor = carveCorridor(map, from, to, rng);
    corridors.push(corridor);
  }

  const { stairsUp, stairsDown } = placeStairs(map, rooms, rng);

  return { width, height, map, rooms, corridors, stairsUp, stairsDown };
}
