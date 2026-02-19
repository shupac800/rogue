/**
 * @module render/map
 * Renders the dungeon map into a blessed box widget.
 */

import { TILE_CHAR, TILE } from '../dungeon/tiles.js';

/**
 * Return the blessed-tagged string for a single map cell.
 * Walls are always gray; other visible tiles use the box default (white).
 * Visited-but-not-visible tiles are dimmed. Unseen tiles are blank.
 * @param {{type:number,visible:boolean,visited:boolean}} cell
 * @param {boolean} isPlayer - True when the player occupies this cell.
 * @returns {string}
 */
function cellStr(cell, isPlayer) {
  if (isPlayer) return '{bold}{yellow-fg}@{/yellow-fg}{/bold}';
  if (!cell.visited && !cell.visible) return ' ';

  const ch = TILE_CHAR[cell.type] ?? ' ';

  if (!cell.visible) return `{gray-fg}${ch}{/gray-fg}`;
  if (cell.type === TILE.WALL) return `{gray-fg}${ch}{/gray-fg}`;
  if (cell.type === TILE.STAIRS_UP || cell.type === TILE.STAIRS_DOWN) {
    return `{yellow-fg}${ch}{/yellow-fg}`;
  }
  return ch; // floor, corridor, door — use box default (white)
}

/**
 * Render the full dungeon map into a blessed box.
 * Builds one string per row and sets it as the box content.
 * @param {import('blessed').Widgets.BoxElement} box
 * @param {import('../dungeon/generator.js').Dungeon} dungeon
 * @param {{x:number,y:number}} player
 */
export function renderMap(box, dungeon, player) {
  const { map, width, height } = dungeon;
  const lines = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      row += cellStr(map[y][x], x === player.x && y === player.y);
    }
    lines.push(row);
  }
  box.setContent(lines.join('\n'));
}
