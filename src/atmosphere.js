// Atmósfera: bruma que se espesa a ras del piso y se tiñe de dorado mirando al sol,
// como en los GTA nuevos. Reemplaza la niebla de three en todos los materiales.
import * as THREE from 'three';
import { freeAfterUpload } from './textures.js';

// valores compartidos por todos los shaders (se actualizan una vez por cuadro)
export const ATMO = {
  fogSunDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
  fogSunColor: { value: new THREE.Color(0, 0, 0) },
  // x: densidad a ras del piso, y: cuánto se afina con la altura (1/m), z: altura del piso
  fogParams: { value: new THREE.Vector4(0.0022, 0.045, 0, 0) },
  // reloj del viento (con lluvia corre más rápido)
  windT: { value: 0 },
};

// Hojas que se mueven con el viento: cuanto más alto en el árbol, más se mueven.
// Sirve para el material de las hojas y para su sombra (MeshDepthMaterial).
export function addWind(mat, amp = 0.03) {
  mat.onBeforeCompile = (shader) => {
    THREE.Material.prototype.onBeforeCompile.call(mat, shader);
    shader.uniforms.windT = ATMO.windT;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float windT;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        vec3 wp = vec3(0.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix[3].xyz;
        #endif
        float ph = wp.x * 0.11 + wp.z * 0.07 + windT * 1.4;
        float hk = max(position.y - 2.5, 0.0) * ${amp.toFixed(4)};
        transformed.x += (sin(ph + position.y * 0.5) * 0.7 + sin(ph * 2.7 + position.z * 2.1) * 0.3) * hk;
        transformed.z += (cos(ph * 1.3 + position.x * 0.4) * 0.6 + sin(ph * 3.1 + position.x * 1.7) * 0.3) * hk;
      }`,
    );
  };
  mat.customProgramCacheKey = () => 'wind' + amp;
  return mat;
}

THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogRay;
#endif`;

// rayo cámara → punto en coordenadas del mundo (sirve para instancias, sprites y partículas)
THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogRay = transpose(mat3(viewMatrix)) * mvPosition.xyz;
#endif`;

THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform vec3 fogSunDir;
  uniform vec3 fogSunColor;
  uniform vec4 fogParams;
  uniform sampler2D lampPool;
  uniform sampler2D lampSpot;
  uniform vec4 lampParams;
  uniform float lampWet;
  uniform sampler2D neonSpot;
  uniform float neonOn;
  varying vec3 vFogRay;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;

THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  float fogDist = length(vFogRay);
  vec3 fogDirW = vFogRay / max(fogDist, 1e-4);
  // bruma exponencial que se afina con la altura, integrada a lo largo del rayo
  float fogK = fogParams.y;
  float fogDy = fogK * vFogRay.y;
  float fogInt = abs(fogDy) > 1e-3 ? (1.0 - exp(-fogDy)) / fogDy : 1.0;
  float fogTau = fogParams.x * fogDist * exp(-fogK * max(cameraPosition.y - fogParams.z, 0.0)) * fogInt;
  // la niebla lineal de siempre esconde el borde del mapa
  #ifdef FOG_EXP2
    float fogEdge = 1.0 - exp(-fogDensity * fogDensity * fogDist * fogDist);
  #else
    float fogEdge = smoothstep(fogNear, fogFar, fogDist);
  #endif
  float fogFactor = max(1.0 - exp(-fogTau), fogEdge);
  // del lado del sol la bruma se ilumina
  float fogSun = pow(max(dot(fogDirW, fogSunDir), 0.0), 8.0);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor + fogSunColor * fogSun, fogFactor);
#endif`;

// ---------- Luz de los faroles ----------
// En vez de cientos de luces reales, un mapa visto desde arriba con la luz de sodio de cada farol
// (y la de las vidrieras). Todo material iluminado lo suma de noche: piso, paredes, autos y gente.
export const LAMPS = {
  lampPool: { value: null },
  lampSpot: { value: null },
  // x, z del origen, tamaño en metros, intensidad (0 de día)
  lampParams: { value: new THREE.Vector4(-620, -620, 1240, 0) },
  // qué tan mojada está la calle (para los reflejos)
  lampWet: { value: 0 },
  // los carteles de neón vistos desde arriba (a 3,4 m) y cuánto brillan
  neonSpot: { value: null },
  neonOn: { value: 0 },
  // otras luces fijas (no son uniforms): marquesina de la estación de servicio {x, z, r}
  extra: [],
};

// Intensidades de la noche. Se pueden probar en vivo desde la consola: __gta.night.faroles = 3
export const NIGHT = {
  faroles: 2.2, // luz de los faroles sobre piso, paredes, autos y gente
  reflejo: 1, // faroles reflejados en la calle mojada
  haces: 1, // haces de luz de los faros de los autos
  conos: 1, // conos de luz bajo los faroles (con bruma o lluvia)
};

THREE.ShaderChunk.lights_fragment_end += /* glsl */ `
#ifdef USE_FOG
  if (lampParams.w > 0.001) {
    vec3 lampW = cameraPosition + vFogRay;
    vec3 lampC = texture2D(lampPool, (lampW.xz - lampParams.xy) / lampParams.z).rgb;
    vec3 lampN = inverseTransformDirection(normal, viewMatrix);
    float lampH = 1.0 - smoothstep(6.5, 9.5, lampW.y);
    float lampFace = 0.5 + 0.5 * max(lampN.y, 0.0);
    reflectedLight.indirectDiffuse += lampC * (lampParams.w * lampH * lampFace) * diffuseColor.rgb;
  }
#endif
`;

function lampCanvas(N, S, O, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, N, N);
  g.globalCompositeOperation = 'lighter';
  const px = (v) => ((v - O) / S) * N;
  // mancha redonda: falloff(t) de 1 en el centro a 0 en el borde, color que va de c0 a c1
  const blob = (x, z, r, c0, c1, falloff, steps = 8) => {
    const cx = px(x);
    const cy = px(z);
    const R = (r / S) * N;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const k = falloff(t);
      const col = c0.map((v, j) => Math.round((v + (c1[j] - v) * t) * k));
      gr.addColorStop(t, `rgb(${col[0]},${col[1]},${col[2]})`);
    }
    g.fillStyle = gr;
    g.fillRect(cx - R, cy - R, R * 2, R * 2);
  };
  draw(blob);
  const t = freeAfterUpload(new THREE.CanvasTexture(c));
  t.flipY = false;
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Luz de un farol a 7,7 m de altura sobre el piso: cae con el cuadrado de la distancia y el ángulo
// (1 + (r/h)²)^-1,5, recortada para que llegue a cero en el borde.
function lampFalloff(r, h) {
  const edge = (1 + (r / h) ** 2) ** -1.5;
  return (t) => Math.max(0, ((1 + ((t * r) / h) ** 2) ** -1.5 - edge) / (1 - edge));
}

// lamps: cabezales de los faroles {x, z}; shops: frentes de negocios {x, z, nx, nz};
// neon: carteles con tubos {cx, cz, ux, uz, sw, color} (para que se reflejen en la calle mojada)
export function buildLampMap(lamps, shops = [], neon = null) {
  const O = LAMPS.lampParams.value.x;
  const S = LAMPS.lampParams.value.z;
  LAMPS.lampPool.value = lampCanvas(2048, S, O, (blob) => {
    // sodio: amarillo abajo del farol, naranja hacia el borde de la mancha
    const sodium = lampFalloff(17, 7.7);
    for (const l of lamps) blob(l.x, l.z, 17, [255, 168, 88], [236, 108, 34], sodium);
    // luz blanca que sale de las vidrieras a la vereda
    const shop = lampFalloff(7, 2.6);
    for (const s of shops) blob(s.x + s.nx * 1.8, s.z + s.nz * 1.8, 7, [150, 140, 120], [120, 104, 80], shop);
    // luz blanca de tubos (la marquesina de la estación de servicio): LAMPS.extra
    const tube = lampFalloff(7, 3);
    for (const l of LAMPS.extra) blob(l.x, l.z, l.r, [120, 126, 136], [70, 76, 88], tube);
  });
  // lo que se refleja en la calle mojada: el cabezal del farol, chico y fuerte
  LAMPS.lampSpot.value = lampCanvas(1024, S, O, (blob) => {
    for (const l of lamps) blob(l.x, l.z, 6, [255, 200, 130], [255, 110, 30], (t) => (1 - t) ** 2);
  });
  // sin mipmaps: vistos casi al ras, los puntitos se promediarían con el negro y desaparecerían
  LAMPS.lampSpot.value.generateMipmaps = false;
  LAMPS.lampSpot.value.minFilter = THREE.LinearFilter;
  if (neon && !LAMPS.neonSpot.value) {
    // cada cartel, una raya de su color a lo ancho (los tubos de arriba y de abajo juntos)
    LAMPS.neonSpot.value = lampCanvas(1024, S, O, (blob) => {
      for (const s of neon) {
        const c = [(s.color >> 16) & 255, (s.color >> 8) & 255, s.color & 255];
        const n = Math.max(2, Math.round(s.sw / 1.2));
        for (let i = 0; i <= n; i++) {
          const t = i / n - 0.5;
          blob(s.cx + s.ux * s.sw * t, s.cz + s.uz * s.sw * t, 1.3, c, c, (k) => (1 - k) ** 2);
        }
      }
    });
    LAMPS.neonSpot.value.generateMipmaps = false;
    LAMPS.neonSpot.value.minFilter = THREE.LinearFilter;
  }
}

// Todos los materiales reciben los uniforms compartidos al compilarse.
THREE.Material.prototype.onBeforeCompile = function (shader) {
  shader.uniforms.fogSunDir = ATMO.fogSunDir;
  shader.uniforms.fogSunColor = ATMO.fogSunColor;
  shader.uniforms.fogParams = ATMO.fogParams;
  shader.uniforms.lampPool = LAMPS.lampPool;
  shader.uniforms.lampSpot = LAMPS.lampSpot;
  shader.uniforms.lampParams = LAMPS.lampParams;
  shader.uniforms.lampWet = LAMPS.lampWet;
  shader.uniforms.neonSpot = LAMPS.neonSpot;
  shader.uniforms.neonOn = LAMPS.neonOn;
};
