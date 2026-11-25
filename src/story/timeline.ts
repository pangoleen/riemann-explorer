// The story-mode script. Edit freely: times are in seconds, positions in world units.
//
// World frame: while blend = 0 the landscape is centred on the origin, so a
// landscape point (σ, log|ζ|, t) sits at world x = (σ − ½)·6, z = t − 50.
// The galaxy is centred on Main.lean at the origin.
//
// Camera: Catmull-Rom through `keys` (pos and look separately). Each segment
// uses the easing of the key it starts at ('inOut' by default, 'linear' for
// constant-speed glides). fov and blend ease between keys too.

export type V3 = [number, number, number];
export type Ease = 'inOut' | 'linear' | 'in' | 'out';

export interface Key {
  t: number;
  pos: V3;
  look: V3;
  fov?: number;   // degrees; carries over from the previous key if omitted
  blend?: number; // 0 = landscape, 1 = galaxy; carries over if omitted
  ease?: Ease;    // easing of the segment that starts at this key
}

export interface Caption {
  from: number;
  to: number;
  text: string;
}

/** Scalar tracks: piecewise linear between [time, value] points. */
export interface Tracks {
  fade: [number, number][];         // black overlay opacity
  hud: [number, number][];          // story HUD opacity
  hudBig: [number, number][];       // 0 small (top), 1 prominent (centre)
  galaxyReveal: [number, number][]; // 0 none → 1 all stars
  leanCard: [number, number][];     // Mathlib statement card opacity
  streak: [number, number][];       // extra star brightness during the fly-through
}

/** Landscape-local t → world z while blend = 0. */
const Z = (t: number) => t - 50;

export const DURATION = 45;

export const keys: Key[] = [
  // 0–5 s: black, then a high aerial view of the landscape
  { t: 0, pos: [30, 62, Z(-52)], look: [0, -3, Z(32)], fov: 42, blend: 0 },
  { t: 4.6, pos: [22, 44, Z(-40)], look: [0, -3, Z(26)] },
  // 5–17 s: descend onto the critical line and glide up it
  { t: 8.2, pos: [0, 3.6, Z(1.5)], look: [0, -0.8, Z(15)], fov: 50, ease: 'linear' },
  { t: 12.5, pos: [0, 3.4, Z(29)], look: [0, -0.8, Z(42)], ease: 'linear' },
  { t: 17, pos: [0, 3.4, Z(58)], look: [0, -0.8, Z(71)], ease: 'linear' },
  // 17–22 s: keep gliding while the Z(t) curve takes the stage
  { t: 21.6, pos: [0, 3.6, Z(88)], look: [0, -0.8, Z(101)] },
  // 22–30 s: pull up and back; the landscape shrinks into the Main.lean star
  { t: 24.6, pos: [8, 30, Z(132)], look: [0, 0, 0], fov: 50, blend: 0 },
  { t: 28.4, pos: [18, 46, 96], look: [0, 0, 0], blend: 1 },
  { t: 31, pos: [62, 44, 122], look: [-6, 0, 14] },
  // 30–40 s: fly through the galaxy into Development/AbelianVarietyTheory
  { t: 35, pos: [8, 22, 96], look: [-14, 0, 19], fov: 58 },
  { t: 38.6, pos: [-13, 2, 34], look: [-18, -1, 6] },
  // 40–45 s: settle under the Mathlib statement
  { t: 41.2, pos: [-44, 26, 118], look: [-12, 0, 14], fov: 50 },
  { t: 45, pos: [-52, 30, 132], look: [-12, 0, 14] },
];

export const captions: Caption[] = [
  { from: 1.2, to: 4.9, text: 'This is the Riemann zeta function.' },
  { from: 6.4, to: 16.6, text: 'Every zero we’ve ever found sits on one line. Re(s) = ½.' },
  { from: 17.3, to: 21.9, text: 'For 167 years nobody could prove they all do.' },
  { from: 23.0, to: 29.7, text: 'Last week a proof landed. 17 million lines of Lean, written with Claude.' },
  { from: 30.6, to: 39.6, text: '175,187 modules. Every one checked by machine.' },
  { from: 41.4, to: 44.2, text: 'Q.E.D.' },
];

export const tracks: Tracks = {
  fade: [[0, 1], [1.0, 1], [3.4, 0], [43.9, 0], [45, 1]],
  hud: [[0, 0], [7.6, 0], [8.8, 1], [22.2, 1], [23.4, 0]],
  hudBig: [[0, 0], [16.8, 0], [17.8, 1], [21.6, 1], [22.6, 0]],
  galaxyReveal: [[0, 0], [25.4, 0], [31.5, 1], [45, 1]],
  leanCard: [[0, 0], [40.2, 0], [41.4, 1], [45, 1]],
  streak: [[0, 0], [34, 0], [37, 1], [39.5, 1], [41, 0]],
};

/** Caption fade in/out time (s). */
export const CAPTION_FADE = 0.45;
