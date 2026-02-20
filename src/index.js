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

/**
 * Messages from the current turn that have not yet been shown.
 * Non-empty means any keypress advances to the next message instead of acting.
 * @type {string[]}
 */
let moreQueue = [];

/**
 * Render map and status bar with an explicit message and style.
 * @param {string} message
 * @param {boolean} reversed - True while more messages are pending.
 */
function render(message, reversed) {
  renderMap(screen, state.dungeon, state.player, state.monsters, state.goldItems);
  renderStatus(statusBox, state, message, reversed);
  screen.render();
}

/**
 * Called after every completed player turn.
 * Loads state.messages into moreQueue and shows the first one.
 * If only one message, it is shown in normal text immediately.
 */
function afterTurn() {
  const msgs = state.messages;
  if (msgs.length <= 1) {
    moreQueue = [];
    render(msgs[0] ?? '', false);
  } else {
    moreQueue = msgs.slice(1);
    render(msgs[0], true);
  }
}

screen.on('keypress', (_ch, key) => {
  const keyName = key?.name ?? _ch;

  if (moreQueue.length > 0) {
    const next = moreQueue.shift();
    render(next, moreQueue.length > 0);
    return;
  }

  const delta = getMoveDelta(keyName);
  if (delta) {
    movePlayer(state, delta.dx, delta.dy);
    afterTurn();
  }
});

afterTurn();

process.on('SIGINT', () => {
  screen.destroy();
  process.exit(0);
});
