// Accesorios para las personas con esqueleto (MakeHuman, src/people.js): gorra, casco, franela, vasito.
// La gorra y el casco van colgados del hueso de la cabeza del modelo y se calzan con las medidas de su
// cabeza (userData.head del glb: alto, frente, centro y radios, en metros respecto del hueso). Lo de las
// manos cuelga de la mano del esqueleto fantasma (como las armas). Geometrías y materiales compartidos.
import * as THREE from 'three';

const MATS = new Map();
function mat(color, rough = 0.85, metal = 0) {
  const k = `${color}|${rough}|${metal}`;
  if (!MATS.has(k)) MATS.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, side: THREE.DoubleSide }));
  return MATS.get(k);
}
// casquete: media esfera unitaria (el ecuador va a la altura de la frente)
const DOME = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
// visera: medio disco apenas curvado
const VISOR = (() => {
  const g = new THREE.CircleGeometry(1, 14, 0, Math.PI);
  g.rotateX(Math.PI / 2); // acostado, hacia adelante (+z)
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, -0.12 * p.getX(i) ** 2); // los costados caen un poco
  g.computeVertexNormals();
  return g;
})();
const BUTTON = new THREE.SphereGeometry(1, 8, 4);
const CLOTH = new THREE.BoxGeometry(0.02, 0.24, 0.28);
const CUP = new THREE.CylinderGeometry(0.04, 0.034, 0.1, 10, 1, true);

// medidas de la cabeza: las del modelo (userData.head del glb) o unas razonables
const HEAD = { top: 0.148, brow: 0.066, cz: 0.008, rx: 0.075, rz: 0.104 };
const headOf = (h) => h.rig?.model?.userData?.head ?? HEAD;

function onHead(h, g) {
  const bone = h.rig?.map?.head;
  if (bone) bone.add(g);
  else h.bones.head.add(g);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

// gorra con visera (la de la cana, del panchero, de los trapitos)
export function wearCap(h, color, { visor = true, badge = null } = {}) {
  const m = headOf(h);
  const g = new THREE.Group();
  // el cráneo es más cuadrado que un elipsoide: la copa va holgada para que no lo atraviese (el pelo no
  // se dibuja con gorra)
  const pad = 0.012;
  const crown = new THREE.Mesh(DOME, mat(color));
  crown.scale.set(m.rx * 1.14 + pad, (m.top - m.brow) * 1.12 + pad, m.rz * 1.08 + pad);
  crown.position.set(0, m.brow - 0.012, m.cz - 0.006);
  crown.rotation.x = -0.06; // apenas echada para atrás
  g.add(crown);
  if (visor) {
    const v = new THREE.Mesh(VISOR, mat(color, 0.7));
    v.scale.set(m.rx * 1.02, 0.1, m.rz * 0.8); // la caída de los costados: 1,2 cm
    v.position.set(0, m.brow - 0.01, m.cz + m.rz * 0.95);
    v.rotation.x = 0.2;
    g.add(v);
  }
  const b = new THREE.Mesh(BUTTON, mat(color));
  b.scale.setScalar(0.009);
  b.position.set(0, m.brow - 0.012 + (m.top - m.brow) * 1.12 + pad, m.cz - 0.02);
  g.add(b);
  if (badge != null) {
    // insignia dorada adelante (la de la policía)
    const s = new THREE.Mesh(BUTTON, mat(badge, 0.35, 0.8));
    s.scale.set(0.016, 0.018, 0.006);
    s.position.set(0, m.brow + 0.03, m.cz + m.rz * 1.08 + pad - 0.008);
    g.add(s);
  }
  g.name = 'gorra';
  return onHead(h, g);
}

// casco (soldado del tanque): casquete más grande y bajo atrás
export function wearHelmetMH(h, color) {
  const m = headOf(h);
  const g = new THREE.Group();
  const shell = new THREE.Mesh(DOME, mat(color, 0.55));
  shell.scale.set(m.rx + 0.03, (m.top - m.brow) + 0.035, m.rz + 0.03);
  shell.position.set(0, m.brow - 0.02, m.cz - 0.005);
  g.add(shell);
  g.name = 'casco';
  return onHead(h, g);
}

// franela amarilla en la mano izquierda (trapitos) y vasito en la derecha (linyera)
export function holdCloth(h, color = 0xf5d90a) {
  const c = new THREE.Mesh(CLOTH, mat(color, 0.95));
  c.position.set(0.02, -0.12, 0.04);
  h.bones.handL.add(c);
  c.castShadow = true;
  return c;
}
export function holdCup(h) {
  const c = new THREE.Mesh(CUP, mat(0xe8e8e8, 0.6));
  c.position.set(0, -0.08, 0.05);
  h.bones.handR.add(c);
  return c;
}

// anteojos negros (Laban, el Comandante; algunos vecinos con lentes)
const LENS = new THREE.BoxGeometry(1, 1, 1);
export function wearShades(h, color = 0x050505, thin = false) {
  const m = headOf(h);
  const g = new THREE.Group();
  const lens = mat(color, thin ? 0.5 : 0.08, thin ? 0 : 0.8);
  const y = m.brow - 0.026;
  const z = m.cz + m.rz - 0.006;
  for (const s of [-1, 1]) {
    const l = new THREE.Mesh(LENS, lens);
    l.scale.set(0.05, thin ? 0.03 : 0.032, thin ? 0.004 : 0.01);
    l.position.set(s * 0.033, y, z - Math.abs(s) * 0.006);
    g.add(l);
    // patillas hasta las orejas
    const t = new THREE.Mesh(LENS, lens);
    t.scale.set(0.004, 0.006, m.rz * 0.95);
    t.position.set(s * (m.rx + 0.004), y + 0.006, m.cz + m.rz * 0.48);
    g.add(t);
  }
  const b = new THREE.Mesh(LENS, lens);
  b.scale.set(0.022, 0.006, 0.006);
  b.position.set(0, y + 0.008, z + 0.002);
  g.add(b);
  g.name = 'anteojos';
  return onHead(h, g);
}

// cadenita de oro al cuello (el Comandante): cuelga del hueso del cuello, sobre el pecho
const CHAIN = new THREE.TorusGeometry(1, 0.09, 6, 22);
export function wearChain(h) {
  const c = new THREE.Mesh(CHAIN, mat(0xffcf40, 0.25, 1));
  c.scale.setScalar(0.07);
  c.rotation.x = Math.PI / 2.6;
  c.position.set(0, 0.01, 0.022);
  c.castShadow = true;
  (h.rig?.map?.neck ?? h.bones.neck).add(c);
  return c;
}
