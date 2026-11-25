varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d) * 4.0;
  if (r2 > 1.0) discard;
  float fall = (1.0 - r2) * (1.0 - r2);
  float core = exp(-r2 * 6.0);
  float halo = 0.25 * exp(-r2 * 2.0);
  gl_FragColor = vec4(vColor * (core + halo) * fall * vAlpha, 1.0);
}
