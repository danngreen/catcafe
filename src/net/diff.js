// Saying what changed, rather than what everything now is.
//
// The game edits its books in place — sets a flag, warms a friendship, feeds a
// cat — and then publishes the field it touched. Published whole, that field
// is everything this client believes about it, and it lands on top of
// whatever anybody else did to it a moment ago: two players each setting a
// different flag in the same second left one flag set, and the owner's
// end-of-day write of the cats could undo an adoption.
//
// So a touched field is compared with the last thing the server said it was,
// and only the difference goes out: this key, this cat's hunger, this much
// more reputation. The server applies each to its own copy, in arrival order,
// and two people changing different parts of one field both get what they did.
//
// `base` is the server's last word, `ours` is the field now; both plain data.
// Returns the operations that turn one into the other.

function isPlain(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/** A list of things that each say who they are, like the cats. */
function hasIds(list) {
  if (!Array.isArray(list)) return false;
  for (let i = 0; i < list.length; i++) {
    if (!isPlain(list[i]) || list[i].id === undefined || list[i].id === null) return false;
  }
  return true;
}

export function diffOps(k, base, ours) {
  if (ours === undefined) return [];
  if (same(base, ours)) return [];
  // A tally: say how much was added, so two additions are both counted.
  if (typeof base === 'number' && typeof ours === 'number') {
    return [{ op: 'add', k, d: ours - base }];
  }
  if (isPlain(base) && isPlain(ours)) {
    const out = [];
    for (const key of Object.keys(ours)) {
      if (ours[key] !== undefined && !same(base[key], ours[key])) out.push({ op: 'put', k, key, v: ours[key] });
    }
    for (const key of Object.keys(base)) {
      if (!(key in ours) || ours[key] === undefined) out.push({ op: 'del', k, key });
    }
    return out;
  }
  if (hasIds(base) && hasIds(ours)) {
    const out = [];
    const was = new Map();
    for (const x of base) was.set(x.id, x);
    const now = new Set();
    for (const x of ours) {
      now.add(x.id);
      const old = was.get(x.id);
      if (!old) { out.push({ op: 'item', k, v: x }); continue; }
      // Only the parts of it that changed: one of you feeding a cat while the
      // other brushes it is two changes to one cat, and both should hold.
      const f = {};
      let any = false;
      for (const key of Object.keys(x)) {
        if (key !== 'id' && !same(old[key], x[key])) { f[key] = x[key] === undefined ? null : x[key]; any = true; }
      }
      if (any) out.push({ op: 'patch', k, id: x.id, f });
    }
    for (const x of base) if (!now.has(x.id)) out.push({ op: 'itemDel', k, id: x.id });
    return out;
  }
  // Nothing to tell its parts apart by, or nothing known to compare it with.
  return [{ op: 'set', k, v: ours }];
}
