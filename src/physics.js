// Colisiones en planta contra segmentos (paredes de casas giradas, rejas) y círculos (árboles),
// con grilla espacial.
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
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i];
      const [bx, bz] = ring[(i + 1) % ring.length];
      this.addSegment(ax, az, bx, bz, h, kind);
    }
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
        if (list) for (const b of list) out.add(b);
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
        if (filter && !filter(b)) continue;
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
  blocked(ax, az, bx, bz, minH = 2.5) {
    let tmin = 1;
    const r = Math.hypot(bx - ax, bz - az) / 2 + 1;
    const cand = this.query((ax + bx) / 2, (az + bz) / 2, r);
    for (const s of cand) {
      if (!s.s || s.h < minH) continue;
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
