// Modelos bajados de internet, de uso libre (CC0): por ahora la ambulancia y la autobomba de Kenney.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ---------- Vehículos del Car Kit de Kenney (CC0, vía github.com/pmndrs/market-assets) ----------
// Ambulancia y autobomba, sin Draco (tools/models/undraco.mjs). Se escalan al largo pedido, se
// orientan con el frente a +z y cada rueda gira en su propio pivote.
const kenney = new Map();
// narrow: los de Kenney son de proporción juguete (muy anchos); se angostan para que parezcan reales
export async function loadKenney(name, { length = 5.5, narrow = 0.82 } = {}) {
  if (!kenney.has(name)) kenney.set(name, new GLTFLoader().loadAsync(`models/vehicles/${name}.glb`).then((g) => g.scene));
  const model = (await kenney.get(name)).clone(true);
  const front = [];
  const back = [];
  model.traverse((o) => {
    if (/^wheel_front/.test(o.name)) front.push(o);
    else if (/^wheel_back/.test(o.name)) back.push(o);
    if (o.isMesh) o.castShadow = true;
  });
  const center = (o) => new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
  model.updateMatrixWorld(true);
  if (front.length && back.length && center(front[0]).z < center(back[0]).z) model.rotation.y = Math.PI;
  const holder = new THREE.Group();
  holder.add(model);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const k = length / Math.max(0.01, box.max.z - box.min.z);
  holder.scale.set(k * narrow, k, k);
  holder.position.set((-(box.min.x + box.max.x) / 2) * k * narrow, -box.min.y * k, (-(box.min.z + box.max.z) / 2) * k);
  const g = new THREE.Group();
  g.add(holder);
  g.updateMatrixWorld(true);
  const wheels = [];
  for (const w of [...front, ...back]) {
    const pivot = new THREE.Group();
    pivot.rotation.order = 'YXZ';
    pivot.position.copy(g.worldToLocal(center(w)));
    g.add(pivot);
    pivot.updateMatrixWorld(true);
    pivot.attach(w);
    wheels.push(pivot);
  }
  g.userData = { L: length, W: (box.max.x - box.min.x) * k * narrow, wheels, kind: 'car', model: name, tall: (box.max.y - box.min.y) * k };
  return g;
}
