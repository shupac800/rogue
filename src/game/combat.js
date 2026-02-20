/**
 * @module combat
 * Combat resolution. No project dependencies.
 */

/** Probability that an attack misses (25%). */
const MISS_CHANCE = 0.25;

/**
 * Resolve an attack from attacker against defender.
 * Calls rng() twice on a hit: once for the hit/miss roll, once for damage.
 * On a miss returns { hit: false, damage: 0 }.
 * On a hit returns { hit: true, damage, tier } where tier 0–3 reflects severity
 * (0 = glancing, 3 = devastating). Minimum damage is always 1.
 * Mutates defender.hp only on a hit.
 * @param {{ attack: number }} attacker
 * @param {{ hp: number, defense: number }} defender
 * @param {() => number} [rng=Math.random]
 * @returns {{ hit: boolean, damage: number, tier?: number }}
 */
export function resolveCombat(attacker, defender, rng = Math.random) {
  if (rng() < MISS_CHANCE) {
    return { hit: false, damage: 0 };
  }
  const maxRaw = attacker.attack * 4;
  const rawDamage = 1 + Math.floor(rng() * maxRaw);
  const damage = Math.max(1, rawDamage - defender.defense);
  const tier = Math.min(3, Math.floor((rawDamage - 1) / attacker.attack));
  defender.hp -= damage;
  return { hit: true, damage, tier };
}
