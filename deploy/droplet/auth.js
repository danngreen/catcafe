// A password wall for games on a public server.
//
// Caddy asks this, before every request, whether the visitor has signed in
// (`forward_auth` to /check). The answer is a cookie: sign in once on a phone,
// iPad or laptop and it stays signed in, because the cookie lasts as long as a
// browser allows (400 days) and is quietly renewed whenever you come back. So
// in practice a device that plays even occasionally never sees this page twice.
//
// Nothing about the games knows this exists. The house server on the LAN runs
// the same code with no wall in front of it at all.
//
// Two ways in:
//   - the password, typed once per device (a password manager or iCloud
//     Keychain will offer to save it, which the form is set up for), and
//   - an invite link, /login?key=..., which signs a device in with one tap.
//     Text it to family or put it in a QR code for the kids' iPads.
//
// Changing AUTH_SECRET signs everybody out. Changing AUTH_INVITE retires the
// old link without touching anyone already signed in.
//
// Environment (setup writes these into /etc/games-auth.env):
//   AUTH_SECRET         signs the cookie; long and random
//   AUTH_PASSWORD_HASH  from `node auth.js hash` — the password is never stored
//   AUTH_INVITE         the key in invite links; empty turns links off
//   AUTH_COOKIE_DOMAIN  optional, e.g. .games.example.com, so one sign-in covers
//                       every game on a subdomain of it
//   AUTH_TITLE          what the sign-in page calls the place (default "Games")
//   AUTH_PORT           default 9000, always on loopback
//
// Zero dependencies, like the game server.

import { createServer } from 'node:http';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// `node auth.js hash` reads a password on stdin and prints what goes in
// AUTH_PASSWORD_HASH. Setup uses it so the password never lands on disk.
if (process.argv[2] === 'hash') {
  let raw = '';
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => {
    const pw = raw.replace(/\r?\n$/, '');
    if (!pw) { console.error('auth.js hash: no password on stdin'); process.exit(1); }
    const salt = randomBytes(16);
    console.log(`scrypt:${salt.toString('base64url')}:${scryptSync(pw, salt, 32).toString('base64url')}`);
  });
} else {
  serve();
}

function serve() {
  const PORT = Number(process.env.AUTH_PORT || 9000);
  const SECRET = process.env.AUTH_SECRET || '';
  const HASH = process.env.AUTH_PASSWORD_HASH || '';
  const INVITE = process.env.AUTH_INVITE || '';
  const DOMAIN = process.env.AUTH_COOKIE_DOMAIN || '';
  const TITLE = process.env.AUTH_TITLE || 'Games';

  if (SECRET.length < 32) fail('AUTH_SECRET is missing or too short (want 32+ characters).');
  if (!/^scrypt:[\w-]+:[\w-]+$/.test(HASH) && !INVITE) {
    fail('Set AUTH_PASSWORD_HASH (node auth.js hash) or AUTH_INVITE, or nobody can get in.');
  }

  const COOKIE = 'games_auth';
  const DAY = 24 * 60 * 60;
  // Chrome refuses anything longer than 400 days, so that is the ceiling.
  const MAX_AGE = 400 * DAY;
  // Renewed on a visit once it is a month old, so it only runs out on a device
  // nobody has opened in more than a year.
  const RENEW_AFTER = 30 * DAY;
  // Anything a browser fetches without its cookies. The manifest is fetched
  // that way on purpose, and without it "Add to Home Screen" makes a plain
  // bookmark instead of the fullscreen game with its icon.
  const PUBLIC = [/^\/manifest\.webmanifest$/, /^\/icons\/[\w.-]+\.png$/, /^\/favicon\.ico$/];

  // ---------------------------------------------------------------- tokens

  const now = () => Math.floor(Date.now() / 1000);
  const sign = (issued) => createHmac('sha256', SECRET).update(`v1:${issued}`).digest('base64url');
  const same = (a, b) => {
    const x = Buffer.from(String(a)), y = Buffer.from(String(b));
    return x.length === y.length && timingSafeEqual(x, y);
  };

  function mint() { const t = now(); return `${t}.${sign(t)}`; }

  /** How old a valid token is, in seconds, or -1 for no valid token. */
  function tokenAge(req) {
    const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie || '');
    if (!m) return -1;
    const [issued, sig] = m[1].split('.');
    const t = Number(issued);
    if (!Number.isInteger(t) || !sig || !same(sig, sign(t))) return -1;
    const age = now() - t;
    return age >= -60 && age < MAX_AGE ? Math.max(0, age) : -1;
  }

  function setCookie(value, maxAge) {
    return `${COOKIE}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`
      + (DOMAIN ? `; Domain=${DOMAIN}` : '');
  }

  function passwordOk(pw) {
    const [, salt, want] = HASH.split(':');
    if (!salt || !want || typeof pw !== 'string' || !pw || pw.length > 1024) return false;
    return same(scryptSync(pw, Buffer.from(salt, 'base64url'), 32).toString('base64url'), want);
  }

  // ------------------------------------------------------------ rate limit
  //
  // Ten wrong passwords from one address and it waits a quarter of an hour.
  // With a passphrase of any length that makes guessing hopeless; it is here
  // so a bored script hammering the form gets nowhere and costs nothing.

  const FAILS = new Map();
  const WINDOW = 15 * 60 * 1000;
  const LIMIT = 10;
  function clientIp(req) {
    // Caddy is the only thing that can reach this port, and it replaces
    // X-Forwarded-For with the address it actually saw rather than trusting a
    // client's. The last entry is that address.
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim();
    return xff || req.socket.remoteAddress || '?';
  }
  function limited(ip) {
    const f = FAILS.get(ip);
    if (!f) return false;
    if (Date.now() > f.until) { FAILS.delete(ip); return false; }
    return f.count >= LIMIT;
  }
  function failed(ip) {
    const f = FAILS.get(ip);
    if (!f || Date.now() > f.until) FAILS.set(ip, { count: 1, until: Date.now() + WINDOW });
    else f.count++;
    if (FAILS.size > 10000) FAILS.clear();   // somebody is being silly; start over
  }

  // ---------------------------------------------------------------- the gate

  /** Only ever send somebody back to a path on this site. */
  function safeTo(to) {
    if (typeof to !== 'string' || !to.startsWith('/') || to.startsWith('//') || to.startsWith('/\\')) return '/';
    if (to.startsWith('/login') || to.startsWith('/logout')) return '/';
    return to.slice(0, 2048);
  }

  /**
   * The /check answer, for forward_auth. 2xx lets the request through; anything
   * else is sent to the browser as it is, so a page load gets a redirect to the
   * sign-in form and a fetch or a socket gets a plain 401.
   */
  function check(req) {
    const uri = String(req.headers['x-forwarded-uri'] || '/');
    const method = String(req.headers['x-forwarded-method'] || 'GET');
    const path = uri.split('?')[0];
    if (PUBLIC.some((re) => re.test(path))) return { status: 204 };
    const isPage = method === 'GET' && !req.headers.upgrade
      && /text\/html/.test(String(req.headers.accept || ''));
    const age = tokenAge(req);
    if (age >= 0) {
      // Renewing needs a response to the browser, which only a page load has.
      // A socket or a fetch just goes through on the old one, which is fine:
      // it has most of a year left.
      if (age > RENEW_AFTER && isPage) {
        return { status: 302, headers: { Location: `/login/renew?to=${encodeURIComponent(safeTo(uri))}` } };
      }
      return { status: 204 };
    }
    if (isPage) return { status: 302, headers: { Location: `/login?to=${encodeURIComponent(safeTo(uri))}` } };
    return { status: 401, body: 'Sign in first.\n' };
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const to = safeTo(url.searchParams.get('to') || '/');
    const send = (r) => {
      res.writeHead(r.status, { 'Cache-Control': 'no-store', ...(r.headers || {}) });
      res.end(r.body || '');
    };

    if (url.pathname === '/check') { send(check(req)); return; }

    if (url.pathname === '/login/renew') {
      if (tokenAge(req) < 0) { send({ status: 302, headers: { Location: `/login?to=${encodeURIComponent(to)}` } }); return; }
      send({ status: 302, headers: { Location: to, 'Set-Cookie': setCookie(mint(), MAX_AGE) } });
      return;
    }

    if (url.pathname === '/logout') {
      send({ status: 302, headers: { Location: '/login', 'Set-Cookie': setCookie('', 0) } });
      return;
    }

    if (url.pathname !== '/login') { send({ status: 404, body: 'Not here.\n' }); return; }

    const ip = clientIp(req);

    if (req.method === 'GET') {
      const key = url.searchParams.get('key');
      if (key) {
        if (limited(ip)) { page(res, 429, 'Too many tries. Wait a few minutes and try again.', to); return; }
        if (INVITE && same(key, INVITE)) {
          console.log(`[auth] signed in by invite link from ${ip}`);
          send({ status: 302, headers: { Location: to, 'Set-Cookie': setCookie(mint(), MAX_AGE) } });
          return;
        }
        failed(ip);
        page(res, 401, "That invite link doesn't work anymore. Ask for a new one, or type the password.", to);
        return;
      }
      // Already in: back to the game rather than a sign-in page you don't need.
      if (tokenAge(req) >= 0) { send({ status: 302, headers: { Location: to } }); return; }
      page(res, 200, '', to);
      return;
    }

    if (req.method === 'POST') {
      let raw = '';
      req.on('data', (c) => { raw += c; if (raw.length > 4096) req.destroy(); });
      req.on('end', () => {
        const form = new URLSearchParams(raw);
        const back = safeTo(form.get('to') || '/');
        if (limited(ip)) { page(res, 429, 'Too many tries. Wait a few minutes and try again.', back); return; }
        if (!passwordOk(form.get('password'))) {
          failed(ip);
          console.log(`[auth] wrong password from ${ip}`);
          // A short pause makes a script's life slower and a person's no worse.
          setTimeout(() => page(res, 401, "That's not the password. Try again?", back), 400);
          return;
        }
        console.log(`[auth] signed in with the password from ${ip}`);
        res.writeHead(303, { Location: back, 'Set-Cookie': setCookie(mint(), MAX_AGE), 'Cache-Control': 'no-store' });
        res.end();
      });
      return;
    }

    send({ status: 405, body: 'No.\n' });
  });

  // Caddy sends the check for a WebSocket with the upgrade headers still on,
  // and Node hands requests like that to 'upgrade' rather than 'request'.
  // Answer it the same way, then close.
  server.on('upgrade', (req, socket) => {
    const r = new URL(req.url, 'http://x').pathname === '/check' ? check(req) : { status: 404 };
    const reason = { 204: 'No Content', 302: 'Found', 401: 'Unauthorized', 404: 'Not Found' }[r.status] || 'OK';
    const body = r.body || '';
    const head = [`HTTP/1.1 ${r.status} ${reason}`, `Content-Length: ${Buffer.byteLength(body)}`,
      'Cache-Control: no-store', 'Connection: close',
      ...Object.entries(r.headers || {}).map(([k, v]) => `${k}: ${v}`)];
    socket.end(`${head.join('\r\n')}\r\n\r\n${body}`);
  });

  function page(res, status, message, to) {
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
    });
    res.end(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(TITLE)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0e1013;
         color: #f3ead8; font: 17px/1.4 ui-monospace, Menlo, monospace; }
  form { width: min(340px, calc(100vw - 32px)); padding: 28px 24px; background: #2a2438;
         border: 2px solid #4a3f5e; border-radius: 6px; }
  h1 { margin: 0 0 6px; font-size: 22px; color: #f2c75c; }
  p { margin: 0 0 18px; color: #c8bfd6; font-size: 15px; }
  .err { color: #ff9a8a; }
  input { box-sizing: border-box; width: 100%; padding: 12px; font: inherit; border-radius: 4px;
          border: 2px solid #4a3f5e; background: #17141f; color: inherit; }
  button { margin-top: 14px; width: 100%; padding: 12px; font: inherit; font-weight: bold; border: 0;
           border-radius: 4px; background: #f2c75c; color: #2a2438; cursor: pointer; }
  .hide { position: absolute; left: -9999px; }
</style>
</head>
<body>
<form method="post" action="/login">
  <h1>${esc(TITLE)}</h1>
  <p class="${message ? 'err' : ''}">${esc(message || "What's the password? You'll only need it once on this device.")}</p>
  <input type="hidden" name="to" value="${esc(to)}">
  <!-- A username field, hidden, so a password manager knows what to save. -->
  <input class="hide" type="text" name="username" value="family" autocomplete="username" tabindex="-1" aria-hidden="true">
  <input type="password" name="password" autocomplete="current-password" aria-label="Password" autofocus required>
  <button type="submit">Let me in</button>
</form>
</body>
</html>
`);
  }

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[auth] checking sign-ins on 127.0.0.1:${PORT}${DOMAIN ? ` for ${DOMAIN}` : ''}`);
  });
}

function fail(msg) {
  console.error(`[auth] ${msg}`);
  process.exit(1);
}
