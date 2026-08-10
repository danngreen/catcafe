// Reading the cast.
//
// The list itself is content and lives in villagerdata.js, which the editor
// rewrites wholesale — so nothing but data may live in that file. These two
// read the small objects it holds, and they live here because the editor would
// cheerfully write over them if they did not. It already did once.

/**
 * Is somebody who is kept back yet to be found?
 *
 * `secret` says what has to have happened first, as data: a flag, or a quest
 * having reached a step. Somebody with no `secret` is simply in the valley.
 */
export function secretMet(secret, st) {
  if (!secret) return true;
  if (secret.flag) return !!st.flags?.[secret.flag];
  if (secret.quest) {
    if (st.quests?.[secret.quest] === 'done') return true;
    return (st.questStep?.[secret.quest] || 0) >= (secret.step || 1);
  }
  return true;
}

/**
 * Is a regular with news due to walk in? `until` is the flag they set by
 * telling you — once it is set they stop coming, because they have said it.
 */
export function arrivesNow(arrives, st) {
  if (!arrives) return false;
  if (arrives.until && st.flags?.[arrives.until]) return false;
  if (arrives.deliveries && (st.deliveriesRun || 0) < arrives.deliveries) return false;
  if (arrives.flag && !st.flags?.[arrives.flag]) return false;
  return true;
}

/**
 * Everything somebody knows, in the order they would say it.
 *
 * A villager used to have one hint, always available from the first day: the
 * only gate was having talked to them once before. Now they may have several,
 * and any of them may wait on a flag — so the fishmonger can say one thing
 * before you have a cat and another once you have four.
 *
 * `when` is optional on purpose. A hint with no `when` behaves exactly as
 * hints always have, which is what the seventeen already written do; if every
 * hint needed a flag, every one of them would need a flag invented for it.
 *
 * Each hint records that it has been said in a flag of its own. The first one
 * uses `heard_hint_<id>`, which is the name quests already wait on through
 * `needsHint`, so a villager who gains a second hint does not break the job
 * that depends on their first.
 */
export function hintsOf(def) {
  const raw = def.hints || (def.hint ? [{ text: def.hint }] : []);
  return raw.map((h, i) => ({
    text: typeof h === 'string' ? h : h.text,
    when: typeof h === 'string' ? undefined : h.when,
    sets: (typeof h === 'string' ? null : h.sets)
      || (i === 0 ? `heard_hint_${def.id}` : `heard_hint_${def.id}_${i}`),
  })).filter((h) => h.text);
}

/** The next thing they have to say that you have not heard and may hear yet. */
export function nextHint(def, flags = {}) {
  return hintsOf(def).find((h) => !flags[h.sets] && (!h.when || flags[h.when])) || null;
}
