// Height = log|ζ(σ+it)| from the RG16F grid texture (R = log|ζ|, G = arg ζ).
uniform sampler2D uGrid;
uniform vec2 uGridSize;      // texels (width = σ samples, height = t samples)
uniform vec4 uDomain;        // σ0, σ1, t0, t1
uniform vec3 uScale;         // world units per σ, per log|ζ|, per t
uniform float uEps2;         // height softening: h = ½·log(|ζ|² + ε²)

varying vec2 vTC;
varying float vSigma;
varying float vT;
varying vec3 vNormal;
varying float vFogDepth;

// Height: log|ζ| softened near zeros, ½·log(|ζ|² + ε²). Same minima (the zeros),
// but each zero becomes a visible bowl instead of a needle-thin log spike.
float soft(float L) { return 0.5 * log(exp(2.0 * L) + uEps2); }

vec2 texCoord(vec2 st) {
  vec2 u = vec2((st.x - uDomain.x) / (uDomain.y - uDomain.x), (st.y - uDomain.z) / (uDomain.w - uDomain.z));
  return (u * (uGridSize - 1.0) + 0.5) / uGridSize;
}

void main() {
  // position.x = σ, position.z = t (raw domain coordinates)
  vec2 st = vec2(position.x, position.z);
  vec2 tc = texCoord(st);
  float h = soft(texture2D(uGrid, tc).r);
  vec2 px = 1.0 / uGridSize;
  float hl = soft(texture2D(uGrid, tc - vec2(px.x, 0.0)).r);
  float hr = soft(texture2D(uGrid, tc + vec2(px.x, 0.0)).r);
  float hd = soft(texture2D(uGrid, tc - vec2(0.0, px.y)).r);
  float hu = soft(texture2D(uGrid, tc + vec2(0.0, px.y)).r);
  float dx = (uDomain.y - uDomain.x) / (uGridSize.x - 1.0) * uScale.x;
  float dz = (uDomain.w - uDomain.z) / (uGridSize.y - 1.0) * uScale.z;
  vec3 n = normalize(vec3(-(hr - hl) * uScale.y / (2.0 * dx), 1.0, -(hu - hd) * uScale.y / (2.0 * dz)));

  vec3 p = vec3((st.x - 0.5) * uScale.x, h * uScale.y, st.y * uScale.z);
  vTC = tc;
  vSigma = st.x;
  vT = st.y;
  vNormal = normalize(mat3(modelMatrix) * n);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
