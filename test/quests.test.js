// The quest rules, and the quest content checked against them.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTS, QUEST_BY_ID, questSteps, stepIndex, objectiveMet } from '../src/game/quests.js';
import * as rules from '../src/game/quests.js';
import { ITEMS } from '../src/game/items.js';

/** As much of the game's state as the quest rules read. */
function state(over = {}) {
  const st = {
    money: 0, flags: {}, quests: {}, questStep: {}, inventory: {}, cats: [],
    cafe: { rooms: [{}], furniture: [] }, bestDayProfit: 0, bestDayGross: 0,
    cafeSim: { stockCount: (id) => (st.pantry && st.pantry[id]) || 0 },
    breedInfo: () => null,
    villagerName: (id) => id,
    itemName: (id) => id,
    setQuestStep(id, n) { if ((st.questStep[id] || 0) < n) st.questStep[id] = n; },
    ...over,
  };
  return st;
}

test('a job is on the step its number says, whatever else is true', () => {
  // There used to be a "repair" that moved a job on when a later step's
  // condition read as met. The third step of the telephone job is "have 600",
  // so a valley with 600 in the till skipped forty seats and a thousand-pound
  // day on its next load and was handed a telephone. There is one way for a
  // step to move now: reporting it to somebody.
  const st = state({
    money: 99999, inventory: { treats: 5, bell: 2, lantern: 1, golden_collar: 1 },
    pantry: { milk: 9 }, flags: { read_town_history: true, got_collar: true },
  });
  for (const q of QUESTS) st.quests[q.id] = 'active';
  for (const q of QUESTS) assert.equal(stepIndex(q, st), 0, q.id);
  assert.equal(objectiveMet(QUEST_BY_ID.the_telephone, st), false, 'and the first step is still forty seats');
});

// ------------------------------------------------------------- the content

test('no job hands you the thing it then asks you to go and find', () => {
  // A `deliver` step gives you the parcel unless it says `give: false`. That is
  // right for "take this to X" and wrong for "bring me one": the shell job
  // handed over a shell, had Anchor take it, and then wanted it again.
  const bad = [];
  for (const q of QUESTS) {
    const steps = questSteps(q);
    steps.forEach((s, i) => {
      const o = s.objective;
      if (o.type !== 'deliver' || o.give === false) return;
      const wantedLater = steps.slice(i + 1).some((n) => n.objective.item === o.item);
      if (wantedLater) bad.push(`${q.id} step ${i}`);
    });
  }
  assert.deepEqual(bad, []);
});

test('a job that costs money asks for it to be saved first', () => {
  for (const q of QUESTS) {
    const cost = q.reward && q.reward.money < 0 ? -q.reward.money : 0;
    if (!cost) continue;
    const saves = questSteps(q).some((s) => s.objective.type === 'money' && s.objective.amount >= cost);
    assert.ok(saves, `${q.id} charges ${cost} without a step that has you save it`);
  }
});

test('every item a job names is real', () => {
  for (const q of QUESTS) {
    for (const s of questSteps(q)) {
      const o = s.objective;
      assert.ok(o && o.type, `${q.id}: a step with no objective`);
      if (o.item) assert.ok(ITEMS[o.item], `${q.id}: no such item ${o.item}`);
      for (const [id] of s.gives || []) assert.ok(ITEMS[id], `${q.id}: gives no such item ${id}`);
      assert.equal(s.evidence, undefined, `${q.id}: \`evidence\` went with the repair it fed`);
    }
    for (const [id] of (q.reward && q.reward.items) || []) assert.ok(ITEMS[id], `${q.id}: rewards no such item ${id}`);
  }
});

test('the repair is gone, and stays gone', () => {
  for (const name of ['repairStep', 'repairAllSteps', 'repairLostItems', 'stepDone']) {
    assert.equal(rules[name], undefined, name);
  }
});

test('an item asked for as the last thing is handed over; one asked for on the way is not', () => {
  // Read from the content, so a new job shows up here: which jobs take the
  // thing off you at the end.
  const handsOver = QUESTS.filter((q) => {
    const last = questSteps(q)[questSteps(q).length - 1].objective;
    return last.type === 'item' && !last.keep;
  }).map((q) => q.id).sort();
  assert.deepEqual(handsOver, ['honey_run', 'lighthouse_log']);
});
