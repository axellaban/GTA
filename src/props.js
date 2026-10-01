// Mobiliario urbano del conurbano: semáforos (que la IA respeta), carteles de calle, paradas,
// canastos de basura elevados, contenedores, antenas, parabólicas, hierros en las terrazas,
// ropa tendida, catenaria del Roca y sombras de contacto.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DATA as D, TRACKS, CORNERS, ROADS, nearestRoad } from './map.js';
import { outward, pointInRing, fixed } from './city.js';
import { FastBoxes } from './builder.js';
import { Rng } from './rng.js';
const ni = (g) => (g.index ? g.toNonIndexed() : g);

const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v3 = new THREE.Vector3();

function place(inst, i, x, y, z, rot = 0, sx = 1, sy = 1, sz = 1) {
  q.setFromAxisAngle(UP, rot);
  m4.compose(v3.set(x, y, z), q, new THREE.Vector3(sx, sy, sz));
  inst.setMatrixAt(i, m4);
}

// ---------- Semáforos ----------
// Cada cabezal (caño, caja y viseras) es una instancia de la misma pieza: un auto rápido lo voltea
// como a los postes de luz (src/smash.js), se apaga y el tránsito de ese lado ya no frena.
const CYCLE = 36;
const POST_H = 3.4;
const nk = (x, z) => `${Math.round(x * 2) / 2},${Math.round(z * 2) / 2}`;
// la pieza, mirando a +z con la base en el origen
function signalHead() {
  const F = new FastBoxes();
  F.box(0.14, POST_H, 0.14, 0x2d3236, 0, POST_H / 2, 0);
  F.rbox(0.36, 0.95, 0.3, 0x1c1f22, 0, 3.05, 0, 0);
  for (let k = 0; k < 3; k++) F.rbox(0.3, 0.03, 0.14, 0x111111, 0, 3.35 - k * 0.28 + 0.12, 0.2, 0);
  return F.mesh();
}
export class TrafficLights {
  constructor(scene, { colliders, fx, audio } = {}) {
    this.list = [];
    this.byNode = new Map();
    this.fx = fx;
    this.audio = audio;
    this.heads = [];
    this.falling = [];
    this.obstacles = []; // cabezales tirados en la calle (el tránsito los esquiva)
    const lamps = [];
    const used = new Set();
    for (const [sx, sz] of D.signals) {
      // la esquina real más cercana al semáforo
      let best = null;
      let bd = 22;
      for (const c of CORNERS) {
        const d = Math.hypot(c.x - sx, c.z - sz);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (!best || used.has(best)) continue;
      used.add(best);
      const L = { x: best.x, z: best.z, offset: Math.abs(best.x * 0.13 + best.z * 0.07) % CYCLE, heads: [], arms: new Map() };
      const a0 = best.arms[0];
      for (const arm of best.arms) {
        const group = Math.abs(arm.dx * a0.dx + arm.dz * a0.dz) > 0.7 ? 0 : 1;
        const wo = Math.max(8, ...best.arms.filter((a) => a !== arm).map((a) => a.road.w));
        L.arms.set(arm.road.id, { group, wo });
        const w = arm.road.w;
        // cabezal a la derecha de quien llega (que viene en dirección -u)
        const rx = arm.dz;
        const rz = -arm.dx;
        const px = best.x + arm.dx * (wo / 2 + 1.5) + rx * (w / 2 + 0.9);
        const pz = best.z + arm.dz * (wo / 2 + 1.5) + rz * (w / 2 + 0.9);
        const face = Math.atan2(arm.dx, arm.dz);
        const head = { group, lampIndex: lamps.length, x: px, z: pz, face, i: this.heads.length, arm: L.arms.get(arm.road.id) };
        for (let k = 0; k < 3; k++) lamps.push(3.35 - k * 0.28);
        if (colliders) colliders.addCircle(px, pz, 0.12, POST_H, 'signal').signal = head.i;
        this.heads.push(head);
        L.heads.push(head);
      }
      this.list.push(L);
      this.byNode.set(nk(best.x, best.z), L);
    }
    const piece = signalHead();
    this.posts = new THREE.InstancedMesh(piece.geometry, piece.material, Math.max(1, this.heads.length));
    this.posts.castShadow = true;
    this.posts.count = this.heads.length;
    scene.add(this.posts);
    const lg = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12).rotateX(Math.PI / 2);
    this.lamps = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, lamps.length));
    this.lampY = lamps;
    this.lamps.count = lamps.length;
    this.m4 = new THREE.Matrix4();
    this.m5 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.axis = new THREE.Vector3();
    for (const h of this.heads) this.pose(h, 0, 0, 0);
    this.colors = {
      on: [new THREE.Color(3.2, 0.25, 0.15), new THREE.Color(3.0, 1.9, 0.2), new THREE.Color(0.2, 2.8, 0.9)],
      off: [new THREE.Color(0.22, 0.05, 0.04), new THREE.Color(0.22, 0.16, 0.04), new THREE.Color(0.04, 0.18, 0.08)],
      dead: new THREE.Color(0.05, 0.05, 0.05),
    };
    scene.add(this.lamps);
    this.t = 0;
    this.update(0);
  }

  phase(L, group) {
    const t = (this.t + L.offset) % CYCLE;
    const a = t < 14 ? 'green' : t < 17 ? 'yellow' : 'red';
    const b = t >= 18 && t < 32 ? 'green' : t >= 32 && t < 35 ? 'yellow' : 'red';
    return group === 0 ? a : b;
  }

  // ubica el cabezal: parado, o volcado `a` radianes hacia (dx, dz) girando sobre la base
  pose(h, a, dx, dz) {
    const base = this.m4.makeRotationY(h.face);
    if (a) base.premultiply(this.m5.makeRotationFromQuaternion(this.q.setFromAxisAngle(this.axis.set(dz, 0, -dx), a)));
    base.premultiply(this.m5.makeTranslation(h.x, 0, h.z));
    this.posts.setMatrixAt(h.i, base);
    for (let k = 0; k < 3; k++) this.lamps.setMatrixAt(h.lampIndex + k, this.m5.makeTranslation(0, this.lampY[h.lampIndex + k], 0.155).premultiply(base));
    this.posts.instanceMatrix.needsUpdate = true;
    this.lamps.instanceMatrix.needsUpdate = true;
  }

  // un auto se lo llevó puesto (box: su colisionador; vx, vz: la velocidad del auto)
  knock(box, vx, vz) {
    const h = this.heads[box.signal];
    if (!h || h.down) return false;
    h.down = true;
    if (h.arm) h.arm.down = true;
    box.x = box.z = 1e6;
    const sp = Math.hypot(vx, vz) || 1;
    this.falling.push({ h, dx: vx / sp, dz: vz / sp, a: 0.15, w: Math.min(2.6, sp * 0.1), landed: false });
    this.fx?.sparks(h.x, 0.5, h.z, 10, 5);
    this.audio?.metal(0.8);
    this.audio?.golpe(0.5);
    // se apaga
    for (let k = 0; k < 3; k++) this.lamps.setColorAt(h.lampIndex + k, this.colors.dead);
    return true;
  }

  update(dt) {
    this.t += dt;
    for (const f of this.falling) {
      if (f.landed) continue;
      f.w += ((3 * 9.8) / (2 * POST_H)) * Math.sin(f.a) * dt;
      f.a += f.w * dt;
      if (f.a >= Math.PI / 2) {
        f.a = Math.PI / 2;
        f.landed = true;
        const hx = f.h.x + f.dx * 3;
        const hz = f.h.z + f.dz * 3;
        this.fx?.sparks(hx, 0.3, hz, 18, 6);
        this.fx?.dust(hx, 0.2, hz, 6, [0.5, 0.48, 0.44], 1);
        this.audio?.metal(0.9);
        this.obstacles.push({ x: f.h.x + f.dx * 1.6, z: f.h.z + f.dz * 1.6, r: 0.5 }, { x: hx, z: hz, r: 0.5 });
      }
      this.pose(f.h, f.a, f.dx, f.dz);
    }
    if (this.falling.length && this.falling.every((f) => f.landed)) this.falling.length = 0;
    for (const L of this.list) {
      for (const h of L.heads) {
        if (h.down) continue;
        const st = this.phase(L, h.group);
        const on = st === 'red' ? 0 : st === 'yellow' ? 1 : 2;
        for (let k = 0; k < 3; k++) this.lamps.setColorAt(h.lampIndex + k, k === on ? this.colors.on[k] : this.colors.off[k]);
      }
    }
    if (this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
  }

  // Distancia a la línea de frenado si el semáforo de adelante no está en verde
  stopAhead(v, a) {
    if (!a || a.stage !== 'run') return null;
    const e = a.edge;
    const L = this.byNode.get(nk(e.to.x, e.to.z));
    if (!L) return null;
    const arm = L.arms.get(e.street.id);
    // sin semáforo (lo voltearon): se pasa
    if (!arm || arm.down) return null;
    const st = this.phase(L, arm.group);
    if (st === 'green') return null;
    const lx = e.to.x - e.dx * (arm.wo / 2 + 3.9);
    const lz = e.to.z - e.dz * (arm.wo / 2 + 3.9);
    const d = (lx - v.x) * e.dx + (lz - v.z) * e.dz - v.L / 2;
    if (d < -0.5) return null;
    if (st === 'yellow' && d < 7) return null;
    return d < 35 ? d + 2.2 : null;
  }
}

// ---------- Carteles con el nombre de la calle ----------
function streetSigns(scene) {
  const names = [...new Set(ROADS.map((r) => r.name).filter(Boolean))];
  const rowH = 64;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = rowH * names.length;
  const g = c.getContext('2d');
  names.forEach((n, i) => {
    g.fillStyle = '#121416';
    g.fillRect(0, i * rowH, 1024, rowH);
    g.strokeStyle = '#f2f2f2';
    g.lineWidth = 4;
    g.strokeRect(6, i * rowH + 6, 1012, rowH - 12);
    g.fillStyle = '#f2f2f2';
    g.font = 'bold 38px "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(n.toUpperCase(), 512, i * rowH + rowH / 2 + 1, 980);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const pos = [];
  const uv = [];
  const idx = [];
  const blade = (cx, cy, cz, ux, uz, name) => {
    const row = names.indexOf(name);
    if (row < 0) return;
    const v0 = 1 - (row + 1) / names.length;
    const v1 = 1 - row / names.length;
    const w = 1.5;
    const h = 0.26;
    for (const side of [1, -1]) {
      const b = pos.length / 3;
      const ox = -uz * 0.012 * side;
      const oz = ux * 0.012 * side;
      const ax = cx - (ux * w * side) / 2 + ox;
      const az = cz - (uz * w * side) / 2 + oz;
      const bx = cx + (ux * w * side) / 2 + ox;
      const bz = cz + (uz * w * side) / 2 + oz;
      pos.push(ax, cy - h / 2, az, bx, cy - h / 2, bz, bx, cy + h / 2, bz, ax, cy + h / 2, az);
      uv.push(0, v0, 1, v0, 1, v1, 0, v1);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  };
  const F = new FastBoxes();
  for (const n of CORNERS) {
    const named = n.arms.filter((a) => a.road.name);
    if (named.length < 2) continue;
    const a = named[0];
    const b = named.find((x) => x.road.name !== a.road.name && Math.abs(x.dx * a.dx + x.dz * a.dz) < 0.8);
    if (!b) continue;
    const px = n.x + a.dx * (b.road.w / 2 + 1.3) + b.dx * (a.road.w / 2 + 1.3);
    const pz = n.z + a.dz * (b.road.w / 2 + 1.3) + b.dz * (a.road.w / 2 + 1.3);
    F.box(0.07, 2.9, 0.07, 0x3a3f44, px, 1.45, pz);
    blade(px - a.dx * 0.75, 2.75, pz - a.dz * 0.75, a.dx, a.dz, a.road.name);
    blade(px - b.dx * 0.75, 2.45, pz - b.dz * 0.75, b.dx, b.dz, b.road.name);
  }
  scene.add(F.mesh());
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex })));
}

// ---------- Paradas de colectivo ----------
function busStops(scene, rng) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#f2f2f2';
  g.fillRect(0, 0, 128, 192);
  g.fillStyle = '#0f5fa8';
  g.fillRect(0, 0, 128, 52);
  g.fillStyle = '#ffffff';
  g.font = 'bold 30px Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText('PARADA', 64, 36);
  // las líneas que paran en Temperley
  g.fillStyle = '#111';
  g.font = 'bold 30px Arial, sans-serif';
  ['160', '74', '548', '549', '318', '266'].forEach((n, i) => g.fillText(n, i % 2 ? 94 : 36, 88 + Math.floor(i / 2) * 36));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const F = new FastBoxes();
  const signs = [];
  for (const [sx, sz] of D.stops) {
    const nr = nearestRoad(sx, sz);
    if (!nr || nr.dist > 25) continue;
    // sobre la vereda más cercana, al costado de la calle
    const side = (sx - nr.x) * -nr.dz + (sz - nr.z) * nr.dx > 0 ? 1 : -1;
    const off = nr.road.w / 2 + 0.6;
    const x = nr.x - nr.dz * off * side;
    const z = nr.z + nr.dx * off * side;
    F.box(0.08, 2.6, 0.08, 0x9aa0a4, x, 1.3, z);
    signs.push({ x, y: 2.35, z, rot: Math.atan2(nr.dx, nr.dz) + Math.PI / 2 });
    if (rng.chance(0.5)) {
      const ux = nr.dx;
      const uz = nr.dz;
      const nx = -uz * side;
      const nz = ux * side;
      const bx = x + ux * 2.2 + nx * 1.1;
      const bz = z + uz * 2.2 + nz * 1.1;
      const rot = Math.atan2(-uz, ux);
      F.rbox(3.2, 0.08, 1.3, 0x2d6e8a, bx, 2.45, bz, rot);
      F.rbox(3.2, 2.3, 0.06, 0x7fa9b8, bx + nx * 0.6, 1.25, bz + nz * 0.6, rot);
      F.rbox(2.6, 0.08, 0.4, 0x444444, bx + nx * 0.35, 0.6, bz + nz * 0.35, rot);
      for (const k of [-1.5, 1.5]) F.box(0.07, 2.4, 0.07, 0x555555, bx + ux * k - nx * 0.6, 1.25, bz + uz * k - nz * 0.6);
    }
  }
  scene.add(F.mesh());
  const geo = new THREE.PlaneGeometry(0.5, 0.75);
  const inst = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }), signs.length);
  signs.forEach((p, i) => place(inst, i, p.x, p.y, p.z, p.rot));
  scene.add(...fixed(140, inst));
}

// ---------- Canastos de basura elevados frente a las casas ----------
function basketTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#2a2d30';
  g.lineWidth = 4;
  for (let i = 0; i <= 64; i += 12) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 64);
    g.moveTo(0, i);
    g.lineTo(64, i);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function baskets(scene, city, rng) {
  const list = [];
  for (const b of D.buildings) {
    if (b.k !== 'casa' || !b.fr.length || !rng.chance(0.5)) continue;
    const e = outward(b.r, b.fr[0]);
    const d = (b.sb[0] ?? 0) + 2.4;
    const t = rng.range(0.25, 0.75);
    list.push([e.ax + (e.bx - e.ax) * t + e.nx * d, e.az + (e.bz - e.az) * t + e.nz * d, rng.chance(0.55)]);
  }
  const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1.05, 5), new THREE.MeshLambertMaterial({ color: 0x2a2d30 }), list.length);
  const box = new THREE.BoxGeometry(0.6, 0.35, 0.45);
  const basket = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ map: basketTexture(), alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide }), list.length);
  const full = list.filter((l) => l[2]);
  const bag = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshLambertMaterial({ color: 0x151618, flatShading: true }), full.length);
  let j = 0;
  list.forEach(([x, z, f], i) => {
    place(post, i, x, 0.15 + 0.52, z);
    place(basket, i, x, 0.15 + 1.2, z, rng.range(0, 0.3));
    if (f) place(bag, j++, x, 0.15 + 1.25, z, 0, 1.2, 0.9, 1);
  });
  post.castShadow = basket.castShadow = true;
  scene.add(...fixed(120, post, basket, bag));
}

// ---------- Contenedores verdes en las esquinas de las avenidas ----------
function containers(scene, city, rng) {
  const F = new FastBoxes();
  const placed = [];
  for (const c of city.curbSpots) {
    if (!c.road.avenue || placed.length > 18) continue;
    if (!CORNERS.some((n) => Math.hypot(n.x - c.x, n.z - c.z) < 18 && Math.hypot(n.x - c.x, n.z - c.z) > 9)) continue;
    if (placed.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 90) || !rng.chance(0.5)) continue;
    placed.push(c);
    const rot = Math.atan2(-Math.cos(c.heading), Math.sin(c.heading));
    F.rbox(1.8, 1.15, 1.1, 0x2f6b3a, c.x, 0.72, c.z, rot);
    F.rbox(1.86, 0.08, 1.16, 0x245530, c.x, 1.33, c.z, rot);
    F.rbox(1.82, 0.06, 1.12, 0xdcdcdc, c.x, 0.55, c.z, rot);
  }
  scene.add(F.mesh());
}

// ---------- Terrazas: antenas, parabólicas, hierros y ropa tendida ----------
function rooftops(scene, city, rng) {
  const antennas = [];
  const dishes = [];
  const rebar = [];
  const F = new FastBoxes();
  for (const bl of city.buildingList) {
    if (bl.kind === 'estacion' || bl.kind === 'estadio') continue;
    const ring = bl.ring;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const [x, z] of ring) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
    const b = { x0, x1, z0, z1, h: bl.h };
    const lot = { type: bl.kind, face: 'N' };
    const inside = (x, z) => pointInRing(x, z, ring);
    const y = b.h + 0.02;
    const rp = () => {
      for (let k = 0; k < 6; k++) {
        const x = b.x0 + 1 + rng.next() * Math.max(0, b.x1 - b.x0 - 2);
        const z = b.z0 + 1 + rng.next() * Math.max(0, b.z1 - b.z0 - 2);
        if (inside(x, z)) return [x, z];
      }
      return null;
    };
    let p;
    if (rng.chance(0.3) && (p = rp())) antennas.push([p[0], y, p[1], rng.range(0, Math.PI)]);
    if (rng.chance(0.35) && (p = rp())) dishes.push([p[0], y + 0.9, p[1], rng.range(0, Math.PI * 2)]);
    // casas "a terminar": columnas con hierros asomando
    if (lot.type === 'casa' && ring.length <= 6 && rng.chance(0.32)) {
      let mx = 0;
      let mz = 0;
      for (const [x, z] of ring) {
        mx += x;
        mz += z;
      }
      mx /= ring.length;
      mz /= ring.length;
      for (const [vx, vz] of ring) {
        const l = Math.hypot(mx - vx, mz - vz) || 1;
        const cx = vx + ((mx - vx) / l) * 0.25;
        const cz = vz + ((mz - vz) / l) * 0.25;
        F.box(0.3, 0.55, 0.3, 0x9c9a94, cx, y + 0.27, cz);
        rebar.push([cx, y + 0.55, cz]);
      }
    }
    // ropa tendida
    if (rng.chance(0.14) && inside((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2) && b.x1 - b.x0 > 5 && b.z1 - b.z0 > 5) {
      const alongX = b.x1 - b.x0 > b.z1 - b.z0;
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      const len = (alongX ? b.x1 - b.x0 : b.z1 - b.z0) - 2;
      for (const k of [-len / 2, len / 2]) F.box(0.05, 1.7, 0.05, 0x777777, alongX ? cx + k : cx, y + 0.85, alongX ? cz : cz + k);
      F.box(alongX ? len : 0.015, 0.015, alongX ? 0.015 : len, 0x222222, cx, y + 1.65, cz);
      const n = Math.floor(len / 0.8);
      for (let i = 0; i < n; i++) {
        if (rng.chance(0.3)) continue;
        const t = -len / 2 + 0.4 + i * 0.8;
        const col = [0xe53935, 0x1e88e5, 0xfdd835, 0xf5f5f5, 0x43a047, 0x6ec3ea, 0x8e24aa][rng.int(0, 6)];
        const h = rng.range(0.4, 0.8);
        F.box(alongX ? 0.6 : 0.02, h, alongX ? 0.02 : 0.6, col, alongX ? cx + t : cx, y + 1.62 - h / 2, alongX ? cz : cz + t);
      }
    }
  }
  scene.add(F.mesh());
  // antena de TV: mástil + travesaños
  const aParts = [new THREE.CylinderGeometry(0.025, 0.03, 2.6, 5).translate(0, 1.3, 0)];
  for (let k = 0; k < 4; k++) aParts.push(new THREE.CylinderGeometry(0.012, 0.012, 1.2 - k * 0.2, 4).rotateZ(Math.PI / 2).translate(0, 1.9 + k * 0.18, 0));
  const aGeo = mergeGeometries(aParts.map(ni));
  const ai = new THREE.InstancedMesh(aGeo, new THREE.MeshLambertMaterial({ color: 0x8a8f94 }), antennas.length);
  antennas.forEach(([x, y, z, r], i) => place(ai, i, x, y, z, r));
  // parabólica
  const dish = new THREE.SphereGeometry(0.42, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.32);
  dish.rotateX(-Math.PI / 2 - 0.4);
  const arm = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4).rotateX(Math.PI / 2 - 0.4).translate(0, 0.08, 0.25);
  const dGeo = mergeGeometries([ni(dish), ni(arm)]);
  const di = new THREE.InstancedMesh(dGeo, new THREE.MeshLambertMaterial({ color: 0xe8e8e8, side: THREE.DoubleSide }), dishes.length);
  dishes.forEach(([x, y, z, r], i) => place(di, i, x, y, z, r));
  // hierros
  const rParts = [];
  for (const [dx, dz] of [
    [-0.08, -0.08],
    [0.08, -0.08],
    [-0.08, 0.08],
    [0.08, 0.08],
  ]) rParts.push(ni(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 3).translate(dx, 0.45, dz).rotateZ(dx * 0.6)));
  const ri = new THREE.InstancedMesh(mergeGeometries(rParts), new THREE.MeshLambertMaterial({ color: 0x6b3b24 }), rebar.length);
  rebar.forEach(([x, y, z], i) => place(ri, i, x, y, z, rng.range(0, 1)));
  ai.castShadow = di.castShadow = true;
  scene.add(...fixed(160, ai, di, ri));
}

// ---------- Catenaria del Roca ----------
function catenary(scene) {
  const F = new FastBoxes();
  const wire = [];
  const H = 5.6;
  const done = new Set();
  for (const t of TRACKS) {
    let carry = 0;
    for (let i = 0; i < t.length - 1; i++) {
      const [ax, az] = t[i];
      const [bx, bz] = t[i + 1];
      wire.push(ax, H, az, bx, H, bz);
      const len = Math.hypot(bx - ax, bz - az);
      carry += len;
      if (carry > 45) {
        carry = 0;
        const key = `${Math.round(ax / 6)},${Math.round(az / 6)}`;
        if (done.has(key)) continue;
        done.add(key);
        // mástil al costado con ménsula sobre la vía
        const nx = (bz - az) / len;
        const nz = -(bx - ax) / len;
        const mx = ax + nx * 2.6;
        const mz = az + nz * 2.6;
        F.box(0.22, 6.8, 0.22, 0x5f6a70, mx, 3.4, mz);
        F.box(Math.abs(nx) > 0.5 ? 2.8 : 0.1, 0.1, Math.abs(nx) > 0.5 ? 0.1 : 2.8, 0x5f6a70, (mx + ax) / 2, 6.3, (mz + az) / 2);
      }
    }
  }
  scene.add(F.mesh());
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2a2a2a })));
}

// ---------- Sombras de contacto (manchas bajo gente y autos, como en los GTA viejos) ----------
export class BlobShadows {
  constructor(scene, max = 260) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(0.6, 'rgba(0,0,0,0.25)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.inst = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), max);
    this.inst.frustumCulled = false;
    this.inst.renderOrder = 1;
    this.max = max;
    scene.add(this.inst);
  }
  update(world, heightAt) {
    const { npcs, traffic, player } = world;
    let n = 0;
    const put = (x, z, sx, sz, rot, y) => {
      if (n >= this.max) return;
      place(this.inst, n++, x, (y ?? heightAt(x, z)) + 0.045, z, rot, sx, 1, sz);
    };
    const near = (x, z, r = 90) => Math.abs(x - player.x) < r && Math.abs(z - player.z) < r;
    if (!player.vehicle && !player.dead) put(player.x, player.z, 1.1, 1.1, 0);
    for (const nn of npcs.list) if (nn.knockT <= 0 && nn.mesh.visible && near(nn.x, nn.z)) put(nn.x, nn.z, 1, 1, 0);
    for (const v of traffic.all()) if (near(v.x, v.z)) put(v.x, v.z, v.W + 0.9, v.L + 0.8, v.heading, 0);
    if (player.vehicle) put(player.vehicle.x, player.vehicle.z, player.vehicle.W + 0.9, player.vehicle.L + 0.8, player.vehicle.heading, 0);
    // (los manifestantes de cortes y marchas están en npcs.list)
    this.inst.count = n;
    this.inst.instanceMatrix.needsUpdate = true;
  }
}

export function buildProps(scene, city) {
  const rng = new Rng(2024);
  streetSigns(scene);
  busStops(scene, rng);
  baskets(scene, city, rng);
  containers(scene, city, rng);
  rooftops(scene, city, rng);
  catenary(scene);
}
