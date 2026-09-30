// Colisiones 2D (planta) contra cajas alineadas a los ejes, con grilla espacial.
const CELL = 16;

export class Colliders {
  constructor() {
    this.grid = new Map();
    this.all = [];
  }
  key(i, j) {
    return i * 100003 + j;
  }
  add(box) {
    // box: {x0, z0, x1, z1, kind, h}
    this.all.push(box);
    const i0 = Math.floor(box.x0 / CELL);
    const i1 = Math.floor(box.x1 / CELL);
    const j0 = Math.floor(box.z0 / CELL);
    const j1 = Math.floor(box.z1 / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = this.key(i, j);
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(box);
      }
    }
    return box;
  }
  remove(box) {
    box.dead = true;
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
        if (list) for (const b of list) if (!b.dead) out.add(b);
      }
    }
    return out;
  }
  // Empuja un círculo fuera de las cajas. Devuelve la normal del choque más fuerte (o null).
  resolveCircle(pos, r, filter) {
    let hit = null;
    let best = 0;
    for (const b of this.query(pos.x, pos.z, r + 1)) {
      if (filter && !filter(b)) continue;
      const cx = Math.max(b.x0, Math.min(pos.x, b.x1));
      const cz = Math.max(b.z0, Math.min(pos.z, b.z1));
      let dx = pos.x - cx;
      let dz = pos.z - cz;
      let d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      let nx;
      let nz;
      let pen;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        nx = dx / d;
        nz = dz / d;
        pen = r - d;
      } else {
        // centro adentro de la caja: salir por el lado más cercano
        const l = pos.x - b.x0;
        const rr = b.x1 - pos.x;
        const t = pos.z - b.z0;
        const bb = b.z1 - pos.z;
        const m = Math.min(l, rr, t, bb);
        if (m === l) (nx = -1), (nz = 0), (pen = l + r);
        else if (m === rr) (nx = 1), (nz = 0), (pen = rr + r);
        else if (m === t) (nx = 0), (nz = -1), (pen = t + r);
        else (nx = 0), (nz = 1), (pen = bb + r);
      }
      pos.x += nx * pen;
      pos.z += nz * pen;
      if (pen > best) {
        best = pen;
        hit = { nx, nz, pen, box: b };
      }
    }
    return hit;
  }
  // Rayo simple en planta para la cámara: ¿hay algo alto entre a y b?
  blocked(ax, az, bx, bz, minH = 2.5) {
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      for (const b of this.query(x, z, 0.1)) {
        if (b.h >= minH && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return t;
      }
    }
    return 1;
  }
}

export function circleOverlap(a, ar, b, br) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  return d < ar + br ? { d, dx, dz, pen: ar + br - d } : null;
}
