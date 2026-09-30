// Temperley real: calles, vías, andenes, edificios, plazas y árboles salidos de
// Overture Maps (datos de OpenStreetMap + huellas de edificios), procesados por
// scripts/preprocess.py. Coordenadas en metros: x al este, z al sur, origen en la estación.
import D from './data/temperley.json';

export const DATA = D;
export const HALF = D.half;
export const SIDEWALK = 3.0;

const AVENUE = new Set(['primary', 'secondary']);

// Calles transitables (cada tramo es una polilínea)
export const ROADS = D.roads.map((r, i) => {
  const pts = r.p;
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return { id: i, name: r.n || '', cls: r.c, w: r.w, avenue: AVENUE.has(r.c), pts, cum, len: cum[cum.length - 1] };
});
export const TRACKS = D.rails;
export const PLATFORMS = D.platforms;
export const STATION = { x: D.station[0], z: D.station[1] };
export const NAMED = D.named;

// ---------- Geometría ----------
export function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / l2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}

// Proyección sobre una polilínea con largo acumulado: {s, dist, dx, dz, x, z}
export function project(pts, cum, x, z) {
  let best = { dist: Infinity };
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / l2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t;
    const pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.dist) {
      const l = Math.sqrt(l2);
      best = { dist: d, s: cum[i] + t * l, dx: dx / l, dz: dz / l, x: px, z: pz, i };
    }
  }
  return best;
}

export function pointAt(pts, cum, s) {
  s = Math.max(0, Math.min(cum[cum.length - 1], s));
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1] < s) i++;
  const [ax, az] = pts[i];
  const [bx, bz] = pts[i + 1];
  const l = cum[i + 1] - cum[i] || 1;
  const t = (s - cum[i]) / l;
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / l, dz: (bz - az) / l };
}

export function withCum(pts) {
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}

// grilla gruesa para buscar calles cercanas rápido
const RG = 40;
const roadGrid = new Map();
for (const r of ROADS) {
  const seen = new Set();
  for (let k = 0; k < r.pts.length - 1; k++) {
    const [ax, az] = r.pts[k];
    const [bx, bz] = r.pts[k + 1];
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 10) + 1;
    for (let j = 0; j <= n; j++) {
      const key = `${Math.floor((ax + ((bx - ax) * j) / n) / RG)},${Math.floor((az + ((bz - az) * j) / n) / RG)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!roadGrid.has(key)) roadGrid.set(key, []);
      roadGrid.get(key).push(r);
    }
  }
}
function roadsNear(x, z) {
  const out = new Set();
  const i = Math.floor(x / RG);
  const j = Math.floor(z / RG);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const r of roadGrid.get(`${i + a},${j + b}`) || []) out.add(r);
  return out;
}

export function nearestRoad(x, z) {
  let best = null;
  let bp = null;
  let cand = roadsNear(x, z);
  if (!cand.size) cand = ROADS;
  for (const r of cand) {
    const p = project(r.pts, r.cum, x, z);
    if (!bp || p.dist < bp.dist) {
      bp = p;
      best = r;
    }
  }
  return best ? { road: best, ...bp } : null;
}

export function nearestStreetName(x, z) {
  const n = nearestRoad(x, z);
  if (!n) return '';
  if (n.road.name) return n.road.name;
  // tramo sin nombre: probar el siguiente más cercano con nombre
  let best = '';
  let bd = Infinity;
  for (const r of roadsNear(x, z)) {
    if (!r.name) continue;
    const d = project(r.pts, r.cum, x, z).dist;
    if (d < bd) {
      bd = d;
      best = r.name;
    }
  }
  return best;
}

// Planta baja comercial: sobre las avenidas y alrededor de la estación casi todo son negocios
// (los datos solo marcan como local los que tienen un comercio cargado)
const COMMERCIAL = new Set(['Avenida Meeks', 'Almirante Brown', 'Juan B. Péreuilh', '25 de Mayo']);
for (const b of D.buildings) {
  if (b.k !== 'casa' || !b.fr.length) continue;
  const r = b.r;
  const a = r[b.fr[0]];
  const c = r[(b.fr[0] + 1) % r.length];
  const mx = (a[0] + c[0]) / 2;
  const mz = (a[1] + c[1]) / 2;
  const n = nearestRoad(mx, mz);
  if (!n || n.dist > n.road.w / 2 + 8) continue;
  const dSt = Math.hypot(mx - D.station[0], mz - D.station[1]);
  const p = COMMERCIAL.has(n.road.name) || n.road.avenue ? (dSt < 450 ? 0.75 : 0.4) : dSt < 170 ? 0.3 : 0;
  if (((b.v * 9301 + 49297) % 233280) / 233280 < p) b.k = 'local';
}

// "Av. Meeks y 25 de Mayo": las dos calles con nombre distinto más cercanas
export function cornerName(x, z) {
  const found = [];
  const cand = [...roadsNear(x, z)].filter((r) => r.name).map((r) => ({ n: r.name, d: project(r.pts, r.cum, x, z).dist }));
  cand.sort((a, b) => a.d - b.d);
  for (const c of cand) if (!found.includes(c.n)) found.push(c.n);
  if (found.length >= 2) return `${found[0]} y ${found[1]}`;
  return found[0] || 'Temperley';
}

// ---------- Altura del piso (veredas, manzanas, andenes) ----------
// Se rasteriza una vez a una grilla de 0,5 m para que la consulta sea instantánea.
export function makeGround() {
  const RES = 0.5;
  const N = Math.ceil((HALF * 2) / RES);
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, N, N);
  const X = (x) => (x + HALF) / RES;
  const fill = (rings, color) => {
    g.fillStyle = color;
    g.beginPath();
    for (const r of rings) {
      r.forEach(([x, z], i) => (i ? g.lineTo(X(x), X(z)) : g.moveTo(X(x), X(z))));
      g.closePath();
    }
    g.fill('evenodd');
  };
  for (const b of D.blocks) fill(b, '#0f0f0f'); // 15 cm
  for (const p of D.platforms) fill(p, '#6e6e6e'); // 110 cm
  const data = g.getImageData(0, 0, N, N).data;
  const H = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) H[i] = data[i * 4] / 100;
  return function heightAt(x, z) {
    const i = Math.floor((x + HALF) / RES);
    const j = Math.floor((z + HALF) / RES);
    if (i < 0 || j < 0 || i >= N || j >= N) return 0;
    return H[j * N + i];
  };
}

// ---------- Esquinas: nodos donde terminan tramos de calle ----------
// Cada nodo sabe qué calles llegan y en qué dirección salen desde la esquina.
function nodeKey(x, z) {
  return `${Math.round(x * 2) / 2},${Math.round(z * 2) / 2}`;
}
export const ROAD_NODES = (() => {
  const map = new Map();
  const add = (r, end) => {
    const pts = r.pts;
    const p = end === 0 ? pts[0] : pts[pts.length - 1];
    const q = end === 0 ? pts[1] : pts[pts.length - 2];
    const k = nodeKey(p[0], p[1]);
    if (!map.has(k)) map.set(k, { x: p[0], z: p[1], arms: [] });
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    map.get(k).arms.push({ road: r, end, dx: (q[0] - p[0]) / l, dz: (q[1] - p[1]) / l });
  };
  for (const r of ROADS) {
    if (r.pts.length < 2) continue;
    add(r, 0);
    add(r, 1);
  }
  for (const n of map.values()) {
    n.deg = n.arms.length;
    n.maxW = Math.max(...n.arms.map((a) => a.road.w));
  }
  return [...map.values()];
})();
export const CORNERS = ROAD_NODES.filter((n) => n.deg >= 3);
