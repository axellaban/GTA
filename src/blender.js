// Utilidades para los modelos hechos en Blender (scripts en tools/blender/).
// Las piezas se arman primero con geometría simple y, cuando el modelo carga, se cambia la geometría
// en el lugar: los pedazos de src/chunks.js comparten la geometría y el material del original.

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// La sombra de contacto (o el color, con white) viene en los colores de vértice.
export function swapGeometry(mesh, g, { white = false } = {}) {
  mesh.geometry.copy(g);
  if (white) mesh.material.color.set(0xffffff);
  mesh.geometry.computeBoundingSphere();
  mesh.material.vertexColors = true;
  mesh.material.needsUpdate = true;
  mesh.traverse((m) => {
    if (m.isInstancedMesh && m.count) m.computeBoundingSphere();
  });
}

// Carga un .glb y devuelve sus mallas por nombre.
export function loadBlenderMeshes(path) {
  return new GLTFLoader().loadAsync(path).then(meshesByName);
}

// Las mallas de un .glb por nombre (el nombre del objeto en Blender).
export function meshesByName(gltf) {
  const out = {};
  gltf.scene.traverse((o) => {
    if (o.isMesh) out[o.name] = o.geometry;
  });
  return out;
}

// Hojas recortadas (alphaTest) que no se ralean de lejos: en los mipmaps el alfa de las hojas finitas se
// promedia con el fondo y queda por debajo del corte, así que de lejos la copa se veía pelada. Se sube
// el alfa según qué tan lejos está el mipmap que se lee (como el "alpha to coverage" con escala por
// mipmap). Sirve para el material de la copa y para el de su sombra.
const MIP_ALPHA = /* glsl */ `
#ifdef USE_MAP
{
  vec2 mt = vMapUv * vec2(textureSize(map, 0));
  vec2 mdx = dFdx(mt);
  vec2 mdy = dFdy(mt);
  float lod = max(0.0, 0.5 * log2(max(dot(mdx, mdx), dot(mdy, mdy))));
  diffuseColor.a *= 1.0 + lod * MIP_ALPHA_K;
}
#endif
#include <alphatest_fragment>`;
export function denseAlpha(mat, k = 0.3) {
  const prev = mat.onBeforeCompile;
  const key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', MIP_ALPHA.replace('MIP_ALPHA_K', k.toFixed(3)));
  };
  mat.customProgramCacheKey = () => `${key}-denso${k}`;
  mat.needsUpdate = true;
  return mat;
}
