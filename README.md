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

That is what makes the pantry a decision rather than a chore. Basics sell to
almost everyone but cheaply; the expensive things are what people ask for first,
and are worth stocking precisely because that is where the money is. Not
everyone has something plain they'll settle for, so some walk out no matter what.
The morning card tells you what was asked for that you hadn't got, which is
tomorrow's shopping list.

The customer simulation runs on exactly one client (the longest-standing player),
which publishes where its customers are standing so the rest can draw them. That
matters: if every client simulated the room, the same cup of coffee would be sold
once per player. Anyone can still serve — a press of Space asks whoever is
running the room to take the order.

The server keeps the shared cafe in `valley.json` beside `server.js`, so closing
the laptop doesn't cost anyone their afternoon. `SESSION_SAVE=0 npm start` plays
without saving; `SESSION_SAVE=/some/path.json` puts it elsewhere.

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

If something looks wrong, there are two places to look. Add `?netdebug` to the
URL for the client's view: link state, who the server thinks runs the cafe,
round-trip time, how long since anything was heard, and how many times you've
dropped. Open `/status` on the host — `http://192.168.x.x:8080/status` — for the
server's view: every socket, whether it has actually joined the game, where it
is, and how long it has been silent. When two screens disagree about who can
see whom, that page settles it. The server also prints a line whenever it hangs
up on anyone, and why.

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
the floor, and the roof, awning and wall colour of the shopfront — it shows a
live preview of the exterior, since you can't see it from inside.

Adding *rooms* needs a hired crew: Trowel & Sons in Hollowdown (weekdays,
7am–4pm) sell builders and timber, and your crew size caps how much floor you're
allowed. Until you've hired someone the Rooms tab simply isn't offered. The plan
is drawn with the same tiles and sprites as the real interior, so what you lay
out is what you walk around in.

**Staff.** Once you have a reputation, hire someone so the cafe keeps earning
while you're out exploring. Pay them fairly: underpay and service degrades and
they eventually quit; overpay and you won't clear your costs.

## The valley

Five settlements — Brambleford, Hollowdown, Saltmere, Thistlewick and Oakhollow
— joined by roads across meadow, woodland, chalk downs and two rivers, with the
sea in the south-west. Around sixty villagers live there, all animals, all with
something to say and some with jobs for you. Several shops only open on certain
days and certain hours; some paths are blocked until you have the right tool.

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
browser and reports console errors:

```bash
node tools/check.js walk cafe shop furnshop build furnish exterior treats taxi sleep map night door wishlist summarylines title systems1 systems2 --clean
node tools/check.js runmobile tabmobile pausemobile dialogmobile --mobile 844x390 --clean   # touch
node tools/check.js net netmobile netbooks netclock netdrop netforget solo --clean  # multiplayer
node tools/check.js netping netmute netidle netpollquiet --ms 82000 --clean   # keepalive (slow)
node tools/check.js netpollbooks netfallback --ms 40000 --clean      # the HTTP transport
node tools/wsframes.js                                  # WebSocket framing, no browser needed
# Paired scenarios need two browsers at once: start the first in the background,
# then the second a few seconds later (netfound/netguest, netcafehost/netcafeguest,
# nettitle/netpresence). netsave/netsaved bracket a server restart.
node tools/check.js town --shotdir /tmp/shots      # also writes screenshots
```

Scenarios cover walking the overworld, the cafe trading loop, entering shops,
build mode and furnishing, the map, night lighting, door round-trips, the
taxi flight, a night at the inn, and a full day rollover with a save/load
check.

It pre-enables the debugger, so if the page ever wedges it interrupts V8 and
prints the stack rather than hanging silently.
