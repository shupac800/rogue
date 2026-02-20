/**
 * @module render/armor-select
 * Renders the don/doff armor selection screen into a blessed box.
 */

const COLS = 80;
const ROWS = 24;

/**
 * Choose the action label shown below the list based on the selected item
 * and whether armor is currently equipped.
 * @param {import('../game/item.js').ArmorItem|undefined} selected
 * @param {import('../game/item.js').ArmorItem|null} equippedArmor
 * @returns {string}
 */
function actionLine(selected, equippedArmor) {
  if (!selected) return '';
  if (selected === equippedArmor) return `Enter: remove ${selected.name}`;
  if (!equippedArmor) return `Enter: don ${selected.name}`;
  return `Can't don ${selected.name} — remove current armor first`;
}

/**
 * Render the armor don/doff selection screen.
 * A '>' cursor marks the highlighted item; equipped armor is labelled [worn].
 * The action line below the list shows what Enter will do.
 * @param {import('blessed').Widgets.BoxElement} box
 * @param {import('../game/item.js').ArmorItem[]} armorItems - Armor items from inventory.
 * @param {import('../game/item.js').ArmorItem|null} equippedArmor
 * @param {number} selectedIdx - Index into armorItems that is highlighted.
 */
export function renderArmorSelect(box, armorItems, equippedArmor, selectedIdx) {
  const title = 'Don / Doff Armor';
  const itemLines = armorItems.length === 0
    ? ['  (no armor in inventory)']
    : armorItems.map((item, i) => {
        const cursor = i === selectedIdx ? '>' : ' ';
        const worn = item === equippedArmor ? ' [worn]' : '';
        return `${cursor} ${i + 1}) ${item.name}  [AC ${item.ac}]${worn}`;
      });

  const action = actionLine(armorItems[selectedIdx], equippedArmor);
  const block = [
    title,
    '-'.repeat(title.length),
    '',
    ...itemLines,
    '',
    action,
    '',
    '↑↓ or 1-9 to move   d: drop   Esc to cancel',
  ];
  const W = Math.max(...block.map(l => l.length));
  const hPad = ' '.repeat(Math.max(0, Math.floor((COLS - W) / 2)));
  const vPad = '\n'.repeat(Math.max(0, Math.floor((ROWS - block.length) / 2)));
  box.setContent(vPad + block.map(l => hPad + l).join('\n'));
}
