/**
 * @module render/item-action
 * Builds and renders the per-item action menu.
 */

import { formatItem } from './inventory.js';

const COLS = 80;
const ROWS = 24;

/**
 * Return the list of actions available for an item given current player state.
 * @param {import('../game/item.js').Item} item
 * @param {import('../game/item.js').ArmorItem|null} equippedArmor
 * @param {import('../game/item.js').WeaponItem|null} equippedWeapon
 * @returns {string[]}
 */
export function getItemActions(item, equippedArmor, equippedWeapon) {
  const actions = [];
  switch (item.type) {
    case 'weapon': actions.push(item === equippedWeapon ? 'Unwield' : 'Wield'); break;
    case 'armor':  actions.push(item === equippedArmor  ? 'Doff'    : 'Don');   break;
    case 'ring':   actions.push('Wear'); break;
    case 'potion': actions.push('Quaff'); break;
    case 'scroll': actions.push('Read'); break;
  }
  actions.push('Drop');
  return actions;
}

/**
 * Render the action menu for a single item.
 * @param {import('blessed').Widgets.BoxElement} box
 * @param {import('../game/item.js').Item} item
 * @param {import('../game/item.js').ArmorItem|null} equippedArmor
 * @param {import('../game/item.js').WeaponItem|null} equippedWeapon
 * @param {string[]} actions
 * @param {number} actionIdx
 */
export function renderItemAction(box, item, equippedArmor, equippedWeapon, actions, actionIdx) {
  const worn    = item === equippedArmor  ? ' [worn]'    : '';
  const wielded = item === equippedWeapon ? ' [wielded]' : '';
  const header = `${formatItem(item)}${worn}${wielded}`;
  const actionLines = actions.map((a, i) => {
    const cursor = i === actionIdx ? '>' : ' ';
    return `${cursor} ${i + 1}) ${a}`;
  });

  const block = [header, '-'.repeat(header.length), '', ...actionLines, '', 'Esc: back'];
  const W = Math.max(...block.map(l => l.length));
  const hPad = ' '.repeat(Math.max(0, Math.floor((COLS - W) / 2)));
  const vPad = '\n'.repeat(Math.max(0, Math.floor((ROWS - block.length) / 2)));
  box.setContent(vPad + block.map(l => hPad + l).join('\n'));
}
