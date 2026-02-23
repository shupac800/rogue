/**
 * @module ai
 * Monster spawning and AI step logic.
 */

import { TILE } from '../dungeon/tiles.js';
import { createMonster, monstersForLevel } from './monster.js';
import { resolveCombat } from './combat.js';
import { RANKS, XP_THRESHOLDS, HP_PER_RANK } from './player.js';

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
/**
 * Apply the special on-hit effect for monsters that have one.
 * Pushes relevant messages onto state.messages.
 * @param {import('./monster.js').Monster} m
 * @param {import('./player.js').Player} player
 * @param {object} state
 * @param {() => number} rng
 */
function applySpecialAttack(m, player, state, rng) {
  switch (m.name) {
    case 'aquator': {
      if (player.equippedArmor) {
        player.equippedArmor.ac = Math.max(0, player.equippedArmor.ac - 1);
        player.defense = player.baseDefense + player.equippedArmor.ac + player.ringDefenseBonus;
        state.messages.push('Your armor corrodes!');
      } else {
        state.messages.push('The aquator splashes you harmlessly');
      }
      break;
    }
    case 'ice monster': {
      if (player.statusEffects.paralysis > 0) {
        // already frozen — no effect
      } else if (rng() < 0.30) {
        player.statusEffects.paralysis = 2;
        state.messages.push('You are frozen solid!');
      }
      break;
    }
    case 'nymph': {
      if (player.inventory.length > 0) {
        const idx = Math.floor(rng() * player.inventory.length);
        const stolen = player.inventory.splice(idx, 1)[0];
        if (stolen === player.equippedWeapon) {
          player.equippedWeapon = null;
          player.hitBonus    = player.ringHitBonus;
          player.damageBonus = player.ringDamageBonus;
        }
        if (stolen === player.equippedArmor) {
          player.equippedArmor = null;
          player.defense = player.baseDefense + player.ringDefenseBonus;
        }
        const ri = player.equippedRings.indexOf(stolen);
        if (ri !== -1) {
          player.equippedRings[ri] = null;
          let def = 0, dmg = 0, hit = 0;
          for (const r of player.equippedRings) {
            if (!r) continue;
            const e = r.name.replace(/^ring of /, '');
            if (e === 'protection')      def++;
            else if (e === 'increase damage') dmg++;
            else if (e === 'dexterity') hit++;
          }
          player.ringDefenseBonus = def;
          player.ringDamageBonus  = dmg;
          player.ringHitBonus     = hit;
          player.defense    = player.baseDefense + (player.equippedArmor?.ac ?? 0) + def;
          player.hitBonus   = (player.equippedWeapon?.hitBonus    ?? 0) + hit;
          player.damageBonus= (player.equippedWeapon?.damageBonus ?? 0) + dmg;
        }
        state.messages.push(`The nymph steals your ${stolen.name} and vanishes!`);
      } else {
        state.messages.push('The nymph finds nothing to steal and vanishes!');
      }
      m.hp = 0;
      break;
    }
    case 'rattlesnake': {
      if (rng() < 0.5) break; // dry bite — no venom
      const sustained = player.equippedRings?.some(r => r?.name === 'ring of sustain strength');
      if (sustained) {
        state.messages.push('The rattlesnake\'s venom is neutralized by your ring!');
      } else {
        player.strength = Math.max(1, player.strength - 1);
        player.attack = Math.max(1, player.strength + (player.ringStrengthBonus ?? 0) - 13);
        state.messages.push('You are envenom\'d and feel weaker!');
      }
      break;
    }
    case 'vampire': {
      if (player.maxHp > 1) {
        player.maxHp--;
        if (player.hp > player.maxHp) player.hp = player.maxHp;
        state.messages.push('The vampire drains your life force!');
      }
      break;
    }
    case 'wraith': {
      if (player.xpLevel > 0) {
        const drained = player.xpLevel;
        player.xpLevel--;
        player.rank  = RANKS[player.xpLevel];
        player.xp    = XP_THRESHOLDS[player.xpLevel];
        player.maxHp = Math.max(1, player.maxHp - HP_PER_RANK[drained]);
        if (player.hp > player.maxHp) player.hp = player.maxHp;
        state.messages.push('The wraith drains your experience!');
      }
      break;
    }
  }
}

/** Set of monster names whose attacks are purely special (no physical damage). */
const SPECIAL_ONLY = new Set(['aquator', 'nymph']);

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
      if (SPECIAL_ONLY.has(m.name)) {
        // No physical damage — just a hit/miss roll then special effect.
        if (rng() >= 0.25) {
          applySpecialAttack(m, player, state, rng);
        } else {
          (state.messages ??= []).push(`The ${m.name} misses`);
        }
        return;
      }
      const result = resolveCombat(m, player, rng);
      const msg = result.hit ? `The ${m.name} hits you` : `The ${m.name} misses`;
      (state.messages ??= []).push(msg);
      if (result.hit) {
        applySpecialAttack(m, player, state, rng);
        if (player.hp <= 0) {
          const article = /^[aeiou]/i.test(m.name) ? 'an' : 'a';
          state.causeOfDeath = `${article} ${m.name}`;
        }
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
