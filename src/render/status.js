/**
 * @module render/status
 * Renders the player status bar into a blessed box widget.
 *
 * Layout (80 columns):
 *   [message — cols 0..40][stats right-aligned — cols 41..79]
 *
 * Stats block is always 39 chars wide (fixed-width fields):
 *   HP:XXX/XXX  Lv:XX  XP:XXXXX  Gold:XXXXX
 *
 * Turn display removed reversibly — to restore, add to STAT_PARTS:
 *   `Turn:${String(turn).padStart(5)}`  (+2 sep = 12 more chars)
 */

/** Fixed width of the right-aligned stats block. */
const STATS_WIDTH = 39;

/**
 * Build the right-aligned stats string. Always exactly STATS_WIDTH chars.
 * @param {import('../game/player.js').Player} player
 * @returns {string}
 */
function formatStats(player) {
  const hp   = `HP:${String(player.hp).padStart(3)}/${String(player.maxHp).padStart(3)}`;
  const lv   = `Lv:${String(player.level).padStart(2)}`;
  const xp   = `XP:${String(player.xp).padStart(5)}`;
  const gold = `Gold:${String(player.gold).padStart(5)}`;
  return [hp, lv, xp, gold].join('  ');
}

/**
 * Render the status bar into the given blessed box.
 * @param {import('blessed').Widgets.BoxElement} box
 * @param {import('../game/state.js').GameState} state
 */
export function renderStatus(box, state) {
  const stats = formatStats(state.player);
  const msgWidth = 80 - STATS_WIDTH;
  const msg = (state.message ?? '').slice(0, msgWidth).padEnd(msgWidth);
  box.setContent(msg + stats);
}
