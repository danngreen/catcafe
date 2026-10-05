// The piano's tunes: playable, short, and numbered the same everywhere.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNES, tuneLength, pickTune } from '../src/game/tunes.js';

test('every tune is a little jingle, on keys a piano has', () => {
  assert.ok(TUNES.length >= 8);
  for (const tune of TUNES) {
    assert.ok(tune.name && /^[\x20-\x7e]+$/.test(tune.name), `${tune.name}: plain ASCII, for the bitmap font`);
    assert.ok(tune.bpm > 40 && tune.bpm < 240, `${tune.name}: bpm`);
    const len = tuneLength(tune);
    assert.ok(len > 1 && len <= 8, `${tune.name} lasts ${len.toFixed(1)}s`);
    for (const [at, pitch, beats] of tune.notes) {
      assert.ok(at >= 0 && beats > 0, `${tune.name}: timing`);
      for (const m of [].concat(pitch)) assert.ok(Number.isInteger(m) && m >= 21 && m <= 108, `${tune.name}: ${m}`);
    }
  }
});

test('a tune is never picked twice running', () => {
  for (let last = 0; last < TUNES.length; last++) {
    for (let i = 0; i < 50; i++) {
      const n = pickTune(last);
      assert.ok(n >= 0 && n < TUNES.length);
      assert.notEqual(n, last);
    }
  }
  // Every one of them comes up.
  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(pickTune(-1));
  assert.equal(seen.size, TUNES.length);
});
