import { describe, expect, it } from 'vitest';
import ref from './fixtures/zeta_ref.json';
import zeros from './fixtures/zeros.json';
import {
  countZeros, hardyZ, nSmooth, signChanges, theta, zRiemannSiegel, zerosPassed,
} from '../src/math/zeta';

const gammas = (zeros.gammas as string[]).map(Number);

describe('theta(t)', () => {
  it('matches mpmath.siegeltheta at 50 points in [10, 1000]', () => {
    ref.t.forEach((t, i) => {
      expect(Math.abs(theta(t) - ref.theta[i])).toBeLessThan(1e-9);
    });
  });
});

describe('Z(t)', () => {
  it('matches mpmath.siegelz at 50 points in [10, 1000] to < 1e-6', () => {
    let worst = 0;
    ref.t.forEach((t, i) => {
      const err = Math.abs(hardyZ(t) - ref.Z[i]);
      const rel = err / Math.max(1, Math.abs(ref.Z[i]));
      worst = Math.max(worst, Math.min(err, rel));
      expect(Math.min(err, rel)).toBeLessThan(1e-6);
    });
    console.log(`Z(t) worst error over 50 points: ${worst.toExponential(2)}`);
  });

  it('Riemann–Siegel C0..C4 alone is < 1e-6 for t ≥ 100 (documents the switch point)', () => {
    ref.t.forEach((t, i) => {
      if (t >= 100) expect(Math.abs(zRiemannSiegel(t) - ref.Z[i])).toBeLessThan(1e-6);
    });
  });
});

describe('zeros', () => {
  it('sign changes of Z, refined by bisection, give the first 100 zeros to < 1e-6', () => {
    const found = signChanges(gammas[99] + 0.5);
    expect(found.length).toBe(100);
    found.forEach((z, i) => expect(Math.abs(z - gammas[i])).toBeLessThan(1e-6));
  });

  it('N(100) = 29 and N(1000) = 649', () => {
    expect(countZeros(100)).toBe(29);
    expect(countZeros(1000)).toBe(649);
    expect(zerosPassed(100, gammas)).toBe(29);
    expect(zerosPassed(1000, gammas)).toBe(649);
  });

  it('zerosPassed increments exactly at each γ', () => {
    for (let k = 0; k < 29; k++) {
      expect(zerosPassed(gammas[k] - 1e-9, gammas)).toBe(k);
      expect(zerosPassed(gammas[k], gammas)).toBe(k + 1);
    }
  });

  it('smooth Riemann–von Mangoldt term is close to N(T)', () => {
    expect(Math.abs(nSmooth(100) - 29)).toBeLessThan(1.5);
    expect(Math.abs(nSmooth(1000) - 649)).toBeLessThan(1.5);
  });
});
