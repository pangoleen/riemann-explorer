// Hardy Z(t), Riemann–Siegel θ(t), zero counting.
//
// Z(t) = e^{iθ(t)} ζ(1/2 + it) is real. Methods by range:
//   t ≥ 100       Riemann–Siegel formula with corrections C0..C4
//   10 ≤ t < 100  Euler–Maclaurin ζ(1/2 + it), then rotate by θ(t)
//   t < 10        not handled here: callers use the precomputed grid
//                 (Z(t) = −|ζ(1/2 + it)| there, since Z has no zero below γ₁ ≈ 14.13)
//
// Why two methods: with C0..C4 the Riemann–Siegel error is 1.5e-5 at t = 10
// and only drops below 1e-6 near t = 40 (see tests/zeta.test.ts). Euler–Maclaurin
// is accurate to ~1e-12 at these heights and still cheap.

import { RS_COEFFS } from './rsCoeffs';

const TWO_PI = 2 * Math.PI;
export const RS_MIN_T = 100;
export const MIN_T = 10;

/** Riemann–Siegel theta via its asymptotic series. Accurate to ~1e-13 for t ≥ 10. */
export function theta(t: number): number {
  const it = 1 / t;
  const it2 = it * it;
  return (
    (t / 2) * Math.log(t / TWO_PI) -
    t / 2 -
    Math.PI / 8 +
    it * (1 / 48 + it2 * (7 / 5760 + it2 * (31 / 80640 + it2 * (127 / 430080 + it2 * (511 / 1216512)))))
  );
}

function poly(c: readonly number[], x: number): number {
  let s = 0;
  for (let j = c.length - 1; j >= 0; j--) s = s * x + c[j];
  return s;
}

/** Riemann–Siegel Z(t) with C0..C4. Use for t ≥ 100 (good to ~4e-8 at t = 100). */
export function zRiemannSiegel(t: number): number {
  const a = Math.sqrt(t / TWO_PI);
  const N = Math.floor(a);
  const p = a - N;
  const th = theta(t);
  let s = 0;
  for (let n = 1; n <= N; n++) s += Math.cos(th - t * Math.log(n)) / Math.sqrt(n);
  const x = p - 0.5;
  let R = 0;
  let w = 1;
  for (let k = 0; k < RS_COEFFS.length; k++) {
    R += w * poly(RS_COEFFS[k], x);
    w /= a;
  }
  const sign = (N - 1) % 2 === 0 ? 1 : -1;
  return 2 * s + (sign * R) / Math.sqrt(a);
}

// B_{2k} / (2k)! = (−1)^{k+1} · 2 ζ(2k) / (2π)^{2k}
const EM_TERMS = 18;
const BERN: number[] = (() => {
  const out: number[] = [];
  for (let k = 1; k <= EM_TERMS; k++) {
    // ζ(2k): direct sum to M, plus the Euler–Maclaurin tail ∫_M^∞ + ½·M^{-2k}
    const M = 1000;
    let z = 0;
    for (let n = M; n >= 1; n--) z += Math.pow(n, -2 * k);
    z += Math.pow(M, 1 - 2 * k) / (2 * k - 1) - 0.5 * Math.pow(M, -2 * k);
    out.push(((k % 2 === 1 ? 1 : -1) * 2 * z) / Math.pow(TWO_PI, 2 * k));
  }
  return out;
})();

/** ζ(σ + it) by Euler–Maclaurin summation. Returns [re, im]. Not for s near 1. */
export function zetaEM(sigma: number, t: number): [number, number] {
  const N = Math.max(12, Math.ceil(Math.abs(t) / Math.PI) + 6);
  let re = 0;
  let im = 0;
  // Σ_{n<N} n^{-s}
  for (let n = 1; n < N; n++) {
    const ln = Math.log(n);
    const m = Math.exp(-sigma * ln);
    re += m * Math.cos(t * ln);
    im -= m * Math.sin(t * ln);
  }
  const lnN = Math.log(N);
  // N^{-s} = e^{-σ lnN} (cos(t lnN) − i sin(t lnN))
  const mN = Math.exp(-sigma * lnN);
  const nsRe = mN * Math.cos(t * lnN);
  const nsIm = -mN * Math.sin(t * lnN);
  // N^{1-s}/(s-1) = N · N^{-s} / (s − 1)
  {
    const aRe = N * nsRe;
    const aIm = N * nsIm;
    const dRe = sigma - 1;
    const dIm = t;
    const den = dRe * dRe + dIm * dIm;
    re += (aRe * dRe + aIm * dIm) / den;
    im += (aIm * dRe - aRe * dIm) / den;
  }
  re += nsRe / 2;
  im += nsIm / 2;
  // Σ_k B_{2k}/(2k)! · s(s+1)…(s+2k−2) · N^{−s−2k+1}
  let pRe = sigma; // running product (s)_{2k-1}, starts at s
  let pIm = t;
  let powRe = nsRe / N; // N^{-s-1}
  let powIm = nsIm / N;
  const invN2 = 1 / (N * N);
  for (let k = 1; k <= EM_TERMS; k++) {
    const termRe = BERN[k - 1] * (pRe * powRe - pIm * powIm);
    const termIm = BERN[k - 1] * (pRe * powIm + pIm * powRe);
    re += termRe;
    im += termIm;
    if (Math.abs(termRe) + Math.abs(termIm) < 1e-17) break;
    // p *= (s + 2k − 1)(s + 2k)
    for (const j of [2 * k - 1, 2 * k]) {
      const fr = sigma + j;
      const nr = pRe * fr - pIm * t;
      const ni = pRe * t + pIm * fr;
      pRe = nr;
      pIm = ni;
    }
    powRe *= invN2;
    powIm *= invN2;
  }
  return [re, im];
}

/** Hardy Z(t) for t ≥ 10. */
export function hardyZ(t: number): number {
  if (t >= RS_MIN_T) return zRiemannSiegel(t);
  const [re, im] = zetaEM(0.5, t);
  const th = theta(t);
  return Math.cos(th) * re - Math.sin(th) * im;
}

/** Smooth part of the Riemann–von Mangoldt formula: θ(T)/π + 1. */
export function nSmooth(T: number): number {
  return theta(T) / Math.PI + 1;
}

/** Number of γ in `gammas` (sorted) with γ ≤ t. */
export function zerosPassed(t: number, gammas: readonly number[]): number {
  let lo = 0;
  let hi = gammas.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (gammas[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Bisection on a sign change of Z in [a, b]. */
export function refineZero(a: number, b: number, tol = 1e-12): number {
  let fa = hardyZ(a);
  for (let i = 0; i < 80 && b - a > tol; i++) {
    const m = 0.5 * (a + b);
    const fm = hardyZ(m);
    if (fm === 0) return m;
    if (Math.sign(fm) === Math.sign(fa)) {
      a = m;
      fa = fm;
    } else b = m;
  }
  return 0.5 * (a + b);
}

/**
 * Sign changes of Z on [10, T], scanned with step h. No zero lies below
 * t = 10 (γ₁ ≈ 14.13), so the result is N(T) as long as h is smaller than
 * the closest pair of zeros (the closest gap below t = 1000 is ≈ 0.31, near t = 750.6).
 */
export function signChanges(T: number, h = 0.01): number[] {
  const out: number[] = [];
  let a = MIN_T;
  let fa = hardyZ(a);
  while (a < T) {
    const b = Math.min(T, a + h);
    const fb = hardyZ(b);
    if (fa !== 0 && Math.sign(fb) !== Math.sign(fa)) out.push(refineZero(a, b));
    a = b;
    fa = fb;
  }
  return out;
}

export function countZeros(T: number, h = 0.01): number {
  return T < MIN_T ? 0 : signChanges(T, h).length;
}
