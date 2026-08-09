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
