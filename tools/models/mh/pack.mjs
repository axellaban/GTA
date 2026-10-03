// Segunda mitad de los personajes MakeHuman: toma cache/out/<nombre>.json + .png (de build.py), simplifica
// cada pieza a su presupuesto (todo junto ≤ 5.000 triángulos, para el iPhone), calcula normales suaves,
// junta todo en una sola malla con un solo material (una llamada de dibujo por persona) y lo guarda
// como public/models/people/<nombre>.glb con el atlas en WebP.
//
//   cd tools/models && node mh/pack.mjs [nombre ...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP, KHRMeshQuantization } from '@gltf-transform/extensions';
import { quantize } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, 'cache/out');
const DST = path.join(HERE, '../../../public/models/people');
// triángulos por pieza (las pestañas y los ojos son chicos; los zapatos casi no se ven)
// de lejos (más de ~28 m): la misma persona con ~1.200 triángulos, sin cejas ni pestañas
const FAR = { body: 340, clothes: 440, shoes: 60, hair: 240, brows: 0, lashes: 0, eyes: 40, extra: 110 };
const BUDGET = { body: 1450, clothes: 1640, shoes: 260, hair: 1100, brows: 192, lashes: 120, eyes: 172, extra: 400, extra2: 400 };
const TEX = 1024;
const TOTAL = 4950; // tope por persona (iPhone)

await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures = true; // para Prune (saca mechones sueltos del pelo)

// el pelo son muchas tiras sueltas: de lejos se quedan las más grandes hasta el presupuesto
function bigCards(index, pos, tris) {
  const n = pos.length / 3;
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (a) => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  for (let t = 0; t < index.length; t += 3) {
    const a = find(index[t]);
    for (const v of [index[t + 1], index[t + 2]]) {
      const b = find(v);
      if (a !== b) parent[b] = a;
    }
  }
  const comps = new Map();
  for (let t = 0; t < index.length; t += 3) {
    const r = find(index[t]);
    const c = comps.get(r) ?? comps.set(r, { tris: [], area: 0 }).get(r);
    const [a, b, d] = [index[t], index[t + 1], index[t + 2]].map((i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    c.area += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    c.tris.push(index[t], index[t + 1], index[t + 2]);
  }
  const out = [];
  for (const c of [...comps.values()].sort((x, y) => y.area - x.area)) {
    if (out.length / 3 + c.tris.length / 3 > tris && out.length) break;
    out.push(...c.tris);
  }
  return Uint32Array.from(out);
}

function simplify(part, k = 1, budget = BUDGET) {
  let idx = Uint32Array.from(part.index);
  if (part.role === 'hair' && budget === FAR) idx = bigCards(idx, part.pos, budget.hair * 2.5);
  const pos = Float32Array.from(part.pos);
  const want = Math.min(idx.length, Math.floor((budget[part.role] ?? 500) * k) * 3);
  let out = idx;
  if (want < idx.length) {
    const flags = part.role === 'body' && budget !== FAR ? ['LockBorder'] : part.role === 'hair' ? ['Prune'] : [];
    [out] = MeshoptSimplifier.simplify(idx, pos, 3, want, budget === FAR ? 0.3 : 0.08, flags);
  }
  // se queda solo con los vértices que se usan
  const remap = new Int32Array(pos.length / 3).fill(-1);
  const used = [];
  for (const i of out) if (remap[i] < 0) (remap[i] = used.length), used.push(i);
  const pick = (a, n) => {
    const r = new Float32Array(used.length * n);
    used.forEach((i, k) => {
      for (let j = 0; j < n; j++) r[k * n + j] = a[i * n + j];
    });
    return r;
  };
  return {
    role: part.role,
    kind: pick(part.kind, 1),
    pos: pick(part.pos, 3),
    uv: pick(part.uv, 2),
    joints: pick(part.joints, 4),
    weights: pick(part.weights, 4),
    index: Uint32Array.from(out, (i) => remap[i]),
  };
}

// normales suaves: los vértices que comparten posición (costuras de la textura) promedian juntos
function normals(p) {
  const n = new Float32Array(p.pos.length);
  const key = (i) => `${Math.round(p.pos[i * 3] * 2e4)},${Math.round(p.pos[i * 3 + 1] * 2e4)},${Math.round(p.pos[i * 3 + 2] * 2e4)}`;
  const groups = new Map();
  const g = new Int32Array(p.pos.length / 3);
  for (let i = 0; i < g.length; i++) {
    const k = key(i);
    if (!groups.has(k)) groups.set(k, groups.size);
    g[i] = groups.get(k);
  }
  const acc = new Float32Array(groups.size * 3);
  const I = p.index;
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [I[t], I[t + 1], I[t + 2]];
    const ax = p.pos[a * 3], ay = p.pos[a * 3 + 1], az = p.pos[a * 3 + 2];
    const ux = p.pos[b * 3] - ax, uy = p.pos[b * 3 + 1] - ay, uz = p.pos[b * 3 + 2] - az;
    const vx = p.pos[c * 3] - ax, vy = p.pos[c * 3 + 1] - ay, vz = p.pos[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; // pesa por área
    for (const v of [a, b, c]) {
      acc[g[v] * 3] += nx;
      acc[g[v] * 3 + 1] += ny;
      acc[g[v] * 3 + 2] += nz;
    }
  }
  for (let i = 0; i < g.length; i++) {
    const x = acc[g[i] * 3], y = acc[g[i] * 3 + 1], z = acc[g[i] * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    n[i * 3] = x / l;
    n[i * 3 + 1] = y / l;
    n[i * 3 + 2] = z / l;
  }
  return n;
}

// junta las piezas en una sola malla
function merge(parts, log) {
  let nv = 0;
  let ni = 0;
  for (const p of parts) (nv += p.pos.length / 3), (ni += p.index.length);
  const g = {
    P: new Float32Array(nv * 3),
    N: new Float32Array(nv * 3),
    UV: new Float32Array(nv * 2),
    J: new Uint8Array(nv * 4),
    W: new Float32Array(nv * 4),
    K: new Float32Array(nv),
    I: new Uint16Array(ni),
  };
  let ov = 0;
  let oi = 0;
  for (const p of parts) {
    const n = p.pos.length / 3;
    g.P.set(p.pos, ov * 3);
    g.N.set(normals(p), ov * 3);
    g.UV.set(p.uv, ov * 2);
    g.J.set(Uint8Array.from(p.joints), ov * 4);
    g.W.set(p.weights, ov * 4);
    g.K.set(p.kind, ov);
    for (let k = 0; k < p.index.length; k++) g.I[oi + k] = p.index[k] + ov;
    if (log) console.log(`  ${p.role.padEnd(8)} ${String(p.index.length / 3).padStart(5)} tri`);
    ov += n;
    oi += p.index.length;
  }
  if (log) console.log(`  total    ${String(ni / 3).padStart(5)} tri, ${nv} vért`);
  return g;
}

async function pack(name) {
  const src = JSON.parse(fs.readFileSync(path.join(SRC, `${name}.json`), 'utf8'));
  // si con sombrero (u otra pieza más) se pasa del total, se achican el cuerpo, la ropa y el pelo
  const want = (p) => Math.min(p.index.length / 3, BUDGET[p.role] ?? 500);
  const sum = src.parts.reduce((a, p) => a + want(p), 0);
  const big = src.parts.filter((p) => ['body', 'clothes', 'hair'].includes(p.role)).reduce((a, p) => a + want(p), 0);
  const k = sum > TOTAL ? Math.max(0.5, 1 - (sum - TOTAL) / big) : 1;
  const parts = src.parts.map((p) => simplify(p, ['body', 'clothes', 'hair'].includes(p.role) ? k : 1));
  const far = src.parts.filter((p) => (FAR[p.role] ?? 100) > 0).map((p) => simplify(p, 1, FAR));
  const near = merge(parts, true);
  const lejos = merge(far, false);
  console.log(`  de lejos ${String(lejos.I.length / 3).padStart(5)} tri`);
  const doc = new Document();
  const webp = doc.createExtension(EXTTextureWebP).setRequired(true);
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  const buf = doc.createBuffer();
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);

  const bones = src.bones;
  const nodes = bones.map((b) => doc.createNode(b.name));
  const byName = Object.fromEntries(bones.map((b, i) => [b.name, i]));
  const root = doc.createNode(name);
  bones.forEach((b, i) => {
    const pp = b.parent ? bones[byName[b.parent]].pos : [0, 0, 0];
    nodes[i].setTranslation([b.pos[0] - pp[0], b.pos[1] - pp[1], b.pos[2] - pp[2]]);
    (b.parent ? nodes[byName[b.parent]] : root).addChild(nodes[i]);
  });
  const ibm = new Float32Array(16 * bones.length);
  bones.forEach((b, i) => {
    ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b.pos[0], -b.pos[1], -b.pos[2], 1], i * 16);
  });
  const skin = doc.createSkin('piel').setSkeleton(nodes[0]).setInverseBindMatrices(acc('MAT4', ibm));
  for (const n of nodes) skin.addJoint(n);

  const png = path.join(SRC, `${name}.png`);
  const img = await sharp(png).resize(TEX, TEX, { kernel: 'lanczos3' }).webp({ quality: 84, alphaQuality: 88, effort: 6 }).toBuffer();
  const tex = doc.createTexture('atlas').setImage(img).setMimeType('image/webp').setURI(`${name}.webp`);
  const mat = doc
    .createMaterial('persona')
    .setBaseColorTexture(tex)
    .setMetallicFactor(0)
    .setRoughnessFactor(0.78)
    .setAlphaMode('MASK')
    .setAlphaCutoff(0.5)
    .setDoubleSided(true);
  // dos mallas con el mismo esqueleto y material: 'cuerpo' (cerca) y 'lejos'
  for (const [label, g] of [['cuerpo', near], ['lejos', lejos]]) {
    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', acc('VEC3', g.P))
      .setAttribute('NORMAL', acc('VEC3', g.N))
      .setAttribute('TEXCOORD_0', acc('VEC2', g.UV))
      .setAttribute('JOINTS_0', acc('VEC4', g.J))
      .setAttribute('WEIGHTS_0', acc('VEC4', g.W))
      .setAttribute('_PART', acc('SCALAR', g.K))
      .setIndices(acc('SCALAR', g.I))
      .setMaterial(mat);
    root.addChild(doc.createNode(label).setMesh(doc.createMesh(`${name}-${label}`).addPrimitive(prim)).setSkin(skin));
  }
  doc.createScene(name).addChild(root).setExtras(src.extras ?? {}); // → gltf.scene.userData en el juego
  void webp;
  // normales, uv y pesos en enteros (KHR_mesh_quantization): ~40 % menos de geometría. Las posiciones
  // quedan en float (con el skinning no conviene moverlas de escala)
  await doc.transform(quantize({ pattern: /^(NORMAL|TEXCOORD_0|WEIGHTS_0)$/, quantizeNormal: 8, quantizeTexcoord: 12, quantizeWeight: 8 }));
  const out = path.join(DST, `${name}.glb`);
  await new NodeIO().registerExtensions([EXTTextureWebP, KHRMeshQuantization]).write(out, doc);
  console.log(`  → ${path.relative(process.cwd(), out)} ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}

const names = process.argv.slice(2);
for (const n of names.length ? names : fs.readdirSync(SRC).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))) {
  console.log('==', n);
  await pack(n);
}
