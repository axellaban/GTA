// Saca lo que un personaje de Quaternius tiene en la mano (el de traje, q_suit, venía con una pistola
// en la mano izquierda: todos los vecinos de traje andaban armados). Borra los triángulos que están
// enteros más allá de |x| > lim (la mano en pose T) y no son piel; después compacta los vértices.
// Uso: node sinarma.mjs entrada.glb salida.glb [lim=0.62]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive } from '@gltf-transform/functions';

const [, , input, output, lim = '0.62'] = process.argv;
const SKIN = '9d6b3d';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
let cut = 0;
for (const mesh of doc.getRoot().listMeshes()) {
  for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute('POSITION');
    const col = p.getAttribute('COLOR_0');
    const idx = p.getIndices();
    const hex = (i) => col.getElement(i, []).slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
    const keep = [];
    for (let t = 0; t < idx.getCount(); t += 3) {
      const I = [0, 1, 2].map((k) => idx.getScalar(t + k));
      const out = I.every((i) => Math.abs(pos.getElement(i, [])[0]) > +lim && hex(i) !== SKIN);
      if (out) cut++;
      else keep.push(...I);
    }
    idx.setArray(pos.getCount() > 65535 ? new Uint32Array(keep) : new Uint16Array(keep));
    compactPrimitive(p);
  }
}
await io.write(output, doc);
console.log(`${input}: ${cut} triángulos afuera`);
