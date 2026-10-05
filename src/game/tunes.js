// What comes out of a piano when you sit down at it: a few bars of something,
// picked at random. Old favourites everybody half knows (all long out of
// copyright), and a few little jingles of the valley's own.
//
// Each note is [beat, pitch, beats], where pitch is a MIDI number (60 is middle
// C) or a list of them for a chord, and beats are at the tune's `bpm`. The
// tune's number in this list is what goes over the network, so others in the
// room hear the same one: add new tunes on the end.

const C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69, B4 = 71;
const C5 = 72, D5 = 74, E5 = 76, F5 = 77, G5 = 79, A5 = 81, C6 = 84;
const C3 = 48, E3 = 52, F3 = 53, G3 = 55, A3 = 57, B3 = 59;

export const TUNES = [
  {
    name: 'Shave and a Haircut',
    bpm: 150,
    notes: [
      [0, C5, 1], [1, G4, 0.5], [1.5, G4, 0.5], [2, A4, 1], [3, G4, 1],
      [5, B4, 1], [6, [C3, E4, G4, C5], 2],
    ],
  },
  {
    name: 'Twinkle, Twinkle, Little Star',
    bpm: 160,
    notes: [
      [0, [C3, C5], 1], [1, C5, 1], [2, [E3, G5], 1], [3, G5, 1],
      [4, [F3, A5], 1], [5, A5, 1], [6, [E3, G5], 2],
      [8, [F3, F5], 1], [9, F5, 1], [10, [C3, E5], 1], [11, E5, 1],
      [12, [G3, D5], 1], [13, D5, 1], [14, [C3, E4, C5], 2],
    ],
  },
  {
    name: 'Ode to Joy',
    bpm: 150,
    notes: [
      [0, [C3, E5], 1], [1, E5, 1], [2, F5, 1], [3, G5, 1],
      [4, [G3, G5], 1], [5, F5, 1], [6, E5, 1], [7, D5, 1],
      [8, [A3, C5], 1], [9, C5, 1], [10, D5, 1], [11, E5, 1],
      [12, [G3, E5], 1.5], [13.5, D5, 0.5], [14, [G3, B3, D5], 2],
    ],
  },
  {
    name: 'Fur Elise',
    bpm: 132,
    notes: [
      [0, E5, 0.5], [0.5, 75, 0.5], [1, E5, 0.5], [1.5, 75, 0.5], [2, E5, 0.5],
      [2.5, B4, 0.5], [3, D5, 0.5], [3.5, C5, 0.5],
      [4, [45, A4], 1], [5, C4, 0.5], [5.5, E4, 0.5], [6, A4, 0.5],
      [6.5, [40, B4], 1], [7.5, E4, 0.5], [8, 68, 0.5], [8.5, B4, 0.5],
      [9, [45, C5], 1.5],
    ],
  },
  {
    name: 'The Entertainer',
    bpm: 112,
    notes: [
      [0, D4, 0.25], [0.25, 63, 0.25], [0.5, E4, 0.25], [0.75, C5, 0.5],
      [1.25, E4, 0.25], [1.5, C5, 0.5], [2, E4, 0.25], [2.25, C5, 1.25],
      [3.5, C5, 0.25], [3.75, D5, 0.25], [4, 75, 0.25], [4.25, E5, 0.25],
      [4.5, C5, 0.25], [4.75, D5, 0.25], [5, E5, 0.5], [5.5, B4, 0.25],
      [5.75, D5, 0.5], [6.25, [C3, E4, G4, C5], 1.5],
    ],
  },
  {
    name: 'Frere Jacques',
    bpm: 150,
    notes: [
      [0, [C3, C5], 1], [1, D5, 1], [2, E5, 1], [3, C5, 1],
      [4, [C3, C5], 1], [5, D5, 1], [6, E5, 1], [7, C5, 1],
      [8, [E3, E5], 1], [9, F5, 1], [10, [C3, E4, G5], 2],
    ],
  },
  {
    name: 'Mary Had a Little Lamb',
    bpm: 160,
    notes: [
      [0, [C3, E5], 1], [1, D5, 1], [2, C5, 1], [3, D5, 1],
      [4, [C3, E5], 1], [5, E5, 1], [6, E5, 2],
      [8, [G3, D5], 1], [9, D5, 1], [10, D5, 2],
      [12, [C3, E5], 1], [13, G5, 1], [14, [C3, E4, G5], 2],
    ],
  },
  {
    name: 'Charge!',
    bpm: 168,
    notes: [
      [0, G4, 0.5], [0.5, C5, 0.5], [1, E5, 0.5], [1.5, G5, 1],
      [2.5, E5, 0.5], [3, [C3, E4, G4, G5], 2.5],
    ],
  },
  // The valley's own.
  {
    name: 'Doors Open',
    bpm: 132,
    notes: [
      [0, C5, 0.5], [0.5, E5, 0.5], [1, G5, 0.5], [1.5, C6, 1],
      [2.5, A5, 0.5], [3, G5, 0.5], [3.5, E5, 0.5], [4, F5, 0.5], [4.5, D5, 0.5],
      [5, [C3, G3, E4, C5], 2],
    ],
  },
  {
    name: 'Tiptoe Cat',
    bpm: 120,
    notes: [
      [0, [C3, C4], 0.5], [0.5, 63, 0.5], [1, F4, 0.5], [1.5, 66, 0.5],
      [2, G4, 1], [3, [C3, 70], 0.5], [3.5, G4, 0.5],
      [4, 66, 0.5], [4.5, F4, 0.5], [5, 63, 0.5], [5.5, F4, 0.5],
      [6, [C3, 58, C4], 1.5],
    ],
  },
  {
    name: 'Rainy Window',
    bpm: 96,
    notes: [
      [0, [A3, A4], 0.5], [0.5, C5, 0.5], [1, E5, 0.5], [1.5, A5, 1],
      [2.5, G5, 0.5], [3, [F3, E5], 0.5], [3.5, D5, 0.5], [4, C5, 0.5],
      [4.5, B4, 0.5], [5, [E3, B4], 1], [6, [A3, C4, E4, A4], 2],
    ],
  },
  {
    name: 'Sunny Side',
    bpm: 144,
    notes: [
      [0, [F3, A4], 0.5], [0.5, C5, 0.5], [1, F5, 1], [2, E5, 0.5], [2.5, F5, 0.5],
      [3, [C3, G5], 1], [4, A5, 0.5], [4.5, G5, 0.5], [5, F5, 0.5], [5.5, D5, 0.5],
      [6, [C3, E5], 0.5], [6.5, C5, 0.5], [7, [F3, A4, C5, F5], 2],
    ],
  },
];

/** How long a tune lasts, in seconds, to its last note's end. */
export function tuneLength(tune) {
  let beats = 0;
  for (const [at, , len] of tune.notes) beats = Math.max(beats, at + len);
  return (beats * 60) / tune.bpm;
}

/** A tune's number, picked at random, never the same one twice running. */
export function pickTune(last = -1, rand = Math.random) {
  if (TUNES.length < 2) return 0;
  if (!(last >= 0 && last < TUNES.length)) return Math.floor(rand() * TUNES.length);
  // One fewer to choose from, and step over the one just played.
  const n = Math.floor(rand() * (TUNES.length - 1));
  return n >= last ? n + 1 : n;
}
