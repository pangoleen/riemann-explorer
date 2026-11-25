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

/** Cubic Hermite time warp on [0, 1] with end slopes m0, m1 (u(0) = 0, u(1) = 1). */
const hermite = (x: number, m0: number, m1: number): number => {
  const x2 = x * x;
  const x3 = x2 * x;
  return (x3 - 2 * x2 + x) * m0 + (-2 * x3 + 3 * x2) + (x3 - x2) * m1;
};
const fixedEase = (e: Ease, x: number): number | null => {
  switch (e) {
    case 'linear': return x;
    case 'in': return x * x * x;
    case 'out': return 1 - Math.pow(1 - x, 3);
    default: return null; // 'inOut': smooth, with speeds matched at both keys
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
  /** Per segment: Hermite end slopes, so the camera's world speed is continuous at every key. */
  private slopes: [number, number][] = [];

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
    this.computeSlopes();
  }

  private computeSlopes(): void {
    const k = this.k;
    const n = k.length - 1;
    const curve = this.posCurve;
    // |dP/du| at the ends of segment i (u = local parameter), and its arc length
    const dP = (i: number, u: number) => {
      const h = 1e-4;
      const a = curve.getPoint(Math.max(0, (i + u - h)) / n);
      const b = curve.getPoint(Math.min(n, (i + u + h)) / n);
      return a.distanceTo(b) / ((Math.min(n, i + u + h) - Math.max(0, i + u - h)));
    };
    const len: number[] = [];
    for (let i = 0; i < n; i++) {
      let L = 0;
      let prev = curve.getPoint(i / n);
      for (let s = 1; s <= 64; s++) {
        const p = curve.getPoint((i + s / 64) / n);
        L += p.distanceTo(prev);
        prev = p;
      }
      len.push(L);
    }
    const T = (i: number) => k[i + 1].t - k[i].t;
    const isLinear = (i: number) => i >= 0 && i < n && k[i].ease === 'linear';
    // world speed at each key
    const speed: number[] = [];
    for (let j = 0; j <= n; j++) {
      if (isLinear(j - 1)) speed.push(dP(j - 1, 1 - 1e-3) / T(j - 1));
      else if (isLinear(j)) speed.push(dP(j, 1e-3) / T(j));
      else if (j === 0) speed.push(len[0] / T(0));
      else if (j === n) speed.push(len[n - 1] / T(n - 1));
      else speed.push(0.5 * (len[j - 1] / T(j - 1) + len[j] / T(j)));
    }
    for (let i = 0; i < n; i++) {
      const m0 = (speed[i] * T(i)) / Math.max(1e-6, dP(i, 1e-3));
      const m1 = (speed[i + 1] * T(i)) / Math.max(1e-6, dP(i, 1 - 1e-3));
      this.slopes.push([Math.min(3, m0), Math.min(3, m1)]); // ≤ 3 keeps u(x) monotone
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
    const u = fixedEase(k[i].ease ?? 'inOut', x) ?? hermite(x, this.slopes[i][0], this.slopes[i][1]);
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
