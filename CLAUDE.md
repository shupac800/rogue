# claude0 — Rogue Clone

Terminal-based roguelike game. Design reference: original Rogue (1980).
Target display: 24 rows x 80 columns.

## Runtime

- Node.js 18+
- Approved external libraries: `blessed`
- No other external dependencies without explicit approval
- No browser APIs (no DOM, no window, no fetch)

## Code Style

- ES modules only (`import`/`export`, no `require`)
- Async/await only, no raw Promise chains
- All functions must have JSDoc comments
- Max function length: 40 lines
- Max file length: 300 lines

## Terminal Output

- All output must fit within 80 columns — hard limit
- Use `blessed` for all terminal rendering
- No raw ANSI escape codes
- Map viewport: 80x22 (reserve 2 rows for status bar)
- Clean exit on Ctrl+C (handle SIGINT)
- Graceful handling of terminal resize events

## Project Structure

- Entry point: `src/index.js`
- `src/game/` — game state, entities, mechanics
- `src/render/` — all display logic
- `src/input/` — keyboard input handling
- `src/dungeon/` — procedural generation
- `tests/` — test files, named `*.test.js`
- One concern per file, no circular dependencies

## Architecture Rules

- Pure turn-based: nothing happens until the player inputs a command
- Strict separation: game state / rendering / input handling never mixed
- Game state must be fully serializable (save/load support from the start)
- All coordinates as `{x, y}` objects, origin top-left

## Roguelike Rules

- Permadeath: save file deletes on death
- Procedural dungeon generation per level
- Fog of war: reveal only tiles within player line-of-sight
- Visited tiles remain visible but dimmed

## Testing

- Tests required for all non-UI logic (dungeon gen, combat, inventory, FOV)
- UI/rendering code is exempt from test requirement
- Run tests with: `npm test`

## Workflow

- Plan before coding: propose approach and wait for approval
- One feature at a time
- Never modify files outside the project directory
- When in doubt about a mechanic, ask — don't invent
