// Retarget: mueve cualquier personaje con esqueleto humanoide estándar (Mixamo, Quaternius,
// Mesh2Motion…) con nuestras poses de animateHuman (caminar, piñas, sentarse, gym, morir…).
//
// Cómo: se anima un esqueleto "fantasma" con nuestros huesos (los mismos que makeHuman, con los
// brazos abajo en reposo). Cada cuadro, para cada hueso real que corresponde a uno nuestro:
//   mundo_real = mundo_nuestro · A · reposo_real      (A alinea su reposo, p. ej. en T, con el nuestro)
//   local_real = mundo_padre⁻¹ · mundo_real
// Los huesos que no corresponden (hombros, dedos, ojos) quedan en su reposo relativo al padre.
// La cadera mueve el modelo entero (sentarse, sentadilla, caerse, colgarse del rack).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { BONES } from './body.js';

// nombres posibles (normalizados: sin "mixamorig", sin espacios ni puntos, en minúscula)
const NAMES = {
  hips: ['hips', 'pelvis'],
  spine: ['spine', 'spine01', 'spine1'],
  chest: ['spine2', 'chest', 'upperchest', 'spine03', 'spine02'],
  neck: ['neck', 'neck01'],
  head: ['head'],
  uaR: ['rightarm', 'upperarmr', 'upperarm_r', 'arm_r', 'upper_armr'],
  faR: ['rightforearm', 'lowerarmr', 'lowerarm_r', 'forearm_r', 'forearmr'],
  handR: ['righthand', 'handr', 'hand_r'],
  uaL: ['leftarm', 'upperarml', 'upperarm_l', 'arm_l', 'upper_arml'],
  faL: ['leftforearm', 'lowerarml', 'lowerarm_l', 'forearm_l', 'forearml'],
  handL: ['lefthand', 'handl', 'hand_l'],
  thR: ['rightupleg', 'upperlegr', 'upperleg_r', 'thigh_r', 'thighr'],
  shR: ['rightleg', 'lowerlegr', 'lowerleg_r', 'calf_r', 'shin_r'],
  ftR: ['rightfoot', 'footr', 'foot_r'],
  thL: ['leftupleg', 'upperlegl', 'upperleg_l', 'thigh_l', 'thighl'],
  shL: ['leftleg', 'lowerlegl', 'lowerleg_l', 'calf_l', 'shin_l', 'shinl'],
  ftL: ['leftfoot', 'footl', 'foot_l'],
};
const norm = (n) => n.replace(/^mixamorig[:_]?/i, '').replace(/[\s._:-]/g, '').toLowerCase();

// nuestro esqueleto en reposo (igual que makeHuman, con hombros de varón)
const REST = {
  root: [[0, 0, 0], null],
  hips: [[0, 0.95, 0], 'root'],
  spine: [[0, 1.1, 0], 'hips'],
  chest: [[0, 1.32, 0], 'spine'],
  neck: [[0, 1.6, 0], 'chest'],
  head: [[0, 1.68, 0], 'neck'],
  uaR: [[-0.195, 1.55, 0], 'chest'],
  faR: [[-0.195, 1.25, 0], 'uaR'],
  handR: [[-0.195, 0.99, 0], 'faR'],
  uaL: [[0.195, 1.55, 0], 'chest'],
  faL: [[0.195, 1.25, 0], 'uaL'],
  handL: [[0.195, 0.99, 0], 'faL'],
  thR: [[-0.095, 0.93, 0], 'hips'],
  shR: [[-0.095, 0.5, 0], 'thR'],
  ftR: [[-0.095, 0.08, 0], 'shR'],
  thL: [[0.095, 0.93, 0], 'hips'],
  shL: [[0.095, 0.5, 0], 'thL'],
  ftL: [[0.095, 0.08, 0], 'shL'],
};
// hacia dónde apunta cada hueso nuestro en reposo, y qué hueso marca esa dirección
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const DIR = { hips: [UP, 'spine'], spine: [UP, 'chest'], chest: [UP, 'neck'], neck: [UP, 'head'], uaR: [DOWN, 'faR'], faR: [DOWN, 'handR'], uaL: [DOWN, 'faL'], faL: [DOWN, 'handL'], thR: [DOWN, 'shR'], shR: [DOWN, 'ftR'], thL: [DOWN, 'shL'], shL: [DOWN, 'ftL'] };

const _v = new THREE.Vector3();

// source: escena de un glTF con un SkinnedMesh humanoide. Devuelve un "h" que entiende animateHuman.
export function rigHuman(source, { height = 1.75, female = false } = {}) {
  const model = cloneSkinned(source);
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false; // el skinning mueve los vértices fuera de la caja original
    }
  });
  const holder = new THREE.Group(); // escala el modelo a la altura pedida
  const shift = new THREE.Group(); // lo mueve con la cadera
  const root = new THREE.Group();
  shift.add(holder);
  root.add(shift);
  holder.add(model);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const k = height / Math.max(0.01, box.max.y - box.min.y);
  holder.scale.setScalar(k);
  holder.position.y = -box.min.y * k;
  root.updateMatrixWorld(true);

  // huesos reales que corresponden a los nuestros
  const all = [];
  model.traverse((o) => o.isBone && all.push(o));
  const map = {};
  for (const n of BONES) {
    if (!NAMES[n]) continue;
    for (const cand of NAMES[n]) {
      const b = all.find((x) => norm(x.name) === norm(cand));
      if (b) {
        map[n] = b;
        break;
      }
    }
  }
  if (!map.hips) throw new Error('El modelo no tiene un esqueleto humanoide reconocible');

  // esqueleto fantasma con nuestros nombres
  const bones = {};
  for (const n of BONES) {
    const [pos, parent] = REST[n];
    const o = new THREE.Object3D();
    const pp = parent ? REST[parent][0] : [0, 0, 0];
    o.position.set(pos[0] - pp[0], pos[1] - pp[1], pos[2] - pp[2]);
    if (parent) bones[parent].add(o);
    bones[n] = o;
  }

  // reposo de los huesos reales en el marco de "root"
  const invRoot = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const wq = (o) => invRoot.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion()));
  const wp = (o) => root.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
  const ours = new Map(Object.entries(map).map(([n, b]) => [b, n]));
  const A = {};
  for (const n of BONES) {
    const b = map[n];
    if (!b) continue;
    const d = DIR[n];
    let child = d && map[d[1]];
    if (n === 'head') child = all.find((x) => x.parent === b);
    if (child) {
      const t = wp(child).sub(wp(b)).normalize();
      A[n] = new THREE.Quaternion().setFromUnitVectors(t, n === 'head' ? UP : d[0]);
    }
  }
  // los huesos sin dirección propia (manos, pies, cabeza) heredan la alineación del padre
  for (const n of BONES) if (map[n] && !A[n]) A[n] = (REST[n][1] && A[REST[n][1]]?.clone()) || new THREE.Quaternion();

  // recorrido desde la cadera (padres antes que hijos)
  const list = [];
  const walk = (b, parentIndex) => {
    const n = ours.get(b);
    const t = { bone: b, name: n, parent: parentIndex, restLocal: b.quaternion.clone(), restW: wq(b), w: new THREE.Quaternion() };
    list.push(t);
    const i = list.length - 1;
    for (const c of b.children) if (c.isBone) walk(c, i);
  };
  walk(map.hips, -1);
  const hipsParentW = wq(map.hips.parent);
  const invParent = new THREE.Quaternion();
  // el esqueleto fantasma va adentro del personaje (invisible): lo que se cuelga de sus manos
  // (armas, la bolsa del vendedor) se ve donde está la mano del modelo
  root.add(bones.root);
  // rotaciones acumuladas del fantasma, relativas a "root" (no dependen de dónde esté parado)
  const G = Object.fromEntries(BONES.map((n) => [n, new THREE.Quaternion()]));

  function apply() {
    for (const n of BONES) {
      const p = REST[n][1];
      if (p) G[n].copy(G[p]).multiply(bones[n].quaternion);
      else G[n].copy(bones[n].quaternion);
    }
    // la cadera arrastra el modelo entero (sentarse, caerse, colgarse)
    _v.copy(bones.hips.position).applyQuaternion(G.root).add(bones.root.position);
    shift.position.set(_v.x, _v.y - 0.95, _v.z);
    for (const t of list) {
      const pw = t.parent < 0 ? hipsParentW : list[t.parent].w;
      if (t.name) {
        t.w.copy(G[t.name]).multiply(A[t.name]).multiply(t.restW);
        invParent.copy(pw).invert();
        t.bone.quaternion.copy(invParent).multiply(t.w);
      } else t.w.copy(pw).multiply(t.restLocal);
    }
  }

  const h = { root, bones, phase: Math.random() * 10, geos: null, lod: 0, keep: true, female, rig: { apply, map, model } };
  apply();
  return h;
}
