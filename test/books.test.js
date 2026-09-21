// Two people changing the same part of the books at the same moment.
//
//   npm test
//
// Each client compares a field it has edited with what the server last said
// it was, and sends the difference. These check the differences are the right
// ones, that the server applies them, and — the point of it — that two
// clients who both start from the same books and both change one field end up
// with both changes, whichever order they arrive in.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffOps } from '../src/net/diff.js';
import { applyOp, FIELDS } from '../server/world.js';

const copy = (v) => JSON.parse(JSON.stringify(v));

/** Both edit `base[k]`; the server hears one and then the other. */
function race(k, base, mine, theirs) {
  const results = [];
  for (const order of [[mine, theirs], [theirs, mine]]) {
    const world = { [k]: copy(base) };
    for (const edited of order) {
      for (const op of diffOps(k, copy(base), copy(edited))) applyOp(world, op);
    }
    results.push(world[k]);
  }
  assert.deepEqual(results[0], results[1], 'the same whichever arrives first');
  return results[0];
}

test('two flags set at once are both set', () => {
  const out = race('flags', { a: true }, { a: true, mine: true }, { a: true, theirs: true });
  assert.deepEqual(out, { a: true, mine: true, theirs: true });
});

test('a place found by each of you is on both maps', () => {
  const out = race('visited', {}, { mill: { name: 'Mill', x: 1, y: 2 } }, { pier: { name: 'Pier', x: 3, y: 4 } });
  assert.deepEqual(Object.keys(out).sort(), ['mill', 'pier']);
});

test('the end-of-day write of the cats does not undo an adoption', () => {
  const tab = { id: 'c1', name: 'Tab', hunger: 0, age: 3 };
  const overnight = [{ ...tab, hunger: 1, age: 4 }];
  const adopted = [tab, { id: 'c2', name: 'New', hunger: 0, age: 0 }];
  const out = race('cats', [tab], overnight, adopted);
  assert.deepEqual(out.map((c) => c.id), ['c1', 'c2']);
  assert.equal(out[0].age, 4);
});

test('feeding a cat and brushing it are two changes to one cat', () => {
  const tab = { id: 'c1', hunger: 2, groomed: 0 };
  const out = race('cats', [tab], [{ ...tab, hunger: 0 }], [{ ...tab, groomed: 7 }]);
  assert.deepEqual(out, [{ id: 'c1', hunger: 0, groomed: 7 }]);
});

test('a change to a cat that has gone does not bring it back', () => {
  const world = { cats: [] };
  assert.deepEqual(applyOp(world, { op: 'patch', k: 'cats', id: 'c1', f: { hunger: 0 } }), []);
  assert.deepEqual(world.cats, []);
});

test('two additions to a tally are both counted', () => {
  assert.equal(race('deliveriesRun', 4, 5, 5), 6);
  assert.ok(Math.abs(race('reputation', 0.5, 0.51, 0.48) - 0.49) < 1e-9);
});

test('parking the bear and feeding her both hold', () => {
  const bear = { x: 1, y: 1, map: 'overworld', fedDay: 2 };
  const out = race('bear', bear, { ...bear, x: 50, y: 60 }, { ...bear, fedDay: 3 });
  assert.deepEqual(out, { x: 50, y: 60, map: 'overworld', fedDay: 3 });
});

test('only what changed is sent', () => {
  assert.deepEqual(diffOps('flags', { a: 1, b: 1 }, { a: 1, b: 1 }), []);
  assert.deepEqual(diffOps('flags', { a: 1, b: 1 }, { a: 1, c: 2 }),
    [{ op: 'put', k: 'flags', key: 'c', v: 2 }, { op: 'del', k: 'flags', key: 'b' }]);
  assert.deepEqual(diffOps('cats', [{ id: 1, h: 0, n: 'x' }], [{ id: 1, h: 1, n: 'x' }]),
    [{ op: 'patch', k: 'cats', id: 1, f: { h: 1 } }]);
  assert.deepEqual(diffOps('cats', [{ id: 1 }], []), [{ op: 'itemDel', k: 'cats', id: 1 }]);
});

test('what has no parts, or nothing to compare with, goes whole', () => {
  assert.deepEqual(diffOps('shopHours', [8, 18], [9, 17]), [{ op: 'set', k: 'shopHours', v: [9, 17] }]);
  assert.deepEqual(diffOps('flags', undefined, { a: 1 }), [{ op: 'set', k: 'flags', v: { a: 1 } }]);
  assert.deepEqual(diffOps('employee', null, { id: 'moss' }), [{ op: 'set', k: 'employee', v: { id: 'moss' } }]);
  assert.deepEqual(diffOps('employee', { id: 'moss' }, null), [{ op: 'set', k: 'employee', v: null }]);
});

test('the server refuses fields it does not keep and keys that are not keys', () => {
  const world = { flags: {} };
  assert.ok(!FIELDS.has('nonsense'));
  assert.deepEqual(applyOp(world, { op: 'put', k: 'nonsense', key: 'a', v: 1 }), []);
  assert.deepEqual(applyOp(world, { op: 'put', k: 'flags', key: '__proto__', v: { x: 1 } }), []);
  assert.equal({}.x, undefined);
  assert.deepEqual(applyOp(world, { op: 'put', k: 'flags', key: 'ok', v: true }), ['flags']);
  assert.deepEqual(applyOp({ money: 5 }, { op: 'put', k: 'money', key: 'a', v: 1 }), [], 'not a map');
  assert.deepEqual(applyOp({ cats: [] }, { op: 'add', k: 'cats', d: 1 }), [], 'not a tally');
});
