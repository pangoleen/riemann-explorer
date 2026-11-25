import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stats = JSON.parse(readFileSync('public/data/stats.json', 'utf8')) as Record<string, number | string>;
const report = readFileSync('pipeline/REPORT.md', 'utf8');

describe('stats card numbers come from REPORT.md', () => {
  for (const [k, v] of Object.entries(stats)) {
    it(`${k} = ${v}`, () => {
      const shown = typeof v === 'number' ? v.toLocaleString('en-US') : v;
      expect(report).toContain(`| \`${k}\` | ${shown} |`);
    });
  }
  it('card shows modules, lines, import edges and longest chain', () => {
    expect(stats.modules).toBe(175187);
    expect(stats.lines).toBe(17374215);
    expect(typeof stats.importEdges).toBe('number');
    expect(stats.longestChain).toBe(203);
  });
});
