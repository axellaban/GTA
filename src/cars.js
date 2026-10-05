// Autos con carrocería perfilada (Falcon, Duna, Gol, pickup, patrullero, remís).
// El perfil lateral se extruye a lo ancho con bordes redondeados; pintura con laca (clearcoat),
// vidrios polarizados y cromados que reflejan el cielo, llantas de revolución con rayos.
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BoxBuilder } from './builder.js';
import { Mesher, loft } from './body.js';

// Pintura con laca: una capa de barniz (clearcoat) arriba del color, como la de los autos de
// verdad. Los grises, azules y verdes son metalizados; el blanco, el negro y el rojo, lisos.
const paintCache = new Map();
const METALLIC = new Set([0x9aa3a8, 0x1f3a60, 0x3b5e2b, 0x2d6e8a, 0x6b3e26, 0xc9a227, 0x1d3f8c]);
export function paintMat(color) {
  if (!paintCache.has(color)) {
    const metal = METALLIC.has(color);
    paintCache.set(color, new THREE.MeshPhysicalMaterial({ color, metalness: metal ? 0.55 : 0.08, roughness: metal ? 0.38 : 0.5, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.6 }));
  }
  return paintCache.get(color);
}
// cromados (color por vértice) y vidrios polarizados
export const shinyMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 0.14, envMapIntensity: 1.6 });
// (polarizados pero no negros: se ven las butacas y el volante, como en los GTA)
export const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0b1015, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.7, transparent: true, opacity: 0.62 });
export const detailMat = new THREE.MeshLambertMaterial({ vertexColors: true });
// ruedas: goma casi negra y llanta plateada (un solo material, el color por vértice decide)
export const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.38 });
// luces: color por vértice, se sobreexponen de noche para que "brillen"
export const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
// traseras: apagadas, con el pie en el freno (se encienden fuerte) — main.js las ajusta de noche
export const tailMat = new THREE.MeshBasicMaterial({ vertexColors: true });
export const brakeMat = new THREE.MeshBasicMaterial({ vertexColors: true });
brakeMat.color.setScalar(2.6);

// Perfiles laterales: x = largo (frente en +x), y = alto. Medidas en metros.
const MODELS = {
  duna: { L: 4.2, W: 1.66, belt: 0.95, nose: 0.74, tail: 0.84, hood: 1.05, trunk: 0.85, roof: 1.4, glassF: 0.55, glassR: 0.45, wheelR: 0.31 },
  falcon: { L: 4.8, W: 1.82, belt: 0.93, nose: 0.76, tail: 0.84, hood: 1.35, trunk: 1.0, roof: 1.38, glassF: 0.55, glassR: 0.5, wheelR: 0.33 },
  gol: { L: 3.85, W: 1.66, belt: 0.97, nose: 0.76, tail: 0.95, hood: 0.95, trunk: 0.2, roof: 1.43, glassF: 0.6, glassR: 0.22, wheelR: 0.3 },
  pickup: { L: 4.95, W: 1.8, belt: 1.02, nose: 0.86, tail: 1.0, hood: 1.15, trunk: 2.15, roof: 1.62, glassF: 0.45, glassR: 0.1, wheelR: 0.36, bed: true },
  patrullero: { L: 4.45, W: 1.72, belt: 0.95, nose: 0.74, tail: 0.84, hood: 1.15, trunk: 0.9, roof: 1.4, glassF: 0.55, glassR: 0.45, wheelR: 0.32 },
  remis: { L: 4.3, W: 1.7, belt: 0.95, nose: 0.74, tail: 0.84, hood: 1.1, trunk: 0.88, roof: 1.4, glassF: 0.55, glassR: 0.45, wheelR: 0.31 },
  taxi: { L: 4.3, W: 1.7, belt: 0.95, nose: 0.74, tail: 0.84, hood: 1.1, trunk: 0.88, roof: 1.4, glassF: 0.55, glassR: 0.45, wheelR: 0.31 },
  p504: { L: 4.5, W: 1.69, belt: 0.93, nose: 0.72, tail: 0.86, hood: 1.2, trunk: 1.05, roof: 1.42, glassF: 0.5, glassR: 0.55, wheelR: 0.31 },
  fiat600: { L: 3.3, W: 1.38, belt: 0.88, nose: 0.7, tail: 0.75, hood: 0.7, trunk: 0.7, roof: 1.38, glassF: 0.35, glassR: 0.4, wheelR: 0.27 },
  trafic: { L: 4.65, W: 1.8, belt: 1.05, nose: 0.88, tail: 1.05, hood: 0.72, trunk: 0.04, roof: 2.0, glassF: 0.42, glassR: 0.03, wheelR: 0.33 },
  // Ferrucho: superdeportivo italiano de los 80 (parodia, como los autos de los GTA): cuña baja y
  // ancha, trompa afilada, cola alta y plana con rejilla, tomas laterales en las puertas
  ferrucho: { L: 4.5, W: 1.98, belt: 0.8, nose: 0.58, tail: 0.86, hood: 1.55, trunk: 1.2, roof: 1.17, glassF: 0.82, glassR: 0.55, wheelR: 0.34, sport: true },
  ferrucho_open: { L: 4.5, W: 1.98, belt: 0.8, nose: 0.58, tail: 0.86, hood: 1.55, trunk: 1.2, roof: 1.17, glassF: 0.82, glassR: 0.55, wheelR: 0.34, sport: true, open: true },
};

function extrudeX(shape, width, bevel = 0.05, round = false) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    // round: bisel ancho y hacia adentro, para que la carrocería tenga los cantos redondos sin crecer
    bevelOffset: round ? -bevel : 0,
    bevelSegments: round ? 5 : 2,
    curveSegments: 10,
  });
  // shape.x (largo) -> z del mundo; profundidad -> x
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2 - bevel, 0, 0);
  return g;
}

function bodyShape(m) {
  const { L, belt, nose, tail, hood, trunk, wheelR } = m;
  const f = L / 2;
  const r = -L / 2;
  const wf = f - 0.82;
  const wr = r + 0.82;
  const ar = wheelR + 0.07;
  const low = 0.3;
  const s = new THREE.Shape();
  s.moveTo(r, low + 0.05);
  s.lineTo(r, tail - 0.08);
  s.quadraticCurveTo(r, tail, r + 0.1, tail + 0.03);
  if (m.bed) {
    s.lineTo(r + 0.05, belt);
  } else {
    s.lineTo(r + trunk * 0.95, belt - 0.02);
  }
  s.lineTo(f - hood, belt);
  s.lineTo(f - 0.15, nose + 0.08);
  s.quadraticCurveTo(f, nose + 0.05, f, nose - 0.05);
  s.lineTo(f, low + 0.08);
  s.lineTo(wf + ar, low);
  s.absarc(wf, low, ar, 0, Math.PI, false);
  s.lineTo(wr + ar, low);
  s.absarc(wr, low, ar, 0, Math.PI, false);
  s.lineTo(r + 0.05, low);
  return s;
}

// Carrocería como superficie continua a lo largo del auto (eje z): esquinas redondeadas vistas
// desde arriba, secciones con cantos suaves y pasaruedas que siguen el arco de la rueda.
function bodyLoft(m) {
  const { L, W, belt, nose, tail, hood, trunk, wheelR } = m;
  const f = L / 2;
  const low = 0.3;
  const ar = wheelR + 0.07;
  const corner = Math.min(0.34, W * 0.2);
  const top = (z) => {
    if (z > f - 0.15) return nose + 0.05 - ((z - (f - 0.15)) / 0.15) ** 2 * 0.1;
    if (z > f - hood) return belt + ((z - (f - hood)) / (hood - 0.15)) * (nose + 0.05 - belt);
    const rearEnd = m.bed ? -f + 0.05 : -f + trunk * 0.95;
    if (z < -f + 0.1) return tail - 0.02 - ((-f + 0.1 - z) / 0.1) ** 2 * 0.06;
    if (z < rearEnd) return tail + 0.03 + ((z - (-f + 0.1)) / Math.max(0.01, rearEnd + f - 0.1)) * (belt - 0.02 - tail - 0.03);
    return belt;
  };
  const bottom = (z) => {
    let b = low + 0.02;
    for (const zw of [f - 0.82, -f + 0.82]) {
      const d = Math.abs(z - zw);
      if (d < ar) b = Math.max(b, low + Math.sqrt(ar * ar - d * d));
    }
    // paragolpes: la trompa y la cola suben un poco abajo
    const end = Math.max(0, Math.abs(z) - (f - 0.25)) / 0.25;
    return b + end * end * 0.1;
  };
  const halfW = (z) => {
    const d = Math.max(0, corner - (f - Math.abs(z)));
    return W / 2 - (corner - Math.sqrt(Math.max(0, corner * corner - d * d)));
  };
  const keys = [];
  const n = Math.round(L / 0.06);
  for (let i = 0; i <= n; i++) {
    const z = -f + (L * i) / n;
    const t = top(z);
    const b = bottom(z);
    keys.push([z, halfW(z), (t - b) / 2, (t - b) / 2, (t + b) / 2]);
  }
  const mesh = new Mesher();
  loft(mesh, { keys, axis: 'z', seg: 26, sub: 0, p: 4.2, capStart: true, capEnd: true, color: 0xffffff, cell: { u0: 0, u1: 1, v0: 0, v1: 1 }, weights: () => [[0, 1]] });
  const g = mesh.build();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position);
  out.setAttribute('normal', g.attributes.normal);
  out.setIndex(g.index);
  return out.toNonIndexed();
}

// la cabina se angosta hacia arriba (los costados se inclinan hacia adentro)
function tumblehome(g, belt, roof, k = 0.13) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) - belt) / (roof - belt)));
    p.setX(i, p.getX(i) * (1 - k * t));
  }
  g.computeVertexNormals();
  return g;
}

function cabinPts(m) {
  const { L, belt, hood, trunk, roof, glassF, glassR } = m;
  const f = L / 2 - hood;
  const r = m.bed ? -L / 2 + trunk : -L / 2 + trunk;
  return [
    [r, belt],
    [r + glassR, roof],
    [f - glassF, roof],
    [f, belt],
  ];
}

function polyShape(pts) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
}

function inset(pts, d) {
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return pts.map(([x, y]) => [x + Math.sign(cx - x) * d, y + Math.sign(cy - y) * d * 0.8]);
}

function colorize(g, color) {
  const n = g.attributes.position.count;
  const c = new THREE.Color(color);
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function clean(g) {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') out.deleteAttribute(k);
  return out;
}

const geoCache = new Map();
function buildModel(name) {
  if (geoCache.has(name)) return geoCache.get(name);
  const m = MODELS[name];
  const { L, W, belt, roof } = m;
  // carrocería pintada: parte baja + techo + marcos laterales de las ventanillas
  const paint = [];
  paint.push(bodyLoft(m));
  const cab = cabinPts(m);
  const roofPts = [
    [cab[1][0] - 0.02, roof - 0.05],
    [cab[2][0] + 0.02, roof - 0.05],
    [cab[2][0], roof + 0.03],
    [cab[1][0], roof + 0.03],
  ];
  // descapotable: sin techo ni marcos de ventanillas
  if (!m.open) paint.push(tumblehome(clean(extrudeX(polyShape(roofPts), W * 0.9, 0.05, true)), belt, roof));
  for (const s of m.open ? [] : [-1, 1]) {
    const frame = polyShape(cab);
    const inner = inset(cab, 0.07);
    const mid = (inner[0][0] + inner[3][0]) / 2 - 0.1;
    // dos ventanillas separadas por el parante del medio
    const w1 = [inner[0], inner[1], [mid - 0.05, inner[1][1]], [mid - 0.05, inner[0][1]]];
    const w2 = [[mid + 0.05, inner[0][1]], [mid + 0.05, inner[2][1]], inner[2], inner[3]];
    frame.holes.push(new THREE.Path(w1.map(([x, y]) => new THREE.Vector2(x, y))));
    frame.holes.push(new THREE.Path(w2.map(([x, y]) => new THREE.Vector2(x, y))));
    const g = new THREE.ExtrudeGeometry(frame, { depth: 0.04, bevelEnabled: false });
    g.rotateY(-Math.PI / 2);
    g.translate(s * (W * 0.44) + 0.02, 0, 0);
    paint.push(tumblehome(clean(g), belt, roof));
  }
  if (m.bed) {
    // caja de la camioneta
    const bx = -L / 2;
    const bl = m.trunk;
    for (const s of [-1, 1]) paint.push(clean(new THREE.BoxGeometry(0.06, 0.32, bl).translate(s * (W / 2 - 0.05), belt + 0.12, bx + bl / 2)));
    paint.push(clean(new THREE.BoxGeometry(W, 0.32, 0.06).translate(0, belt + 0.12, bx + 0.05)));
  }
  const paintGeo = mergeGeometries(paint);
  paintGeo.computeVertexNormals();

  // vidrios polarizados
  // el descapotable tiene solo el parabrisas
  const ws = (roof - belt) * 0.62;
  const glassGeo = m.open
    ? tumblehome(clean(extrudeX(polyShape([[cab[3][0], belt], [cab[3][0] - m.glassF * 0.6, belt + ws], [cab[3][0] - m.glassF * 0.6 - 0.06, belt + ws], [cab[3][0] - 0.07, belt]]), W * 0.86, 0.02, true)), belt, roof)
    : tumblehome(clean(extrudeX(polyShape(inset(cab, 0.01)), W * 0.86, 0.04, true)), belt, roof);
  // cromados
  const shiny = [];
  // paragolpes cromados: un poco más angostos que la carrocería (que tiene las esquinas redondas)
  for (const z of [L / 2 + 0.01, -L / 2 - 0.01]) shiny.push(colorize(clean(new THREE.BoxGeometry(W - 0.12, 0.13, 0.1).translate(0, 0.44, z)), 0xd8d8d8));
  // manijas y marco de parrilla
  for (const s of [-1, 1]) {
    shiny.push(colorize(clean(new THREE.BoxGeometry(0.03, 0.03, 0.14).translate(s * (W / 2 + 0.01), belt - 0.12, 0.2)), 0xcfcfcf));
    shiny.push(colorize(clean(new THREE.BoxGeometry(0.03, 0.03, 0.14).translate(s * (W / 2 + 0.01), belt - 0.12, -0.75)), 0xcfcfcf));
  }
  shiny.push(colorize(clean(new THREE.BoxGeometry(W * 0.6, 0.2, 0.03).translate(0, m.nose - 0.18, L / 2 + 0.005)), 0xbdbdbd));
  const roundLights = name === 'falcon' || name === 'patrullero';
  for (const s of [-1, 1]) {
    const bezel = roundLights ? new THREE.TorusGeometry(0.092, 0.014, 6, 16) : new THREE.BoxGeometry(0.33, 0.16, 0.02);
    shiny.push(colorize(clean(bezel.translate(s * (W / 2 - (roundLights ? 0.22 : 0.25)), m.nose - 0.12, L / 2 + (roundLights ? 0.03 : 0.012))), 0xe0e0e0));
  }
  const shinyGeo = mergeGeometries(shiny);

  // detalles oscuros: parrilla, patentes, espejos, bajo, pasaruedas
  const D = new BoxBuilder();
  D.box(W * 0.56, 0.16, 0.04, 0x141414, 0, m.nose - 0.18, L / 2 + 0.01);
  for (let i = 0; i < 4; i++) D.box(W * 0.56, 0.012, 0.045, 0x8a8a8a, 0, m.nose - 0.24 + i * 0.04, L / 2 + 0.012);
  for (const z of [L / 2 + 0.06, -L / 2 - 0.06]) {
    // patente Mercosur: blanca con franja azul
    D.box(0.42, 0.12, 0.02, 0xf2f2f2, 0, 0.58, z);
    D.box(0.42, 0.03, 0.022, 0x1a3f9a, 0, 0.625, z);
    D.box(0.3, 0.035, 0.024, 0x1a1a1a, 0, 0.565, z);
  }
  for (const s of [-1, 1]) {
    // espejo con su brazo, pegado a la puerta (antes flotaba al costado)
    D.box(0.13, 0.09, 0.05, 0x1a1a1a, s * (W / 2 + 0.03), belt + 0.11, cab[3][0] - 0.12);
    D.box(0.12, 0.03, 0.035, 0x1a1a1a, s * (W / 2 - 0.05), belt + 0.06, cab[3][0] - 0.1);
    // líneas de puertas
    // líneas de puertas y franja de abajo, pegadas a la carrocería (que se mete hacia el zócalo)
    D.box(0.012, belt - 0.5, 0.015, 0x222222, s * (W / 2 - 0.004), (belt + 0.48) / 2, cab[3][0] - 0.05);
    D.box(0.012, belt - 0.5, 0.015, 0x222222, s * (W / 2 - 0.004), (belt + 0.48) / 2, (cab[0][0] + cab[3][0]) / 2 - 0.1);
    D.box(0.03, 0.05, L * 0.62, 0x1d1d1d, s * (W / 2 * 0.955), 0.47, 0);
  }
  D.box(W * 0.9, 0.12, L * 0.8, 0x0f0f0f, 0, 0.28, 0);
  for (const z of [L / 2 - 0.82, -L / 2 + 0.82]) D.box(W * 0.94, 0.3, m.wheelR * 2.2, 0x0a0a0a, 0, 0.45, z);
  if (name === 'patrullero') {
    D.box(0.95, 0.12, 0.28, 0x1565c0, -0.25, roof + 0.09, (cab[1][0] + cab[2][0]) / 2);
    D.box(0.95, 0.12, 0.28, 0xc62828, 0.25, roof + 0.09, (cab[1][0] + cab[2][0]) / 2);
  }
  if (name === 'remis') D.box(0.6, 0.18, 0.22, 0xffd600, 0, roof + 0.12, (cab[1][0] + cab[2][0]) / 2);
  if (name === 'taxi') {
    // taxi porteño: negro con techo amarillo y el cartel de LIBRE
    D.box(W * 0.76, 0.05, cab[2][0] - cab[1][0] + 0.05, 0xf5c400, 0, roof + 0.05, (cab[1][0] + cab[2][0]) / 2);
    D.box(0.5, 0.16, 0.2, 0xf5c400, 0, roof + 0.16, (cab[1][0] + cab[2][0]) / 2);
  }
  if (name === 'trafic') {
    // puerta corrediza y paragolpes negros
    for (const s of [-1, 1]) D.box(0.012, 0.9, 1.1, 0x222222, s * (W / 2 + 0.003), 1.2, -0.2);
    D.box(W + 0.02, 0.18, 0.12, 0x1a1a1a, 0, 0.45, L / 2 + 0.02);
    D.box(W + 0.02, 0.18, 0.12, 0x1a1a1a, 0, 0.45, -L / 2 - 0.02);
  }
  if (m.sport) {
    // tomas laterales con aletas (de la puerta a la rueda de atrás) y rejilla negra en la cola
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) D.box(0.02, 0.025, 1.5, 0x111111, s * (W / 2 + 0.003), 0.5 + i * 0.065, -0.55);
    }
    D.box(W * 0.84, 0.2, 0.03, 0x0d0d0d, 0, m.tail - 0.16, -L / 2 - 0.012);
    for (let i = 0; i < 4; i++) D.box(W * 0.84, 0.012, 0.035, 0x5a5a5a, 0, m.tail - 0.24 + i * 0.05, -L / 2 - 0.014);
    // faros escamoteables (las tapas cerradas sobre la trompa)
    for (const s of [-1, 1]) D.box(0.34, 0.035, 0.26, 0x222222, s * (W / 2 - 0.36), m.nose + 0.04, L / 2 - 0.38);
  }
  if (!m.open) {
    // adentro (se ve por los vidrios): tablero, volante, dos butacas y el asiento de atrás
    const zf = cab[3][0];
    const zr = cab[0][0];
    const seat = name === 'trafic' ? 0x2a2a2a : [0x5b3a29, 0x2b2b2b, 0x6b5a48, 0x3a3f5a][Math.round(L * 10) % 4];
    D.box(W * 0.82, 0.16, 0.3, 0x141414, 0, belt + 0.02, zf - 0.22);
    D.add(new THREE.TorusGeometry(0.17, 0.025, 6, 18).rotateX(-0.35), 0x111111, -W * 0.22, belt + 0.12, zf - 0.48);
    for (const s of [-1, 1]) {
      D.box(0.46, 0.12, 0.46, seat, s * W * 0.22, belt - 0.22, zf - 0.85);
      // respaldo y apoyacabezas, siempre por debajo del techo (los autos bajos tienen poca cabina)
      const top = Math.min(belt + 0.54, roof - 0.12);
      D.box(0.46, top - 0.16 - (belt - 0.22), 0.1, seat, s * W * 0.22, (top - 0.16 + belt - 0.22) / 2, zf - 1.12);
      D.box(0.24, 0.14, 0.08, seat, s * W * 0.22, top - 0.07, zf - 1.14);
    }
    if (zf - zr > 1.9) {
      D.box(W * 0.78, 0.12, 0.45, seat, 0, belt - 0.22, zr + 0.45);
      D.box(W * 0.78, Math.min(0.55, roof - 0.16 - (belt - 0.22)), 0.1, seat, 0, (Math.min(belt + 0.33, roof - 0.16) + belt - 0.22) / 2, zr + 0.2);
    }
  }
  if (m.open) {
    // adentro: piso, tablero y dos butacas de cuero
    D.box(W * 0.84, 0.05, 1.7, 0x1a1a1a, 0, 0.5, -0.1);
    D.box(W * 0.8, 0.18, 0.22, 0x151515, 0, belt - 0.02, cab[3][0] - 0.2);
    for (const s of [-1, 1]) {
      D.box(0.5, 0.14, 0.5, 0x7a2a1c, s * 0.42, 0.6, -0.25);
      D.box(0.5, 0.55, 0.12, 0x7a2a1c, s * 0.42, 0.85, -0.52);
    }
  }
  // luces de retroceso: el vidrio blanco al lado de las traseras
  for (const s of [-1, 1]) D.box(0.08, 0.1, 0.035, 0xd8d8d2, s * (W / 2 - 0.5), m.tail - 0.14, -L / 2 - 0.004);
  const detailGeo = D.mesh().geometry;

  // luces delanteras y traseras
  const Lb = new BoxBuilder();
  const round = name === 'falcon' || name === 'patrullero';
  for (const s of [-1, 1]) {
    if (round) Lb.add(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 12).rotateX(Math.PI / 2), 0xfff3cf, s * (W / 2 - 0.22), m.nose - 0.12, L / 2 + 0.02);
    else Lb.box(0.3, 0.13, 0.04, 0xfff3cf, s * (W / 2 - 0.25), m.nose - 0.12, L / 2 + 0.02);
    Lb.box(0.1, 0.06, 0.04, 0xffa000, s * (W / 2 - 0.13), m.nose - 0.2, L / 2 + 0.01);
  }
  const lightGeo = Lb.mesh().geometry;
  const Tb = new BoxBuilder();
  for (const s of [-1, 1]) {
    Tb.box(0.28, 0.14, 0.04, 0xb01010, s * (W / 2 - 0.3), m.tail - 0.14, -L / 2 - 0.005);
  }
  const tailGeo = Tb.mesh().geometry;

  // rueda: cubierta con hombros redondos, llanta con rayos y tapa (de revolución, eje x)
  const Wb = new BoxBuilder();
  const wr = m.wheelR;
  const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg).rotateZ(-Math.PI / 2);
  Wb.add(
    lathe(
      [
        [wr * 0.66, -0.1],
        [wr * 0.9, -0.108],
        [wr * 0.99, -0.085],
        [wr, -0.04],
        [wr, 0.04],
        [wr * 0.99, 0.085],
        [wr * 0.9, 0.108],
        [wr * 0.66, 0.1],
      ],
      20,
    ),
    0x161616,
  );
  // llanta: aro, plato hundido y tapa
  Wb.add(
    lathe(
      [
        [wr * 0.67, 0.1],
        [wr * 0.62, 0.108],
        [wr * 0.56, 0.085],
        [wr * 0.25, 0.075],
        [wr * 0.18, 0.1],
        [0.001, 0.105],
      ],
      18,
    ),
    0xb9bcc0,
  );
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.BoxGeometry(0.03, wr * 0.36, wr * 0.13);
    sp.translate(0.084, wr * 0.39, 0);
    sp.rotateX((i / 5) * Math.PI * 2);
    Wb.add(sp, 0x9ea2a6);
  }
  // banda blanca en las gomas de los clásicos (bien de los 80)
  if (['falcon', 'p504', 'fiat600', 'duna', 'pickup'].includes(name)) Wb.add(lathe([[wr * 0.86, 0.114], [wr * 0.71, 0.112]], 20), 0xf1efe6);
  // del lado de adentro, un disco oscuro (se ve por la llanta)
  Wb.add(new THREE.CylinderGeometry(wr * 0.6, wr * 0.6, 0.02, 14).rotateZ(-Math.PI / 2).translate(-0.06, 0, 0), 0x202020);
  const wheelGeo = Wb.mesh().geometry;
  // puerta del conductor (del lado por donde sube Gaspi, x negativa): pieza aparte con la bisagra
  // adelante. Cerrada no se ve (la carrocería ya la tiene dibujada); al abrirse aparece con el hueco
  // oscuro de la cabina detrás.
  let door = null;
  if (name !== 'trafic') {
    const zf = cab[3][0] - 0.05;
    const zm = (cab[0][0] + cab[3][0]) / 2 - 0.1;
    const len = zf - zm;
    const lo = 0.46;
    const winH = m.open ? 0.02 : Math.max(0.2, roof - 0.1 - belt);
    const panel = clean(new THREE.BoxGeometry(0.05, belt - lo, len).translate(-0.025, (belt + lo) / 2, -len / 2));
    // marco de la ventanilla: arriba y atrás
    const frameTop = clean(new THREE.BoxGeometry(0.035, 0.05, len - 0.08).translate(-0.02, belt + winH, -len / 2 - 0.04));
    const frameBack = clean(new THREE.BoxGeometry(0.035, winH, 0.05).translate(-0.02, belt + winH / 2, -len + 0.025));
    const doorPaint = mergeGeometries(m.open ? [panel] : [panel, frameTop, frameBack]);
    doorPaint.computeVertexNormals();
    const doorGlass = m.open ? new THREE.BufferGeometry() : new THREE.BoxGeometry(0.015, winH - 0.03, len - 0.14).translate(-0.02, belt + winH / 2, -len / 2 - 0.02);
    const doorHandle = colorize(clean(new THREE.BoxGeometry(0.03, 0.03, 0.14).translate(-0.06, belt - 0.12, -len + 0.25)), 0xcfcfcf);
    // adentro: tapizado oscuro y el borde del asiento
    const Hb = new BoxBuilder();
    Hb.box(0.01, belt - lo + winH * 0.5, len - 0.04, 0x161616, 0, (lo + belt + winH * 0.5) / 2, -len / 2);
    Hb.box(0.012, 0.14, len * 0.55, 0x3b2f28, 0.004, belt - 0.32, -len * 0.62);
    door = { zf, len, paint: doorPaint, glass: doorGlass, handle: doorHandle, hole: Hb.mesh().geometry };
  }
  const out = { m, paintGeo, shinyGeo, glassGeo, detailGeo, lightGeo, tailGeo, wheelGeo, door };
  geoCache.set(name, out);
  return out;
}

// Capó aparte (bisagra del lado del parabrisas): con mucho daño salta la traba, se levanta y flamea
// con el viento (lo mueve Combat.updateVehicles). Abajo, el motor: solo se ve con el capó abierto.
const bayMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.7, metalness: 0.3 });
const engineMat = new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.5, metalness: 0.6 });
const hoodCache = new Map();
function makeHood(m, paint) {
  const key = `${m.L}|${m.W}|${m.hood}|${m.nose}|${m.belt}`;
  if (!hoodCache.has(key)) {
    const f = m.L / 2;
    const z0 = f - m.hood + 0.04;
    const z1 = f - 0.17;
    // la misma pendiente que la carrocería (bodyLoft: top)
    const top = (z) => m.belt + ((z - (f - m.hood)) / (m.hood - 0.15)) * (m.nose + 0.05 - m.belt);
    const y0 = top(z0) + 0.014;
    const y1 = top(z1) + 0.014;
    const len = Math.hypot(z1 - z0, y1 - y0);
    const w = m.W * 0.8;
    const panel = new THREE.BoxGeometry(w, 0.025, len).translate(0, 0, len / 2).rotateX(-Math.atan2(y1 - y0, z1 - z0));
    // motor: chapa negra y un block con tapa de cilindros, sobre la pendiente del capó
    const bay = [new THREE.BoxGeometry(w * 0.98, 0.012, len * 0.96).translate(0, 0, len / 2)];
    const block = new THREE.BoxGeometry(w * 0.45, 0.14, len * 0.5).translate(0, 0.07, len * 0.45);
    const bayGeo = mergeGeometries(bay).rotateX(-Math.atan2(y1 - y0, z1 - z0)).translate(0, y0 - 0.008, z0);
    const blockGeo = block.rotateX(-Math.atan2(y1 - y0, z1 - z0)).translate(0, y0 - 0.008, z0);
    hoodCache.set(key, { panel, bayGeo, blockGeo, y0, z0 });
  }
  const H = hoodCache.get(key);
  const pivot = new THREE.Group();
  pivot.position.set(0, H.y0, H.z0);
  const lid = new THREE.Mesh(H.panel, paint);
  lid.userData.paint = true; // (la sombra ya la tira la carrocería, que tiene la misma forma)
  pivot.add(lid);
  const bay = new THREE.Group();
  bay.add(new THREE.Mesh(H.bayGeo, bayMat), new THREE.Mesh(H.blockGeo, engineMat));
  bay.visible = false;
  // cerrado no se ve (la carrocería ya tiene la forma del capó); aparece cuando salta la traba
  pivot.visible = false;
  return { pivot, bay, k: 0 };
}

// las cuatro ruedas del modelo juntas (las de la izquierda espejadas, con la cara para afuera)
// dónde va cada rueda (x, y del eje, z): delanteras primero, las que doblan
function wheelSpots(M) {
  if (M.wheelPos) return M.wheelPos;
  const { W, L, wheelR } = M.m;
  return [
    [-W / 2 + 0.12, wheelR, L / 2 - 0.82],
    [W / 2 - 0.12, wheelR, L / 2 - 0.82],
    [-W / 2 + 0.12, wheelR, -L / 2 + 0.82],
    [W / 2 - 0.12, wheelR, -L / 2 + 0.82],
  ];
}
function farWheels(M) {
  if (M.farWheels) return M.farWheels;
  const parts = [];
  for (const [x, y, z] of wheelSpots(M)) {
    const g = M.wheelGeo.clone();
    if (x < 0) {
      g.scale(-1, 1, 1);
      // espejar invierte el orden de los vértices: se da vuelta cada triángulo
      if (g.index) {
        const a = g.index.array;
        for (let i = 0; i < a.length; i += 3) [a[i + 1], a[i + 2]] = [a[i + 2], a[i + 1]];
      } else {
        for (const att of Object.values(g.attributes)) {
          const n = att.itemSize;
          const a = att.array;
          for (let v = 0; v < att.count; v += 3) {
            for (let c = 0; c < n; c++) [a[(v + 1) * n + c], a[(v + 2) * n + c]] = [a[(v + 2) * n + c], a[(v + 1) * n + c]];
          }
        }
      }
    }
    parts.push(g.translate(x, y, z));
  }
  M.farWheels = mergeGeometries(parts);
  return M.farWheels;
}

// ---------- Tuning, para que haya autos con onda (franjas, alerón, llantas, bajado y neón abajo) ----------
const TUNABLE = new Set(['duna', 'falcon', 'gol', 'pickup', 'p504', 'fiat600']);
const stripeMats = [0xf4f4f4, 0x111111, 0xffd21f].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.32, metalness: 0.1 }));
const rimMats = [
  Object.assign(wheelMat.clone(), { metalness: 0.95, roughness: 0.18 }),
  Object.assign(wheelMat.clone(), { metalness: 1, roughness: 0.06, envMapIntensity: 2.2 }),
];
rimMats[0].color.set(0xf0c050);
// neón abajo del auto: un rectángulo de luz difusa en el piso, prendido de noche (setUnderglow)
let glowTex = null;
const UNDERGLOW = new Map();
function underglowMat(color) {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 128;
    const g = c.getContext('2d');
    const img = g.createImageData(64, 128);
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 64; x++) {
        const dx = Math.max(0, Math.abs(x - 31.5) - 16) / 16;
        const dy = Math.max(0, Math.abs(y - 63.5) - 44) / 20;
        const k = Math.max(0, 1 - Math.hypot(dx, dy)) ** 2;
        img.data.set([255 * k, 255 * k, 255 * k, 255], (y * 64 + x) * 4);
      }
    g.putImageData(img, 0, 0);
    glowTex = new THREE.CanvasTexture(c);
  }
  if (!UNDERGLOW.has(color)) UNDERGLOW.set(color, new THREE.MeshBasicMaterial({ color, map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, visible: false, toneMapped: false }));
  return UNDERGLOW.get(color);
}
export function setUnderglow(k) {
  for (const m of UNDERGLOW.values()) {
    m.opacity = k;
    m.visible = k > 0.01;
  }
}
// tiras sobre el capó y el techo, siguiendo la pendiente de la carrocería
function stripesGeo(M) {
  if (M.stripes) return M.stripes;
  const m = M.m;
  const f = m.L / 2;
  const cab = cabinPts(m);
  const top = (z) => m.belt + ((z - (f - m.hood)) / (m.hood - 0.15)) * (m.nose + 0.05 - m.belt);
  const parts = [];
  for (const sx of [-0.12, 0.12]) {
    const z0 = f - m.hood + 0.05;
    const z1 = f - 0.2;
    const y0 = top(z0) + 0.007;
    const y1 = top(z1) + 0.007;
    parts.push(new THREE.BoxGeometry(0.11, 0.008, Math.hypot(z1 - z0, y1 - y0)).rotateX(-Math.atan2(y1 - y0, z1 - z0)).translate(sx, (y0 + y1) / 2, (z0 + z1) / 2));
    parts.push(new THREE.BoxGeometry(0.11, 0.008, cab[2][0] - cab[1][0] - 0.08).translate(sx, m.roof + 0.034, (cab[1][0] + cab[2][0]) / 2));
  }
  M.stripes = mergeGeometries(parts);
  return M.stripes;
}
// alerón sobre la cola del baúl (los que tienen baúl)
function spoilerGeo(M) {
  if (M.spoiler !== undefined) return M.spoiler;
  const m = M.m;
  if (m.bed || m.trunk < 0.7) return (M.spoiler = null);
  const f = m.L / 2;
  const rearEnd = -f + m.trunk * 0.95;
  const z = -f + 0.22;
  const y = m.tail + 0.03 + ((z - (-f + 0.1)) / Math.max(0.01, rearEnd + f - 0.1)) * (m.belt - 0.02 - m.tail - 0.03);
  const parts = [new THREE.BoxGeometry(m.W * 0.86, 0.035, 0.26).rotateX(0.12).translate(0, y + 0.17, z - 0.02)];
  for (const s of [-1, 1]) parts.push(new THREE.BoxGeometry(0.05, 0.17, 0.12).translate(s * m.W * 0.3, y + 0.08, z));
  for (const s of [-1, 1]) parts.push(new THREE.BoxGeometry(0.025, 0.12, 0.3).translate(s * m.W * 0.43, y + 0.19, z - 0.02));
  M.spoiler = mergeGeometries(parts);
  M.spoiler.computeVertexNormals();
  return M.spoiler;
}
const NEON_UNDER = [0xff2fa0, 0x22e0ff, 0x8a4dff, 0x39ff7a];
function tuneCar(g, M, u, rnd) {
  const kit = { stripes: rnd() < 0.55, spoiler: rnd() < 0.5, rims: rnd() < 0.7 ? (rnd() < 0.5 ? 0 : 1) : -1, low: rnd() < 0.6, neon: rnd() < 0.55 };
  if (kit.stripes) {
    const s = new THREE.Mesh(stripesGeo(M), stripeMats[Math.floor(rnd() * stripeMats.length)]);
    u.chassis.add(s);
    u.lodParts.push(s);
  }
  const sp = kit.spoiler && spoilerGeo(M);
  if (sp) {
    const m = new THREE.Mesh(sp, u.body.material);
    m.userData.paint = true;
    m.castShadow = true;
    u.chassis.add(m);
  }
  if (kit.rims >= 0) {
    for (const w of u.wheels) w.material = rimMats[kit.rims];
    u.wheelsFar.material = rimMats[kit.rims];
  }
  if (kit.low) {
    u.ride = -0.055;
    u.chassis.position.y = u.ride;
  }
  if (kit.neon) {
    const n = new THREE.Mesh(new THREE.PlaneGeometry(M.m.W * 1.3, M.m.L * 1.08).rotateX(-Math.PI / 2), underglowMat(NEON_UNDER[Math.floor(rnd() * NEON_UNDER.length)]));
    n.position.y = 0.04;
    n.renderOrder = 2;
    g.add(n);
  }
  u.tuned = kit;
}

// tune: probabilidad de que salga tuneado (el tránsito y las picadas lo piden; la cana y las misiones no)
export function makeCar(model = 'duna', color = 0xd8d4c8, { parked = false, tune = 0 } = {}) {
  if (model.startsWith('q_')) {
    if (QCARS[model]) return makeQCar(model, color);
    model = 'duna';
  }
  const M = buildModel(model);
  const { L, W } = M.m;
  const g = new THREE.Group();
  const paintColor = model === 'remis' || model === 'taxi' ? 0x151515 : model === 'patrullero' ? 0x1d3f8c : color;
  const body = new THREE.Mesh(M.paintGeo, paintMat(paintColor));
  body.userData.paint = true;
  const shiny = new THREE.Mesh(M.shinyGeo, shinyMat);
  const glass = new THREE.Mesh(M.glassGeo, glassMat);
  const detail = new THREE.Mesh(M.detailGeo, detailMat);
  const lights = new THREE.Mesh(M.lightGeo, lightMat);
  const tail = new THREE.Mesh(M.tailGeo, tailMat);
  for (const o of [body, shiny, glass, detail]) {
    o.castShadow = true;
    o.receiveShadow = true;
  }
  // la carrocería va en su propio grupo: se hunde y se inclina sobre la suspensión (las ruedas no)
  const chassis = new THREE.Group();
  chassis.add(body, shiny, glass, detail, lights, tail);
  g.add(chassis);
  if (model === 'patrullero') {
    // puertas blancas
    const doors = new THREE.Mesh(new THREE.BoxGeometry(W + 0.01, 0.34, 1.9), paintMat(0xf2f2f2));
    doors.position.set(0, M.m.belt - 0.28, -0.1);
    chassis.add(doors);
  }
  const wheels = [];
  for (const [x, y, z] of wheelSpots(M)) {
    const w = new THREE.Mesh(M.wheelGeo, wheelMat);
    w.position.set(x, y, z);
    // la llanta mira para afuera de cada lado
    if (x < 0) w.scale.x = -1;
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  }
  // de lejos (carLod) las cuatro ruedas van en una sola malla quieta: un dibujo en vez de cuatro
  const wheelsFar = new THREE.Mesh(farWheels(M), wheelMat);
  wheelsFar.visible = false;
  g.add(wheelsFar);
  const hood = makeHood(M.m, body.material);
  chassis.add(hood.pivot, hood.bay);
  let door = null;
  let doorway = null;
  if (M.door) {
    door = new THREE.Group();
    const dp = new THREE.Mesh(M.door.paint, body.material);
    dp.userData.paint = true;
    dp.castShadow = true;
    door.add(dp, new THREE.Mesh(M.door.glass, glassMat), new THREE.Mesh(M.door.handle, shinyMat));
    door.position.set(-W / 2 - 0.01, 0, M.door.zf);
    door.visible = false;
    doorway = new THREE.Mesh(M.door.hole, detailMat);
    doorway.position.set(-W / 2 - 0.004, 0, M.door.zf);
    doorway.visible = false;
    chassis.add(door, doorway);
  }
  g.userData = { L, W, wheels, kind: 'car', model, parkedBuild: parked, tall: M.m.roof + 0.1, body, shiny, glass, chassis, tail, door, doorway, hood, wheelsFar, lodParts: [shiny, detail] };
  if (tune > 0 && TUNABLE.has(model) && Math.random() < tune) tuneCar(g, M, g.userData, Math.random);
  return g;
}

// el Ferrucho (descapotable o no), rojo por defecto
export function makeFerrucho(color = 0xc8102e, { convertible = false } = {}) {
  return makeCar(convertible ? 'ferrucho_open' : 'ferrucho', color);
}

// ---------- Autos de artista: "Realistic Car Pack" de Quaternius (CC0) ----------
// Sedán, compacto, SUV y dos deportivos modernos que se mezclan en el tránsito con los clásicos
// hechos por código. Vienen en un solo GLB (tools/models/qcars.mjs) ya a escala, con la chapa, los
// vidrios, los detalles, las luces y una rueda en mallas separadas. Sin interior: vidrio polarizado.
const QCARS = {};
export const QMODELS = [];
const qGlassMat = glassMat.clone();
qGlassMat.transparent = false;
qGlassMat.opacity = 1;
qGlassMat.color.set(0x05080b);
qGlassMat.envMapIntensity = 1.1;
let qLoad = null;
const CREASE = (38 * Math.PI) / 180;
export function loadQCars() {
  qLoad ??= new GLTFLoader()
    .loadAsync('models/vehicles/qcars.glb')
    .then((gltf) => {
      for (const node of gltf.scene.children) {
        const parts = {};
        // el cargador numera los nombres repetidos (paint, paint_1...)
        for (const c of node.children) if (c.isMesh) parts[c.name.replace(/_\d+$/, '')] = c.geometry;
        const { wheels, wheelR, size } = node.userData;
        if (!parts.paint || !parts.wheel || !wheels) continue;
        // la chapa del pack es facetada: normales suaves salvo en los quiebres marcados (la laca refleja parejo)
        parts.paint = toCreasedNormals(parts.paint, CREASE);
        QCARS[node.name] = { parts, wheelPos: wheels, wheelGeo: parts.wheel, m: { W: size[0], roof: size[1], L: size[2], wheelR } };
        QMODELS.push(node.name);
      }
    })
    .catch(() => {});
  return qLoad;
}
function makeQCar(model, color) {
  const Q = QCARS[model];
  const { L, W, roof } = Q.m;
  const g = new THREE.Group();
  const body = new THREE.Mesh(Q.parts.paint, paintMat(color));
  body.userData.paint = true;
  const glass = new THREE.Mesh(Q.parts.glass ?? new THREE.BufferGeometry(), qGlassMat);
  const detail = new THREE.Mesh(Q.parts.detail ?? new THREE.BufferGeometry(), detailMat);
  const lights = new THREE.Mesh(Q.parts.lights ?? new THREE.BufferGeometry(), lightMat);
  const tail = new THREE.Mesh(Q.parts.tail ?? new THREE.BufferGeometry(), tailMat);
  for (const o of [body, glass, detail]) {
    o.castShadow = true;
    o.receiveShadow = true;
  }
  const chassis = new THREE.Group();
  chassis.add(body, glass, detail, lights, tail);
  g.add(chassis);
  const wheels = [];
  for (const [x, y, z] of Q.wheelPos) {
    const w = new THREE.Mesh(Q.wheelGeo, wheelMat);
    w.position.set(x, y, z);
    if (x < 0) w.scale.x = -1;
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  }
  const wheelsFar = new THREE.Mesh(farWheels(Q), wheelMat);
  wheelsFar.visible = false;
  g.add(wheelsFar);
  // los detalles (paragolpes, molduras, parrilla) son grandes: se ven también de lejos
  g.userData = { L, W, wheels, kind: 'car', model, tall: roof + 0.05, body, shiny: detail, glass, glassMat: qGlassMat, chassis, tail, door: null, doorway: null, hood: null, wheelsFar, lodParts: [] };
  return g;
}

// ---------- Abolladuras (como en Vice City): la chapa se hunde donde pegó ----------
// La primera vez que un auto se golpea pasa a tener su propia copia de la chapa (las geometrías
// son compartidas por modelo). Los triángulos aplastados quedan facetados, como metal arrugado.
const crackedGlass = new THREE.MeshStandardMaterial({ color: 0x8e979e, roughness: 0.55, metalness: 0.1, transparent: true, opacity: 0.85 });
function ownGeometry(u) {
  if (u.dented) return;
  u.dented = true;
  u.geo0 = { body: u.body.geometry, shiny: u.shiny.geometry };
  u.body.geometry = u.body.geometry.clone();
  u.shiny.geometry = u.shiny.geometry.clone();
}
function crumple(geo, lx, lz, r, depth, nx, nz) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const hit = new Set();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const d = Math.hypot(x - lx, (y - 0.6) * 0.8, z - lz);
    if (d >= r) continue;
    const k = (1 - d / r) ** 2;
    // ruido fijo por vértice para que no quede liso
    const jit = 0.7 + 0.3 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1);
    const p = depth * k * jit;
    pos.setXYZ(i, x + nx * p, y - p * 0.25, z + nz * p);
    hit.add(geo.index ? i : Math.floor(i / 3));
  }
  if (!hit.size) return;
  pos.needsUpdate = true;
  if (geo.index || !nor) {
    geo.computeVertexNormals();
    return;
  }
  // normales planas solo en los triángulos tocados (el resto queda suave)
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const o = new THREE.Vector3();
  for (const t of hit) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    b.sub(a);
    c.sub(a);
    b.cross(c).normalize();
    // que mire para el mismo lado que la normal original (no todas las caras giran igual)
    o.set(0, 0, 0);
    for (let j = 0; j < 3; j++) o.x += nor.getX(t * 3 + j), o.y += nor.getY(t * 3 + j), o.z += nor.getZ(t * 3 + j);
    if (b.dot(o) < 0) b.negate();
    for (let j = 0; j < 3; j++) nor.setXYZ(t * 3 + j, b.x, b.y, b.z);
  }
  nor.needsUpdate = true;
}
// wx, wz: punto del golpe en el mundo; amount: daño de ese golpe
export function dentCar(v, wx, wz, amount) {
  const u = v.mesh.userData;
  if (u.kind !== 'car' || !u.body || amount < 3) return;
  ownGeometry(u);
  const dx = wx - v.x;
  const dz = wz - v.z;
  const c = Math.cos(v.heading);
  const s = Math.sin(v.heading);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const l = Math.hypot(lx, lz) || 1;
  // hacia adentro del auto, desde el golpe
  const nx = -lx / l;
  const nz = -lz / l;
  const r = Math.min(1.1, 0.5 + amount * 0.025);
  const depth = Math.min(0.16, amount * 0.006);
  crumple(u.body.geometry, lx, lz, r, depth, nx, nz);
  crumple(u.shiny.geometry, lx, lz, r, depth, nx, nz);
  // con mucho daño se rompen los vidrios
  if (v.damage > 45 && u.glass.material !== crackedGlass) u.glass.material = crackedGlass;
}
// Con muchos golpes de un lado se cae el paragolpes (como en Vice City): se borran sus triángulos
// del cromado propio del auto y devuelve dónde estaba (en el auto) para tirar uno suelto.
const BUMPER = new THREE.Color(0xd8d8d8);
export function dropBumper(v, front) {
  const u = v.mesh.userData;
  if (u.kind !== 'car' || !u.shiny || u[front ? 'lostF' : 'lostR']) return null;
  ownGeometry(u);
  const g = u.shiny.geometry;
  const pos = g.attributes.position;
  const col = g.attributes.color;
  if (!col) return null;
  let n = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let t = 0; t < pos.count; t += 3) {
    let ok = true;
    for (let j = 0; j < 3 && ok; j++) {
      const i = t + j;
      if (Math.abs(col.getX(i) - BUMPER.r) > 0.01 || Math.abs(col.getY(i) - BUMPER.g) > 0.01) ok = false;
      if (front ? pos.getZ(i) < 0 : pos.getZ(i) > 0) ok = false;
    }
    if (!ok) continue;
    for (let j = 0; j < 3; j++) {
      cx += pos.getX(t + j);
      cy += pos.getY(t + j);
      cz += pos.getZ(t + j);
    }
    n += 3;
    // triángulo degenerado: no se dibuja
    for (let j = 1; j < 3; j++) pos.setXYZ(t + j, pos.getX(t), pos.getY(t), pos.getZ(t));
  }
  if (!n) return null;
  pos.needsUpdate = true;
  u[front ? 'lostF' : 'lostR'] = true;
  return { x: cx / n, y: cy / n, z: cz / n, w: u.W - 0.12 };
}
const looseMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 1, roughness: 0.2, envMapIntensity: 1.6 });
const looseGeo = new THREE.BoxGeometry(1, 0.13, 0.1);
export function looseBumper(w) {
  const m = new THREE.Mesh(looseGeo, looseMat);
  m.scale.x = w;
  m.castShadow = true;
  return m;
}
// chapa y pintura (o el auto vuelve al tránsito): como nuevo
export function repairCar(v) {
  if (!v.blast && !v.wreck) {
    v.rollover = null; v.overturned = false; v.tilt = null;
    v.rollRisk = v.recoverHold = 0;
    v.sync?.(0);
  }
  const u = v.mesh.userData;
  if (!u.dented) {
    if (u.glass && u.glass.material === crackedGlass) u.glass.material = u.glassMat ?? glassMat;
    return;
  }
  u.body.geometry.dispose();
  u.shiny.geometry.dispose();
  u.body.geometry = u.geo0.body;
  u.shiny.geometry = u.geo0.shiny;
  u.glass.material = u.glassMat ?? glassMat;
  u.dented = false;
  u.lostF = u.lostR = false;
  u.hitF = u.hitR = 0;
}

// Nivel de detalle por distancia a la cámara: de lejos no se ven los cromados ni los detalles chicos,
// las ruedas no hace falta que tiren sombra y bien lejos ni se dibujan (la niebla las tapa).
export function carLod(mesh, d2) {
  const u = mesh.userData;
  if (!u.lodParts) return;
  const lvl = d2 < 45 * 45 ? 0 : d2 < 140 * 140 ? 1 : 2;
  if (lvl === u.lodLvl) return;
  u.lodLvl = lvl;
  for (const o of u.lodParts) o.visible = lvl === 0;
  // de lejos la sombra la tira solo la carrocería (sin vidrios), y bien lejos ni eso
  if (u.glass) u.glass.castShadow = lvl === 0;
  if (u.body) u.body.castShadow = lvl < 2;
  // cerca, las ruedas que giran; a media distancia, las cuatro en una malla quieta; lejos, ninguna
  const far = !!u.wheelsFar;
  for (const w of u.wheels) {
    w.visible = far ? lvl === 0 : lvl < 2;
    w.castShadow = lvl === 0;
  }
  if (far) u.wheelsFar.visible = lvl === 1;
}
