/**
 * @module render/ring-select
 * Renders the ring management screen into a blessed box.
 */

const COLS = 80;
const ROWS = 24;

/**
 * Build the slot indicator string for a ring (e.g. '[left]', '[right]', '').
 * @param {import('../game/item.js').RingItem} ring
 * @param {[import('../game/item.js').RingItem|null, import('../game/item.js').RingItem|null]} equippedRings
 * @returns {string}
 */
function slotLabel(ring, equippedRings) {
  const left  = equippedRings[0] === ring ? '[left]'  : '';
  const right = equippedRings[1] === ring ? '[right]' : '';
  return left + right;
}

/**
 * Build the action hint line for the currently selected ring.
 * @param {import('../game/item.js').RingItem|undefined} selected
 * @param {[import('../game/item.js').RingItem|null, import('../game/item.js').RingItem|null]} equippedRings
 * @returns {string}
 */
function actionLine(selected, equippedRings) {
  if (!selected) return '';
  const isEquipped = equippedRings.includes(selected);
  if (isEquipped) return `Enter: remove ${selected.name}`;
  const bothFull = equippedRings[0] !== null && equippedRings[1] !== null;
  if (bothFull) return "Remove a ring first";
  return 'l: put on left   r: put on right';
}

/**
 * Render the ring management screen.
 * Shows current left/right slot state, then lists all rings in inventory.
 * A '>' cursor marks the highlighted ring; slot indicators show equipped state.
 * @param {import('blessed').Widgets.BoxElement} box
 * @param {import('../game/item.js').RingItem[]} rings - Ring items from inventory.
 * @param {[import('../game/item.js').RingItem|null, import('../game/item.js').RingItem|null]} equippedRings
 * @param {number} selectedIdx - Index into rings that is highlighted.
 */
export function renderRingSelect(box, rings, equippedRings, selectedIdx) {
  const title = 'Ring Management';
  const leftName  = equippedRings[0]?.name ?? '(empty)';
  const rightName = equippedRings[1]?.name ?? '(empty)';
  const slotLines = [
    `Left hand:   ${leftName}`,
    `Right hand:  ${rightName}`,
  ];
  const itemLines = rings.length === 0
    ? ['  (no rings in inventory)']
    : rings.map((ring, i) => {
        const cursor = i === selectedIdx ? '>' : ' ';
        const label  = slotLabel(ring, equippedRings);
        return `${cursor} ${ring.name}${label ? '  ' + label : ''}`;
      });

  const action = actionLine(rings[selectedIdx], equippedRings);
  const block = [
    title,
    '-'.repeat(title.length),
    '',
    ...slotLines,
    '',
    ...itemLines,
    '',
    action,
    '',
    '↑↓ to navigate   d: drop   Esc: close',
  ];
  const W = Math.max(...block.map(l => l.length));
  const hPad = ' '.repeat(Math.max(0, Math.floor((COLS - W) / 2)));
  const vPad = '\n'.repeat(Math.max(0, Math.floor((ROWS - block.length) / 2)));
  box.setContent(vPad + block.map(l => hPad + l).join('\n'));
}
