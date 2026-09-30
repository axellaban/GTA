// Atmósfera: bruma que se espesa a ras del piso y se tiñe de dorado mirando al sol,
// como en los GTA nuevos. Reemplaza la niebla de three en todos los materiales.
import * as THREE from 'three';

// valores compartidos por todos los shaders (se actualizan una vez por cuadro)
export const ATMO = {
  fogSunDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
  fogSunColor: { value: new THREE.Color(0, 0, 0) },
  // x: densidad a ras del piso, y: cuánto se afina con la altura (1/m), z: altura del piso
  fogParams: { value: new THREE.Vector4(0.0022, 0.045, 0, 0) },
};

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

// Todos los materiales reciben los uniforms compartidos al compilarse.
THREE.Material.prototype.onBeforeCompile = function (shader) {
  shader.uniforms.fogSunDir = ATMO.fogSunDir;
  shader.uniforms.fogSunColor = ATMO.fogSunColor;
  shader.uniforms.fogParams = ATMO.fogParams;
};
