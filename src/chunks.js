// Parte las mallas gigantes de la ciudad (casas, cornisas, techos: cientos de miles de triángulos
// cada una) en cuadrados de `cell` metros. Así three.js descarta los pedazos que la cámara no ve y
// la sombra del sol (un cuadrado de 140 m alrededor de Gaspi) solo dibuja los cercanos. Antes la
// ciudad entera se dibujaba dos veces por cuadro: era lo que más pesaba en la compu.
// La malla original queda como contenedor vacío (los pedazos son sus hijos), así el código que la
// prende, la apaga o le cambia el material sigue andando igual.
import * as THREE from 'three';

function triCount(g) {
  return (g.index ? g.index.count : g.attributes.position.count) / 3;
}

export function chunkMesh(mesh, cell = 120) {
  const g = mesh.geometry;
  if (Array.isArray(mesh.material) || g.groups.length || g.drawRange.count !== Infinity || Object.keys(g.morphAttributes).length) return false;
  if (Object.values(g.attributes).some((a) => a.usage !== THREE.StaticDrawUsage || a.isInterleavedBufferAttribute)) return false;
  const pos = g.attributes.position;
  const index = g.index;
  const n = triCount(g);
  const vid = (t, k) => (index ? index.getX(t * 3 + k) : t * 3 + k);
  const buckets = new Map();
  for (let t = 0; t < n; t++) {
    const a = vid(t, 0);
    const b = vid(t, 1);
    const c = vid(t, 2);
    const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
    const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    const key = `${Math.floor(cx / cell)},${Math.floor(cz / cell)}`;
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(t);
  }
  if (buckets.size < 2) return false;
  const names = Object.keys(g.attributes);
  for (const tris of buckets.values()) {
    const remap = new Map();
    const order = [];
    const idx = new Uint32Array(tris.length * 3);
    let w = 0;
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        const v = vid(t, k);
        let m = remap.get(v);
        if (m === undefined) {
          m = order.length;
          remap.set(v, m);
          order.push(v);
        }
        idx[w++] = m;
      }
    }
    const ng = new THREE.BufferGeometry();
    for (const name of names) {
      const src = g.attributes[name];
      const size = src.itemSize;
      const arr = new src.array.constructor(order.length * size);
      for (let i = 0; i < order.length; i++) for (let s = 0; s < size; s++) arr[i * size + s] = src.getComponent(order[i], s);
      ng.setAttribute(name, new THREE.BufferAttribute(arr, size, src.normalized));
    }
    ng.setIndex(new THREE.BufferAttribute(order.length > 65535 ? idx : Uint16Array.from(idx), 1));
    ng.computeBoundingSphere();
    const m = new THREE.Mesh(ng, mesh.material);
    // (la sombra recortada de las hojas: sin esto los pedazos tiraban sombra de placa llena)
    m.customDepthMaterial = mesh.customDepthMaterial;
    m.castShadow = mesh.castShadow;
    m.receiveShadow = mesh.receiveShadow;
    m.renderOrder = mesh.renderOrder;
    m.userData.chunk = true;
    mesh.add(m);
  }
  g.dispose();
  // contenedor vacío: no dibuja nada (posición sin vértices)
  mesh.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([], 3));
  return true;
}

// Instancias fijas (árboles, tanques, antenas, parabólicas…): three.js las dibuja todas o ninguna,
// así que se reparten en un InstancedMesh por cuadrado. Solo las marcadas userData.static: los
// postes que se caen y las luces de los semáforos cambian sus instancias en el juego.
const FAR = new THREE.Sphere(new THREE.Vector3(0, -1e6, 0), 0);
const SMALL = []; // pedazos de cosas chicas que se apagan de lejos
export function chunkInstanced(mesh, cell = 120) {
  const e = mesh.instanceMatrix.array;
  const buckets = new Map();
  for (let i = 0; i < mesh.count; i++) {
    const key = `${Math.floor(e[i * 16 + 12] / cell)},${Math.floor(e[i * 16 + 14] / cell)}`;
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(i);
  }
  if (buckets.size < 2) return false;
  const col = mesh.instanceColor;
  // de qué pedazo y en qué lugar quedó cada instancia (para las que se mueven, ver más abajo)
  const remap = [];
  for (const list of buckets.values()) {
    const m = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
    if (col) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
    list.forEach((i, k) => {
      remap[i] = [m, k];
      m.instanceMatrix.array.set(e.subarray(i * 16, i * 16 + 16), k * 16);
      if (col) m.instanceColor.array.set(col.array.subarray(i * 3, i * 3 + 3), k * 3);
    });
    m.computeBoundingSphere();
    m.customDepthMaterial = mesh.customDepthMaterial;
    m.castShadow = mesh.castShadow;
    m.receiveShadow = mesh.receiveShadow;
    m.renderOrder = mesh.renderOrder;
    m.userData.chunk = true;
    if (mesh.userData.far) {
      m.userData.far = mesh.userData.far;
      SMALL.push(m);
    }
    mesh.add(m);
  }
  // el original queda vacío y siempre fuera de cámara
  mesh.count = 0;
  mesh.boundingSphere = FAR;
  // userData.movable (los postes que se caen, src/smash.js): setMatrixAt sigue andando con el índice
  // de siempre y lo manda al pedazo que corresponde
  if (mesh.userData.movable) {
    mesh.setMatrixAt = (i, m4) => {
      const [m, k] = remap[i];
      m.setMatrixAt(k, m4);
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    };
  }
  return true;
}

// todas las mallas fijas grandes de la escena (no las animadas) y las instancias marcadas fijas
export function chunkScene(scene, { cell = 200, instCell = 320, minTris = 15000 } = {}) {
  const list = [];
  const inst = [];
  scene.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.userData.chunk || o.userData.noChunk || !o.geometry?.attributes.position) return;
    if (o.isInstancedMesh) {
      if (o.userData.static) inst.push(o);
    } else if (triCount(o.geometry) >= minTris) list.push(o);
  });
  let n = 0;
  for (const o of list) if (chunkMesh(o, cell)) n++;
  for (const o of inst) if (chunkInstanced(o, instCell)) n++;
  return n;
}

// cada tanto: las cosas chicas lejos de la cámara no se dibujan (ni su sombra)
export function updateChunks(pos) {
  for (const m of SMALL) {
    const s = m.boundingSphere;
    m.visible = Math.hypot(s.center.x - pos.x, s.center.z - pos.z) - s.radius < m.userData.far;
  }
}
