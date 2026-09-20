// A session connection made of ordinary HTTP requests.
//
// Some machines can't hold a WebSocket open. macOS Screen Time's Content &
// Privacy filter is the one that prompted this: it inspects traffic, lets the
// upgrade through, and then tears the connection down a few seconds later — so
// the game connects, works briefly, drops, reconnects, and round it goes. The
// same filter has no quarrel with short HTTP requests, which is how the game
// itself is being served.
//
// So this offers the room exactly the interface a socket does, and carries the
// same messages over a POST every hundred milliseconds. Higher latency and
// chattier, but on a LAN it plays perfectly well — and it works on a machine
// with parental controls left on, which is the point.

import { randomUUID } from 'node:crypto';

export class PollConn {
  constructor(onGone) {
    this.id = randomUUID().slice(0, 8);
    this.open = true;
    this.handlers = { message: [], close: [] };
    // Messages the client has not yet said it has. Kept until it does, not
    // until they are sent: a reply can be lost on the way back, and a `sync`
    // or an `owner` that went with it used to be gone for good — after which
    // that player's books quietly disagreed with everybody else's.
    this.out = [];
    this.outFirst = 0;              // the number of out[0]
    this.recvNext = 0;              // the number of the next message we expect
    this.lastActivity = Date.now();
    this.onGone = onGone;
    // A poll connection is proved alive ten times a second, so silence means
    // something quite different here than on a socket: the minute a socket is
    // given is a minute of somebody standing in the room who has gone. A tab
    // that was only asleep reconnects and rejoins on its own.
    this.idleMs = 15_000;
  }

  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); return this; }
  emit(evt, ...args) { for (const fn of this.handlers[evt] || []) fn(...args); }

  send(text) {
    if (!this.open) return;
    this.out.push(text);
    // A client that has stopped collecting shouldn't cost us memory forever.
    if (this.out.length > 400) {
      const drop = this.out.length - 400;
      this.out.splice(0, drop);
      this.outFirst += drop;
    }
  }

  sendJSON(obj) { this.send(JSON.stringify(obj)); }

  /** The poll itself is the proof of life, so there's nothing to ask. */
  ping() {}

  /** Called by the request handler: hand over everything, and forget it. */
  drain() {
    const out = this.out;
    this.outFirst += out.length;
    this.out = [];
    return out;
  }

  /** The client has everything before `n`, so that much can go. */
  acked(n) {
    const drop = Math.min(this.out.length, Math.max(0, n - this.outFirst));
    if (!drop) return;
    this.out.splice(0, drop);
    this.outFirst += drop;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.emit('close');
    this.onGone?.(this);
  }

  fail() { this.close(); }
}

/** All the polling connections, kept alive by being polled. */
export class PollHub {
  constructor() {
    this.conns = new Map();
  }

  /**
   * Handle one poll. Returns what to send back; creates the connection (and
   * hands it to the room) the first time a client asks without an id.
   */
  handle(body, attach) {
    let conn = body.id ? this.conns.get(body.id) : null;
    // Asking for a connection we don't have: it timed out while the tab was
    // asleep, or the server was restarted. Say so. Quietly starting a new one
    // under the same client left it believing it was still in the valley when
    // the room had never heard of it — walking about and spending money,
    // invisible to everybody. Told it is gone, it reconnects and rejoins.
    if (body.id && !conn && !body.bye) return { id: body.id, gone: true, msgs: [] };
    // A client on its way out says so, since there is no socket to close and
    // nothing else would tell the room for a whole minute.
    if (body.bye) {
      if (conn) { conn.leftOnPurpose = true; conn.close(); }
      return { id: body.id, msgs: [] };
    }
    if (!conn) {
      conn = new PollConn((c) => this.conns.delete(c.id));
      this.conns.set(conn.id, conn);
      attach(conn);                 // room sends `welcome` into conn.out
    }
    conn.lastActivity = Date.now();
    const msgs = Array.isArray(body.msgs) ? body.msgs : [];
    // A client from before messages were numbered: everything once, as it was.
    if (!Number.isFinite(body.first) || !Number.isFinite(body.ack)) {
      for (const text of msgs) if (typeof text === 'string') conn.emit('message', text);
      return { id: conn.id, msgs: conn.drain() };
    }
    // The client repeats whatever it hasn't heard we received, so a request
    // whose reply went missing arrives again. Anything numbered below what
    // we're expecting has been dealt with: spending the same money twice is
    // exactly what this is here to prevent.
    for (let i = 0; i < msgs.length; i++) {
      const n = body.first + i;
      if (n < conn.recvNext) continue;
      conn.recvNext = n + 1;
      if (typeof msgs[i] === 'string') conn.emit('message', msgs[i]);
      if (!conn.open) break;               // that message got us hung up on
    }
    conn.acked(body.ack);
    return { id: conn.id, got: conn.recvNext, first: conn.outFirst, msgs: conn.out.slice() };
  }
}
