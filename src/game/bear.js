// The riding bear: the only way across the valley that ignores the valley.
//
// She is not a vehicle. She is an animal who has agreed to carry you, which is
// why she has to be fed before she will, why she wanders off a few paces when
// you leave her, and why she sleeps in the afternoon like everything else with
// fur in this game.
//
// Everything here is a rule rather than a behaviour: where she waits, what she
// costs, whether she has eaten. The lounging about lives in entities.js and the
// riding lives in main.js.

/** What the drover in Thistlewick wants for her. Paid once, ever. */
export const BEAR_PRICE = 5000;

/** Deliveries you have to have run before anybody mentions her. */
export const BEAR_AFTER_DELIVERIES = 10;

/** What she eats, and how much of it. One fish, one day. */
export const BEAR_FOOD = 'fresh_fish';

/**
 * Riding speeds. Walking her is as quick as running on your own two feet —
 * that is the point of her — and asking for more gets it.
 */
export const BEAR_SPEED = 104;
export const BEAR_RUN = 168;

/** A day's grazing counts from the morning, not from the meal. */
export function fedToday(bear, clock) {
  return !!bear && bear.fedDay === clock.day;
}

/**
 * Can she be ridden as she stands? Either she has eaten today, or there is a
 * fish about your person to change her mind.
 */
export function rideable(bear, clock, fishCount) {
  if (!bear) return false;
  return fedToday(bear, clock) || fishCount > 0;
}

/** Where she is put down when the drover walks her over. */
export function deliverySpot(door) {
  return { x: door.x + 2, y: door.y + 2 };
}

/** What the prompt over her head should say. */
export function bearPrompt(bear, clock, fishCount) {
  if (fedToday(bear, clock)) return 'Ride the bear';
  if (fishCount > 0) return 'Feed the bear a fish';
  return 'She wants a fish';
}
