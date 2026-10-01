// The public server's front door: making valleys, joining one with a code, and
// the creator's two buttons. Only switched on with VALLEY_CODES=1; on the LAN
// none of these exist and the lobby lists every valley as it always has.
//
// Everything here is rate-limited by the visitor's address, because the server
// is on the open internet: a script guessing codes or making valleys in a loop
// should get nowhere and cost nothing.

import { normalizeCode, Limiter } from './access.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** At most this many people in one valley at once. */
export const MAX_PLAYERS = 16;

/**
 * The address a request came from. Caddy, in front of us on the same machine,
 * says who it was talking to in X-Forwarded-For; that header is only believed
 * from Caddy, so nobody can dodge a limit by writing their own.
 */
export function clientIp(req) {
  const remote = String(req.socket.remoteAddress || '');
  const loopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  const xff = req.headers['x-forwarded-for'];
  if (loopback && xff) return String(xff).split(',').pop().trim();
  return remote || '?';
}

/** A small JSON body, or null if it's too big or not JSON. */
export function readBody(req, max = 8192) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > max) { resolve(null); req.destroy(); }
    });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

export class PublicValleys {
  constructor(games) {
    this.games = games;
    // Making valleys: a family might make a few in an evening; a script can't
    // make thousands.
    this.makeHourly = new Limiter(5, HOUR);
    this.makeDaily = new Limiter(20, DAY);
    this.makeAll = new Limiter(200, DAY);
    // Guessing codes: a typo or two is fine, a guessing script is hopeless.
    // The overall cap stops one spread across many addresses.
    this.wrongCodes = new Limiter(20, 10 * MINUTE);
    this.wrongAll = new Limiter(1000, HOUR);
    // Everything else under /valleys.
    this.calls = new Limiter(120, MINUTE);
  }

  /**
   * Handle a /valleys request, if this is one. Returns false for any other
   * path, so the caller carries on.
   */
  async handle(req, path, json) {
    if (!path.startsWith('/valleys')) return false;
    const ip = clientIp(req);
    if (req.method !== 'POST') { json({ ok: false, why: 'POST only' }, 405); return true; }
    if (!this.calls.take(ip)) { json({ ok: false, why: 'Slow down a little, then try again.' }, 429); return true; }
    const body = await readBody(req);
    if (!body || typeof body !== 'object') { json({ ok: false, why: 'bad request' }, 400); return true; }

    if (path === '/valleys') {
      if (!this.makeHourly.ok(ip) || !this.makeDaily.ok(ip) || !this.makeAll.ok('all')) {
        json({ ok: false, why: "You've made a lot of valleys today. Try again later." }, 429);
        return true;
      }
      this.makeHourly.hit(ip); this.makeDaily.hit(ip); this.makeAll.hit('all');
      const made = this.games.createPublic();
      console.log(`[valleys] new valley ${made.id} (${made.code}) from ${ip}`);
      json({ ok: true, ...made });
      return true;
    }

    if (path === '/valleys/join') {
      if (!this.wrongCodes.ok(ip) || !this.wrongAll.ok('all')) {
        json({ ok: false, why: 'Too many codes that didn\'t match. Wait a few minutes and try again.' }, 429);
        return true;
      }
      const code = normalizeCode(body.code);
      const got = code && this.games.join(code);
      if (!got) {
        this.wrongCodes.hit(ip); this.wrongAll.hit('all');
        json({ ok: false, why: "That code doesn't match any valley. Check it and try again." }, 404);
        return true;
      }
      console.log(`[valleys] ${ip} joined valley ${got.id}`);
      json({ ok: true, ...got });
      return true;
    }

    if (path === '/valleys/mine') {
      const list = Array.isArray(body.valleys) ? body.valleys : [];
      json({ ok: true, valleys: this.games.mine(list) });
      return true;
    }

    const m = /^\/valleys\/([a-z0-9]{3,16})\/(code|revoke)$/.exec(path);
    if (m) {
      const [, id, what] = m;
      const code = what === 'code' ? this.games.newInviteCode(id, body.key) : this.games.revoke(id, body.key);
      if (!code) { json({ ok: false, why: 'Only the person who made this valley can do that.' }, 403); return true; }
      console.log(`[valleys] valley ${id}: ${what === 'code' ? 'new invite code' : 'everyone else sent away'}`);
      json({ ok: true, code });
      return true;
    }

    json({ ok: false, why: 'not here' }, 404);
    return true;
  }
}
