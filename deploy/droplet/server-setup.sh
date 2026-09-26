#!/usr/bin/env bash
#
# The droplet half of deploy/droplet/setup.sh. Runs as root on a fresh Ubuntu
# 24.04 box and leaves it ready for the game: locked down, Caddy in front, the
# sign-in check running, and a `gamehost` user to deploy as.
#
# Safe to run again. It keeps the existing secret, invite key and password
# unless you ask for new ones, and just refreshes everything else.
#
#   server-setup.sh --domain catcafe.example.com --email you@example.com
#       [--cookie-domain .example.com]   one sign-in for every game under it
#       [--title "Green Family Games"]   what the sign-in page says
#       [--password]                     set a new password
#       [--new-invite]                   retire the invite link, make a new one
#       [--new-secret]                   sign every device out

set -euo pipefail

DOMAIN= EMAIL= COOKIE_DOMAIN= TITLE= NEWPW= NEWINVITE= NEWSECRET=
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN=$2; shift ;;
    --email) EMAIL=$2; shift ;;
    --cookie-domain) COOKIE_DOMAIN=$2; shift ;;
    --title) TITLE=$2; shift ;;
    --password) NEWPW=1 ;;
    --new-invite) NEWINVITE=1 ;;
    --new-secret) NEWSECRET=1 ;;
    *) echo "server-setup.sh: unknown option $1" >&2; exit 2 ;;
  esac
  shift
done

say() { printf '\033[36m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*" >&2; }
die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run this as root."
# Remembered from the last run, so refreshing the box needs no arguments.
CONF=/etc/games-setup.conf
if [ -f "$CONF" ]; then
  # shellcheck disable=SC1090
  . "$CONF"
  DOMAIN=${DOMAIN:-$SAVED_DOMAIN} EMAIL=${EMAIL:-$SAVED_EMAIL}
fi
[ -n "$DOMAIN" ] && [ -n "$EMAIL" ] || die "Need --domain and --email the first time."
printf 'SAVED_DOMAIN=%q\nSAVED_EMAIL=%q\n' "$DOMAIN" "$EMAIL" > "$CONF"
HERE=$(cd "$(dirname "$0")" && pwd)
for f in auth.js Caddyfile catcafe.service games-auth.service; do
  [ -f "$HERE/$f" ] || die "Missing $HERE/$f — copy the whole deploy/droplet folder up."
done
export DEBIAN_FRONTEND=noninteractive

# --- packages -----------------------------------------------------------------

say "Updating the system …"
apt-get update -q
apt-get -y -q upgrade
apt-get -y -q install curl rsync ufw unattended-upgrades gnupg debian-keyring debian-archive-keyring apt-transport-https

# Security fixes install themselves, every day, without anybody logging in.
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  say "Installing Node 24 …"
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get -y -q install nodejs
fi
say "  node $(node --version) at $(command -v node)"

# Caddy's own repository rather than Ubuntu's, which is a couple of years
# behind and reads the Caddyfile's snippet arguments differently.
if ! command -v caddy >/dev/null; then
  say "Installing Caddy …"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get -y -q install caddy
fi
say "  $(caddy version | cut -d' ' -f1)"

# --- ssh and firewall ---------------------------------------------------------

# Keys only. A 10- prefix sorts ahead of cloud-init's 50- file, and the first
# setting sshd reads is the one it keeps.
cat > /etc/ssh/sshd_config.d/10-games.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
sshd -t && systemctl reload ssh

say "Firewall: ssh, http and https in, nothing else …"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null      # HTTP/3
ufw --force enable >/dev/null

# --- the gamehost user --------------------------------------------------------
#
# Not "games": Ubuntu already has a system account by that name, with no home
# and no shell, and deploying as it gets "Permission denied (publickey)".

if ! id gamehost >/dev/null 2>&1; then
  say "Adding the gamehost user …"
  adduser --disabled-password --gecos '' gamehost >/dev/null
fi
[ "$(getent passwd gamehost | cut -d: -f6)" = /home/gamehost ] \
  || die "The gamehost user exists but its home isn't /home/gamehost. Not touching it."
# Whoever can ssh in as root can deploy as gamehost: same keys.
install -d -m 700 -o gamehost -g gamehost /home/gamehost/.ssh
install -m 600 -o gamehost -g gamehost /root/.ssh/authorized_keys /home/gamehost/.ssh/authorized_keys
install -d -o gamehost -g gamehost /home/gamehost/catcafe /home/gamehost/catcafe/saves

# --- sign-in service ----------------------------------------------------------

install -d /usr/local/lib/games-auth
install -m 644 "$HERE/auth.js" /usr/local/lib/games-auth/auth.js

ENVF=/etc/games-auth.env
touch "$ENVF"; chmod 600 "$ENVF"
envget() { grep -E "^$1=" "$ENVF" | tail -1 | cut -d= -f2- || true; }
envset() {
  local tmp; tmp=$(mktemp)
  grep -vE "^$1=" "$ENVF" > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  install -m 600 "$tmp" "$ENVF"; rm -f "$tmp"
}

if [ -z "$(envget AUTH_SECRET)" ] || [ -n "$NEWSECRET" ]; then
  envset AUTH_SECRET "$(openssl rand -hex 32)"
  if [ -n "$NEWSECRET" ]; then warn "New secret: every device will need to sign in again."; fi
fi
if [ -z "$(envget AUTH_INVITE)" ] || [ -n "$NEWINVITE" ]; then
  envset AUTH_INVITE "$(openssl rand -hex 16)"
fi
if [ -z "$(envget AUTH_PASSWORD_HASH)" ] || [ -n "$NEWPW" ]; then
  [ -t 0 ] || die "Need a terminal to ask for the password (ssh -t)."
  while :; do
    read -rsp "Password for the games (a few words is best): " PW1; echo
    read -rsp "Same again: " PW2; echo
    if [ "$PW1" != "$PW2" ]; then warn "Those didn't match."; continue; fi
    if [ ${#PW1} -lt 10 ]; then warn "Make it at least 10 characters — a short phrase is easy to type and hard to guess."; continue; fi
    break
  done
  envset AUTH_PASSWORD_HASH "$(printf '%s' "$PW1" | node /usr/local/lib/games-auth/auth.js hash)"
  unset PW1 PW2
fi
if [ -n "$COOKIE_DOMAIN" ]; then envset AUTH_COOKIE_DOMAIN "$COOKIE_DOMAIN"; fi
if [ -n "$TITLE" ]; then envset AUTH_TITLE "$TITLE"; fi

# --- services -----------------------------------------------------------------

install -m 644 "$HERE/games-auth.service" /etc/systemd/system/games-auth.service
install -m 644 "$HERE/catcafe.service" /etc/systemd/system/catcafe.service
systemctl daemon-reload
systemctl enable games-auth catcafe >/dev/null 2>&1
systemctl restart games-auth
if [ -f /home/gamehost/catcafe/server.js ]; then
  systemctl restart catcafe
else
  say "  The game isn't here yet; setup.sh copies it next."
fi

# --- Caddy --------------------------------------------------------------------

sed -e "s/catcafe\.example\.com/$DOMAIN/g" -e "s/you@example\.com/$EMAIL/g" \
  "$HERE/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 \
  || { caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; die "The Caddyfile didn't validate."; }
systemctl reload caddy || systemctl restart caddy

# --- is the name pointing here ------------------------------------------------

# DigitalOcean's metadata service knows the droplet's public address.
ME=$(curl -sf -m 3 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address || true)
POINTS=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)
if [ -z "$POINTS" ]; then
  warn "$DOMAIN doesn't resolve yet. Point it at ${ME:-this droplet} and Caddy will get"
  warn "its certificate on its own once it does."
elif [ -n "$ME" ] && [ "$POINTS" != "$ME" ]; then
  warn "$DOMAIN points at $POINTS, but this droplet is $ME. Fix the DNS record."
fi

say ""
say "Done. Invite link (signs a device in with one tap — keep it in the family):"
say "  https://$DOMAIN/login?key=$(envget AUTH_INVITE)"
