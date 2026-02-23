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
    const w = createWeapon('sword', 1, 1);
    expect(w.type).toBe('weapon');
    expect(w.baseName).toBe('sword');
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

  test('player starts with between 19 and 29 items (15–25 arrows + 4 others)', () => {
    expect(player.inventory.length).toBeGreaterThanOrEqual(19);
    expect(player.inventory.length).toBeLessThanOrEqual(29);
  });

  test('first item is the +1/+1 sword', () => {
    const sword = player.inventory[0];
    expect(sword.type).toBe('weapon');
    expect(sword.name).toBe('+1/+1 sword');
    expect(sword.hitBonus).toBe(1);
    expect(sword.damageBonus).toBe(1);
  });

  test('second item is leather armor', () => {
    const armor = player.inventory[1];
    expect(armor.type).toBe('armor');
    expect(armor.name).toBe('leather armor');
    expect(armor.ac).toBe(3);
  });

  test('third item is a +1/+1 short bow', () => {
    const bow = player.inventory[2];
    expect(bow.type).toBe('weapon');
    expect(bow.name).toBe('+1/+1 short bow');
  });

  test('items 4 through second-to-last are all arrows (15–25)', () => {
    const arrows = player.inventory.slice(3, -1);
    expect(arrows.length).toBeGreaterThanOrEqual(15);
    expect(arrows.length).toBeLessThanOrEqual(25);
    for (const a of arrows) expect(a.name).toBe('arrow');
  });

  test('last item is a food ration', () => {
    const food = player.inventory[player.inventory.length - 1];
    expect(food.type).toBe('food');
    expect(food.name).toBe('food ration');
  });

  test('player starts wearing leather armor', () => {
    expect(player.equippedArmor).toBe(player.inventory[1]);
  });

  test('player defense equals baseDefense + leather armor AC', () => {
    expect(player.baseDefense).toBe(0);
    expect(player.defense).toBe(3); // 0 + 3
  });

  test('player starts wielding the sword', () => {
    expect(player.equippedWeapon).toBe(player.inventory[0]);
  });

  test('player hitBonus and damageBonus reflect the wielded sword', () => {
    expect(player.hitBonus).toBe(1);
    expect(player.damageBonus).toBe(1);
  });
});
