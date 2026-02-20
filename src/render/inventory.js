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
export function formatItem(item) {
  if (item.type === 'weapon') {
    const s = n => (n >= 0 ? `+${n}` : `${n}`);
    return `${item.name}  (${s(item.hitBonus)} hit, ${s(item.damageBonus)} dmg)`;
  }
  if (item.type === 'armor') return `${item.name}  [AC ${item.ac}]`;
  if (item.type === 'wand')  return `${item.name}  [${item.charges} charges]`;
  return item.name;
}

/**
 * Build the command hint string for the currently selected item.
 * @param {import('../game/item.js').Item|undefined} item
 * @param {import('../game/item.js').ArmorItem|null} equippedArmor
 * @param {import('../game/item.js').WeaponItem|null} equippedWeapon
 * @returns {string}
 */
export function getInventoryHints(item, equippedArmor, equippedWeapon) {
  if (!item) return 'Esc: close';
  const hints = [];
  if (item.type === 'weapon') hints.push(item === equippedWeapon ? 'w: unwield' : 'w: wield');
  if (item.type === 'armor')  hints.push(item === equippedArmor  ? 'D: doff'    : 'D: don');
  if (item.type === 'potion') hints.push('q: quaff');
  if (item.type === 'scroll') hints.push('r: read');
  const canDrop = item !== equippedArmor && item !== equippedWeapon;
  if (canDrop) hints.push('d: drop');
  hints.push('Esc: close');
  return hints.join('   ');
}

/**
 * Render the inventory list into the given box.
 * Items are labelled a), b), c)…  Equipped armor is marked [worn],
 * wielded weapon is marked [wielded].
 * A '>' cursor marks the currently highlighted item.
 * The block is centered vertically; each line is indented to center the
 * widest entry horizontally.
 * @param {import('blessed').Widgets.BoxElement} box
 * @param {import('../game/item.js').Item[]} inventory
 * @param {import('../game/item.js').ArmorItem|null} equippedArmor
 * @param {import('../game/item.js').WeaponItem|null} equippedWeapon
 * @param {number} selectedIdx
 */
export function renderInventory(box, inventory, equippedArmor, equippedWeapon, selectedIdx) {
  const title = 'Inventory';
  const itemLines = inventory.length === 0
    ? ['  (nothing)']
    : inventory.map((item, i) => {
        const cursor = i === selectedIdx ? '>' : ' ';
        const label = String.fromCharCode(97 + i);
        const detail = formatItem(item);
        const worn    = item === equippedArmor  ? ' [worn]'    : '';
        const wielded = item === equippedWeapon ? ' [wielded]' : '';
        return `${cursor} ${label}) ${detail}${worn}${wielded}`;
      });

  const hints = getInventoryHints(inventory[selectedIdx], equippedArmor, equippedWeapon);
  const block = [title, '-'.repeat(title.length), '', ...itemLines, '', '↑↓ or a-z to navigate', hints];
  const W = Math.max(...block.map(l => l.length));
  const hPad = ' '.repeat(Math.max(0, Math.floor((COLS - W) / 2)));
  const vPad = '\n'.repeat(Math.max(0, Math.floor((ROWS - block.length) / 2)));
  box.setContent(vPad + block.map(l => hPad + l).join('\n'));
}
