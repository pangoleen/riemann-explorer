// The proof galaxy: 175,187 modules as one THREE.Points draw, directory edges,
// GPU picking, selection lines and the Main.lean beacon.
import * as THREE from 'three';
import vert from '../shaders/points.vert?raw';
import frag from '../shaders/points.frag?raw';
import pickVert from '../shaders/pick.vert?raw';
import pickFrag from '../shaders/pick.frag?raw';
import type { Labels } from '../core/labels';

export interface GalaxyIndex {
  count: number;
  shardSize: number;
  mainIndex: number;
  libraries: { name: string; colour: string; count: number }[];
  sizeScale: number;
  highlights: Record<string, number>;
  groupCentres: Record<string, [number, number, number]>;
}
export interface DirEdges {
  groups: { name: string; count: number; c: [number, number, number]; lib: number }[];
  edges: [number, number, number][];
}
export interface ModuleDetail {
  l: number; d: number; nd: number; ex: string[]; dc: [string, string][]; sn: string | null;
}
export const REVEAL_MAX = 260;

export class Galaxy {
  readonly group = new THREE.Group();
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private pickMaterial: THREE.ShaderMaterial;
  private pickScene = new THREE.Scene();
  private pickTarget = new THREE.WebGLRenderTarget(1, 1);
  private pickBuf = new Uint8Array(4);
  private edges: THREE.LineSegments;
  private selLines: THREE.LineSegments;
  private selMarker: THREE.Points;
  private beacon: THREE.Points;
  private csr: { off: Uint32Array; tgt: Uint32Array; roff: Uint32Array; rsrc: Uint32Array } | null = null;
  private csrLoading: Promise<void> | null = null;
  private shards = new Map<number, Promise<ModuleDetail[]>>();
  selected = -1;
  hovered = -1;
  private frame = 0;
  private H = 1;
  private W = 1;

  private constructor(
    readonly base: string,
    readonly renderer: THREE.WebGLRenderer,
    readonly index: GalaxyIndex,
    readonly positions: Float32Array,
    readonly meta: Uint16Array,
    readonly dirEdges: DirEdges,
  ) {
    const n = index.count;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const size = new Float32Array(n);
    const lib = new Float32Array(n);
    const id = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      size[i] = meta[2 * i] / index.sizeScale;
      lib[i] = meta[2 * i + 1];
      id[i] = i;
    }
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aLib', new THREE.BufferAttribute(lib, 1));
    geo.setAttribute('aId', new THREE.BufferAttribute(id, 1));
    geo.computeBoundingSphere();
    const colours = index.libraries.map((l) => new THREE.Color(l.colour));
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uColors: { value: colours },
        uScale: { value: 1000 },
        uPixelRatio: { value: 1 },
        uReveal: { value: REVEAL_MAX },
        uBright: { value: 0.42 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);

    this.pickMaterial = new THREE.ShaderMaterial({
      vertexShader: pickVert,
      fragmentShader: pickFrag,
      uniforms: { uScale: { value: 1000 }, uPixelRatio: { value: 1 }, uMinPx: { value: 7 } },
    });
    const pickPoints = new THREE.Points(geo, this.pickMaterial);
    pickPoints.frustumCulled = false;
    this.pickScene.add(pickPoints);
    this.pickScene.background = new THREE.Color(0x000000);

    this.edges = this.buildEdges(colours);
    this.group.add(this.edges);

    this.selLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.selLines.frustumCulled = false;
    this.group.add(this.selLines);

    this.selMarker = this.makeSprite(0xffffff, 26, false);
    this.selMarker.visible = false;
    this.group.add(this.selMarker);

    this.beacon = this.makeSprite(0xffe2a8, 40, true);
    this.beacon.renderOrder = 10;
    this.group.add(this.beacon);
  }

  static async load(base: string, renderer: THREE.WebGLRenderer): Promise<Galaxy> {
    const [index, pos, meta, edges] = await Promise.all([
      fetch(`${base}/galaxy_index.json`).then((r) => r.json() as Promise<GalaxyIndex>),
      fetch(`${base}/galaxy_positions.bin`).then((r) => r.arrayBuffer()),
      fetch(`${base}/galaxy_meta.bin`).then((r) => r.arrayBuffer()),
      fetch(`${base}/galaxy_dir_edges.json`).then((r) => r.json() as Promise<DirEdges>),
    ]);
    return new Galaxy(base, renderer, index, new Float32Array(pos), new Uint16Array(meta), edges);
  }

  private makeSprite(color: number, size: number, pulse: boolean): THREE.Points {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    const m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uSize: { value: size }, uTime: { value: 0 }, uPulse: { value: pulse ? 1 : 0 }, uPixelRatio: { value: 1 }, uAlpha: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uSize; uniform float uTime; uniform float uPulse; uniform float uPixelRatio;
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * (1.0 + 0.12 * uPulse * sin(uTime * 2.2)) * uPixelRatio;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uAlpha;
        void main() {
          vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;
          if (r > 1.0) discard;
          float fall = (1.0 - r * r) * (1.0 - r * r);
          float core = exp(-r * r * 18.0);
          float halo = 0.45 * exp(-r * r * 3.5);
          float ring = 0.35 * exp(-pow((r - 0.72) * 9.0, 2.0));
          gl_FragColor = vec4(uColor * (core * 1.6 + halo + ring) * fall * uAlpha, 1.0);
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    return p;
  }

  private buildEdges(colours: THREE.Color[]): THREE.LineSegments {
    const { groups } = this.dirEdges;
    // skip edges to tiny outer groups: they read as hair, not structure
    const edges = this.dirEdges.edges.filter(([i, j]) => groups[i].count >= 30 && groups[j].count >= 30);
    const SEG = 14;
    const maxW = Math.max(...edges.map((e) => e[2]));
    const pos = new Float32Array(edges.length * SEG * 2 * 3);
    const col = new Float32Array(edges.length * SEG * 2 * 3);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let k = 0;
    edges.forEach(([i, j, w]) => {
      a.fromArray(groups[i].c);
      b.fromArray(groups[j].c);
      const len = a.distanceTo(b);
      // control point: midpoint bowed sideways and up, so parallel edges fan apart
      c.addVectors(a, b).multiplyScalar(0.5);
      const side = new THREE.Vector3().subVectors(b, a).cross(up).normalize();
      if (!Number.isFinite(side.x)) side.set(1, 0, 0);
      c.addScaledVector(side, len * 0.18).addScaledVector(up, len * 0.12);
      const strength = 0.25 + 0.75 * Math.log1p(w) / Math.log1p(maxW);
      const ca = colours[groups[i].lib];
      const cb = colours[groups[j].lib];
      for (let s = 0; s < SEG; s++) {
        bez(a, c, b, s / SEG, p);
        bez(a, c, b, (s + 1) / SEG, q);
        pos.set([p.x, p.y, p.z, q.x, q.y, q.z], k * 6);
        const m0 = s / SEG;
        const m1 = (s + 1) / SEG;
        col.set([
          (ca.r * (1 - m0) + cb.r * m0) * strength, (ca.g * (1 - m0) + cb.g * m0) * strength, (ca.b * (1 - m0) + cb.b * m0) * strength,
          (ca.r * (1 - m1) + cb.r * m1) * strength, (ca.g * (1 - m1) + cb.g * m1) * strength, (ca.b * (1 - m1) + cb.b * m1) * strength,
        ], k * 6);
        k++;
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const l = new THREE.LineSegments(g, m);
    l.frustumCulled = false;
    return l;
  }

  addLabels(labels: Labels, visible: () => boolean): void {
    labels.add('Main.lean', () => new THREE.Vector3(0, 0, 0).applyMatrix4(this.group.matrixWorld), 'beacon', visible);
  }

  positionOf(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.fromArray(this.positions, i * 3);
  }

  setResolution(w: number, h: number): void {
    this.W = w;
    this.H = h;
  }

  setPixelRatio(pr: number): void {
    this.material.uniforms.uPixelRatio.value = pr;
    for (const s of [this.beacon, this.selMarker]) (s.material as THREE.ShaderMaterial).uniforms.uPixelRatio.value = pr;
  }

  /** 0 → nothing, 1 → every star; stars appear outward from Main. */
  setReveal(r: number): void {
    this.material.uniforms.uReveal.value = THREE.MathUtils.lerp(-30, REVEAL_MAX, r);
    (this.edges.material as THREE.LineBasicMaterial).opacity = 0.14 * THREE.MathUtils.smoothstep(r, 0.5, 1);
    (this.beacon.material as THREE.ShaderMaterial).uniforms.uAlpha.value = THREE.MathUtils.smoothstep(r, 0, 0.08) * 0.6 + 0.4 * Math.min(1, r * 8);
  }

  /** Story helper: brighten stars while the camera streams through them. */
  setStreak(s: number): void {
    this.material.uniforms.uBright.value = 0.42 + 0.3 * s;
  }

  update(camera: THREE.PerspectiveCamera, time: number, pointer: THREE.Vector2 | null): void {
    const scale = this.H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.material.uniforms.uScale.value = scale / (this.material.uniforms.uPixelRatio.value as number);
    (this.beacon.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
    (this.selMarker.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
    this.frame++;
    if (pointer && pointer.x > -2 && this.frame % 3 === 0) this.hovered = this.pick(camera, pointer);
  }

  /** GPU pick: render module IDs for the one pixel under the pointer. */
  pick(camera: THREE.PerspectiveCamera, ndc: THREE.Vector2): number {
    const pr = this.material.uniforms.uPixelRatio.value as number;
    const w = this.W / pr;
    const h = this.H / pr;
    const x = Math.round(((ndc.x + 1) / 2) * w);
    const y = Math.round(((1 - ndc.y) / 2) * h);
    this.pickMaterial.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.pickScene.children[0].matrixWorld.copy(this.group.matrixWorld);
    this.pickScene.children[0].matrixAutoUpdate = false;
    camera.setViewOffset(w, h, x, y, 1, 1);
    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.pickTarget);
    this.renderer.clear();
    this.renderer.render(this.pickScene, camera);
    this.renderer.setRenderTarget(prevTarget);
    camera.clearViewOffset();
    this.renderer.readRenderTargetPixels(this.pickTarget, 0, 0, 1, 1, this.pickBuf);
    const id = this.pickBuf[0] + this.pickBuf[1] * 256 + this.pickBuf[2] * 65536;
    return id - 1;
  }

  async loadGraph(): Promise<void> {
    if (!this.csrLoading) {
      this.csrLoading = fetch(`${this.base}/galaxy_imports.bin`).then(async (r) => {
        const buf = await r.arrayBuffer();
        const n = this.index.count;
        const off = new Uint32Array(buf, 0, n + 1);
        const tgt = new Uint32Array(buf, (n + 1) * 4);
        const cnt = new Uint32Array(n + 1);
        for (let k = 0; k < tgt.length; k++) cnt[tgt[k] + 1]++;
        for (let i = 0; i < n; i++) cnt[i + 1] += cnt[i];
        const roff = cnt.slice();
        const fill = cnt.slice(0, n);
        const rsrc = new Uint32Array(tgt.length);
        for (let i = 0; i < n; i++) for (let k = off[i]; k < off[i + 1]; k++) rsrc[fill[tgt[k]]++] = i;
        this.csr = { off, tgt, roff, rsrc };
      });
    }
    return this.csrLoading;
  }

  imports(i: number): Uint32Array {
    return this.csr ? this.csr.tgt.subarray(this.csr.off[i], this.csr.off[i + 1]) : new Uint32Array();
  }
  importers(i: number): Uint32Array {
    return this.csr ? this.csr.rsrc.subarray(this.csr.roff[i], this.csr.roff[i + 1]) : new Uint32Array();
  }

  detail(i: number): Promise<ModuleDetail> {
    const k = Math.floor(i / this.index.shardSize);
    if (!this.shards.has(k)) {
      this.shards.set(k, fetch(`${this.base}/galaxy_details/${String(k).padStart(3, '0')}.json`).then((r) => r.json()));
    }
    return this.shards.get(k)!.then((s) => s[i - k * this.index.shardSize]);
  }

  async select(i: number): Promise<void> {
    this.selected = i;
    if (i < 0) {
      this.selLines.visible = false;
      this.selMarker.visible = false;
      return;
    }
    const p = this.positionOf(i);
    this.selMarker.geometry.attributes.position.setXYZ(0, p.x, p.y, p.z);
    this.selMarker.geometry.attributes.position.needsUpdate = true;
    this.selMarker.visible = true;
    await this.loadGraph();
    if (this.selected !== i) return;
    const imp = this.imports(i);
    const by = this.importers(i);
    const n = imp.length + by.length;
    const pos = new Float32Array(n * 6);
    const col = new Float32Array(n * 6);
    const ci = new THREE.Color('#6fd3ff');
    const cb = new THREE.Color('#ff8fb1');
    let k = 0;
    const q = new THREE.Vector3();
    const put = (j: number, c: THREE.Color) => {
      this.positionOf(j, q);
      pos.set([p.x, p.y, p.z, q.x, q.y, q.z], k * 6);
      col.set([c.r, c.g, c.b, c.r * 0.5, c.g * 0.5, c.b * 0.5], k * 6);
      k++;
    };
    imp.forEach((j) => put(j, ci));
    by.forEach((j) => put(j, cb));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.selLines.geometry.dispose();
    this.selLines.geometry = g;
    this.selLines.visible = true;
  }
}

function bez(a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  const u = 1 - t;
  return out.set(
    u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    u * u * a.z + 2 * u * t * c.z + t * t * b.z,
  );
}
