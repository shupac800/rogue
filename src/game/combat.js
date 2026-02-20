/**
 * @module combat
 * Combat resolution. No project dependencies.
 */

/**
 * Resolve an attack from attacker against defender.
 * Mutates defender.hp and returns the damage dealt.
 * Minimum damage is always 1.
 * @param {{ attack: number, defense?: number }} attacker
 * @param {{ hp: number, defense: number }} defender
 * @returns {{ damage: number }}
 */
export function resolveCombat(attacker, defender) {
  const damage = Math.max(1, attacker.attack - defender.defense);
  defender.hp -= damage;
  return { damage };
}
