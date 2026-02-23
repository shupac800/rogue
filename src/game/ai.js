/**
 * @module ai
 * Monster spawning and AI step logic.
 */

import { TILE } from '../dungeon/tiles.js';
import { createMonster, monstersForLevel } from './monster.js';
import { resolveCombat } from './combat.js';

/** Chebyshev distance at which aggression-1 monsters begin pursuing. */
const MONSTER_SIGHT = 8;

/** Close-pursuit range for aggression-2 monsters; beyond this they wander. */
const PURSUIT_SIGHT = 4;

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
 * Monster type is chosen randomly from those eligible for dungeonLevel.
 * @param {import('../dungeon/generator.js').Dungeon} dungeon
 * @param {() => number} rng
 * @param {number} [dungeonLevel=1]
 * @returns {import('./monster.js').Monster[]}
 */
export function spawnMonsters(dungeon, rng, dungeonLevel = 1) {
  const monsters = [];
  const eligible = monstersForLevel(dungeonLevel);
  for (const room of dungeon.rooms) {
    const center = roomCenter(room);
    if (center.x === dungeon.stairsUp.x && center.y === dungeon.stairsUp.y) continue;
    const template = eligible[Math.floor(rng() * eligible.length)];
    monsters.push(createMonster(template, center.x, center.y));
  }
  return monsters;
}

/**
 * Move a monster one step toward the player, or attack if already adjacent.
 * Tries the x-axis step first, then y-axis. No-op if both are blocked.
 * @param {import('./monster.js').Monster} m
 * @param {import('./player.js').Player} player
 * @param {Array} map
 * @param {import('./monster.js').Monster[]} monsters
 * @param {object} state
 * @param {() => number} rng
 */
function pursuePlayer(m, player, map, monsters, state, rng) {
  const dx = Math.sign(player.x - m.x);
  const dy = Math.sign(player.y - m.y);
  const steps = [[dx, 0], [0, dy]].filter(([sdx, sdy]) => sdx !== 0 || sdy !== 0);
  for (const [sdx, sdy] of steps) {
    const tx = m.x + sdx;
    const ty = m.y + sdy;
    if (tx === player.x && ty === player.y) {
      if (m.name === 'leprechaun') {
        if (rng() < 0.25) {
          (state.messages ??= []).push('The leprechaun misses');
        } else {
          const stolen = Math.min(Math.floor(player.gold * (0.1 + rng() * 0.2)), 640);
          player.gold -= stolen;
          const msg = stolen > 0
            ? `The leprechaun steals ${stolen} gold and vanishes!`
            : 'The leprechaun finds nothing to steal and vanishes!';
          (state.messages ??= []).push(msg);
          m.hp = 0;
        }
        return;
      }
      const result = resolveCombat(m, player, rng);
      const msg = result.hit ? `The ${m.name} hits you` : `The ${m.name} misses`;
      (state.messages ??= []).push(msg);
      if (result.hit && player.hp <= 0) {
        const article = /^[aeiou]/i.test(m.name) ? 'an' : 'a';
        state.causeOfDeath = `${article} ${m.name}`;
      }
      return;
    }
    if (!WALKABLE.has(map[ty]?.[tx]?.type)) continue;
    if (monsters.some(o => o !== m && o.hp > 0 && o.x === tx && o.y === ty)) continue;
    m.x = tx;
    m.y = ty;
    return;
  }
}

/**
 * Move a monster one step in the direction that maximizes Chebyshev distance
 * from the player. All 8 directions are tried; if no direction improves the
 * distance the monster stays put.
 * @param {import('./monster.js').Monster} m
 * @param {import('./player.js').Player} player
 * @param {Array} map
 * @param {import('./monster.js').Monster[]} monsters
 */
function fleePlayer(m, player, map, monsters) {
  const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
  let bestDist = Math.max(Math.abs(player.x - m.x), Math.abs(player.y - m.y));
  let bestDx = 0, bestDy = 0;
  for (const [dx, dy] of dirs) {
    const tx = m.x + dx;
    const ty = m.y + dy;
    if (!WALKABLE.has(map[ty]?.[tx]?.type)) continue;
    if (monsters.some(o => o !== m && o.hp > 0 && o.x === tx && o.y === ty)) continue;
    const d = Math.max(Math.abs(player.x - tx), Math.abs(player.y - ty));
    if (d > bestDist) { bestDist = d; bestDx = dx; bestDy = dy; }
  }
  if (bestDx !== 0 || bestDy !== 0) { m.x += bestDx; m.y += bestDy; }
}

/**
 * Move a monster one step in a random walkable, unoccupied direction.
 * Used by aggression-2 monsters when the player is outside pursuit range.
 * @param {import('./monster.js').Monster} m
 * @param {Array} map
 * @param {import('./monster.js').Monster[]} monsters
 * @param {() => number} rng
 */
function wanderStep(m, map, monsters, rng) {
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  for (const [dx, dy] of dirs) {
    const tx = m.x + dx;
    const ty = m.y + dy;
    if (!WALKABLE.has(map[ty]?.[tx]?.type)) continue;
    if (monsters.some(o => o !== m && o.hp > 0 && o.x === tx && o.y === ty)) continue;
    m.x = tx;
    m.y = ty;
    return;
  }
}

/**
 * Advance all living monsters by one turn using aggression-based AI.
 *
 * Aggression 0 (passive): ignores player until provoked; then acts as level 1.
 * Aggression 1 (medium):  pursues and attacks within MONSTER_SIGHT.
 * Aggression 2 (roaming): wanders randomly outside PURSUIT_SIGHT; pursues within it.
 * Aggression 3 (always):  pursues player regardless of distance.
 *
 * Dead monsters are removed after all have acted.
 * @param {{ dungeon: import('../dungeon/generator.js').Dungeon,
 *            player: import('./player.js').Player,
 *            monsters: import('./monster.js').Monster[] }} state
 * @param {() => number} [rng=Math.random]
 */
export function stepMonsters(state, rng = Math.random) {
  const { dungeon: { map }, player, monsters } = state;
  if (player.statusEffects?.haste > 0 && state.turn % 2 === 1) return;
  if (player.equippedRings?.some(r => r?.name === 'ring of aggravate monsters')) {
    for (const m of monsters) { if (m.hp > 0) m.provoked = true; }
  }
  for (const m of monsters) {
    if (m.hp <= 0) continue;
    const se = m.statusEffects;
    if (se) {
      if (se.paralysis > 0) { se.paralysis--; continue; }
      if (se.scared > 0) { se.scared--; fleePlayer(m, player, map, monsters); continue; }
      if (se.confusion > 0) {
        se.confusion--;
        if (rng() >= 0.5) wanderStep(m, map, monsters, rng);
        continue;
      }
    }
    if (m.aggression === 0 && !m.provoked) continue;
    const stealth = player.equippedRings?.some(r => r?.name === 'ring of stealth');
    if (stealth && !m.provoked && m.aggression === 1) continue;
    const chebDist = Math.max(Math.abs(player.x - m.x), Math.abs(player.y - m.y));
    if (m.aggression !== 3 && chebDist > MONSTER_SIGHT) continue;
    if (m.aggression === 2 && chebDist > PURSUIT_SIGHT) {
      wanderStep(m, map, monsters, rng);
    } else {
      pursuePlayer(m, player, map, monsters, state, rng);
    }
  }
  state.monsters = monsters.filter(m => m.hp > 0);
}
