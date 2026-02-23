/**
 * @module render/heroes
 * Renders the Rogue Heroes (hall of fame) screen into a blessed box.
 */

const COLS = 80;
const ROWS = 24;

// Column widths: Name, Rank, Obituary (no header), Gold
const WIDTHS = [16, 13, 33, 6];

/**
 * Format one table row by padding each cell to its column width.
 * @param {Array<string|number>} cells
 * @returns {string}
 */
function row(cells) {
  return cells.map((c, i) => String(c).slice(0, WIDTHS[i]).padEnd(WIDTHS[i])).join('  ');
}

/**
 * Format an ISO date string (yyyy-mm-dd) as mm/dd/yy.
 * @param {string} iso
 * @returns {string}
 */
function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y.slice(2)}`;
}

/**
 * Render the Rogue Heroes table centered in the box.
 * Columns: #, Date, Name, obituary (no header), Gold.
 * highlightIdx: if >= 0, that data row is rendered in inverse video.
 * @param {import('blessed').Widgets.BoxElement} box
 * @param {import('../game/heroes.js').HeroEntry[]} heroes
 * @param {number} [highlightIdx=-1]
 */
export function renderHeroes(box, heroes, highlightIdx = -1) {
  const title   = 'Rogue Heroes';
  const divider = '─'.repeat(title.length);

  const headers    = ['Name', 'Rank', '', 'Gold'];
  const headerLine = row(headers);
  const separator  = WIDTHS.map(w => '─'.repeat(w)).join('──');

  const dataLines = heroes.length === 0
    ? ['  (no heroes yet)']
    : heroes.map((h, i) => {
        const line = row([h.playerName, h.rank ?? '', h.obituary ?? '', h.gold]);
        return i === highlightIdx ? `{inverse}${line}{/inverse}` : line;
      });

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

  const W = Math.max(...block.map(l => l.replace(/\{[^}]+\}/g, '').length));
  const hPad = ' '.repeat(Math.max(0, Math.floor((COLS - W) / 2)));
  const vPad = '\n'.repeat(Math.max(0, Math.floor((ROWS - block.length) / 2)));
  box.setContent(vPad + block.map(l => hPad + l).join('\n'));
}
