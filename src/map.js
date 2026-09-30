// Trazado de Temperley alrededor de la estación.
// Coordenadas en metros: x crece hacia el este, z crece hacia el sur (el norte es -z).
// Datos confirmados: estación en Av. Meeks 1400, 10 andenes, fin del cuádruple desde
// Constitución, ramales a Glew/Korn, Ezeiza, Bosques y Haedo, puente peatonal hacia
// Fray Justo Sta. María de Oro. La grilla de calles es aproximada hasta cargar OSM.
import { Rng } from './rng.js';

export const HALF = 440;
export const SIDEWALK = 3.2;
export const YARD = { x0: -73, x1: 73, z0: -HALF, z1: 175 }; // playa de vías

// Calles norte-sur (x constante)
export const NS = [
  { name: 'Colombres', c: -380, w: 9 },
  { name: 'Av. 9 de Julio', c: -280, w: 13, avenue: true },
  { name: 'Garibaldi', c: -180, w: 9 },
  { name: 'Av. Meeks', c: -80, w: 13, avenue: true },
  { name: 'Fray Justo Sta. María de Oro', c: 80, w: 9 },
  { name: 'Av. Almirante Brown', c: 180, w: 13, avenue: true },
  { name: 'Juan Pereuilh', c: 280, w: 9 },
  { name: 'Boedo', c: 380, w: 9 },
];

// Calles este-oeste (z constante)
export const EW = [
  { name: 'Rosales', c: -380, w: 9 },
  { name: 'Cangallo', c: -280, w: 9 },
  { name: 'Sarmiento', c: -180, w: 9 },
  { name: '25 de Mayo', c: -80, w: 9 },
  { name: 'Belgrano', c: 20, w: 9 },
  { name: 'Rivadavia', c: 120, w: 9 },
  { name: 'San Martín', c: 220, w: 9 },
  { name: 'Moreno', c: 320, w: 9 },
];

// Las calles que chocan contra la playa de vías cortan en Meeks y en Fray Justo.
const CUT_AT_YARD = new Set([-180, -80, 20, 120]);

export const STREETS = [];
for (const s of NS) STREETS.push({ ...s, axis: 'ns', a: -HALF, b: HALF });
for (const s of EW) {
  if (CUT_AT_YARD.has(s.c)) {
    STREETS.push({ ...s, axis: 'ew', a: -HALF, b: -80 });
    STREETS.push({ ...s, axis: 'ew', a: 80, b: HALF });
  } else {
    STREETS.push({ ...s, axis: 'ew', a: -HALF, b: HALF });
  }
}

// ---------- Vías ----------
function line(x0, z0, x1, z1, step = 6) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step));
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
  return pts;
}
function sCurve(x0, z0, x1, z1, n = 20) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = t * t * (3 - 2 * t);
    pts.push([x0 + (x1 - x0) * s, z0 + (z1 - z0) * t]);
  }
  return pts;
}
function arc(cx, cz, r, a0, a1, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
  }
  return pts;
}
function join(...parts) {
  const out = [];
  for (const p of parts) {
    for (const q of p) {
      const last = out[out.length - 1];
      if (!last || Math.hypot(last[0] - q[0], last[1] - q[1]) > 0.01) out.push(q);
    }
  }
  return out;
}

export const STATION_TRACKS = [-49.5, -38.5, -27.5, -16.5, -5.5, 5.5, 16.5, 27.5, 38.5, 49.5];
export const ISLANDS = [-44, -22, 0, 22, 44];
export const PLATFORM = { z0: -100, z1: 80, halfW: 3, h: 1.1 };
const MAIN = [-7.5, -2.5, 2.5, 7.5];
const MAIN_FOR = [0, 0, 0, 1, 1, 2, 2, 3, 3, 3];

// Haedo: dos vías que doblan hacia el oeste al sur de la estación.
function haedoTrack(r, zStraight, xStation) {
  const cx = -125.5;
  const cz = 190;
  return join(
    line(-HALF, zStraight, cx, zStraight),
    arc(cx, cz, r, Math.PI / 2, 0),
    line(cx + r, cz, cx + r, 170),
    sCurve(cx + r, 170, xStation, 90),
  );
}

export const TRACKS = [];
STATION_TRACKS.forEach((x, i) => {
  TRACKS.push(line(x, -110, x, 90));
  TRACKS.push(sCurve(x, -110, MAIN[MAIN_FOR[i]], -200));
  if (i >= 2) TRACKS.push(sCurve(x, 90, i <= 5 ? -3 : 3, 170));
});
for (const x of MAIN) TRACKS.push(line(x, -200, x, -HALF));
for (const x of [-3, 3]) TRACKS.push(line(x, 170, x, HALF));
const HAEDO_A = haedoTrack(78, 268, -49.5);
const HAEDO_B = haedoTrack(82, 272, -38.5);
TRACKS.push(HAEDO_A, HAEDO_B);

// Recorridos de los trenes. Reusan los mismos tramos que se dibujan, así el tren
// siempre va arriba de una vía. `stopZ` es donde frena en el andén.
function southbound(i) {
  const x = STATION_TRACKS[i];
  return join(
    line(MAIN[MAIN_FOR[i]], -HALF, MAIN[MAIN_FOR[i]], -200),
    sCurve(x, -110, MAIN[MAIN_FOR[i]], -200).reverse(),
    line(x, -110, x, 90),
    sCurve(x, 90, i <= 5 ? -3 : 3, 170),
    line(i <= 5 ? -3 : 3, 170, i <= 5 ? -3 : 3, HALF),
  );
}

export const ROUTES = [
  { name: 'Glew', kind: 'electrico', pts: southbound(6), stopZ: -10 },
  { name: 'Constitución', kind: 'electrico', pts: southbound(4).reverse(), stopZ: -10 },
  { name: 'Ezeiza', kind: 'electrico', pts: southbound(7), stopZ: -10 },
  { name: 'Haedo', kind: 'diesel', pts: join(HAEDO_A, line(-49.5, 90, -49.5, -30)), stopZ: -30, shuttle: true },
];

// ---------- Geometría auxiliar ----------
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

export function distToRail(x, z) {
  let best = Infinity;
  for (const t of TRACKS) {
    // descarte rápido por caja
    best = Math.min(best, distToPolyline(x, z, t));
    if (best < 1) return best;
  }
  return best;
}

export function streetAt(x, z) {
  for (const s of STREETS) {
    const along = s.axis === 'ns' ? z : x;
    const across = s.axis === 'ns' ? x : z;
    if (along >= s.a - s.w / 2 && along <= s.b + s.w / 2 && Math.abs(across - s.c) <= s.w / 2) return s;
  }
  return null;
}

export function nearestStreetName(x, z) {
  let best = null;
  let bd = Infinity;
  for (const s of STREETS) {
    const along = s.axis === 'ns' ? z : x;
    const across = s.axis === 'ns' ? x : z;
    const clamped = Math.max(s.a, Math.min(s.b, along));
    const d = Math.abs(across - s.c) + Math.abs(along - clamped);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best ? best.name : '';
}

// Nombre de la esquina más cercana: "Av. Meeks y 25 de Mayo"
export function cornerName(x, z) {
  let ns = NS[0];
  for (const s of NS) if (Math.abs(s.c - x) < Math.abs(ns.c - x)) ns = s;
  let ew = EW[0];
  for (const s of EW) if (Math.abs(s.c - z) < Math.abs(ew.c - z)) ew = s;
  return `${ns.name} y ${ew.name}`;
}

// ---------- Manzanas y lotes ----------
function edges(list) {
  return [-HALF, ...list.map((s) => s.c), HALF];
}

export function buildBlocks() {
  const xs = edges(NS);
  const zs = edges(EW);
  const blocks = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const west = i > 0 ? NS[i - 1] : null;
      const east = i < NS.length ? NS[i] : null;
      const north = j > 0 ? EW[j - 1] : null;
      const south = j < EW.length ? EW[j] : null;
      const x0 = xs[i] + (west ? west.w / 2 : 0);
      const x1 = xs[i + 1] - (east ? east.w / 2 : 0);
      let z0 = zs[j] + (north ? north.w / 2 : 0);
      const z1 = zs[j + 1] - (south ? south.w / 2 : 0);
      const inYardCol = xs[i] === -80 && xs[i + 1] === 80;
      if (inYardCol) {
        if (zs[j + 1] <= YARD.z1) continue; // toda la playa de vías
        if (zs[j] < YARD.z1) z0 = YARD.z1;
      }
      const streetN = north && !(inYardCol && CUT_AT_YARD.has(north.c));
      const streetS = south && !(inYardCol && CUT_AT_YARD.has(south.c));
      blocks.push({ x0, x1, z0, z1, sides: { N: !!streetN, S: !!streetS, W: !!west, E: !!east } });
    }
  }
  return blocks;
}

const SHOPS = [
  'KIOSCO 24 HS',
  'FARMACIA',
  'PIZZERÍA',
  'ROTISERÍA',
  'QUINIELA',
  'FERRETERÍA',
  'VERDULERÍA',
  'CELULARES',
  'EMPANADAS',
  'CARNICERÍA',
  'PANADERÍA',
  'COTILLÓN',
  'LAVADERO',
  'CERRAJERÍA',
  'FIAMBRERÍA',
  'CHINO',
];

export function buildLots(blocks, seed = 1400) {
  const rng = new Rng(seed);
  const lots = [];
  for (const b of blocks) {
    const ix0 = b.x0 + SIDEWALK;
    const ix1 = b.x1 - SIDEWALK;
    const iz0 = b.z0 + SIDEWALK;
    const iz1 = b.z1 - SIDEWALK;
    if (ix1 - ix0 < 12 || iz1 - iz0 < 12) continue;
    const maxDz = Math.min(24, (iz1 - iz0) / 2 - 1);
    const maxDx = Math.min(24, (ix1 - ix0) / 2 - 1);
    const addRow = (face) => {
      const horizontal = face === 'N' || face === 'S';
      let a = horizontal ? ix0 : iz0 + maxDz;
      const end = horizontal ? ix1 : iz1 - maxDz;
      while (end - a > 5) {
        let w = rng.range(8, 14);
        if (end - a - w < 6) w = end - a;
        const d = horizontal ? rng.range(14, maxDz) : rng.range(14, maxDx);
        let lot;
        if (face === 'N') lot = { x0: a, x1: a + w, z0: iz0, z1: iz0 + d };
        if (face === 'S') lot = { x0: a, x1: a + w, z0: iz1 - d, z1: iz1 };
        if (face === 'W') lot = { x0: ix0, x1: ix0 + d, z0: a, z1: a + w };
        if (face === 'E') lot = { x0: ix1 - d, x1: ix1, z0: a, z1: a + w };
        lot.face = face;
        a += w;
        const cx = (lot.x0 + lot.x1) / 2;
        const cz = (lot.z0 + lot.z1) / 2;
        if (distToRail(cx, cz) < 12 + Math.max(lot.x1 - lot.x0, lot.z1 - lot.z0) / 2) continue;
        classify(lot, rng, b);
        lots.push(lot);
      }
    };
    for (const f of ['N', 'S', 'W', 'E']) addRow(f);
  }
  return lots;
}

function classify(lot, rng, block) {
  const cx = (lot.x0 + lot.x1) / 2;
  const cz = (lot.z0 + lot.z1) / 2;
  const dStation = Math.hypot(cx + 20, cz + 10);
  const onAvenue = STREETS.some((s) => s.avenue && Math.abs((s.axis === 'ns' ? cx : cz) - s.c) < 40);
  const central = dStation < 260;
  const r = rng.next();
  let type = 'casa';
  if (central && onAvenue) type = r < 0.55 ? 'local' : r < 0.85 ? 'edificio' : 'casa';
  else if (central) type = r < 0.35 ? 'local' : r < 0.45 ? 'edificio' : r < 0.95 ? 'casa' : 'baldio';
  else if (onAvenue) type = r < 0.3 ? 'local' : r < 0.4 ? 'edificio' : r < 0.93 ? 'casa' : 'baldio';
  else type = r < 0.06 ? 'local' : r < 0.9 ? 'casa' : r < 0.95 ? 'obra' : 'baldio';
  lot.type = type;
  lot.floors = type === 'edificio' ? rng.int(3, 7) : type === 'casa' ? (rng.chance(0.3) ? 2 : 1) : type === 'obra' ? rng.int(1, 2) : 1;
  lot.setback = type === 'casa' ? rng.range(2.5, 4.5) : 0;
  lot.fence = type === 'casa' && rng.chance(0.85);
  lot.pitched = type === 'casa' && lot.floors === 1 && rng.chance(0.3);
  lot.tank = type !== 'baldio' && rng.chance(0.55);
  lot.shop = type === 'local' ? rng.pick(SHOPS) : null;
  lot.variant = rng.int(0, 1000);
  lot.block = block;
}

// Árbol de decisión de alturas del suelo (andenes, veredas y calles).
export function makeGround(blocks) {
  return function heightAt(x, z) {
    for (const X of ISLANDS) {
      if (Math.abs(x - X) <= PLATFORM.halfW && z >= PLATFORM.z0 && z <= PLATFORM.z1) return PLATFORM.h;
    }
    for (const b of blocks) {
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return 0.15;
    }
    return 0;
  };
}
