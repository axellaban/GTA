// Personas con esqueleto (SkinnedMesh): torso con volumen, rodillas, codos y cara texturada.
// Todas comparten un material y un atlas de caras, así cada persona es una sola llamada de dibujo.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import gaspiUrl from './gaspi.webp';

export const SKINS = [0xe8c4a8, 0xd9a882, 0xc68b62, 0xa86f4a, 0x8a5a3a, 0xf1d2bb];
export const HAIRS = [0x2b1d14, 0x4a3020, 0x1a1a1a, 0x6b4a2b, 0x8a8a8a, 0xb88a4a];

// ---------- Atlas de caras ----------
// Celdas de 256x128 (la cabeza se envuelve como un mapa equirectangular: la cara queda en u=0.25).
const AW = 2048;
const AH = 1024;
const CW = 256;
const CH = 128;
const COLS = AW / CW;
let atlas = null;
let actx = null;
let atlasTex = null;
let nextCell = 3; // 0 = tela, 1 = corbata, 2 = chaleco reflectivo
const cellCache = new Map();
export let humanMat = null;

function hex(c) {
  return `#${new THREE.Color(c).getHexString()}`;
}
function cellRect(i) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  return { x: col * CW, y: row * CH, u0: (col * CW + 1) / AW, u1: ((col + 1) * CW - 1) / AW, v0: 1 - ((row + 1) * CH - 1) / AH, v1: 1 - (row * CH + 1) / AH };
}

function initAtlas() {
  if (atlas) return;
  atlas = document.createElement('canvas');
  atlas.width = AW;
  atlas.height = AH;
  actx = atlas.getContext('2d');
  // celda 0: tela con grano (se multiplica por el color del vértice)
  const c0 = cellRect(0);
  actx.fillStyle = '#ececec';
  actx.fillRect(c0.x, c0.y, CW, CH);
  for (let i = 0; i < 2600; i++) {
    const v = 200 + Math.floor(Math.random() * 55);
    actx.fillStyle = `rgb(${v},${v},${v})`;
    actx.fillRect(c0.x + Math.random() * CW, c0.y + Math.random() * CH, 2, 1 + Math.random() * 3);
  }
  // pliegues suaves
  for (let i = 0; i < 12; i++) {
    actx.fillStyle = 'rgba(0,0,0,0.05)';
    actx.fillRect(c0.x + Math.random() * CW, c0.y, 3 + Math.random() * 6, CH);
  }
  // celda 1: corbata a rayas rojas y blancas
  const c1 = cellRect(1);
  actx.save();
  actx.beginPath();
  actx.rect(c1.x, c1.y, CW, CH);
  actx.clip();
  actx.fillStyle = '#f4f4f4';
  actx.fillRect(c1.x, c1.y, CW, CH);
  actx.strokeStyle = '#d0202f';
  actx.lineWidth = 14;
  for (let i = -CH; i < CW + CH; i += 30) {
    actx.beginPath();
    actx.moveTo(c1.x + i, c1.y);
    actx.lineTo(c1.x + i + CH, c1.y + CH);
    actx.stroke();
  }
  actx.restore();
  // celda 2: chaleco flúor con banda reflectiva
  const c2 = cellRect(2);
  actx.fillStyle = '#ffffff';
  actx.fillRect(c2.x, c2.y, CW, CH);
  actx.fillStyle = '#b8b8b8';
  actx.fillRect(c2.x, c2.y + CH * 0.62, CW, CH * 0.12);
  atlasTex = new THREE.CanvasTexture(atlas);
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.anisotropy = 4;
  humanMat = new THREE.MeshLambertMaterial({ map: atlasTex, vertexColors: true });
}

// Dibuja una cabeza (piel, pelo, cara) en una celda
function drawHead(i, o) {
  const r = cellRect(i);
  const g = actx;
  const X = (u) => r.x + u * CW;
  const Y = (v) => r.y + v * CH;
  g.save();
  g.beginPath();
  g.rect(r.x, r.y, CW, CH);
  g.clip();
  const skin = new THREE.Color(o.skin);
  g.fillStyle = hex(skin);
  g.fillRect(r.x, r.y, CW, CH);
  // sombreado lateral y de mentón
  const shade = g.createLinearGradient(0, Y(0.55), 0, Y(0.85));
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(60,30,20,0.25)');
  g.fillStyle = shade;
  g.fillRect(r.x, Y(0.55), CW, CH * 0.45);
  const hair = hex(o.hair);
  const bald = o.hairStyle === 'bald';
  // pelo: arriba en toda la vuelta y atrás
  if (!bald) {
    g.fillStyle = hair;
    g.fillRect(r.x, r.y, CW, CH * (o.hairStyle === 'long' ? 0.36 : 0.33));
    // nuca
    g.fillRect(X(0.45), r.y, CW * 0.6, CH * (o.hairStyle === 'long' ? 0.95 : 0.6));
    g.fillRect(X(-0.05), r.y, CW * 0.1, CH * 0.6);
    // patillas
    g.fillRect(X(0.1), Y(0.3), CW * 0.03, CH * 0.18);
    g.fillRect(X(0.37), Y(0.3), CW * 0.03, CH * 0.18);
    // flequillo irregular
    for (let k = 0; k < 10; k++) g.fillRect(X(0.12 + k * 0.026), Y(0.3), CW * 0.03, CH * (0.02 + Math.random() * 0.06));
  } else {
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(X(0.45), Y(0.35), CW * 0.6, CH * 0.2);
  }
  // orejas
  g.fillStyle = hex(skin.clone().multiplyScalar(0.85));
  g.fillRect(X(-0.02), Y(0.42), CW * 0.04, CH * 0.14);
  g.fillRect(X(0.48), Y(0.42), CW * 0.04, CH * 0.14);
  if (o.photo) {
    // la foto de Gaspi, recortada a la cara y fundida con la piel
    const img = o.photo;
    g.drawImage(img, 139, 30, 34, 46, X(0.176), Y(0.3), CW * 0.148, CH * 0.41);
    const fade = g.createRadialGradient(X(0.25), Y(0.5), CW * 0.045, X(0.25), Y(0.5), CW * 0.085);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, hex(skin));
    g.fillStyle = fade;
    g.fillRect(X(0.13), Y(0.2), CW * 0.24, CH * 0.65);
    g.fillStyle = hair;
    g.fillRect(X(0.1), r.y, CW * 0.3, CH * 0.3);
    for (let k = 0; k < 8; k++) g.fillRect(X(0.17 + k * 0.02), Y(0.3), CW * 0.022, CH * (0.01 + Math.random() * 0.05));
  } else {
    // cejas
    g.fillStyle = hex(new THREE.Color(o.hair).multiplyScalar(0.8));
    g.fillRect(X(0.185), Y(0.39), CW * 0.045, CH * 0.03);
    g.fillRect(X(0.27), Y(0.39), CW * 0.045, CH * 0.03);
    // ojos
    for (const u of [0.207, 0.293]) {
      g.fillStyle = '#f2efe8';
      g.fillRect(X(u - 0.018), Y(0.45), CW * 0.036, CH * 0.045);
      g.fillStyle = o.eyes ?? '#3b2a1e';
      g.fillRect(X(u - 0.008), Y(0.45), CW * 0.017, CH * 0.045);
    }
    // nariz y boca
    g.fillStyle = 'rgba(80,40,30,0.25)';
    g.fillRect(X(0.24), Y(0.5), CW * 0.02, CH * 0.12);
    g.fillStyle = hex(skin.clone().lerp(new THREE.Color(0x8a3a30), 0.45));
    g.fillRect(X(0.215), Y(0.66), CW * 0.07, CH * 0.03);
    if (o.beard) {
      g.fillStyle = hair;
      g.globalAlpha = 0.85;
      g.fillRect(X(0.12), Y(0.62), CW * 0.26, CH * 0.22);
      g.globalAlpha = 1;
      g.fillStyle = hex(skin.clone().lerp(new THREE.Color(0x8a3a30), 0.45));
      g.fillRect(X(0.215), Y(0.67), CW * 0.07, CH * 0.025);
    } else if (o.mustache) {
      g.fillStyle = hair;
      g.fillRect(X(0.2), Y(0.61), CW * 0.1, CH * 0.035);
    }
    if (o.glasses) {
      g.strokeStyle = '#141414';
      g.lineWidth = 2;
      g.strokeRect(X(0.183), Y(0.43), CW * 0.05, CH * 0.08);
      g.strokeRect(X(0.267), Y(0.43), CW * 0.05, CH * 0.08);
      g.fillStyle = '#141414';
      g.fillRect(X(0.233), Y(0.46), CW * 0.034, 2);
    }
    if (o.tired) {
      g.fillStyle = 'rgba(70,40,60,0.35)';
      g.fillRect(X(0.188), Y(0.5), CW * 0.04, CH * 0.03);
      g.fillRect(X(0.272), Y(0.5), CW * 0.04, CH * 0.03);
    }
  }
  g.restore();
  atlasTex.needsUpdate = true;
}

let gaspiHead = null;
function headCell(o) {
  const key = o.gaspi ? 'gaspi' : [o.skin, o.hair, o.hairStyle, o.beard, o.mustache, o.glasses, o.tired].join('|');
  if (o.gaspi) gaspiHead = o;
  if (cellCache.has(key)) return cellCache.get(key);
  if (nextCell >= COLS * (AH / CH)) {
    // atlas lleno: reusar una cabeza cualquiera
    const any = [...cellCache.values()][Math.floor(Math.random() * cellCache.size)];
    return any;
  }
  const i = nextCell++;
  cellCache.set(key, i);
  drawHead(i, o);
  return i;
}

// ---------- Geometría ----------
const BONES = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'uaR', 'faR', 'handR', 'uaL', 'faL', 'handL', 'thR', 'shR', 'ftR', 'thL', 'shL', 'ftL'];
const B = Object.fromEntries(BONES.map((n, i) => [n, i]));
// posición de cada hueso en reposo (coordenadas absolutas) y su padre
const REST = {
  root: [[0, 0, 0], null],
  hips: [[0, 0.95, 0], 'root'],
  spine: [[0, 1.1, 0], 'hips'],
  chest: [[0, 1.32, 0], 'spine'],
  neck: [[0, 1.6, 0], 'chest'],
  head: [[0, 1.68, 0], 'neck'],
  uaR: [[-0.22, 1.55, 0], 'chest'],
  faR: [[-0.22, 1.25, 0], 'uaR'],
  handR: [[-0.22, 0.99, 0], 'faR'],
  uaL: [[0.22, 1.55, 0], 'chest'],
  faL: [[0.22, 1.25, 0], 'uaL'],
  handL: [[0.22, 0.99, 0], 'faL'],
  thR: [[-0.1, 0.93, 0], 'hips'],
  shR: [[-0.1, 0.5, 0], 'thR'],
  ftR: [[-0.1, 0.08, 0], 'shR'],
  thL: [[0.1, 0.93, 0], 'hips'],
  shL: [[0.1, 0.5, 0], 'thL'],
  ftL: [[0.1, 0.08, 0], 'shL'],
};

const tmpColor = new THREE.Color();
function piece(list, geo, bone, color, uvCell = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  tmpColor.set(color);
  for (let i = 0; i < n; i++) {
    col[i * 3] = tmpColor.r;
    col[i * 3 + 1] = tmpColor.g;
    col[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const r = cellRect(uvCell);
  const uv = g.attributes.uv;
  for (let i = 0; i < n; i++) uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0));
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    si[i * 4] = B[bone];
    sw[i * 4] = 1;
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  list.push(g);
}
function cyl(rt, rb, h, seg = 8, sz = 1) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1);
  g.scale(1, 1, sz);
  return g;
}
function at(g, x, y, z) {
  g.translate(x, y, z);
  return g;
}

export function makeHuman(o = {}) {
  initAtlas();
  const skin = o.skin ?? 0xd9a882;
  const shirt = o.shirt ?? 0x3f6fa0;
  const pants = o.pants ?? 0x2d3440;
  const shoes = o.shoes ?? 0x1c1c1c;
  const hair = o.hair ?? 0x2b1d14;
  const top = o.jacket ?? shirt;
  const sleeves = o.jacket || o.longSleeves ? top : skin;
  const parts = [];
  const P = (g, bone, color, cell) => piece(parts, g, bone, color, cell);

  // tronco
  P(at(cyl(0.165, 0.16, 0.22, 10, 0.72), 0, 0.97, 0), 'hips', pants);
  P(at(cyl(0.16, 0.162, 0.26, 10, 0.7), 0, 1.2, 0), 'spine', top);
  P(at(cyl(0.215, 0.165, 0.32, 10, 0.62), 0, 1.44, 0), 'chest', top);
  for (const s of [-1, 1]) P(at(new THREE.SphereGeometry(0.08, 8, 6), 0.2 * s, 1.55, 0), 'chest', top);
  if (o.belly) P(at(new THREE.SphereGeometry(0.16, 10, 8).scale(1, 0.9, 0.8), 0, 1.16, 0.06), 'spine', top);
  if (o.jacket) {
    // camisa blanca en V, solapas y corbata
    P(at(new THREE.BoxGeometry(0.1, 0.3, 0.02), 0, 1.47, 0.132), 'chest', shirt);
    for (const s of [-1, 1]) {
      const lap = new THREE.BoxGeometry(0.05, 0.28, 0.02);
      lap.rotateZ(0.28 * s);
      P(at(lap, 0.06 * s, 1.46, 0.135), 'chest', new THREE.Color(o.jacket).multiplyScalar(0.8));
    }
    if (o.tie) {
      P(at(new THREE.BoxGeometry(0.055, 0.34, 0.015), 0, 1.42, 0.146), 'chest', 0xffffff, 1);
      P(at(new THREE.BoxGeometry(0.07, 0.05, 0.02), 0, 1.6, 0.14), 'chest', 0xffffff, 1);
    }
    // botones
    P(at(new THREE.BoxGeometry(0.02, 0.02, 0.01), 0.07, 1.25, 0.118), 'spine', 0x111111);
  }
  if (o.vest) {
    P(at(cyl(0.225, 0.2, 0.44, 10, 0.64), 0, 1.36, 0), 'chest', o.vest, 2);
  }
  // cuello y cabeza
  P(at(cyl(0.055, 0.06, 0.12, 8), 0, 1.64, 0), 'neck', skin);
  const cell = headCell({ ...o, skin, hair });
  const head = new THREE.SphereGeometry(0.125, 16, 12);
  head.scale(0.92, 1.12, 1);
  P(at(head, 0, 1.8, 0), 'head', 0xffffff, cell);
  P(at(new THREE.BoxGeometry(0.03, 0.05, 0.04), 0, 1.79, 0.12), 'head', new THREE.Color(skin).multiplyScalar(0.95));
  if (o.helmet) {
    P(at(new THREE.SphereGeometry(0.155, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(1, 1.05, 1.08), 0, 1.81, 0), 'head', o.helmet);
    P(at(new THREE.BoxGeometry(0.22, 0.08, 0.02), 0, 1.8, 0.155), 'head', 0x151515);
  } else if (o.hood) {
    P(at(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.7).scale(1, 1.1, 1.1), 0, 1.79, -0.02), 'head', o.hood);
  } else if (o.cap) {
    P(at(new THREE.SphereGeometry(0.132, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.45).scale(0.95, 1, 1.02), 0, 1.84, 0), 'head', o.cap);
    P(at(new THREE.BoxGeometry(0.2, 0.02, 0.12), 0, 1.9, 0.16), 'head', o.cap);
  } else if (o.hairStyle !== 'bald') {
    // volumen de pelo arriba
    const capGeo = o.hairStyle === 'curly' ? new THREE.IcosahedronGeometry(0.14, 1) : new THREE.SphereGeometry(0.133, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
    capGeo.scale(0.95, o.hairStyle === 'curly' ? 0.85 : 1.05, 1.04);
    P(at(capGeo, 0, 1.83, -0.012), 'head', hair);
    if (o.hairStyle === 'long') P(at(new THREE.BoxGeometry(0.22, 0.26, 0.07), 0, 1.72, -0.1), 'head', hair);
  }
  // brazos (derecho en -x: el personaje mira hacia +z)
  for (const [s, ua, fa, hand] of [
    [-1, 'uaR', 'faR', 'handR'],
    [1, 'uaL', 'faL', 'handL'],
  ]) {
    P(at(cyl(0.062, 0.055, 0.3, 8), 0.22 * s, 1.4, 0), ua, top);
    P(at(cyl(0.052, 0.043, 0.27, 8), 0.22 * s, 1.12, 0), fa, sleeves);
    P(at(new THREE.BoxGeometry(0.06, 0.1, 0.05), 0.22 * s, 0.94, 0.005), hand, skin);
    if (o.cup && s > 0) P(at(cyl(0.04, 0.035, 0.1, 8), 0.22 * s, 0.9, 0.06), hand, 0xe8e8e8);
    if (o.franela && s < 0) P(at(new THREE.BoxGeometry(0.02, 0.26, 0.3), 0.24 * s, 0.82, 0.06), hand, 0xf5d90a);
  }
  // piernas
  for (const [s, th, sh, ft] of [
    [-1, 'thR', 'shR', 'ftR'],
    [1, 'thL', 'shL', 'ftL'],
  ]) {
    P(at(cyl(0.085, 0.066, 0.44, 8), 0.1 * s, 0.71, 0), th, pants);
    P(at(cyl(0.064, 0.05, 0.42, 8), 0.1 * s, 0.29, 0), sh, pants);
    P(at(new THREE.BoxGeometry(0.1, 0.08, 0.25), 0.1 * s, 0.04, 0.05), ft, shoes);
  }
  const geo = mergeGeometries(parts);
  geo.computeBoundingSphere();
  geo.boundingSphere.radius += 0.6;

  // esqueleto
  const bones = {};
  for (const name of BONES) {
    const [pos, parent] = REST[name];
    const b = new THREE.Bone();
    b.name = name;
    const pp = parent ? REST[parent][0] : [0, 0, 0];
    b.position.set(pos[0] - pp[0], pos[1] - pp[1], pos[2] - pp[2]);
    if (parent) bones[parent].add(b);
    bones[name] = b;
  }
  const mesh = new THREE.SkinnedMesh(geo, humanMat);
  mesh.add(bones.root);
  mesh.castShadow = true;
  mesh.bind(new THREE.Skeleton(BONES.map((n) => bones[n])));
  const root = new THREE.Group();
  root.add(mesh);
  root.scale.setScalar(o.scale ?? 1);
  const h = { root, mesh, bones, phase: Math.random() * 10 };
  root.userData.human = h;
  return h;
}

// ---------- Animación ----------
function reset(h) {
  for (const b of Object.values(h.bones)) b.rotation.set(0, 0, 0);
  const r = h.bones.root;
  r.position.set(0, 0, 0);
  h.bones.hips.position.set(0, 0.95, 0);
}

// Anima caminata y poses. `speed` en m/s. `t` (0..1) es el avance de un golpe.
export function animateHuman(h, dt, speed, pose = 'walk', t = 0) {
  h.phase += dt * (2 + speed * 2.4);
  const s = Math.sin(h.phase);
  const c = Math.cos(h.phase);
  const amp = Math.min(0.85, speed * 0.26);
  const b = h.bones;
  reset(h);

  if (pose === 'knocked') {
    b.root.rotation.x = -Math.PI / 2;
    b.root.position.set(0, 0.12, 0);
    b.uaR.rotation.z = -1.3;
    b.uaL.rotation.z = 1.1;
    b.thR.rotation.z = -0.2;
    b.thL.rotation.x = -0.4;
    b.shL.rotation.x = 0.6;
    b.head.rotation.y = 0.4;
    return;
  }
  if (pose === 'sit') {
    b.hips.position.y = 0.42;
    b.thR.rotation.x = -1.45;
    b.thL.rotation.x = -1.35;
    b.shR.rotation.x = 1.3;
    b.shL.rotation.x = 1.45;
    b.spine.rotation.x = 0.15;
    b.uaL.rotation.x = -0.5 + Math.sin(h.phase * 0.3) * 0.08;
    b.faL.rotation.x = -0.9;
    b.uaR.rotation.x = -0.3;
    b.faR.rotation.x = -0.8;
    b.head.rotation.x = 0.3;
    return;
  }
  if (pose === 'cower') {
    // agachado con las manos en la cabeza
    b.hips.position.y = 0.55;
    b.thR.rotation.x = -1.6;
    b.thL.rotation.x = -1.3;
    b.shR.rotation.x = 2.2;
    b.shL.rotation.x = 1.9;
    b.ftR.rotation.x = -0.6;
    b.spine.rotation.x = 0.7;
    b.head.rotation.x = 0.4;
    b.uaR.rotation.set(-2.6, 0, 0.5);
    b.uaL.rotation.set(-2.6, 0, -0.5);
    b.faR.rotation.x = -2.1;
    b.faL.rotation.x = -2.1;
    b.root.position.x = Math.sin(h.phase * 9) * 0.01;
    return;
  }
  if (pose === 'getup') {
    // de estar tirado a parado: t va de 0 (piso) a 1 (parado)
    const k = Math.min(1, t);
    b.root.rotation.x = -Math.PI / 2 * (1 - k) * (1 - k);
    b.root.position.set(0, 0.12 * (1 - k), 0);
    b.thR.rotation.x = -1.2 * Math.sin(k * Math.PI);
    b.shR.rotation.x = 1.6 * Math.sin(k * Math.PI);
    b.uaR.rotation.x = -0.8 * Math.sin(k * Math.PI);
    b.uaL.rotation.x = -0.8 * Math.sin(k * Math.PI);
    return;
  }
  if (pose === 'ride') {
    b.hips.position.y = 0.55;
    b.thR.rotation.set(-1.35, 0, -0.2);
    b.thL.rotation.set(-1.35, 0, 0.2);
    b.shR.rotation.x = 1.2;
    b.shL.rotation.x = 1.2;
    b.spine.rotation.x = 0.3;
    b.uaR.rotation.x = -1.0;
    b.uaL.rotation.x = -1.0;
    b.faR.rotation.x = -0.5;
    b.faL.rotation.x = -0.5;
    return;
  }
  // caminata base: piernas, rodillas, brazos opuestos, codos y balanceo
  b.thR.rotation.x = s * amp;
  b.thL.rotation.x = -s * amp;
  b.shR.rotation.x = Math.max(0, s) * amp * 1.4 + 0.05;
  b.shL.rotation.x = Math.max(0, -s) * amp * 1.4 + 0.05;
  b.ftR.rotation.x = -Math.max(0, s) * amp * 0.5;
  b.ftL.rotation.x = -Math.max(0, -s) * amp * 0.5;
  b.uaR.rotation.x = -s * amp * 0.75;
  b.uaL.rotation.x = s * amp * 0.75;
  b.uaR.rotation.z = -0.08;
  b.uaL.rotation.z = 0.08;
  b.faR.rotation.x = -0.25 - Math.max(0, -s) * amp * 0.5;
  b.faL.rotation.x = -0.25 - Math.max(0, s) * amp * 0.5;
  b.hips.position.y = 0.95 + Math.abs(c) * amp * 0.05;
  b.hips.rotation.y = s * amp * 0.12;
  b.chest.rotation.y = -s * amp * 0.18;
  b.spine.rotation.x = speed > 4 ? 0.15 : 0.03;
  // respiración en reposo
  if (speed < 0.1) b.chest.rotation.x = Math.sin(h.phase * 0.5) * 0.02;

  if (pose === 'zombie') {
    b.uaR.rotation.x = -1.2 + Math.sin(h.phase * 0.5) * 0.2;
    b.uaL.rotation.x = -1.0 + Math.cos(h.phase * 0.4) * 0.25;
    b.faR.rotation.x = -0.2;
    b.faL.rotation.x = -0.35;
    b.spine.rotation.set(0.28, 0, Math.sin(h.phase * 0.35) * 0.16);
    b.head.rotation.set(0.35, 0, Math.sin(h.phase * 0.3) * 0.35);
  } else if (pose === 'wave') {
    b.uaR.rotation.set(-2.5 + Math.sin(h.phase * 3) * 0.3, 0, -0.3 + Math.sin(h.phase * 3) * 0.4);
    b.faR.rotation.x = -0.5;
  } else if (pose === 'drum') {
    b.uaR.rotation.x = -0.7;
    b.uaL.rotation.x = -0.7;
    b.faR.rotation.x = -0.6 - Math.max(0, Math.sin(h.phase * 3)) * 0.9;
    b.faL.rotation.x = -0.6 - Math.max(0, Math.sin(h.phase * 3 + Math.PI)) * 0.9;
  } else if (pose === 'banner') {
    b.uaR.rotation.x = -2.8;
    b.uaL.rotation.x = -2.8;
    b.faR.rotation.x = -0.2;
    b.faL.rotation.x = -0.2;
  } else if (pose === 'fist') {
    b.uaR.rotation.x = -2.6 + Math.sin(h.phase * 4) * 0.3;
    b.faR.rotation.x = -0.4 - Math.max(0, Math.sin(h.phase * 4)) * 0.5;
  } else if (pose === 'punch' || pose === 'jab' || pose === 'cross') {
    // golpe recto: guardia -> brazo extendido -> vuelve. Jab con la izquierda.
    const ext = Math.sin(Math.min(1, t) * Math.PI);
    const left = pose === 'jab';
    guard(b);
    const [ua, fa] = left ? [b.uaL, b.faL] : [b.uaR, b.faR];
    ua.rotation.x = -1.2 - ext * 0.4;
    ua.rotation.z = (left ? -1 : 1) * ext * 0.25;
    fa.rotation.x = -1.9 + ext * 1.9;
    b.chest.rotation.y = (left ? -0.25 : 0.45) * ext;
    b.spine.rotation.x = 0.1 + ext * 0.08;
  } else if (pose === 'hook') {
    const ext = Math.sin(Math.min(1, t) * Math.PI);
    guard(b);
    b.uaR.rotation.set(-1.45, 0, 1.2 * ext);
    b.faR.rotation.x = -1.4;
    b.faR.rotation.y = ext * 0.5;
    b.chest.rotation.y = -0.2 + ext * 0.9;
    b.hips.rotation.y = ext * 0.3;
  } else if (pose === 'kick') {
    const ext = Math.sin(Math.min(1, t) * Math.PI);
    guard(b);
    b.thR.rotation.x = -1.5 * ext;
    b.shR.rotation.x = 1.2 * (1 - ext) * Math.min(1, t * 3);
    b.thL.rotation.x = 0.15 * ext;
    b.spine.rotation.x = -0.25 * ext;
    b.hips.position.y = 0.95 - 0.04 * ext;
  } else if (pose === 'guard') {
    guard(b);
  } else if (pose === 'swing') {
    // palo: de atrás del hombro hacia adelante
    const k = Math.min(1, t);
    const a = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65;
    const hit = k < 0.35 ? 0 : Math.sin(((k - 0.35) / 0.65) * Math.PI);
    b.uaR.rotation.set(-2.4 * a - 1.0 * hit, 0, 0.3 + 0.5 * hit);
    b.faR.rotation.x = -0.9 * a;
    b.uaL.rotation.set(-1.2, 0, -0.6);
    b.faL.rotation.x = -1.2;
    b.chest.rotation.y = 0.6 * a - 0.7 * hit;
  } else if (pose === 'aim') {
    // pistola a dos manos, a la altura de los ojos
    b.uaR.rotation.set(-1.52, 0, 0.12);
    b.faR.rotation.x = -0.05;
    b.uaL.rotation.set(-1.4, 0, -0.55);
    b.faL.rotation.set(-0.25, 0, 0);
    b.chest.rotation.y = 0.12;
    b.head.rotation.y = 0.05;
    b.uaR.rotation.x -= t * 0.35;
  } else if (pose === 'aimLong') {
    // escopeta al hombro
    b.uaR.rotation.set(-1.1, 0, 0.5);
    b.faR.rotation.x = -1.2;
    b.uaL.rotation.set(-1.45, 0, -0.35);
    b.faL.rotation.x = -0.2;
    b.chest.rotation.y = 0.35;
    b.head.rotation.y = -0.2;
    b.chest.rotation.x = -t * 0.12;
  } else if (pose === 'holdGun') {
    b.uaR.rotation.set(-0.35, 0, -0.05);
    b.faR.rotation.x = -0.9;
  } else if (pose === 'hit') {
    const k = Math.sin(Math.min(1, t) * Math.PI);
    b.spine.rotation.x = -0.35 * k;
    b.head.rotation.x = -0.5 * k;
    b.uaR.rotation.set(-0.6 * k, 0, -0.6 * k);
    b.uaL.rotation.set(-0.6 * k, 0, 0.6 * k);
  } else if (pose === 'handsup') {
    b.uaR.rotation.set(-2.9, 0, 0.3);
    b.uaL.rotation.set(-2.9, 0, -0.3);
    b.faR.rotation.x = -0.4;
    b.faL.rotation.x = -0.4;
  } else if (pose === 'flee') {
    b.uaR.rotation.set(-1.5 + s * 0.5, 0, -0.4);
    b.uaL.rotation.set(-1.5 - s * 0.5, 0, 0.4);
    b.spine.rotation.x = 0.25;
  } else if (pose === 'carry') {
    // vendedor: bolsa colgando de un brazo, el otro ofreciendo
    b.uaL.rotation.set(-0.2, 0, 0.25);
    b.faL.rotation.x = -1.3;
    b.uaR.rotation.set(-1.1 + Math.sin(h.phase * 0.8) * 0.15, 0, 0.1);
    b.faR.rotation.x = -0.6;
  } else if (pose === 'phone') {
    b.uaR.rotation.set(-0.35, 0, 0.35);
    b.faR.rotation.x = -2.3;
    b.head.rotation.set(0.1, 0, -0.15);
  }
}

function guard(b) {
  b.uaR.rotation.set(-0.9, 0, 0.35);
  b.uaL.rotation.set(-0.9, 0, -0.35);
  b.faR.rotation.x = -2.0;
  b.faL.rotation.x = -2.0;
  b.spine.rotation.x = 0.12;
  b.head.rotation.x = 0.08;
}

export function randomCivilian() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const style = pick(['short', 'short', 'short', 'long', 'bald', 'curly']);
  return {
    skin: pick(SKINS),
    hair: pick(HAIRS),
    shirt: pick([0x3f6fa0, 0xb03a2e, 0x2e7d32, 0xf2f2f2, 0x6a1b9a, 0xf9a825, 0x455a64, 0x1e88e5, 0xd81b60, 0x795548, 0x6ec3ea]),
    pants: pick([0x2d3440, 0x1c2a4a, 0x4e4e4e, 0x6d5c47, 0x1a1a1a, 0x37474f, 0x33507a]),
    shoes: pick([0x1c1c1c, 0xf2f2f2, 0x6b4a2b, 0x2a2a2a]),
    hairStyle: style,
    longSleeves: Math.random() < 0.4,
    cap: Math.random() < 0.18 ? pick([0xc62828, 0x1a237e, 0xffffff, 0x6ec3ea]) : null,
    beard: Math.random() < 0.2,
    mustache: Math.random() < 0.15,
    glasses: Math.random() < 0.12,
    belly: Math.random() < 0.2,
    scale: 0.92 + Math.random() * 0.14,
  };
}

// Gaspi: saco oscuro, camisa blanca, corbata a rayas rojas y blancas, pelo castaño y su cara.
let gaspiPhoto = null;
export function loadGaspiPhoto() {
  return new Promise((res) => {
    if (gaspiPhoto) return res(gaspiPhoto);
    const img = new Image();
    img.onload = () => {
      gaspiPhoto = img;
      // si Gaspi ya existe, se redibuja su cara con la foto
      if (gaspiHead && cellCache.has('gaspi')) drawHead(cellCache.get('gaspi'), { ...gaspiHead, photo: img });
      res(img);
    };
    img.onerror = () => res(null);
    img.src = gaspiUrl;
  });
}
export function makeGaspi() {
  return makeHuman({
    skin: 0xdfa88b,
    hair: 0x4a3120,
    jacket: 0x26282d,
    shirt: 0xf4f4f4,
    tie: true,
    pants: 0x1d1f23,
    shoes: 0x111111,
    gaspi: true,
    photo: gaspiPhoto,
    longSleeves: true,
    scale: 1.04,
  });
}
