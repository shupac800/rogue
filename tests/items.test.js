/**
 * Tests for item.js and inventory on the player.
 */

import { createWeapon, createFood } from '../src/game/item.js';
import { createPlayer } from '../src/game/player.js';

// ---------------------------------------------------------------------------
// createWeapon
// ---------------------------------------------------------------------------

describe('createWeapon', () => {
  test('has correct type and fields', () => {
    const w = createWeapon('+1/+1 sword', 1, 1);
    expect(w.type).toBe('weapon');
    expect(w.name).toBe('+1/+1 sword');
    expect(w.hitBonus).toBe(1);
    expect(w.damageBonus).toBe(1);
  });

  test('supports negative bonuses (cursed weapons)', () => {
    const w = createWeapon('cursed dagger', -1, -1);
    expect(w.hitBonus).toBe(-1);
    expect(w.damageBonus).toBe(-1);
  });

  test('returns distinct objects on each call', () => {
    const a = createWeapon('sword', 0, 0);
    const b = createWeapon('sword', 0, 0);
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// createFood
// ---------------------------------------------------------------------------

describe('createFood', () => {
  test('has correct type and name', () => {
    const f = createFood('food ration');
    expect(f.type).toBe('food');
    expect(f.name).toBe('food ration');
  });

  test('returns distinct objects on each call', () => {
    const a = createFood('ration');
    const b = createFood('ration');
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Player starting inventory
// ---------------------------------------------------------------------------

describe('player starting inventory', () => {
  let player;
  beforeEach(() => { player = createPlayer(0, 0); });

  test('player has an inventory array', () => {
    expect(Array.isArray(player.inventory)).toBe(true);
  });

  test('player starts with exactly two items', () => {
    expect(player.inventory.length).toBe(2);
  });

  test('first item is the +1/+1 sword', () => {
    const sword = player.inventory[0];
    expect(sword.type).toBe('weapon');
    expect(sword.hitBonus).toBe(1);
    expect(sword.damageBonus).toBe(1);
  });

  test('second item is a food ration', () => {
    const food = player.inventory[1];
    expect(food.type).toBe('food');
    expect(food.name).toBe('food ration');
  });
});
