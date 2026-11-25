import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { params } from './core/params';
import { Labels } from './core/labels';
import { Landscape, LANDSCAPE_CENTRE, loadGrid, SCALE } from './worlds/landscape';
import type { Galaxy } from './worlds/galaxy';
import { Hud, makeZ, sub, drawZPlot } from './ui/hud';
import { zerosPassed } from './math/zeta';
import type { StoryState } from './story/player';

declare global {
  interface Window {
    __ready?: boolean;
    __renderFrame?: (t: number) => Promise<void>;
    __app?: App;
    __storyDuration?: number;
  }
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

type Mode = 'orbit' | 'fly' | 'tween' | 'story';

export class App {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly labels = new Labels($('labels'));
  landscape!: Landscape;
  galaxy: Galaxy | null = null;
  galaxyLoading: Promise<Galaxy> | null = null;
  hud!: Hud;
  gammas: number[] = [];
  Z!: ReturnType<typeof makeZ>;
  mode: Mode = 'orbit';
  world: 'landscape' | 'galaxy' = 'landscape';
  blend = 0; // 0 = landscape, 1 = galaxy
  private blendTarget = 0;
  private flyT = 0;
  private tween: { from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; t: number; dur: number } | null = null;
  private clock = new THREE.Clock();
  private time = 0;
  private W = 1;
  private H = 1;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(-9, -9);
  private pointerPx = { x: 0, y: 0 };
  private focusZero = -1;
  storyState: StoryState | null = null;
  story: import('./story/player').StoryPlayer | null = null;

  constructor() {
    const canvas = $<HTMLCanvasElement>('gl');
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.capture,
    });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 2000);
    this.camera.position.set(14, 16, -34);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = !params.capture;
    this.controls.target.set(0, -1, -18);
    this.controls.maxDistance = 600;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.7);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    window.addEventListener('resize', () => this.resize());
    document.body.classList.toggle('story', params.story);
    document.body.classList.toggle('hideui', params.hideui);
    document.body.classList.toggle('capture', params.capture);
  }

  async init(): Promise<void> {
    const [grid, zeros] = await Promise.all([
      loadGrid(),
      fetch('/data/zeros.json').then((r) => r.json() as Promise<{ gammas: number[] }>),
    ]);
    this.gammas = zeros.gammas;
    this.landscape = new Landscape(grid, this.gammas, { lowQuality: params.lowQuality });
    this.scene.add(this.landscape.group);
    this.Z = makeZ((t) => grid.zLowT(t));
    this.hud = new Hud(this.Z, this.gammas);
    this.addLandscapeLabels();
    this.resize();
    this.bindUi();
    $('loading').remove();

    if (params.story) {
      const { StoryPlayer } = await import('./story/player');
      this.story = new StoryPlayer();
      window.__storyDuration = this.story.duration;
      this.mode = 'story';
      this.controls.enabled = false;
      await this.ensureGalaxy();
    } else if (params.world === 'galaxy') {
      this.setWorld('galaxy', true);
    }
    if (params.cam.length === 6) {
      this.camera.position.set(params.cam[0], params.cam[1], params.cam[2]);
      this.controls.target.set(params.cam[3], params.cam[4], params.cam[5]);
      this.camera.lookAt(this.controls.target);
    }
    if (params.test === 'minima') this.setupMinimaTest();

    // stream the galaxy in after the landscape is on screen
    if (!params.story && !params.test) requestIdleCallbackSafe(() => this.ensureGalaxy());

    window.__app = this;
    (window as unknown as { __bench: (n: number) => number }).__bench = (n: number) => {
      // readPixels forces the GPU queue to drain, so this measures real frame cost
      const gl = this.renderer.getContext();
      const px = new Uint8Array(4);
      const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      this.step(1 / 60);
      sync();
      const t0 = performance.now();
      for (let i = 0; i < n; i++) { this.step(1 / 60); sync(); }
      return (performance.now() - t0) / n;
    };
    if (params.capture) {
      window.__renderFrame = async (t: number) => {
        this.step(1 / params.fps, t);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      };
      this.step(0, params.t);
    } else {
      this.renderer.setAnimationLoop(() => this.step(Math.min(this.clock.getDelta(), 1 / 20)));
    }
    window.__ready = true;
  }

  ensureGalaxy(): Promise<Galaxy> {
    if (!this.galaxyLoading) {
      this.galaxyLoading = import('./worlds/galaxy').then(async ({ Galaxy }) => {
        const g = await Galaxy.load('/data', this.renderer);
        this.galaxy = g;
        this.scene.add(g.group);
        g.setResolution(this.W, this.H);
        g.addLabels(this.labels, () => this.blend > 0.02);
        g.pick(this.camera, new THREE.Vector2(0, 0)); // compile the pick shader now, not on first click
        if (!params.story) {
          const ui = await import('./ui/galaxyUi');
          ui.mountGalaxyUi(this, g);
        }
        return g;
      });
    }
    return this.galaxyLoading;
  }

  private addLandscapeLabels(): void {
    const local = (x: number, y: number, z: number) => () => this.toWorld(new THREE.Vector3(x, y, z));
    const vis = () => this.blend < 0.05;
    this.labels.add('Re(s) = ½', local(0, 2.4, 0.5), 'line', vis, 60);
    this.labels.add('σ = 0', local(-0.5 * SCALE.x, 2.0, 0), '', vis, 45);
    this.labels.add('σ = 1', local(0.5 * SCALE.x, 3.4, 0), '', vis, 45);
    const tz = this.landscape.trivialZeroPosition();
    this.labels.add('ζ(−2) = 0 · trivial zero', local(tz.x, tz.y, tz.z), 'trivial', vis, 70);
  }

  /** Landscape-local → world. */
  toWorld(p: THREE.Vector3): THREE.Vector3 {
    return p.applyMatrix4(this.landscape.group.matrixWorld);
  }

  /** World → landscape-local. */
  toLocal(p: THREE.Vector3): THREE.Vector3 {
    return this.landscape.group.worldToLocal(p.clone());
  }

  private bindUi(): void {
    $('btn-landscape').onclick = () => this.setWorld('landscape');
    $('btn-galaxy').onclick = () => this.setWorld('galaxy');
    $('btn-fly').onclick = () => this.startFly();
    $('btn-about').onclick = () => ($('about') as HTMLDialogElement).showModal();
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', (e) => {
      this.pointer.set((e.clientX / this.W) * 2 - 1, -(e.clientY / this.H) * 2 + 1);
      this.pointerPx = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerleave', () => this.pointer.set(-9, -9));
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (this.world !== 'landscape') return;
      if (e.key === ']' || e.key === 'n') this.focusZeroStep(1);
      if (e.key === '[' || e.key === 'p') this.focusZeroStep(-1);
      if (e.key === 'f') this.startFly();
      if (e.key === 'Escape') this.focusZero = -1;
    });
    if (params.debug) void this.addDebugGui();
  }

  private async addDebugGui(): Promise<void> {
    const { default: GUI } = await import('lil-gui');
    const gui = new GUI({ title: 'debug' });
    gui.add(this.bloom, 'strength', 0, 3, 0.01);
    gui.add(this.bloom, 'radius', 0, 1.5, 0.01);
    gui.add(this.bloom, 'threshold', 0, 1, 0.01);
    gui.add(this.renderer, 'toneMappingExposure', 0.2, 3, 0.01);
    gui.add(this.landscape.surfaceMaterial.uniforms.uFogDensity, 'value', 0, 0.05, 0.001).name('fog');
    gui.add(this.landscape.surfaceMaterial.uniforms.uLineGlow, 'value', 0, 3, 0.01).name('line glow');
  }

  private focusZeroStep(d: number): void {
    const n = this.gammas.filter((g) => g <= 100).length;
    this.focusZero = this.focusZero < 0 ? (d > 0 ? 0 : n - 1) : (this.focusZero + d + n) % n;
    const p = this.toWorld(this.landscape.markerPos[this.focusZero].clone());
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.tweenTo(p.clone().add(dir.multiplyScalar(9)), p, 1.1);
  }

  setWorld(w: 'landscape' | 'galaxy', immediate = false): void {
    this.world = w;
    this.blendTarget = w === 'galaxy' ? 1 : 0;
    document.body.classList.toggle('world-galaxy', w === 'galaxy');
    $('btn-landscape').setAttribute('aria-selected', String(w === 'landscape'));
    $('btn-galaxy').setAttribute('aria-selected', String(w === 'galaxy'));
    if (w === 'galaxy') {
      void this.ensureGalaxy();
      const to = new THREE.Vector3(0, 140, 300);
      if (immediate) {
        this.blend = 1;
        this.camera.position.copy(to);
        this.controls.target.set(0, 0, 0);
      } else this.tweenTo(to, new THREE.Vector3(0, 0, 0), 2.4);
    } else {
      const to = new THREE.Vector3(14, 16, -34);
      if (immediate) {
        this.blend = 0;
        this.camera.position.copy(to);
        this.controls.target.set(0, -1, -18);
      } else this.tweenTo(to, new THREE.Vector3(0, -1, -18), 2.4);
    }
  }

  tweenTo(pos: THREE.Vector3, target: THREE.Vector3, dur = 1.6): void {
    if (this.mode === 'story') return;
    this.tween = { from: this.camera.position.clone(), to: pos.clone(), fromT: this.controls.target.clone(), toT: target.clone(), t: 0, dur };
    this.mode = 'tween';
    this.controls.enabled = false;
  }

  startFly(): void {
    if (this.world !== 'landscape' || this.mode === 'story') return;
    this.flyT = 0;
    this.mode = 'fly';
    this.controls.enabled = false;
    $('btn-fly').textContent = 'Flying…';
  }

  /** Camera pose for flying the critical line at height t (landscape-local). */
  flyPose(t: number): { pos: THREE.Vector3; look: THREE.Vector3 } {
    // the camera sits exactly at t, so the counter ticks as the camera passes each zero
    const pos = new THREE.Vector3(0, 3.4, t * SCALE.z);
    const look = new THREE.Vector3(0, -0.8, t * SCALE.z + 13);
    return { pos, look };
  }

  resize(): void {
    let w = window.innerWidth;
    let h = window.innerHeight;
    if (params.capture) {
      [w, h] = params.aspect === '4x5' ? [1080, 1350] : [1920, 1080];
    }
    this.W = w;
    this.H = h;
    // cap the backing store near 1080p pixel count (retina screens would otherwise render 4×)
    const pr = params.capture ? 1 : Math.max(1, Math.min(window.devicePixelRatio, Math.sqrt(2.3e6 / (w * h))));
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.landscape?.setResolution(w * pr, h * pr);
    this.galaxy?.setResolution(w * pr, h * pr);
    (this.landscape?.glow.material as THREE.ShaderMaterial | undefined)?.uniforms.uPixelRatio && ((this.landscape.glow.material as THREE.ShaderMaterial).uniforms.uPixelRatio.value = pr);
    this.galaxy?.setPixelRatio(pr);
  }

  /** Advance one frame. In capture mode `storyTime` is given explicitly. */
  step(dt: number, storyTime?: number): void {
    this.time += dt;
    let focusT = 0;
    let allLit = true;

    if (this.mode === 'story' && this.story) {
      const st = this.story.state(storyTime ?? (this.time + params.t));
      this.storyState = st;
      this.camera.position.copy(st.pos);
      this.camera.lookAt(st.look);
      if (Math.abs(this.camera.fov - st.fov) > 1e-6) {
        this.camera.fov = st.fov;
        this.camera.updateProjectionMatrix();
      }
      this.blend = st.blend;
      focusT = st.lineT;
      allLit = st.allLit;
      this.galaxy?.setReveal(st.galaxyReveal);
      this.galaxy?.setStreak(st.streak);
      this.applyStoryOverlays(st);
    } else if (this.mode === 'fly') {
      this.flyT += dt * 5; // constant 5 units of t per second
      const t = Math.min(this.flyT, 100);
      const { pos, look } = this.flyPose(t);
      this.camera.position.copy(this.toWorld(pos));
      this.controls.target.copy(this.toWorld(look));
      this.camera.lookAt(this.controls.target);
      focusT = t;
      allLit = false;
      if (this.flyT >= 100) {
        this.mode = 'orbit';
        this.controls.enabled = true;
        $('btn-fly').textContent = 'Fly the critical line';
      }
    } else {
      if (this.mode === 'tween' && this.tween) {
        const tw = this.tween;
        tw.t = Math.min(1, tw.t + dt / tw.dur);
        const e = easeInOut(tw.t);
        this.camera.position.lerpVectors(tw.from, tw.to, e);
        this.controls.target.lerpVectors(tw.fromT, tw.toT, e);
        this.camera.lookAt(this.controls.target);
        if (tw.t >= 1) {
          this.tween = null;
          this.mode = 'orbit';
          this.controls.enabled = true;
        }
      } else this.controls.update();
      const b = this.blendTarget;
      this.blend += (b - this.blend) * Math.min(1, dt * 1.6);
      if (Math.abs(this.blend - b) < 1e-3) this.blend = b;
      focusT = THREE.MathUtils.clamp(this.toLocal(this.controls.target).z / SCALE.z, 0, 100);
    }

    this.applyBlend(this.blend);
    if (this.blend < 1) {
      this.landscape.updateLit(focusT, allLit, this.time);
      if (!params.story) this.hud.update(focusT);
      this.hoverZeros();
    }
    if (this.galaxy && this.blend > 0) this.galaxy.update(this.camera, this.time, this.mode === 'story' ? null : this.pointer);
    this.labels.update(this.camera, this.W, this.H);
    this.composer.render();
  }

  private applyBlend(w: number): void {
    const s = THREE.MathUtils.lerp(1, 0.0008, easeInOut(THREE.MathUtils.clamp(w * 1.25, 0, 1)));
    const g = this.landscape.group;
    g.scale.setScalar(s);
    g.position.copy(LANDSCAPE_CENTRE).multiplyScalar(-s);
    g.visible = w < 0.999;
    g.updateMatrixWorld(true);
    if (this.galaxy) {
      this.galaxy.group.visible = w > 0.001;
      if (this.mode !== 'story') this.galaxy.setReveal(THREE.MathUtils.clamp((w - 0.25) / 0.75, 0, 1));
    }
  }

  private hoverZeros(): void {
    const tip = $('tooltip');
    if (this.mode === 'story' || this.blend > 0.05) {
      tip.hidden = true;
      return;
    }
    let idx = -1;
    let at = this.pointerPx;
    if (this.pointer.x > -2) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObject(this.landscape.hitMesh, false)[0];
      if (hit && hit.instanceId !== undefined) idx = hit.instanceId;
    }
    if (idx < 0 && this.focusZero >= 0) {
      idx = this.focusZero;
      const p = this.toWorld(this.landscape.markerPos[idx].clone()).project(this.camera);
      at = { x: (p.x * 0.5 + 0.5) * this.W, y: (-p.y * 0.5 + 0.5) * this.H };
    }
    if (idx < 0) {
      tip.hidden = true;
      return;
    }
    tip.hidden = false;
    tip.innerHTML = `ρ${sub(idx + 1)} = 1/2 + i·<b>${this.gammas[idx].toPrecision(15)}</b>`;
    tip.style.left = `${at.x}px`;
    tip.style.top = `${at.y}px`;
  }

  private applyStoryOverlays(st: StoryState): void {
    const cap = $('caption-text');
    if (cap.textContent !== st.caption) cap.textContent = st.caption;
    cap.style.opacity = st.captionOpacity.toFixed(3);
    $('fade').style.opacity = st.fade.toFixed(3);
    const card = $('leancard');
    card.style.opacity = st.leanCard.toFixed(3);
    card.style.transform = `translate(-50%, -50%) scale(${(0.96 + 0.04 * st.leanCard).toFixed(4)})`;
    const sh = $('story-hud');
    sh.style.opacity = st.hud.toFixed(3);
    if (st.hud > 0.001) {
      const canvas = $<HTMLCanvasElement>('story-zplot');
      const big = st.hudBig;
      sh.style.top = `${THREE.MathUtils.lerp(6, 30, big)}%`;
      sh.style.transform = `translateX(-50%) scale(${THREE.MathUtils.lerp(0.62, 1.0, big).toFixed(4)})`;
      sh.style.transformOrigin = '50% 0';
      drawZPlot(canvas, this.Z, Math.max(0, st.lineT), this.gammas, {
        halfWindow: 11, samples: 700, lineWidth: 3.5, font: '600 20px Inter Variable, Inter, sans-serif',
      });
      $('story-k').textContent = String(zerosPassed(Math.max(0, st.lineT), this.gammas));
    }
  }

  private setupMinimaTest(): void {
    // Top-down orthographic view of the strip for scripts/visual-test.ts.
    // Phase 'surface': grey = log|ζ| (dark = low), markers hidden.
    // Phase 'markers': only the zero markers, in pure red.
    document.body.classList.add('hideui');
    this.renderer.toneMapping = THREE.NoToneMapping;
    const ortho = new THREE.OrthographicCamera(-9.2, 9.2, 50.5, -50.5, 0.1, 200);
    ortho.position.set(0, 60, 0);
    ortho.up.set(0, 0, -1); // t increases up the screen
    ortho.lookAt(0, 0, 0);
    const lsc = this.landscape;
    (lsc.markers.material as THREE.MeshBasicMaterial).color.set(0xff0000);
    const phase = (p: 'surface' | 'markers') => {
      lsc.group.children.forEach((c) => {
        c.visible = p === 'surface' ? c.name === 'surface' : c.name === 'zeros';
      });
      lsc.surfaceMaterial.uniforms.uTestMode.value = 1;
      if (this.galaxy) this.galaxy.group.visible = false;
      for (let i = 0; i < this.gammas.length; i++) lsc.markers.setColorAt(i, new THREE.Color(1, 1, 1));
      if (lsc.markers.instanceColor) lsc.markers.instanceColor.needsUpdate = true;
      this.renderer.setAnimationLoop(null);
      this.labels.update(ortho, 0, 0);
      $('labels').innerHTML = '';
      this.renderer.render(this.scene, ortho);
    };
    const project = () => this.landscape.markerPos
      .filter((_, i) => this.gammas[i] <= 100)
      .map((p) => {
        const v = this.toWorld(p.clone()).project(ortho);
        return { x: (v.x * 0.5 + 0.5) * this.W, y: (-v.y * 0.5 + 0.5) * this.H };
      });
    (window as unknown as { __minimaTest: unknown }).__minimaTest = { phase, project, criticalLineX: () => {
      const v = this.toWorld(new THREE.Vector3(0, 0, 50)).project(ortho);
      return (v.x * 0.5 + 0.5) * this.W;
    } };
  }
}

function requestIdleCallbackSafe(fn: () => void): void {
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: object) => void }).requestIdleCallback;
  if (ric) ric(fn, { timeout: 1500 });
  else setTimeout(fn, 300);
}

const app = new App();
app.init().catch((e) => {
  console.error(e);
  $('loading').textContent = `Failed to load: ${e}`;
});
