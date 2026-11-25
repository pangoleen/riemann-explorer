// HTML labels pinned to 3D points (kept in the DOM so screenshots include them).
import * as THREE from 'three';

interface Label {
  el: HTMLDivElement;
  pos: () => THREE.Vector3 | null;
  maxDist: number;
  visible: () => boolean;
}

export class Labels {
  private items: Label[] = [];
  private v = new THREE.Vector3();
  constructor(private root: HTMLElement) {}

  add(text: string, pos: () => THREE.Vector3 | null, cls = '', visible: () => boolean = () => true, maxDist = Infinity): HTMLDivElement {
    const el = document.createElement('div');
    el.className = `wlabel ${cls}`;
    el.textContent = text;
    this.root.appendChild(el);
    this.items.push({ el, pos, maxDist, visible });
    return el;
  }

  update(camera: THREE.Camera, w: number, h: number): void {
    for (const it of this.items) {
      const p = it.visible() ? it.pos() : null;
      if (!p) {
        it.el.style.display = 'none';
        continue;
      }
      const dist = p.distanceTo(camera.position);
      const fade = it.maxDist === Infinity ? 1 : THREE.MathUtils.clamp((it.maxDist - dist) / (0.25 * it.maxDist), 0, 1);
      if (fade <= 0) {
        it.el.style.display = 'none';
        continue;
      }
      it.el.style.opacity = fade.toFixed(3);
      this.v.copy(p).project(camera);
      if (this.v.z > 1 || Math.abs(this.v.x) > 1.2 || Math.abs(this.v.y) > 1.2) {
        it.el.style.display = 'none';
        continue;
      }
      it.el.style.display = '';
      const x = (this.v.x * 0.5 + 0.5) * w;
      const y = (-this.v.y * 0.5 + 0.5) * h;
      it.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(8px, -50%)`;
    }
  }
}
