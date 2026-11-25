// Ranking for module-name search (shared by the worker and the tests).
export interface NameTable {
  full: string[];
  fullLower: string[];
  leafLower: string[];
}
export interface SearchResult {
  results: { i: number; name: string; score: number }[];
  total: number;
}

/**
 * Score (lower is better): 0 exact leaf, 1 leaf prefix, 2 leaf substring,
 * 3 full-name prefix, 4 full-name substring. Ties: shorter name, then A–Z.
 */
export function rankSearch(t: NameTable, query: string, limit = 50): SearchResult {
  const q = query.trim().toLowerCase();
  if (!q) return { results: [], total: 0 };
  const hits: { i: number; score: number }[] = [];
  const n = t.full.length;
  for (let i = 0; i < n; i++) {
    const leaf = t.leafLower[i];
    let score = -1;
    if (leaf === q) score = 0;
    else if (leaf.startsWith(q)) score = 1;
    else if (leaf.includes(q)) score = 2;
    else {
      const f = t.fullLower[i];
      if (f.startsWith(q)) score = 3;
      else if (f.includes(q)) score = 4;
    }
    if (score >= 0) hits.push({ i, score });
  }
  hits.sort((a, b) => a.score - b.score || t.full[a.i].length - t.full[b.i].length || (t.full[a.i] < t.full[b.i] ? -1 : 1));
  return {
    total: hits.length,
    results: hits.slice(0, limit).map((h) => ({ i: h.i, name: t.full[h.i], score: h.score })),
  };
}
