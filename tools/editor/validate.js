// What the editor refuses to save.
//
// A quest is a set of cross-references — a giver, somebody to talk to, an item
// to fetch, a flag another quest sets — and every one of them is a string that
// has to match something else exactly. Nothing in the game checks them at run
// time: a quest pointing at a villager who does not exist simply never
// completes, and looks from the inside like a bug in the game rather than a
// typo in the content.
//
// So the check happens here, before anything is written. The editor uses
// dropdowns to make most of these impossible; this catches the rest, and it
// catches hand edits too, which is why the same function runs in the test
// harness against the content as it stands.

// The one definition of what a hint is, borrowed from the game rather than
// written out again here — a second copy is a second thing to forget when the
// shape changes, which is exactly how this file went stale.
import { hintsOf } from '../../src/world/villagers.js';

const OBJECTIVES = {
  stock: ['any', 'count'],
  item: ['item', 'count'],
  deliver: ['item', 'to', 'give'],
  talk: ['to'],
  flag: ['flag'],
  cats: ['count'],
  coat: ['quality'],
  rooms: ['count'],
  profit: ['amount'],
  gross: ['amount'],
  money: ['amount'],
  seatsEver: ['count'],
  furniture: ['place'],
  rarecat: [],
};

export const OBJECTIVE_TYPES = Object.keys(OBJECTIVES);

/** Everything a quest step may ask for, for the editor's forms. */
export function objectiveFields(type) {
  return OBJECTIVES[type] || [];
}

/**
 * Check a whole content set. Returns a list of plain-English problems; an empty
 * list means it is safe to write.
 *
 * `places` carries the things content refers to but does not own — the shops,
 * the search spots, the furniture kinds — so this can tell a real flag from a
 * misspelt one.
 */
export function validate({ quests = [], villagers = [], items = {} }, places = {}) {
  const out = [];
  const say = (where, what) => out.push(`${where}: ${what}`);

  const villagerIds = new Set(villagers.map((v) => v.id));
  const itemIds = new Set(Object.keys(items));
  const questIds = new Set(quests.map((q) => q.id));
  const placeIds = new Set(places.places || []);
  const furniture = new Set(places.furniture || []);

  // --- ids ------------------------------------------------------------------
  const dupes = (list, what) => {
    const seen = new Set();
    for (const id of list) {
      if (seen.has(id)) say(what, `two of them are called "${id}"`);
      seen.add(id);
    }
  };
  dupes(quests.map((q) => q.id), 'quests');
  dupes(villagers.map((v) => v.id), 'cast');

  for (const v of villagers) {
    if (!v.id || !/^[a-z][a-z0-9_]*$/.test(v.id)) say('cast', `"${v.id}" is not a usable id (lower case, no spaces)`);
    if (!v.name) say(v.id || 'cast', 'has no name');
    if (!Array.isArray(v.lines) || !v.lines.length) say(v.id, 'has nothing to say — give them at least one line');
    (v.hints || []).forEach((h, i) => {
      if (!h || !h.text) say(v.id, `hint ${i + 1} has nothing written in it`);
    });
    if (v.town && places.towns && !places.towns.includes(v.town)) say(v.id, `lives in "${v.town}", which is not a town`);
    if (v.spot && placeIds.size && !placeIds.has(v.spot)) say(v.id, `stands at "${v.spot}", which is not a landmark`);
    if (v.secret?.quest && !questIds.has(v.secret.quest)) say(v.id, `waits on the quest "${v.secret.quest}", which does not exist`);
    if (v.arrives?.until && !flagIsSet(v.arrives.until, quests, villagers)) {
      say(v.id, `stops arriving on the flag "${v.arrives.until}", which nothing sets`);
    }
  }

  for (const q of quests) {
    const at = q.id || '(a quest with no id)';
    if (!q.id || !/^[a-z][a-z0-9_]*$/.test(q.id)) say('quests', `"${q.id}" is not a usable id (lower case, no spaces)`);
    if (!q.title) say(at, 'has no title');
    if (!q.giver) say(at, 'has nobody to give it');
    else if (!villagerIds.has(q.giver)) say(at, `is given by "${q.giver}", who is not in the cast`);
    if (!q.offer) say(at, 'has no offer — the words the giver says when they ask');
    if (!q.complete) say(at, 'has no completion — the words the giver says when you finish');
    // The flag a job waits on has to be one something can actually set,
    // otherwise the job is simply never offered and looks like a bug in the
    // game rather than a name typed wrong.
    if (q.requires && !flagIsSet(q.requires, quests, villagers)) {
      say(at, `is only offered once "${q.requires}" is set, and nothing sets it`);
    }
    if (q.needsHint) {
      say(at, `still uses needsHint: "${q.needsHint}". Say which flag instead — `
        + `probably heard_hint_${q.needsHint}.`);
    }

    const steps = q.steps?.length ? q.steps : [{ objective: q.objective, progress: q.progress }];
    if (!steps.length) say(at, 'has no steps and no objective');
    steps.forEach((s, i) => {
      const where = q.steps?.length ? `${at} step ${i + 1}` : at;
      const o = s.objective;
      if (!o || !o.type) { say(where, 'has no objective — say what finishes it'); return; }
      if (!OBJECTIVES[o.type]) { say(where, `asks for "${o.type}", which is not a kind of objective`); return; }
      if (o.to && !villagerIds.has(o.to)) say(where, `points at "${o.to}", who is not in the cast`);
      if (o.item && !itemIds.has(o.item)) say(where, `wants "${o.item}", which is not an item`);
      if (o.any) for (const id of o.any) if (!itemIds.has(id)) say(where, `wants "${id}", which is not an item`);
      if (o.place && furniture.size && !furniture.has(o.place)) say(where, `wants "${o.place}" placed, which is not furniture`);
      if (o.type === 'flag' && !o.flag) say(where, 'waits on a flag but does not say which');
      for (const alt of s.progressWhen || []) {
        if (!alt.flag) say(where, 'has a conditional note with no flag on it');
        if (!alt.text) say(where, `has a conditional note on "${alt.flag}" with nothing written in it`);
      }
    });

    for (const alt of q.progressWhen || []) {
      if (!alt.flag || !alt.text) say(at, 'has a conditional note missing its flag or its text');
    }

    const r = q.reward || {};
    for (const [id] of r.items || []) if (!itemIds.has(id)) say(at, `pays out "${id}", which is not an item`);
    for (const who of r.friendship || []) if (!villagerIds.has(who)) say(at, `makes a friend of "${who}", who is not in the cast`);
    // A negative reward is a bill, not a mistake: the telephone job ends with
    // you paying six hundred for the line, which is the point of it.
    if (r.money !== undefined && !Number.isFinite(r.money)) say(at, 'pays an amount that is not a number');
  }

  // --- items ----------------------------------------------------------------
  for (const [id, it] of Object.entries(items)) {
    if (!/^[a-z][a-z0-9_]*$/.test(id)) say('items', `"${id}" is not a usable id (lower case, no spaces)`);
    if (!it.name) say(id, 'has no name');
    if (!it.cat) say(id, 'is in no category, so it will not appear in any shop or bag tab');
    if (!it.icon) say(id, 'has no icon');
    if (it.icon === 'custom' && !it.glyph) say(id, 'is drawn as a custom icon but has no shape chosen');
  }

  return out;
}

/** Does anything in the content actually set this flag? */
function flagIsSet(flag, quests, villagers) {
  // Something anybody says can set it.
  for (const v of villagers) if (hintsOf(v).some((h) => h.sets === flag)) return true;
  for (const q of quests) {
    if ((q.reward?.flags || []).includes(flag)) return true;
    const steps = q.steps || [];
    for (const s of steps) {
      if (s.evidence === flag) return true;
      if ((s.sets || s.flags || []).includes(flag)) return true;
    }
  }
  // Flags the game itself sets — searching a spot, clearing a barrier, and so
  // on. The editor cannot know them all, so anything with a known prefix is
  // taken on trust rather than reported as a mistake.
  return /^(barrier_|found_|saw_|got_|recipe_|call_|bought_)/.test(flag);
}
