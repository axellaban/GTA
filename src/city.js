// Construye la Temperley real en 3D a partir de los datos de map.js:
// suelo, calles, pintura vial, edificios con sus frentes, rejas, estación, andenes, faroles y árboles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DATA as D, HALF, ROADS, TRACKS, CORNERS, pointAt, STATION, project, SIGN_COLORS_REAL, nearestRoad } from './map.js';
import {
  ATLAS,
  buildAtlas,
  asphaltTexture,
  sidewalkTexture,
  groundTexture,
  ballastTexture,
  textTexture,
  awningTexture,
  leafTexture,
  normalMapFrom,
  signAtlas,
  roofTexture,
  ROOF_M,
  cazuelaTexture,
  grassTexture,
  usePhoto,
} from './textures.js';
import { addWorldDetail } from './detail.js';
import { addWind } from './atmosphere.js';
import { Colliders } from './physics.js';
import { FastBoxes } from './builder.js';
import { Rng } from './rng.js';
const ni = (g) => (g.index ? g.toNonIndexed() : g);
// instancias que no se mueven nunca: chunks.js las reparte por cuadrado para no dibujarlas todas
// (con un número adelante: más allá de esos metros ni se dibujan, son cosas chicas)
export const fixed = (...ms) => {
  const far = typeof ms[0] === 'number' ? ms.shift() : 0;
  for (const m of ms) {
    m.userData.static = true;
    if (far) m.userData.far = far;
  }
  return ms;
};

const FLOOR_H = 3.1;
const angOf = (ux, uz) => Math.atan2(-uz, ux); // para FastBoxes.rbox: el ancho va a lo largo de (ux, uz)

export function buildCity(scene) {
  const rng = new Rng(1400);
  const colliders = new Colliders();
  const atlas = buildAtlas();
  const city = { colliders, lamps: [], lampMats: [], parking: [], spots: {}, balconyRails: [], shopSigns: [], neon: [] };
  addGround(scene, city);
  addRoadMarkings(scene);
  addBuildings(scene, atlas, colliders, rng, city);
  addFences(scene, colliders, city.balconyRails);
  addTracks(scene);
  addStation(scene, colliders, city);
  addLamps(scene, city, rng);
  addTrees(scene, colliders, rng);
  addClutter(scene, rng);
  addBounds(colliders);
  findSpots(city, rng);
  return city;
}

// ---------- Utilidades de polígonos ----------
function shapeFrom(rings) {
  const toV = (r) => r.map(([x, z]) => new THREE.Vector2(x, -z));
  const s = new THREE.Shape(toV(rings[0]));
  for (const h of rings.slice(1)) s.holes.push(new THREE.Path(toV(h)));
  return s;
}
// Superficie plana a la altura y, con UV en metros / escala
function flat(polys, y, uvScale) {
  const geos = [];
  for (const rings of polys) {
    if (!rings.length || rings[0].length < 3) continue;
    const g = new THREE.ShapeGeometry(shapeFrom(rings));
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    const uv = g.attributes.uv;
    const pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / uvScale, pos.getZ(i) / uvScale);
    geos.push(g);
  }
  return geos.length ? mergeGeometries(geos) : new THREE.BufferGeometry();
}
// Bordes verticales de polígonos (cordones)
function sides(polys, y0, y1) {
  const pos = [];
  for (const rings of polys) {
    for (const r of rings) {
      for (let i = 0; i < r.length; i++) {
        const [ax, az] = r[i];
        const [bx, bz] = r[(i + 1) % r.length];
        pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
export function signedArea(r) {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, z0] = r[i];
    const [x1, z1] = r[(i + 1) % r.length];
    a += x0 * z1 - x1 * z0;
  }
  return a / 2;
}
export function pointInRing(x, z, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i];
    const [xj, zj] = r[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// Normal hacia afuera de la arista k de un anillo
export function outward(r, k) {
  const [ax, az] = r[k];
  const [bx, bz] = r[(k + 1) % r.length];
  const l = Math.hypot(bx - ax, bz - az) || 1;
  const ux = (bx - ax) / l;
  const uz = (bz - az) / l;
  const s = signedArea(r) > 0 ? 1 : -1;
  return { ax, az, bx, bz, l, ux, uz, nx: s > 0 ? uz : -uz, nz: s > 0 ? -ux : ux };
}
// Quads planos o verticales armados a mano (pintura vial, carteles)
class Quads {
  constructor() {
    this.pos = [];
    this.uv = [];
    this.idx = [];
  }
  add(cx, cz, ux, uz, len, width, y = 0.034, uv = [0, 0, 1, 1]) {
    const nx = -uz;
    const nz = ux;
    const b = this.pos.length / 3;
    const L = len / 2;
    const W = width / 2;
    this.pos.push(cx - ux * L - nx * W, y, cz - uz * L - nz * W, cx - ux * L + nx * W, y, cz - uz * L + nz * W, cx + ux * L + nx * W, y, cz + uz * L + nz * W, cx + ux * L - nx * W, y, cz + uz * L - nz * W);
    const [u0, v0, u1, v1] = uv;
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  // quad vertical de (x0,z0) a (x1,z1) entre alturas y0 e y1
  vert(x0, z0, x1, z1, y0, y1, uv = { u0: 0, v0: 0, u1: 1, v1: 1 }) {
    const b = this.pos.length / 3;
    this.pos.push(x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0);
    this.uv.push(uv.u0, uv.v0, uv.u1, uv.v0, uv.u1, uv.v1, uv.u0, uv.v1);
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

// ---------- Suelo: manzanas, veredas, calzadas, plazas ----------
function addGround(scene, city) {
  const base = new THREE.PlaneGeometry(HALF * 2 + 800, HALF * 2 + 800);
  base.rotateX(-Math.PI / 2);
  base.translate(0, -0.02, 0);
  const gt = groundTexture();
  gt.repeat.set(160, 160);
  const bm = new THREE.Mesh(base, new THREE.MeshLambertMaterial({ map: gt }));
  bm.receiveShadow = true;
  scene.add(bm);

  const yard = new THREE.Mesh(flat(D.yard, 0.005, 4), new THREE.MeshLambertMaterial({ map: ballastTexture() }));
  yard.receiveShadow = true;
  scene.add(yard);

  // manzanas elevadas 15 cm con cordón
  // el pulmón de manzana: pasto medio seco, con manchones grandes para que no se note la repetición
  const dry = grassTexture('seco');
  const topMat = addWorldDetail(new THREE.MeshLambertMaterial({ map: dry.map, normalMap: dry.normal, normalScale: new THREE.Vector2(0.6, 0.6) }), { strength: 0.4, scale: 0.05, damp: 0 });
  const top = new THREE.Mesh(flat(D.blocks, 0.15, 4), topMat);
  top.receiveShadow = true;
  scene.add(top);
  scene.add(new THREE.Mesh(sides(D.blocks, 0, 0.15), new THREE.MeshLambertMaterial({ color: 0xc4bfb3, side: THREE.DoubleSide })));

  const st = sidewalkTexture();
  const walkMat = new THREE.MeshStandardMaterial({ map: st, normalMap: normalMapFrom(st.image, 3, true), normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95, metalness: 0, envMapIntensity: 0.5 });
  const walk = new THREE.Mesh(flat(D.sidewalks, 0.153, 3.2), addWorldDetail(walkMat, { strength: 0.3, scale: 0.12, damp: 0, wet: true }));
  walk.receiveShadow = true;
  scene.add(walk);

  const at = asphaltTexture();
  const roadMat = new THREE.MeshStandardMaterial({ map: at, normalMap: normalMapFrom(at.image, 3, true), normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.92, metalness: 0, envMapIntensity: 0.5 });
  const road = new THREE.Mesh(flat(D.roadPoly, 0.02, 9), addWorldDetail(roadMat, { strength: 0.28, scale: 0.035, damp: 0, wet: true }));
  road.receiveShadow = true;
  scene.add(road);
  // con lluvia se mojan: menos rugosos y más oscuros
  city.wetMats = [road.material, walk.material];
  // fotos CC0 de asfalto y baldosas si se bajaron (scripts/texturas.mjs); si no, quedan las dibujadas
  usePhoto(roadMat, 'asfalto', { size: 3, perTile: 9 });
  usePhoto(walkMat, 'vereda', { size: 1.8, perTile: 3.2 });

  // senderos de las plazas
  const q = new Quads();
  for (const p of D.paths) {
    for (let i = 0; i < p.p.length - 1; i++) {
      const [ax, az] = p.p[i];
      const [bx, bz] = p.p[i + 1];
      const l = Math.hypot(bx - ax, bz - az);
      if (l < 0.1) continue;
      q.add((ax + bx) / 2, (az + bz) / 2, (bx - ax) / l, (bz - az) / l, l + p.w * 0.5, p.w, 0.17);
    }
  }
  const pm = new THREE.Mesh(q.geometry(), new THREE.MeshLambertMaterial({ color: 0xbdb6a6 }));
  pm.receiveShadow = true;
  scene.add(pm);

  // plazas, canchas y estadio
  const green = [];
  const pitch = [];
  for (const pk of D.parks) {
    if (['park', 'grass', 'garden', 'village_green'].includes(pk.c)) green.push(...pk.r);
    if (pk.c === 'pitch' || pk.c === 'stadium') pitch.push(...pk.r);
  }
  if (green.length) {
    const grass = grassTexture('verde');
    const gmMat = addWorldDetail(new THREE.MeshLambertMaterial({ map: grass.map, normalMap: grass.normal, normalScale: new THREE.Vector2(0.6, 0.6) }), { strength: 0.4, scale: 0.05, damp: 0 });
    const gm = new THREE.Mesh(flat(green, 0.158, 4), gmMat);
    gm.receiveShadow = true;
    scene.add(gm);
  }
  if (pitch.length) {
    const pt = document.createElement('canvas');
    pt.width = pt.height = 64;
    const g = pt.getContext('2d');
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#3f8f3a' : '#47a042';
      g.fillRect(0, i * 8, 64, 8);
    }
    const t = new THREE.CanvasTexture(pt);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    const pm2 = new THREE.Mesh(flat(pitch, 0.162, 10), new THREE.MeshLambertMaterial({ map: t }));
    pm2.receiveShadow = true;
    scene.add(pm2);
    const lines = new Quads();
    for (const r of pitch.flat(1)) {
      for (let i = 0; i < r.length; i++) {
        const [ax, az] = r[i];
        const [bx, bz] = r[(i + 1) % r.length];
        const l = Math.hypot(bx - ax, bz - az);
        if (l < 0.5) continue;
        lines.add((ax + bx) / 2, (az + bz) / 2, (bx - ax) / l, (bz - az) / l, l, 0.14, 0.168);
      }
    }
    scene.add(new THREE.Mesh(lines.geometry(), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 })));
  }
}

// ---------- Pintura vial ----------
function addRoadMarkings(scene) {
  const white = new Quads();
  const yellow = new Quads();
  const cross = new Quads();
  const pare = [];
  for (const r of ROADS) {
    if (r.len < 20 || r.w < 7) continue;
    const trim = 9;
    if (r.avenue) {
      for (let s = trim; s < r.len - trim; s += 2) {
        const a = pointAt(r.pts, r.cum, s);
        const b = pointAt(r.pts, r.cum, Math.min(s + 2, r.len - trim));
        const l = Math.hypot(b.x - a.x, b.z - a.z);
        if (l < 0.1) continue;
        const ux = (b.x - a.x) / l;
        const uz = (b.z - a.z) / l;
        const cx = (a.x + b.x) / 2;
        const cz = (a.z + b.z) / 2;
        for (const off of [-0.16, 0.16]) yellow.add(cx - uz * off, cz + ux * off, ux, uz, l + 0.02, 0.12);
        for (const off of [-(r.w / 2 - 0.6), r.w / 2 - 0.6]) white.add(cx - uz * off, cz + ux * off, ux, uz, l + 0.02, 0.12);
      }
    } else {
      for (let s = trim; s < r.len - trim - 3; s += 7) {
        const a = pointAt(r.pts, r.cum, s + 1.5);
        white.add(a.x, a.z, a.dx, a.dz, 3, 0.13);
      }
    }
  }
  // en cada esquina: senda peatonal, línea de frenado y PARE si una calle chica llega a una avenida
  for (const n of CORNERS) {
    for (const arm of n.arms) {
      const r = arm.road;
      const others = n.arms.filter((a) => a.road !== r);
      const wo = Math.max(8, ...others.map((a) => a.road.w));
      const ux = arm.dx;
      const uz = arm.dz;
      const nx = -uz;
      const nz = ux;
      const dc = wo / 2 + 1.9;
      const cx = n.x + ux * dc;
      const cz = n.z + uz * dc;
      for (let k = -r.w / 2 + 0.8; k < r.w / 2 - 0.5; k += 1.1) cross.add(cx + nx * k, cz + nz * k, ux, uz, 3.0, 0.55, 0.035);
      // quien llega a la esquina circula en dirección -u; su mano derecha es -n
      const ds = wo / 2 + 3.9;
      const sx = n.x + ux * ds - nx * (r.w / 4);
      const sz = n.z + uz * ds - nz * (r.w / 4);
      white.add(sx, sz, nx, nz, r.w / 2 - 0.5, 0.45, 0.036);
      if (!r.avenue && others.some((a) => a.road.avenue)) pare.push({ x: sx + ux * 3.2, z: sz + uz * 3.2, ux: -ux, uz: -uz });
    }
  }
  const wm = new THREE.Mesh(white.geometry(), new THREE.MeshLambertMaterial({ color: 0xe8e4d8 }));
  const ym = new THREE.Mesh(yellow.geometry(), new THREE.MeshLambertMaterial({ color: 0xe3b12a }));
  const cm = new THREE.Mesh(cross.geometry(), new THREE.MeshLambertMaterial({ color: 0xe4e0d4 }));
  for (const m of [wm, ym, cm]) m.receiveShadow = true;
  scene.add(wm, ym, cm);
  if (pare.length) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.font = 'bold 76px "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'center';
    g.save();
    g.scale(1, 2.6);
    g.fillText('PARE', 64, 82);
    g.restore();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const pq = new Quads();
    // la parte de arriba del texto apunta hacia donde va el auto
    for (const p of pare) pq.add(p.x, p.z, p.ux, p.uz, 3.2, 1.6, 0.037, [1, 1, 0, 0]);
    const pm = new THREE.Mesh(pq.geometry(), new THREE.MeshLambertMaterial({ map: t, transparent: true, depthWrite: false, color: 0xe8e4d8 }));
    pm.receiveShadow = true;
    scene.add(pm);
  }
  // tapas de cloaca
  const rng = new Rng(71);
  const cover = new THREE.CircleGeometry(0.4, 12);
  cover.rotateX(-Math.PI / 2);
  const ci = new THREE.InstancedMesh(cover, new THREE.MeshLambertMaterial({ color: 0x3b3a38 }), 160);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 160; i++) {
    const r = rng.pick(ROADS);
    const p = pointAt(r.pts, r.cum, rng.range(0, r.len));
    const off = rng.range(-1, 1);
    m4.makeTranslation(p.x - p.dz * off, 0.037, p.z + p.dx * off);
    ci.setMatrixAt(i, m4);
  }
  scene.add(...fixed(120, ci));
}

// ---------- Edificios ----------
// tint (opcional): color que multiplica la textura (el color real de la fachada del relevamiento)
function pushQuad(arr, p0, p1, p2, p3, uv, shade, shadeBottom = shade, tint = null) {
  const { pos, uvs, col, idx } = arr;
  const base = pos.length / 3;
  pos.push(...p0, ...p1, ...p2, ...p3);
  uvs.push(uv.u0, uv.v0, uv.u1, uv.v0, uv.u1, uv.v1, uv.u0, uv.v1);
  for (const k of [shadeBottom, shadeBottom, shade, shade]) col.push(k * (tint?.r ?? 1), k * (tint?.g ?? 1), k * (tint?.b ?? 1));
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function wall(arr, ax, az, bx, bz, y0, y1, pickUv, shade, tint = null) {
  const len = Math.hypot(bx - ax, bz - az);
  const segs = Math.max(1, Math.round(len / 10.5));
  for (let s = 0; s < segs; s++) {
    const t0 = s / segs;
    const t1 = (s + 1) / segs;
    const x0 = ax + (bx - ax) * t0;
    const z0 = az + (bz - az) * t0;
    const x1 = ax + (bx - ax) * t1;
    const z1 = az + (bz - az) * t1;
    for (let y = y0; y < y1 - 0.01; y += FLOOR_H) {
      const yy = Math.min(y + FLOOR_H, y1);
      const floor = Math.round((y - y0) / FLOOR_H);
      const partial = yy - y < FLOOR_H * 0.6;
      const uv = partial ? ATLAS.medianera[(s + floor) % ATLAS.medianera.length] : pickUv(floor, s);
      pushQuad(arr, [x0, y, z0], [x1, y, z1], [x1, yy, z1], [x0, yy, z0], uv, shade, floor === 0 ? shade * 0.6 : shade * 0.97, partial ? null : tint);
      if (!partial && arr.frames && uv.open && uv.open.length && (x1 - x0) ** 2 + (z1 - z0) ** 2 > 16) addFrames(arr.frames, x0, z0, x1, z1, y, y + FLOOR_H, uv.open, floor === 0 && arr.rejas ? arr.grilles : null);
    }
  }
}

const FRAME_COLORS = [0xe9e4d8, 0xd9d2c4, 0xc9c0b0, 0xf2eee6];
function addFrames(F, x0, z0, x1, z1, y, yy, open, grilles = null) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const dx = (x1 - x0) / len;
  const dz = (z1 - z0) / len;
  const nx = -dz;
  const nz = dx;
  const rot = angOf(dx, dz);
  const H = yy - y;
  const color = FRAME_COLORS[Math.abs(Math.round(x0 * 7 + z0 * 3)) % FRAME_COLORS.length];
  const put = (t, cy, w, h, d, col = color) => {
    F.rbox(w, h, d, col, x0 + dx * t + nx * (d / 2), cy, z0 + dz * t + nz * (d / 2), rot);
  };
  for (const o of open) {
    const ta = o.x0 * len;
    const tb = o.x1 * len;
    const w = tb - ta;
    const tc = (ta + tb) / 2;
    const top = yy - o.y0 * H;
    const bot = yy - o.y1 * H;
    if (o.kind === 'window') {
      // reja de planta baja, un poco adelante del vidrio
      if (grilles) {
        const off = 0.13;
        grilles.vert(x0 + dx * (ta - 0.04) + nx * off, z0 + dz * (ta - 0.04) + nz * off, x0 + dx * (tb + 0.04) + nx * off, z0 + dz * (tb + 0.04) + nz * off, bot, top, { u0: 0, v0: 0, u1: Math.max(1, Math.round((w + 0.08) / 0.75)), v1: 1 });
      }
      put(tc, bot - 0.035, w + 0.2, 0.07, 0.17);
      put(tc, top + 0.05, w + 0.12, 0.1, 0.09);
      put(ta - 0.03, (top + bot) / 2, 0.06, top - bot, 0.05);
      put(tb + 0.03, (top + bot) / 2, 0.06, top - bot, 0.05);
    } else if (o.kind === 'door' || o.kind === 'garage') {
      put(tc, top + 0.06, w + 0.2, 0.12, 0.1);
      put(ta - 0.05, (top + bot) / 2, 0.1, top - bot, 0.08);
      put(tb + 0.05, (top + bot) / 2, 0.1, top - bot, 0.08);
      if (o.kind === 'door') put(tc, y + 0.06, w + 0.3, 0.12, 0.4, 0x9a948a);
    } else if (o.kind === 'shop') {
      put(tc, top + 0.08, w + 0.5, 0.16, 0.32, 0x5f646a);
      put(ta - 0.12, (top + bot) / 2, 0.24, top - bot, 0.12);
      put(tb + 0.12, (top + bot) / 2, 0.24, top - bot, 0.12);
    }
  }
}

const GENERIC_SHOPS = ['KIOSCO 24 HS', 'FARMACIA', 'PIZZERÍA', 'ROTISERÍA', 'QUINIELA', 'FERRETERÍA', 'VERDULERÍA', 'CELULARES', 'EMPANADAS', 'CARNICERÍA', 'PANADERÍA', 'COTILLÓN', 'LAVADERO', 'CERRAJERÍA', 'FIAMBRERÍA', 'AUTOSERVICIO', 'LIBRERÍA', 'HELADERÍA', 'PELUQUERÍA', 'ÓPTICA', 'MERCERÍA', 'ZAPATERÍA', 'DIETÉTICA', 'VETERINARIA'];

function addBuildings(scene, atlas, colliders, rng, city) {
  const arr = { pos: [], uvs: [], col: [], idx: [], frames: new FastBoxes(), grilles: new Quads(), rejas: false };
  // techos planos agrupados por tipo (membrana, cerámica, losa, chapa)
  const roofs = {};
  const roofBucket = (t) => (roofs[t] ??= { pos: [], uv: [], col: [], idx: [] });
  const MEMBRANA = [
    [1, 1, 1],
    [1, 1, 1],
    [0.96, 0.52, 0.44],
    [0.62, 0.78, 0.62],
    [1.12, 1.12, 1.1],
  ];
  const det = new FastBoxes();
  const awn = { pos: [], uv: [], idx: [] };
  const gables = [];
  const tanks = [];
  // carteles: nombres reales primero, después genéricos
  const real = [...new Set(D.buildings.filter((b) => b.k === 'local' && b.n).map((b) => b.n))];
  // todos los nombres reales (el atlas crece según cuántos haya) y los genéricos para el resto
  const names = real.concat(GENERIC_SHOPS);
  const signs = signAtlas(names, SIGN_COLORS_REAL);
  const signQ = new Quads();
  city.buildingList = [];
  for (const b of D.buildings) {
    const ring = b.r;
    if (ring.length < 3) continue;
    const kind = b.k;
    const floors = b.f;
    const h = kind === 'galpon' ? 6.2 : kind === 'estacion' ? 7.4 : kind === 'estadio' ? 9 : floors * FLOOR_H + 0.3;
    const v = b.v;
    const rel = b.rel; // lo cargado a mano en el relevamiento (ver src/map.js)
    const fronts = new Set(b.fr);
    // un local cargado en el relevamiento que no tenía frente: la pared que da a la calle
    if (rel && !fronts.size) {
      let best = -1;
      let bd = Infinity;
      for (let k = 0; k < ring.length; k++) {
        const e = outward(ring, k);
        if (e.l < 2) continue;
        const d = nearestRoad((e.ax + e.bx) / 2 + e.nx * 3, (e.az + e.bz) / 2 + e.nz * 3)?.dist ?? Infinity;
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      if (best >= 0) fronts.add(best);
    }
    const shade = 0.85 + ((v % 13) / 13) * 0.2;
    const pitched = (kind === 'casa' && ring.length === 4 && v % 10 < 3) || kind === 'estacion';
    colliders.addRing(ring, h, 'building');
    city.buildingList.push({ ring, h, kind, b });
    const front = (floor) => {
      if (kind === 'local') return floor === 0 ? ATLAS.local[v % ATLAS.local.length] : ATLAS.alto[(v + floor) % ATLAS.alto.length];
      if (kind === 'edificio') return floor === 0 ? ATLAS.entrada[v % ATLAS.entrada.length] : ATLAS.edificio[(v + floor) % ATLAS.edificio.length];
      if (kind === 'estacion') return ATLAS.estacion[floor === 0 ? 0 : 1];
      if (kind === 'estadio') return ATLAS.estadio[0];
      if (kind === 'galpon') return floor === 0 ? ATLAS.galpon[v % 2] : ATLAS.medianera[v % ATLAS.medianera.length];
      if (kind === 'iglesia') return ATLAS.estacion[1];
      if (kind === 'escuela') return ATLAS.escuela[0];
      return floor === 0 ? ATLAS.casa[v % ATLAS.casa.length] : ATLAS.alto[(v + floor) % ATLAS.alto.length];
    };
    const side = (floor, seg) => {
      if (kind === 'estacion') return ATLAS.estacion[floor === 0 ? 0 : 1];
      if (kind === 'estadio') return ATLAS.estadio[0];
      if ((v + seg) % 9 === 0) return ATLAS.pintada[(v + floor) % ATLAS.pintada.length];
      return ATLAS.medianera[(v + seg + floor) % ATLAS.medianera.length];
    };
    // cornisa y parapeto del mismo color que la fachada (o el color real del relevamiento)
    const plaster = new THREE.Color(rel?.fachada || front(0)?.base || '#d8cfc0');
    let wallTint = null;
    if (rel?.fachada) {
      const base = new THREE.Color(front(0)?.base || '#d8cfc0');
      const c = new THREE.Color(rel.fachada);
      const k = (a, b) => Math.min(1.6, Math.max(0.2, a / Math.max(0.05, b)));
      wallTint = { r: k(c.r, base.r), g: k(c.g, base.g), b: k(c.b, base.b) };
    }
    let bestFront = null;
    for (let k = 0; k < ring.length; k++) {
      const e = outward(ring, k);
      if (e.l < 0.05) continue;
      const { ux, uz, nx, nz } = e;
      // de izquierda a derecha mirando la pared desde afuera
      const rx = nz;
      const rz = -nx;
      const a = [e.ax, e.az];
      const c = [e.bx, e.bz];
      const [p0, p1] = (c[0] - a[0]) * rx + (c[1] - a[1]) * rz > 0 ? [a, c] : [c, a];
      const isFront = fronts.has(k) || kind === 'estacion';
      // rejas en las ventanas de planta baja: lo que diga el relevamiento; si no, casi todas las casas
      arr.rejas = isFront && (rel?.rejas ?? ((kind === 'casa' && v % 3 !== 0) || (kind === 'alto' && v % 5 < 2)));
      wall(arr, p0[0], p0[1], p1[0], p1[1], 0, h, isFront ? front : side, isFront ? shade : shade * 0.9, isFront ? wallTint : null);
      const mx = (a[0] + c[0]) / 2;
      const mz = (a[1] + c[1]) / 2;
      if (!pitched) {
        det.rbox(e.l + 0.1, 0.55, 0.18, plaster.clone().multiplyScalar(0.92), mx - nx * 0.09, h + 0.27, mz - nz * 0.09, angOf(ux, uz));
        if (isFront) det.rbox(e.l + 0.1, 0.22, 0.14, plaster.clone().multiplyScalar(1.08), mx + nx * 0.07, h - 0.14, mz + nz * 0.07, angOf(ux, uz));
      }
      if (isFront && e.l > 3) {
        const fe = { ax: p0[0], az: p0[1], bx: p1[0], bz: p1[1], nx, nz, L: e.l };
        if (!bestFront || e.l > bestFront.L) bestFront = fe;
        if (kind === 'edificio') {
          for (let f = 1; f < floors; f++) {
            const y = f * FLOOR_H;
            det.rbox(e.l, 0.16, 0.1, plaster.clone().multiplyScalar(0.85), mx + nx * 0.05, y - 0.08, mz + nz * 0.05, angOf(ux, uz));
            if ((v + f) % 3 !== 0 && e.l > 4) {
              det.rbox(e.l * 0.7, 0.14, 1.0, 0xbdb6aa, mx + nx * 0.5, y + 0.05, mz + nz * 0.5, angOf(ux, uz));
              city.balconyRails.push({ e: fe, t0: 0.15, t1: 0.85, y: y + 0.12, depth: 1.0 });
            }
          }
        }
        if ((v + k) % 5 === 0 && kind !== 'estacion') {
          det.rbox(0.8, 0.45, 0.28, 0xe6e6e6, fe.ax + (fe.bx - fe.ax) * 0.72 + nx * 0.14, floors > 1 ? 5.6 : 2.4, fe.az + (fe.bz - fe.az) * 0.72 + nz * 0.14, angOf(ux, uz));
        }
      }
    }
    // toldo y cartel del comercio sobre el frente más largo
    if (kind === 'local' && bestFront) {
      const e = bestFront;
      const len = e.L;
      const ux = (e.bx - e.ax) / len;
      const uz = (e.bz - e.az) / len;
      const inset = 0.6;
      const ax = e.ax + ux * inset;
      const az = e.az + uz * inset;
      const bx = e.bx - ux * inset;
      const bz = e.bz - uz * inset;
      // persiana enrollada: la caja de chapa arriba de la vidriera
      if (rel?.persiana) det.rbox(len - inset * 2, 0.34, 0.32, 0x8a8f96, (ax + bx) / 2 + e.nx * 0.16, 2.78, (az + bz) / 2 + e.nz * 0.16, angOf(ux, uz));
      if (rel ? rel.toldo : v % 3 !== 0) {
        const dep = 1.5;
        const row = v % 4;
        const base = awn.pos.length / 3;
        awn.pos.push(ax, 2.95, az, bx, 2.95, bz, bx + e.nx * dep, 2.4, bz + e.nz * dep, ax + e.nx * dep, 2.4, az + e.nz * dep);
        const u = (len - inset * 2) / 1.2;
        awn.uv.push(0, 1 - row / 4, u, 1 - row / 4, u, 1 - (row + 1) / 4 + 0.02, 0, 1 - (row + 1) / 4 + 0.02);
        awn.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      const nm = b.n && signs.uv(b.n) ? b.n : GENERIC_SHOPS[v % GENERIC_SHOPS.length];
      const uv = signs.uv(nm);
      if (uv) {
        const sw = Math.min(len - 1, 7.5);
        const cx = (e.ax + e.bx) / 2 + e.nx * 0.2;
        const cz = (e.az + e.bz) / 2 + e.nz * 0.2;
        signQ.vert(cx - (ux * sw) / 2, cz - (uz * sw) / 2, cx + (ux * sw) / 2, cz + (uz * sw) / 2, 3.05, 3.85, uv);
        det.rbox(sw + 0.1, 0.9, 0.16, 0x2a2d30, cx - e.nx * 0.09, 3.45, cz - e.nz * 0.09, angOf(ux, uz));
        city.shopSigns.push({ x: cx, z: cz, nx: e.nx, nz: e.nz, name: nm });
        if (v % 2 === 0) city.neon.push({ cx, cz, ux, uz, nx: e.nx, nz: e.nz, sw, v });
      }
    }
    // techo plano (triangulado), con el material que le toca
    const hv = (v * 2654435761) >>> 0;
    const rtype = kind === 'galpon' ? 'chapa' : kind === 'estadio' ? 'losa' : kind === 'edificio' ? (hv % 2 ? 'losa' : 'membrana') : ['membrana', 'membrana', 'membrana', 'membrana', 'ceramica', 'ceramica', 'ceramica', 'losa', 'losa', 'membrana'][hv % 10];
    const roof = roofBucket(rtype);
    const tint = rtype === 'membrana' ? MEMBRANA[(hv >>> 4) % MEMBRANA.length] : [1, 1, 1];
    const shadeR = 0.9 + ((hv >>> 8) % 7) * 0.03;
    const M = ROOF_M[rtype];
    const off = ((hv >>> 12) % 17) * 0.137;
    const tri = THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), []);
    const base = roof.pos.length / 3;
    for (const [x, z] of ring) {
      roof.pos.push(x, h, z);
      roof.uv.push(x / M + off, z / M - off);
      roof.col.push(tint[0] * shadeR, tint[1] * shadeR, tint[2] * shadeR);
    }
    for (const [i0, i1, i2] of tri) {
      const [ax, az] = ring[i0];
      const [bx, bz] = ring[i1];
      const [cx, cz] = ring[i2];
      // que la cara mire hacia arriba (+y)
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      if (ny > 0) roof.idx.push(base + i0, base + i1, base + i2);
      else roof.idx.push(base + i0, base + i2, base + i1);
    }
    if (pitched) gables.push({ ring, h, kind });
    else if (kind !== 'estadio' && v % 20 < 11) {
      let cx = 0;
      let cz = 0;
      for (const [x, z] of ring) {
        cx += x;
        cz += z;
      }
      cx /= ring.length;
      cz /= ring.length;
      if (pointInRing(cx, cz, ring)) tanks.push([cx + ((v % 5) - 2) * 0.4, h, cz + ((v % 3) - 1) * 0.4]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(arr.uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(arr.col, 3));
  g.setIndex(arr.idx);
  g.computeVertexNormals();
  // fachadas con PBR: el vidrio es liso y refleja el cielo, la chapa brilla, el revoque es áspero
  const mat = new THREE.MeshStandardMaterial({
    map: atlas.map,
    normalMap: atlas.normal,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: atlas.orm,
    metalnessMap: atlas.orm,
    roughness: 1,
    metalness: 1,
    emissiveMap: atlas.emissive,
    emissive: 0xffffff,
    emissiveIntensity: 0,
    vertexColors: true,
  });
  addWorldDetail(mat);
  city.windowMat = mat;
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  scene.add(arr.frames.mesh(new THREE.MeshLambertMaterial({ vertexColors: true })));
  const grilleMesh = new THREE.Mesh(arr.grilles.geometry(), new THREE.MeshLambertMaterial({ map: windowGrilleTexture(), alphaTest: 0.5, side: THREE.DoubleSide }));
  grilleMesh.castShadow = true;
  scene.add(grilleMesh);
  const detMesh = det.mesh(addWorldDetail(new THREE.MeshLambertMaterial({ vertexColors: true }), { damp: 0 }));
  detMesh.castShadow = true;
  detMesh.receiveShadow = true;
  scene.add(detMesh);

  for (const [type, r] of Object.entries(roofs)) {
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(r.pos, 3));
    rg.setAttribute('uv', new THREE.Float32BufferAttribute(r.uv, 2));
    rg.setAttribute('color', new THREE.Float32BufferAttribute(r.col, 3));
    rg.setIndex(r.idx);
    rg.computeVertexNormals();
    const { map, normal } = roofTexture(type);
    const shiny = type === 'membrana' || type === 'chapa';
    const rm = shiny
      ? new THREE.MeshStandardMaterial({ map, normalMap: normal, vertexColors: true, roughness: type === 'chapa' ? 0.42 : 0.55, metalness: type === 'chapa' ? 0.6 : 0.35 })
      : new THREE.MeshLambertMaterial({ map, normalMap: normal, vertexColors: true });
    addWorldDetail(rm, { strength: 0.22, scale: 0.6, damp: 0 });
    const rmesh = new THREE.Mesh(rg, rm);
    rmesh.receiveShadow = true;
    scene.add(rmesh);
  }

  // techos a dos aguas sobre el rectángulo orientado del edificio
  const tg = [];
  for (const t of gables) {
    const r = t.ring;
    let best = 0;
    let ux = 1;
    let uz = 0;
    for (let i = 0; i < r.length; i++) {
      const [ax, az] = r[i];
      const [bx, bz] = r[(i + 1) % r.length];
      const l = Math.hypot(bx - ax, bz - az);
      if (l > best) {
        best = l;
        ux = (bx - ax) / l;
        uz = (bz - az) / l;
      }
    }
    const nx = -uz;
    const nz = ux;
    let a0 = Infinity;
    let a1 = -Infinity;
    let b0 = Infinity;
    let b1 = -Infinity;
    for (const [x, z] of r) {
      const a = x * ux + z * uz;
      const bb = x * nx + z * nz;
      a0 = Math.min(a0, a);
      a1 = Math.max(a1, a);
      b0 = Math.min(b0, bb);
      b1 = Math.max(b1, bb);
    }
    const span = b1 - b0;
    const len = a1 - a0;
    const shape = new THREE.Shape();
    shape.moveTo(-span / 2 - 0.3, 0);
    shape.lineTo(span / 2 + 0.3, 0);
    shape.lineTo(0, t.kind === 'estacion' ? 3 : Math.min(2.2, span * 0.3));
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: len + 0.4, bevelEnabled: false });
    geo.translate(0, 0, -(len + 0.4) / 2);
    // eje local z -> (ux, uz); eje local x -> (uz, -ux) = -n
    geo.rotateY(Math.atan2(ux, uz));
    const am = (a0 + a1) / 2;
    const bm = (b0 + b1) / 2;
    geo.translate(ux * am + nx * bm, t.h, uz * am + nz * bm);
    tg.push(geo);
  }
  if (tg.length) {
    // tejas coloniales (la geometría del techo trae UV en metros)
    const { map, normal } = roofTexture('tejas');
    for (const t of [map, normal]) t.repeat.set(1 / ROOF_M.tejas, 1 / ROOF_M.tejas);
    const m = new THREE.Mesh(mergeGeometries(tg), new THREE.MeshLambertMaterial({ map, normalMap: normal }));
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
  if (awn.pos.length) {
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.Float32BufferAttribute(awn.pos, 3));
    ag.setAttribute('uv', new THREE.Float32BufferAttribute(awn.uv, 2));
    ag.setIndex(awn.idx);
    ag.computeVertexNormals();
    const t = awningTexture();
    t.wrapS = THREE.RepeatWrapping;
    const am = new THREE.Mesh(ag, new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));
    am.castShadow = true;
    scene.add(am);
  }
  // carteles con el nombre del comercio (brillan de noche)
  if (signQ.pos.length) {
    const sm = new THREE.MeshLambertMaterial({ map: signs.tex, emissiveMap: signs.tex, emissive: 0xffffff, emissiveIntensity: 0, side: THREE.DoubleSide });
    city.signMat = sm;
    scene.add(new THREE.Mesh(signQ.geometry(), sm));
  }
  // tubos de neón alrededor de la mitad de los carteles: de noche, rosa, celeste y violeta a lo Vice City
  if (city.neon.length) {
    const NEON = [0xff3fa4, 0x2ee6ff, 0xb45cff, 0x39ff88, 0xff3fa4];
    const geos = [];
    const col = new THREE.Color();
    for (const s of city.neon) {
      s.color = NEON[s.v % NEON.length];
      col.setHex(s.color).multiplyScalar(1.25);
      const px = s.cx + s.nx * 0.12;
      const pz = s.cz + s.nz * 0.12;
      const add = (w, h, x, y, z) => {
        const g = new THREE.BoxGeometry(w, h, 0.05).rotateY(angOf(s.ux, s.uz)).translate(x, y, z);
        const n = g.attributes.position.count;
        const c = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) col.toArray(c, i * 3);
        g.setAttribute('color', new THREE.BufferAttribute(c, 3));
        geos.push(g);
      };
      add(s.sw + 0.2, 0.05, px, 3.93, pz);
      add(s.sw + 0.2, 0.05, px, 2.97, pz);
      for (const k of [-1, 1]) add(0.05, 0.96, px + s.ux * k * (s.sw / 2 + 0.1), 3.45, pz + s.uz * k * (s.sw / 2 + 0.1));
    }
    const nm = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: 0 });
    const neon = new THREE.Mesh(mergeGeometries(geos), nm);
    neon.visible = false;
    city.neonMesh = neon;
    scene.add(neon);
  }
  // tanques de agua
  const ti = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 0.7, 1.4, 12), new THREE.MeshLambertMaterial({ color: 0x1f2426 }), tanks.length);
  const bi = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.5, 1.5), new THREE.MeshLambertMaterial({ color: 0x9e5a3c }), tanks.length);
  const m4 = new THREE.Matrix4();
  tanks.forEach(([x, y, z], i) => {
    m4.makeTranslation(x, y + 1.2, z);
    ti.setMatrixAt(i, m4);
    m4.makeTranslation(x, y + 0.25, z);
    bi.setMatrixAt(i, m4);
  });
  ti.castShadow = true;
  scene.add(...fixed(220, ti, bi));
}

// ---------- Rejas ----------
// reja de ventana de casa del conurbano: barrotes, dos travesaños y una greca de rulos arriba
function windowGrilleTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1b1c1e';
  g.strokeStyle = '#1b1c1e';
  for (let x = 6; x < 128; x += 21) g.fillRect(x, 0, 5, 256);
  g.fillRect(0, 0, 128, 7);
  g.fillRect(0, 249, 128, 7);
  g.fillRect(0, 60, 128, 5);
  g.fillRect(0, 190, 128, 5);
  g.lineWidth = 4;
  for (let x = 16; x < 128; x += 42) {
    g.beginPath();
    g.arc(x, 34, 11, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(x + 21, 34, 6, 0, Math.PI * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function rejaTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1d1d1f';
  for (let x = 2; x < 256; x += 14) {
    g.fillRect(x, 10, 4, 118);
    g.beginPath();
    g.moveTo(x - 2, 12);
    g.lineTo(x + 2, 2);
    g.lineTo(x + 6, 12);
    g.fill();
  }
  g.fillRect(0, 14, 256, 5);
  g.fillRect(0, 70, 256, 4);
  g.fillRect(0, 122, 256, 6);
  g.strokeStyle = '#1d1d1f';
  g.lineWidth = 3;
  for (let x = 9; x < 256; x += 28) {
    g.beginPath();
    g.arc(x + 7, 44, 6, 0, Math.PI * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function addFences(scene, colliders, balconyRails) {
  const q = new Quads();
  const walls = new FastBoxes();
  const rail = (x0, z0, x1, z1, y0, y1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    q.vert(x0, z0, x1, z1, y0, y1, { u0: 0, v0: 0, u1: len / 1.8, v1: 1 });
  };
  for (const [ax, az, bx, bz, gate] of D.fences) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1) continue;
    const gw = Math.min(0.45, 1.2 / len);
    const h = 1.7 + ((Math.abs(ax * 13) | 0) % 3) * 0.2;
    for (const [s, e] of [
      [0, gate - gw / 2],
      [gate + gw / 2, 1],
    ]) {
      if (e - s <= 0.02) continue;
      const sx = ax + (bx - ax) * s;
      const sz = az + (bz - az) * s;
      const ex = ax + (bx - ax) * e;
      const ez = az + (bz - az) * e;
      rail(sx, sz, ex, ez, 0.62, 0.15 + h);
      colliders.addSegment(sx, sz, ex, ez, h, 'fence');
    }
    walls.rbox(len, 0.5, 0.22, 0xd8cfbd, (ax + bx) / 2, 0.4, (az + bz) / 2, angOf((bx - ax) / len, (bz - az) / len));
  }
  for (const r of balconyRails) {
    const { e, t0, t1, y, depth } = r;
    const x0 = e.ax + (e.bx - e.ax) * t0 + e.nx * depth;
    const z0 = e.az + (e.bz - e.az) * t0 + e.nz * depth;
    const x1 = e.ax + (e.bx - e.ax) * t1 + e.nx * depth;
    const z1 = e.az + (e.bz - e.az) * t1 + e.nz * depth;
    rail(x0, z0, x1, z1, y, y + 1.0);
    rail(x0 - e.nx * depth, z0 - e.nz * depth, x0, z0, y, y + 1.0);
    rail(x1, z1, x1 - e.nx * depth, z1 - e.nz * depth, y, y + 1.0);
  }
  const t = rejaTexture();
  scene.add(new THREE.Mesh(q.geometry(), new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide })));
  scene.add(walls.mesh(new THREE.MeshLambertMaterial({ vertexColors: true })));
}

// ---------- Vías ----------
function addTracks(scene) {
  const sleepers = [];
  const rails = new FastBoxes();
  const ballast = new Quads();
  for (const t of TRACKS) {
    let carry = 0;
    for (let i = 0; i < t.length - 1; i++) {
      const [ax, az] = t[i];
      const [bx, bz] = t[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      const nx = -uz;
      const nz = ux;
      for (const off of [-0.84, 0.84]) rails.rbox(len + 0.02, 0.16, 0.09, 0x8b8680, (ax + bx) / 2 + nx * off, 0.3, (az + bz) / 2 + nz * off, angOf(ux, uz));
      ballast.add((ax + bx) / 2, (az + bz) / 2, ux, uz, len + 0.3, 3.4, 0.06);
      for (let d = carry; d < len; d += 0.75) sleepers.push([ax + ux * d, az + uz * d, Math.atan2(ux, uz)]);
      carry = 0.75 - ((len - carry) % 0.75);
    }
  }
  scene.add(new THREE.Mesh(ballast.geometry(), new THREE.MeshLambertMaterial({ color: 0x5d564e })));
  const rm = rails.mesh(new THREE.MeshLambertMaterial({ vertexColors: true }));
  rm.castShadow = false;
  scene.add(rm);
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.12, 0.24), new THREE.MeshLambertMaterial({ color: 0x4a3b2c }), sleepers.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const v = new THREE.Vector3();
  sleepers.forEach(([x, z, a], i) => {
    q.setFromAxisAngle(up, a);
    m4.compose(v.set(x, 0.17, z), q, one);
    inst.setMatrixAt(i, m4);
  });
  scene.add(...fixed(160, inst));
}

// ---------- Estación: andenes, techos, puente peatonal, carrito de panchos ----------
function addStation(scene, colliders, city) {
  const concrete = new THREE.MeshLambertMaterial({ color: 0xb9b2a4 });
  const pg = [];
  for (const rings of D.platforms) {
    const g = new THREE.ExtrudeGeometry(shapeFrom(rings), { depth: 1.1, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    pg.push(ni(g));
  }
  if (pg.length) {
    const pm = new THREE.Mesh(mergeGeometries(pg), concrete);
    pm.receiveShadow = true;
    pm.castShadow = true;
    scene.add(pm);
  }
  // borde amarillo de seguridad
  const edge = new FastBoxes();
  for (const rings of D.platforms) {
    for (const r of rings) {
      for (let i = 0; i < r.length; i++) {
        const [ax, az] = r[i];
        const [bx, bz] = r[(i + 1) % r.length];
        const l = Math.hypot(bx - ax, bz - az);
        if (l < 1.5) continue;
        edge.rbox(l, 0.02, 0.45, 0xe8c43a, (ax + bx) / 2, 1.11, (az + bz) / 2, angOf((bx - ax) / l, (bz - az) / l));
      }
    }
  }
  scene.add(edge.mesh(new THREE.MeshLambertMaterial({ vertexColors: true })));
  // techos de andén con columnas
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x8a9399, side: THREE.DoubleSide });
  if (D.canopies.length) {
    const cm = new THREE.Mesh(flat(D.canopies.map((r) => [r]), 4.9, 4), roofMat);
    cm.castShadow = true;
    scene.add(cm);
  }
  const col = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.13, 3.8, 8), new THREE.MeshLambertMaterial({ color: 0x3f5563 }), D.columns.length);
  const m4 = new THREE.Matrix4();
  D.columns.forEach(([x, z], i) => {
    m4.makeTranslation(x, 3.0, z);
    col.setMatrixAt(i, m4);
    colliders.addCircle(x, z, 0.15, 5, 'column');
  });
  col.castShadow = true;
  scene.add(...fixed(col));
  // carteles azules TEMPERLEY colgando en los andenes
  const hs = new Quads();
  D.columns.forEach(([x, z], i) => {
    if (i % 4 !== 1) return;
    hs.vert(x, z - 0.8, x, z + 0.8, 3.4, 3.9);
  });
  scene.add(new THREE.Mesh(hs.geometry(), new THREE.MeshBasicMaterial({ map: textTexture('TEMPERLEY', { w: 512, h: 96, bg: '#10306e', fg: '#ffffff', font: 60, border: '#ffffff' }), side: THREE.DoubleSide })));
  // puentes peatonales sobre las vías
  const steel = 0x3f5563;
  const F = new FastBoxes();
  for (const line of D.bridges) {
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i];
      const [bx, bz] = line[i + 1];
      const l = Math.hypot(bx - ax, bz - az);
      if (l < 0.5) continue;
      const ux = (bx - ax) / l;
      const uz = (bz - az) / l;
      const rot = angOf(ux, uz);
      const cx = (ax + bx) / 2;
      const cz = (az + bz) / 2;
      F.rbox(l + 0.1, 0.35, 3.2, 0xb9b2a4, cx, 7.2, cz, rot);
      for (const s of [-1, 1]) F.rbox(l + 0.1, 1.1, 0.06, steel, cx - uz * 1.55 * s, 7.9, cz + ux * 1.55 * s, rot);
      F.rbox(l + 0.1, 0.08, 3.8, 0x8a9399, cx, 10.1, cz, rot);
    }
    for (const [x, z] of line) {
      F.box(0.45, 7.1, 0.45, steel, x, 3.55, z);
      colliders.addCircle(x, z, 0.3, 7, 'column');
    }
  }
  scene.add(F.mesh(new THREE.MeshLambertMaterial({ vertexColors: true })));

  // edificio de la estación: la puerta es la pared larga que mira a la plaza (oeste)
  const st = city.buildingList.find((b) => b.kind === 'estacion');
  if (st) {
    const r = st.ring;
    let best = null;
    for (let k = 0; k < r.length; k++) {
      const e = outward(r, k);
      if (e.l > 10 && (!best || e.nx < best.nx)) best = e;
    }
    if (best) {
      const mx = (best.ax + best.bx) / 2;
      const mz = (best.az + best.bz) / 2;
      city.spots.stationDoor = { x: mx + best.nx * 2.2, z: mz + best.nz * 2.2 };
      city.spots.stationWall = { mx, mz, ux: best.ux, uz: best.uz, nx: best.nx, nz: best.nz, l: best.l };
      // cartel TEMPERLEY sobre la fachada
      const L = Math.min(14, best.l - 2);
      const cx = mx + best.nx * 0.12;
      const cz = mz + best.nz * 0.12;
      const rx = best.nz;
      const rz = -best.nx;
      const sq = new Quads();
      sq.vert(cx - (rx * L) / 2, cz - (rz * L) / 2, cx + (rx * L) / 2, cz + (rz * L) / 2, 5.3, 6.9);
      scene.add(new THREE.Mesh(sq.geometry(), new THREE.MeshBasicMaterial({ map: textTexture('TEMPERLEY', { w: 1024, h: 160, bg: '#10306e', fg: '#ffffff', font: 110, border: '#ffffff' }), side: THREE.DoubleSide })));
    }
  }
  if (!city.spots.stationDoor) city.spots.stationDoor = { x: STATION.x - 45, z: STATION.z };

  // carrito de panchos al lado de la puerta
  const sw = city.spots.stationWall;
  const px = sw ? city.spots.stationDoor.x + sw.ux * 9 + sw.nx * 1.8 : city.spots.stationDoor.x;
  const pz = sw ? city.spots.stationDoor.z + sw.uz * 9 + sw.nz * 1.8 : city.spots.stationDoor.z + 9;
  const cart = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 2.4), new THREE.MeshLambertMaterial({ color: 0xd32f2f }));
  body.position.y = 0.85;
  const umbrella = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.7, 8), new THREE.MeshLambertMaterial({ color: 0xffeb3b }));
  umbrella.position.y = 2.7;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3), new THREE.MeshLambertMaterial({ color: 0x3f5563 }));
  pole.position.y = 1.4;
  const csign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.5), new THREE.MeshBasicMaterial({ map: textTexture('PANCHOS · SUPERPANCHOS', { w: 512, h: 96, bg: '#ffeb3b', fg: '#c62828', font: 40 }), side: THREE.DoubleSide }));
  csign.position.set(0.72, 1.1, 0);
  csign.rotation.y = Math.PI / 2;
  cart.add(body, umbrella, pole, csign);
  cart.position.set(px, 0.15, pz);
  if (sw) cart.rotation.y = Math.atan2(sw.ux, sw.uz);
  cart.traverse((o) => (o.castShadow = true));
  scene.add(cart);
  colliders.addCircle(px, pz, 1.1, 1.5, 'prop');
  city.spots.pancho = { x: px + (sw ? sw.nx * 1.6 : 1.6), z: pz + (sw ? sw.nz * 1.6 : 0) };
}

// ---------- Faroles y cables ----------
function addLamps(scene, city, rng) {
  const L = D.lamps;
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 8.5, 6), new THREE.MeshLambertMaterial({ color: 0x5b4636 }), L.length);
  // brazo curvo (en el plano y-z local) + cabezal tipo cobra
  const armParts = [];
  const arc = (a) => [Math.sin(a) * 1.3, 7.2 + (1 - Math.cos(a)) * 0.5];
  for (let k = 0; k < 5; k++) {
    const p0 = arc((k / 5) * Math.PI * 0.5);
    const p1 = arc(((k + 1) / 5) * Math.PI * 0.5);
    const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const c = new THREE.CylinderGeometry(0.035, 0.035, l, 5);
    c.rotateX(Math.atan2(p1[0] - p0[0], p1[1] - p0[1]));
    c.translate(0, (p0[1] + p1[1]) / 2, (p0[0] + p1[0]) / 2);
    armParts.push(ni(c));
  }
  const arms = new THREE.InstancedMesh(mergeGeometries(armParts), new THREE.MeshLambertMaterial({ color: 0x4a4f53 }), L.length);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x3a3226 });
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.14, 0.7), lampMat, L.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const v = new THREE.Vector3();
  city.lampRig = { poles, arms, heads, data: L };
  L.forEach(([x, z, rot], i) => {
    // el poste es un obstáculo (y un auto rápido lo voltea, ver src/smash.js)
    const c = city.colliders.addCircle(x, z, 0.17, 8, 'lamp');
    c.lamp = i;
    m4.makeTranslation(x, 4.25, z);
    poles.setMatrixAt(i, m4);
    q.setFromAxisAngle(up, rot);
    m4.compose(v.set(x, 0, z), q, one);
    arms.setMatrixAt(i, m4);
    const hx = x + Math.sin(rot) * 1.45;
    const hz = z + Math.cos(rot) * 1.45;
    m4.compose(v.set(hx, 7.72, hz), q, one);
    heads.setMatrixAt(i, m4);
    city.lamps.push({ x: hx, z: hz });
  });
  poles.castShadow = true;
  // fijos para chunks.js, pero los voltea smash.js por índice (movable)
  for (const m of [poles, arms, heads]) m.userData.movable = true;
  scene.add(...fixed(poles, arms, heads));
  city.lampMats.push(lampMat);
  // manchas de luz de sodio en el piso
  const poolGeo = new THREE.PlaneGeometry(13, 13);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({ map: radialTexture(), color: 0xffa640, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, city.lamps.length);
  city.lamps.forEach((l, i) => {
    m4.makeTranslation(l.x, 0.21, l.z);
    pools.setMatrixAt(i, m4);
  });
  pools.visible = false;
  scene.add(...fixed(pools));
  city.lampPools = pools;
  // cables entre postes consecutivos y zapatillas colgadas
  const pts = [];
  const shoes = [];
  for (let i = 0; i < L.length - 1; i++) {
    const [ax, az] = L[i];
    const [bx, bz] = L[i + 1];
    const d = Math.hypot(bx - ax, bz - az);
    if (d > 42 || d < 8) continue;
    for (const [h, sag] of [
      [8.2, 0.9],
      [7.6, 1.3],
      [7.0, 1.1],
    ]) {
      const n = 10;
      for (let k = 0; k < n; k++) {
        const t0 = k / n;
        const t1 = (k + 1) / n;
        pts.push(ax + (bx - ax) * t0, h - sag * 4 * t0 * (1 - t0), az + (bz - az) * t0, ax + (bx - ax) * t1, h - sag * 4 * t1 * (1 - t1), az + (bz - az) * t1);
      }
    }
    if (rng.chance(0.07)) shoes.push([(ax + bx) / 2, 5.8, (az + bz) / 2]);
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0x151515 })));
  const sm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.12, 0.3), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }), Math.max(1, shoes.length * 2));
  shoes.forEach(([x, y, z], i) => {
    m4.makeTranslation(x - 0.12, y, z);
    sm.setMatrixAt(i * 2, m4);
    m4.makeTranslation(x + 0.12, y - 0.1, z);
    sm.setMatrixAt(i * 2 + 1, m4);
  });
  sm.count = shoes.length * 2;
  scene.add(...fixed(120, sm));
}

export function radialTexture(inner = 'rgba(255,255,255,1)', size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- Árboles ----------
// Especies de la zona: fresno (el verde de siempre), tipa (grande y de copa ancha),
// jacarandá (copa plana y lila) y palo borracho (tronco panzón y flores rosas).
const SPECIES = {
  fresno: {
    h: 3.4, r0: 0.13, r1: 0.24, bark: 0x5a4a3a, coreColor: 0x2f4a22, core: [1.5, 1.25, 0.95, 5.1],
    blobs: [[0, 5.3, 0, 2.3], [1.1, 4.7, 0.4, 1.8], [-1.0, 4.8, 0.6, 1.8], [0.2, 4.6, -1.1, 1.8], [-0.4, 6.0, -0.3, 1.6], [0.7, 5.8, 0.8, 1.5]],
  },
  tipa: {
    h: 4.4, r0: 0.17, r1: 0.32, bark: 0x62503c, coreColor: 0x3f5a26, core: [2.3, 1.45, 0.62, 6.9],
    blobs: [[0, 7.2, 0, 2.6], [1.9, 6.6, 0.5, 2.2], [-1.8, 6.7, 0.7, 2.2], [0.3, 6.5, -1.9, 2.2], [-0.6, 6.4, 1.8, 2.0], [1.2, 7.6, -1.0, 1.9], [-1.2, 7.7, -0.9, 1.8]],
  },
  jacaranda: {
    h: 3.2, r0: 0.1, r1: 0.19, bark: 0x4f4540, coreColor: 0x5a4a82, core: [1.8, 1.45, 0.5, 5.4],
    blobs: [[0, 5.6, 0, 2.2], [1.7, 5.2, 0.4, 1.8], [-1.6, 5.3, 0.6, 1.8], [0.3, 5.1, -1.6, 1.7], [-0.5, 5.2, 1.6, 1.7]],
  },
  palo: {
    h: 3.3, bottle: true, bark: 0x6f7a55, coreColor: 0x3a5225, core: [1.3, 1.2, 0.9, 5.2],
    blobs: [[0, 5.4, 0, 2.0], [1.0, 5.0, 0.4, 1.6], [-0.9, 5.1, 0.5, 1.6], [0.2, 4.9, -1.0, 1.6]],
  },
};
const WHITEWASH = 0xe2e2da;

function paint(g, hex) {
  const n = g.attributes.position.count;
  const c = new THREE.Color(hex);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Tronco con ramas; los de la vereda llevan el metro de abajo pintado a la cal
function treeTrunk(sp, painted) {
  const parts = [];
  if (sp.bottle) {
    const prof = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      prof.push(new THREE.Vector2(0.15 + Math.sin(t * Math.PI * 0.85) * 0.3 * (1 - t * 0.5), t * sp.h));
    }
    parts.push(paint(ni(new THREE.LatheGeometry(prof, 9)), sp.bark));
  } else {
    const cut = 1.05;
    const rc = sp.r1 + (sp.r0 - sp.r1) * (cut / sp.h);
    parts.push(paint(ni(new THREE.CylinderGeometry(rc, sp.r1, cut, 7).translate(0, cut / 2, 0)), painted ? WHITEWASH : sp.bark));
    parts.push(paint(ni(new THREE.CylinderGeometry(sp.r0, rc, sp.h - cut, 7).translate(0, cut + (sp.h - cut) / 2, 0)), sp.bark));
  }
  for (const [ax, az, len] of [
    [0.6, 0.2, 1.8],
    [-0.5, 0.5, 1.6],
    [0.1, -0.7, 1.7],
  ]) {
    const b = new THREE.CylinderGeometry(0.06, 0.11, len, 5);
    b.translate(0, len / 2, 0);
    b.rotateZ(-ax);
    b.rotateX(az);
    b.translate(0, sp.h - 0.6, 0);
    parts.push(paint(ni(b), sp.bark));
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

// Copa: ramilletes de hojas (planos) inclinados al azar. La luz se calcula como si la copa fuera
// redonda (normales que salen del centro de cada ramillete y de la copa), así no quedan planos
// oscuros ni se ve como un plato: arriba se ilumina y abajo se oscurece suave.
function treeCanopy(sp) {
  const cards = [];
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const [x, y, z] of sp.blobs) {
    cx += x / sp.blobs.length;
    cy += y / sp.blobs.length;
    cz += z / sp.blobs.length;
  }
  const R = Math.max(...sp.blobs.map(([x, y, z, r]) => Math.hypot(x - cx, (y - cy) * 1.4, z - cz) + r));
  let seed = sp.blobs.length * 7.31;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const v = new THREE.Vector3();
  for (const [x, y, z, r] of sp.blobs) {
    for (let k = 0; k < 6; k++) {
      const p = new THREE.PlaneGeometry(r * 2, r * 1.8);
      p.rotateX((rnd() - 0.5) * 1.3);
      p.rotateY((k / 6) * Math.PI + rnd() * 0.5);
      if (k === 5) p.rotateX(Math.PI / 2);
      p.translate(x + (rnd() - 0.5) * r * 0.3, y + (rnd() - 0.5) * r * 0.25, z + (rnd() - 0.5) * r * 0.3);
      const pos = p.attributes.position;
      const nor = p.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        v.set((pos.getX(i) - x) / r, (pos.getY(i) - y) / r, (pos.getZ(i) - z) / r).multiplyScalar(0.55);
        v.x += ((pos.getX(i) - cx) / R) * 0.45;
        v.y += ((pos.getY(i) - cy) / R) * 0.45 + 0.12;
        v.z += ((pos.getZ(i) - cz) / R) * 0.45;
        v.normalize();
        nor.setXYZ(i, v.x, v.y, v.z);
      }
      cards.push(p);
    }
  }
  const [cr, sxz, sy, ccy] = sp.core;
  const core = new THREE.IcosahedronGeometry(cr * 0.82, 1);
  core.scale(sxz, sy, sxz);
  core.translate(0, ccy, 0);
  return { leaves: mergeGeometries(cards), core };
}

// ¿El árbol está en una vereda? Devuelve la dirección de la calle (para alinear la cazuela)
function streetOf(x, z, boxes) {
  let best = null;
  for (const b of boxes) {
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
    const p = project(b.r.pts, b.r.cum, x, z);
    const edge = b.r.w / 2;
    if (p.dist > edge - 0.3 && p.dist < edge + 3.4 && (!best || p.dist - edge < best.d)) best = { d: p.dist - edge, dx: p.dx, dz: p.dz };
  }
  return best;
}

function addTrees(scene, colliders, rng) {
  const trees = D.trees;
  const boxes = ROADS.map((r) => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const [x, z] of r.pts) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
    const m = r.w / 2 + 4;
    return { r, x0: x0 - m, x1: x1 + m, z0: z0 - m, z1: z1 + m };
  });
  // a cada árbol su especie; los de vereda pueden tener el tronco pintado y su cazuela
  const plan = trees.map(([x, z, sc]) => {
    const street = streetOf(x, z, boxes);
    const u = rng.next();
    const species = street ? (u < 0.42 ? 'fresno' : u < 0.68 ? 'tipa' : u < 0.9 ? 'jacaranda' : 'palo') : u < 0.35 ? 'fresno' : u < 0.7 ? 'tipa' : u < 0.9 ? 'jacaranda' : 'palo';
    const painted = !!street && species !== 'palo' && rng.chance(0.6);
    return { x, z, sc, species, painted, street, rot: rng.range(0, Math.PI * 2), sy: rng.range(0.9, 1.15) };
  });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  for (const [name, sp] of Object.entries(SPECIES)) {
    const list = plan.filter((t) => t.species === name);
    if (!list.length) continue;
    const { leaves, core } = treeCanopy(sp);
    const leafTex = leafTexture(name);
    const lm = addWind(new THREE.MeshLambertMaterial({ map: leafTex, alphaTest: 0.45, alphaToCoverage: true, side: THREE.DoubleSide }));
    const windCompile = lm.onBeforeCompile;
    lm.onBeforeCompile = (sh, r) => {
      windCompile(sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\n  normal *= faceDirection;\n#endif');
    };
    lm.customProgramCacheKey = () => 'wind-leaf';
    const li = new THREE.InstancedMesh(leaves, lm, list.length);
    li.customDepthMaterial = addWind(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTex, alphaTest: 0.45 }));
    const ci = new THREE.InstancedMesh(core, new THREE.MeshLambertMaterial({ color: sp.coreColor }), list.length);
    const trunkMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const groups = [false, true].map((p) => ({ list: list.filter((t) => t.painted === p), geo: treeTrunk(sp, p) }));
    const trunks = groups.filter((g) => g.list.length).map((g) => ({ ...g, mesh: new THREE.InstancedMesh(g.geo, trunkMat, g.list.length), n: 0 }));
    list.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rot);
      m4.compose(pos.set(t.x, 0.15, t.z), q, scl.set(t.sc, t.sc * t.sy, t.sc));
      li.setMatrixAt(i, m4);
      ci.setMatrixAt(i, m4);
      const tg = trunks.find((g) => g.list === (t.painted ? groups[1].list : groups[0].list));
      tg.mesh.setMatrixAt(tg.n++, m4);
      col.setRGB(1 - rng.range(0, 0.12), 1 - rng.range(0, 0.06), 1 - rng.range(0, 0.15));
      li.setColorAt(i, col);
      colliders.addCircle(t.x, t.z, (name === 'tipa' || name === 'palo' ? 0.32 : 0.25) * t.sc, 3, 'tree');
    });
    li.castShadow = ci.castShadow = true;
    li.receiveShadow = true;
    scene.add(...fixed(ci, li));
    for (const g of trunks) {
      g.mesh.castShadow = true;
      g.mesh.receiveShadow = true;
      scene.add(...fixed(g.mesh));
    }
  }
  // cazuelas de tierra en la vereda, alineadas con la calle
  const street = plan.filter((t) => t.street);
  if (street.length) {
    const cg = new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2);
    const cm = new THREE.InstancedMesh(cg, new THREE.MeshLambertMaterial({ map: cazuelaTexture(), polygonOffset: true, polygonOffsetFactor: -2 }), street.length);
    street.forEach((t, i) => {
      q.setFromAxisAngle(up, Math.atan2(t.street.dx, t.street.dz));
      m4.compose(pos.set(t.x, 0.158, t.z), q, scl.set(1, 1, 1));
      cm.setMatrixAt(i, m4);
    });
    cm.receiveShadow = true;
    scene.add(...fixed(140, cm));
  }
}

// ---------- Bolsas de basura en la vereda ----------
function addClutter(scene, rng) {
  const bags = [];
  for (const b of D.buildings) {
    if (!b.fr.length || !rng.chance(0.18)) continue;
    const e = outward(b.r, b.fr[0]);
    const d = (b.sb[0] ?? 0) + 2.4;
    const x = (e.ax + e.bx) / 2 + e.nx * d;
    const z = (e.az + e.bz) / 2 + e.nz * d;
    for (let i = 0; i < rng.int(2, 5); i++) bags.push([x + rng.range(-0.7, 0.7), z + rng.range(-0.7, 0.7), rng.range(0.3, 0.5)]);
  }
  const inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x1b1c1e, flatShading: true }), bags.length);
  const m4 = new THREE.Matrix4();
  bags.forEach(([x, z, s], i) => {
    m4.makeScale(s, s * 0.8, s);
    m4.setPosition(x, 0.15 + s * 0.6, z);
    inst.setMatrixAt(i, m4);
  });
  scene.add(...fixed(120, inst));
}

function addBounds(colliders) {
  const H = HALF - 2;
  colliders.addRing(
    [
      [-H, -H],
      [H, -H],
      [H, H],
      [-H, H],
    ],
    99,
    'bound',
  );
}

// ---------- Lugares: estacionamiento, trapitos, gente pidiendo ----------
function findSpots(city, rng) {
  const door = city.spots.stationDoor;
  const curb = [];
  for (const r of ROADS) {
    if (r.len < 25 || r.cls === 'service' || r.w < 7) continue;
    for (let s = 12; s < r.len - 12; s += 6) {
      const p = pointAt(r.pts, r.cum, s);
      for (const side of [-1, 1]) {
        // a la derecha del sentido (dx,dz)*side, mirando en ese sentido
        const off = r.w / 2 - 1.15;
        curb.push({ x: p.x - p.dz * off * side, z: p.z + p.dx * off * side, heading: Math.atan2(p.dx * side, p.dz * side), road: r, d: Math.hypot(p.x - door.x, p.z - door.z) });
      }
    }
  }
  curb.sort((a, b) => a.d - b.d);
  city.curbSpots = curb;
  city.parking = curb.filter((c) => c.d < 170 && rng.chance(0.5)).slice(0, 40);
  // hacia la vereda: a la derecha del auto estacionado
  const toWalk = (c, k) => ({ x: c.x - Math.cos(c.heading) * k, z: c.z + Math.sin(c.heading) * k });
  city.spots.trapitos = [];
  for (const c of city.parking) {
    if (city.spots.trapitos.length >= 5) break;
    if (city.spots.trapitos.some((t) => Math.hypot(t.x - c.x, t.z - c.z) < 40)) continue;
    city.spots.trapitos.push(toWalk(c, 2.4));
  }
  const av = curb.filter((c) => c.road.avenue && c.d > 150 && c.d < 420);
  for (let i = 0; i < 2 && av.length; i++) city.spots.trapitos.push(toWalk(av[Math.floor(rng.next() * av.length)], 2.4));
  // gente pidiendo: contra la pared de la estación y en Almirante Brown
  city.spots.mendigos = [];
  const sw = city.spots.stationWall;
  if (sw) for (const t of [-14, 12]) city.spots.mendigos.push({ x: sw.mx + sw.ux * t + sw.nx * 0.9, z: sw.mz + sw.uz * t + sw.nz * 0.9, heading: Math.atan2(sw.nx, sw.nz) });
  for (const c of curb.filter((c) => c.road.name === 'Almirante Brown')) {
    if (city.spots.mendigos.length >= 5) break;
    if (city.spots.mendigos.some((m) => Math.hypot(m.x - c.x, m.z - c.z) < 60)) continue;
    const p = toWalk(c, 3.6);
    city.spots.mendigos.push({ ...p, heading: c.heading + Math.PI / 2 });
  }
}
