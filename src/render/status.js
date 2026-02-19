/**
 * @module render/status
 * Renders the player status bar into a blessed box widget.
 */

/**
 * Format all relevant player stats into a single status line.
 * @param {import('../game/state.js').GameState} state
 * @returns {string}
 */
function formatStatus(state) {
  const { player, turn } = state;
  const parts = [
    `HP: ${player.hp}/${player.maxHp}`,
    `Lv:${player.level}`,
    `XP:${player.xp}`,
    `Gold:${player.gold}`,
    `Turn:${turn}`,
  ];
  return parts.join('  ');
}

/**
 * Render the status bar into the given blessed box.
 * @param {import('blessed').Widgets.BoxElement} box
 * @param {import('../game/state.js').GameState} state
 */
export function renderStatus(box, state) {
  box.setContent(formatStatus(state));
}
