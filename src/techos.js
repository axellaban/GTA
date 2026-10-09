// Los techos de todas las casas y edificios se caminan (pedido del dueño: si caías en un techo desde el
// helicóptero lo atravesabas, salvo en las torres). Para cada edificio de city.buildingList: su contorno, la
// altura de la losa y la forma del techo como la dibujan src/city.js y src/techos-kit.js (plano con pretil, a
// dos aguas o bóveda de chapa), en una grilla para encontrarlos rápido. Lo usan Gaspi (el piso bajo los
// pies), la cámara, el helicóptero (dónde se apoya) y los tiros (el techo frena la bala).

function pointInRing(x, z, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i];
    const [xj, zj] = r[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function signedArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return a / 2;
}

const CELL = 16;
const OV = 0.3; // alero de los techos a dos aguas (src/techos-kit.js)
const SPRING = 0.45; // la bóveda de los galpones arranca arriba del pretil (src/techos-kit.js)
export const PRETIL = 0.55; // el pretil de los techos planos (src/city.js)

// el rectángulo orientado del contorno (el lado más largo da la dirección)
function frame(r) {
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
    a0 = Math.min(a0, x * ux + z * uz);
    a1 = Math.max(a1, x * ux + z * uz);
    b0 = Math.min(b0, x * nx + z * nz);
    b1 = Math.max(b1, x * nx + z * nz);
  }
  return { ux, uz, nx, nz, a0, a1, b0, b1 };
}

export class Techos {
  // skip: contornos que ya tienen su terraza aparte (la torre del helipuerto, la del tobogán...)
  constructor(city, skip = []) {
    this.grid = new Map();
    this.list = [];
    for (const e of city.buildingList || []) {
      const { ring, h, kind } = e;
      // la iglesia tiene su techo de Blender (nave y campanario)
      if (ring.length < 3 || kind === 'iglesia') continue;
      let cx = 0;
      let cz = 0;
      for (const [x, z] of ring) {
        cx += x / ring.length;
        cz += z / ring.length;
      }
      if (skip.some((r) => pointInRing(cx, cz, r))) continue;
      const box = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
      for (const [x, z] of ring) {
        box.x0 = Math.min(box.x0, x);
        box.x1 = Math.max(box.x1, x);
        box.z0 = Math.min(box.z0, z);
        box.z1 = Math.max(box.z1, z);
      }
      const t = { e, ring, h, box, shape: 'flat' };
      if (e.pitched) {
        const f = frame(ring);
        const span = f.b1 - f.b0;
        t.shape = 'gable';
        t.f = f;
        t.bm = (f.b0 + f.b1) / 2;
        t.hs = span / 2 + OV;
        t.rise = kind === 'estacion' ? 3 : Math.min(2.2, span * 0.3);
      } else if (kind === 'galpon') {
        // (como buildVaultRoofs: solo los rectangulares de más de 4 m, con bóvedas de 16 m como mucho)
        const f = frame(ring);
        const span = f.b1 - f.b0;
        const len = f.a1 - f.a0;
        if (span >= 4 && len >= 4 && Math.abs(signedArea(ring)) >= span * len * 0.9) {
          t.shape = 'vault';
          t.f = f;
          t.nv = Math.ceil(span / 16);
          t.span = span / t.nv;
          t.rise = Math.min(3.2, t.span * 0.16);
        }
      }
      this.list.push(t);
      for (let i = Math.floor(box.x0 / CELL); i <= Math.floor(box.x1 / CELL); i++) {
        for (let j = Math.floor(box.z0 / CELL); j <= Math.floor(box.z1 / CELL); j++) {
          const k = i * 100003 + j;
          let c = this.grid.get(k);
          if (!c) this.grid.set(k, (c = []));
          c.push(t);
        }
      }
    }
  }

  // la altura del techo de t en (x, z), que ya se sabe adentro del contorno
  surface(t, x, z) {
    if (t.shape === 'gable') {
      const s = x * t.f.nx + z * t.f.nz - t.bm;
      return t.h + t.rise * Math.max(0, 1 - Math.abs(s) / t.hs);
    }
    if (t.shape === 'vault') {
      const b = x * t.f.nx + z * t.f.nz - t.f.b0;
      const k = Math.min(t.nv - 1, Math.max(0, Math.floor(b / t.span)));
      const s = b - t.span * (k + 0.5);
      const hs = t.span / 2;
      return t.h + SPRING + t.rise * Math.max(0, 1 - (s / hs) ** 2);
    }
    return t.h;
  }

  // el techo en (x, z): { y, t } o null
  at(x, z) {
    const c = this.grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
    if (!c) return null;
    let best = null;
    for (const t of c) {
      // (gone: la casa se derrumbó, src/destroy.js)
      if (t.e.down) continue;
      const b = t.box;
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || !pointInRing(x, z, t.ring)) continue;
      const y = this.surface(t, x, z);
      if (!best || y > best.y) best = { y, t };
    }
    return best;
  }

  // el piso caminable de los techos para alguien a la altura y (como walkwayHeight: se sube de un paso)
  floor(x, z, y, step = 0.7) {
    const r = this.at(x, z);
    return r && r.y <= y + step ? r.y : -Infinity;
  }

  // un tiro (o, d normalizada) contra los techos: la distancia al primero que toca o Infinity
  ray(o, d, range) {
    if (d.y > -1e-4) return Infinity;
    let best = Infinity;
    const seen = new Set();
    // las celdas que cruza en planta, de a medio casillero
    const len = Math.hypot(d.x, d.z) * range;
    const n = Math.max(1, Math.ceil(len / (CELL / 2)));
    for (let i = 0; i <= n; i++) {
      const x = o.x + d.x * range * (i / n);
      const z = o.z + d.z * range * (i / n);
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          const c = this.grid.get((Math.floor(x / CELL) + a) * 100003 + Math.floor(z / CELL) + b);
          if (c) for (const t of c) seen.add(t);
        }
      }
    }
    for (const t of seen) {
      if (t.e.down) continue;
      const k = t.box;
      // el tramo del rayo adentro de la caja del edificio (en planta)
      let t0 = 0;
      let t1 = Math.min(range, best);
      for (const [p, v, lo, hi] of [[o.x, d.x, k.x0, k.x1], [o.z, d.z, k.z0, k.z1]]) {
        if (Math.abs(v) < 1e-9) {
          if (p < lo || p > hi) t1 = -1;
          continue;
        }
        const a = (lo - p) / v;
        const b = (hi - p) / v;
        t0 = Math.max(t0, Math.min(a, b));
        t1 = Math.min(t1, Math.max(a, b));
      }
      if (t1 <= t0) continue;
      // de arriba: por encima del techo más alto posible no hay nada que buscar
      const top = t.h + (t.rise ?? 0) + SPRING;
      if (o.y + d.y * t1 > top) continue;
      if (t.shape === 'flat') {
        const tt = (t.h - o.y) / d.y;
        if (tt >= t0 && tt <= t1 && pointInRing(o.x + d.x * tt, o.z + d.z * tt, t.ring)) best = Math.min(best, tt);
        continue;
      }
      // a dos aguas o bóveda: se recorre de a 25 cm
      const step = 0.25;
      for (let tt = Math.max(t0, (top - o.y) / d.y); tt <= t1; tt += step) {
        const x = o.x + d.x * tt;
        const z = o.z + d.z * tt;
        if (o.y + d.y * tt <= this.surface(t, x, z) && pointInRing(x, z, t.ring)) {
          best = Math.min(best, tt);
          break;
        }
      }
    }
    return best;
  }
}
