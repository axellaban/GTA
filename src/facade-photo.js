// Fotos de pared (Poly Haven, CC0) sobre las fachadas dibujadas: ladrillo visto, ladrillo hueco y
// revoque gastado. Las fotos se apoyan en metros sobre cada pared (a lo largo y en altura, sin
// estirarse en las paredes en diagonal) y cada una trae su relieve en la transparencia, así que
// el sol marca las juntas de los ladrillos y los granos del revoque sin mapa de normales aparte.
// Dónde va cada foto lo dice el mapa de aspereza del atlas (src/textures.js, markBrick): rojo 0 es
// ladrillo (con verde 226, hueco; con 236, visto); rojo 255 y pared áspera, revoque.
// Si las fotos no cargan, las fachadas quedan como estaban. Las baja scripts/fachadas.py.
import * as THREE from 'three';

// relativo a la página, como usePhoto (en el Artifact de un solo archivo no están: quedan las dibujadas)
const BASE = 'textures/';
// el ladrillo hueco de la foto es más chico que uno de verdad (18 x 33 cm): se agranda
const HUECO_SCALE = 0.78;
// cuánto sobresale lo más alto de cada foto (m): da la fuerza del relieve
const DEPTH = { visto: 0.012, hueco: 0.016, revoque: 0.006 };

const PHOTO_PARS = /* glsl */ `
uniform sampler2D tVisto;
uniform sampler2D tHueco;
uniform sampler2D tRevoque;
uniform vec4 fpVisto;   // rgb promedio, w = metros que cubre
uniform vec4 fpHueco;
uniform vec4 fpRevoque;
uniform vec3 fpDepth;   // relieve: visto, hueco, revoque
`;

// después de map_fragment: el color. Las variables quedan para el relieve (más abajo en main)
const PHOTO_COLOR = /* glsl */ `
  vec3 fpN = normalize(vDetN);
  vec2 fpT = normalize(vec2(-fpN.z, fpN.x) + vec2(1e-5, 0.0));
  // en metros: a lo largo de la pared y en altura
  vec2 fpUv = vec2(dot(vDetW.xz, fpT), vDetW.y);
  vec4 fpOrm = texture2D(roughnessMap, vRoughnessMapUv);
  float fpVert = 1.0 - smoothstep(0.55, 0.8, abs(fpN.y));
  // borde neto (el filtro del atlas lo desenfoca): sin una franja del ladrillo dibujado alrededor
  float fpB = (1.0 - smoothstep(0.4, 0.6, fpOrm.r)) * fpVert;
  float fpHk = 1.0 - smoothstep(0.895, 0.915, fpOrm.g);
  float fpBV = fpB * (1.0 - fpHk);
  float fpBH = fpB * fpHk;
  float fpRev = smoothstep(0.75, 0.88, fpOrm.g) * smoothstep(0.85, 0.95, fpOrm.r) * fpVert;
  vec2 fpUvV = fpUv / fpVisto.w;
  vec2 fpUvH = fpUv / fpHueco.w + vec2(0.31, 0.0);
  vec2 fpUvR = fpUv / fpRevoque.w + vec2(0.0, 0.17);
  vec4 fpV = texture2D(tVisto, fpUvV);
  vec4 fpH = texture2D(tHueco, fpUvH);
  vec4 fpR = texture2D(tRevoque, fpUvR);
  // el ladrillo toma el tono del dibujado (el atlas desenfocado: cada casa con su ladrillo)
  if (fpBV + fpBH > 0.01) {
    vec3 fpTint = texture2D(map, vMapUv, 3.0).rgb;
    vec3 fpBrick = fpV.rgb / fpVisto.rgb * fpBV + fpH.rgb / fpHueco.rgb * fpBH;
    // más contraste que el dibujo, pero sin quemar las juntas claras
    fpBrick = fpBrick / (1.0 + 0.18 * fpBrick);
    diffuseColor.rgb = mix(diffuseColor.rgb, min(fpTint * fpBrick * 1.18, vec3(1.0)), min(1.0, fpBV + fpBH));
  }
  // el revoque: manchas y grano de la foto sobre el color pintado
  float fpL = dot(fpR.rgb, vec3(0.3, 0.55, 0.15)) / dot(fpRevoque.rgb, vec3(0.3, 0.55, 0.15));
  diffuseColor.rgb *= mix(1.0, clamp(fpL, 0.5, 1.5), fpRev * 0.8);
`;

// después de normal_fragment_maps: el relieve sale de la altura (transparencia de la foto)
const PHOTO_NORMAL = /* glsl */ `
  {
    vec2 fpG = vec2(0.0);
    if (fpBV > 0.01) {
      vec2 e = vec2(1.0 / 1024.0, 0.0);
      float h0 = texture2D(tVisto, fpUvV).a;
      fpG += vec2(texture2D(tVisto, fpUvV + e.xy).a - h0, texture2D(tVisto, fpUvV + e.yx).a - h0) * (fpDepth.x * 2.0 / (fpVisto.w * e.x)) * fpBV;
    }
    if (fpBH > 0.01) {
      vec2 e = vec2(1.0 / 512.0, 0.0);
      float h0 = texture2D(tHueco, fpUvH).a;
      fpG += vec2(texture2D(tHueco, fpUvH + e.xy).a - h0, texture2D(tHueco, fpUvH + e.yx).a - h0) * (fpDepth.y * 2.0 / (fpHueco.w * e.x)) * fpBH;
    }
    if (fpRev > 0.01) {
      vec2 e = vec2(1.0 / 512.0, 0.0);
      float h0 = texture2D(tRevoque, fpUvR).a;
      fpG += vec2(texture2D(tRevoque, fpUvR + e.xy).a - h0, texture2D(tRevoque, fpUvR + e.yx).a - h0) * (fpDepth.z * 2.0 / (fpRevoque.w * e.x)) * fpRev;
    }
    // de lejos (o muy al ras) el relieve se apaga: así no titila
    fpG = clamp(fpG, -1.5, 1.5) * (1.0 - smoothstep(25.0, 60.0, length(vDetW - cameraPosition)));
    // el relieve dibujado del atlas (puntitos, ladrillos de otra medida) cede ante el de la foto
    normal = normalize(mix(normal, nonPerturbedNormal, min(0.75, fpRev * 0.7 + (fpBV + fpBH) * 0.75)));
    vec3 fpTw = vec3(fpT.x, 0.0, fpT.y);
    vec3 fpTv = (viewMatrix * vec4(fpTw, 0.0)).xyz;
    vec3 fpBv = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
    normal = normalize(normal - (fpG.x * fpTv + fpG.y * fpBv));
  }
`;

let loading = null;
function loadPhotos() {
  loading ??= (async () => {
    const r = await fetch(`${BASE}fachada.json`);
    if (!r.ok) throw new Error(`fachada.json: ${r.status}`);
    const meta = await r.json();
    const loader = new THREE.TextureLoader();
    const out = {};
    await Promise.all(
      ['visto', 'hueco', 'revoque'].map(async (k) => {
        const m = meta[k];
        if (!m) throw new Error(`falta ${k}`);
        const t = await loader.loadAsync(`${BASE}${m.file}`);
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        t.premultiplyAlpha = false;
        const meters = m.meters * (k === 'hueco' ? HUECO_SCALE : 1);
        out[k] = { tex: t, par: new THREE.Vector4(m.avg[0], m.avg[1], m.avg[2], meters) };
      }),
    );
    return out;
  })();
  return loading;
}

// Se suma a un material de fachadas que ya tiene addWorldDetail (usa su posición y normal del mundo)
export function addFacadePhotos(mat) {
  loadPhotos()
    .then((P) => {
      const prev = mat.onBeforeCompile;
      const prevKey = mat.customProgramCacheKey;
      mat.onBeforeCompile = (shader, r) => {
        prev.call(mat, shader, r);
        Object.assign(shader.uniforms, {
          tVisto: { value: P.visto.tex },
          tHueco: { value: P.hueco.tex },
          tRevoque: { value: P.revoque.tex },
          fpVisto: { value: P.visto.par },
          fpHueco: { value: P.hueco.par },
          fpRevoque: { value: P.revoque.par },
          fpDepth: { value: new THREE.Vector3(DEPTH.visto, DEPTH.hueco, DEPTH.revoque) },
        });
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>\n${PHOTO_PARS}`)
          .replace('#include <map_fragment>', `#include <map_fragment>\n${PHOTO_COLOR}`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${PHOTO_NORMAL}`);
      };
      mat.customProgramCacheKey = () => `${prevKey.call(mat)}-fotos`;
      mat.needsUpdate = true;
    })
    .catch((e) => console.warn('Fachadas sin fotos:', e.message));
}
