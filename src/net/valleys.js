// Valleys on the public server, from the browser's side: the ones this device
// has been in, getting into a new one, and the creator's revoke button.
//
// There are no accounts. A valley's invite code is how you get in the first
// time; the server answers with a device key, and the key is what this device
// keeps (in localStorage) to come back. The device that made a valley holds the
// creator key, which is also the only one that can send everybody else away
// (which changes the code too). On the LAN none of this is used.

const LIST_KEY = 'catcafe.valleys';

/** Everything this device remembers: [{ id, key, code, cafe, creator, at }]. */
export function deviceValleys() {
  try {
    const list = JSON.parse(localStorage.getItem(LIST_KEY) || '[]');
    return Array.isArray(list) ? list.filter((v) => v && v.id && v.key) : [];
  } catch { return []; }
}

function saveDeviceValleys(list) {
  try { localStorage.setItem(LIST_KEY, JSON.stringify(list)); } catch { /* private mode: this visit only */ }
}

/** Add or update one valley in this device's list, most recent first. */
export function rememberValley(v) {
  const list = deviceValleys().filter((x) => x.id !== v.id);
  const old = deviceValleys().find((x) => x.id === v.id) || {};
  // A creator key is never swapped for a member one: joining with the code from
  // the creator's own device must not cost them their buttons.
  const keep = old.creator && !v.creator ? { key: old.key, creator: true } : {};
  list.unshift({ ...old, ...v, ...keep, at: Date.now() });
  saveDeviceValleys(list);
  return list[0];
}

/** This device stops listing a valley. The valley itself carries on. */
export function forgetValley(id) {
  saveDeviceValleys(deviceValleys().filter((x) => x.id !== id));
}

export const findValley = (id) => deviceValleys().find((v) => v.id === id) || null;
export const findValleyByCode = (code) => deviceValleys().find((v) => v.code === code) || null;

/** The link to give people. */
export const inviteLink = (code) => `${location.origin}/v/${code}`;

/**
 * An invite this page was opened with, if any: /v/plum-otter-4271, or
 * ?v=plum-otter-4271 (the same thing, where the path can't be used). A link
 * from tools/rescue.js also ends in "creator=<valley id>.<key>" after a hash, which gives
 * this device the creator's role back.
 */
export function inviteFromAddress(loc = location) {
  const m = /^\/v\/([^/?#]+)\/?$/.exec(loc.pathname);
  const raw = m ? decodeURIComponent(m[1]) : new URLSearchParams(loc.search).get('v');
  const code = normalizeCode(raw);
  const c = /creator=([a-z0-9]{3,16})\.([\w-]+)/.exec(loc.hash || '');
  return { code, creator: c ? { id: c[1], key: c[2] } : null };
}

/** The same normalizing the server does, so a typo shows before a round trip. */
export function normalizeCode(input) {
  const parts = String(input || '').toLowerCase().match(/[a-z]+|\d+/g);
  if (!parts || parts.length !== 3) return null;
  const code = parts.join('-');
  return /^[a-z]+-[a-z]+-\d{4}$/.test(code) ? code : null;
}

async function post(path, body) {
  try {
    const res = await fetch(path, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ...data };
  } catch {
    return { ok: false, why: "Couldn't reach the valley's server. Check the connection and try again." };
  }
}

/** Make a valley. This device becomes its creator. */
export async function makeValley() {
  const r = await post('/valleys', {});
  if (r.ok) rememberValley({ id: r.id, key: r.key, code: r.code, creator: true });
  return r;
}

/**
 * Get into a valley with its invite code. A device that's already in it (by
 * that code) goes straight in with the key it has, without asking for another.
 */
export async function joinValley(code) {
  const known = findValleyByCode(code);
  if (known) return { ok: true, ...known };
  const r = await post('/valleys/join', { code });
  if (r.ok) rememberValley({ id: r.id, key: r.key, code: r.code, creator: false });
  return r;
}

/**
 * A valley this device made but never got as far as opening: whoever made it
 * backed out of choosing their look, or closed the tab. Nobody has seen its
 * link, so as far as anybody's concerned it doesn't exist yet, and it isn't
 * listed. (The server lets an unstarted valley go after a week.)
 */
export const unopened = (v) => !!(v && v.creator && !v.welcomed);

/**
 * Fresh details of this device's valleys for the title screen: the cafe's
 * name, the day, who's in, and the current code. A valley the server no longer
 * lets this key into comes back `gone`. One this device made and never opened
 * is forgotten, unless the server says it's been started after all.
 */
export async function refreshValleys() {
  const list = deviceValleys();
  if (!list.length) return [];
  const r = await post('/valleys/mine', { valleys: list.map(({ id, key }) => ({ id, key })) });
  if (!r.ok || !Array.isArray(r.valleys)) return list.map((v) => ({ ...v, offline: true }));
  const byId = new Map(r.valleys.map((x) => [x.id, x]));
  const dropped = new Set();
  const out = [];
  for (const v of list) {
    const s = byId.get(v.id);
    if (!s) { out.push({ ...v, offline: true }); continue; }
    if (s.gone) { out.push({ ...v, gone: true }); continue; }
    const now = { ...v, ...s, key: v.key, creator: !!s.creator };
    if (now.started) now.welcomed = true;
    if (unopened(now)) { dropped.add(v.id); continue; }
    out.push(now);
  }
  // Keep what we learned (the cafe's name, the latest code) for next time. Into
  // the list as it is now, not as it was when we asked: a valley made or joined
  // while the answer was on its way must not be written out of it.
  const fresh = new Map(out.map((v) => [v.id, v]));
  saveDeviceValleys(deviceValleys().filter((v) => !dropped.has(v.id))
    .map((v) => fresh.get(v.id) || v)
    .map(({ id, key, code, cafe, creator, at, welcomed }) => ({ id, key, code, cafe, creator, at, welcomed })));
  return out;
}

/** Creator only: everyone else's access ends, and there's a new code. */
export async function revokeOthers(v) {
  const r = await post(`/valleys/${v.id}/revoke`, { key: v.key });
  if (r.ok) rememberValley({ ...v, code: r.code });
  return r;
}

// ---------------------------------------------------------------------------
// This device's own valley, and what it knows about the site
// ---------------------------------------------------------------------------

const LOCAL_SEED_KEY = 'catcafe.localSeed';
const PUBLIC_SITE_KEY = 'catcafe.publicSite';
const TIP_KEY = 'catcafe.homeScreenTip';

/**
 * The seed of the valley kept on this device, which plays with no connection
 * and is nobody else's. Each device gets its own. A device that already has a
 * single-player save from before this (always the same seed, `legacySeed`)
 * keeps that valley rather than losing it.
 */
export function localValleySeed(legacySeed, hasSaveFor) {
  try {
    const saved = Number(localStorage.getItem(LOCAL_SEED_KEY));
    if (Number.isInteger(saved) && saved > 0) return saved;
  } catch { /* no storage: a fresh one each visit */ }
  const seed = hasSaveFor(legacySeed) ? legacySeed : 1 + Math.floor(Math.random() * (2 ** 31 - 2));
  try { localStorage.setItem(LOCAL_SEED_KEY, String(seed)); } catch { /* this visit only */ }
  return seed;
}

/**
 * Has this device played on the public server? If so, opening the game with no
 * connection shows its valleys (and the one it can play offline) rather than
 * dropping straight into single player as an unconnected LAN game would.
 */
export function markPublicSite() { try { localStorage.setItem(PUBLIC_SITE_KEY, '1'); } catch { /* fine */ } }
export function wasPublicSite() { try { return localStorage.getItem(PUBLIC_SITE_KEY) === '1'; } catch { return false; } }

/**
 * Should we suggest adding the game to the Home Screen? Only on an iPhone or
 * iPad, only in Safari rather than the Home Screen app itself, and only once:
 * Safari clears a website's storage after a week without a visit, and this
 * device's list of valleys lives there, but a Home Screen app's doesn't.
 */
export function homeScreenTipDue() {
  try {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = navigator.standalone === true
      || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    if (!ios || standalone || localStorage.getItem(TIP_KEY)) return false;
    localStorage.setItem(TIP_KEY, '1');
    return true;
  } catch { return false; }
}
