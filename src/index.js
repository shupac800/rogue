/**
 * Entry point for claude0 roguelike.
 * Manages screen states ("terminal" and "game") and wires together
 * rendering, game state, and keyboard input.
 */

import blessed from 'blessed';
import { createScreen } from './render/screen.js';
import { createGame, movePlayer } from './game/index.js';
import { renderMap } from './render/map.js';
import { renderStatus } from './render/status.js';
import { renderTerminal, renderTombstone, MAX_INPUT_LENGTH } from './render/terminal.js';
import { getMoveDelta } from './input/keys.js';

const screen = createScreen();

/** Status bar — bottom 2 rows (visible in game state only). */
const statusBox = blessed.box({
  top: 22, left: 0,
  width: 80, height: 2,
  tags: true,
  style: { fg: 'white', bg: 'black' },
});

/** Terminal overlay — full viewport (visible in terminal state only). */
const terminalBox = blessed.box({
  top: 0, left: 0,
  width: 80, height: 24,
  tags: false,
  style: { fg: 'white', bg: 'black' },
});

screen.append(statusBox);
screen.append(terminalBox); // appended last so it renders on top

/** Current screen state: 'terminal' | 'game' */
let screenState = 'terminal';

/** Accumulated keystrokes in terminal state. */
let terminalInput = '';

/** Game state — null until startGame() is called. */
let state = null;

/**
 * Messages from the current turn not yet displayed.
 * Non-empty means any keypress advances to the next message instead of acting.
 * @type {string[]}
 */
let moreQueue = [];

const TERMINAL_OUTPUT = ['Dungeons of Doom', ''];

/** Render the terminal state. */
function showTerminal() {
  renderTerminal(terminalBox, TERMINAL_OUTPUT, 'Enter your name: ', terminalInput);
  screen.render();
}

/**
 * Render map and status bar with an explicit message and style.
 * @param {string} message
 * @param {boolean} reversed - True while more messages are pending.
 */
function renderGame(message, reversed) {
  renderMap(screen, state.dungeon, state.player, state.monsters, state.goldItems);
  renderStatus(statusBox, state, message, reversed);
  screen.render();
}

/**
 * Called after every completed player turn.
 * Loads state.messages into moreQueue and shows the first one.
 */
function afterTurn() {
  const msgs = state.messages;
  if (msgs.length <= 1) {
    moreQueue = [];
    renderGame(msgs[0] ?? '', false);
  } else {
    moreQueue = msgs.slice(1);
    renderGame(msgs[0], true);
  }
}

/**
 * Transition to terminal state and display the death tombstone.
 */
function transitionToTombstone() {
  screenState = 'terminal';
  terminalBox.show();
  renderTombstone(terminalBox, state.playerName, state.causeOfDeath ?? 'unknown', state.dungeonLevel, state.player.gold);
  screen.render();
}

/**
 * Transition from terminal state to game state.
 * @param {string} playerName
 */
function startGame(playerName) {
  state = createGame({ playerName });
  screenState = 'game';
  terminalBox.hide();
  afterTurn();
}

/**
 * Handle a keypress while in terminal state.
 * @param {string|undefined} ch
 * @param {{ name: string }} key
 */
function handleTerminalKey(ch, key) {
  const keyName = key?.name ?? ch;
  if (keyName === 'return' || keyName === 'enter') {
    const name = terminalInput.trim();
    if (name) startGame(name);
    return;
  }
  if (keyName === 'backspace') {
    terminalInput = terminalInput.slice(0, -1);
  } else if (ch && ch.length === 1 && ch >= ' ' && terminalInput.length < MAX_INPUT_LENGTH) {
    terminalInput += ch;
  }
  showTerminal();
}

screen.on('keypress', (_ch, key) => {
  const keyName = key?.name ?? _ch;

  if (screenState === 'terminal') {
    handleTerminalKey(_ch, key);
    return;
  }

  if (moreQueue.length > 0) {
    const next = moreQueue.shift();
    renderGame(next, moreQueue.length > 0);
    return;
  }

  if (state.dead) {
    transitionToTombstone();
    return;
  }

  const delta = getMoveDelta(keyName);
  if (delta) {
    movePlayer(state, delta.dx, delta.dy);
    afterTurn();
  }
});

showTerminal();

process.on('SIGINT', () => {
  screen.destroy();
  process.exit(0);
});
