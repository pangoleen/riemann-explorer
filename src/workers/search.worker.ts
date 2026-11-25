// Module-name search off the main thread: prefix and substring, top 50.
import { rankSearch, type NameTable } from '../ui/searchCore';

let table: NameTable | null = null;
let ready: Promise<void> | null = null;

function load(base: string): Promise<void> {
  if (!ready) {
    ready = fetch(`${base}/galaxy_modules.json`)
      .then((r) => r.json())
      .then((j: { dirs: string[]; dir: number[]; leaf: string[] }) => {
        const full = j.leaf.map((l, i) => (j.dirs[j.dir[i]] ? `${j.dirs[j.dir[i]]}.${l}` : l));
        table = { full, fullLower: full.map((s) => s.toLowerCase()), leafLower: j.leaf.map((s) => s.toLowerCase()) };
      });
  }
  return ready;
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data as { id: number; type: string; base?: string; q?: string; indices?: number[]; prefix?: string };
  if (m.type === 'init') {
    await load(m.base ?? '/data');
    postMessage({ id: m.id, type: 'ready', count: table!.full.length });
    return;
  }
  await ready;
  const t = table!;
  if (m.type === 'search') {
    const t0 = performance.now();
    const r = rankSearch(t, m.q ?? '', 50);
    postMessage({ id: m.id, type: 'search', ...r, ms: performance.now() - t0 });
  } else if (m.type === 'names') {
    postMessage({ id: m.id, type: 'names', names: (m.indices ?? []).map((i) => t.full[i]) });
  } else if (m.type === 'prefix') {
    const p = m.prefix ?? '';
    const out: number[] = [];
    for (let i = 0; i < t.full.length; i++) {
      const s = t.full[i];
      if (s === p || s.startsWith(p + '.')) out.push(i);
    }
    postMessage({ id: m.id, type: 'prefix', indices: out });
  }
};
