// Putting back what was done while the link was down.
//
// Most of the books change by small operations — spend this, add that — and
// those can simply be sent late. But some fields are published whole: the
// flags, the friendships, the cats. A whole field written while we were away
// was written on top of what the books said when we left, and sending it as it
// stands would undo whatever anybody else did to that field in the meantime.
//
// So a whole field is sent as the difference it made. `base` is what the
// server last told us, `ours` is what we turned that into, `theirs` is what
// the server says now: the answer is theirs, with our changes made to it.

function isPlain(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

/** A list of things that each say who they are, like the cats. */
function hasIds(list) {
  if (!Array.isArray(list)) return false;
  for (let i = 0; i < list.length; i++) {
    if (!isPlain(list[i]) || list[i].id === undefined || list[i].id === null) return false;
  }
  return true;
}

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function byId(list) {
  const out = new Map();
  for (const x of list) out.set(x.id, x);
  return out;
}

export function merge3(base, ours, theirs) {
  if (same(ours, base)) return theirs;              // we changed nothing
  if (same(theirs, base)) return ours;              // nobody else did
  // A tally: what we added to it still wants adding.
  if (typeof base === 'number' && typeof ours === 'number' && typeof theirs === 'number') {
    return theirs + (ours - base);
  }
  if (isPlain(base) && isPlain(ours) && isPlain(theirs)) {
    const out = {};
    for (const k of Object.keys(theirs)) {
      const gone = k in base && !(k in ours);         // we took it out
      if (!gone) out[k] = k in ours ? merge3(base[k], ours[k], theirs[k]) : theirs[k];
    }
    for (const k of Object.keys(ours)) {
      if (k in theirs) continue;
      // Ours alone: new, or changed by us after they removed it. One they
      // removed and we never touched stays removed.
      if (!(k in base) || !same(base[k], ours[k])) out[k] = ours[k];
    }
    return out;
  }
  if (hasIds(base) && hasIds(ours) && hasIds(theirs)) {
    const b = byId(base), o = byId(ours);
    const out = [];
    for (const x of theirs) {
      if (b.has(x.id) && !o.has(x.id)) continue;      // we removed it
      out.push(o.has(x.id) ? merge3(b.get(x.id), o.get(x.id), x) : x);
    }
    const t = byId(theirs);
    for (const x of ours) if (!b.has(x.id) && !t.has(x.id)) out.push(x);   // we added it
    return out;
  }
  // Both changed something with no parts to tell apart. Ours, as it would
  // have been had we sent it at the time.
  return ours;
}
