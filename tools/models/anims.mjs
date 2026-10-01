// Deja solo las animaciones (y los huesos) de un glb: sin mallas, pieles ni texturas.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, resample } from '@gltf-transform/functions';
const [, , input, output, keep = ''] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();
for (const n of root.listNodes()) { n.setMesh(null); n.setSkin(null); }
for (const m of root.listMeshes()) m.dispose();
for (const s of root.listSkins()) s.dispose();
for (const t of root.listTextures()) t.dispose();
for (const m of root.listMaterials()) m.dispose();
const want = keep ? keep.split(',') : null;
if (want) for (const a of root.listAnimations()) if (!want.includes(a.getName())) a.dispose();
await doc.transform(resample({ tolerance: 0.002 }), prune());
await io.write(output, doc);
console.log('animaciones', root.listAnimations().map((a) => a.getName()).join(','));
