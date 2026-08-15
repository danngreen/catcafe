#!/usr/bin/env bash
#
# Put this working tree on the house server and restart the game.
#
#   deploy/push.sh              # copy and restart
#   deploy/push.sh --dry-run    # say what would be copied, touch nothing
#   deploy/push.sh --force      # go anyway with a dirty tree or players in
#   deploy/push.sh --no-restart # copy, leave the game server running
#   deploy/push.sh --take-theirs  # bring the server's content down here first
#   deploy/push.sh --keep-mine    # overwrite the server's content with this one
#
# There is no sudo here, and there does not need to be. The service runs as
# orangepi, so an ssh session as orangepi is allowed to signal it; the server
# catches SIGTERM, writes every valley out, and exits 0; `Restart=always` in the
# unit brings it back five seconds later on whatever code is now on disk. That
# is a clean restart by any measure, and it needs no root and no sudoers entry.
#
# The saves directory is never copied, in either direction. The valleys on the
# server are the real ones and the copies down here are for reading.

set -euo pipefail

HOST=${CATCAFE_HOST:-mcserve}
DIR=${CATCAFE_DIR:-catcafe}
PORT=${CATCAFE_PORT:-8080}
UNIT=${CATCAFE_UNIT:-catcafe}

DRY=
FORCE=
NORESTART=
TAKE=
KEEP=

# The three files the content editor writes. They are the one thing on the
# server that can be newer than what is here — everything else only ever goes
# one way — so they are never copied over the top of a change.
CONTENT=(
  src/game/questdata.js
  src/world/villagerdata.js
  src/game/itemdata.js
)
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --force) FORCE=1 ;;
    --no-restart) NORESTART=1 ;;
    --take-theirs) TAKE=1 ;;
    --keep-mine) KEEP=1 ;;
    -h|--help) sed -n '3,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "push.sh: unknown option $arg" >&2; exit 2 ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"
say() { printf '\033[36m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*" >&2; }
die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

# --- is this tree fit to send -----------------------------------------------
#
# Deploying uncommitted work is how you end up with a server running something
# that exists nowhere else, and a bug report you cannot reproduce because the
# code that produced it was overwritten an hour later.

if [ -n "$(git status --porcelain)" ] && [ -z "$FORCE" ] && [ -z "$DRY" ]; then
  git status --short
  die "Uncommitted changes. Commit them, or --force if you meant it."
fi

SHA=$(git rev-parse --short HEAD)
SUBJECT=$(git log -1 --pretty=%s)
if ! git merge-base --is-ancestor HEAD origin/main 2>/dev/null; then
  AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo '?')
  warn "Note: $AHEAD commit(s) here are not on origin/main. The server will be"
  warn "      running code that only exists on this Mac."
fi

# --- is anybody in there ----------------------------------------------------
#
# Restarting drops every connected player back to the title screen. Their
# valley is saved first, so nothing is lost but the moment — which is still
# worth not doing to somebody mid-order.

ssh -o BatchMode=yes -o ConnectTimeout=5 "$HOST" true \
  || die "Cannot reach $HOST over ssh. Is it awake, and is your key on it?"

# The port is firewalled off from this Mac even though ssh gets through, so ask
# the server about itself from its own loopback rather than reaching for it.
GAMES=$(ssh -o BatchMode=yes "$HOST" "curl -sf -m 5 http://localhost:$PORT/games" || true)
if [ -z "$GAMES" ]; then
  warn "Nothing is answering on port $PORT over there — the service may be down."
  warn "This script can restart the game but cannot start it: that needs sudo."
elif echo "$GAMES" | grep -qE '"(playing|here)": [1-9]'; then
  echo "$GAMES" | grep -E '"(cafe|playing|here)"' | sed 's/^/    /'
  if [ -n "$DRY" ]; then
    # A dry run writes nothing and restarts nothing, so somebody playing is
    # no reason to stop — and asking "what would this do" while the house is
    # busy is exactly when you want an answer.
    warn "Somebody is playing. A dry run changes nothing, so here it is anyway."
  elif [ -n "$NORESTART" ]; then
    warn "Somebody is playing — copying the files and leaving them to it."
  elif [ -z "$FORCE" ]; then
    die "Somebody is playing. Wait for them, --force, or --no-restart to copy only."
  else
    warn "Somebody is playing, and you said --force."
  fi
fi

# --- content -----------------------------------------------------------------
#
# Quests are written on both sides now: here in an editor, and over there in
# the one running on the server. That makes the three content files the only
# thing a deploy could destroy work with — everything else in the tree is
# written here and only here.
#
# So they are excluded from the copy entirely, and reconciled instead. Missing
# over there means a first deployment and they are seeded. The same means
# nothing to do. Different means somebody has been editing on the server, and
# this stops rather than guessing which of you is right.

reconcile() {
  local seeded=0 differ=()
  for f in "${CONTENT[@]}"; do
    if ! ssh -o BatchMode=yes "$HOST" "test -f '$DIR/$f'"; then
      say "  $f — not there yet, seeding it"
      ssh -o BatchMode=yes "$HOST" "mkdir -p '$DIR/$(dirname "$f")'"
      rsync -a "$f" "$HOST:$DIR/$f"
      seeded=$((seeded + 1))
      continue
    fi
    if ssh -o BatchMode=yes "$HOST" "cat '$DIR/$f'" | cmp -s - "$f"; then continue; fi
    differ+=("$f")
  done

  [ ${#differ[@]} -eq 0 ] && return 0

  if [ -n "$TAKE" ]; then
    for f in "${differ[@]}"; do
      rsync -a "$HOST:$DIR/$f" "$f"
      say "  $f — taken from the server"
    done
    warn ''
    warn "Brought ${#differ[@]} file(s) down. They are edits made on the server and are"
    warn 'not in git yet — commit them before you change them here:'
    warn "  git add ${differ[*]} && git commit"
    die 'Stopping so you can look at them first. Run the deploy again afterwards.'
  fi

  if [ -n "$KEEP" ]; then
    local stamp
    stamp=$(date '+%Y-%m-%d-%H%M%S')
    ssh -o BatchMode=yes "$HOST" "mkdir -p '$DIR/content-backups/$stamp-before-deploy'"
    for f in "${differ[@]}"; do
      ssh -o BatchMode=yes "$HOST" \
        "cp '$DIR/$f' '$DIR/content-backups/$stamp-before-deploy/$(basename "$f")'"
      rsync -a "$f" "$HOST:$DIR/$f"
      say "  $f — overwritten (theirs kept in content-backups/$stamp-before-deploy)"
    done
    return 0
  fi

  warn ''
  warn "The server's content is not the same as this copy:"
  for f in "${differ[@]}"; do
    local n
    n=$(ssh -o BatchMode=yes "$HOST" "cat '$DIR/$f'" | diff - "$f" | grep -c '^[<>]' || true)
    warn "  $f — $n line(s) differ"
  done
  warn ''
  warn 'Somebody has been editing quests on the server. Pick one:'
  warn '  deploy/push.sh --take-theirs   bring them down here, to look at and commit'
  warn '  deploy/push.sh --keep-mine     overwrite them (a copy is kept over there)'
  die 'Nothing has been copied.'
}

# --- copy -------------------------------------------------------------------
#
# --delete so a file deleted here goes away there too; a stale module that
# nothing imports any more is harmless right up until something imports it.

RSYNC=(rsync -a --delete
  --exclude '.git'
  --exclude 'saves'          # the real valleys live there. Never touch them.
  # Valleys from before saves/ existed — saved-valley.json, bak.valley.json —
  # still sit in the server's root, and --delete would take them with it. They
  # are somebody's afternoon, and there is no second copy.
  --exclude '*valley*.json'
  --exclude 'bak.*'
  # The server's own copies of the content, taken before each save from the
  # editor running on it. Its safety net, nothing to do with this machine's —
  # without this, --delete tries to remove them and rsync copies ours over.
  --exclude 'content-backups'
  --exclude 'questdata.js'   # content: handled on its own, below
  --exclude 'villagerdata.js'
  --exclude 'itemdata.js'
  --exclude '.deployed'      # written after the copy, below
  --exclude '.DS_Store'
  --exclude 'node_modules')

if [ -n "$DRY" ]; then
  say "Dry run — nothing will be written."
  say 'Content:'
  for f in "${CONTENT[@]}"; do
    if ! ssh -o BatchMode=yes "$HOST" "test -f '$DIR/$f'"; then
      say "    $f — not there yet, would be seeded"
    elif ssh -o BatchMode=yes "$HOST" "cat '$DIR/$f'" | cmp -s - "$f"; then
      say "    $f — same on both"
    else
      n=$(ssh -o BatchMode=yes "$HOST" "cat '$DIR/$f'" | diff - "$f" | grep -c '^[<>]' || true)
      warn "    $f — $n line(s) differ, would stop the deploy"
    fi
  done
  say 'Everything else:'
  "${RSYNC[@]}" --dry-run -v ./ "$HOST:$DIR/" | sed 's/^/    /'
  exit 0
fi

say "Reconciling content …"
reconcile

say "Copying $SHA to $HOST:$DIR …"
"${RSYNC[@]}" ./ "$HOST:$DIR/"

# A copied tree has no git history, so leave a note saying what it is. Without
# this the only answer to "what is the server running" is a guess.
ssh -o BatchMode=yes "$HOST" "cat > $DIR/.deployed" <<EOF
$SHA $(date '+%Y-%m-%d %H:%M:%S %Z')
$SUBJECT
pushed from $(hostname -s) by $(whoami)
EOF

# --- restart ----------------------------------------------------------------

# Copying alone is enough for a good many changes. The server holds no quest
# data — the definitions are modules the browser fetches — so new content
# reaches a player when they reload, and somebody mid-session is undisturbed
# until then. What a restart is actually for is a change to server.js itself.
if [ -n "$NORESTART" ]; then
  say "Copied $SHA. Game server left running — reload the browser to pick it up."
  exit 0
fi

# Ask systemd which process is the server rather than grepping for it. `pkill -f
# catcafe/server.js` looks tidier and is a trap: the ssh wrapper shell has that
# very string in its own command line, so pkill matches the thing doing the
# killing. `systemctl show` needs no privileges and answers exactly.
say "Restarting …"
PID=$(ssh -o BatchMode=yes "$HOST" "systemctl show $UNIT -p MainPID --value" || echo 0)
if [ "${PID:-0}" -eq 0 ]; then
  die "Nothing was running to restart. Starting it needs: sudo systemctl start $UNIT"
fi
ssh -o BatchMode=yes "$HOST" "kill -TERM $PID" \
  || die "Could not signal pid $PID. Is the service running as somebody else?"

# It saves on the way out and systemd waits RestartSec before bringing it back,
# so the gap is a few seconds. Give it thirty before calling it a failure.
if ssh -o BatchMode=yes "$HOST" \
  "for i in \$(seq 1 30); do curl -sf -m 2 http://localhost:$PORT/games >/dev/null && exit 0; sleep 1; done; exit 1"
then
  # The pid has to have changed. A server that answers on the old pid never
  # went down, which means the new code is still sitting unread on the disk.
  NEW=$(ssh -o BatchMode=yes "$HOST" "systemctl show $UNIT -p MainPID --value" || echo 0)
  [ "${NEW:-0}" = "$PID" ] && die "Still running as pid $PID — it did not restart."
  say "Up on $SHA as pid $NEW — $SUBJECT"
else
  die "It went down and did not come back. Look at: ssh $HOST journalctl -u catcafe -n 40"
fi
