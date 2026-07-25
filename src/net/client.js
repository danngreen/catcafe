// Client half of the multiplayer session.
//
// The server tells us the world seed, who else is here and where they are, and
// it owns the cafe's books: money, pantry, bag, cats, quest flags and the clock.
// We change those by sending operations and taking the server's answer as the
// truth. The game runs perfectly well with no server at all — `connect` just
// resolves false, `shared` stays false, and every op is a no-op.

const SEND_HZ = 15;
const CUST_HZ = 10;

export class NetClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.id = null;
    this.seed = null;
    this.joined = false;
    this.remotes = new Map();     // id -> { id, name, look, x, y, dir, frame, map }
    this.handlers = {};
    this.here = 0;        // browsers attached, including any still on the title
    this.host = null;
    this.world = null;    // the shared books, as they stood when we connected
    this.clock = null;
    this.owner = null;    // whose client is running the cafe simulation
    this.sendTimer = 0;
    this.custTimer = 0;
    this.lastSent = { x: -1, y: -1, dir: '', map: '' };
  }

  /** True once we are actually playing in somebody's valley. */
  get shared() { return this.connected && this.joined; }

  /** Are we the client that simulates the cafe? Alone, we always are. */
  get simOwner() { return !this.shared || this.owner === this.id; }

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
        this.owner = null;
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
        this.here = msg.here || 1;
        this.host = location.host;
        this.world = msg.world || null;
        this.clock = msg.clock || null;
        this.owner = msg.owner || null;
        this.connected = true;
        for (const p of msg.players || []) this.remotes.set(p.id, { ...p });
        this.emit('welcome', msg);
        break;
      case 'world':
        // Somebody else opened the cafe first; theirs is the real one.
        this.world = msg.world;
        this.clock = msg.clock || null;
        this.emit('world', msg.world, msg.clock);
        break;
      case 'sync':
        this.emit('sync', msg.k, msg.v);
        break;
      case 'clock':
        this.clock = msg.c;
        this.emit('clock', this.clock);
        break;
      case 'newday':
        this.emit('newday', msg);
        break;
      case 'summary':
        this.emit('summary', msg.s);
        break;
      case 'owner':
        this.owner = msg.id;
        this.emit('owner', msg.id);
        break;
      case 'cust':
        this.emit('cust', msg.c || []);
        break;
      case 'serve':
        this.emit('serve', msg);
        break;
      case 'presence':
        this.here = msg.here || 0;
        this.playing = msg.playing || 0;
        this.emit('presence', msg);
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

  /** Change something in the shared books. Silently local when playing alone. */
  op(o) { if (this.shared) this.send({ t: 'op', ...o }); }

  /** Offer the world we just built. The server keeps only the first offer. */
  seedWorld(world, clock) { if (this.shared) this.send({ t: 'seedworld', world, clock }); }

  skipTo(hour) { if (this.shared) this.send({ t: 'skip', hour }); }

  sendSummary(s) { if (this.shared) this.send({ t: 'summary', s }); }

  /** Ask whoever runs the cafe to serve whoever is standing here. */
  askServe(x, y) { if (this.shared) this.send({ t: 'serve', x: Math.round(x), y: Math.round(y) }); }

  /** Owner only: publish the customers, throttled, so the others can draw them. */
  sendCustomers(dt, customers) {
    if (!this.shared || !this.simOwner) return;
    this.custTimer -= dt;
    if (this.custTimer > 0) return;
    this.custTimer = 1 / CUST_HZ;
    this.send({
      t: 'cust',
      c: customers.map((c) => [c.id, Math.round(c.x), Math.round(c.y), c.dir, c.frame,
        c.look, c.state, c.order || null]),
    });
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
