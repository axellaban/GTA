// Árboles de la vereda hechos en Blender (tools/blender/arboles.py): tronco con la base ensanchada, ramas
// maestras y una ramita hasta cada ramillete; copa de ramilletes con las hojas modeladas (y las flores
// del jacarandá y del palo borracho) renderizadas en Cycles. addTrees (src/city.js) arma primero los
// árboles simples; cuando cargan el modelo y las texturas se cambian geometrías y texturas en el lugar
// (los pedazos de src/chunks.js las comparten) y se apaga el bulto oscuro que tapaba la copa por dentro.
import * as THREE from 'three';
import { swapGeometry, loadBlenderMeshes, denseAlpha } from './blender.js';

// kits: [{ name, leaves, core, trunks: [{ painted, mesh }] }] (una entrada por especie)
export function loadBlenderTrees(kits) {
  const loader = new THREE.TextureLoader();
  Promise.all([loadBlenderMeshes('models/trees/arboles.glb'), ...kits.map((k) => loader.loadAsync(`textures/hojas_${k.name}.webp`))])
    .then(([geo, ...leaves]) => {
      kits.forEach((k, i) => {
        const copa = geo[`copa_${k.name}`];
        if (!copa) return;
        const map = leaves[i];
        map.colorSpace = THREE.SRGBColorSpace;
        // las coordenadas del glTF ya vienen con la v para abajo
        map.flipY = false;
        map.anisotropy = 4;
        swapGeometry(k.leaves, copa);
        const old = k.leaves.material.map;
        k.leaves.material.map = map;
        denseAlpha(k.leaves.material);
        // la sombra con la forma de las hojas nuevas (el material de sombra lo comparten los pedazos)
        const depth = k.leaves.customDepthMaterial;
        if (depth) {
          depth.map = map;
          denseAlpha(depth);
        }
        old?.dispose();
        for (const t of k.trunks) {
          const g = geo[`tronco_${k.name}${t.painted ? '_pintado' : ''}`];
          if (g) swapGeometry(t.mesh, g);
        }
        k.core.visible = false;
      });
    })
    .catch((e) => console.warn('árboles de Blender:', e.message));
}
