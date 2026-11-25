// Hardy Z(t) plot around the camera's t, the zero counter and N(T).
import { hardyZ, MIN_T, nSmooth, zerosPassed } from '../math/zeta';

export type ZFn = (t: number) => number;

export function makeZ(lowT: (t: number) => number): ZFn {
  return (t) => (t < MIN_T ? lowT(t) : hardyZ(t));
}

export interface PlotStyle {
  halfWindow: number;
  samples: number;
  yMax: number;
  font: string;
  lineWidth: number;
  labels: boolean;
}

const DEFAULT_STYLE: PlotStyle = { halfWindow: 9, samples: 480, yMax: 4.2, font: '12px Inter Variable, Inter, sans-serif', lineWidth: 2, labels: true };

/** Draw Z(t) on [t − w, t + w]; zeros (sign changes) marked; the camera t marked by a vertical line. */
export function drawZPlot(
  canvas: HTMLCanvasElement, Z: ZFn, tc: number, gammas: readonly number[], style: Partial<PlotStyle> = {},
): void {
  const s = { ...DEFAULT_STYLE, ...style };
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const t0 = tc - s.halfWindow;
  const t1 = tc + s.halfWindow;
  const pad = s.labels ? 18 : 6;
  const X = (t: number) => ((t - t0) / (t1 - t0)) * W;
  const Y = (z: number) => H / 2 - (Math.max(-s.yMax, Math.min(s.yMax, z)) / s.yMax) * (H / 2 - pad);

  // axis
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();
  // integer t ticks
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = s.font;
  for (let t = Math.ceil(Math.max(0, t0)); t <= t1; t++) {
    const x = X(t);
    const big = t % 5 === 0;
    ctx.fillRect(x, H / 2 - (big ? 4 : 2), 1, big ? 8 : 4);
    if (big && s.labels) ctx.fillText(String(t), x + 3, H - 3);
  }

  // curve: positive part cyan, negative part pink
  ctx.lineWidth = s.lineWidth;
  ctx.lineJoin = 'round';
  let prev: [number, number] | null = null;
  for (let k = 0; k <= s.samples; k++) {
    const t = t0 + (k / s.samples) * (t1 - t0);
    if (t < 0) continue;
    const z = Z(t);
    const pt: [number, number] = [X(t), Y(z)];
    if (prev) {
      ctx.strokeStyle = z >= 0 ? '#7fd8ff' : '#ff9ec0';
      ctx.beginPath();
      ctx.moveTo(prev[0], prev[1]);
      ctx.lineTo(pt[0], pt[1]);
      ctx.stroke();
    }
    prev = pt;
  }

  // zeros in view: sign changes of Z, placed at the exact γ_n
  const first = zerosPassed(t0, gammas);
  for (let i = first; i < gammas.length && gammas[i] <= t1; i++) {
    const x = X(gammas[i]);
    const passed = gammas[i] <= tc;
    ctx.fillStyle = passed ? '#ffd27a' : 'rgba(255,210,122,0.45)';
    ctx.beginPath();
    ctx.arc(x, H / 2, passed ? 4.5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
    if (s.labels) {
      ctx.fillStyle = passed ? 'rgba(255,210,122,0.95)' : 'rgba(255,210,122,0.5)';
      ctx.fillText(`γ${sub(i + 1)}`, x + 5, H / 2 - 7);
    }
  }

  // camera marker
  const xc = X(tc);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(xc, 4);
  ctx.lineTo(xc, H - 4);
  ctx.stroke();
  ctx.setLineDash([]);
  if (s.labels) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('Z(t)', 4, 13);
  }
}

const SUB = '₀₁₂₃₄₅₆₇₈₉';
export function sub(n: number): string {
  return String(n).split('').map((d) => SUB[+d]).join('');
}

export class Hud {
  private lastK = -1;
  constructor(
    private Z: ZFn,
    private gammas: readonly number[],
    private els = {
      plot: document.getElementById('zplot') as HTMLCanvasElement,
      t: document.getElementById('hud-t')!,
      k: document.getElementById('hud-k')!,
      nt: document.getElementById('hud-nt')!,
    },
  ) {}

  update(t: number): number {
    const tc = Math.max(0, t);
    drawZPlot(this.els.plot, this.Z, tc, this.gammas);
    const k = zerosPassed(tc, this.gammas);
    this.els.t.textContent = tc.toFixed(2);
    if (k !== this.lastK) {
      this.els.k.textContent = String(k);
      this.lastK = k;
    }
    this.els.nt.textContent = tc >= MIN_T ? nSmooth(tc).toFixed(2) : '—';
    return k;
  }
}
