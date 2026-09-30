// Construye la Temperley 3D: suelo, calles, veredas, casas con rejas, estación, vías y tendido.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  HALF,
  SIDEWALK,
  STREETS,
  TRACKS,
  ISLANDS,
  PLATFORM,
  STATION_TRACKS,
  YARD,
  buildBlocks,
  buildLots,
} from './map.js';
import {
  ATLAS,
  CELL_W,
  buildAtlas,
  asphaltTexture,
  sidewalkTexture,
  groundTexture,
  ballastTexture,
  textTexture,
} from './textures.js';
import { Colliders } from './physics.js';
import { Rng } from './rng.js';

const FLOOR_H = 3.1;

export function buildCity(scene) {
  const rng = new Rng(1400);
  const colliders = new Colliders();
  const blocks = buildBlocks();
  const lots = buildLots(blocks);
  const shopNames = [...new Set(lots.filter((l) => l.shop).map((l) => l.shop))];
  const atlas = buildAtlas(shopNames);
  const city = { colliders, blocks, lots, lamps: [], lampMats: [], parking: [], spots: {}, crossings: [] };

  addGround(scene);
  addStreets(scene, city);
  addSidewalks(scene, blocks);
  addBuildings(scene, lots, atlas, colliders, rng);
  addFences(scene, lots, colliders);
  addRoofProps(scene, lots, rng);
  addTracks(scene);
  addStation(scene, colliders, city);
  addPolesAndCables(scene, city, rng);
  addTrees(scene, blocks, lots, rng, colliders);
  addClutter(scene, blocks, rng);
  addBounds(colliders);
  return city;
}

// ---------- Suelo ----------
function addGround(scene) {
  const g = new THREE.PlaneGeometry(HALF * 2 + 400, HALF * 2 + 400);
  g.rotateX(-Math.PI / 2);
  const t = groundTexture();
  t.repeat.set(120, 120);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: t }));
  m.receiveShadow = true;
  scene.add(m);

  // Playa de vías (balasto)
  const bt = ballastTexture();
  bt.repeat.set((YARD.x1 - YARD.x0) / 4, (YARD.z1 - YARD.z0) / 4);
  const yg = new THREE.PlaneGeometry(YARD.x1 - YARD.x0, YARD.z1 - YARD.z0);
  yg.rotateX(-Math.PI / 2);
  yg.translate((YARD.x0 + YARD.x1) / 2, 0.01, (YARD.z0 + YARD.z1) / 2);
  const ym = new THREE.Mesh(yg, new THREE.MeshLambertMaterial({ map: bt }));
  ym.receiveShadow = true;
  scene.add(ym);
}

// ---------- Calles ----------
function addStreets(scene, city) {
  const asphalt = asphaltTexture();
  const geos = [];
  const lineGeos = [];
  for (const s of STREETS) {
    const len = s.b - s.a;
    const g = new THREE.PlaneGeometry(s.axis === 'ns' ? s.w : len + s.w, s.axis === 'ns' ? len + s.w : s.w);
    g.rotateX(-Math.PI / 2);
    // UV en metros para que el asfalto repita parejo
    const uv = g.attributes.uv;
    const pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 9, pos.getZ(i) / 9);
    if (s.axis === 'ns') g.translate(s.c, 0.02, (s.a + s.b) / 2);
    else g.translate((s.a + s.b) / 2, 0.02 + (s.avenue ? 0.001 : 0), s.c);
    geos.push(g);

    // Línea central discontinua en avenidas, borde amarillo junto al cordón en todas
    if (s.avenue) {
      for (let a = s.a + 12; a < s.b - 12; a += 7) {
        if (nearCross(s, a)) continue;
        const d = new THREE.PlaneGeometry(s.axis === 'ns' ? 0.18 : 3.5, s.axis === 'ns' ? 3.5 : 0.18);
        d.rotateX(-Math.PI / 2);
        if (s.axis === 'ns') d.translate(s.c, 0.035, a);
        else d.translate(a, 0.035, s.c);
        lineGeos.push(d);
      }
    }
  }
  const road = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ map: asphalt }));
  road.receiveShadow = true;
  scene.add(road);
  if (lineGeos.length) {
    const lines = new THREE.Mesh(mergeGeometries(lineGeos), new THREE.MeshBasicMaterial({ color: 0xe8e2cf }));
    scene.add(lines);
  }
  // Baches: manchas oscuras sobre el asfalto
  const rng = new Rng(55);
  const bache = new THREE.CircleGeometry(1, 10);
  bache.rotateX(-Math.PI / 2);
  const bm = new THREE.InstancedMesh(bache, new THREE.MeshLambertMaterial({ color: 0x2a2826 }), 140);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 140; i++) {
    const s = rng.pick(STREETS);
    const along = rng.range(s.a + 10, s.b - 10);
    const across = s.c + rng.range(-s.w / 2 + 1, s.w / 2 - 1);
    const x = s.axis === 'ns' ? across : along;
    const z = s.axis === 'ns' ? along : across;
    const sc = rng.range(0.5, 1.6);
    m4.makeScale(sc, 1, sc * rng.range(0.6, 1.2));
    m4.setPosition(x, 0.03 + i * 0.00001, z);
    bm.setMatrixAt(i, m4);
  }
  scene.add(bm);
}

function nearCross(s, a) {
  const others = s.axis === 'ns' ? STREETS.filter((o) => o.axis === 'ew') : STREETS.filter((o) => o.axis === 'ns');
  return others.some((o) => Math.abs(o.c - a) < o.w / 2 + 4 && s.c >= o.a && s.c <= o.b);
}

// ---------- Veredas ----------
function addSidewalks(scene, blocks) {
  const tex = sidewalkTexture();
  const geos = [];
  const curbGeos = [];
  const grassGeos = [];
  for (const b of blocks) {
    const w = b.x1 - b.x0;
    const d = b.z1 - b.z0;
    const g = new THREE.BoxGeometry(w, 0.15, d);
    const uv = g.attributes.uv;
    const pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + b.x0) / 1.3, (pos.getZ(i) + b.z0) / 1.3);
    g.translate(b.x0 + w / 2, 0.075, b.z0 + d / 2);
    geos.push(g);
    // cordón pintado de amarillo en las esquinas
    for (const [cx, cz] of [
      [b.x0, b.z0],
      [b.x1, b.z0],
      [b.x0, b.z1],
      [b.x1, b.z1],
    ]) {
      const c = new THREE.BoxGeometry(0.25, 0.17, 0.25);
      c.scale(1, 1, 1);
      const cg1 = new THREE.BoxGeometry(6, 0.16, 0.22);
      cg1.translate(cx + (cx === b.x0 ? 3 : -3), 0.08, cz + (cz === b.z0 ? 0.11 : -0.11));
      const cg2 = new THREE.BoxGeometry(0.22, 0.16, 6);
      cg2.translate(cx + (cx === b.x0 ? 0.11 : -0.11), 0.08, cz + (cz === b.z0 ? 3 : -3));
      curbGeos.push(cg1, cg2);
    }
    // pasto en el centro de manzana (fondos)
    const gw = w - SIDEWALK * 2 - 20;
    const gd = d - SIDEWALK * 2 - 20;
    if (gw > 4 && gd > 4) {
      const gg = new THREE.PlaneGeometry(gw, gd);
      gg.rotateX(-Math.PI / 2);
      gg.translate(b.x0 + w / 2, 0.16, b.z0 + d / 2);
      grassGeos.push(gg);
    }
  }
  const walk = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ map: tex }));
  walk.receiveShadow = true;
  scene.add(walk);
  scene.add(new THREE.Mesh(mergeGeometries(curbGeos), new THREE.MeshLambertMaterial({ color: 0xe0b82e })));
  const gt = groundTexture('#5f7040');
  gt.repeat.set(1, 1);
  const grass = new THREE.Mesh(mergeGeometries(grassGeos), new THREE.MeshLambertMaterial({ color: 0x6d7d45 }));
  grass.receiveShadow = true;
  scene.add(grass);
}

// ---------- Edificios ----------
// Cada pared se arma con quads por piso y por tramo de ~11 m, mapeados a una celda del atlas.
function pushQuad(arr, p0, p1, p2, p3, uv, shade) {
  // p0 abajo-izq, p1 abajo-der, p2 arriba-der, p3 arriba-izq
  const { pos, uvs, col, idx } = arr;
  const base = pos.length / 3;
  pos.push(...p0, ...p1, ...p2, ...p3);
  uvs.push(uv.u0, uv.v0, uv.u1, uv.v0, uv.u1, uv.v1, uv.u0, uv.v1);
  for (let i = 0; i < 4; i++) col.push(shade, shade, shade);
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function wall(arr, ax, az, bx, bz, y0, y1, pickUv, shade) {
  const len = Math.hypot(bx - ax, bz - az);
  const segs = Math.max(1, Math.round(len / 11));
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
      pushQuad(arr, [x0, y, z0], [x1, y, z1], [x1, yy, z1], [x0, yy, z0], pickUv(floor, s), shade);
    }
  }
}

function addBuildings(scene, lots, atlas, colliders, rng) {
  const arr = { pos: [], uvs: [], col: [], idx: [] };
  const roofArr = { pos: [], col: [], idx: [] };
  const tejas = [];
  const white = { u0: 0, u1: 0.001, v0: 0, v1: 0.001 };
  for (const lot of lots) {
    if (lot.type === 'baldio') {
      lot.building = null;
      continue;
    }
    // footprint: casas con retiro dejan jardín delantero con reja
    let { x0, x1, z0, z1 } = lot;
    const sb = lot.setback;
    if (lot.face === 'N') z0 += sb;
    if (lot.face === 'S') z1 -= sb;
    if (lot.face === 'W') x0 += sb;
    if (lot.face === 'E') x1 -= sb;
    // separación mínima entre lotes para que no titilen las medianeras
    const inset = 0.08;
    x0 += inset;
    x1 -= inset;
    z0 += inset;
    z1 -= inset;
    const h = lot.floors * FLOOR_H + (lot.type === 'edificio' ? 0.4 : 0.3);
    lot.building = { x0, x1, z0, z1, h };
    colliders.add({ x0, z0, x1, z1, kind: 'building', h });

    const shade = 0.85 + rng.next() * 0.2;
    const v = lot.variant;
    const front = (floor) => {
      if (lot.type === 'local') return floor === 0 ? ATLAS.local[lot.shop] : ATLAS.alto[(v + floor) % ATLAS.alto.length];
      if (lot.type === 'edificio') return floor === 0 ? ATLAS.entrada[v % ATLAS.entrada.length] : ATLAS.edificio[(v + floor) % ATLAS.edificio.length];
      if (lot.type === 'obra') return ATLAS.ladrillo[0];
      return floor === 0 ? ATLAS.casa[v % ATLAS.casa.length] : ATLAS.alto[(v + floor) % ATLAS.alto.length];
    };
    const side = (floor, seg) => {
      if (lot.type === 'obra') return ATLAS.ladrillo[0];
      if ((v + seg) % 9 === 0) return ATLAS.pintada[(v + floor) % ATLAS.pintada.length];
      return ATLAS.medianera[(v + seg + floor) % ATLAS.medianera.length];
    };
    // Paredes en sentido antihorario visto desde arriba, con la fachada hacia la calle.
    const N = [x1, z0, x0, z0];
    const S = [x0, z1, x1, z1];
    const W = [x0, z0, x0, z1];
    const E = [x1, z1, x1, z0];
    const walls = { N, S, W, E };
    for (const f of ['N', 'S', 'W', 'E']) {
      const [ax, az, bx, bz] = walls[f];
      wall(arr, ax, az, bx, bz, 0, h, f === lot.face ? front : side, f === lot.face ? shade : shade * 0.9);
    }
    // techo
    const rc = lot.type === 'obra' ? 0.55 : 0.62 + rng.next() * 0.15;
    if (lot.pitched) {
      tejas.push({ x0, x1, z0, z1, h, face: lot.face });
    } else {
      const base = roofArr.pos.length / 3;
      roofArr.pos.push(x0, h, z0, x1, h, z0, x1, h, z1, x0, h, z1);
      for (let i = 0; i < 4; i++) roofArr.col.push(rc, rc * 0.98, rc * 0.95);
      roofArr.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(arr.uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(arr.col, 3));
  g.setIndex(arr.idx);
  g.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true, side: THREE.FrontSide });
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(roofArr.pos, 3));
  rg.setAttribute('color', new THREE.Float32BufferAttribute(roofArr.col, 3));
  rg.setIndex(roofArr.idx);
  rg.computeVertexNormals();
  const roofs = new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ vertexColors: true }));
  roofs.receiveShadow = true;
  scene.add(roofs);

  // techos de tejas a dos aguas
  const tg = [];
  for (const t of tejas) {
    const w = t.x1 - t.x0;
    const d = t.z1 - t.z0;
    const alongX = t.face === 'N' || t.face === 'S';
    const shape = new THREE.Shape();
    const span = alongX ? d : w;
    shape.moveTo(-span / 2 - 0.3, 0);
    shape.lineTo(span / 2 + 0.3, 0);
    shape.lineTo(0, 1.8);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: alongX ? w : d, bevelEnabled: false });
    if (alongX) {
      geo.rotateY(Math.PI / 2);
      geo.translate(t.x0, t.h, t.z0 + d / 2);
    } else {
      geo.translate(t.x0 + w / 2, t.h, t.z0);
    }
    tg.push(geo);
  }
  if (tg.length) {
    const m = new THREE.Mesh(mergeGeometries(tg), new THREE.MeshLambertMaterial({ color: 0xa4452c }));
    m.castShadow = true;
    scene.add(m);
  }
  void white;
  void CELL_W;
}

// ---------- Rejas delanteras ----------
// Cada reja es un quad con textura calada (alphaTest): se ve como barrotes y cuesta 2 triángulos.
function rejaTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 128);
  g.fillStyle = '#1d1d1f';
  for (let x = 2; x < 256; x += 14) {
    g.fillRect(x, 10, 4, 118);
    // punta de lanza
    g.beginPath();
    g.moveTo(x - 2, 12);
    g.lineTo(x + 2, 2);
    g.lineTo(x + 6, 12);
    g.fill();
  }
  g.fillRect(0, 14, 256, 5);
  g.fillRect(0, 70, 256, 4);
  g.fillRect(0, 122, 256, 6);
  // rulos de herrería entre las barras de arriba
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

function addFences(scene, lots, colliders) {
  const pos = [];
  const uv = [];
  const idx = [];
  const walls = [];
  const quad = (ax, az, bx, bz, y0, y1) => {
    const len = Math.hypot(bx - ax, bz - az);
    const b = pos.length / 3;
    pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
    const u = len / 1.8;
    uv.push(0, 0, u, 0, u, 1, 0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  for (const lot of lots) {
    if (!lot.fence) continue;
    const { x0, x1, z0, z1, face } = lot;
    let ax, az, bx, bz;
    if (face === 'N') [ax, az, bx, bz] = [x0 + 0.1, z0 + 0.1, x1 - 0.1, z0 + 0.1];
    if (face === 'S') [ax, az, bx, bz] = [x0 + 0.1, z1 - 0.1, x1 - 0.1, z1 - 0.1];
    if (face === 'W') [ax, az, bx, bz] = [x0 + 0.1, z0 + 0.1, x0 + 0.1, z1 - 0.1];
    if (face === 'E') [ax, az, bx, bz] = [x1 - 0.1, z0 + 0.1, x1 - 0.1, z1 - 0.1];
    const len = Math.hypot(bx - ax, bz - az);
    const gateAt = 0.25 + (lot.variant % 50) / 100; // portón en algún lugar del frente
    const gateW = 1.2 / len;
    const h = 1.7 + (lot.variant % 3) * 0.2;
    walls.push([ax, az, bx, bz]);
    const t0 = gateAt - gateW / 2;
    const t1 = gateAt + gateW / 2;
    for (const [s, e] of [
      [0, t0],
      [t1, 1],
    ]) {
      const sx = ax + (bx - ax) * s;
      const sz = az + (bz - az) * s;
      const ex = ax + (bx - ax) * e;
      const ez = az + (bz - az) * e;
      quad(sx, sz, ex, ez, 0.62, 0.15 + h);
      colliders.add({ x0: Math.min(sx, ex) - 0.08, x1: Math.max(sx, ex) + 0.08, z0: Math.min(sz, ez) - 0.08, z1: Math.max(sz, ez) + 0.08, kind: 'fence', h });
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const rejas = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: rejaTexture(), alphaTest: 0.5, side: THREE.DoubleSide }));
  scene.add(rejas);
  const wg = [];
  for (const [ax, az, bx, bz] of walls) {
    const len = Math.hypot(bx - ax, bz - az);
    const ang = Math.atan2(bz - az, bx - ax);
    const b = new THREE.BoxGeometry(len, 0.5, 0.22);
    b.rotateY(-ang);
    b.translate((ax + bx) / 2, 0.4, (az + bz) / 2);
    wg.push(b);
  }
  if (wg.length) {
    const wm = new THREE.Mesh(mergeGeometries(wg), new THREE.MeshLambertMaterial({ color: 0xd8cfbd }));
    wm.castShadow = true;
    wm.receiveShadow = true;
    scene.add(wm);
  }
}

// ---------- Tanques de agua en las terrazas ----------
function addRoofProps(scene, lots, rng) {
  const withTank = lots.filter((l) => l.tank && l.building && !l.pitched);
  const g = new THREE.CylinderGeometry(0.7, 0.7, 1.4, 12);
  const inst = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0x1f2426 }), withTank.length);
  const m4 = new THREE.Matrix4();
  withTank.forEach((l, i) => {
    const b = l.building;
    m4.makeTranslation(b.x0 + 1.2 + rng.next() * (b.x1 - b.x0 - 2.4), b.h + 0.7 + 0.5, b.z0 + 1.2 + rng.next() * (b.z1 - b.z0 - 2.4));
    inst.setMatrixAt(i, m4);
  });
  inst.castShadow = true;
  scene.add(inst);
  // base de ladrillo del tanque
  const bg = new THREE.BoxGeometry(1.5, 0.5, 1.5);
  const binst = new THREE.InstancedMesh(bg, new THREE.MeshLambertMaterial({ color: 0x9e5a3c }), withTank.length);
  const tmp = new THREE.Matrix4();
  withTank.forEach((l, i) => {
    inst.getMatrixAt(i, tmp);
    const p = new THREE.Vector3().setFromMatrixPosition(tmp);
    m4.makeTranslation(p.x, p.y - 0.95, p.z);
    binst.setMatrixAt(i, m4);
  });
  scene.add(binst);
}

// ---------- Vías ----------
function addTracks(scene) {
  const sleepers = [];
  const railGeos = [];
  const ballast = [];
  for (const t of TRACKS) {
    let carry = 0;
    for (let i = 0; i < t.length - 1; i++) {
      const [ax, az] = t[i];
      const [bx, bz] = t[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      const ang = Math.atan2(bx - ax, bz - az);
      const nx = Math.cos(ang);
      const nz = -Math.sin(ang);
      for (const off of [-0.84, 0.84]) {
        const g = new THREE.BoxGeometry(0.09, 0.16, len + 0.02);
        g.rotateY(ang);
        g.translate((ax + bx) / 2 + nx * off, 0.3, (az + bz) / 2 + nz * off);
        railGeos.push(g);
      }
      const bg = new THREE.BoxGeometry(3.4, 0.12, len + 0.05);
      bg.rotateY(ang);
      bg.translate((ax + bx) / 2, 0.06, (az + bz) / 2);
      ballast.push(bg);
      for (let d = carry; d < len; d += 0.75) {
        sleepers.push([ax + ((bx - ax) * d) / len, az + ((bz - az) * d) / len, ang]);
      }
      carry = 0.75 - ((len - carry) % 0.75);
    }
  }
  scene.add(new THREE.Mesh(mergeGeometries(ballast), new THREE.MeshLambertMaterial({ color: 0x5d564e })));
  const rails = new THREE.Mesh(mergeGeometries(railGeos), new THREE.MeshLambertMaterial({ color: 0x8b8680 }));
  scene.add(rails);
  const sg = new THREE.BoxGeometry(2.4, 0.12, 0.24);
  const inst = new THREE.InstancedMesh(sg, new THREE.MeshLambertMaterial({ color: 0x4a3b2c }), sleepers.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  sleepers.forEach(([x, z, a], i) => {
    q.setFromAxisAngle(up, a);
    m4.compose(new THREE.Vector3(x, 0.17, z), q, one);
    inst.setMatrixAt(i, m4);
  });
  scene.add(inst);
}

// ---------- Estación Temperley ----------
function addStation(scene, colliders, city) {
  const group = new THREE.Group();
  const concrete = new THREE.MeshLambertMaterial({ color: 0xb9b2a4 });
  const edge = new THREE.MeshLambertMaterial({ color: 0xe8c43a });
  const steel = new THREE.MeshLambertMaterial({ color: 0x3f5563 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x8a9399, side: THREE.DoubleSide });
  const brick = new THREE.MeshLambertMaterial({ color: 0xa3563b });
  const cream = new THREE.MeshLambertMaterial({ color: 0xe7dcc3 });

  // Andenes (10 bordes: 5 islas con vía a cada lado)
  for (const x of ISLANDS) {
    const len = PLATFORM.z1 - PLATFORM.z0;
    const p = new THREE.Mesh(new THREE.BoxGeometry(PLATFORM.halfW * 2, PLATFORM.h, len), concrete);
    p.position.set(x, PLATFORM.h / 2, (PLATFORM.z0 + PLATFORM.z1) / 2);
    p.receiveShadow = true;
    group.add(p);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, len), edge);
      e.position.set(x + s * (PLATFORM.halfW - 0.25), PLATFORM.h + 0.01, (PLATFORM.z0 + PLATFORM.z1) / 2);
      group.add(e);
    }
    // techo de andén: columnas y chapa
    for (let z = -55; z <= 45; z += 10) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.4, 0.25), steel);
      c.position.set(x, PLATFORM.h + 1.7, z);
      c.castShadow = true;
      group.add(c);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(PLATFORM.halfW * 2 + 1.2, 0.12, 110), roofMat);
    roof.position.set(x, PLATFORM.h + 3.45, -5);
    roof.castShadow = true;
    group.add(roof);
    // cartel con número de andén
    STATION_TRACKS.forEach((tx, i) => {
      if (Math.abs(tx - x) > 6) return;
      const side = tx < x ? -1 : 1;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: textTexture(`${i + 1}`, { w: 128, h: 64, bg: '#1b3f8b', fg: '#ffffff', font: 44 }) }));
      sign.position.set(x + side * 1.2, PLATFORM.h + 2.8, -20);
      sign.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(sign);
    });
    // bancos
    for (let z = -40; z <= 30; z += 35) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 2), new THREE.MeshLambertMaterial({ color: 0x5a3b28 }));
      b.position.set(x, PLATFORM.h + 0.25, z);
      group.add(b);
    }
  }

  // Edificio histórico del Ferrocarril del Sud, sobre Av. Meeks
  const bx = -63;
  const main = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 64), brick);
  main.position.set(bx, 3.5, 0);
  main.castShadow = true;
  main.receiveShadow = true;
  group.add(main);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(12.3, 0.5, 64.3), cream);
  trim.position.set(bx, 7.1, 0);
  group.add(trim);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-6.8, 0);
  roofShape.lineTo(6.8, 0);
  roofShape.lineTo(0, 3.2);
  roofShape.closePath();
  const rg = new THREE.ExtrudeGeometry(roofShape, { depth: 65, bevelEnabled: false });
  rg.translate(0, 0, -32.5);
  const rmesh = new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ color: 0x4d5a60 }));
  rmesh.position.set(bx, 7.3, 0);
  rmesh.castShadow = true;
  group.add(rmesh);
  // ventanas y puertas en arco (pintadas en crema)
  for (let z = -28; z <= 28; z += 5) {
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3), new THREE.MeshLambertMaterial({ color: Math.abs(z) < 4 ? 0x2a2f33 : 0x31414c }));
      w.position.set(bx + side * 6.01, 2.4, z);
      w.rotation.y = side * Math.PI / 2;
      group.add(w);
      const a = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.35), cream);
      a.position.set(bx + side * 6.02, 4.1, z);
      a.rotation.y = side * Math.PI / 2;
      group.add(a);
    }
  }
  // cartel TEMPERLEY
  const signTex = textTexture('TEMPERLEY', { w: 1024, h: 160, bg: '#10306e', fg: '#ffffff', font: 110, border: '#ffffff' });
  for (const side of [-1, 1]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.2), new THREE.MeshBasicMaterial({ map: signTex }));
    sign.position.set(bx + side * 6.3, 5.6, 0);
    sign.rotation.y = side * Math.PI / 2;
    group.add(sign);
  }
  colliders.add({ x0: bx - 6, x1: bx + 6, z0: -32, z1: 32, kind: 'building', h: 10 });
  city.spots.stationDoor = { x: bx - 8.5, z: 0 };
  city.spots.stationInside = { x: bx + 9, z: 0 };

  // Puente peatonal hacia Fray Justo Sta. María de Oro
  const bridgeZ = 52;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(128, 0.4, 3.2), concrete);
  deck.position.set(4, 7.2, bridgeZ);
  deck.castShadow = true;
  group.add(deck);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(128, 1.1, 0.08), steel);
    rail.position.set(4, 7.95, bridgeZ + side * 1.55);
    group.add(rail);
  }
  const bridgeRoof = new THREE.Mesh(new THREE.BoxGeometry(128, 0.1, 3.8), roofMat);
  bridgeRoof.position.set(4, 10.1, bridgeZ);
  group.add(bridgeRoof);
  for (const x of [-58, ...ISLANDS, 66]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.2, 0.5), steel);
    col.position.set(x, 3.6, bridgeZ);
    group.add(col);
    if (ISLANDS.includes(x)) {
      // escalera bajando al andén
      const st = new THREE.Mesh(new THREE.BoxGeometry(2, 0.3, 11), concrete);
      st.position.set(x + 1.6, 4.2, bridgeZ - 6);
      st.rotation.x = Math.atan2(6.1, 11);
      group.add(st);
    }
  }

  // Estacionamiento del lado este (zona de trapitos) y parada de colectivos
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(18, 120), new THREE.MeshLambertMaterial({ color: 0x55565a }));
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(62, 0.03, -20);
  group.add(lot);
  for (let z = -76; z <= 36; z += 5) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.12), new THREE.MeshBasicMaterial({ color: 0xdedede }));
    l.rotation.x = -Math.PI / 2;
    l.position.set(66, 0.04, z);
    group.add(l);
    city.parking.push({ x: 66, z: z + 2.5, heading: -Math.PI / 2 });
  }
  // alambrado entre estacionamiento y vías
  colliders.add({ x0: 52.6, x1: 53, z0: -100, z1: 44, kind: 'fence', h: 2 });
  const wire = new THREE.Mesh(new THREE.PlaneGeometry(144, 2), new THREE.MeshLambertMaterial({ color: 0x777d80, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
  wire.rotation.y = Math.PI / 2;
  wire.position.set(52.8, 1, -28);
  group.add(wire);

  // Carrito de panchos en la vereda de la estación
  const cart = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 2.4), new THREE.MeshLambertMaterial({ color: 0xd32f2f }));
  body.position.y = 0.85;
  cart.add(body);
  const umbrella = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.7, 8), new THREE.MeshLambertMaterial({ color: 0xffeb3b }));
  umbrella.position.y = 2.7;
  cart.add(umbrella);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3), steel);
  pole.position.y = 1.4;
  cart.add(pole);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.5), new THREE.MeshBasicMaterial({ map: textTexture('PANCHOS · SUPERPANCHOS', { w: 512, h: 96, bg: '#ffeb3b', fg: '#c62828', font: 40 }) }));
  sign.position.set(-0.71, 1.1, 0);
  sign.rotation.y = -Math.PI / 2;
  cart.add(sign);
  cart.position.set(-71.2, 0.15, 14);
  group.add(cart);
  colliders.add({ x0: -72, x1: -70.4, z0: 12.8, z1: 15.2, kind: 'prop', h: 1.5 });
  city.spots.pancho = { x: -72.6, z: 14 };

  scene.add(group);
}

// ---------- Postes de luz, cables y zapatillas colgadas ----------
function addPolesAndCables(scene, city, rng) {
  const poles = [];
  for (const s of STREETS) {
    const side = s.w / 2 + 0.6;
    for (let a = s.a + 15; a < s.b - 5; a += 32) {
      if (s.axis === 'ew' && a > YARD.x0 && a < YARD.x1) continue;
      if (s.axis === 'ns' && a < YARD.z1 && Math.abs(s.c) < 70) continue;
      const x = s.axis === 'ns' ? s.c + side : a;
      const z = s.axis === 'ns' ? a : s.c + side;
      poles.push({ x, z, s, a });
    }
  }
  const pg = new THREE.CylinderGeometry(0.12, 0.16, 8.5, 6);
  const wood = new THREE.MeshLambertMaterial({ color: 0x5b4636 });
  const inst = new THREE.InstancedMesh(pg, wood, poles.length);
  const m4 = new THREE.Matrix4();
  poles.forEach((p, i) => {
    m4.makeTranslation(p.x, 4.25, p.z);
    inst.setMatrixAt(i, m4);
  });
  inst.castShadow = true;
  scene.add(inst);

  // lámparas de sodio (brazo + foco) — se encienden de noche
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x3a3226 });
  const lg = new THREE.BoxGeometry(0.5, 0.18, 0.9);
  const linst = new THREE.InstancedMesh(lg, lampMat, poles.length);
  poles.forEach((p, i) => {
    const toward = p.s.axis === 'ns' ? [-1.4, 0] : [0, -1.4];
    m4.makeTranslation(p.x + toward[0], 7.9, p.z + toward[1]);
    linst.setMatrixAt(i, m4);
    city.lamps.push({ x: p.x + toward[0], z: p.z + toward[1] });
  });
  scene.add(linst);
  city.lampMats.push(lampMat);
  // charcos de luz de sodio en el piso (se ven de noche)
  const poolGeo = new THREE.CircleGeometry(6.5, 20);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({ color: 0xffa640, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, city.lamps.length);
  city.lamps.forEach((l, i) => {
    m4.makeTranslation(l.x, 0.21, l.z);
    pools.setMatrixAt(i, m4);
  });
  pools.visible = false;
  scene.add(pools);
  city.lampPools = pools;

  // Cables colgando entre postes (catenaria simple con segmentos)
  const pts = [];
  const byStreet = new Map();
  for (const p of poles) {
    const k = `${p.s.name}|${p.s.a}`;
    if (!byStreet.has(k)) byStreet.set(k, []);
    byStreet.get(k).push(p);
  }
  const shoes = [];
  for (const list of byStreet.values()) {
    list.sort((a, b) => a.a - b.a);
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      if (Math.hypot(a.x - b.x, a.z - b.z) > 40) continue;
      for (const [h, sag] of [
        [8.2, 0.9],
        [7.6, 1.3],
        [7.0, 1.1],
      ]) {
        const n = 10;
        for (let k = 0; k < n; k++) {
          const t0 = k / n;
          const t1 = (k + 1) / n;
          const y0 = h - sag * 4 * t0 * (1 - t0);
          const y1 = h - sag * 4 * t1 * (1 - t1);
          pts.push(a.x + (b.x - a.x) * t0, y0, a.z + (b.z - a.z) * t0, a.x + (b.x - a.x) * t1, y1, a.z + (b.z - a.z) * t1);
        }
      }
      if (rng.chance(0.06)) shoes.push([(a.x + b.x) / 2, 6.9 - 1.1, (a.z + b.z) / 2]);
    }
    // cables cruzando la calle hacia las casas
    for (const p of list) {
      if (!rng.chance(0.5)) continue;
      const across = p.s.w + 1.2;
      const tx = p.s.axis === 'ns' ? p.x - across : p.x + rng.range(-6, 6);
      const tz = p.s.axis === 'ns' ? p.z + rng.range(-6, 6) : p.z - across;
      pts.push(p.x, 7.4, p.z, (p.x + tx) / 2, 6.6, (p.z + tz) / 2, (p.x + tx) / 2, 6.6, (p.z + tz) / 2, tx, 5.2, tz);
    }
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0x151515 })));

  // Zapatillas colgadas de los cables
  const shoeGeo = new THREE.BoxGeometry(0.14, 0.12, 0.3);
  const sm = new THREE.InstancedMesh(shoeGeo, new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }), shoes.length * 2);
  shoes.forEach(([x, y, z], i) => {
    m4.makeTranslation(x - 0.12, y, z);
    sm.setMatrixAt(i * 2, m4);
    m4.makeTranslation(x + 0.12, y - 0.1, z);
    sm.setMatrixAt(i * 2 + 1, m4);
    pts.push(x - 0.12, y, z, x - 0.12, y + 0.5, z);
  });
  scene.add(sm);
}

// ---------- Árboles de vereda ----------
function addTrees(scene, blocks, lots, rng, colliders) {
  const trees = [];
  for (const b of blocks) {
    const perim = [
      [b.x0 + 1, b.z0 + 1, b.x1 - 1, b.z0 + 1],
      [b.x0 + 1, b.z1 - 1, b.x1 - 1, b.z1 - 1],
      [b.x0 + 1, b.z0 + 1, b.x0 + 1, b.z1 - 1],
      [b.x1 - 1, b.z0 + 1, b.x1 - 1, b.z1 - 1],
    ];
    for (const [ax, az, bx, bz] of perim) {
      const len = Math.hypot(bx - ax, bz - az);
      for (let d = 9; d < len - 9; d += rng.range(9, 22)) {
        if (rng.chance(0.35)) continue;
        trees.push([ax + ((bx - ax) * d) / len, az + ((bz - az) * d) / len, rng.range(0.8, 1.3)]);
      }
    }
  }
  const trunk = new THREE.CylinderGeometry(0.15, 0.22, 3, 6);
  const crown = new THREE.IcosahedronGeometry(2.2, 0);
  const ti = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x5a4a3a }), trees.length);
  const ci = new THREE.InstancedMesh(crown, new THREE.MeshLambertMaterial({ color: 0x4f7a34, flatShading: true }), trees.length);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  trees.forEach(([x, z, s], i) => {
    m4.makeScale(s, s, s);
    m4.setPosition(x, 0.15 + 1.5 * s, z);
    ti.setMatrixAt(i, m4);
    m4.makeScale(s, s * 0.9, s);
    m4.setPosition(x, 0.15 + 4 * s, z);
    ci.setMatrixAt(i, m4);
    col.setHSL(0.24 + rng.range(-0.04, 0.04), 0.45, 0.3 + rng.range(-0.05, 0.08));
    ci.setColorAt(i, col);
    colliders.add({ x0: x - 0.25, x1: x + 0.25, z0: z - 0.25, z1: z + 0.25, kind: 'tree', h: 3 });
  });
  ti.castShadow = true;
  ci.castShadow = true;
  scene.add(ti, ci);
}

// ---------- Bolsas de basura, contenedores, perros de cemento... ----------
function addClutter(scene, blocks, rng) {
  const bags = [];
  for (const b of blocks) {
    const n = rng.int(0, 3);
    for (let i = 0; i < n; i++) {
      const side = rng.int(0, 3);
      const x = side < 2 ? rng.range(b.x0 + 3, b.x1 - 3) : side === 2 ? b.x0 + 0.7 : b.x1 - 0.7;
      const z = side >= 2 ? rng.range(b.z0 + 3, b.z1 - 3) : side === 0 ? b.z0 + 0.7 : b.z1 - 0.7;
      for (let k = 0; k < rng.int(2, 6); k++) bags.push([x + rng.range(-0.8, 0.8), z + rng.range(-0.8, 0.8), rng.range(0.3, 0.5)]);
    }
  }
  const g = new THREE.IcosahedronGeometry(1, 0);
  const inst = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0x1b1c1e, flatShading: true }), bags.length);
  const m4 = new THREE.Matrix4();
  bags.forEach(([x, z, s], i) => {
    m4.makeScale(s, s * 0.8, s);
    m4.setPosition(x, 0.15 + s * 0.6, z);
    inst.setMatrixAt(i, m4);
  });
  scene.add(inst);
}

function addBounds(colliders) {
  const t = 5;
  colliders.add({ x0: -HALF - t, x1: HALF + t, z0: -HALF - t, z1: -HALF, kind: 'bound', h: 99 });
  colliders.add({ x0: -HALF - t, x1: HALF + t, z0: HALF, z1: HALF + t, kind: 'bound', h: 99 });
  colliders.add({ x0: -HALF - t, x1: -HALF, z0: -HALF, z1: HALF, kind: 'bound', h: 99 });
  colliders.add({ x0: HALF, x1: HALF + t, z0: -HALF, z1: HALF, kind: 'bound', h: 99 });
}
