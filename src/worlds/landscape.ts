// The zeta landscape: surface mesh, critical line, zero markers, trivial zero.
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import vert from '../shaders/surface.vert?raw';
import frag from '../shaders/surface.frag?raw';

export interface GridHeader {
  width: number;
  height: number;
  sigma: [number, number];
  t: [number, number];
  logClamp: [number, number];
}

/** World units per σ, per log|ζ|, per t. */
export const SCALE = new THREE.Vector3(6, 0.9, 1);
/** Height softening ε: height = ½·log(|ζ|² + ε²). Equals log|ζ| when |ζ| ≫ ε. */
export const HEIGHT_EPS = 0.16;
export const softLog = (L: number) => 0.5 * Math.log(Math.exp(2 * L) + HEIGHT_EPS * HEIGHT_EPS);
/** Landscape-local point the group shrinks toward in the world transition. */
export const LANDSCAPE_CENTRE = new THREE.Vector3(0, 0, 50);

export class ZetaGrid {
  readonly logAbs: Float32Array;
  constructor(readonly header: GridHeader, readonly half: Uint16Array) {
    const n = header.width * header.height;
    this.logAbs = new Float32Array(n);
    for (let i = 0; i < n; i++) this.logAbs[i] = THREE.DataUtils.fromHalfFloat(half[2 * i]);
  }
  /** Bilinear log|ζ(σ+it)| from the grid (the same values the mesh uses). */
  logAbsAt(sigma: number, t: number): number {
    const { width: W, height: H, sigma: [s0, s1], t: [t0, t1] } = this.header;
    const x = THREE.MathUtils.clamp(((sigma - s0) / (s1 - s0)) * (W - 1), 0, W - 1);
    const y = THREE.MathUtils.clamp(((t - t0) / (t1 - t0)) * (H - 1), 0, H - 1);
    const i = Math.min(Math.floor(x), W - 2);
    const j = Math.min(Math.floor(y), H - 2);
    const fx = x - i;
    const fy = y - j;
    const g = this.logAbs;
    const a = g[j * W + i] * (1 - fx) + g[j * W + i + 1] * fx;
    const b = g[(j + 1) * W + i] * (1 - fx) + g[(j + 1) * W + i + 1] * fx;
    return a * (1 - fy) + b * fy;
  }
  /** Z(t) for 0 ≤ t < 10 from the grid: Z = −|ζ(1/2+it)| there (no zero below γ₁ ≈ 14.13). */
  zLowT(t: number): number {
    return -Math.exp(this.logAbsAt(0.5, t));
  }
}

export async function loadGrid(base = '/data'): Promise<ZetaGrid> {
  const [hdr, bin] = await Promise.all([
    fetch(`${base}/zeta_grid.json`).then((r) => r.json() as Promise<GridHeader>),
    fetch(`${base}/zeta_grid.bin`).then((r) => r.arrayBuffer()),
  ]);
  return new ZetaGrid(hdr, new Uint16Array(bin));
}

/**
 * Height of the rendered surface. The mesh interpolates softLog of the grid
 * samples linearly between vertices, so do the same here.
 */
export function surfaceY(grid: ZetaGrid, sigma: number, t: number): number {
  const { width: W, height: H, sigma: [s0, s1], t: [t0, t1] } = grid.header;
  const x = THREE.MathUtils.clamp(((sigma - s0) / (s1 - s0)) * (W - 1), 0, W - 1);
  const y = THREE.MathUtils.clamp(((t - t0) / (t1 - t0)) * (H - 1), 0, H - 1);
  const i = Math.min(Math.floor(x), W - 2);
  const j = Math.min(Math.floor(y), H - 2);
  const fx = x - i;
  const fy = y - j;
  const g = grid.logAbs;
  const f = (k: number) => softLog(g[k]);
  const a = f(j * W + i) * (1 - fx) + f(j * W + i + 1) * fx;
  const b = f((j + 1) * W + i) * (1 - fx) + f((j + 1) * W + i + 1) * fx;
  return (a * (1 - fy) + b * fy) * SCALE.y;
}

export class Landscape {
  readonly group = new THREE.Group();
  readonly surfaceMaterial: THREE.ShaderMaterial;
  readonly markers: THREE.InstancedMesh;
  readonly hitMesh: THREE.InstancedMesh;
  readonly glow: THREE.Points;
  readonly beams: THREE.InstancedMesh;
  readonly markerPos: THREE.Vector3[] = [];
  private lineMats: LineMaterial[] = [];
  private lit: Float32Array;
  private litAttr: THREE.BufferAttribute;
  private markerColor = new THREE.Color();

  constructor(readonly grid: ZetaGrid, readonly gammas: number[], opts: { lowQuality?: boolean } = {}) {
    const { header } = grid;
    const tex = new THREE.DataTexture(grid.half, header.width, header.height, THREE.RGFormat, THREE.HalfFloatType);
    tex.internalFormat = 'RG16F';
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;

    this.surfaceMaterial = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uGrid: { value: tex },
        uGridSize: { value: new THREE.Vector2(header.width, header.height) },
        uDomain: { value: new THREE.Vector4(header.sigma[0], header.sigma[1], header.t[0], header.t[1]) },
        uScale: { value: SCALE.clone() },
        uEps2: { value: HEIGHT_EPS * HEIGHT_EPS },
        uLightDir: { value: new THREE.Vector3(-0.45, 0.85, -0.3).normalize() },
        uFogColor: { value: new THREE.Color(0x000000) },
        uFogDensity: { value: 0.0045 },
        uLineGlow: { value: 1 },
        uOpacity: { value: 1 },
        uTestMode: { value: 0 },
      },
      transparent: false,
      side: THREE.DoubleSide,
    });
    const surface = new THREE.Mesh(this.buildGeometry(opts.lowQuality ? 2 : 1), this.surfaceMaterial);
    surface.frustumCulled = false;
    surface.name = 'surface';
    this.group.add(surface);

    this.addCriticalLine();

    // zero markers: spheres on the surface at (1/2, γ_n); beyond t = 100 they float on the floor
    const floorY = softLog(header.logClamp[0]) * SCALE.y;
    const sphere = new THREE.SphereGeometry(0.16, 20, 12);
    this.markers = new THREE.InstancedMesh(sphere, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), gammas.length);
    this.hitMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshBasicMaterial({ visible: false }), gammas.length);
    const m = new THREE.Matrix4();
    const glowPos = new Float32Array(gammas.length * 3);
    gammas.forEach((g, i) => {
      const y = g <= header.t[1] ? surfaceY(grid, 0.5, g) : floorY;
      const p = new THREE.Vector3(0, y + 0.05, g * SCALE.z);
      this.markerPos.push(p);
      m.makeTranslation(p.x, p.y, p.z);
      this.markers.setMatrixAt(i, m);
      this.hitMesh.setMatrixAt(i, m);
      this.markers.setColorAt(i, new THREE.Color(1, 0.85, 0.5));
      glowPos.set([p.x, p.y + 0.15, p.z], i * 3);
    });
    this.markers.name = 'zeros';
    this.group.add(this.markers, this.hitMesh);

    // a light beam rises from each zero; it brightens when the zero is lit
    const BEAM_H = 2.4;
    const beamGeo = new THREE.CylinderGeometry(0.05, 0.05, BEAM_H, 8, 1, true).translate(0, BEAM_H / 2, 0);
    const bc = new Float32Array(beamGeo.attributes.position.count * 3);
    for (let v = 0; v < beamGeo.attributes.position.count; v++) {
      const k = 1 - beamGeo.attributes.position.getY(v) / BEAM_H;
      bc.set([k, k, k], v * 3);
    }
    beamGeo.setAttribute('color', new THREE.BufferAttribute(bc, 3));
    this.beams = new THREE.InstancedMesh(beamGeo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }), gammas.length);
    this.markerPos.forEach((p, i) => {
      m.makeTranslation(p.x, p.y, p.z);
      this.beams.setMatrixAt(i, m);
      this.beams.setColorAt(i, new THREE.Color(1, 0.8, 0.45));
    });
    this.beams.name = 'beams';
    this.beams.frustumCulled = false;
    this.group.add(this.beams);

    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
    this.lit = new Float32Array(gammas.length).fill(1);
    this.litAttr = new THREE.BufferAttribute(this.lit, 1);
    gg.setAttribute('aLit', this.litAttr);
    this.glow = new THREE.Points(gg, glowMaterial());
    this.glow.frustumCulled = false;
    this.group.add(this.glow);

    this.addTrivialZero();
  }

  private buildGeometry(step: number): THREE.BufferGeometry {
    const { width: W, height: H, sigma: [s0, s1], t: [t0, t1] } = this.grid.header;
    const nx = W;
    const nz = Math.floor((H - 1) / step) + 1;
    const pos = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) {
      const t = t0 + ((j * step) / (H - 1)) * (t1 - t0);
      for (let i = 0; i < nx; i++) {
        const k = (j * nx + i) * 3;
        pos[k] = s0 + (i / (W - 1)) * (s1 - s0);
        pos[k + 2] = t;
      }
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let q = 0;
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        idx[q++] = a; idx[q++] = c; idx[q++] = b;
        idx[q++] = b; idx[q++] = c; idx[q++] = d;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 50), 120);
    return g;
  }

  private addCriticalLine(): void {
    const { t: [t0, t1] } = this.grid.header;
    const pts: number[] = [];
    const n = 2048;
    for (let k = 0; k <= n; k++) {
      const t = t0 + (k / n) * (t1 - t0);
      pts.push(0, surfaceY(this.grid, 0.5, t) + 0.035, t * SCALE.z);
    }
    // beyond the grid the line runs on at floor height through the remaining zeros
    const floorY = softLog(this.grid.header.logClamp[0]) * SCALE.y + 0.05;
    const far = Math.max(t1 + 1, (this.gammas[this.gammas.length - 1] ?? t1) + 10);
    const pts2 = [0, floorY, t1 * SCALE.z, 0, floorY, far * SCALE.z];
    const mk = (p: number[], width: number, opacity: number, color: number) => {
      const geo = new LineGeometry();
      geo.setPositions(p);
      const mat = new LineMaterial({
        color, linewidth: width, transparent: true, opacity, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false,
      });
      this.lineMats.push(mat);
      const line = new Line2(geo, mat);
      line.computeLineDistances();
      line.frustumCulled = false;
      this.group.add(line);
    };
    mk(pts, 1.6, 0.75, 0xffd98a);
    mk(pts, 5, 0.10, 0xffc060);
    mk(pts2, 1.6, 0.45, 0xffd98a);
  }

  private addTrivialZero(): void {
    const sigma = -2;
    const p = new THREE.Vector3((sigma - 0.5) * SCALE.x, 0, 0);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10), new THREE.MeshBasicMaterial({ color: 0x9fb4d6, toneMapped: false }));
    m.position.copy(p);
    m.name = 'trivialZero';
    this.group.add(m);
    // dashed guide from the grid edge (σ = −1) to the marker
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3((-1 - 0.5) * SCALE.x, 0, 0), p]);
    const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0x6f7f99, dashSize: 0.4, gapSize: 0.3, transparent: true, opacity: 0.7 }));
    line.computeLineDistances();
    this.group.add(line);
  }

  trivialZeroPosition(): THREE.Vector3 {
    return new THREE.Vector3((-2 - 0.5) * SCALE.x, 0.45, 0);
  }

  setResolution(w: number, h: number): void {
    for (const m of this.lineMats) m.resolution.set(w, h);
  }

  /**
   * Light the zeros the camera has passed. `litUpTo` is the camera's t; zeros
   * with γ ≤ litUpTo are lit. `all` lights everything (explore mode).
   */
  updateLit(litUpTo: number, all: boolean, time: number): void {
    for (let i = 0; i < this.gammas.length; i++) {
      const passed = all || this.gammas[i] <= litUpTo;
      // short flash right after the camera passes the zero
      const since = litUpTo - this.gammas[i];
      const flash = !all && since >= 0 && since < 1.2 ? 1 + 1.6 * (1 - since / 1.2) : 1;
      this.lit[i] = passed ? flash : 0.16;
      const c = passed ? this.markerColor.setRGB(1.0 * flash, 0.86 * flash, 0.52 * flash) : this.markerColor.setRGB(0.25, 0.25, 0.3);
      this.markers.setColorAt(i, c);
      this.beams.setColorAt(i, passed ? c.multiplyScalar(0.85) : c.setRGB(0.04, 0.04, 0.05));
    }
    if (this.beams.instanceColor) this.beams.instanceColor.needsUpdate = true;
    this.litAttr.needsUpdate = true;
    if (this.markers.instanceColor) this.markers.instanceColor.needsUpdate = true;
    (this.glow.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
  }

  setOpacity(a: number): void {
    this.surfaceMaterial.uniforms.uOpacity.value = a;
  }
}

function glowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uSize: { value: 3.0 } },
    vertexShader: /* glsl */ `
      attribute float aLit;
      uniform float uSize;
      uniform float uPixelRatio;
      varying float vLit;
      void main() {
        vLit = aLit;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float s = uSize * (0.5 + 0.5 * min(aLit, 2.5));
        gl_PointSize = clamp(s * 300.0 / -mv.z, 2.0, 160.0) * uPixelRatio;
      }`,
    fragmentShader: /* glsl */ `
      varying float vLit;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r2 = dot(d, d) * 4.0;
        if (r2 > 1.0) discard;
        float fall = (1.0 - r2) * (1.0 - r2);
        float a = (exp(-r2 * 7.0) + 0.35 * exp(-r2 * 2.0)) * fall;
        vec3 c = vec3(1.0, 0.78, 0.42) * a * (0.15 + 0.6 * vLit);
        gl_FragColor = vec4(c, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}
