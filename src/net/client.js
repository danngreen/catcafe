// Client half of the multiplayer session.
//
// Phase 1: the server tells us the world seed and who else is here, and relays
// where everyone is standing. Everything else is still local to each client.
// The game runs perfectly well with no server at all — `connect` just resolves
// false and nothing else changes.

const SEND_HZ = 15;

export class NetClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.id = null;
    this.seed = null;
    this.joined = false;
    this.remotes = new Map();     // id -> { id, name, look, x, y, dir, frame, map }
    this.handlers = {};
    this.sendTimer = 0;
    this.lastSent = { x: -1, y: -1, dir: '', map: '' };
  }

  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); return this; }
  emit(evt, ...a) { for (const fn of this.handlers[evt] || []) fn(...a); }

  /** URL of the session on whatever host served the page. */
  static url() {
    // `?solo` plays alone even when a session is available on the host.
    if (location.search.includes('solo')) return null;
    if (!location.host) return null;                 // opened from file://
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  /**
   * Try to join. Resolves true once the server has sent us a seed, false if
   * there's no server or it doesn't answer in time — solo play either way.
   */
  connect(timeoutMs = 1500) {
    const url = NetClient.url();
    if (!url || typeof WebSocket === 'undefined') return Promise.resolve(false);
    return new Promise((resolve) => {
      let settled = false;
      const done = (ok) => { if (!settled) { settled = true; resolve(ok); } };
      const timer = setTimeout(() => { done(false); }, timeoutMs);

      let ws;
      try { ws = new WebSocket(url); } catch { clearTimeout(timer); return done(false); }
      this.ws = ws;

      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        this.receive(msg);
        if (msg.t === 'welcome') { clearTimeout(timer); done(true); }
      };
      ws.onerror = () => { clearTimeout(timer); done(false); };
      ws.onclose = () => {
        this.connected = false;
        this.joined = false;
        this.remotes.clear();
        this.emit('disconnected');
      };
    });
  }

  receive(msg) {
    switch (msg.t) {
      case 'welcome':
        this.id = msg.id;
        this.seed = msg.seed;
        this.connected = true;
        for (const p of msg.players || []) this.remotes.set(p.id, { ...p });
        this.emit('welcome', msg);
        break;
      case 'roster':
        this.remotes.clear();
        for (const p of msg.players || []) this.remotes.set(p.id, { ...p });
        this.emit('roster');
        break;
      case 'joined':
        this.remotes.set(msg.p.id, { ...msg.p });
        this.emit('joined', msg.p);
        break;
      case 'left': {
        const gone = this.remotes.get(msg.id);
        this.remotes.delete(msg.id);
        if (gone) this.emit('left', gone);
        break;
      }
      case 'pos':
        for (const [id, x, y, dir, frame, map] of msg.p) {
          if (id === this.id) continue;
          const r = this.remotes.get(id);
          if (r) { r.x = x; r.y = y; r.dir = dir; r.frame = frame; r.map = map; }
        }
        this.emit('pos');
        break;
      default:
        break;
    }
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  join(name, look, x, y, map) {
    if (!this.connected) return;
    this.joined = true;
    this.send({ t: 'join', name, look, x: Math.round(x), y: Math.round(y), map });
  }

  /** Called every frame; throttles to SEND_HZ and skips when nothing moved. */
  update(dt, player, mapId) {
    if (!this.joined) return;
    this.sendTimer -= dt;
    if (this.sendTimer > 0) return;
    this.sendTimer = 1 / SEND_HZ;
    const x = Math.round(player.x), y = Math.round(player.y);
    const last = this.lastSent;
    if (x === last.x && y === last.y && player.dir === last.dir && mapId === last.map) return;
    this.lastSent = { x, y, dir: player.dir, map: mapId };
    this.send({ t: 'move', x, y, dir: player.dir, frame: player.frame, map: mapId });
  }

  /** Everyone else currently standing in the same room as us. */
  onMap(mapId) {
    const out = [];
    for (const r of this.remotes.values()) if (r.map === mapId) out.push(r);
    return out;
  }

  get count() { return this.remotes.size + (this.joined ? 1 : 0); }
}

export const net = new NetClient();
