// Torres de las iglesias hechas en Blender (tools/blender/iglesia.py): el campanario de la parroquia (para
// que se reconozca de lejos y sirva para ubicarse) y la espadaña de las capillas. Van en el medio del
// frente de cada iglesia (el edificio sigue siendo el de siempre); aparecen cuando carga el modelo.
import * as THREE from 'three';
import { loadBlenderMeshes } from './blender.js';

// qué pieza lleva cada iglesia, por el nombre (las evangélicas, que son galpones, no llevan torre)
function pieceFor(name) {
  if (/parroquia/i.test(name)) return 'campanario';
  if (/capilla|trinity/i.test(name)) return 'espadana';
  return null;
}

// churches: [{ name, e: { ax, az, bx, bz, nx, nz, L } (el frente, de izquierda a derecha mirando desde
// afuera), h }]
export function addChurchTowers(scene, colliders, churches) {
  const list = churches.map((c) => ({ ...c, piece: pieceFor(c.name) })).filter((c) => c.piece);
  if (!list.length) return;
  // el campanario sobresale 2,1 m de la pared: que no se lo atraviese
  for (const c of list) {
    if (c.piece !== 'campanario') continue;
    const { ax, az, bx, bz, nx, nz, L } = c.e;
    const dx = (bx - ax) / L;
    const dz = (bz - az) / L;
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const ring = [
      [-2.15, -0.1],
      [2.15, -0.1],
      [2.15, 2.15],
      [-2.15, 2.15],
    ].map(([u, w]) => [mx + dx * u + nx * w, mz + dz * u + nz * w]);
    colliders.addRing(ring, 21, 'building');
  }
  loadBlenderMeshes('models/landmarks/iglesia.glb')
    .then((geo) => {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      for (const c of list) {
        const g = geo[c.piece];
        if (!g) continue;
        const { ax, az, bx, bz, L } = c.e;
        const dx = (bx - ax) / L;
        const dz = (bz - az) / L;
        const m = new THREE.Mesh(g, mat);
        // el campanario al pie (apenas arriba de la calle); la espadaña arriba de la pared del frente
        m.position.set((ax + bx) / 2, c.piece === 'campanario' ? 0.1 : c.h, (az + bz) / 2);
        m.rotation.y = Math.atan2(-dz, dx);
        m.castShadow = m.receiveShadow = true;
        scene.add(m);
      }
    })
    .catch((e) => console.warn('torres de las iglesias:', e.message));
}
