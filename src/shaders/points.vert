// One star per Lean module. Size ∝ log(lines), colour by top-level library.
attribute float aSize;      // log(lines + 1)
attribute float aLib;       // library index
uniform vec3 uColors[11];
uniform float uScale;       // pixels per world unit at depth 1: H / (2 tan(fov/2))
uniform float uPixelRatio;
uniform float uReveal;      // radius (world units) inside which points have appeared
uniform float uBright;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float r = length(position);
  float appear = smoothstep(r, r + 25.0, uReveal);
  float worldSize = 0.10 + aSize * 0.055;
  float px = worldSize * uScale / max(-mv.z, 0.01);
  float alpha = appear * uBright;
  // sub-pixel stars: keep a 1.6 px footprint and fade instead of shrinking (no shimmer)
  if (px < 1.6) { alpha *= px / 1.6; px = 1.6; }
  px = min(px, 48.0);
  // stars very close to the camera fade out so fly-throughs stay readable
  alpha *= smoothstep(0.4, 3.0, -mv.z);
  gl_PointSize = px * uPixelRatio;
  vColor = uColors[int(aLib + 0.5)];
  vAlpha = alpha;
  gl_Position = projectionMatrix * mv;
}
