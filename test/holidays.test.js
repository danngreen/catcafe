// Holidays: when they're on, and what they switch on and off.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holidayOn, setHoliday, holiday, inHoliday, HOLIDAYS } from '../src/holidays/index.js';
import { ITEMS, onMenu, menuIds, stockFor } from '../src/game/items.js';
import { QUESTS, liveQuests } from '../src/game/quests.js';

const d = (s) => new Date(`${s}T12:00:00`);

test('Halloween runs Oct 4 to Nov 4, inclusive', () => {
  assert.equal(holidayOn(d('2026-10-03')), null);
  assert.deepEqual(holidayOn(d('2026-10-04')), { id: 'halloween', year: 2026 });
  assert.deepEqual(holidayOn(d('2026-10-31')), { id: 'halloween', year: 2026 });
  assert.deepEqual(holidayOn(d('2026-11-04')), { id: 'halloween', year: 2026 });
  assert.equal(holidayOn(d('2026-11-05')), null);
  assert.equal(holidayOn(d('2027-07-04')), null);
  assert.deepEqual(holidayOn(d('2027-10-20')), { id: 'halloween', year: 2027 });
});

test('the override wins over the date, either way', () => {
  assert.deepEqual(holidayOn(d('2026-06-01'), 'halloween'), { id: 'halloween', year: 2026 });
  assert.deepEqual(holidayOn(d('2026-06-01'), ' Halloween '), { id: 'halloween', year: 2026 });
  assert.equal(holidayOn(d('2026-10-31'), 'off'), null);
  assert.equal(holidayOn(d('2026-10-31'), 'none'), null);
  // Something it doesn't recognise is no override at all.
  assert.deepEqual(holidayOn(d('2026-10-31'), 'easter'), { id: 'halloween', year: 2026 });
  assert.equal(holidayOn(d('2026-06-01'), ''), null);
});

test('a window over New Year belongs to the year it started', () => {
  HOLIDAYS.push({ id: 'testmas', name: 'Testmas', from: '12-20', to: '01-05' });
  try {
    assert.deepEqual(holidayOn(d('2026-12-25')), { id: 'testmas', year: 2026 });
    assert.deepEqual(holidayOn(d('2027-01-03')), { id: 'testmas', year: 2026 });
    assert.equal(holidayOn(d('2027-01-06')), null);
  } finally {
    HOLIDAYS.pop();
  }
});

test('holiday items are on the menu and in the shops only while it is on', () => {
  const seasonal = Object.keys(ITEMS).filter((id) => ITEMS[id].holiday === 'halloween');
  assert.ok(seasonal.includes('pumpkin_latte') && seasonal.includes('strawberry'));
  try {
    setHoliday(null);
    for (const id of seasonal) assert.equal(onMenu(id), false, id);
    assert.ok(!menuIds().includes('pumpkin_latte'));
    assert.ok(!stockFor('grocer').includes('pumpkin_latte'));
    assert.ok(stockFor('grocer').includes('house_coffee'));

    setHoliday({ id: 'halloween', year: 2026 });
    assert.deepEqual(holiday(), { id: 'halloween', year: 2026 });
    assert.ok(menuIds().includes('pumpkin_latte'));
    assert.ok(stockFor('grocer').includes('pumpkin_latte'));
    assert.ok(stockFor('tea').includes('pumpkin_latte'));
    // Strawberries come from the houses, never from a shop.
    for (const list of ['grocer', 'bakery', 'tea', 'harbour']) assert.ok(!stockFor(list).includes('strawberry'));
  } finally {
    setHoliday(null);
  }
});

test('holiday quests only exist while it is on', () => {
  const seasonal = QUESTS.filter((q) => q.holiday);
  try {
    setHoliday(null);
    for (const q of seasonal) assert.ok(!liveQuests().includes(q), q.id);
    assert.equal(liveQuests().length, QUESTS.length - seasonal.length);
    setHoliday({ id: 'halloween', year: 2026 });
    assert.equal(liveQuests().length, QUESTS.filter((q) => inHoliday(q)).length);
    for (const q of seasonal.filter((x) => x.holiday === 'halloween')) assert.ok(liveQuests().includes(q), q.id);
  } finally {
    setHoliday(null);
  }
});

test('an unknown holiday id is ignored rather than half-applied', () => {
  setHoliday({ id: 'nope', year: 2026 });
  assert.equal(holiday(), null);
  setHoliday(null);
});
