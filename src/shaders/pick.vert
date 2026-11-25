// GPU picking: same layout as points.vert, colour = module index + 1.
attribute float aSize;
attribute float aId;
uniform float uScale;
uniform float uPixelRatio;
uniform float uMinPx;
varying vec3 vId;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float px = (0.10 + aSize * 0.055) * uScale / max(-mv.z, 0.01);
  gl_PointSize = clamp(px, uMinPx, 48.0) * uPixelRatio;
  float id = aId + 1.0;
  vId = vec3(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0)) / 255.0;
  gl_Position = projectionMatrix * mv;
}
