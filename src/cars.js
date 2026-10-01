// Autos con carrocería perfilada (Falcon, Duna, Gol, pickup, patrullero, remís).
// El perfil lateral se extruye a lo ancho con bordes redondeados; pintura con laca (clearcoat),
// vidrios polarizados y cromados que reflejan el cielo, llantas de revolución con rayos.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
export const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0b1015, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.7 });
export const detailMat = new THREE.MeshLambertMaterial({ vertexColors: true });
// ruedas: goma casi negra y llanta plateada (un solo material, el color por vértice decide)
export const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.38 });
// luces: color por vértice, se sobreexponen de noche para que "brillen"
export const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });

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
  paint.push(tumblehome(clean(extrudeX(polyShape(roofPts), W * 0.9, 0.05, true)), belt, roof));
  for (const s of [-1, 1]) {
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
  const glassGeo = tumblehome(clean(extrudeX(polyShape(inset(cab, 0.01)), W * 0.86, 0.04, true)), belt, roof);
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
    D.box(0.12, 0.08, 0.06, 0x1a1a1a, s * (W / 2 + 0.05), belt + 0.1, cab[3][0] - 0.1);
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
  const detailGeo = D.mesh().geometry;

  // luces delanteras y traseras
  const Lb = new BoxBuilder();
  const round = name === 'falcon' || name === 'patrullero';
  for (const s of [-1, 1]) {
    if (round) Lb.add(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 12).rotateX(Math.PI / 2), 0xfff3cf, s * (W / 2 - 0.22), m.nose - 0.12, L / 2 + 0.02);
    else Lb.box(0.3, 0.13, 0.04, 0xfff3cf, s * (W / 2 - 0.25), m.nose - 0.12, L / 2 + 0.02);
    Lb.box(0.1, 0.06, 0.04, 0xffa000, s * (W / 2 - 0.13), m.nose - 0.2, L / 2 + 0.01);
    Lb.box(0.28, 0.14, 0.04, 0xb01010, s * (W / 2 - 0.3), m.tail - 0.14, -L / 2 - 0.005);
  }
  const lightGeo = Lb.mesh().geometry;

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
  const out = { m, paintGeo, shinyGeo, glassGeo, detailGeo, lightGeo, wheelGeo };
  geoCache.set(name, out);
  return out;
}

export function makeCar(model = 'duna', color = 0xd8d4c8, { parked = false } = {}) {
  const M = buildModel(model);
  const { L, W, wheelR } = M.m;
  const g = new THREE.Group();
  const paintColor = model === 'remis' || model === 'taxi' ? 0x151515 : model === 'patrullero' ? 0x1d3f8c : color;
  const body = new THREE.Mesh(M.paintGeo, paintMat(paintColor));
  body.userData.paint = true;
  const shiny = new THREE.Mesh(M.shinyGeo, shinyMat);
  const glass = new THREE.Mesh(M.glassGeo, glassMat);
  const detail = new THREE.Mesh(M.detailGeo, detailMat);
  const lights = new THREE.Mesh(M.lightGeo, lightMat);
  for (const o of [body, shiny, glass, detail]) {
    o.castShadow = true;
    o.receiveShadow = true;
  }
  g.add(body, shiny, glass, detail, lights);
  if (model === 'patrullero') {
    // puertas blancas
    const doors = new THREE.Mesh(new THREE.BoxGeometry(W + 0.01, 0.34, 1.9), paintMat(0xf2f2f2));
    doors.position.set(0, M.m.belt - 0.28, -0.1);
    g.add(doors);
  }
  const wheels = [];
  for (const [x, z] of [
    [-W / 2 + 0.12, L / 2 - 0.82],
    [W / 2 - 0.12, L / 2 - 0.82],
    [-W / 2 + 0.12, -L / 2 + 0.82],
    [W / 2 - 0.12, -L / 2 + 0.82],
  ]) {
    const w = new THREE.Mesh(M.wheelGeo, wheelMat);
    w.position.set(x, wheelR, z);
    // la llanta mira para afuera de cada lado
    if (x < 0) w.scale.x = -1;
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  }
  g.userData = { L, W, wheels, kind: 'car', model, parkedBuild: parked, tall: M.m.roof + 0.1, body, shiny, glass };
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
// chapa y pintura (o el auto vuelve al tránsito): como nuevo
export function repairCar(v) {
  const u = v.mesh.userData;
  if (!u.dented) {
    if (u.glass && u.glass.material === crackedGlass) u.glass.material = glassMat;
    return;
  }
  u.body.geometry.dispose();
  u.shiny.geometry.dispose();
  u.body.geometry = u.geo0.body;
  u.shiny.geometry = u.geo0.shiny;
  u.glass.material = glassMat;
  u.dented = false;
}
