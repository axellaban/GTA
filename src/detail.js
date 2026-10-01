// Detalle de cerca: grano de revoque en coordenadas del mundo (que no depende de la textura),
// para que las paredes no se vean lisas y lavadas cuando la cámara está encima.
import * as THREE from 'three';

let detailTex = null;

// Ruido suave que se repite sin costura (varias octavas sobre una grilla periódica)
function makeDetail(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;
  const acc = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (const period of [4, 8, 16, 32, 64]) {
    const lat = new Float32Array(period * period);
    for (let i = 0; i < lat.length; i++) lat[i] = Math.random();
    const cell = size / period;
    for (let y = 0; y < size; y++) {
      const gy = y / cell;
      const y0 = Math.floor(gy) % period;
      const y1 = (y0 + 1) % period;
      let fy = gy - Math.floor(gy);
      fy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < size; x++) {
        const gx = x / cell;
        const x0 = Math.floor(gx) % period;
        const x1 = (x0 + 1) % period;
        let fx = gx - Math.floor(gx);
        fx = fx * fx * (3 - 2 * fx);
        const a = lat[y0 * period + x0];
        const b = lat[y0 * period + x1];
        const cc = lat[y1 * period + x0];
        const e = lat[y1 * period + x1];
        acc[y * size + x] += (a + (b - a) * fx + (cc - a) * fy + (a - b - cc + e) * fx * fy) * amp;
      }
    }
    total += amp;
    amp *= 0.62;
  }
  for (let i = 0; i < size * size; i++) {
    const v = Math.max(0, Math.min(255, (acc[i] / total) * 255));
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Reflejo de los faroles en el piso mojado: se sigue el rayo reflejado hasta la altura de los
// cabezales y se mira el mapa de puntitos de luz ahí. El agua no es un espejo: se toman varias
// muestras abriendo el ángulo, y como al ras eso cambia mucho la distancia, la luz se estira en
// rayas hacia la cámara, como en el asfalto mojado de verdad.
const WET_REFLECT = /* glsl */ `
#ifdef USE_FOG
  if (lampParams.w > 0.001 && lampWet > 0.02) {
    vec3 rw = cameraPosition + vFogRay;
    vec3 rv = normalize(vFogRay);
    // el agua empareja el piso: la textura mueve el reflejo, pero poco
    vec3 rn = normalize(mix(vec3(0.0, 1.0, 0.0), inverseTransformDirection(normal, viewMatrix), 0.12));
    vec3 rr = reflect(rv, rn);
    float rup = max(rr.y, 0.015);
    float rh = max(7.7 - rw.y, 0.5);
    vec3 spot = vec3(0.0);
    // cada píxel corre un poco las muestras: el reflejo queda como una raya continua (con grano de
    // agua) y no como cinco bandas separadas sobre las baldosas
    float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    for (int i = 0; i < 5; i++) {
      float k = 0.55 + (float(i) + jit - 0.5) * 0.28;
      float wk = 1.0 - abs(float(i) - 2.0) * 0.3;
      vec2 rp = rw.xz + rr.xz * (rh / (rup * k));
      spot += texture2D(lampSpot, (rp - lampParams.xy) / lampParams.z).rgb * wk;
    }
    // Fresnel: mirando al ras refleja mucho más que mirando hacia abajo
    float rf = 0.04 + 0.96 * pow(1.0 - clamp(dot(-rv, rn), 0.0, 1.0), 5.0);
    reflectedLight.indirectSpecular += spot * (lampWet * lampParams.w * rf * 1.3);
    // el neón de los carteles (más bajo, a 3,4 m): rayas rosas, celestes y violetas en el agua
    if (neonOn > 0.01) {
      float nh = max(3.4 - rw.y, 0.3);
      vec3 ns = vec3(0.0);
      for (int i = 0; i < 4; i++) {
        float k = 0.6 + (float(i) + jit - 0.5) * 0.3;
        vec2 np = rw.xz + rr.xz * (nh / (rup * k));
        ns += texture2D(neonSpot, (np - lampParams.xy) / lampParams.z).rgb;
      }
      reflectedLight.indirectSpecular += ns * (lampWet * neonOn * rf * 0.65);
    }
  }
#endif`;

// Agrega el grano (y un poco de mugre a ras del piso) a un material Lambert o Standard.
// wet: además refleja los faroles cuando llueve (calles y veredas).
export function addWorldDetail(mat, { strength = 0.34, scale = 0.9, damp = 0.1, wet = false } = {}) {
  detailTex ??= makeDetail();
  mat.onBeforeCompile = (shader) => {
    THREE.Material.prototype.onBeforeCompile.call(mat, shader);
    shader.uniforms.tDetail = { value: detailTex };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDetW;\nvarying vec3 vDetN;').replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 detP = vec4(transformed, 1.0);
      vec3 detN = objectNormal;
      #ifdef USE_INSTANCING
        detP = instanceMatrix * detP;
        detN = mat3(instanceMatrix) * detN;
      #endif
      vDetW = (modelMatrix * detP).xyz;
      vDetN = mat3(modelMatrix) * detN;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tDetail;\nvarying vec3 vDetW;\nvarying vec3 vDetN;').replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      {
        vec3 dn = abs(normalize(vDetN));
        vec2 duv = dn.y > 0.7 ? vDetW.xz : (dn.x > dn.z ? vDetW.zy : vDetW.xy);
        float dA = texture2D(tDetail, duv * ${scale.toFixed(3)}).r;
        float dB = texture2D(tDetail, duv * ${(scale * 0.17).toFixed(3)} + 0.37).r;
        float det = dA * 0.6 + dB * 0.4;
        diffuseColor.rgb *= 1.0 + (det - 0.5) * ${strength.toFixed(3)};
        float dampK = (1.0 - smoothstep(0.05, 0.5 + dB * 0.9, vDetW.y)) * ${damp.toFixed(3)};
        diffuseColor.rgb *= 1.0 - dampK;
      }`,
    );
    if (wet) shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + WET_REFLECT);
  };
  mat.customProgramCacheKey = () => `detail-${strength}-${scale}-${damp}-${wet}`;
  return mat;
}
