/**
 * @module render/status
 * Renders the player status bar into a blessed box widget.
 *
 * Layout (80 columns):
 *   [message — left][stats — right-justified, compact]
 *
 * Stats block is compact (no fixed width); fields are separated by two spaces.
 * Rank is omitted when empty (initial rank). Hunger label omitted when well-fed.
 * The block is right-justified so it always ends at column 79.
 */

import { hungerLabel } from '../game/state.js';

/** Total display width. */
const COLS = 80;

/**
 * Build the compact stats string. Width varies with field values and rank.
 * Omits the rank segment when rank is an empty string.
 * @param {import('../game/state.js').GameState} state
 * @returns {string}
 */
function formatStats(state) {
  const { player } = state;
  const parts = [
    `HP:${player.hp}/${player.maxHp}`,
    player.rank,
    hungerLabel(player.food),
    `Au:${player.gold}`,
  ].filter(s => s);
  return parts.join('  ');
}

/**
 * Render the status bar into the given blessed box.
 * The stats block is right-justified; the message fills the remaining columns.
 * When reversed is true, the message area is shown in inverse video to
 * signal that more messages are pending (press space to advance).
 * @param {import('blessed').Widgets.BoxElement} box
 * @param {import('../game/state.js').GameState} state
 * @param {string} [message=''] - The message to display in the left area.
 * @param {boolean} [reversed=false] - Render the message area in inverse video.
 */
export function renderStatus(box, state, message = '', reversed = false) {
  const stats = formatStats(state);
  const msgWidth = COLS - stats.length;
  const msgText = message.slice(0, msgWidth).padEnd(msgWidth);
  const msgContent = reversed ? `{inverse}${msgText}{/inverse}` : msgText;
  box.setContent(msgContent + stats);
}
