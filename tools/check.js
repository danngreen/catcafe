// Headless smoke test. Launches Chrome, drives the game through a scenario in
// tools/harness.html, reports console errors and writes a screenshot.
//
//   node tools/check.js [scenario] [--shot path.png] [--ms 6000]
//
// Scenarios live in harness.html: walk, cafe, build, shop, town, coast, night, map.

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const CHROME = process.env.CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333 + (process.pid % 200);
const BASE = process.env.BASE || 'http://localhost:8080';

const args = process.argv.slice(2);
const flagsWithValue = new Set(['--shot', '--ms', '--url', '--eval', '--shotdir']);
const scenarios = args.filter((a, i) => !a.startsWith('--') && !flagsWithValue.has(args[i - 1]));
if (!scenarios.length) scenarios.push('walk');
const shotIdx = args.indexOf('--shot');
const shot = shotIdx >= 0 ? args[shotIdx + 1] : null;
const msIdx = args.indexOf('--ms');
const runMs = msIdx >= 0 ? Number(args[msIdx + 1]) : 7000;
const hideOut = args.includes('--clean');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--disable-gpu',
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
    const url = urlIdx >= 0 ? args[urlIdx + 1]
      : `${BASE}/tools/harness.html?autostart${hideOut ? '&hideout' : ''}#${sc}`;
    // A hard reload guarantees a clean world for each scenario.
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(120);
    await send('Page.navigate', { url });
    await sleep(runMs);

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
    console.log(`--- ${sc} ---`);
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
