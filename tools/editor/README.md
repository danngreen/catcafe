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
