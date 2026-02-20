/**
 * @module ai
 * Monster spawning and AI step logic.
 */

import { TILE } from '../dungeon/tiles.js';
import { createMonster } from './monster.js';
import { resolveCombat } from './combat.js';

/** Chebyshev distance at which monsters become active. */
const MONSTER_SIGHT = 8;

/** Tile types a monster may walk onto. */
const WALKABLE = new Set([
  TILE.FLOOR,
  TILE.CORRIDOR,
  TILE.DOOR,
  TILE.STAIRS_UP,
  TILE.STAIRS_DOWN,
]);

/**
 * Compute the center cell of a room.
 * @param {{ x: number, y: number, width: number, height: number }} room
 * @returns {{ x: number, y: number }}
 */
function roomCenter(room) {
  return {
    x: room.x + Math.floor(room.width / 2),
    y: room.y + Math.floor(room.height / 2),
  };
}

/**
 * Spawn one monster per room, skipping the player's starting room.
 * @param {import('../dungeon/generator.js').Dungeon} dungeon
 * @param {() => number} rng - Unused for now; reserved for future variety.
 * @returns {import('./monster.js').Monster[]}
 */
export function spawnMonsters(dungeon, rng) {
  const monsters = [];
  for (const room of dungeon.rooms) {
    const center = roomCenter(room);
    if (center.x === dungeon.stairsUp.x && center.y === dungeon.stairsUp.y) continue;
    monsters.push(createMonster(center.x, center.y));
  }
  return monsters;
}

/**
 * Advance all living monsters by one turn.
 * Monsters within MONSTER_SIGHT (Chebyshev) of the player either attack or
 * move one step closer. Dead monsters are removed after all have acted.
 * @param {{ dungeon: import('../dungeon/generator.js').Dungeon,
 *            player: import('./player.js').Player,
 *            monsters: import('./monster.js').Monster[] }} state
 * @returns {void}
 */
export function stepMonsters(state) {
  const { dungeon: { map }, player, monsters } = state;

  for (const m of monsters) {
    if (m.hp <= 0) continue;

    const chebDist = Math.max(Math.abs(player.x - m.x), Math.abs(player.y - m.y));
    if (chebDist > MONSTER_SIGHT) continue;

    const dx = Math.sign(player.x - m.x);
    const dy = Math.sign(player.y - m.y);

    const steps = [[dx, 0], [0, dy]].filter(([sdx, sdy]) => sdx !== 0 || sdy !== 0);

    for (const [sdx, sdy] of steps) {
      const tx = m.x + sdx;
      const ty = m.y + sdy;

      if (tx === player.x && ty === player.y) {
        resolveCombat(m, player);
        state.message = `The ${m.name} hits you`;
        break;
      }

      const tileType = map[ty]?.[tx]?.type;
      if (!WALKABLE.has(tileType)) continue;

      const occupied = monsters.some(other => other !== m && other.hp > 0 && other.x === tx && other.y === ty);
      if (occupied) continue;

      m.x = tx;
      m.y = ty;
      break;
    }
  }

  state.monsters = monsters.filter(m => m.hp > 0);
}
