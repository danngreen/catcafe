#!/usr/bin/env bash
#
# Set up a public games server on a fresh DigitalOcean droplet, from this Mac.
#
#   deploy/droplet/setup.sh --ip 203.0.113.5 \
#       --domain catcafe.example.com --email you@example.com
#
# It copies deploy/droplet up, runs server-setup.sh there as root (which asks
# for the games password the first time), then deploys the game with
# deploy/push.sh and starts it. Run it again any time to refresh the box; add
# any of these and they are passed along:
#
#   --cookie-domain .example.com   one sign-in for every game under it
#   --title "Green Family Games"   what the sign-in page says
#   --password                     set a new password
#   --new-invite                   retire the invite link, make a new one
#   --new-secret                   sign every device out
#   --force                        deploy even with uncommitted changes
#
# See deploy/droplet/README.md for the whole story, DigitalOcean settings
# included.

set -euo pipefail

IP= DOMAIN= FORCE=
PASS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --ip) IP=$2; shift ;;
    --force) FORCE=--force ;;
    --domain) DOMAIN=$2; PASS+=("$1" "$2"); shift ;;
    --email|--cookie-domain|--title) PASS+=("$1" "$2"); shift ;;
    --password|--new-invite|--new-secret) PASS+=("$1") ;;
    -h|--help) sed -n '3,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "setup.sh: unknown option $1" >&2; exit 2 ;;
  esac
  shift
done

say() { printf '\033[36m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*" >&2; }
die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

[ -n "$IP" ] && [ -n "$DOMAIN" ] || die "Need --ip and --domain (and --email the first time)."
cd "$(git rev-parse --show-toplevel)"

SSH=(ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)
"${SSH[@]}" -o BatchMode=yes "root@$IP" true \
  || die "Can't ssh in as root@$IP. Was the droplet made with your SSH key?"

say "Copying the setup files up …"
rsync -a --delete -e "${SSH[*]}" deploy/droplet/ "root@$IP:/root/games-setup/"

say "Setting up the droplet …"
"${SSH[@]}" -t "root@$IP" bash /root/games-setup/server-setup.sh "${PASS[@]}"

say "Deploying the game …"
CATCAFE_HOST="games@$IP" deploy/push.sh --no-restart $FORCE

say "Starting it …"
"${SSH[@]}" "root@$IP" 'systemctl restart catcafe && for i in $(seq 1 20); do curl -sf -m 2 http://127.0.0.1:8080/games >/dev/null && exit 0; sleep 1; done; exit 1' \
  || die "The game didn't come up. Look at: ssh root@$IP journalctl -u catcafe -n 40"

# From the outside, the way a phone would see it. This needs the DNS record
# and a certificate, so on a brand new name it can take a minute or two.
code=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "https://$DOMAIN/" || true)
case "$code" in
  302) say "https://$DOMAIN is up and asking for the password." ;;
  000) warn "https://$DOMAIN isn't answering yet — usually DNS still settling or the certificate"
       warn "still being issued. Try it in a few minutes; nothing needs re-running." ;;
  *) warn "https://$DOMAIN answered $code, not the expected redirect to the sign-in page." ;;
esac

say ""
say "From now on, deploy with:"
say "  CATCAFE_HOST=games@$IP deploy/push.sh"
