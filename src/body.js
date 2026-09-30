// Cuerpos de personas hechos por código, sin cajas ni cilindros sueltos: cada parte es una
// superficie continua (un "torno" con perfiles) y los vértices se reparten entre dos huesos en
// cada articulación, así codos, rodillas, hombros y cintura se doblan sin cortes.
// Cabeza esculpida (frente, cuencas, nariz, pómulos, labios, mentón), orejas, manos con pulgar,
// zapatos, cuerpo de hombre y de mujer, pelo y ropa.
import * as THREE from 'three';

export const BONES = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'uaR', 'faR', 'handR', 'uaL', 'faL', 'handL', 'thR', 'shR', 'ftR', 'thL', 'shL', 'ftL'];
export const B = Object.fromEntries(BONES.map((n, i) => [n, i]));

export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const gauss = (x, s) => Math.exp(-(x * x) / (s * s));
// superelipse: con e < 1 la sección se pone más cuadrada
const S = (v, e) => Math.sign(v) * Math.abs(v) ** e;
const tmpC = new THREE.Color();

// ---------- Armado de la malla ----------
export class Mesher {
  constructor() {
    this.p = [];
    this.uv = [];
    this.c = [];
    this.si = [];
    this.sw = [];
    this.idx = [];
    this.seams = [];
    this.n = 0;
  }
  // w: [[hueso, peso], ...]; cell: rectángulo del atlas {u0, u1, v0, v1}
  vert(x, y, z, u, v, color, w, cell) {
    this.p.push(x, y, z);
    this.uv.push(cell.u0 + u * (cell.u1 - cell.u0), cell.v0 + v * (cell.v1 - cell.v0));
    tmpC.set(color);
    // un poco de oclusión a ras del piso (pies y tobillos más oscuros)
    const ao = 0.8 + 0.2 * smooth(0, 0.5, y);
    this.c.push(tmpC.r * ao, tmpC.g * ao, tmpC.b * ao);
    const k = w.filter((e) => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = k.reduce((s, e) => s + e[1], 0) || 1;
    for (let i = 0; i < 4; i++) {
      this.si.push(k[i] ? k[i][0] : 0);
      this.sw.push(k[i] ? k[i][1] / tot : 0);
    }
    return this.n++;
  }
  tri(a, b, c) {
    this.idx.push(a, b, c);
  }
  // da vuelta los triángulos agregados desde `from` si miran para adentro
  orient(from, a, b, c, outward) {
    const P = this.p;
    const ax = P[b * 3] - P[a * 3];
    const ay = P[b * 3 + 1] - P[a * 3 + 1];
    const az = P[b * 3 + 2] - P[a * 3 + 2];
    const bx = P[c * 3] - P[a * 3];
    const by = P[c * 3 + 1] - P[a * 3 + 1];
    const bz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    if (nx * outward[0] + ny * outward[1] + nz * outward[2] >= 0) return;
    for (let i = from; i < this.idx.length; i += 3) {
      const t = this.idx[i + 1];
      this.idx[i + 1] = this.idx[i + 2];
      this.idx[i + 2] = t;
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    // costuras: los vértices repetidos comparten normal (si no, se ve una raya)
    const nr = g.attributes.normal;
    const v = new THREE.Vector3();
    for (const [a, b] of this.seams) {
      v.set(nr.getX(a) + nr.getX(b), nr.getY(a) + nr.getY(b), nr.getZ(a) + nr.getZ(b)).normalize();
      nr.setXYZ(a, v.x, v.y, v.z);
      nr.setXYZ(b, v.x, v.y, v.z);
    }
    return g;
  }
}

// Interpolación suave (Catmull-Rom) entre perfiles [t, ...valores]
function sample(keys, t) {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const k0 = keys[i - 1] ?? k1;
  const k3 = keys[i + 2] ?? k2;
  const u = Math.min(1, Math.max(0, (t - k1[0]) / (k2[0] - k1[0] || 1)));
  const u2 = u * u;
  const u3 = u2 * u;
  const out = [];
  for (let j = 1; j < k1.length; j++) {
    const p0 = k0[j] ?? 0;
    const p1 = k1[j] ?? 0;
    const p2 = k2[j] ?? 0;
    const p3 = k3[j] ?? 0;
    out.push(0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3));
  }
  return out;
}

// Superficie de revolución a lo largo de un eje.
// keys: [t, rx, rFrente, rAtrás, desplazamiento, dx]. Eje 'y': t es la altura y el frente es +z.
// Eje 'z': t va de atrás para adelante y el "frente" es arriba (+y); el desplazamiento es la altura.
// arc: [a0, a1] o (t) => [a0, a1] para un parche parcial (a = 0 es el frente).
export function loft(m, o) {
  const { keys, seg = 12, sub = 1, axis = 'y', x0 = 0, z0 = 0, cell, arc = null } = o;
  const e = 2 / (o.p ?? 2);
  const color = typeof o.color === 'function' ? o.color : () => o.color;
  const grow = typeof o.grow === 'function' ? o.grow : () => o.grow ?? 0;
  const weights = o.weights;
  let ts = [];
  for (let i = 0; i < keys.length - 1; i++) for (let k = 0; k <= sub; k++) ts.push(keys[i][0] + ((keys[i + 1][0] - keys[i][0]) * k) / (sub + 1));
  ts.push(keys[keys.length - 1][0]);
  // un tramo del perfil (from/to), con la misma curva que el perfil entero
  if (o.from != null || o.to != null) {
    const lo = o.from ?? -Infinity;
    const hi = o.to ?? Infinity;
    ts = ts.filter((t) => t > lo + 1e-4 && t < hi - 1e-4);
    if (o.from != null) ts.unshift(o.from);
    if (o.to != null) ts.push(o.to);
  }
  const t0 = ts[0];
  const t1 = ts[ts.length - 1];
  const full = !arc;
  const seamA = o.seam ?? -Math.PI; // dónde queda la costura (atrás, por defecto)
  const rows = [];
  const centers = [];
  for (let r = 0; r < ts.length; r++) {
    const t = ts[r];
    const k = sample(keys, t);
    const g = grow(t);
    const [a0, a1] = full ? [seamA, seamA + Math.PI * 2] : typeof arc === 'function' ? arc(t) : arc;
    const off = k[3] ?? 0;
    const dx = k[4] ?? 0;
    centers.push(axis === 'y' ? [x0 + dx, t, z0 + off] : [x0 + dx, off, z0 + t]);
    const row = [];
    for (let j = 0; j <= seg; j++) {
      const a = a0 + ((a1 - a0) * j) / seg;
      const s = Math.sin(a);
      const c = Math.cos(a);
      const rx = Math.max(0, k[0] + g);
      const rr = Math.max(0, (c >= 0 ? k[1] : k[2]) + g);
      let x;
      let y;
      let z;
      if (axis === 'y') {
        x = x0 + dx + rx * S(s, e);
        z = z0 + off + rr * S(c, e);
        y = t;
      } else {
        x = x0 + dx + rx * S(s, e);
        y = off + rr * S(c, e);
        z = z0 + t;
      }
      row.push(m.vert(x, y, z, j / seg, (t - t0) / (t1 - t0 || 1), color(t, a, x, y, z), weights(x, y, z, t, a), cell));
    }
    if (full) m.seams.push([row[0], row[seg]]);
    rows.push(row);
  }
  const from = m.idx.length;
  for (let r = 0; r < rows.length - 1; r++) {
    for (let j = 0; j < seg; j++) {
      const a = rows[r][j];
      const b = rows[r][j + 1];
      const c = rows[r + 1][j];
      const d = rows[r + 1][j + 1];
      m.tri(a, c, b);
      m.tri(b, c, d);
    }
  }
  // que las caras miren para afuera (o para adentro, si es la cara interna de un parche)
  const mid = Math.floor((rows.length - 1) / 2);
  const jq = Math.floor(seg / 4);
  const a = rows[mid][jq];
  const ctr = centers[mid];
  const P = m.p;
  let out = [P[a * 3] - ctr[0], P[a * 3 + 1] - ctr[1], P[a * 3 + 2] - ctr[2]];
  if (o.inside) out = out.map((v) => -v);
  m.orient(from, a, rows[mid + 1][jq], rows[mid][jq + 1], out);
  // tapas
  const cap = (r, dir) => {
    const k = sample(keys, ts[r]);
    const ctrp = centers[r];
    const w = weights(ctrp[0], ctrp[1], ctrp[2], ts[r], 0);
    const col = color(ts[r], 0, ctrp[0], ctrp[1], ctrp[2]);
    const cc = m.vert(ctrp[0], ctrp[1], ctrp[2], 0.5, r === 0 ? 0 : 1, col, w, cell);
    void k;
    const f = m.idx.length;
    for (let j = 0; j < seg; j++) m.tri(cc, rows[r][j], rows[r][j + 1]);
    const axisDir = axis === 'y' ? [0, dir, 0] : [0, 0, dir];
    m.orient(f, cc, rows[r][0], rows[r][1], axisDir);
  };
  if (o.capStart) cap(0, -1);
  if (o.capEnd) cap(rows.length - 1, 1);
}

// Elipsoide (orejas, rodete, bolsillos, pelota de la cola de caballo)
export function ellipsoid(m, cx, cy, cz, rx, ry, rz, o) {
  const keys = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = -1 + (2 * i) / n;
    const r = Math.sqrt(Math.max(0, 1 - t * t));
    keys.push([cy + t * ry, rx * r, rz * r, rz * r]);
  }
  loft(m, { ...o, keys, x0: cx, z0: cz, sub: 1 });
}

// Pesos a lo largo de una cadena de huesos (de arriba hacia abajo), mezclando cerca de cada
// articulación: así la piel se estira en vez de cortarse.
export function chain(bones, joints, blends) {
  const ids = bones.map((b) => B[b]);
  return (y) => {
    const out = [];
    let carry = 1;
    for (let j = 0; j < joints.length; j++) {
      const up = smooth(joints[j] - blends[j], joints[j] + blends[j], y);
      if (carry * up > 1e-4) out.push([ids[j], carry * up]);
      carry *= 1 - up;
      if (carry < 1e-4) return out;
    }
    out.push([ids[joints.length], carry]);
    return out;
  };
}

// ---------- Cabeza ----------
// Punto de la cabeza esculpida en (θ desde arriba, a alrededor con 0 = cara)
export function headPoint(th, a, h) {
  const nx = Math.sin(th) * Math.sin(a);
  const ny = Math.cos(th);
  const nz = Math.sin(th) * Math.cos(a);
  let x = nx * h.rx;
  let y = ny * h.ry;
  let z = nz * h.rz;
  const front = smooth(0.2, 0.65, nz);
  const ax = Math.abs(nx);
  // mandíbula: más angosta hacia el mentón (más en mujeres)
  if (ny < 0) {
    const k = smooth(0, -0.95, ny);
    x *= 1 - (h.female ? 0.24 : 0.15) * k;
  }
  // nuca: abajo y atrás se mete, ahí nace el cuello
  if (nz < 0 && ny < -0.15) z *= 1 - 0.28 * smooth(-0.15, -0.8, ny) * smooth(0, -0.7, nz);
  // parte de atrás de arriba un poco más llena
  if (nz < 0 && ny > 0) z *= 1 + 0.05 * smooth(0, 0.6, ny) * smooth(0, -0.8, nz);
  // frente un poco plana
  if (ny > 0.3) z *= 1 - 0.05 * front * smooth(0.3, 0.8, ny);
  // cejas
  z += front * (h.female ? 0.004 : 0.007) * gauss(ny - 0.23, 0.07) * gauss(nx, 0.5);
  // cuencas de los ojos
  z -= front * 0.007 * gauss(ax - 0.33, 0.12) * gauss(ny - 0.1, 0.07);
  // nariz: puente y punta
  const bridge = smooth(0.18, 0.0, ny) * (1 - smooth(-0.24, -0.34, ny));
  z += front * (h.female ? 0.017 : 0.022) * gauss(nx, 0.08 + 0.06 * smooth(-0.05, -0.28, ny)) * bridge * (0.55 + 0.45 * smooth(0.05, -0.24, ny));
  // pómulos
  const cheek = gauss(ax - 0.52, 0.16) * gauss(ny + 0.06, 0.13);
  z += front * 0.004 * cheek;
  x += Math.sign(nx) * 0.003 * cheek;
  // labios
  z += front * 0.005 * gauss(nx, 0.2) * gauss(ny + 0.5, 0.07);
  // mentón
  z += front * (h.female ? 0.005 : 0.009) * gauss(nx, 0.28) * gauss(ny + 0.83, 0.13);
  return [h.cx + x, h.cy + y, h.cz + z];
}

// cabeza entera: la textura de la cara cubre la mitad de adelante; atrás se estira el borde
export function head(m, h, cell, color, detail = 1) {
  const rows = Math.round(18 * detail);
  const cols = Math.round(24 * detail);
  const w = [[B.head, 1]];
  const grid = [];
  for (let r = 0; r <= rows; r++) {
    const th = (Math.PI * r) / rows;
    const row = [];
    for (let j = 0; j <= cols; j++) {
      const a = -Math.PI + (Math.PI * 2 * j) / cols;
      const [x, y, z] = headPoint(th, a, h);
      const u = Math.min(0.996, Math.max(0.004, 0.5 + a / Math.PI));
      row.push(m.vert(x, y, z, u, 1 - th / Math.PI, color, w, cell));
    }
    m.seams.push([row[0], row[cols]]);
    grid.push(row);
  }
  const from = m.idx.length;
  for (let r = 0; r < rows; r++)
    for (let j = 0; j < cols; j++) {
      m.tri(grid[r][j], grid[r + 1][j], grid[r][j + 1]);
      m.tri(grid[r][j + 1], grid[r + 1][j], grid[r + 1][j + 1]);
    }
  const r = Math.floor(rows / 2);
  const j = Math.floor(cols / 2);
  m.orient(from, grid[r][j], grid[r + 1][j], grid[r][j + 1], [0, 0, 1]);
}

// Casquete sobre la cabeza (pelo, gorra, capucha): cubre hasta un borde que cambia alrededor
// (más alto en la frente, más bajo en la nuca). thick(s, a): espesor con s = 0 arriba y 1 en el borde.
export function shell(m, h, o) {
  const rows = o.rows ?? 9;
  const cols = o.cols ?? 26;
  const w = [[B.head, 1]];
  const edge = (a) => {
    const c = Math.cos(a);
    let th = c >= 0 ? o.side + (o.front - o.side) * c : o.side + (o.back - o.side) * -c;
    // patillas delante de las orejas
    if (o.burns) th += o.burns * gauss(Math.abs(a) - Math.PI * 0.44, 0.09);
    return th * Math.PI;
  };
  const grid = [];
  const ctr = [h.cx, h.cy, h.cz];
  for (let r = 0; r <= rows; r++) {
    const s = r / rows;
    const row = [];
    for (let j = 0; j <= cols; j++) {
      const a = -Math.PI + (Math.PI * 2 * j) / cols;
      const th = Math.max(0.0001, s * edge(a));
      const p = headPoint(th, a, h);
      const dx = p[0] - ctr[0];
      const dy = p[1] - ctr[1];
      const dz = p[2] - ctr[2];
      const l = Math.hypot(dx, dy, dz) || 1;
      const t = o.thick(s, a, th);
      row.push(m.vert(p[0] + (dx / l) * t, p[1] + (dy / l) * t, p[2] + (dz / l) * t, j / cols, 1 - s, typeof o.color === 'function' ? o.color(s, a) : o.color, w, o.cell));
    }
    m.seams.push([row[0], row[cols]]);
    grid.push(row);
  }
  const from = m.idx.length;
  for (let r = 0; r < rows; r++)
    for (let j = 0; j < cols; j++) {
      m.tri(grid[r][j], grid[r + 1][j], grid[r][j + 1]);
      m.tri(grid[r][j + 1], grid[r + 1][j], grid[r + 1][j + 1]);
    }
  const r = Math.floor(rows / 2);
  const j = Math.floor(cols / 2);
  const a = grid[r][j];
  m.orient(from, a, grid[r + 1][j], grid[r][j + 1], [m.p[a * 3] - ctr[0], m.p[a * 3 + 1] - ctr[1], m.p[a * 3 + 2] - ctr[2]]);
}

// Cualquier geometría de three (cajas, cilindros) pegada a un hueso
export function prim(m, geo, bone, color, cell) {
  const g = geo.index ? geo : geo.toNonIndexed();
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const base = m.n;
  for (let i = 0; i < pos.count; i++) m.vert(pos.getX(i), pos.getY(i), pos.getZ(i), uv ? uv.getX(i) : 0.5, uv ? uv.getY(i) : 0.5, color, [[B[bone], 1]], cell);
  if (g.index) for (let i = 0; i < g.index.count; i++) m.idx.push(base + g.index.getX(i));
  else for (let i = 0; i < pos.count; i++) m.idx.push(base + i);
}
