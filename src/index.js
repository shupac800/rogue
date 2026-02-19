/**
 * Entry point for claude0 roguelike.
 * Initializes the terminal screen and wires together game, render, and input modules.
 */

import { createScreen } from './render/screen.js';

const screen = createScreen();

process.on('SIGINT', () => {
  screen.destroy();
  process.exit(0);
});
