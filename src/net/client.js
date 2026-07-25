// Client half of the multiplayer session.
//
// The server tells us the world seed, who else is here and where they are, and
// it owns the cafe's books: money, pantry, bag, cats, quest flags and the clock.
// We change those by sending operations and taking the server's answer as the
// truth. The game runs perfectly well with no server at all — `connect` just
// resolves false, `shared` stays false, and every op is a no-op.

const SEND_HZ = 15;
const CUST_HZ = 10;
// The server hangs up on a socket that has gone quiet, and a player choosing an
// apron colour or standing still sends nothing at all — so say hello regularly.
const PING_SECONDS = 8;
const RETRY_SECONDS = 3;

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
    // Keepalive and reconnection. On a timer rather than the frame loop: the
    // title screen, an open menu and a backgrounded tab all still need them.
    this.everConnected = false;
    this.rejoin = null;       // what to send again after a drop
    this.beats = 0;
    this.retryIn = 0;
    this.reconnecting = false;
    this.keepalive = null;
    // Counters for the `?netdebug` readout. Cheap, and the difference between
    // "it feels laggy" and "we dropped nine times in a minute".
    this.debug = typeof location !== 'undefined' && location.search.includes('netdebug');
    this.rttMs = 0;
    this.lastMsgAt = 0;
    this.lastPosAt = 0;
    this.lastCustAt = 0;
    this.dropCount = 0;
    this.rejoinCount = 0;
    this.msgCount = 0;
  }

  startKeepalive() {
    if (this.keepalive || typeof setInterval !== 'function') return;
    this.keepalive = setInterval(() => this.beat(), 1000);
  }

  beat() {
    if (this.connected) {
      this.beats++;
      if (this.beats % PING_SECONDS === 0) this.send({ t: 'ping', at: Date.now() });
      return;
    }
    if (!this.everConnected || this.reconnecting) return;
    if (--this.retryIn > 0) return;
    this.retryIn = RETRY_SECONDS;
    this.reconnecting = true;
    this.connect(4000).then((ok) => {
      this.reconnecting = false;
      if (!ok) return;
      // Pick up where we left off: same name, same face, and whatever the
      // valley's books say now rather than what we remember of them.
      if (this.rejoin) {
        const j = this.rejoin;
        this.rejoinCount++;
        this.lastSent = { x: -1, y: -1, dir: '', map: '' };
        this.join(j.name, j.look, j.x, j.y, j.map);
      }
      this.emit('reconnected');
    });
  }

  /** True once we are actually playing in somebody's valley. */
  get shared() { return this.connected && this.joined; }

  /**
   * Are we the client that simulates the cafe? Alone, always. In a session,
   * only while we can actually reach the server and it has named us.
   *
   * The "while we can reach it" half matters: a client that has lost the link
   * used to fall back to true and start running its own cafe, so its customers
   * flickered between the ones it invented and the copies that arrived when it
   * got back — and both sets rang up sales against the shared till.
   */
  get simOwner() {
    if (!this.everConnected) return true;
    return this.connected && this.joined && this.owner === this.id;
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
      // Abandon whatever we were using. Without this an attempt that timed out
      // and then connected anyway would keep feeding us messages — including a
      // `welcome` carrying a different player id, which is enough to make us
      // ignore the real other player and think we run the cafe.
      const old = this.ws;
      if (old && old !== ws) { try { old.close(); } catch { /* already gone */ } }
      this.ws = ws;

      ws.onmessage = (ev) => {
        if (this.ws !== ws) return;            // a socket we have moved on from
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        this.receive(msg);
        if (msg.t === 'welcome') { clearTimeout(timer); done(true); }
      };
      ws.onerror = () => { clearTimeout(timer); done(false); };
      ws.onclose = () => {
        if (this.ws !== ws) return;            // an older socket finally closing
        const wasConnected = this.connected;
        this.connected = false;
        this.joined = false;
        this.owner = null;
        this.remotes.clear();
        this.retryIn = 1;
        if (wasConnected) { this.dropCount++; this.emit('disconnected'); }
      };
    });
  }

  receive(msg) {
    this.msgCount++;
    this.lastMsgAt = performance.now();
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
        this.everConnected = true;
        this.startKeepalive();
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
        // Keep our copy of the books current even while we're still reading the
        // title screen: whoever starts later adopts this, and a snapshot frozen
        // at connect time would undo everything that happened since.
        if (this.world) this.world[msg.k] = msg.v;
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
        this.lastCustAt = performance.now();
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
      // The periodic restatement of who is here. Reconciled rather than
      // replaced, so it can repair a missed arrival without throwing away
      // positions that are fresher than this list.
      case 'who': {
        const here = new Set();
        for (const info of msg.p || []) {
          here.add(info.id);
          const cur = this.remotes.get(info.id);
          if (!cur) this.remotes.set(info.id, { ...info });
          else if (info.n) { cur.n = info.n; cur.look = info.look || cur.look; }
        }
        for (const id of [...this.remotes.keys()]) if (!here.has(id)) this.remotes.delete(id);
        this.emit('roster');
        break;
      }
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
        this.lastPosAt = performance.now();
        for (const [id, x, y, dir, frame, map] of msg.p) {
          if (id === this.id) continue;
          const r = this.remotes.get(id);
          if (r) { r.x = x; r.y = y; r.dir = dir; r.frame = frame; r.map = map; }
        }
        this.emit('pos');
        break;
      case 'pong':
        if (msg.at) this.rttMs = Math.round(Date.now() - msg.at);
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
    this.rejoin = { name, look, x, y, map };
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

  /**
   * Owner only: publish the customers, throttled, so the others can draw them.
   * Skipped when nobody else is in the room to draw them — ten messages a
   * second for an audience of nobody is the bulk of a quiet session's traffic.
   */
  sendCustomers(dt, customers, audience) {
    if (!this.shared || !this.simOwner || !audience) return;
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
    if (this.rejoin) { this.rejoin.x = x; this.rejoin.y = y; this.rejoin.map = mapId; }
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
