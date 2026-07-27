#!/usr/bin/env node
// Put a valley's quests back to the beginning, so they can all be played
// through again — for testing, not for players.
//
// Quest state is spread over four fields rather than one, which is why doing
// this by hand goes wrong: `quests` says which jobs are taken, `questStep` how
// far through each multi-step one you are, `flags` records the things you saw
// and the barriers you cleared, and `inventory` holds the parcels. Miss the
// flags and a barrier quest completes the moment you accept it, because its
// objective flag is already true; miss the inventory and you finish the next
// run carrying two golden collars.
//
// Everything else — money, cats, the cafe and its furniture, the pantry, the
// clock — is left exactly as it was, so the valley you come back to is the one
// you left, minus the errands.
//
//   node tools/resetquests.js                    every save in saves/
//   node tools/resetquests.js saves/valley-002.json
//   node tools/resetquests.js --dry              say what it would do
//   node tools/resetquests.js --friends          forget friendships too
//
// Stop the server first. A running room holds the books in memory and writes
// them back out every twenty seconds, so it will undo this under you.

import { readFileSync, writeFileSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUESTS } from '../src/game/quests.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const alsoFriends = args.includes('--friends');
const files = args.filter((a) => !a.startsWith('--'));

// Flag families that only exist because of a quest. Prefixes, because these are
// all `${something}_${id}` and the ids come from the world, not from a list.
const FLAG_PREFIXES = [
  'barrier_',      // a pass you cleared — leave it and the quest self-completes
  'found_',        // a spot you searched, which is where several quest items are
  'heard_hint_',   // a villager's one-time nudge toward a job
  'hint_',         // somewhere unlocked on the map by finishing one
  'recipe_',       // a recipe a quest taught you
];

// Loose ones set from the world rather than named by a quest definition.
const FLAG_EXTRAS = ['got_collar'];

/** Every flag the quest definitions themselves mention. */
function questFlags() {
  const out = new Set(FLAG_EXTRAS);
  const fromObjective = (o) => { if (o && o.flag) out.add(o.flag); };
  for (const q of QUESTS) {
    fromObjective(q.objective);
    for (const s of q.steps || []) {
      fromObjective(s.objective);
      for (const f of s.flags || []) out.add(f);
    }
    for (const f of q.reward?.flags || []) out.add(f);
    if (q.reward?.hint) out.add(`hint_${q.reward.hint}`);
  }
  return out;
}

/** Every item a quest hands out, asks for, or has you carry. */
function questItems() {
  const out = new Set();
  const fromObjective = (o) => { if (o && o.item) out.add(o.item); };
  for (const q of QUESTS) {
    fromObjective(q.objective);
    for (const s of q.steps || []) {
      fromObjective(s.objective);
      for (const [id] of s.gives || []) out.add(id);
    }
    for (const [id] of q.reward?.items || []) out.add(id);
  }
  return out;
}

const FLAGS = questFlags();
const ITEMS = questItems();

function reset(path) {
  let save;
  try { save = JSON.parse(readFileSync(path, 'utf8')); } catch (err) {
    console.log(`  ${path}: not readable (${err.message})`);
    return;
  }
  const w = save.world;
  if (!w) { console.log(`  ${path}: never started, nothing to reset`); return; }

  const had = Object.keys(w.quests || {}).length;
  const droppedFlags = [];
  const droppedItems = [];

  for (const k of Object.keys(w.flags || {})) {
    if (FLAGS.has(k) || FLAG_PREFIXES.some((p) => k.startsWith(p))) droppedFlags.push(k);
  }
  for (const k of Object.keys(w.inventory || {})) {
    if (ITEMS.has(k)) droppedItems.push(`${k}x${w.inventory[k]}`);
  }

  if (!dry) {
    w.quests = {};
    w.questStep = {};
    for (const k of droppedFlags) delete w.flags[k];
    for (const k of droppedItems) delete w.inventory[k.split('x')[0]];
    if (alsoFriends) w.friends = {};
    copyFileSync(path, `${path}.bak`);
    writeFileSync(path, JSON.stringify(save));
  }

  console.log(`  ${path}`);
  console.log(`    quests    ${had} cleared`);
  console.log(`    flags     ${droppedFlags.length ? droppedFlags.join(' ') : '(none)'}`);
  console.log(`    items     ${droppedItems.length ? droppedItems.join(' ') : '(none)'}`);
  if (alsoFriends) console.log('    friends   cleared');
  if (!dry) console.log(`    kept a copy at ${path}.bak`);
}

const targets = files.length ? files : (() => {
  const dir = join(ROOT, 'saves');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^valley-\d{3}\.json$/.test(f)).map((f) => join(dir, f));
})();

if (!targets.length) {
  console.log('no saves found — pass a path, or run this from a server that has played a game');
  process.exit(1);
}

console.log(dry ? 'would reset:' : 'reset:');
for (const t of targets) reset(t);
if (dry) console.log('\n(--dry: nothing was written)');
