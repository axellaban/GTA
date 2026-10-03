// Colisiones en planta contra segmentos (paredes de casas giradas, rejas) y círculos (árboles),
// con grilla espacial. Algunas paredes arrancan en altura (y0: barandas del puente peatonal).

// altura del piso caminable en (x, z) para alguien que está a la altura y: el puente peatonal y sus
// escaleras (city.walkways) cuentan si se puede subir hasta ahí de un paso (o se cae desde arriba)
export function walkwayHeight(walkways, x, z, y) {
  let best = -Infinity;
  for (const w of walkways || []) {
    // terraza: un piso plano con la forma del edificio ({ ring, box, y0 })
    if (w.ring) {
      const b = w.box;
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || w.y0 > y + 0.7 || w.y0 <= best) continue;
      if (inRing(x, z, w.ring) && !(w.hole && inRing(x, z, w.hole))) best = w.y0;
      continue;
    }
    const dx = w.bx - w.ax;
    const dz = w.bz - w.az;
    const l2 = dx * dx + dz * dz;
    if (!l2) continue;
    const t = ((x - w.ax) * dx + (z - w.az) * dz) / l2;
    if (t < -0.02 || t > 1.02) continue;
    const l = Math.sqrt(l2);
    const across = Math.abs(((x - w.ax) * dz - (z - w.az) * dx) / l);
    if (across > w.w / 2) continue;
    const h = w.y0 + (w.y1 - w.y0) * Math.max(0, Math.min(1, t));
    if (h <= y + 0.7 && h > best) best = h;
  }
  return best;
}
function inRing(x, z, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i];
    const [xj, zj] = r[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// piso de una terraza con la forma del edificio
export function roofWalkway(ring, y) {
  const box = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const [x, z] of ring) {
    box.x0 = Math.min(box.x0, x);
    box.x1 = Math.max(box.x1, x);
    box.z0 = Math.min(box.z0, z);
    box.z1 = Math.max(box.z1, z);
  }
  return { ring, box, y0: y, y1: y };
}
const CELL = 8;

export class Colliders {
  constructor() {
    this.grid = new Map();
    this.count = 0;
  }
  key(i, j) {
    return i * 100003 + j;
  }
  insert(item, x0, z0, x1, z1) {
    const i0 = Math.floor(Math.min(x0, x1) / CELL);
    const i1 = Math.floor(Math.max(x0, x1) / CELL);
    const j0 = Math.floor(Math.min(z0, z1) / CELL);
    const j1 = Math.floor(Math.max(z0, z1) / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = this.key(i, j);
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(item);
      }
    }
    this.count++;
    return item;
  }
  addSegment(ax, az, bx, bz, h = 3, kind = 'wall') {
    return this.insert({ s: true, ax, az, bx, bz, h, kind }, ax, az, bx, bz);
  }
  addRing(ring, h = 3, kind = 'building') {
    const out = [];
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i];
      const [bx, bz] = ring[(i + 1) % ring.length];
      out.push(this.addSegment(ax, az, bx, bz, h, kind));
    }
    return out;
  }
  // pared que arranca en altura (baranda de un puente, costado de una escalera): solo frena a
  // quien está a esa altura
  add3d(ax, az, bx, bz, y0, h, kind = 'rail') {
    return this.insert({ s: true, ax, az, bx, bz, h: y0 + h, y0, kind }, ax, az, bx, bz);
  }
  addCircle(x, z, r, h = 3, kind = 'tree') {
    return this.insert({ c: true, x, z, r, h, kind }, x - r, z - r, x + r, z + r);
  }
  // compatibilidad: caja alineada -> 4 segmentos
  add(b) {
    const ring = [
      [b.x0, b.z0],
      [b.x1, b.z0],
      [b.x1, b.z1],
      [b.x0, b.z1],
    ];
    this.addRing(ring, b.h ?? 3, b.kind ?? 'wall');
    return b;
  }
  query(x, z, r) {
    const out = new Set();
    const i0 = Math.floor((x - r) / CELL);
    const i1 = Math.floor((x + r) / CELL);
    const j0 = Math.floor((z - r) / CELL);
    const j1 = Math.floor((z + r) / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const list = this.grid.get(this.key(i, j));
        // (gone: la pared de una casa que se derrumbó)
        if (list) for (const b of list) if (!b.gone) out.add(b);
      }
    }
    return out;
  }
  // Empuja un círculo fuera de paredes y árboles. Devuelve el choque más fuerte.
  resolveCircle(pos, r, filter) {
    let hit = null;
    let best = 0;
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.query(pos.x, pos.z, r + 0.5)) {
        if (filter ? !filter(b) : b.y0 > 1) continue;
        let cx;
        let cz;
        let rr = r;
        if (b.c) {
          cx = b.x;
          cz = b.z;
          rr = r + b.r;
        } else {
          const dx = b.bx - b.ax;
          const dz = b.bz - b.az;
          const l2 = dx * dx + dz * dz || 1;
          let t = ((pos.x - b.ax) * dx + (pos.z - b.az) * dz) / l2;
          t = Math.max(0, Math.min(1, t));
          cx = b.ax + dx * t;
          cz = b.az + dz * t;
        }
        const ex = pos.x - cx;
        const ez = pos.z - cz;
        const d2 = ex * ex + ez * ez;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2);
        let nx;
        let nz;
        if (d > 1e-6) {
          nx = ex / d;
          nz = ez / d;
        } else if (!b.c) {
          const l = Math.hypot(b.bx - b.ax, b.bz - b.az) || 1;
          nx = -(b.bz - b.az) / l;
          nz = (b.bx - b.ax) / l;
        } else {
          nx = 1;
          nz = 0;
        }
        const pen = rr - d;
        pos.x += nx * pen;
        pos.z += nz * pen;
        if (pen > best) {
          best = pen;
          hit = { nx, nz, pen, box: b };
        }
      }
    }
    return hit;
  }
  // ¿Hay algo alto entre a y b? Devuelve la fracción del camino libre (1 = libre)
  // como blocked, pero devuelve también la pared: {t, nx, nz, kind} (normal hacia el que mira) o null
  blockedHit(ax, az, bx, bz, minH = 2.5) {
    let best = null;
    const r = Math.hypot(bx - ax, bz - az) / 2 + 1;
    for (const s of this.query((ax + bx) / 2, (az + bz) / 2, r)) {
      if (!s.s || s.h < minH || s.y0 > 1) continue;
      const t = segT(ax, az, bx, bz, s.ax, s.az, s.bx, s.bz);
      if (t === null || (best && t >= best.t)) continue;
      const l = Math.hypot(s.bx - s.ax, s.bz - s.az) || 1;
      let nx = -(s.bz - s.az) / l;
      let nz = (s.bx - s.ax) / l;
      if (nx * (bx - ax) + nz * (bz - az) > 0) {
        nx = -nx;
        nz = -nz;
      }
      best = { t, nx, nz, kind: s.kind, h: s.h };
    }
    return best;
  }
  blocked(ax, az, bx, bz, minH = 2.5) {
    let tmin = 1;
    const r = Math.hypot(bx - ax, bz - az) / 2 + 1;
    const cand = this.query((ax + bx) / 2, (az + bz) / 2, r);
    for (const s of cand) {
      if (!s.s || s.h < minH || s.y0 > 1) continue;
      const t = segT(ax, az, bx, bz, s.ax, s.az, s.bx, s.bz);
      if (t !== null && t < tmin) tmin = t;
    }
    return tmin;
  }
}

function segT(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax;
  const rz = bz - az;
  const sx = dx - cx;
  const sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den;
  const u = ((cx - ax) * rz - (cz - az) * rx) / den;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
  return null;
}

export function circleOverlap(a, ar, b, br) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  return d < ar + br ? { d, dx, dz, pen: ar + br - d } : null;
}
