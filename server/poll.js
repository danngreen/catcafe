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
    this.out = [];                  // messages waiting for the next poll
    this.lastActivity = Date.now();
    this.onGone = onGone;
  }

  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); return this; }
  emit(evt, ...args) { for (const fn of this.handlers[evt] || []) fn(...args); }

  send(text) {
    if (!this.open) return;
    this.out.push(text);
    // A client that has stopped collecting shouldn't cost us memory forever.
    if (this.out.length > 400) this.out.splice(0, this.out.length - 400);
  }

  sendJSON(obj) { this.send(JSON.stringify(obj)); }

  /** The poll itself is the proof of life, so there's nothing to ask. */
  ping() {}

  /** Called by the request handler: hand over what's waiting. */
  drain() {
    const out = this.out;
    this.out = [];
    return out;
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
    if (!conn) {
      conn = new PollConn((c) => this.conns.delete(c.id));
      this.conns.set(conn.id, conn);
      attach(conn);                 // room sends `welcome` into conn.out
    }
    conn.lastActivity = Date.now();
    for (const text of body.msgs || []) {
      if (typeof text === 'string') conn.emit('message', text);
    }
    return { id: conn.id, msgs: conn.drain() };
  }
}
