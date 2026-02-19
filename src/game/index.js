/**
 * @module game
 * Public API for the game module.
 */

export { createPlayer } from './player.js';
export { createGame, movePlayer, isWalkable, SIGHT_RADIUS } from './state.js';
