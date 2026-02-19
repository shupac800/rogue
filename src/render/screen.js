/**
 * Initializes and returns the blessed screen instance.
 * All rendering must go through this module.
 */

import blessed from 'blessed';

/**
 * Creates and configures the blessed screen for an 80x24 terminal.
 * @returns {blessed.Widgets.Screen} Configured screen instance.
 */
export function createScreen() {
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: 'claude0',
    cols: 80,
    rows: 24,
  });

  screen.key(['C-c'], () => {
    screen.destroy();
    process.exit(0);
  });

  screen.on('resize', () => {
    screen.render();
  });

  return screen;
}
