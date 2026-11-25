// Evaluates the story timeline at a time t. Pure function of t: no clocks,
// no randomness, so capture is deterministic.
import * as THREE from 'three';
import { CAPTION_FADE, captions, DURATION, keys, tracks, type Ease, type Key } from './timeline';

export interface StoryState {
  t: number;
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
  blend: number;
  /** Landscape-local t of the camera (drives the counter and the lit zeros). */
  lineT: number;
  allLit: boolean;
  caption: string;
  captionOpacity: number;
  fade: number;
  hud: number;
  hudBig: number;
  galaxyReveal: number;
  leanCard: number;
  streak: number;
}

const ease = (e: Ease, x: number): number => {
  switch (e) {
    case 'linear': return x;
    case 'in': return x * x * x;
    case 'out': return 1 - Math.pow(1 - x, 3);
    default: return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }
};

function track(points: [number, number][], t: number): number {
  if (t <= points[0][0]) return points[0][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [t0, v0] = points[i];
    const [t1, v1] = points[i + 1];
    if (t <= t1) {
      const x = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
      const s = x * x * (3 - 2 * x);
      return v0 + (v1 - v0) * s;
    }
  }
  return points[points.length - 1][1];
}

export class StoryPlayer {
  readonly duration = DURATION;
  private posCurve: THREE.CatmullRomCurve3;
  private lookCurve: THREE.CatmullRomCurve3;
  private fov: number[] = [];
  private blend: number[] = [];

  constructor(private k: Key[] = keys) {
    this.posCurve = new THREE.CatmullRomCurve3(k.map((x) => new THREE.Vector3(...x.pos)), false, 'centripetal');
    this.lookCurve = new THREE.CatmullRomCurve3(k.map((x) => new THREE.Vector3(...x.look)), false, 'centripetal');
    let f = 50;
    let b = 0;
    for (const x of k) {
      f = x.fov ?? f;
      b = x.blend ?? b;
      this.fov.push(f);
      this.blend.push(b);
    }
  }

  state(tRaw: number): StoryState {
    const t = THREE.MathUtils.clamp(tRaw, 0, this.duration);
    const k = this.k;
    let i = k.length - 2;
    for (let j = 0; j < k.length - 1; j++) {
      if (t < k[j + 1].t) { i = j; break; }
    }
    const span = k[i + 1].t - k[i].t;
    const x = THREE.MathUtils.clamp((t - k[i].t) / span, 0, 1);
    const u = ease(k[i].ease ?? 'inOut', x);
    const n = k.length - 1;
    const pos = this.posCurve.getPoint((i + u) / n);
    const look = this.lookCurve.getPoint((i + u) / n);
    const fov = this.fov[i] + (this.fov[i + 1] - this.fov[i]) * u;
    const blend = this.blend[i] + (this.blend[i + 1] - this.blend[i]) * u;

    let caption = '';
    let captionOpacity = 0;
    for (const c of captions) {
      if (t >= c.from - 0.01 && t <= c.to + 0.01) {
        caption = c.text;
        captionOpacity = Math.min(1, (t - c.from) / CAPTION_FADE, (c.to - t) / CAPTION_FADE);
        captionOpacity = Math.max(0, captionOpacity);
        break;
      }
    }

    return {
      t, pos, look, fov, blend,
      lineT: pos.z + 50,
      allLit: false,
      caption,
      captionOpacity,
      fade: track(tracks.fade, t),
      hud: track(tracks.hud, t),
      hudBig: track(tracks.hudBig, t),
      galaxyReveal: track(tracks.galaxyReveal, t),
      leanCard: track(tracks.leanCard, t),
      streak: track(tracks.streak, t),
    };
  }
}
