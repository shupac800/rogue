/**
 * @module input/keys
 * Maps blessed key names to movement (dx, dy) deltas.
 * No project dependencies.
 */

/** @type {Object.<string, {dx:number,dy:number}>} */
const KEY_MAP = {
  // Arrow keys
  up:    { dx:  0, dy: -1 },
  down:  { dx:  0, dy:  1 },
  left:  { dx: -1, dy:  0 },
  right: { dx:  1, dy:  0 },
  // Wait in place
  space: { dx: 0, dy: 0 },
};

/**
 * Return the movement delta for a key name, or null if unrecognised.
 * @param {string} keyName - Normalised key name from blessed (e.g. 'up', 'h').
 * @returns {{dx:number,dy:number}|null}
 */
export function getMoveDelta(keyName) {
  return KEY_MAP[keyName] ?? null;
}
