import { ITEMS } from './items.js';
import { QUESTS } from './questdata.js';

export { QUESTS };

// Small errands the villagers ask of you. Most are fetch-and-carry; the reward
// is usually money, sometimes an item, and quite often just knowing where to
// buy something you couldn't find before.


export const QUEST_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
export const QUESTS_BY_GIVER = QUESTS.reduce((m, q) => {
  if (!m[q.giver]) m[q.giver] = [];
  m[q.giver].push(q);
  return m;
}, {});

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------
//
// A quest is a list of steps done in order. Most have one, which is why they
// can still be written with a bare `objective` and `progress`; the longer ones
// spell out a `steps` array, where each step has its own thing to do, its own
// line for the journal, and its own line for whoever you report back to.

/** Every quest as a list of steps, however it was written. */
export function questSteps(q) {
  if (q.steps) return q.steps;
  return [{ objective: q.objective, progress: q.progress }];
}

/** Which step of `q` is in play. */
export function stepIndex(q, st) {
  const n = questSteps(q).length;
  return Math.min((st.questStep && st.questStep[q.id]) || 0, n - 1);
}

export function currentStep(q, st) { return questSteps(q)[stepIndex(q, st)]; }

export function isLastStep(q, st) { return stepIndex(q, st) >= questSteps(q).length - 1; }

/** Has the player done what the step in play asks? */
export function objectiveMet(q, st) {
  return stepMet(currentStep(q, st).objective, st);
}

export function stepMet(o, st) {
  if (!o) return false;
  switch (o.type) {
    case 'stock': {
      const n = o.any.reduce((s, id) => s + st.cafeSim.stockCount(id), 0);
      return n >= o.count;
    }
    case 'item': {
      const need = o.count || 1;
      if ((st.inventory[o.item] || 0) >= need) return true;
      // A bought bottle of milk lands in the pantry rather than the bag, so
      // "get a bottle of milk" was a step you could never finish by buying one.
      return !!st.cafeSim && st.cafeSim.stockCount(o.item) >= need;
    }
    case 'deliver':
    case 'talk':
      return false; // both are finished by talking to somebody
    case 'flag':
      return !!st.flags[o.flag];
    case 'cats':
      return st.cats.length >= o.count;
    case 'coat':
      return st.cats.some((c) => c.coatQuality >= o.quality);
    case 'rooms':
      return st.cafe.rooms.length >= o.count;
    case 'profit':
      return st.bestDayProfit >= o.amount;
    // Seats you have had at once rather than seats you have now: taking a
    // chair out for a week should not undo having built the place up.
    case 'money':
      return st.money >= o.amount;
    case 'seatsEver':
      return (st.flags.most_seats || 0) >= o.count;
    case 'gross':
      return (st.bestDayGross || 0) >= o.amount;
    case 'rarecat':
      return st.cats.some((c) => { const b = st.breedInfo(c.breed); return b && b.rare; });
    case 'furniture':
      return st.cafe.furniture.some((f) => f.type === o.place);
    default:
      return false;
  }
}

/** Short "what do I do now" text for the journal. */
export function objectiveText(q, st) {
  const step = currentStep(q, st);
  const o = step.objective;
  const n = questSteps(q).length;
  const of = n > 1 ? ` (${stepIndex(q, st) + 1}/${n})` : '';
  // Done it, but nobody has been told. The step moves when you report back —
  // their reply to it is half the reason for going — so the journal should ask
  // for that rather than go on asking for the thing you have already done.
  if (reportBack(q, st)) return `Go back and tell ${st.villagerName(q.giver)}${of}`;
  return stepText(o, st, step) + of;
}

/**
 * Is this step finished and waiting to be handed in? `talk` and `deliver` steps
 * are finished *by* the conversation, so they are never in this state.
 */
export function reportBack(q, st) {
  if (st.quests[q.id] !== 'active') return false;
  const o = currentStep(q, st).objective;
  if (o.type === 'talk' || o.type === 'deliver') return false;
  return stepMet(o, st);
}

/** "a piano", "a stone fireplace" — what a `furniture` step is asking for. */
function placeName(place) {
  const entry = Object.values(ITEMS).find((v) => v.place === place);
  if (!entry) return 'that';
  const name = entry.name.toLowerCase();
  return `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`;
}

function stepText(o, st, step) {
  if (step && step.note) return step.note;
  switch (o.type) {
    case 'stock': {
      const n = o.any.reduce((s, id) => s + st.cafeSim.stockCount(id), 0);
      const what = o.any.map((id) => st.itemName(id)).join(' or ');
      return `Stock ${what} (${Math.min(n, o.count)}/${o.count})`;
    }
    case 'item': {
      const want = o.count || 1;
      // The pantry counts as well as the bag, the same way the step does —
      // otherwise a bought bottle of milk reads 0/1 while the step is done.
      const held = (st.inventory[o.item] || 0) + (st.cafeSim ? st.cafeSim.stockCount(o.item) : 0);
      return `Get ${st.itemName(o.item)} (${Math.min(held, want)}/${want})`;
    }
    case 'deliver': return `Take ${st.itemName(o.item)} to ${st.villagerName(o.to)}`;
    case 'talk': return `Go and see ${st.villagerName(o.to)}`;
    case 'flag': return 'Clear whatever is in the way';
    case 'cats': return `Adopt ${o.count} cats (${st.cats.length}/${o.count})`;
    case 'coat': return 'Feed a cat well until its coat improves';
    case 'rooms': return `Build another room onto the cafe (${st.cafe.rooms.length}/${o.count})`;
    case 'profit': return `Clear ${o.amount} profit in one day (best so far: ${Math.round(st.bestDayProfit)})`;
    case 'money': return `Save up ${o.amount} (${Math.min(st.money, o.amount)}/${o.amount})`;
    case 'seatsEver': return `Have ${o.count} seats in the cafe (${Math.min(st.flags.most_seats || 0, o.count)}/${o.count})`;
    case 'gross': return `Take ${o.amount} in one day (best so far: ${Math.round(st.bestDayGross || 0)})`;
    case 'rarecat': return 'Adopt a rare breed';
    case 'furniture': return `Put ${placeName(o.place)} in the cafe`;
    default: return '';
  }
}

/** The line the giver says while you're partway through. */
export function progressText(q, st) {
  if (reportBack(q, st)) {
    return `That part is done. Go and tell ${st.villagerName(q.giver)} about it.`;
  }
  // A note can change once you have been told something. "Ask around Saltmere"
  // is right until somebody down there answers and quite wrong afterwards, so a
  // job may carry a list of flags with better notes attached. Data rather than
  // a function, because this is content and content has to survive being
  // written out to a file by the editor.
  const step = currentStep(q, st);
  const when = [...(step.progressWhen || []), ...(q.progressWhen || [])];
  for (const alt of when) if (alt.flag && st.flags && st.flags[alt.flag]) return alt.text;
  return step.progress || q.progress || 'Still on it, then?';
}

/**
 * The flag a job waits on before anybody will offer it, if it waits on one.
 *
 * `requires` names the flag itself. It replaced `needsHint`, which named a
 * person — fine while everybody knew one thing, useless once they can know
 * several, because it could not say which of them was the one that mattered.
 * The old field is still read so that content edited by hand and not yet
 * saved through the editor keeps working.
 */
export function requiredFlag(q) {
  return q.requires || (q.needsHint ? `heard_hint_${q.needsHint}` : null);
}
