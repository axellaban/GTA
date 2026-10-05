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
