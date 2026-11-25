// Domain colouring: hue = arg ζ, brightness bands for |ζ|, contours at integer log|ζ|.
uniform sampler2D uGrid;
uniform vec2 uGridSize;
uniform vec3 uLightDir;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uLineGlow;
uniform float uOpacity;
uniform float uTestMode;     // 1 = grey height map for the visual alignment test

varying vec2 vTC;
varying float vSigma;
varying float vT;
varying vec3 vNormal;
varying float vFogDepth;

const float PI = 3.141592653589793;

vec3 hsl2rgb(vec3 c) {
  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
}

float wrapPi(float x) { return x - 2.0 * PI * floor((x + PI) / (2.0 * PI)); }

// Bilinear arg with phase unwrapping (plain linear filtering breaks at the ±π cut).
float argAt(vec2 tc) {
  vec2 p = tc * uGridSize - 0.5;
  vec2 f = fract(p);
  ivec2 i0 = ivec2(floor(p));
  ivec2 mx = ivec2(uGridSize) - 1;
  ivec2 a = clamp(i0, ivec2(0), mx);
  ivec2 b = clamp(i0 + ivec2(1, 0), ivec2(0), mx);
  ivec2 c = clamp(i0 + ivec2(0, 1), ivec2(0), mx);
  ivec2 d = clamp(i0 + ivec2(1, 1), ivec2(0), mx);
  float a00 = texelFetch(uGrid, a, 0).g;
  float a10 = a00 + wrapPi(texelFetch(uGrid, b, 0).g - a00);
  float a01 = a00 + wrapPi(texelFetch(uGrid, c, 0).g - a00);
  float a11 = a00 + wrapPi(texelFetch(uGrid, d, 0).g - a00);
  return mix(mix(a00, a10, f.x), mix(a01, a11, f.x), f.y);
}

void main() {
  float L = texture2D(uGrid, vTC).r;
  if (uTestMode > 0.5) {
    float g = (L + 6.0) / 10.0;
    gl_FragColor = vec4(vec3(g), 1.0);
    return;
  }
  float A = argAt(vTC);
  float inStrip = step(0.0, vSigma) * step(vSigma, 1.0);

  float hue = fract(A / (2.0 * PI) + 1.0);
  float light = mix(0.07, 0.54, smoothstep(-5.5, 3.0, L));
  light *= 0.80 + 0.20 * fract(L);                       // brightness bands per e-fold of |ζ|
  float sat = mix(0.22, 0.62, inStrip);
  vec3 col = hsl2rgb(vec3(hue, sat, light));
  col *= mix(0.62, 1.0, inStrip);

  // contour lines at integer log|ζ| (skip the clamped plateaus)
  float fw = max(fwidth(L), 1e-4);
  float d = abs(fract(L + 0.5) - 0.5);
  float contour = (1.0 - smoothstep(0.0, 1.4 * fw, d)) * step(-5.98, L) * step(L, 3.98);
  col = mix(col, col * 0.30, 0.75 * contour);

  // light
  vec3 n = normalize(vNormal);
  float ndl = max(dot(n, normalize(uLightDir)), 0.0);
  col *= 0.42 + 0.78 * ndl;

  // strip frame at σ = 0 and σ = 1
  float fs = max(fwidth(vSigma), 1e-5);
  float frame = (1.0 - smoothstep(0.0, 1.6 * fs, abs(vSigma))) + (1.0 - smoothstep(0.0, 1.6 * fs, abs(vSigma - 1.0)));
  col += vec3(0.50, 0.58, 0.72) * frame * 0.55;

  // the critical line σ = 1/2 glows
  float dl = abs(vSigma - 0.5);
  float glow = exp(-pow(dl / 0.008, 2.0)) * 0.55 + exp(-pow(dl / 0.04, 2.0)) * 0.10;
  col += vec3(1.0, 0.82, 0.45) * glow * uLineGlow;

  float fog = 1.0 - exp(-pow(uFogDensity * vFogDepth, 2.0));
  col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(pow(max(col, 0.0), vec3(2.2)), uOpacity);
}
