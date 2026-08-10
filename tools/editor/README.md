# The content editor

    node tools/editor/server.js      # then open http://localhost:8090

A separate tool on a separate port. Nothing in `src/` knows it exists and the
game plays perfectly well with it never started.

## Reaching it from another machine

By default it listens on loopback only, so the machine it runs on can reach it
and nothing else can. That is deliberate: it rewrites the game's source files
and has no password on it, so anyone who can reach the port can rewrite the
quests. Deployed to a house server, it will look like it is running fine and
refuse every connection — which it is, and which it should.

Two ways round it. Tunnel, which changes nothing and exposes nothing:

    ssh -N -L 8090:localhost:8090 orangepi@mcserve     # then http://localhost:8090

Or open it to the network on purpose:

    EDITOR_HOST=0.0.0.0 node tools/editor/server.js

It prints which one it is doing on startup, along with the addresses to type.
`deploy/catcafe-editor.service` is a systemd unit that takes the second route,
on the grounds that a home LAN is a fair place to trade a little safety for
being able to edit from the sofa.

## What it edits

Three files, and only three:

| file | holds |
| --- | --- |
| `src/game/questdata.js` | `QUESTS` |
| `src/world/villagerdata.js` | `VILLAGERS` |
| `src/game/itemdata.js` | `ITEM_DATA` |

They contain data and nothing else — no functions, no imports — because the
editor rewrites them whole. Anything else put in one is deleted the first time
somebody saves. The code that *reads* the data lives beside them in
`quests.js`, `villagers.js` and `items.js`, and is never touched.

A prose comment about a particular quest or villager goes in its own `note`
field, which is data and survives. The `content` scenario in the test harness
fails if code creeps back into a content file.

## What it will not let you do

Every reference in the content is a string that has to match something else
exactly, and nothing in the game checks them: a quest pointing at a villager
who does not exist simply never completes, which from inside the game looks
like a bug rather than a typo. So the editor offers dropdowns rather than text
boxes for anybody's name and anything's id, and `validate.js` refuses to save
content that does not hold together — an unknown giver, an item that is not an
item, a step with no objective, two things with the same id.

## Editing on the server, and deploying afterwards

Once the editor is running on the house server, quests get written in two
places: here, and there. The three content files are the only thing on the
server that can be newer than what is in this repository — everything else
travels one way — so `deploy/push.sh` never copies them over the top.

    deploy/push.sh --dry-run       says which of the three differ, and by how much

If they are the same, the deploy carries on. If they are missing, it is a first
deployment and they are seeded. If they differ, it stops and makes you choose:

    deploy/push.sh --take-theirs   bring the server's copies down here to commit
    deploy/push.sh --keep-mine     overwrite them (the server keeps a copy first)

`--take-theirs` stops after copying, on purpose: what it brought down is
somebody's work that is not in git yet, and the next thing to do with it is
look at it and commit it, not deploy it back where it came from.

## Backups

Every save copies all three files to `content-backups/<date>-<time>/` first.
Restoring is a copy back. They are not in git, on purpose: they are a safety
net for the minute after a mistake, not a history — git already has that.

## After saving

Reload the game in the browser. The server holds no quest data at all — the
definitions are ES modules the browser fetches — so there is nothing to
restart. Players already in a valley keep the old content until they reload.

One thing to be careful of: saved games remember quests by id. Renaming a quest
somebody is part way through loses their progress in it, and deleting one
leaves a journal entry pointing at nothing.

## Testing a change to the editor

    node tools/editor/test.js            # about six seconds
    node tools/editor/test.js --quick    # skip the browser half, a tenth of that
    node tools/check.js content          # the one game scenario that reads this tool

That is the whole list. The game imports nothing from `tools/editor`, so the
full sweep — ninety-nine browser scenarios, ten minutes — proves nothing about
a change to a form field. Run it when `src/` changes, which includes the three
content files: a quest saved from here is a change to the game.

What the editor's own tests cover: the printer round-trips the content
unchanged and refuses anything it cannot write; the validator catches each kind
of typo and says which; the server refuses a bad save without writing, writes a
good one, backs up first, and what it wrote loads the way the game loads it;
and the page lists, opens, and takes typing without losing focus.

They save for real, against a copy of the repository in a temp folder. The copy
is proved to be in effect — a marker written into it and read back through the
API — before anything is written, because the only thing standing between these
tests and your content is one environment variable, and it has already been
lost once.
