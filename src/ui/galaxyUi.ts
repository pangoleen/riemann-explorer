// Galaxy chrome: search box, side panel, breadcrumb, stats card, legend, picking.
import * as THREE from 'three';
import type { App } from '../main';
import type { Galaxy } from '../worlds/galaxy';
import { REPO_BLOB } from './links';

const $ = (id: string) => document.getElementById(id)!;
const fmt = (n: number) => n.toLocaleString('en-US');

class SearchClient {
  private worker = new Worker(new URL('../workers/search.worker.ts', import.meta.url), { type: 'module' });
  private seq = 0;
  private pending = new Map<number, (v: unknown) => void>();
  constructor(base: string) {
    this.worker.onmessage = (e) => {
      const r = this.pending.get(e.data.id);
      if (r) {
        this.pending.delete(e.data.id);
        r(e.data);
      }
    };
    void this.call({ type: 'init', base });
  }
  call<T = Record<string, unknown>>(msg: Record<string, unknown>): Promise<T> {
    const id = ++this.seq;
    return new Promise((res) => {
      this.pending.set(id, res as (v: unknown) => void);
      this.worker.postMessage({ ...msg, id });
    });
  }
}

export function mountGalaxyUi(app: App, g: Galaxy): void {
  const search = new SearchClient(g.base);
  const input = $('search-input') as HTMLInputElement;
  const list = $('search-results');
  const meta = $('search-meta');
  let current: { i: number; name: string }[] = [];
  let sel = 0;
  let qSeq = 0;

  const flyToIndex = (i: number, dist = 14) => {
    const p = g.positionOf(i).applyMatrix4(g.group.matrixWorld);
    const dir = app.camera.position.clone().sub(app.controls.target).normalize();
    app.tweenTo(p.clone().addScaledVector(dir, dist), p, 1.8);
  };

  const render = () => {
    list.innerHTML = '';
    const q = input.value.trim();
    current.forEach((r, k) => {
      const li = document.createElement('li');
      const dot = r.name.lastIndexOf('.');
      const leaf = r.name.slice(dot + 1);
      li.innerHTML = `<span class="leaf">${hl(leaf, q)}</span><span class="dir">${esc(r.name.slice(0, Math.max(0, dot)))}</span>`;
      li.className = k === sel ? 'sel' : '';
      li.onclick = () => choose(k);
      list.appendChild(li);
    });
  };
  const choose = (k: number) => {
    const r = current[k];
    if (!r) return;
    void openPanel(r.i);
    flyToIndex(r.i);
  };

  input.addEventListener('input', async () => {
    const my = ++qSeq;
    const q = input.value;
    if (!q.trim()) {
      current = [];
      meta.textContent = '';
      render();
      return;
    }
    const r = await search.call<{ results: { i: number; name: string }[]; total: number; ms: number }>({ type: 'search', q });
    if (my !== qSeq) return;
    current = r.results;
    sel = 0;
    meta.textContent = `${fmt(r.total)} match${r.total === 1 ? '' : 'es'} · ${r.ms.toFixed(1)} ms`;
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(current.length - 1, sel + 1); render(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    if (e.key === 'Enter') choose(sel);
  });

  // side panel
  const panel = $('panel');
  let openSeq = 0;
  const openPanel = async (i: number) => {
    const my = ++openSeq;
    void g.select(i);
    const [{ names }, d] = await Promise.all([
      search.call<{ names: string[] }>({ type: 'names', indices: [i] }),
      g.detail(i),
      g.loadGraph(),
    ]);
    if (my !== openSeq) return;
    const name = names[0];
    panel.hidden = false;
    $('panel-name').textContent = name.split('.').pop() ?? name;
    $('panel-lines').textContent = fmt(d.l);
    $('panel-imports').textContent = fmt(g.imports(i).length) + (d.ex.length ? ` + ${d.ex.join(', ')}` : '');
    $('panel-importers').textContent = fmt(g.importers(i).length);
    $('panel-depth').textContent = d.d >= 0 ? String(d.d) : '—';
    $('panel-ndecl').textContent = fmt(d.nd);
    $('panel-decls').innerHTML = d.dc.map(([k, n]) => `<div><span class="k">${esc(k)}</span> ${esc(n)}</div>`).join('');
    $('panel-snippet').textContent = d.sn ?? '';
    const path = name.split('.').join('/');
    const a = $('panel-link') as HTMLAnchorElement;
    a.href = `${REPO_BLOB}/src/${path}.lean`;
    a.dataset.path = `src/${path}.lean`;
    // breadcrumb: each prefix flies to the centroid of that directory
    const crumbs = $('panel-crumbs');
    crumbs.innerHTML = '';
    const parts = name.split('.');
    parts.slice(0, -1).forEach((p, k) => {
      const b = document.createElement('button');
      b.textContent = p;
      b.title = parts.slice(0, k + 1).join('/');
      b.onclick = () => flyToDir(parts.slice(0, k + 1).join('.'));
      crumbs.appendChild(b);
      crumbs.appendChild(document.createTextNode('/'));
    });
    crumbs.appendChild(document.createTextNode(parts[parts.length - 1] + '.lean'));
  };
  const flyToDir = async (prefix: string) => {
    const { indices } = await search.call<{ indices: number[] }>({ type: 'prefix', prefix });
    if (!indices.length) return;
    const c = new THREE.Vector3();
    const p = new THREE.Vector3();
    indices.forEach((i) => c.add(g.positionOf(i, p)));
    c.multiplyScalar(1 / indices.length);
    let r = 0;
    indices.forEach((i) => (r += g.positionOf(i, p).distanceToSquared(c)));
    r = Math.sqrt(r / indices.length);
    const dir = app.camera.position.clone().sub(app.controls.target).normalize();
    app.tweenTo(c.clone().addScaledVector(dir, Math.max(8, r * 3.2)), c, 1.8);
    meta.textContent = `${prefix.replace(/\./g, '/')}: ${fmt(indices.length)} modules`;
  };
  $('panel-close').onclick = () => {
    panel.hidden = true;
    void g.select(-1);
  };

  // click to select (ignore drags)
  const canvas = app.renderer.domElement;
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener('pointerup', (e) => {
    if (!down || app.world !== 'galaxy') return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 5) return;
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    const t0 = performance.now();
    const i = g.pick(app.camera, ndc);
    (window as unknown as { __lastPickMs: number }).__lastPickMs = performance.now() - t0;
    if (i >= 0) void openPanel(i);
  });

  // hover tooltip with the module name
  const tip = $('tooltip');
  let lastHover = -2;
  let hoverName = '';
  canvas.addEventListener('pointermove', async (e) => {
    if (app.world !== 'galaxy') return;
    const h = g.hovered;
    if (h !== lastHover) {
      lastHover = h;
      hoverName = h >= 0 ? (await search.call<{ names: string[] }>({ type: 'names', indices: [h] })).names[0] : '';
    }
    tip.hidden = !hoverName;
    tip.textContent = hoverName.split('.').slice(-2).join('.');
    tip.style.left = `${e.clientX}px`;
    tip.style.top = `${e.clientY}px`;
  });

  // stats card (values from stats.json, written by pipeline/report.py)
  void fetch(`${g.base}/stats.json`).then((r) => r.json()).then((s) => {
    $('st-modules').textContent = fmt(s.modules);
    $('st-lines').textContent = fmt(s.lines);
    $('st-edges').textContent = fmt(s.importEdges);
    $('st-chain').textContent = `${s.longestChain} modules`;
  });
  $('legend').innerHTML = g.index.libraries
    .filter((l) => l.count > 10)
    .map((l) => `<span><i style="background:${l.colour}"></i>${l.name}</span>`)
    .join('');

  (window as unknown as { __galaxyUi: unknown }).__galaxyUi = { search, openPanel, flyToIndex, choose: (q: string) => { input.value = q; input.dispatchEvent(new Event('input')); } };
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
function hl(s: string, q: string): string {
  const i = s.toLowerCase().indexOf(q.toLowerCase());
  if (!q || i < 0) return esc(s);
  return esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length));
}
