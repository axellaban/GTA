// Autos del "Realistic Car Pack" de Quaternius (CC0, quaternius.com/packs/cars.html) en un solo GLB.
// Lee los OBJ+MTL del pack y deja, por auto, un nodo q_<nombre> con mallas separadas por parte:
//   paint (la chapa, se pinta en el juego), glass, detail (gomas, parrilla, molduras: color por vértice),
//   lights, tail y wheel (una sola rueda centrada en su eje, con la llanta mirando a +x).
// Frente a +z, piso en y = 0, centrado en x/z, a escala real. En extras: dónde va cada rueda.
//   node qcars.mjs "<carpeta OBJ del pack>" ../../public/models/vehicles/qcars.glb
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';

const [dir, out] = process.argv.slice(2);
// nombre en el juego, archivo, largo real (m); los del pack son bajitos y anchos: se estiran y se angostan
const CARS = [
  ['q_sedan', 'NormalCar1', 4.45],
  ['q_compacto', 'NormalCar2', 3.65],
  ['q_suv', 'SUV', 4.5],
  ['q_coupe', 'SportsCar', 4.3],
  ['q_sport', 'SportsCar2', 4.35],
];
const TALL = 1.08;
const NARROW = 0.93;
// colores fijos (lineales) de faros y traseras, como los autos hechos por código
const srgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255].map((c) => ((c / 255) <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4));
const FIXED = { Headlights: srgb(0xfff3cf), TailLights: srgb(0xb01010), Windows: [1, 1, 1] };
// el faldón naranja oscuro del deportivo no sigue el color de la chapa: negro mate
const RECOLOR = { DarkOrange: srgb(0x222222) };
const PAINT = new Set(['Blue', 'LightBlue', 'White', 'Orange', 'Yellow']);

function parseMtl(text) {
  const out = {};
  let cur = null;
  for (const l of text.split('\n')) {
    const p = l.trim().split(/\s+/);
    if (p[0] === 'newmtl') cur = p[1];
    else if (p[0] === 'Kd' && cur) out[cur] = p.slice(1, 4).map(Number);
  }
  return out;
}

function parseObj(text) {
  const V = [];
  const N = [];
  const faces = []; // { obj, mtl, verts: [[vi, ni], ...] }
  let obj = '';
  let mtl = '';
  for (const l of text.split('\n')) {
    const p = l.trim().split(/\s+/);
    if (p[0] === 'v') V.push(p.slice(1, 4).map(Number));
    else if (p[0] === 'vn') N.push(p.slice(1, 4).map(Number));
    else if (p[0] === 'o') obj = p[1];
    else if (p[0] === 'usemtl') mtl = p[1];
    else if (p[0] === 'f') {
      const verts = p.slice(1).map((q) => {
        const [vi, , ni] = q.split('/');
        return [parseInt(vi) - 1, ni ? parseInt(ni) - 1 : -1];
      });
      faces.push({ obj, mtl, verts });
    }
  }
  return { V, N, faces };
}

// junta triángulos (en abanico) en una malla indexada: posición, normal y, si hace falta, color
function build(faces, V, N, xf, colorOf) {
  const map = new Map();
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];
  for (const f of faces) {
    const c = colorOf ? colorOf(f.mtl) : null;
    const ids = f.verts.map(([vi, ni]) => {
      const key = `${vi}/${ni}/${c ? c.join(',') : ''}`;
      let id = map.get(key);
      if (id == null) {
        id = pos.length / 3;
        map.set(key, id);
        const [x, y, z] = xf(V[vi]);
        pos.push(x, y, z);
        const n = ni >= 0 ? N[ni] : [0, 1, 0];
        // la escala no uniforme tuerce las normales: inversa transpuesta y normalizar
        const nx = n[0] / NARROW;
        const ny = n[1] / TALL;
        const nz = n[2];
        const l = Math.hypot(nx, ny, nz) || 1;
        nor.push(nx / l, ny / l, nz / l);
        if (c) col.push(...c);
      }
      return id;
    });
    for (let i = 1; i + 1 < ids.length; i++) idx.push(ids[0], ids[i], ids[i + 1]);
  }
  return { pos, nor, col: colorOf ? col : null, idx };
}

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('qcars');
const mats = {};
const matFor = (name) => (mats[name] ??= doc.createMaterial(name));

function addMesh(parent, name, g) {
  if (!g.idx.length) return;
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.pos)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.nor)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(g.pos.length / 3 > 65535 ? new Uint32Array(g.idx) : new Uint16Array(g.idx)).setBuffer(buffer))
    .setMaterial(matFor(name));
  if (g.col) prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.col)).setBuffer(buffer));
  parent.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
}

let tris = 0;
for (const [name, file, length] of CARS) {
  const kd = parseMtl(readFileSync(join(dir, `${file}.mtl`), 'utf8'));
  const { V, N, faces } = parseObj(readFileSync(join(dir, `${file}.obj`), 'utf8'));
  const part = (re) => faces.filter((f) => re.test(f.obj));
  const body = faces.filter((f) => !/Wheel/.test(f.obj));
  const fl = part(/FrontLeftWheel/);
  const fr = part(/FrontRightWheel/);
  const back = part(/BackWheels/);
  const box = (fs, filter = () => true) => {
    const mn = [1e9, 1e9, 1e9];
    const mx = [-1e9, -1e9, -1e9];
    for (const f of fs) {
      for (const [vi] of f.verts) {
        const v = V[vi];
        if (!filter(v)) continue;
        for (let i = 0; i < 3; i++) {
          mn[i] = Math.min(mn[i], v[i]);
          mx[i] = Math.max(mx[i], v[i]);
        }
      }
    }
    return { mn, mx, c: mn.map((a, i) => (a + mx[i]) / 2) };
  };
  const all = box(faces);
  const k = length / (all.mx[2] - all.mn[2]);
  const floor = all.mn[1];
  // del pack al juego: centrado, piso en 0, escala real, más alto y más angosto
  const xf = (v) => [(v[0] - all.c[0]) * k * NARROW, (v[1] - floor) * k * TALL, (v[2] - all.c[2]) * k];
  const node = doc.createNode(name);
  scene.addChild(node);
  const pick = (test) => body.filter((f) => test(f.mtl));
  addMesh(node, 'paint', build(pick((m) => PAINT.has(m)), V, N, xf));
  addMesh(node, 'glass', build(pick((m) => m === 'Windows'), V, N, xf));
  addMesh(node, 'detail', build(pick((m) => !PAINT.has(m) && !FIXED[m]), V, N, xf, (m) => RECOLOR[m] ?? kd[m] ?? [0.1, 0.1, 0.1]));
  addMesh(node, 'lights', build(pick((m) => m === 'Headlights'), V, N, xf, (m) => FIXED[m]));
  addMesh(node, 'tail', build(pick((m) => m === 'TailLights'), V, N, xf, (m) => FIXED[m]));
  // una sola rueda (la delantera izquierda, que tiene la llanta para +x), centrada en su eje
  const wb = box(fl);
  const r = ((wb.mx[1] - wb.mn[1]) / 2) * k * TALL;
  const wxf = (v) => [(v[0] - wb.c[0]) * k * NARROW, (v[1] - wb.c[1]) * k * TALL, (v[2] - wb.c[2]) * k * TALL];
  addMesh(node, 'wheel', build(fl, V, N, wxf, (m) => kd[m] ?? [0.1, 0.1, 0.1]));
  // ruedas en el orden del juego: delanteras primero (las que doblan), -x antes que +x
  const at = (b) => xf(b.c).map((x) => +x.toFixed(4));
  const wheels = [box(fr), box(fl), box(back, (v) => v[0] < 0), box(back, (v) => v[0] > 0)].map(at);
  for (const w of wheels) w[1] = +r.toFixed(4);
  const size = [(all.mx[0] - all.mn[0]) * k * NARROW, (all.mx[1] - all.mn[1]) * k * TALL, length].map((x) => +x.toFixed(3));
  node.setExtras({ wheels, wheelR: +r.toFixed(4), size });
  const n = faces.reduce((s, f) => s + f.verts.length - 2, 0);
  tris += n;
  console.log(name.padEnd(11), `${n} triángulos`, 'medidas', size.join(' x '), 'rueda', r.toFixed(3));
}
await new NodeIO().write(out, doc);
console.log(`${out}: ${tris} triángulos en total`);
