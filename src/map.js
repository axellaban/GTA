// Temperley real: calles, vías, andenes, edificios, plazas y árboles salidos de
// Overture Maps (datos de OpenStreetMap + huellas de edificios), procesados por
// scripts/map/preprocess.py. Coordenadas en metros: x al este, z al sur, origen en la estación.
import D from './data/temperley.json';
import REL from './data/relevamiento.json';
import OSM from './data/osm.json';
import PLACES from './data/places.json';
import { LANES as BAJO_LANES, W as BAJO_W, NAME as BAJO_NAME, SEGS as BAJO_SEGS, laneDist, depthAt, sOf } from './bajo-geo.js';

// Lo cargado a mano en /relevamiento.html (exportado a src/data/relevamiento.json) pisa lo que trae
// Overture: nombre real, tipo, pisos y colores del cartel. Ver PLAN.md, parte B.
const TIPO = { local: 'local', casa: 'casa', edificio: 'edificio', colegio: 'escuela', iglesia: 'iglesia' };
export const SIGN_COLORS_REAL = new Map();
for (const e of REL.negocios || []) {
  const id = String(e.id);
  if (id.startsWith('p')) {
    const p = D.parks[+id.slice(1)];
    if (p && e.nombre) p.n = e.nombre;
    continue;
  }
  const b = D.buildings[+id];
  if (!b) continue;
  if (e.nombre) b.n = e.nombre;
  if (TIPO[e.tipo]) b.k = TIPO[e.tipo];
  if (e.pisos) b.f = e.pisos;
  if (e.nombre && e.cartel) SIGN_COLORS_REAL.set(e.nombre, { bg: e.cartel, fg: e.letras || '#ffffff' });
  // frente: qué pared es la de la calle (índice de arista); punto: dónde va el cartel/la puerta (un galpón largo)
  if (e.frente != null && b.fr.includes(e.frente)) {
    const i = b.fr.indexOf(e.frente);
    b.fr = [b.fr[i], ...b.fr.filter((_, j) => j !== i)];
    b.sb = [b.sb[i], ...b.sb.filter((_, j) => j !== i)];
  }
  b.rel = { fachada: e.fachada, persiana: !!e.persiana, toldo: !!e.toldo, rejas: !!e.rejas, rubro: e.rubro, punto: e.punto, frente: e.frente, puerta: e.puerta };
}
// el bajo nivel (src/bajo-geo.js): sus dos manos van a la lista de calles, y lo que quedaba encima
// (árboles, faroles, alambrados, senderos, paradas) se saca
for (const p of BAJO_LANES) D.roads.push({ n: BAJO_NAME, c: 'primary', w: BAJO_W, p, bajo: true });
{
  const on = (x, z, m = 1.5) => laneDist(x, z) <= BAJO_W / 2 + m;
  D.trees = D.trees.filter((t) => !on(t[0], t[1]));
  D.lamps = D.lamps.filter((t) => !on(t[0], t[1]));
  D.signals = D.signals.filter((t) => !on(t[0], t[1], 0.5));
  D.stops = D.stops.filter((t) => !on(t[0], t[1], 0.5));
  D.paths = D.paths.filter((p) => !p.p.some(([x, z]) => on(x, z, 0.5)));
  D.fences = D.fences.filter(([ax, az, bx, bz]) => {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az));
    for (let i = 0; i <= n; i++) if (on(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, 0.5)) return false;
    return true;
  });
}

// edificios que no están en los datos y el dueño pidió (relevamiento.nuevos): van al final de la lista,
// así no cambian los números de los demás
for (const e of REL.nuevos || []) {
  D.buildings.push({ r: e.ring, k: TIPO[e.tipo] ?? 'edificio', f: e.pisos ?? 1, v: 7, fr: [e.frente ?? 0], sb: [0], n: e.nombre ?? null, cat: null, rel: { rubro: e.rubro }, extra: e.extra ?? null });
}

// La casa de Clau (pedido del dueño): en Emilio Castro y Av. Eva Perón, que queda ~270 m al este del borde del
// mapa; va en la casa de dos pisos sobre la avenida más cerca de esa esquina (src/clau.js)
export const CLAU = { x: 584, z: 37 };
{
  let best = null;
  let bd = Infinity;
  for (const b of D.buildings) {
    let x = 0;
    let z = 0;
    for (const p of b.r) {
      x += p[0];
      z += p[1];
    }
    const d = Math.hypot(x / b.r.length - CLAU.x, z / b.r.length - CLAU.z);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  if (best && bd < 12) Object.assign(best, { k: 'casa', f: 2, v: 7, n: 'La casa de Clau', cat: null, extra: 'clau', rel: { fachada: '#f2d9b4' } });
}

// Negocios con nombre de OpenStreetMap (scripts/map/osm_pois.py -> src/data/osm.json): cada uno va a la
// huella que lo contiene o a la más cercana con frente a la calle (a menos de 10 m). Pisan los nombres
// de Overture, pero no lo cargado a mano en el relevamiento. Después, los lugares de Overture con
// confianza media (scripts/map/places_extra.py -> src/data/places.json), solo en huellas sin nombre.
function ptSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
function ringDist(r, x, z) {
  let inside = false;
  let d = Infinity;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i];
    const [xj, zj] = r[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    d = Math.min(d, ptSeg(x, z, xi, zi, xj, zj));
  }
  return inside ? 0 : d;
}
{
  const box = D.buildings.map((b) => {
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (const [x, z] of b.r) {
      x0 = Math.min(x0, x);
      z0 = Math.min(z0, z);
      x1 = Math.max(x1, x);
      z1 = Math.max(z1, z);
    }
    return [x0, z0, x1, z1];
  });
  const taken = new Set();
  // onlyNew: los lugares de Overture con confianza media solo van a huellas que no tienen nombre real
  const assign = (pois, onlyNew) => {
    for (const p of pois) {
      let best = null;
      let bs = Infinity;
      D.buildings.forEach((b, i) => {
        const [x0, z0, x1, z1] = box[i];
        if (p.x < x0 - 10 || p.x > x1 + 10 || p.z < z0 - 10 || p.z > z1 + 10) return;
        if (onlyNew && (b.n || b.rel)) return;
        const d = ringDist(b.r, p.x, p.z);
        if (d > 10) return;
        // mejor una huella con frente a la calle (donde va el cartel) y que no tenga ya otro negocio
        const s = d + (b.fr.length ? 0 : 6) + (taken.has(b) ? 4 : 0);
        if (s < bs) {
          bs = s;
          best = b;
        }
      });
      if (!best || best.rel || taken.has(best) || (onlyNew && best.n)) continue;
      taken.add(best);
      best.n = p.n;
      best.cat = p.c;
      if (p.a) best.addr = p.a;
      if (p.k === 'local' && (best.k === 'casa' || (best.k === 'edificio' && best.f <= 4))) best.k = 'local';
      else if ((p.k === 'escuela' || p.k === 'iglesia') && (best.k === 'casa' || best.k === 'local')) best.k = p.k;
    }
  };
  assign(OSM.pois, false);
  // (si el nombre ya está en el mapa, no se repite)
  const have = new Set(D.buildings.map((b) => b.n).filter(Boolean));
  assign(PLACES.pois.filter((p) => !have.has(p.n)), true);
}

export const DATA = D;
export const HALF = D.half;
export const SIDEWALK = 3.0;

const AVENUE = new Set(['primary', 'secondary']);

// Calles transitables (cada tramo es una polilínea)
export const ROADS = D.roads.map((r, i) => {
  const pts = r.p;
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return { id: i, name: r.n || '', cls: r.c, w: r.w, avenue: AVENUE.has(r.c), pts, cum, len: cum[cum.length - 1], bajo: !!r.bajo };
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

// ---------- Gym El Kaiser en su dirección real: Rivadavia 321 ----------
// (Instagram y Facebook de @elkaisergym). La numeración se calibró con las esquinas del mapa: Santa
// María de Oro = 100, Obligado = 200, Almirante Brown = 300 (y un negocio de Overture en Rivadavia
// 163). El 321 queda pasando Almirante Brown, en la vereda de enfrente del Colegio Eccleston (lo
// confirmó el dueño). El lote se reserva acá, antes de armar la ciudad: la huella de Overture que
// lo pisa (el local de 9 m de frente, que es el galpón del gym) no se levanta, y el gym
// (src/gym.js) ocupa ese frente.
export const GYM_SIZE = { W: 12, DP: 9 };
export const GYM_LOT = (() => {
  const A = { x: 412.3, z: 11.0 }; // frente del 321
  const SIDE = { x: 0.556, z: 0.831 }; // hacia la vereda del gym (la de enfrente del colegio)
  let road = null;
  let p = null;
  for (const r of ROADS) {
    if (r.name !== 'Rivadavia') continue;
    const q = project(r.pts, r.cum, A.x, A.z);
    if (!p || q.dist < p.dist) {
      p = q;
      road = r;
    }
  }
  if (!road || p.dist > 6) return null;
  let nx = -p.dz;
  let nz = p.dx;
  if (nx * SIDE.x + nz * SIDE.z < 0) {
    nx = -nx;
    nz = -nz;
  }
  const edge = road.w / 2 + SIDEWALK + GYM_SIZE.DP / 2 + 0.1;
  const x = p.x + nx * edge;
  const z = p.z + nz * edge;
  // eje u: a lo largo de la calle; eje n: de la calle hacia el fondo del lote
  const u = { x: p.dx, z: p.dz };
  const n = { x: nx, z: nz };
  const inLot = (px, pz, pad = 0.4) => {
    const rx = px - x;
    const rz = pz - z;
    return Math.abs(rx * u.x + rz * u.z) <= GYM_SIZE.W / 2 + pad && Math.abs(rx * n.x + rz * n.z) <= GYM_SIZE.DP / 2 + pad;
  };
  return { x, z, h: Math.atan2(-nx, -nz), edge: edge, road, inLot };
})();

// ¿un polígono (o segmento) toca el lote? vértices adentro, o algún punto de sus lados
function touchesLot(pts, closed) {
  const L = GYM_LOT;
  if (!pts.some(([x, z]) => Math.abs(x - L.x) < 40 && Math.abs(z - L.z) < 40)) return false;
  const m = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < m; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    const k = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
    for (let j = 0; j <= k; j++) if (L.inLot(ax + ((bx - ax) * j) / k, az + ((bz - az) * j) / k)) return true;
  }
  // el lote entero adentro de un polígono grande
  if (closed) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, zi] = pts[i];
      const [xj, zj] = pts[j];
      if (zi > L.z !== zj > L.z && L.x < ((xj - xi) * (L.z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  }
  return false;
}
if (GYM_LOT) {
  D.buildings = D.buildings.filter((b) => !touchesLot(b.r, true));
  D.fences = D.fences.filter((f) => !touchesLot([[f[0], f[1]], [f[2], f[3]]], false));
  D.trees = D.trees.filter((t) => !GYM_LOT.inLot(t[0], t[1], 1));
}

// ---------- Escuelas con nombre (Colegio Eccleston, Almirante Brown 3342, y las demás) ----------
// En OSM el colegio es un predio (D.parks, clase school); adentro Overture trae sus edificios como casas
// sueltas. Los que caen casi enteros dentro del predio pasan a ser la escuela (dos pisos), y el más
// grande con frente a la calle lleva el nombre: city.js le pone el cartel.
function inRing(r, x, z) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i];
    const [xj, zj] = r[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const ringArea = (r) => Math.abs(r.reduce((s, [x, z], i) => s + x * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * z, 0)) / 2;
for (const pk of D.parks) {
  if ((pk.c !== 'school' && pk.c !== 'college') || !pk.n) continue;
  const ring = pk.r[0][0];
  let main = null;
  for (const b of D.buildings) {
    if (b.rel) continue;
    const inside = b.r.filter(([x, z]) => inRing(ring, x, z)).length;
    if (inside < b.r.length * 0.75) continue;
    if (b.k === 'casa' || b.k === 'local' || b.k === 'edificio') {
      b.k = 'escuela';
      b.f = Math.max(2, Math.min(3, b.f));
    }
    if (b.k === 'escuela' && b.fr.length && (!main || ringArea(b.r) > ringArea(main.r))) main = b;
  }
  if (main) {
    main.n = pk.n;
    SIGN_COLORS_REAL.set(pk.n, { bg: '#1d3a6b', fg: '#ffffff' });
  }
}

// ---------- Estación de servicio Shell (Av. Eva Perón 402, esquina Almirante Brown) ----------
// OSM marca la estación y sus dos techos (roof); Overture los trae como edificios cerrados. Los techos
// pasan a ser marquesinas sobre columnas (src/nafta.js) y el local de al lado queda como el minimercado.
export const NAFTA = (() => {
  const near = (b, x, z, r) => {
    let cx = 0;
    let cz = 0;
    for (const [px, pz] of b.r) {
      cx += px;
      cz += pz;
    }
    return Math.hypot(cx / b.r.length - x, cz / b.r.length - z) < r;
  };
  const roofs = D.buildings.filter((b) => near(b, 444, 86, 4) || near(b, 433, 65, 4));
  if (roofs.length !== 2) return null;
  D.buildings = D.buildings.filter((b) => !roofs.includes(b));
  const shop = D.buildings.find((b) => near(b, 449, 74, 3));
  if (shop && !shop.rel) {
    shop.k = 'local';
    shop.n = 'Shell Select';
    shop.f = 1;
    SIGN_COLORS_REAL.set(shop.n, { bg: '#f6c90e', fg: '#d71920' });
  }
  // el cartel alto, en la vereda de Almirante Brown, de cara a los que vienen por la avenida
  return { name: 'Shell', roofs: roofs.map((b) => b.r), totem: { x: 437.5, z: 95.5, face: Math.atan2(0.511, 0.86) } };
})();

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
  // el bajo nivel: su calzada (a nivel o en la trinchera) pisa a las manzanas
  for (const s of BAJO_SEGS) {
    const i0 = Math.max(0, Math.floor((s.x0 + HALF) / RES));
    const i1 = Math.min(N - 1, Math.ceil((s.x1 + HALF) / RES));
    const j0 = Math.max(0, Math.floor((s.z0 + HALF) / RES));
    const j1 = Math.min(N - 1, Math.ceil((s.z1 + HALF) / RES));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = i * RES - HALF + RES / 2;
        const z = j * RES - HALF + RES / 2;
        const t = Math.max(0, Math.min(s.l, (x - s.ax) * s.ux + (z - s.az) * s.uz));
        if (Math.hypot(x - s.ax - s.ux * t, z - s.az - s.uz * t) <= BAJO_W / 2 + 0.3) H[j * N + i] = 0.02 + depthAt(sOf(x, z));
      }
    }
  }
  // el lienzo ya no hace falta (en iPhone los lienzos tienen un tope de memoria)
  c.width = c.height = 1;
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
