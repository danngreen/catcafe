// Settings that belong to the machine rather than to the valley.
//
// Volumes are per player and per phone; so is whether the effects are worth
// the frames. None of it goes in the save — a save is shared between everyone
// in a co-op valley, and one player's old laptop is nobody else's business.

const KEY = 'catcafe.settings.v1';

const DEFAULTS = {
  // Fewer moving parts, for machines that cannot afford them: still water,
  // no rain or snow falling, no cloud shadows crossing the fields. The
  // weather still changes and still colours the light — what goes is the
  // per-pixel drawing, which is the part that costs.
  lowFx: false,
};

let cache = null;

function load() {
  if (cache) return cache;
  cache = { ...DEFAULTS };
  try {
    Object.assign(cache, JSON.parse(localStorage.getItem(KEY)) || {});
  } catch { /* private mode, or nothing saved yet */ }
  return cache;
}

export function setting(name) { return load()[name]; }

export function setSetting(name, value) {
  load()[name] = value;
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* nothing to be done */ }
  return value;
}

export function toggleSetting(name) { return setSetting(name, !setting(name)); }
