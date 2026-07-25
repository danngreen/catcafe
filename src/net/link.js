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
const POLL_GIVE_UP = 25;        // consecutive failures before we call it dead

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
    this.outbox = [];
    this.dead = false;
    this.busy = false;
    this.fails = 0;
    this.timer = setInterval(() => this.tick(), POLL_MS);
    this.tick();
  }

  send(text) { this.outbox.push(text); }

  async tick() {
    if (this.dead || this.busy) return;
    this.busy = true;
    // Take the outbox now; if the request fails they go back on the front so
    // nothing is lost to one bad moment.
    const msgs = this.outbox;
    this.outbox = [];
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: this.id, msgs }),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.id = data.id;
      this.fails = 0;
      if (!this.dead) for (const m of data.msgs || []) this.h.message(m);
    } catch {
      this.outbox = msgs.concat(this.outbox);
      if (++this.fails >= POLL_GIVE_UP) this.die();
    } finally {
      this.busy = false;
    }
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    clearInterval(this.timer);
    this.h.close();
  }

  close() {
    this.dead = true;
    clearInterval(this.timer);
  }
}
