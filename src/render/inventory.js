/**
 * @module render/inventory
 * Renders the player's inventory screen into a blessed box.
 */

const COLS = 80;
const ROWS = 24;

/**
 * Format a single item as a display string.
 * @param {import('../game/item.js').Item} item
 * @returns {string}
 */
function formatItem(item) {
  if (item.type === 'weapon') {
    const s = n => (n >= 0 ? `+${n}` : `${n}`);
    return `${item.name}  (${s(item.hitBonus)} hit, ${s(item.damageBonus)} dmg)`;
  }
  return item.name;
}

/**
 * Render the inventory list into the given box.
 * Items are labelled a), b), c)…  The block is centered vertically;
 * each line is indented to center the widest entry horizontally.
 * @param {import('blessed').Widgets.BoxElement} box
 * @param {import('../game/item.js').Item[]} inventory
 */
export function renderInventory(box, inventory) {
  const title = 'Inventory';
  const itemLines = inventory.length === 0
    ? ['(nothing)']
    : inventory.map((item, i) => `${String.fromCharCode(97 + i)}) ${formatItem(item)}`);

  const block = [title, '-'.repeat(title.length), '', ...itemLines, '', 'Press any key...'];
  const W = Math.max(...block.map(l => l.length));
  const hPad = ' '.repeat(Math.max(0, Math.floor((COLS - W) / 2)));
  const vPad = '\n'.repeat(Math.max(0, Math.floor((ROWS - block.length) / 2)));
  box.setContent(vPad + block.map(l => hPad + l).join('\n'));
}
