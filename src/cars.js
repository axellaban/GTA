// Autos con carrocería perfilada (Falcon, Duna, Gol, pickup, patrullero, remís).
// El perfil lateral se extruye a lo ancho; vidrios y cromados reflejan el cielo.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BoxBuilder } from './builder.js';

const paintCache = new Map();
export function paintMat(color) {
  if (!paintCache.has(color)) paintCache.set(color, new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.32 }));
  return paintCache.get(color);
}
// vidrios y cromados: mismo material metálico, el color por vértice decide
export const shinyMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.92, roughness: 0.12 });
export const detailMat = new THREE.MeshLambertMaterial({ vertexColors: true });
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

function extrudeX(shape, width, bevel = 0.05) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
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
  paint.push(clean(extrudeX(bodyShape(m), W, 0.06)));
  const cab = cabinPts(m);
  const roofPts = [
    [cab[1][0] - 0.02, roof - 0.05],
    [cab[2][0] + 0.02, roof - 0.05],
    [cab[2][0], roof + 0.03],
    [cab[1][0], roof + 0.03],
  ];
  paint.push(clean(extrudeX(polyShape(roofPts), W * 0.9, 0.03)));
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
    paint.push(clean(g));
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

  // vidrios y cromados (brillantes)
  const shiny = [];
  shiny.push(colorize(clean(extrudeX(polyShape(inset(cab, 0.01)), W * 0.86, 0.02)), 0x0d1318));
  for (const z of [L / 2 + 0.02, -L / 2 - 0.02]) shiny.push(colorize(clean(new THREE.BoxGeometry(W + 0.04, 0.14, 0.1).translate(0, 0.42, z)), 0xd8d8d8));
  // manijas y marco de parrilla
  for (const s of [-1, 1]) {
    shiny.push(colorize(clean(new THREE.BoxGeometry(0.03, 0.03, 0.14).translate(s * (W / 2 + 0.01), belt - 0.12, 0.2)), 0xcfcfcf));
    shiny.push(colorize(clean(new THREE.BoxGeometry(0.03, 0.03, 0.14).translate(s * (W / 2 + 0.01), belt - 0.12, -0.75)), 0xcfcfcf));
  }
  shiny.push(colorize(clean(new THREE.BoxGeometry(W * 0.6, 0.2, 0.03).translate(0, m.nose - 0.18, L / 2 + 0.005)), 0xbdbdbd));
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
    D.box(0.012, belt - 0.4, 0.015, 0x222222, s * (W / 2 + 0.002), (belt + 0.35) / 2, cab[3][0] - 0.05);
    D.box(0.012, belt - 0.4, 0.015, 0x222222, s * (W / 2 + 0.002), (belt + 0.35) / 2, (cab[0][0] + cab[3][0]) / 2 - 0.1);
    D.box(0.03, 0.06, L * 0.96, 0x1d1d1d, s * (W / 2 + 0.005), 0.4, 0);
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
    D.box(W * 0.9, 0.05, cab[2][0] - cab[1][0] + 0.05, 0xf5c400, 0, roof + 0.05, (cab[1][0] + cab[2][0]) / 2);
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
    Lb.box(0.1, 0.06, 0.04, 0xffa000, s * (W / 2 - 0.05), m.nose - 0.2, L / 2 + 0.02);
    Lb.box(0.3, 0.14, 0.04, 0xb01010, s * (W / 2 - 0.23), m.tail - 0.14, -L / 2 - 0.03);
  }
  const lightGeo = Lb.mesh().geometry;

  // rueda: cubierta + llanta con rayos
  const Wb = new BoxBuilder();
  const wr = m.wheelR;
  Wb.add(new THREE.CylinderGeometry(wr, wr, 0.21, 16).rotateZ(Math.PI / 2), 0x151515);
  Wb.add(new THREE.CylinderGeometry(wr * 0.62, wr * 0.62, 0.225, 12).rotateZ(Math.PI / 2), 0x9c9c9c);
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.BoxGeometry(0.235, wr * 0.9, 0.04);
    sp.rotateX((i / 5) * Math.PI);
    Wb.add(sp, 0x6e6e6e);
  }
  const wheelGeo = Wb.mesh().geometry;
  const out = { m, paintGeo, shinyGeo, detailGeo, lightGeo, wheelGeo };
  geoCache.set(name, out);
  return out;
}

export function makeCar(model = 'duna', color = 0xd8d4c8, { parked = false } = {}) {
  const M = buildModel(model);
  const { L, W, wheelR } = M.m;
  const g = new THREE.Group();
  const paintColor = model === 'remis' || model === 'taxi' ? 0x151515 : model === 'patrullero' ? 0x1d3f8c : color;
  const body = new THREE.Mesh(M.paintGeo, paintMat(paintColor));
  const shiny = new THREE.Mesh(M.shinyGeo, shinyMat);
  const detail = new THREE.Mesh(M.detailGeo, detailMat);
  const lights = new THREE.Mesh(M.lightGeo, lightMat);
  for (const o of [body, shiny, detail]) {
    o.castShadow = true;
    o.receiveShadow = true;
  }
  g.add(body, shiny, detail, lights);
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
    const w = new THREE.Mesh(M.wheelGeo, detailMat);
    w.position.set(x, wheelR, z);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  }
  g.userData = { L, W, wheels, kind: 'car', model, parkedBuild: parked, tall: M.m.roof + 0.1 };
  return g;
}
