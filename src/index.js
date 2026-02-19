/**
 * Entry point for claude0 roguelike.
 * Wires together screen, game state, rendering, and keyboard input.
 */

import blessed from 'blessed';
import { createScreen } from './render/screen.js';
import { createGame, movePlayer } from './game/index.js';
import { renderMap } from './render/map.js';
import { renderStatus } from './render/status.js';
import { getMoveDelta } from './input/keys.js';

const screen = createScreen();

/** Status bar — bottom 2 rows. */
const statusBox = blessed.box({
  top: 22, left: 0,
  width: 80, height: 2,
  tags: true,
  style: { fg: 'white', bg: 'black' },
});

screen.append(statusBox);

const state = createGame();

/** Re-render all widgets and flush to the terminal. */
function render() {
  renderMap(screen, state.dungeon, state.player);
  renderStatus(statusBox, state);
  screen.render();
}

screen.on('keypress', (_ch, key) => {
  const delta = getMoveDelta(key?.name ?? _ch);
  if (delta) {
    movePlayer(state, delta.dx, delta.dy);
    render();
  }
});

render();

process.on('SIGINT', () => {
  screen.destroy();
  process.exit(0);
});
