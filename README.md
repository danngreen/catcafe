# Cat Cafe

A whimsical 16-bit-style browser game. You are a cat who walks on two legs and
runs a cat cafe in a rural valley. Serve coffee, keep cats, explore five
settlements, and slowly turn one small tea room into somewhere people go out of
their way for.

## Running it

```bash
npm start          # serves on http://localhost:8080
```

Any static file server works — the game is plain ES modules with no build step.
It does need to be served over HTTP (modules don't load from `file://`).

## Controls

| Key | Does |
| --- | --- |
| Arrows / WASD | Walk |
| Shift | Run |
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
float over the edges of the view; in portrait they take a band under it.

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
node tools/check.js walk cafe shop furnshop build furnish exterior treats taxi sleep map night door title systems1 systems2 --clean
node tools/check.js town --shotdir /tmp/shots      # also writes screenshots
```

Scenarios cover walking the overworld, the cafe trading loop, entering shops,
build mode and furnishing, the map, night lighting, door round-trips, the
taxi flight, a night at the inn, and a full day rollover with a save/load
check.

It pre-enables the debugger, so if the page ever wedges it interrupts V8 and
prints the stack rather than hanging silently.
