// Convierte un personaje de Quaternius (Ultimate Modular Men/Women, CC0, glTF con un material de color
// liso por pieza) en un .glb liviano para el juego:
//   - el color de cada material pasa a color de vértice y queda UN material (una llamada de dibujo);
//     `_PART` marca cada vértice como ropa (2), piel (1) u otra cosa (0) para teñir en el juego;
//   - las piezas (cabeza, torso, piernas, pies) se juntan en una sola malla con el mismo esqueleto;
//   - sin animaciones (las poses son nuestras, ver src/rig.js) ni normales (se dibuja facetado,
//     flatShading, como el original);
//   - simplificado hasta el presupuesto de personaje (≤ 5.000 triángulos, PLAN.md §2.5).
// Uso: node quat.mjs entrada.gltf salida.glb [triángulos]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup, joinPrimitives } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const [, , input, output, target = '4800'] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();
const buf = root.listBuffers()[0];
const tris = () => {
  let t = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) t += (p.getIndices()?.getCount() ?? 0) / 3;
  return Math.round(t);
};
const before = tris();
for (const a of root.listAnimations()) {
  // los samplers sueltos retienen sus datos: se desarman uno por uno
  for (const c of a.listChannels()) c.dispose();
  for (const sm of a.listSamplers()) sm.dispose();
  a.dispose();
}
const mat = doc.createMaterial('quaternius').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.82).setMetallicFactor(0);
const nodes = root.listNodes().filter((n) => n.getMesh());
const main = nodes[0];
const skin = main.getSkin();
const mainMesh = main.getMesh();
for (const n of nodes) {
  if (n.getSkin() !== skin) throw new Error(`${n.getName()}: otro esqueleto`);
  const mesh = n.getMesh();
  for (const p of mesh.listPrimitives()) {
    const c = p.getMaterial()?.getBaseColorFactor() ?? [1, 1, 1, 1];
    const count = p.getAttribute('POSITION').getCount();
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) arr.set([c[0], c[1], c[2]], i * 3);
    p.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(arr).setBuffer(buf));
    // qué es cada parte, para teñir en el juego: 2 ropa, 1 piel, 0 pelo/ojos/aros (no se tiñe)
    const name = p.getMaterial()?.getName() ?? '';
    const kind = /^skin/i.test(name) ? 1 : /hair|eye|brow|moustache|beard|earring/i.test(name) ? 0 : 2;
    p.setAttribute('_PART', doc.createAccessor().setType('SCALAR').setArray(new Float32Array(count).fill(kind)).setBuffer(buf));
    p.setAttribute('NORMAL', null);
    p.setAttribute('TEXCOORD_0', null);
    p.setMaterial(mat);
    if (mesh !== mainMesh) {
      mesh.removePrimitive(p);
      mainMesh.addPrimitive(p);
    }
  }
  if (mesh !== mainMesh) {
    mesh.dispose();
    n.dispose();
  }
}
// una sola primitiva (join() no toca las mallas con esqueleto)
const prims = mainMesh.listPrimitives();
const one = joinPrimitives(prims);
for (const p of prims) {
  mainMesh.removePrimitive(p);
  p.dispose();
}
mainMesh.addPrimitive(one);
await MeshoptSimplifier.ready;
await doc.transform(weld(), dedup(), prune());
const mid = tris();
await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, +target / mid), error: 0.004 }), prune());
await io.write(output, doc);
console.log(`${input.split('/').pop()}: ${before} -> ${tris()} triángulos, ${root.listMeshes().length} malla(s), ${root.listMaterials().length} material(es)`);
