/**
 * @module render/terminal
 * Renders a terminal-like I/O screen in a blessed box.
 */

/** Maximum characters allowed in a terminal input field. */
export const MAX_INPUT_LENGTH = 20;

/**
 * Render a terminal prompt screen.
 * Output lines are shown above the current input line.
 * An underscore cursor is appended to the input buffer.
 * @param {import('blessed').Widgets.BoxElement} box
 * @param {string[]} outputLines - Lines of text above the prompt.
 * @param {string} prompt - Text shown before the input buffer.
 * @param {string} inputBuffer - Current accumulated input.
 */
export function renderTerminal(box, outputLines, prompt, inputBuffer) {
  box.setContent([...outputLines, `${prompt}${inputBuffer}_`].join('\n'));
}

/**
 * Render a unicode-boxed death summary into the terminal box.
 * Box width is determined by the widest content line.
 * @param {import('blessed').Widgets.BoxElement} box
 * @param {string} playerName
 * @param {string} rank
 * @param {string} causeOfDeath
 * @param {number} dungeonLevel
 * @param {number} gold
 */
export function renderTombstone(box, playerName, rank, causeOfDeath, dungeonLevel, gold) {
  const COLS = 80;
  const ROWS = 24;
  const contentLines = [
    'R.I.P.',
    '',
    playerName,
    rank,
    '',
    `killed by ${causeOfDeath}`,
    `on level ${dungeonLevel}`,
    `with ${gold} Au`,
  ];
  const W = Math.max(...contentLines.map(l => l.length));
  const hPad = ' '.repeat(Math.floor((COLS - (W + 4)) / 2));
  const mid = s => s.padStart(Math.floor((W + s.length) / 2)).padEnd(W);
  const boxLines = [
    `${hPad}┌─${'─'.repeat(W)}─┐`,
    ...contentLines.map(s => `${hPad}│ ${mid(s)} │`),
    `${hPad}└─${'─'.repeat(W)}─┘`,
  ];
  const footer = 'Press any key...';
  const footerLine = footer.padStart(Math.floor((COLS + footer.length) / 2));
  const block = [...boxLines, '', footerLine];
  const vPad = '\n'.repeat(Math.floor((ROWS - block.length) / 2));
  box.setContent(vPad + block.join('\n'));
}
