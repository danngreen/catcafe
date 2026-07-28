# Cat Cafe

A whimsical 16-bit-style browser game. You are a cat who walks on two legs and
runs a cat cafe in a rural valley. Serve coffee, keep cats, explore five
settlements, and slowly turn one small tea room into somewhere people go out of
their way for.

## Running it

```bash
npm start          # serves on http://localhost:8080
```

It prints every address it's reachable on. The game is plain ES modules with no
build step, but it does need to be served over HTTP (modules don't load from
`file://`).

## Playing together on a LAN

`npm start` also opens a shared session. Everyone on the same Wi-Fi points their
browser at the host — `http://192.168.x.x:8080`, printed on startup — picks a
name, a coat and an apron, and walks around the same valley. Up to eight; two or
three is the sweet spot. It runs happily on a small box like an Orange Pi: the
server only keeps state and relays messages, and each player's browser does all
the drawing.

The host owns the world seed, so every client generates a byte-identical valley
from one number — no map is ever sent. Add `?solo` to the URL to play alone even
when a session is running.

**One cafe, one set of books.** The till, the pantry, the bag, the cats, the
quest flags and the clock all live on the server. Buy beans and they're in
everyone's pantry; take a fare and everyone's money goes down; sleep at the inn
and morning comes for all of you. Whoever started the cafe picked its paint and
its name — everyone after that just picks a face and a name for themselves.

**People come in wanting particular things.** Everyone arrives with three or
four items in mind and asks for them in turn, fanciest first. Have it and they
buy it and sit down; don't and they shrug, you hear it, and they ask for the
next thing on the list. Get to the end of their list and they leave without
buying anything.

Every ask is a press of Space. Once you have had to tell somebody you're out
of something, the next thing they ask for is yours to answer — they stand there
waiting rather than working down the rest of the list on their own, which is
both the moment and your chance to note the item down. An employee on duty does
work the whole list by themselves; that is what you pay them for.

That is what makes the pantry a decision rather than a chore. Basics sell to
almost everyone but cheaply; the expensive things are what people ask for first,
and are worth stocking precisely because that is where the money is. Not
everyone has something plain they'll settle for, so some walk out no matter what.
The morning card tells you what was asked for that you hadn't got, which is
tomorrow's shopping list.

**Your employee** stands behind the counter during your posted hours, and works
the queue whether or not you're in the room — customers ask for their list and
your employee answers it, the same cycle you'd press Space for. They clock in
and out on the hour and tell you when they do. Seeing them there is most of what
you're paying for.

**Weather** decides how many people leave the house. Rain halves the crowd and
snow more than halves it — unless you have a fireplace, which wins most of that
back. It only helps when there is something to shelter from; on a sunny day a
fire is just nice furniture. What people ask for follows the temperature too:
on a hot day the orders run to lemonade, iced tea and ice cream and almost
nobody wants cocoa, and when it snows that reverses completely. The morning card
tells you what the day is going to do, so the shopping trip is a decision.

The sky is worked out from the valley's seed and the date rather than stored, so
everyone in a shared valley is standing in the same rain and none of it is sent
over the network. Snow belongs to winter, and a wet week feels like a wet week.

Open the map in a shared valley and everyone else is on it, named, with anyone
indoors greyed out. The browser remembers the name and colours you last played
as and offers them back on the join screen. Two people can't be the same
person: the server hands out a distinct name and tells you if it changed yours.

The customer simulation runs on exactly one client (the longest-standing player),
which publishes where its customers are standing so the rest can draw them. That
matters: if every client simulated the room, the same cup of coffee would be sold
once per player. Anyone can still serve — a press of Space asks whoever is
running the room to take the order.

**Several valleys at once.** One server can host as many games as you like, and
two groups can play different ones side by side without seeing each other. You
land in a lobby first — always, even with one valley, since it is the only place
you can start another or throw one away — listing each game
with its cafe name, the day and time in there, how much money and how many cats,
and when anybody last played it — for whichever row is highlighted, since this
is played on a keyboard and on a phone and neither has a hover. "New valley"
makes another, with its own seed.

`X` on a highlighted valley deletes it, after a confirm that names the cafe and
what day it had reached and starts on **No**. The server refuses while anybody
is connected to that game, whether they're playing or still in the lobby for it
— so you can't pull the ground out from under someone mid-afternoon, and the
lobby's own idea of who is where can be a few seconds stale without it
mattering. Ids are reused, so a deleted 002 is what the next new valley
becomes.

Games are kept in `saves/valley-NNN.json`. A single `valley.json` from before
this existed becomes game 001 on first run, so nothing is lost. `?game=002` in
the URL is a direct link that skips the lobby. `SESSION_SAVE=0 npm start` plays
without saving anything; `SESSION_SAVE=/some/dir` keeps them elsewhere.

Clients say hello every few seconds and reconnect on their own, so standing
still, reading the title screen, closing a lid or restarting the server doesn't
strand anyone — you come back where you were, with the books as they are now.
A client that has lost the link stops simulating rather than quietly running a
second cafe, and says **OFFLINE** in the corner until it's back.

**If a machine can't hold a socket open.** Some can't — macOS Screen Time's
Content & Privacy Restrictions is the one this was written for. The filter lets
the connection up and then kills it a few seconds later, over and over, so the
game connects, works briefly, drops, and comes back, forever. The same filter
has no objection to ordinary HTTP requests, which is how it served you the game
in the first place.

So the session also runs over plain HTTP: the same messages, carried by a POST
ten times a second. The client tries a socket first and, after it has been cut
twice, gives up on sockets *for that machine* and carries on over HTTP without
anyone doing anything. It remembers, so it doesn't relearn the lesson every
time. Add `?poll` to skip straight to HTTP, or `?ws` to forget and try a socket
again. `?netdebug` shows which one is in use. **You do not need to turn parental
controls off.**

Staying in the game doesn't depend on the game: the server pings each socket
itself and the browser answers in its own networking code, with no page script
involved, so a busy tab or a message that doesn't get through can't get you
thrown out. And the roster is restated every few seconds rather than relying on
one-shot arrival messages — miss one of those and two players would disagree
about who is in the valley for the rest of the session.

If something looks wrong, there are two places to look. Add `?debug` (or
`?netdebug` — same thing) to the URL for the client's view: where you're
standing in tile coordinates, which is the same unit the world is authored in
and so the one to navigate by; then link state, who the server thinks runs the
cafe, round-trip time, how long since anything was heard, and how many times
you've dropped. Open `/status` on the host — `http://192.168.x.x:8080/status` — for the
server's view: every socket, whether it has actually joined the game, where it
is, and how long it has been silent. When two screens disagree about who can
see whom, that page settles it. The server also prints a line whenever it hangs
up on anyone, and why.

## After dark

The valley keeps two casts. At dusk the day crowd walks home — to a door, or a
treeline, or wherever the nearest way out of sight happens to be — and the night
crowd comes out the same way. Nobody blinks in or out; if you're standing in the
lane at sunset you can watch the changeover happen around you.

The music changes with them: slower, emptier, and built on chords that never
resolve where the ear expects, with the odd bell a long way off. There's an owl
somewhere you can't see.

Night people have their own jobs for you, and the longer jobs run in steps —
find out where something is, then go and get it, then bring it back. The Reading
Room in Brambleford is where finding out mostly happens: what you read is kept
as something you *know*, which a job can then ask about. Some places give up
different things depending on what you know and what hour it is. A hedge is just
a hedge in daylight.

## Controls

| Key | Does |
| --- | --- |
| Arrows / WASD | Walk |
| Shift | Run (on touch: the RUN pad, or double-tap an arrow and hold) |
| Space / Enter | Talk, enter doors, read signs, serve customers |
| Esc | Menu (and closes screens) |
| X / Backspace | Back / cancel |
| C | Cafe book — arrange & build, pantry, cats, staff, opening hours |
| M | Map — arrows browse the places you've found |
| I | Bag |
| Tab | Switch tabs, and switch mode in the build screen |

Click once anywhere to start the audio (browsers require a gesture).

On a touch device an on-screen d-pad appears alongside **ACT**, **BACK** and
**MENU** — the same three actions as Space, X and Esc. In landscape the controls
float over the edges of the view — the game measures how far they reach in and
keeps dialogue, toasts and menu panels clear of them — and in portrait they
take a band under it.

**Running on a phone.** There's a **RUN** toggle in the middle of the d-pad —
tap it and it stays on until you tap it off. Or double-tap an arrow and keep
holding it for a burst, which ends when you stop walking. (RUN also stands in
for Shift in build mode, where it cycles the furniture you're placing.)

**Tabs and lists are tappable.** The mode tabs in build mode, the tabs of the
cafe book, and the furniture strip along the bottom all respond to a tap, so
nothing depends on a key that a phone doesn't have.

**Fullscreen on mobile.** The ⛶ button (and Menu -> Sound -> Fullscreen) calls
the Fullscreen API, which works on Android and iPadOS. iPhone Safari has no
Fullscreen API at all, so there the answer is **Share -> Add to Home Screen**:
the manifest and `apple-mobile-web-app-capable` make it launch with no browser
chrome at all. Landscape is the better orientation either way — a 16:9 view in
portrait is limited by the width of the phone.

## The loop

**Earning.** Customers come in, queue at the counter, order, take a seat and
stay a while. Each one waiting holds a speech bubble showing the item they want,
so you can read the room at a glance. Press Space at them to serve them
yourself — it's faster and they tip. If you ignore them they get served anyway,
but more slowly and less happily, and if nobody is minding the counter at all
they leave.

Money comes from the difference between what you pay a supplier for a portion
and what a customer pays you. Cake has a better margin than coffee. Everything
has a shelf life, so over-buying loses money to spoilage.

**Charm** drives how many people come, and it's the sum of three things: the
furniture in your rooms, the cats, and how good and varied the menu is. Weekends
bring about 60% more custom. Once a room is full, people look in and walk on —
that's the signal to buy more chairs, and eventually more room to put them in.

**Cats** cost 4 a day each whether you open or not. Feed them well and their
coats improve, which visibly draws a crowd; feed them badly and they get thin,
unhappy, and ill. Illness spreads between cats, so a sneeze means a trip to the
vet in Saltmere. Grooming lasts about a week. Rare breeds cost a great deal and
are worth it.

Walk up to any cat and press Space to offer whatever you're carrying: a treat, a
quick brush, medicine if they've only just fallen ill, or catnip — which sets the
whole room off. Vitamins sitting in your bag quietly make illness less likely.
The Cats tab of the cafe book does the same thing in one keypress.

**Furnishing and building.** Open the cafe book with **C** and press Space on
the first page to get a plan of your cafe. Furniture you've bought sits in your
bag in the colourway you chose at the till — chairs, stools, sofas and dressed
tables all come in three. Space to put a piece down, X to pick it back up,
M/I or Shift to change which piece, Esc when you're done. The Style tab changes
the roof, awning and wall colour of the shopfront — it shows a live preview of
the exterior, since you can't see it from inside.

The Floors tab lays a floor per room rather than one for the whole cafe: oak or
walnut boards, chequer or terracotta tile, flagstones, three carpets — and three
that mean outside. Lay paving, brick or decking and that room becomes a patio,
with black metal railings round it instead of plaster walls. Velvet & Oak sell
the furniture to put on it: patio chairs, stools, tables, a garden bench, an
umbrella table, and a stone fountain that costs an absurd amount and is worth it.

The weather falls on a patio, because a patio has sky over it. Rain lands on the
paving and stops dead at the cafe wall, the terrace goes grey under a grey sky
while the room it opens off stays warmly lit, and standing out there you hear the
rain unmuffled instead of through a roof. An umbrella table keeps the tiles under
its canopy dry, which is the other half of what you paid for.

Adding *rooms* needs a hired crew: Trowel & Sons in Hollowdown (weekdays,
7am–4pm) sell builders and timber, and your crew size caps how much floor you're
allowed. Until you've hired someone the Rooms tab simply isn't offered. The plan
is drawn with the same tiles and sprites as the real interior, so what you lay
out is what you walk around in.

**Staff.** Once you have a reputation, hire someone so the cafe keeps earning
while you're out exploring. They are paid by the hour, and the hours are the
ones you post on the sign — 8 to 4 bills eight hours — so shorter days are a
real saving and a real cost. Pay them fairly: underpay and service degrades and
they eventually quit; overpay and you won't clear your costs — left and right
on the wage row move it a pound an hour. Posted hours are
when the staff are in, not when the door is locked; behind your own counter you
can serve somebody at any hour.

## The valley

Five settlements — Brambleford, Hollowdown, Saltmere, Thistlewick and Oakhollow
— joined by roads across meadow, woodland, chalk downs and two rivers, with the
sea in the south-west. Around sixty villagers live there, all animals, all with
something to say and some with jobs for you. Several shops only open on certain
days and certain hours; some paths are blocked until you have the right tool.
Those three blockages are placed by measurement rather than by eye: a chalk slab
sits mid-deck on the river bridge due east of home, brambles grow across the
crossing to the mill, and a boulder plugs a notch cut through a cliff. In each
case the world generator checks the walk around before it commits, so clearing
one genuinely opens something — the bridge alone saves 272 steps of a 491-step
walk to Thistlewick, and the cliff notch leads somewhere with no way round at
all.

Mail birds carry letters between friends. Taxi birds will fly you to anywhere
you've already visited, for a fare, between 7am and 7pm — one comes down,
collects you in a wicker basket, and sets you down at the far end. The map
groups everywhere you've been under its town.

A day is twenty real minutes, with a full dawn-to-night cycle and a day of the
week that shops and customers both care about.

## How it's built

No assets, no dependencies, no build step. Everything is generated at runtime:

```
src/
  engine/    canvas + scaler, input, 5x8 bitmap font, indexed-pixel buffers,
             procedural Web Audio (lo-fi music scheduler, SFX, ambience beds)
  art/       palette, terrain painters with autotiled edges, chibi character
             compositor (20 species x 21 coats), cat breeds, object and
             building painters, item icons
  world/     seeded terrain generation (coast, rivers, cliffs, biomes), town
             stamping, A* roads with bridges, interiors, chunked renderer
  game/      clock, items, economy, cafe simulation, cats, quests, save/load
  ui/        panels, dialogue, HUD, shop and management screens, build mode
  net/       the client half of the shared session
server/      dependency-free WebSocket server and the shared room
```

**Art** is painted procedurally into small pixel buffers and baked once into
canvases. Characters are a chibi template plus species-specific ears, muzzles
and extras, recoloured per villager — which is how twenty species and a handful
of palettes become sixty distinguishable people.

**Sound** is entirely synthesised. Music is a lookahead scheduler playing jazz
chord loops on a two-operator FM voice, upright bass and brushed drums, with
different progressions per area and a sparser night variant. Meows are swept
formant bands; purrs are amplitude-modulated noise; ambience is filtered noise
beds whose levels follow the terrain around you.

**Rendering** bakes ground into 16x16-tile chunk canvases and y-sorts everything
with a footprint into one list, so trees and roofs correctly overlap you.

## Testing

There's a headless smoke test that drives the game through scenarios in a real
browser and reports console errors.

Run the long sweeps under `caffeinate`. Left alone for a few minutes, macOS
suspends the headless browser, and a scenario that would take seven seconds
sits there for seventeen minutes and then reports no summary. It looks exactly
like a hang in whatever scenario it landed on, it lands on a different one
every run, and every one of them passes when run by itself. That is the tell:
scattered timeouts with no failures and no exceptions are the machine napping,
not the game.

```bash
caffeinate -dimsu node tools/check.js all --clean   # everything, about five minutes
node tools/check.js quests --clean    # just the quest scenarios, about a minute
node tools/pairs.js                   # the ones needing two browsers at once
node tools/wsframes.js                # WebSocket framing, no browser needed
node tools/imports.js                 # names a module uses but never imports

node tools/check.js ghostquest --clean          # one scenario by name
node tools/pairs.js netcafe                     # one pair by name
node tools/check.js slow --clean                # the keepalive ones, minutes each
node tools/check.js town --shotdir /tmp/shots   # also writes screenshots
```

Scenarios say when they have finished and the runner moves on the moment they
do, so the per-scenario times in `check.js` are ceilings rather than waits: a
run costs what it actually needs, and a ceiling being hit means something hung.
The named groups — `quests`, `cafe`, `world`, `ui`, `mobile`, `net`, `cutscene`,
`slow`, `all` — exist so a change can be checked against what it could
plausibly have broken, with `all` before committing.

`netsave`/`netsaved` are still run by hand, since they bracket a server restart:

```bash
SESSION_SAVE=/tmp/v.json node server.js &
node tools/check.js netsave --clean
# restart the server on the same file, then
node tools/check.js netsaved --clean
```

Scenarios cover walking the overworld, the cafe trading loop, entering shops,
build mode and furnishing, the map, night lighting, door round-trips, the
taxi flight, a night at the inn, and a full day rollover with a save/load
check.

It pre-enables the debugger, so if the page ever wedges it interrupts V8 and
prints the stack rather than hanging silently.
