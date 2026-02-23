/**
 * @module render/heroes
 * Renders the Rogue Heroes (hall of fame) screen into a blessed box.
 */

const COLS = 80;
const ROWS = 24;

// Column widths: #, Date, Name, Obituary (no header), Gold
const WIDTHS = [2, 10, 16, 36, 6];

/**
 * Format one table row by padding each cell to its column width.
 * @param {Array<string|number>} cells
 * @returns {string}
 */
function row(cells) {
  return cells.map((c, i) => String(c).slice(0, WIDTHS[i]).padEnd(WIDTHS[i])).join('  ');
}

/**
 * Render the Rogue Heroes table centered in the box.
 * Columns: #, Date, Name, obituary (no header), Gold.
 * @param {import('blessed').Widgets.BoxElement} box
 * @param {import('../game/heroes.js').HeroEntry[]} heroes
 */
export function renderHeroes(box, heroes) {
  const title   = 'Rogue Heroes';
  const divider = '─'.repeat(title.length);

  const headers   = ['#', 'Date', 'Name', '', 'Gold'];
  const headerLine = row(headers);
  const separator  = WIDTHS.map(w => '─'.repeat(w)).join('──');

  const dataLines = heroes.length === 0
    ? ['  (no heroes yet)']
    : heroes.map((h, i) => row([
        i + 1,
        h.date,
        h.playerName,
        h.obituary ?? '',
        h.gold,
      ]));

  const block = [
    title,
    divider,
    '',
    headerLine,
    separator,
    ...dataLines,
    '',
    'Press any key to continue',
  ];

  const W = Math.max(...block.map(l => l.length));
  const hPad = ' '.repeat(Math.max(0, Math.floor((COLS - W) / 2)));
  const vPad = '\n'.repeat(Math.max(0, Math.floor((ROWS - block.length) / 2)));
  box.setContent(vPad + block.map(l => hPad + l).join('\n'));
}
