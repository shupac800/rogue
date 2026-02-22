/**
 * @module monster
 * Monster data table and factory. No project dependencies.
 */

/**
 * @typedef {{ name:string, char:string, level:number, hp:number, attack:number, defense:number, xp:number, aggression:number }} MonsterTemplate
 * @typedef {{ x:number, y:number, hp:number, maxHp:number, attack:number, defense:number, xp:number, name:string, char:string, aggression:number, provoked:boolean, statusEffects: { paralysis: number, confusion: number, scared: number } }} Monster
 */

/**
 * All 26 monster types.
 * level 1-5 derived from Exp (1-3→1, 4-10→2, 11-50→3, 51-200→4, 200+→5).
 * hp  = round(N*(M+1)/2) for NdM.
 * def = max(0, floor((9-AC)/2)).
 * atk = max(1, ceil(N*M/4)) for best damage die; 0 for 0d0 (special only).
 * xp  = original Rogue Exp value.
 * aggression: 0 = passive, 1 = medium (default), 3 = high (reserved).
 * @type {MonsterTemplate[]}
 */
export const MONSTER_TABLE = [
  { name: 'Aquator',      char: 'A', level: 3, hp: 23, attack: 0, defense: 3, xp:    20, aggression: 1 },
  { name: 'Bat',          char: 'B', level: 1, hp:  5, attack: 1, defense: 3, xp:     1, aggression: 0 },
  { name: 'Centaur',      char: 'C', level: 3, hp: 18, attack: 2, defense: 2, xp:    17, aggression: 1 },
  { name: 'Dragon',       char: 'D', level: 5, hp: 45, attack: 8, defense: 5, xp:  5000, aggression: 1 },
  { name: 'Emu',          char: 'E', level: 1, hp:  5, attack: 1, defense: 1, xp:     2, aggression: 1 },
  { name: 'Venus Flytrap',char: 'F', level: 4, hp: 36, attack: 2, defense: 3, xp:    80, aggression: 0 },
  { name: 'Griffin',      char: 'G', level: 5, hp: 59, attack: 4, defense: 3, xp:  2000, aggression: 1 },
  { name: 'Hobgoblin',    char: 'H', level: 1, hp:  5, attack: 2, defense: 2, xp:     3, aggression: 1 },
  { name: 'Ice monster',  char: 'I', level: 2, hp:  5, attack: 0, defense: 0, xp:     5, aggression: 1 },
  { name: 'Jabberwock',   char: 'J', level: 5, hp: 68, attack: 6, defense: 1, xp:  3000, aggression: 1 },
  { name: 'Kestrel',      char: 'K', level: 1, hp:  5, attack: 1, defense: 1, xp:     1, aggression: 1 },
  { name: 'Leprechaun',   char: 'L', level: 2, hp: 14, attack: 1, defense: 0, xp:    10, aggression: 0 },
  { name: 'Medusa',       char: 'M', level: 5, hp: 36, attack: 3, defense: 3, xp:   200, aggression: 1 },
  { name: 'Nymph',        char: 'N', level: 3, hp: 14, attack: 0, defense: 0, xp:    37, aggression: 0 },
  { name: 'Orc',          char: 'O', level: 2, hp:  5, attack: 2, defense: 1, xp:     5, aggression: 1 },
  { name: 'Phantom',      char: 'P', level: 4, hp: 36, attack: 4, defense: 3, xp:   120, aggression: 1 },
  { name: 'Quagga',       char: 'Q', level: 3, hp: 14, attack: 2, defense: 3, xp:    15, aggression: 1 },
  { name: 'Rattlesnake',  char: 'R', level: 2, hp:  9, attack: 2, defense: 3, xp:     9, aggression: 1 },
  { name: 'Snake',        char: 'S', level: 1, hp:  5, attack: 1, defense: 2, xp:     2, aggression: 1 },
  { name: 'Troll',        char: 'T', level: 4, hp: 27, attack: 3, defense: 2, xp:   120, aggression: 1 },
  { name: 'Ur-vile',      char: 'U', level: 4, hp: 32, attack: 5, defense: 5, xp:   190, aggression: 1 },
  { name: 'Vampire',      char: 'V', level: 5, hp: 36, attack: 3, defense: 4, xp:   350, aggression: 1 },
  { name: 'Wraith',       char: 'W', level: 4, hp: 23, attack: 2, defense: 2, xp:    55, aggression: 1 },
  { name: 'Xeroc',        char: 'X', level: 4, hp: 32, attack: 4, defense: 1, xp:   100, aggression: 1 },
  { name: 'Yeti',         char: 'Y', level: 3, hp: 18, attack: 2, defense: 1, xp:    50, aggression: 1 },
  { name: 'Zombie',       char: 'Z', level: 2, hp:  9, attack: 2, defense: 0, xp:     6, aggression: 1 },
];

/**
 * Return the subset of MONSTER_TABLE eligible for a given dungeon level.
 * Eligible range: monsterLevel in [max(1, DL-1), min(5, DL)].
 * DL1 → level 1 only; DL2 → 1-2; DL3 → 2-3; DL4 → 3-4; DL5+ → 4-5.
 * @param {number} dungeonLevel
 * @returns {MonsterTemplate[]}
 */
export function monstersForLevel(dungeonLevel) {
  const tier = Math.min(5, Math.max(1, dungeonLevel));
  const minLevel = Math.max(1, tier - 1);
  return MONSTER_TABLE.filter(m => m.level >= minLevel && m.level <= tier);
}

/**
 * Create a Monster instance from a template at the given position.
 * @param {MonsterTemplate} template
 * @param {number} x
 * @param {number} y
 * @returns {Monster}
 */
export function createMonster(template, x, y) {
  const { name, char, hp, attack, defense, xp, aggression } = template;
  return { x, y, hp, maxHp: hp, attack, defense, xp, name: name.toLowerCase(), char, aggression, provoked: false, statusEffects: { paralysis: 0, confusion: 0, scared: 0 } };
}
