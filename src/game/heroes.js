/**
 * @module game/heroes
 * Persists and retrieves the top 10 all-time game records ("Rogue Heroes").
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEROES_PATH = join(__dirname, '../../heroes.json');
const MAX_HEROES = 10;

/**
 * @typedef {{ date: string, playerName: string, obituary: string, dungeonLevel: number, gold: number }} HeroEntry
 */

/**
 * Build a one-line obituary from the game state.
 * @param {import('./state.js').GameState} state
 * @returns {string}
 */
function buildObituary(state) {
  const cause = state.causeOfDeath;
  const lv    = state.dungeonLevel;
  if (!cause)                           return `perished on level ${lv}`;
  if (cause === 'escaped the dungeon')  return 'escaped the dungeon';
  if (cause === 'starvation')           return `starved to death on level ${lv}`;
  return `killed by ${cause} on level ${lv}`;
}

/**
 * Load the current heroes list from disk. Returns [] on first run or error.
 * @returns {HeroEntry[]}
 */
export function loadHeroes() {
  try {
    return JSON.parse(readFileSync(HEROES_PATH, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Record a completed game. Adds an entry, sorts by gold desc then dungeonLevel
 * desc, keeps only the top MAX_HEROES, and saves to disk.
 * @param {import('./state.js').GameState} state
 * @returns {HeroEntry[]} Updated heroes list.
 */
export function recordGame(state) {
  const entry = {
    date:         new Date().toISOString().slice(0, 10),
    playerName:   state.playerName,
    obituary:     buildObituary(state),
    dungeonLevel: state.dungeonLevel,
    gold:         state.player.gold,
  };
  const heroes = loadHeroes();
  heroes.unshift(entry); // place new entry first so ties resolve in its favour (stable sort)
  heroes.sort((a, b) => b.gold - a.gold || b.dungeonLevel - a.dungeonLevel);
  heroes.splice(MAX_HEROES);
  writeFileSync(HEROES_PATH, JSON.stringify(heroes, null, 2));
  return heroes;
}
