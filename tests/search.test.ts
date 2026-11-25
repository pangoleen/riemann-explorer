import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rankSearch, type NameTable } from '../src/ui/searchCore';

const j = JSON.parse(readFileSync('public/data/galaxy_modules.json', 'utf8')) as { dirs: string[]; dir: number[]; leaf: string[] };
const full = j.leaf.map((l, i) => (j.dirs[j.dir[i]] ? `${j.dirs[j.dir[i]]}.${l}` : l));
const table: NameTable = { full, fullLower: full.map((s) => s.toLowerCase()), leafLower: j.leaf.map((s) => s.toLowerCase()) };

describe('module search', () => {
  it('holds all 175,187 module names', () => {
    expect(full.length).toBe(175187);
    expect(full).toContain('Main');
  });
  it('finds MainConclusion first', () => {
    const r = rankSearch(table, 'MainConclusion');
    expect(r.results[0].name).toBe('Development.AutomorphicArithmetic.CharacterBoxes.MainConclusion');
  });
  it('returns the top 50 for a common term, in under 50 ms', () => {
    rankSearch(table, 'warm');
    const t0 = performance.now();
    const r = rankSearch(table, 'Eisenstein');
    const ms = performance.now() - t0;
    expect(r.results.length).toBe(50);
    expect(r.total).toBeGreaterThan(700);
    expect(ms).toBeLessThan(50);
    console.log(`search "Eisenstein": ${r.total} matches in ${ms.toFixed(1)} ms`);
  });
  it('ranks an exact leaf match before substrings', () => {
    const r = rankSearch(table, 'main');
    expect(r.results[0].name).toBe('Main');
  });
});
