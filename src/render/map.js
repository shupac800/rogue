/**
 * @module render/map
 * Renders the dungeon map directly into blessed's screen cell buffer.
 *
 * We write to screen.lines[y][x] = [attr, char] instead of using
 * box.setContent(), because blessed's tagged-string parser converts content
 * through a binary (latin-1) buffer internally, silently dropping any
 * character above U+00FF — which includes all Unicode box-drawing characters.
 */

import { TILE_CHAR, TILE } from '../dungeon/tiles.js';

/**
 * Packed cell attribute constants for blessed's screen cell format.
 * Encoding: (bold << 18) | ((fg_index + 1) << 9) | (bg_index + 1)
 * 0 in either field means "terminal default". Explicit colors: 0=black,
 * 3=yellow, 7=white, 8=gray (bright-black).
 * @type {Object.<string,number>}
 */
const ATTR = {
  WALL:    (7 << 9) | 0,              // white fg (7), black bg (0)
  FLOOR:   (7 << 9) | 0,              // white fg (7), black bg (0)
  DOOR:    (3 << 9) | 0,              // yellow fg (3), black bg (0)
  STAIRS:  (3 << 9) | 0,              // yellow fg (3), black bg (0)
  PLAYER:  (1 << 18) | (3 << 9) | 0,  // bold + yellow fg (3), black bg
  HIDDEN:  (0x1ff << 9) | 0,           // terminal default fg, black bg
  MONSTER: (1 << 9) | 0,              // red fg (1), black bg
  GOLD:    (1 << 18) | (3 << 9) | 0,  // bold + yellow fg (3), black bg
};

/**
 * Render info (char + attr) for each dungeon item type.
 * Classic Rogue ASCII: food=*  potion=!  scroll=?  weapon=)  armor=]  ring==  wand=/
 */
const ITEM_RENDER = {
  food:   { ch: '*', attr: (7 << 9) | 0 },                     // white
  potion: { ch: '!', attr: (5 << 9) | 0 },                     // magenta
  scroll: { ch: '?', attr: (1 << 18) | (7 << 9) | 0 },         // bold white
  weapon: { ch: ')', attr: (6 << 9) | 0 },                     // cyan
  armor:  { ch: ']', attr: (6 << 9) | 0 },                     // cyan
  ring:   { ch: '=', attr: (1 << 18) | (3 << 9) | 0 },         // bold yellow
  wand:   { ch: '/', attr: (2 << 9) | 0 },                     // green
};

/** Box-drawing character lookup: key is 'UDLR' (1=WALL neighbor, 0=other). */
const BOX_CHAR = {
  '0000': '#',
  '1000': '│', '0100': '│', '1100': '│',
  '0010': '─', '0001': '─', '0011': '─',
  '1001': '└', '1010': '┘', '0101': '┌', '0110': '┐',
  '1101': '├', '1110': '┤', '0111': '┬', '1011': '┴',
  '1111': '┼',
};

/**
 * Return the tile type at (x, y), or TILE.VOID for out-of-bounds.
 * @param {Array} map
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function typeAt(map, x, y) {
  if (y < 0 || y >= map.length || x < 0 || x >= map[0].length) return TILE.VOID;
  return map[y][x].type;
}

/**
 * Return true when the tile type is open room interior.
 * @param {number} type
 * @returns {boolean}
 */
function isRoomInterior(type) {
  return type === TILE.FLOOR || type === TILE.STAIRS_UP || type === TILE.STAIRS_DOWN;
}

/**
 * Select the box-drawing character for a WALL tile based on cardinal WALL neighbors.
 * @param {Array} map
 * @param {number} x
 * @param {number} y
 * @returns {string}
 */
function wallBoxChar(map, x, y) {
  const u = typeAt(map, x, y - 1) === TILE.WALL ? 1 : 0;
  const d = typeAt(map, x, y + 1) === TILE.WALL ? 1 : 0;
  const l = typeAt(map, x - 1, y) === TILE.WALL ? 1 : 0;
  const r = typeAt(map, x + 1, y) === TILE.WALL ? 1 : 0;
  return BOX_CHAR[`${u}${d}${l}${r}`] ?? '#';
}

/**
 * Return the display character for a WALL tile.
 * Checks all 8 neighbors (including diagonals) to catch room corners.
 * @param {Array} map
 * @param {number} x
 * @param {number} y
 * @returns {string}
 */
function wallChar(map, x, y) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (isRoomInterior(typeAt(map, x + dx, y + dy))) return wallBoxChar(map, x, y);
    }
  }
  return '#';
}

/**
 * Return the character and packed attribute for a single map cell.
 * @param {Array} map
 * @param {number} x
 * @param {number} y
 * @param {boolean} isPlayer
 * @returns {{ ch: string, attr: number }}
 */
function cellInfo(map, x, y, isPlayer) {
  const cell = map[y][x];
  if (isPlayer) return { ch: '@', attr: ATTR.PLAYER };
  if (!cell.visited && !cell.visible) return { ch: ' ', attr: ATTR.HIDDEN };
  if (cell.type === TILE.WALL) return { ch: wallChar(map, x, y), attr: ATTR.WALL };
  if (cell.type === TILE.DOOR) {
    const isEntrance = isRoomInterior(typeAt(map, x, y - 1)) ||
                       isRoomInterior(typeAt(map, x, y + 1)) ||
                       isRoomInterior(typeAt(map, x - 1, y)) ||
                       isRoomInterior(typeAt(map, x + 1, y));
    return isEntrance
      ? { ch: '/', attr: ATTR.DOOR }
      : { ch: TILE_CHAR[TILE.CORRIDOR], attr: ATTR.FLOOR };
  }
  if (cell.type === TILE.STAIRS_UP || cell.type === TILE.STAIRS_DOWN) {
    return { ch: TILE_CHAR[cell.type], attr: ATTR.STAIRS };
  }
  return { ch: TILE_CHAR[cell.type] ?? ' ', attr: ATTR.FLOOR };
}

/**
 * Render the dungeon map by writing directly into blessed's screen cell buffer.
 * Each cell is set as [attr, char]; lines are marked dirty for the next draw.
 * @param {import('blessed').Widgets.Screen} screen
 * @param {import('../dungeon/generator.js').Dungeon} dungeon
 * @param {{x:number,y:number}} player
 * @param {import('../game/monster.js').Monster[]} monsters
 * @param {import('../game/state.js').GoldItem[]} goldItems
 * @param {import('../game/state.js').DungeonItem[]} dungeonItems
 */
export function renderMap(screen, dungeon, player, monsters, goldItems, dungeonItems) {
  const { map, width, height } = dungeon;

  const monsterMap = new Map();
  for (const m of monsters) {
    if (m.hp > 0) monsterMap.set(`${m.x},${m.y}`, m.char);
  }
  const goldSet = new Set(goldItems.map(g => `${g.x},${g.y}`));
  const itemMap = new Map();
  for (const { x, y, item } of dungeonItems) {
    itemMap.set(`${x},${y}`, ITEM_RENDER[item.type]);
  }

  for (let y = 0; y < height; y++) {
    if (!screen.lines[y]) continue;
    for (let x = 0; x < width; x++) {
      if (screen.lines[y][x] === undefined) continue;
      const cell = map[y][x];
      const isPlayer = x === player.x && y === player.y;
      const monsterChar = !isPlayer && cell.fov ? monsterMap.get(`${x},${y}`) : undefined;
      if (monsterChar !== undefined) {
        screen.lines[y][x] = [ATTR.MONSTER, monsterChar];
      } else if (!isPlayer && cell.fov && goldSet.has(`${x},${y}`)) {
        screen.lines[y][x] = [ATTR.GOLD, '$'];
      } else if (!isPlayer && cell.fov && itemMap.has(`${x},${y}`)) {
        const { ch, attr } = itemMap.get(`${x},${y}`);
        screen.lines[y][x] = [attr, ch];
      } else {
        const { ch, attr } = cellInfo(map, x, y, isPlayer);
        screen.lines[y][x] = [attr, ch];
      }
    }
    screen.lines[y].dirty = true;
  }
}
