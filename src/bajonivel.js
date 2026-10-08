// El bajo nivel de Temperley (Paso bajo nivel Manuel Belgrano): la calzada de las dos manos, que baja
// en rampa (DEPTH en src/bajo-geo.js: 10 m) para pasar por abajo de las vías y vuelve a subir; paredes de hormigón con baranda,
// el techo del túnel abajo de las vías, y los puentes de las calles que la cruzan por arriba (García del
// Río, 9 de Julio). La geometría está en src/bajo-geo.js; acá se arma lo que se ve y lo que choca.
// - El piso de la ciudad (manzanas, veredas, plazas) se recorta con una máscara donde pasa la avenida
//   (`cutGround`), y la calzada es una cinta nueva que sigue la rampa.
// - `vehicleY`: altura de un auto (en la trinchera o arriba de un puente, según dónde venía).
// - Los colisionadores de arriba (alambrados, postes) que quedan sobre la trinchera se marcan `over`:
//   los que van por abajo no los chocan (`markOver`).
import * as THREE from 'three';
import { FastBoxes } from './builder.js';
import { ROADS, TRACKS, PLATFORMS, distToPolyline } from './map.js';
import { W, LANES, AXIS, BOX, sOf, depthAt, corridorY } from './bajo-geo.js';
import { walkwayHeight, roofWalkway } from './physics.js';
import { freeAfterUpload } from './textures.js';

export const BAJO = {
  walk: [], // los puentes (para elegir entre el puente y la trinchera)
  uniforms: { bajoMask: { value: null }, bajoBox: { value: new THREE.Vector4(BOX.x0, BOX.z0, BOX.x1 - BOX.x0, BOX.z1 - BOX.z0) } },
};
const ROOF = 21; // medio largo del techo del túnel (abajo de las vías)
const angOf = (ux, uz) => Math.atan2(-uz, ux);

// altura de un auto (y: la que traía; los puentes valen si está a su altura)
export function vehicleY(x, z, y = 0) {
  if (x < BOX.x0 || x > BOX.x1 || z < BOX.z0 || z > BOX.z1) return 0;
  const g = corridorY(x, z, 0.8);
  if (g === null) return 0;
  const w = walkwayHeight(BAJO.walk, x, z, y + 0.02);
  return Math.max(g, w) - 0.02;
}

// recorta un material del piso donde pasa la avenida (descarta los fragmentos según la máscara)
export function cutGround(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.bajoMask = BAJO.uniforms.bajoMask;
    sh.uniforms.bajoBox = BAJO.uniforms.bajoBox;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vBajoXZ;').replace('#include <project_vertex>', '#include <project_vertex>\nvBajoXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBajoXZ;\nuniform sampler2D bajoMask;\nuniform vec4 bajoBox;')
      .replace('void main() {', 'void main() {\n  { vec2 bq = (vBajoXZ - bajoBox.xy) / bajoBox.zw; if (bq.x > 0.0 && bq.y > 0.0 && bq.x < 1.0 && bq.y < 1.0 && texture2D(bajoMask, bq).r > 0.5) discard; }');
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => key() + '|bajo';
  return mat;
}

// muestras cada `step` metros a lo largo de una mano: posición, dirección y altura de la calzada
function samples(L, step = 2) {
  const out = [];
  for (let i = 0; i < L.length - 1; i++) {
    const [ax, az] = L[i];
    const [bx, bz] = L[i + 1];
    const l = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / l;
    const uz = (bz - az) / l;
    const n = Math.max(1, Math.ceil(l / step));
    for (let k = i ? 1 : 0; k <= n; k++) {
      const x = ax + ux * ((l * k) / n);
      const z = az + uz * ((l * k) / n);
      out.push({ x, z, ux, uz, d: depthAt(sOf(x, z)) });
    }
  }
  // en los quiebres, la dirección promedio (para que la cinta no se pellizque)
  for (let i = 1; i < out.length - 1; i++) {
    const a = out[i - 1];
    const b = out[i + 1];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    out[i].nx = -(b.z - a.z) / l;
    out[i].nz = (b.x - a.x) / l;
  }
  out[0].nx = -out[0].uz;
  out[0].nz = out[0].ux;
  const last = out[out.length - 1];
  last.nx = -last.uz;
  last.nz = last.ux;
  return out;
}

// cinta entre dos desplazamientos laterales (o0, o1), a la altura de la calzada + yOff
function ribbon(S, o0, o1, yOff, uvScale = 0, keep = () => true) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i];
    const b = S[i + 1];
    if (!keep(a, b)) continue;
    const base = pos.length / 3;
    for (const p of [a, b]) {
      for (const o of [o0, o1]) {
        const x = p.x + p.nx * o;
        const z = p.z + p.nz * o;
        pos.push(x, 0.025 + p.d + yOff, z);
        uv.push(uvScale ? x / uvScale : 0, uvScale ? z / uvScale : 0);
      }
    }
    // (con la cara para arriba)
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// pared vertical a un costado (o) de la calzada, de abajo (la calzada + y0) hasta top(p)
function wall(S, o, top, keep) {
  const pos = [];
  const idx = [];
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i];
    const b = S[i + 1];
    if (!keep(a) && !keep(b)) continue;
    const base = pos.length / 3;
    for (const p of [a, b]) {
      const x = p.x + p.nx * o;
      const z = p.z + p.nz * o;
      pos.push(x, 0.02 + p.d, z, x, top(p), z);
    }
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// tramos de calle (o de vía) que pasan por arriba de la parte honda
function crossings(lines, minDepth = 0.6) {
  const out = [];
  for (const { pts, w, road } of lines) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const l = Math.hypot(bx - ax, bz - az);
      if (l < 0.2) continue;
      const ux = (bx - ax) / l;
      const uz = (bz - az) / l;
      let t0 = null;
      let t1 = null;
      for (let t = 0; t <= l; t += 0.5) {
        const y = corridorY(ax + ux * t, az + uz * t, 1.2);
        if (y !== null && y < 0.02 - minDepth) {
          if (t0 === null) t0 = t;
          t1 = t;
        }
      }
      if (t0 === null) continue;
      t0 = Math.max(0, t0 - 2);
      t1 = Math.min(l, t1 + 2);
      out.push({ ax: ax + ux * t0, az: az + uz * t0, bx: ax + ux * t1, bz: az + uz * t1, ux, uz, l: t1 - t0, w, road });
    }
  }
  return out;
}

export function buildBajo(scene, city) {
  const C = city.colliders;
  city.walkways ??= [];
  const concrete = new THREE.MeshLambertMaterial({ color: 0xa8a49b, side: THREE.DoubleSide });
  const paint = new THREE.MeshLambertMaterial({ color: 0xf2f2ee, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const F = new FastBoxes();
  // ---- los puentes: calles y vías que cruzan por arriba de la trinchera ----
  const bridges = crossings(ROADS.filter((r) => !r.bajo).map((r) => ({ pts: r.pts, w: r.w + 4, road: r })));
  const rails = crossings(TRACKS.map((t) => ({ pts: t, w: 5.5, road: null })), 0.3);
  for (const b of bridges) {
    const walk = { ax: b.ax, az: b.az, bx: b.bx, bz: b.bz, w: b.w, y0: 0.02, y1: 0.02 };
    BAJO.walk.push(walk);
    city.walkways.push(walk);
    const cx = (b.ax + b.bx) / 2;
    const cz = (b.az + b.bz) / 2;
    // la losa de abajo (de abajo se ve hormigón) y las barandas a los costados
    F.rbox(b.l, 0.7, b.w, 0x9a968c, cx, -0.37, cz, angOf(b.ux, b.uz));
    for (const s of [-1, 1]) {
      const ox = -b.uz * (b.w / 2) * s;
      const oz = b.ux * (b.w / 2) * s;
      F.rbox(b.l, 1.0, 0.18, 0xb8b4aa, cx + ox, 0.5, cz + oz, angOf(b.ux, b.uz));
      C.addSegment(b.ax + ox, b.az + oz, b.bx + ox, b.bz + oz, 1.1, 'rail').over = true;
    }
  }
  // el techo del túnel abajo de las vías (de arriba se ve el balasto; de abajo, la losa)
  const roofW = 2 * (W + 2.6);
  F.rbox(2 * ROOF, 0.7, roofW, 0x8f8b82, AXIS.x, -0.37, AXIS.z, angOf(AXIS.ux, AXIS.uz));
  const roofWalk = { ax: AXIS.x - AXIS.ux * ROOF, az: AXIS.z - AXIS.uz * ROOF, bx: AXIS.x + AXIS.ux * ROOF, bz: AXIS.z + AXIS.uz * ROOF, w: roofW, y0: 0.02, y1: 0.02 };
  BAJO.walk.push(roofWalk);
  city.walkways.push(roofWalk);
  for (const r of rails) BAJO.walk.push({ ax: r.ax, az: r.az, bx: r.bx, bz: r.bz, w: r.w, y0: 0.02, y1: 0.02 });
  // los andenes que pasan por arriba: se siguen caminando a su altura
  for (const rings of PLATFORMS) {
    const ring = rings[0];
    if (ring?.some(([x, z]) => corridorY(x, z, 12) !== null)) city.walkways.push(roofWalkway(ring, 1.1));
  }
  // ---- la calzada, la pintura y las paredes ----
  const onBridge = (x, z, m = 0) => BAJO.walk.some((w) => {
    const dx = w.bx - w.ax;
    const dz = w.bz - w.az;
    const l2 = dx * dx + dz * dz || 1;
    const t = ((x - w.ax) * dx + (z - w.az) * dz) / l2;
    if (t < -0.05 || t > 1.05) return false;
    return Math.abs(((x - w.ax) * dz - (z - w.az) * dx) / Math.sqrt(l2)) < w.w / 2 + m;
  });
  const roadGeos = [];
  const lineGeos = [];
  const wallGeos = [];
  const curbGeos = [];
  const lightPos = [];
  for (const L of LANES) {
    const S = samples(L);
    roadGeos.push(ribbon(S, -W / 2, W / 2, 0, 9));
    // líneas de borde y la del medio, cortada
    for (const o of [-W / 2 + 0.45, W / 2 - 0.45]) lineGeos.push(ribbon(S, o - 0.06, o + 0.06, 0.004));
    let k = 0;
    lineGeos.push(ribbon(S, -0.06, 0.06, 0.004, 0, () => k++ % 3 === 0));
    for (const side of [-1, 1]) {
      const o = side * (W / 2 + 0.12);
      // pared de la trinchera (con baranda arriba del nivel de la calle)
      wallGeos.push(wall(S, o, (p) => 0.15 + Math.min(0.85, -p.d * 0.5), (p) => p.d < -0.03));
      // cordón donde va a nivel y no empalma con otra calle
      const curb = (p) => {
        if (p.d < -0.03) return false;
        const x = p.x + p.nx * o * 1.02;
        const z = p.z + p.nz * o * 1.02;
        return !ROADS.some((r) => !r.bajo && distToPolyline(x, z, r.pts) < r.w / 2 + 0.6);
      };
      curbGeos.push(wall(S.map((p) => ({ ...p, d: 0 })), o * 1.01, () => 0.15, (p) => curb(p)));
      // colisión: la pared, cortada donde pasa un puente por arriba
      let prev = null;
      for (let i = 0; i < S.length; i += 2) {
        const p = S[i];
        const x = p.x + p.nx * o;
        const z = p.z + p.nz * o;
        const ok = p.d < -0.15 && !onBridge(x, z, 0.4);
        if (ok && prev) C.addSegment(prev.x, prev.z, x, z, 2.2, 'trench');
        prev = ok ? { x, z } : null;
        // luces en las paredes del túnel
        if (Math.abs(sOf(p.x, p.z)) < ROOF + 6 && i % 4 === 0) lightPos.push({ x: p.x + p.nx * (o - side * 0.1), y: 0.02 + p.d + 3.2, z: p.z + p.nz * (o - side * 0.1), r: angOf(p.ux, p.uz) });
      }
    }
  }
  const merge = (geos) => {
    const all = geos.filter((g) => g.attributes.position.count);
    let pos = [];
    let uv = [];
    let idx = [];
    for (const g of all) {
      const base = pos.length / 3;
      pos = pos.concat(Array.from(g.attributes.position.array));
      if (g.attributes.uv) uv = uv.concat(Array.from(g.attributes.uv.array));
      idx = idx.concat(Array.from(g.index.array, (i) => i + base));
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (uv.length === (pos.length / 3) * 2) m.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    m.setIndex(idx);
    m.computeVertexNormals();
    return m;
  };
  const road = new THREE.Mesh(merge(roadGeos), city.roadMat);
  road.receiveShadow = true;
  scene.add(road);
  scene.add(new THREE.Mesh(merge(lineGeos), paint));
  const walls = new THREE.Mesh(merge(wallGeos), concrete);
  walls.receiveShadow = true;
  walls.castShadow = true;
  scene.add(walls);
  scene.add(new THREE.Mesh(merge(curbGeos), new THREE.MeshLambertMaterial({ color: 0xc4bfb3, side: THREE.DoubleSide })));
  for (const l of lightPos) F.rbox(0.9, 0.12, 0.12, 0xfff3c4, l.x, l.y, l.z, l.r);
  scene.add(F.mesh(new THREE.MeshLambertMaterial({ vertexColors: true })));
  // ---- la máscara que recorta el piso (manzanas, veredas, plazas) donde va la avenida ----
  const RES = 0.5;
  const cw = Math.ceil((BOX.x1 - BOX.x0) / RES);
  const ch = Math.ceil((BOX.z1 - BOX.z0) / RES);
  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, cw, ch);
  const P = (x, z) => [(x - BOX.x0) / RES, (z - BOX.z0) / RES];
  g.lineCap = 'butt';
  g.lineJoin = 'round';
  g.strokeStyle = '#fff';
  g.lineWidth = (W + 0.5) / RES;
  for (const L of LANES) {
    g.beginPath();
    L.forEach(([x, z], i) => (i ? g.lineTo(...P(x, z)) : g.moveTo(...P(x, z))));
    g.stroke();
  }
  // los puentes de calle quedan (se ven a nivel)
  g.strokeStyle = '#000';
  for (const b of bridges) {
    g.lineWidth = b.w / RES;
    g.beginPath();
    g.moveTo(...P(b.ax, b.az));
    g.lineTo(...P(b.bx, b.bz));
    g.stroke();
  }
  const tex = freeAfterUpload(new THREE.CanvasTexture(cv));
  tex.flipY = false;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  BAJO.uniforms.bajoMask.value = tex;
  BAJO.bridges = bridges;
  return BAJO;
}

// lo que estaba arriba (alambrados, postes, catenaria) y queda sobre la parte honda: no choca abajo
export function markOver(colliders) {
  const seen = new Set();
  const deep = (x, z) => {
    const y = corridorY(x, z, 0.8);
    return y !== null && y < -1;
  };
  for (const list of colliders.grid.values()) {
    for (const b of list) {
      if (seen.has(b)) continue;
      seen.add(b);
      if (b.kind === 'trench' || b.over != null) continue;
      if (b.c) {
        if (deep(b.x, b.z)) b.over = true;
        continue;
      }
      // un segmento: si alguna parte pasa por arriba de la trinchera
      const n = Math.ceil(Math.hypot(b.bx - b.ax, b.bz - b.az) / 1.5);
      for (let i = 0; i <= n; i++) {
        if (deep(b.ax + ((b.bx - b.ax) * i) / n, b.az + ((b.bz - b.az) * i) / n)) {
          b.over = true;
          break;
        }
      }
    }
  }
}
// filtro de choques para algo que va por abajo (en la trinchera)
export const lowFilter = (b) => !b.over && !(b.y0 > 1);
