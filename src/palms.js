// Palmeras en las plazas (hay en el conurbano, y son lo más Vice City que existe): tronco curvo
// con anillos y una corona de hojas que caen. Instanciadas: dos mallas para todas.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { swapGeometry, loadBlenderMeshes } from './blender.js';
import { DATA as D } from './map.js';
import { R } from './rng.js';
import { VC, vcPalmSpots } from './vc.js';

function trunkTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const g = c.getContext('2d');
  // (con el filtro del modo Vice City el tronco marrón se iba a naranja: va más gris)
  g.fillStyle = VC ? '#8a7e70' : '#9a7b55';
  g.fillRect(0, 0, 128, 16);
  // anillos del tronco (a lo largo de u)
  for (let x = 0; x < 128; x += 8) {
    g.fillStyle = 'rgba(60,40,20,0.55)';
    g.fillRect(x, 0, 2, 16);
    g.fillStyle = 'rgba(255,235,200,0.18)';
    g.fillRect(x + 3, 0, 2, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// hoja de palmera: nervio central con hojuelas a los costados (con transparencia)
function frondTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = '#3f6b2a';
  for (let y = 8; y < 250; y += 6) {
    const k = 1 - Math.abs(y - 110) / 150;
    const w = 30 * Math.max(0.2, k);
    g.lineWidth = 4;
    g.strokeStyle = y % 12 ? '#4f8a33' : '#3d6e27';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(32, y);
      g.lineTo(32 + s * w, y + 10);
      g.stroke();
    }
  }
  g.fillStyle = '#6b8a3a';
  g.fillRect(30, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function palmGeometry() {
  // tronco inclinado y curvo
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.12, 2, 0), new THREE.Vector3(0.45, 4.2, 0), new THREE.Vector3(0.95, 6.3, 0)]);
  const trunk = new THREE.TubeGeometry(curve, 16, 0.17, 7, false);
  const top = curve.getPoint(1);
  // corona: 10 hojas largas que salen del tope y se curvan hacia abajo
  const fronds = [];
  for (let i = 0; i < 10; i++) {
    const f = new THREE.PlaneGeometry(1.0, 3.4, 1, 8).translate(0, 1.7, 0);
    const p = f.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const y = p.getY(j);
      // se arquea: sube un poco y cae hacia la punta
      p.setZ(j, -0.18 * y * y + 0.35 * y);
    }
    f.rotateX(-Math.PI / 2 + 0.25);
    f.rotateY((i / 10) * Math.PI * 2 + (i % 2) * 0.2);
    f.translate(top.x, top.y, top.z);
    f.computeVertexNormals();
    fronds.push(f);
  }
  return { trunk, crown: mergeGeometries(fronds) };
}

export function addPalms(scene, colliders, heightAt) {
  const centroid = (ring) => {
    let x = 0;
    let z = 0;
    for (const [a, b] of ring) {
      x += a;
      z += b;
    }
    return { x: x / ring.length, z: z / ring.length };
  };
  const parks = D.parks.filter((p) => p.c === 'park' || p.c === 'garden' || p.c === 'village_green').map((p) => centroid(p.r[0][0]));
  const spots = [];
  for (const c of parks) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + R.range(-0.4, 0.4);
      const r = R.range(5, 10);
      const p = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r };
      if (colliders.resolveCircle({ ...p }, 1.2)) continue;
      spots.push(p);
    }
  }
  // las de vereda del modo Vice City ya tenían lugar (eran árboles)
  spots.push(...vcPalmSpots);
  if (!spots.length) return;
  const { trunk, crown } = palmGeometry();
  const trunkMat = new THREE.MeshStandardMaterial({ map: trunkTexture(), roughness: 0.95 });
  trunkMat.map.repeat.set(6, 1);
  const crownMat = new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
  const T = new THREE.InstancedMesh(trunk, trunkMat, spots.length);
  const C = new THREE.InstancedMesh(crown, crownMat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  spots.forEach((p, i) => {
    const s = R.range(0.85, 1.2);
    q.setFromAxisAngle(up, R.range(0, Math.PI * 2));
    m.compose(new THREE.Vector3(p.x, heightAt(p.x, p.z), p.z), q, new THREE.Vector3(s, s, s));
    T.setMatrixAt(i, m);
    C.setMatrixAt(i, m);
    colliders.addCircle(p.x, p.z, 0.3, 6, 'tree');
  });
  for (const o of [T, C]) {
    o.userData.static = true;
    o.castShadow = true;
    o.receiveShadow = true;
    scene.add(o);
  }
  loadBlenderPalm(T, C, crownMat);
  return spots;
}

// La palmera hecha en Blender (tools/blender/palmera.py): mismos triángulos que la de arriba, con la hoja
// modelada (nervio y folíolos) como textura recortada, hojas con pliegue en V en dos pisos, la base del
// tronco ancha y la sombra de la copa horneada. Si no carga, queda la de arriba.
function loadBlenderPalm(T, C, crownMat) {
  Promise.all([loadBlenderMeshes('models/trees/palmera.glb'), new THREE.TextureLoader().loadAsync('textures/palmera_hoja.webp')])
    .then(([geo, leaf]) => {
      if (!geo.tronco || !geo.copa) return;
      leaf.colorSpace = THREE.SRGBColorSpace;
      leaf.anisotropy = 4;
      swapGeometry(T, geo.tronco);
      swapGeometry(C, geo.copa);
      crownMat.map = leaf;
      crownMat.alphaTest = 0.4;
      crownMat.alphaToCoverage = true;
      // sombra con la forma de las hojas (también en los pedazos de chunks.js)
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leaf, alphaTest: 0.4 });
      C.traverse((m) => {
        if (m.isInstancedMesh) m.customDepthMaterial = depth;
      });
    })
    .catch((e) => console.warn('palmera de Blender:', e.message));
}
