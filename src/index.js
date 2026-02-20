/**
 * Entry point for claude0 roguelike.
 * Manages screen states ("terminal" and "game") and wires together
 * rendering, game state, and keyboard input.
 */

import blessed from 'blessed';
import { createScreen } from './render/screen.js';
import { createGame, movePlayer, wearArmor, removeArmor, dropItem, wieldWeapon, unwieldWeapon, eatFood, quaffPotion } from './game/index.js';
import { renderMap } from './render/map.js';
import { renderStatus } from './render/status.js';
import { renderTerminal, renderTombstone, MAX_INPUT_LENGTH } from './render/terminal.js';
import { renderInventory } from './render/inventory.js';
import { renderArmorSelect } from './render/armor-select.js';
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

/** Current screen state: 'terminal' | 'game' | 'inventory' | 'armor' */
let screenState = 'terminal';

/** Cursor position in the inventory screen. */
let inventoryIdx = 0;

/** Armor items visible in the don/doff screen (subset of player inventory). */
let currentArmorItems = [];
/** Cursor position within currentArmorItems. */
let armorSelectIdx = 0;

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
  renderMap(screen, state.dungeon, state.player, state.monsters, state.goldItems, state.dungeonItems);
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

  if (screenState === 'inventory') {
    const inv = state.player.inventory;
    const item = inv[inventoryIdx];
    if (keyName === 'escape') {
      screenState = 'game';
      terminalBox.hide();
      renderGame('', false);
      return;
    }
    if (keyName === 'up' || keyName === 'k') {
      inventoryIdx = Math.max(0, inventoryIdx - 1);
    } else if (keyName === 'down' || keyName === 'j') {
      inventoryIdx = Math.min(inv.length - 1, inventoryIdx + 1);
    } else if (_ch === 'd' && item && item !== state.player.equippedArmor && item !== state.player.equippedWeapon) {
      dropItem(state, item);
      screenState = 'game';
      terminalBox.hide();
      afterTurn();
      return;
    } else if (_ch === 'w' && item?.type === 'weapon') {
      if (item === state.player.equippedWeapon) unwieldWeapon(state); else wieldWeapon(state, item);
      screenState = 'game';
      terminalBox.hide();
      afterTurn();
      return;
    } else if (_ch === 'D' && item?.type === 'armor') {
      if (item === state.player.equippedArmor) removeArmor(state); else wearArmor(state, item);
      screenState = 'game';
      terminalBox.hide();
      afterTurn();
      return;
    } else if (_ch === 'e' && item?.type === 'food') {
      eatFood(state, item);
      screenState = 'game';
      terminalBox.hide();
      afterTurn();
      return;
    } else if (_ch === 'q' && item?.type === 'potion') {
      quaffPotion(state, item);
      screenState = 'game';
      terminalBox.hide();
      afterTurn();
      return;
    }
    renderInventory(terminalBox, inv, state.player.equippedArmor, state.player.equippedWeapon, inventoryIdx);
    screen.render();
    return;
  }

  if (screenState === 'armor') {
    if (keyName === 'escape' || keyName === 'q') {
      screenState = 'game';
      terminalBox.hide();
      renderGame('', false);
      return;
    }
    if (keyName === 'up' || keyName === 'k') {
      armorSelectIdx = Math.max(0, armorSelectIdx - 1);
    } else if (keyName === 'down' || keyName === 'j') {
      armorSelectIdx = Math.min(currentArmorItems.length - 1, armorSelectIdx + 1);
    } else if (_ch && _ch >= '1' && _ch <= '9') {
      const n = _ch.charCodeAt(0) - 49;
      if (n < currentArmorItems.length) armorSelectIdx = n;
    } else if (keyName === 'enter' || keyName === 'return') {
      const selected = currentArmorItems[armorSelectIdx];
      if (selected === state.player.equippedArmor) {
        removeArmor(state);
        screenState = 'game';
        terminalBox.hide();
        afterTurn();
        return;
      } else if (selected && !state.player.equippedArmor) {
        wearArmor(state, selected);
        screenState = 'game';
        terminalBox.hide();
        afterTurn();
        return;
      }
      // else: can't don while wearing armor — re-render (action line explains why)
    } else if (_ch === 'd') {
      const selected = currentArmorItems[armorSelectIdx];
      if (selected) {
        dropItem(state, selected);
        screenState = 'game';
        terminalBox.hide();
        afterTurn();
        return;
      }
    }
    renderArmorSelect(terminalBox, currentArmorItems, state.player.equippedArmor, armorSelectIdx);
    screen.render();
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

  if (keyName === 'i') {
    inventoryIdx = 0;
    screenState = 'inventory';
    terminalBox.show();
    renderInventory(terminalBox, state.player.inventory, state.player.equippedArmor, state.player.equippedWeapon, inventoryIdx);
    screen.render();
    return;
  }

  if (keyName === 'd') {
    currentArmorItems = state.player.inventory.filter(item => item.type === 'armor');
    const equippedIdx = currentArmorItems.indexOf(state.player.equippedArmor);
    armorSelectIdx = equippedIdx >= 0 ? equippedIdx : 0;
    screenState = 'armor';
    terminalBox.show();
    renderArmorSelect(terminalBox, currentArmorItems, state.player.equippedArmor, armorSelectIdx);
    screen.render();
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
