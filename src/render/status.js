/**
 * @module render/status
 * Renders the player status bar into a blessed box widget.
 *
 * Layout (80 columns):
 *   [message — cols 0..46][stats right-aligned — cols 47..79]
 *
 * Stats block is always 34 chars wide (fixed-width fields):
 *   HP:XXX/XXX  Guild Novice  Au:XXXXX
 * Au = gold. Rank replaces DL and XP.
 */

/** Fixed width of the right-aligned stats block. */
const STATS_WIDTH = 34;

/** Width of the rank field (longest rank: "Guild Novice" = 12). */
const RANK_WIDTH = 12;

/**
 * Build the right-aligned stats string. Always exactly STATS_WIDTH chars.
 * @param {import('../game/state.js').GameState} state
 * @returns {string}
 */
function formatStats(state) {
  const { player } = state;
  const hp   = `HP:${String(player.hp).padStart(3)}/${String(player.maxHp).padStart(3)}`;
  const rank = player.rank.padEnd(RANK_WIDTH);
  const gold = `Au:${String(player.gold).padStart(5)}`;
  return [hp, rank, gold].join('  ');
}

/**
 * Render the status bar into the given blessed box.
 * When reversed is true, the message area is shown in inverse video to
 * signal that more messages are pending (press space to advance).
 * @param {import('blessed').Widgets.BoxElement} box
 * @param {import('../game/state.js').GameState} state
 * @param {string} [message=''] - The message to display in the left area.
 * @param {boolean} [reversed=false] - Render the message area in inverse video.
 */
export function renderStatus(box, state, message = '', reversed = false) {
  const stats = formatStats(state);
  const msgWidth = 80 - STATS_WIDTH;
  const msgText = message.slice(0, msgWidth).padEnd(msgWidth);
  const msgContent = reversed ? `{inverse}${msgText}{/inverse}` : msgText;
  box.setContent(msgContent + stats);
}
