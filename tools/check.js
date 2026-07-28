// Headless smoke test. Launches Chrome, drives the game through a scenario in
// tools/harness.html, reports console errors and writes a screenshot.
//
//   node tools/check.js [scenario...] [--shot path.png] [--ms 6000]
//   node tools/check.js quests            # a named group, see GROUPS
//   node tools/check.js all               # everything that runs unattended
//
// Scenarios live in harness.html. Each one signals `window.__done` when it has
// finished, and the runner moves on the moment it sees that — the times in
// BUDGET below are ceilings, not waits, so a scenario only costs what it
// actually needs. Pass --ms to override the ceiling for everything.

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const CHROME = process.env.CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333 + (process.pid % 200);
const BASE = process.env.BASE || 'http://localhost:8080';

const args = process.argv.slice(2);
const flagsWithValue = new Set(['--shot', '--ms', '--url', '--eval', '--shotdir', '--mobile', '--hold', '--game']);
const named = args.filter((a, i) => !a.startsWith('--') && !flagsWithValue.has(args[i - 1]));
if (!named.length) named.push('walk');
const shotIdx = args.indexOf('--shot');
const shot = shotIdx >= 0 ? args[shotIdx + 1] : null;
const msIdx = args.indexOf('--ms');
const forcedMs = msIdx >= 0 ? Number(args[msIdx + 1]) : null;
const hideOut = args.includes('--clean');
// Stay open this long after the scenario reports. Only the first half of a
// paired run needs it: the other browser has to still be there to be seen, and
// now that a run ends the moment it is done, it otherwise wouldn't be.
const holdIdx = args.indexOf('--hold');
const holdMs = holdIdx >= 0 ? Number(args[holdIdx + 1]) : 0;

// How long each scenario may take before we give up on it. Only the slow ones
// need saying: anything absent gets DEFAULT_MS. These are generous — a ceiling
// that is hit means something has hung, and a scenario that finishes in two
// seconds costs two seconds whatever it says here.
const DEFAULT_MS = 9000;
const DEFAULT_GAME = '001';
const BUDGET = {
  // Cutscenes and long walks run in real time and can't be hurried.
  taxi: 22000,
  sleep: 20000,
  door: 20000,
  ghostquest: 42000,
  deliverquest: 26000,
  wishlist: 30000,
  furncustomers: 24000,
  employee: 26000,
  furnkeys: 14000,
  nightfolk: 18000,
  ghoststuck: 22000,
  // Deliberately longer than any idle timeout, which is the point of them.
  netidle: 60000,
  netidletitle: 58000,
  netping: 68000,
  netmute: 84000,
  netpollquiet: 84000,
  netdrop: 26000,
  netfallback: 42000,
  netforget: 26000,
  netpollbooks: 24000,
  netbooks: 20000,
  netclock: 16000,
  netmapplayers: 20000,
  nettitleme: 18000,
  netlobby: 26000,
  netlobbydel: 30000,
  netlobbyone: 14000,
  barrierreach: 16000,
  netgameone: 20000,
  netgametwo: 18000,
  titleme: 20000,
  netlivesave: 22000,
  weather: 16000,
  weathercafe: 9000,
  hourly: 9000,
  signs: 6000,
  signkeys: 6000,
  patio: 9000,
  deaditems: 9000,
  booktabs: 16000,
  wagekeys: 16000,
  patiorain: 16000,
  pickupmobile: 12000,
  bigpieces: 16000,
  bigshot: 9000,
  clearnight: 12000,
  glyphsheet: 6000,
  questchain: 9000,
  logbook: 12000,
  regular: 20000,
  regularshot: 14000,
  patioshot: 12000,
  skyshot: 6000,
  // Halves of a pair: they wait for the other browser to turn up.
  netwalkhost: 62000,
  netwalkguest: 58000,
  nettitlehost: 64000,
  nettitleguest: 62000,
  netcafehost: 32000,
  netcafeguest: 28000,
  netquesthost: 26000,
  netquestguest: 24000,
  netfound: 20000,
  netguest: 12000,
  netcreatetitle: 14000,
};

// Named sets, so a change can be checked against the things it could plausibly
// have broken without running everything. `all` is what to run before a commit.
const GROUPS = {
  quests: ['ghostquest', 'deliverquest', 'journalstep', 'questrepair', 'ghoststuck',
    'barriers', 'nightfolk', 'nightplaces', 'questchain', 'logbook', 'regular'],
  cafe: ['cafe', 'wishlist', 'summarylines', 'promptlook', 'treats', 'furncustomers', 'employee',
    'weathercafe', 'hourly'],
  world: ['walk', 'town', 'coast', 'shore', 'night', 'map', 'door', 'nightplaces',
    'barriers', 'eastpass', 'barrierreach', 'passcleared', 'debugpos', 'weather'],
  ui: ['menus', 'build', 'furnish', 'furnkeys', 'furnshop', 'shop', 'exterior',
    'summarylines', 'journalstep', 'titleme', 'signkeys', 'patio', 'deaditems', 'booktabs', 'bigpieces', 'clearnight', 'wagekeys', 'patiorain'],
  cutscene: ['taxi', 'sleep', 'door'],
  mobile: ['tabmobile', 'runmobile', 'pausemobile', 'dialogmobile', 'pickupmobile'],
  // Single-process networked runs. The paired ones need two browsers at once
  // and are listed in the README rather than here.
  net: ['net', 'netmobile', 'netbooks', 'netclock', 'netdrop', 'netforget',
    'netpollbooks', 'netfallback', 'netmapplayers', 'netlobby', 'netlobbydel', 'netlobbyone', 'solo'],
  slow: ['netidle', 'netping', 'netmute', 'netpollquiet', 'netidletitle'],
};
GROUPS.all = [...new Set([
  ...GROUPS.world, ...GROUPS.ui, ...GROUPS.cafe, ...GROUPS.quests,
  ...GROUPS.cutscene, ...GROUPS.mobile, ...GROUPS.net,
])];

/** Expand any group names given on the command line. */
const scenarios = [...new Set(named.flatMap((n) => GROUPS[n] || [n]))];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--disable-gpu',
    // Without these, Chrome throttles a page it believes nobody is looking at:
    // timers stop firing, rAF stops, and a scenario that takes seven seconds
    // sits there for seventeen minutes before finishing. It lands on a
    // different scenario every run and each one passes alone, which makes it
    // look like a flaky test rather than a sleeping browser.
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
    '--no-sandbox',
    '--no-first-run',
    '--hide-scrollbars',
    '--mute-audio',
    '--window-size=1480,860',
    '--user-data-dir=' + `/tmp/catcafe-chrome-${process.pid}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(150);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
  }
  if (!wsUrl) { chrome.kill(); throw new Error('Chrome did not start'); }

  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

  let msgId = 0;
  const pending = new Map();
  const problems = [];

  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      problems.push(`EXCEPTION: ${d.exception?.description || d.text} (${d.url || ''}:${d.lineNumber})`);
    }
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
      const text = m.params.args.map((a) => a.description || a.value).join(' ');
      problems.push(`${m.params.type.toUpperCase()}: ${text}`);
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      problems.push(`LOG: ${m.params.entry.text} ${m.params.entry.url || ''}`);
    }
    if (m.method === 'Debugger.paused') {
      // Interrupting a wedged page tells us exactly where it is stuck.
      const frames = (m.params.callFrames || []).slice(0, 10)
        .map((f) => `      at ${f.functionName || '(anon)'} ${(f.url || `script#${f.location.scriptId}`).replace(BASE, '')}:${f.location.lineNumber + 1}:${f.location.columnNumber}`);
      problems.push('STACK WHILE STUCK:\n' + frames.join('\n'));
    }
  };

  // A watchdog matters here: if the page wedges in an infinite loop, CDP calls
  // never come back, and without this the runner would hang silently.
  const send = (method, params = {}, timeoutMs = 15000) => new Promise((res) => {
    const id = ++msgId;
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        problems.push(`TIMEOUT: ${method} did not respond in ${timeoutMs}ms (page is probably stuck in a loop)`);
        res({});
      }
    }, timeoutMs);
    pending.set(id, (r) => { clearTimeout(timer); res(r); });
    ws.send(JSON.stringify({ id, method, params }));
  });

  // Phone emulation, so the touch layout can actually be inspected.
  const mobileIdx = args.indexOf('--mobile');
  if (mobileIdx >= 0) {
    const spec = args[mobileIdx + 1] && !args[mobileIdx + 1].startsWith('--') ? args[mobileIdx + 1] : '390x844';
    const [mw, mh] = spec.split('x').map(Number);
    await send('Emulation.setDeviceMetricsOverride', {
      width: mw, height: mh, deviceScaleFactor: 2, mobile: true,
    });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
  }

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  // Enable the debugger up front: once the main thread wedges, enabling it is
  // itself impossible, and Debugger.pause is the only way to interrupt V8.
  await send('Debugger.enable');

  const urlIdx = args.indexOf('--url');
  const evalIdx = args.indexOf('--eval');
  const expr = evalIdx >= 0 ? args[evalIdx + 1]
    : "document.getElementById('out') ? document.getElementById('out').textContent : 'no output element'";
  const shotDir = args.indexOf('--shotdir') >= 0 ? args[args.indexOf('--shotdir') + 1] : null;

  let failed = 0;
  for (const sc of scenarios) {
    problems.length = 0;
    // Title and lobby scenarios need the real screens, so they skip autostart.
    const params = [];
    if (!sc.includes('title') && !sc.includes('lobby')) params.push('autostart');
    if (hideOut) params.push('hideout');
    // Everything but the net scenarios plays alone, so runs can't see each other.
    if (!sc.startsWith('net')) params.push('solo');
    // A scenario named ...poll... runs over the HTTP transport instead of a
    // socket, which is what a machine behind a content filter ends up using.
    if (sc.includes('poll')) params.push('poll');
    // --game names one valley, for the scenarios about having several.
    const gameIdx = args.indexOf('--game');
    if (gameIdx >= 0) params.push(`game=${args[gameIdx + 1]}`);
    // Title-screen scenarios are about the title screen, so they name a valley
    // rather than being asked to pick one — otherwise they open in the lobby,
    // where nobody is connected to anything yet.
    else if (sc.includes('title')) params.push(`game=${DEFAULT_GAME}`);
    const url = urlIdx >= 0 ? args[urlIdx + 1]
      : `${BASE}/tools/harness.html${params.length ? '?' + params.join('&') : ''}#${sc}`;
    // A hard reload guarantees a clean world for each scenario.
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(120);
    await send('Page.navigate', { url });

    // Wait for the scenario to say it has finished rather than sleeping out
    // its budget. Polling costs one tiny evaluate every 250ms and saves whole
    // minutes across a sweep.
    const budget = forcedMs ?? BUDGET[sc] ?? DEFAULT_MS;
    const started = Date.now();
    let hung = false;
    for (;;) {
      await sleep(250);
      const elapsed = Date.now() - started;
      if (elapsed >= budget) { hung = true; break; }
      const done = await send('Runtime.evaluate',
        { expression: 'window.__done === true', returnByValue: true }, 4000);
      if (done.result?.value === true) break;
      // An evaluate that never comes back means the page is wedged; stop
      // asking and let the reporting below break in and get a stack.
      if (done.result === undefined && done.exceptionDetails === undefined) { hung = true; break; }
    }
    const took = Date.now() - started;
    if (holdMs > 0) await sleep(holdMs);

    const out = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, 12000);
    let summary = out.result?.value !== undefined ? String(out.result.value)
      : JSON.stringify(out.exceptionDetails || out.result || {});

    if (out.result?.value === undefined) {
      // Unresponsive: break in and grab a stack before giving up.
      ws.send(JSON.stringify({ id: ++msgId, method: 'Debugger.pause', params: {} }));
      await sleep(2500);
      summary += ' (page unresponsive)';
    }

    const target = shot || (shotDir ? `${shotDir}/${sc}.png` : null);
    if (target) {
      const cap = await send('Page.captureScreenshot', { format: 'png' });
      if (cap.data) {
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, Buffer.from(cap.data, 'base64'));
      }
    }

    const real = problems.filter((p) => !p.includes('favicon'));
    console.log(`--- ${sc} --- ${(took / 1000).toFixed(1)}s${hung ? ` (hit its ${budget / 1000}s ceiling)` : ''}`);
    console.log(summary.trim() || '(no in-page summary)');
    if (real.length) {
      console.log(`!! ${real.length} console problems:`);
      for (const p of real.slice(0, 12)) console.log('   ' + p.split('\n').slice(0, 3).join(' / '));
      failed++;
    }
    if (summary.includes('FAIL')) failed++;
  }

  ws.close();
  chrome.kill();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
