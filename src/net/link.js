// The two ways of talking to the session.
//
// A WebSocket is the good one: instant, cheap, and what you'd always choose.
// But some machines can't keep one open — macOS Screen Time's Content &
// Privacy filter, for one, lets the connection up and then quietly kills it a
// few seconds later, over and over. Those machines are perfectly happy with
// ordinary HTTP requests, since that's how they loaded the game in the first
// place, so PollLink carries the same messages over a POST ten times a second.
//
// Both present the same three things to NetClient: send(text), close(), and a
// pair of callbacks. Nothing above here knows or cares which one is in use.

const POLL_MS = 100;
// A request that hasn't answered by now isn't going to, and nothing else can be
// sent until it is given up on.
const POLL_TIMEOUT_MS = 4000;
// This long with no answer at all and the link is dead. By time rather than by
// count: a refused connection fails in a millisecond and a black hole takes the
// whole timeout, and both should be given the same chance.
const POLL_GIVE_UP_MS = 10000;

export class WsLink {
  constructor(url, h) {
    this.kind = 'ws';
    this.dead = false;
    this.h = h;
    this.ws = new WebSocket(url);
    this.ws.onmessage = (ev) => { if (!this.dead) h.message(ev.data); };
    this.ws.onerror = () => this.die();
    this.ws.onclose = () => this.die();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.h.close();
  }

  send(text) {
    try {
      if (this.ws.readyState === 1) this.ws.send(text);
    } catch { this.die(); }
  }

  close() {
    this.dead = true;                       // no callback: we asked for this
    try { this.ws.close(); } catch { /* already gone */ }
  }
}

export class PollLink {
  constructor(url, h) {
    this.kind = 'poll';
    this.url = url;
    this.h = h;
    this.id = null;
    // Everything the server hasn't said it has. Each message has a number —
    // outFirst is the number of outbox[0] — and the whole lot is sent every
    // time, so a request that fails, or works but loses its reply, costs
    // nothing: the server skips what it has already seen.
    this.outbox = [];
    this.outFirst = 0;
    this.inNext = 0;                // the number of the next message we expect
    this.dead = false;
    this.busy = false;
    this.lastOk = Date.now();
    this.timer = setInterval(() => this.tick(), POLL_MS);
    this.tick();
  }

  send(text) { this.outbox.push(text); }

  async tick() {
    if (this.dead || this.busy) return;
    this.busy = true;
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ac ? setTimeout(() => ac.abort(), POLL_TIMEOUT_MS) : null;
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: this.id, first: this.outFirst, ack: this.inNext, msgs: this.outbox.slice(),
        }),
        cache: 'no-store',
        signal: ac ? ac.signal : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (this.dead) return;
      // The server has no such connection: we slept through its timeout, or it
      // was restarted. This link is over; NetClient opens another and rejoins.
      if (data.gone) { this.die(); return; }
      this.id = data.id;
      this.lastOk = Date.now();
      this.receive(data);
    } catch {
      if (Date.now() - this.lastOk >= POLL_GIVE_UP_MS) this.die();
    } finally {
      if (timer) clearTimeout(timer);
      this.busy = false;
    }
  }

  receive(data) {
    // What the server has had from us can go.
    if (typeof data.got === 'number') {
      const drop = Math.min(this.outbox.length, Math.max(0, data.got - this.outFirst));
      this.outbox.splice(0, drop);
      this.outFirst += drop;
    } else {
      // A server from before messages were numbered took all of it.
      this.outFirst += this.outbox.length;
      this.outbox = [];
    }
    // It repeats whatever we haven't acknowledged, so skip what we've had.
    const msgs = data.msgs || [];
    const first = typeof data.first === 'number' ? data.first : this.inNext;
    for (let i = 0; i < msgs.length; i++) {
      const n = first + i;
      if (n < this.inNext) continue;
      this.inNext = n + 1;
      if (this.dead) return;
      this.h.message(msgs[i]);
    }
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    clearInterval(this.timer);
    this.h.close();
  }

  /**
   * Say goodbye. A socket closing is something the server can see; a client
   * that simply stops polling is not, so without this the room keeps you in it
   * until you time out — and somebody who left and came back stood next to a
   * copy of themselves wearing their own name.
   *
   * keepalive, because this is sent on the way to a reload: an ordinary fetch
   * is cancelled when the page goes away, which is exactly when it matters.
   */
  close() {
    this.dead = true;
    clearInterval(this.timer);
    if (!this.id) return;
    try {
      fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: this.id, bye: true }),
        cache: 'no-store',
        keepalive: true,
      }).catch(() => { /* leaving anyway */ });
    } catch { /* leaving anyway */ }
  }
}
