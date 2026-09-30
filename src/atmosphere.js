// Atmósfera: bruma que se espesa a ras del piso y se tiñe de dorado mirando al sol,
// como en los GTA nuevos. Reemplaza la niebla de three en todos los materiales.
import * as THREE from 'three';

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
};

THREE.ShaderChunk.lights_fragment_end += /* glsl */ `
#ifdef USE_FOG
  if (lampParams.w > 0.001) {
    vec3 lampW = cameraPosition + vFogRay;
    vec3 lampC = texture2D(lampPool, (lampW.xz - lampParams.xy) / lampParams.z).rgb;
    vec3 lampN = inverseTransformDirection(normal, viewMatrix);
    float lampH = 1.0 - smoothstep(6.5, 9.5, lampW.y);
    float lampFace = 0.5 + 0.5 * max(lampN.y, 0.0);
    reflectedLight.indirectDiffuse += lampC * lampC * (lampParams.w * lampH * lampFace) * diffuseColor.rgb;
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
  const blob = (x, z, r, stops) => {
    const cx = px(x);
    const cy = px(z);
    const R = (r / S) * N;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    for (const [t, col] of stops) gr.addColorStop(t, col);
    g.fillStyle = gr;
    g.fillRect(cx - R, cy - R, R * 2, R * 2);
  };
  draw(blob);
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// lamps: cabezales de los faroles {x, z}; shops: frentes de negocios {x, z, nx, nz}
export function buildLampMap(lamps, shops = []) {
  const O = LAMPS.lampParams.value.x;
  const S = LAMPS.lampParams.value.z;
  LAMPS.lampPool.value = lampCanvas(2048, S, O, (blob) => {
    for (const l of lamps)
      blob(l.x, l.z, 12, [
        [0, 'rgba(255,176,96,1)'],
        [0.3, 'rgba(230,140,70,0.6)'],
        [1, 'rgba(0,0,0,0)'],
      ]);
    // luz blanca que sale de las vidrieras a la vereda
    for (const s of shops)
      blob(s.x + s.nx * 1.5, s.z + s.nz * 1.5, 6, [
        [0, 'rgba(255,236,200,0.75)'],
        [1, 'rgba(0,0,0,0)'],
      ]);
  });
  // puntitos chicos: lo que se refleja en la calle mojada
  LAMPS.lampSpot.value = lampCanvas(1024, S, O, (blob) => {
    for (const l of lamps)
      blob(l.x, l.z, 3.2, [
        [0, 'rgba(255,190,110,1)'],
        [0.5, 'rgba(255,150,70,0.5)'],
        [1, 'rgba(0,0,0,0)'],
      ]);
  });
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
};
