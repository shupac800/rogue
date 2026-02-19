/**
 * @module octants
 * Pure coordinate transforms for the 8 octants of recursive shadowcasting.
 * Each function maps (row, col) in octant-local space to (dx, dy) world offsets.
 * No dependencies — safe to import from anywhere.
 */

/** @param {number} row @param {number} col @returns {{dx:number,dy:number}} */
export function octant0(row, col) { return { dx:  row, dy: -col }; }

/** @param {number} row @param {number} col @returns {{dx:number,dy:number}} */
export function octant1(row, col) { return { dx:  col, dy: -row }; }

/** @param {number} row @param {number} col @returns {{dx:number,dy:number}} */
export function octant2(row, col) { return { dx: -col, dy: -row }; }

/** @param {number} row @param {number} col @returns {{dx:number,dy:number}} */
export function octant3(row, col) { return { dx: -row, dy: -col }; }

/** @param {number} row @param {number} col @returns {{dx:number,dy:number}} */
export function octant4(row, col) { return { dx: -row, dy:  col }; }

/** @param {number} row @param {number} col @returns {{dx:number,dy:number}} */
export function octant5(row, col) { return { dx: -col, dy:  row }; }

/** @param {number} row @param {number} col @returns {{dx:number,dy:number}} */
export function octant6(row, col) { return { dx:  col, dy:  row }; }

/** @param {number} row @param {number} col @returns {{dx:number,dy:number}} */
export function octant7(row, col) { return { dx:  row, dy:  col }; }

/**
 * All 8 octant transforms in order.
 * Together they cover the full 360° field of view.
 * @type {Array<(row: number, col: number) => {dx: number, dy: number}>}
 */
export const OCTANTS = [
  octant0, octant1, octant2, octant3,
  octant4, octant5, octant6, octant7,
];
