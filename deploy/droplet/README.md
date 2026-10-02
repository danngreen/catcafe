# A public games server, behind a password

This puts Cat Cafe (and any games that come later) on a small DigitalOcean
droplet, reachable from anywhere, with a password in front of it. Each phone,
iPad or laptop signs in once and then stays signed in.

The house server doesn't change. Same code, same `deploy/push.sh`, no password
on the LAN.

```
phone ──https──> Caddy ──> signed in? ──yes──> Cat Cafe (127.0.0.1:8080)
                   │            └──no───> sign-in page
                   └─ certificates from Let's Encrypt, renewed on their own
```

- **Caddy** handles HTTPS and passes every request, WebSockets included, to
  the sign-in check first.
- **auth.js** is the sign-in check: a password page, invite links, and a
  cookie that lasts about a year and renews itself whenever you play.
- **The game** listens on loopback only, so the sign-in check is the only way
  in. Its `/games`, `/ws`, `/poll` and lobby buttons are all behind it.
- **The quest editor is not deployed here.** It has no password and rewrites
  the game's files. Keep editing on the LAN and push the content up.

## 1. Make the droplet

In DigitalOcean: **Create → Droplets**.

| Setting | Choose |
|---|---|
| Region | The one nearest you |
| Image | **Ubuntu 24.04 (LTS) x64** |
| Size | **Basic → Regular (SSD) → $6/mo** (1 GB RAM, 1 vCPU, 25 GB). The $4 plan (512 MB) runs Cat Cafe alone, but 1 GB leaves room for more games. |
| Authentication | **SSH Key**. Add your Mac's public key (`cat ~/.ssh/id_ed25519.pub`, or `id_rsa.pub`). Not Password. |
| Advanced options | Tick **Improved metrics monitoring** (free). IPv6 optional. |
| Backups | Optional (about $1.20/mo weekly). The valleys are the only data that matters; see [Backups](#backups) for a free alternative. |
| Hostname | Anything, e.g. `games` |

Then **Networking → Firewalls → Create Firewall**:

| Inbound rule | Port | Sources |
|---|---|---|
| SSH | 22 | All, or just your home IP if it rarely changes |
| HTTP | 80 | All |
| HTTPS | 443 | All |

Leave outbound as it is, and apply the firewall to the droplet. (setup.sh
also turns on the droplet's own firewall with the same rules; two is fine.)

## 2. Point a name at it

Make an **A record** for the name you want, e.g. `catcafe.example.com`,
pointing at the droplet's IPv4 address. Where you do that depends on where the
domain's DNS lives:

- **Your registrar** (Namecheap, Porkbun, etc.): add the A record there.
- **Cloudflare**: add the A record and set it to **DNS only** (grey cloud).
  Caddy gets its own certificate and doesn't need Cloudflare's proxy.
- **DigitalOcean**: Networking → Domains.

No domain? `203-0-113-5.sslip.io` (your droplet's IP with dashes) resolves to
that IP on its own, and Let's Encrypt will issue a certificate for it.

## 3. Run setup, from the Mac

```bash
deploy/droplet/setup.sh --ip 203.0.113.5 \
  --domain catcafe.example.com --email you@example.com
```

This does the following:

- Updates Ubuntu and turns on automatic security updates.
- Makes SSH accept keys only and turns on the firewall.
- Installs Node 24 and Caddy.
- Creates a `gamehost` user to deploy as, using the same SSH key as root.
- Installs the sign-in service and asks you for the password. Use a short
  phrase; it's typed once per device. The password itself isn't stored, only a
  hash of it.
- Deploys the game with `deploy/push.sh` and starts it.
- Prints the **invite link**.

It takes a few minutes the first time. Running it again later refreshes the
droplet without changing the password or invite link.

Options: `--title "Green Family Games"` names the sign-in page. For the rest,
see [Passwords, invites, signing out](#passwords-invites-signing-out) and
[Adding another game](#adding-another-game).

## Signing devices in

- **Invite link** (`https://catcafe.example.com/login?key=…`): open it on a
  device and it's signed in, no typing. Text it to family, or make it a QR code
  for the kids' iPads. Anyone with the link can get in, so keep it in the
  family.
- **Password**: typed once. The page is set up so iCloud Keychain and password
  managers offer to save it.
- **iPhone/iPad Home Screen**: a game added to the Home Screen keeps its own
  cookies, separate from Safari's. Sign in in Safari first, then add it to the
  Home Screen. If the Home Screen copy still asks, type the password once in
  there and it sticks.

A signed-in device stays signed in for 400 days from its last visit, which
means for good if anybody plays at least once a year.

## Deploying updates

```bash
CATCAFE_HOST=gamehost@203.0.113.5 deploy/push.sh
```

It's the same script the house server uses: it refuses a dirty tree, waits if
somebody's playing, and saves the valleys before restarting. To save typing,
add this to `~/.ssh/config`:

```
Host catcafe-public
  HostName 203.0.113.5
  User gamehost
```

After that, `CATCAFE_HOST=catcafe-public deploy/push.sh` works.

`tools/rescue.js` works the same way as on the Pi, over ssh:
`ssh catcafe-public 'cd catcafe && node tools/rescue.js …'`.

## Going public: invite codes instead of a password

The game can be opened to everyone instead of sitting behind the family
password. Each valley then has its own invite link (catcafe.cafe/v/plum-otter-4271),
anybody can start a cafe of their own, and nobody can see a valley without its
link. The game server limits how fast valleys can be made and codes guessed.

```bash
deploy/droplet/setup.sh --ip 143.198.168.75 --domain catcafe.cafe --public \
  --redirect catcafe.4ms.info,www.catcafe.cafe
```

That run:

- copies the valleys as they are to `/root/catcafe-saves-before-public-<date>`
  on the droplet, the first time only;
- starts the game with `VALLEY_CODES=1` (a drop-in,
  `/etc/systemd/system/catcafe.service.d/public.conf`);
- gives every existing valley an invite code and pins it so it never expires;
- serves catcafe.cafe with no sign-in, and redirects the `--redirect` names to
  it (old links keep working).

Then print each valley's link and send them round:

```bash
ssh gamehost@143.198.168.75 'cd catcafe && node tools/rescue.js links'
```

Each person opens their valley's link once on each device, and the device
remembers it from then on. Running setup again later keeps it public;
`--private` puts the password back. Other things for the public server:

| To | Run on the droplet (`ssh gamehost@...`, then `cd catcafe`) |
| --- | --- |
| See how busy it is | `node tools/rescue.js stats` |
| Stop a valley from ever expiring | `node tools/rescue.js pin <valley>` |
| Give a creator their buttons back on a new device | `node tools/rescue.js creator <valley>`, then send them the link it prints |

## Passwords, invites, signing out

Run setup again with one of these:

| Want to | Add |
|---|---|
| Change the password | `--password` (devices already signed in stay signed in) |
| Retire the invite link and make a new one | `--new-invite` |
| Sign every device out (lost phone, link leaked) | `--new-secret` |

For example: `deploy/droplet/setup.sh --ip 203.0.113.5 --domain catcafe.example.com --new-invite`.

Signing out one device: visit `/logout` on it.

## Adding another game

1. Run it as its own systemd service on another loopback port, e.g. `8082`.
   Copy `catcafe.service` as a starting point.
2. Point `othergame.example.com` at the droplet.
3. Add a block to `deploy/droplet/Caddyfile`:
   ```
   othergame.example.com {
   	import gated 127.0.0.1:8082
   }
   ```
4. So that one sign-in covers both games, run setup with
   `--cookie-domain .example.com`. Every device then signs in once more to
   pick up the shared cookie.

Give each game its own subdomain rather than a path like `/othergame/`. Cat
Cafe asks for `/ws`, `/games` and `/poll` from the root of the site.

## Backups

The valleys live in `/home/gamehost/catcafe/saves`. To copy them to the Mac:

```bash
rsync -a catcafe-public:catcafe/saves/ ~/catcafe-public-saves/
```

That's worth putting in a cron job or a calendar reminder. DigitalOcean's
weekly backups are the other option.

## When something's wrong

```bash
ssh root@203.0.113.5 journalctl -u catcafe -n 50      # the game
ssh root@203.0.113.5 journalctl -u games-auth -n 50   # sign-ins, including wrong passwords
ssh root@203.0.113.5 journalctl -u caddy -n 50        # certificates, proxying
```

- **"This site can't provide a secure connection" / no certificate**: the DNS
  record isn't pointing at the droplet yet, or hasn't propagated. Caddy keeps
  retrying on its own, so there's nothing to re-run.
- **Signed in, but the page asks again straight away**: the cookie is
  HTTPS-only. Make sure the address starts with `https://`.
- **"Too many tries"**: ten wrong passwords from one address locks that address
  out for 15 minutes.
