// Simplifica un modelo glTF para el juego: saca UV y normales (si no usa texturas), suelda,
// simplifica con meshoptimizer y lo guarda sin Draco. Uso: node lite.mjs in.glb out.glb [ratio] [error]
// Si el modelo TIENE texturas, no sacar TEXCOORD_0 (editar la lista de abajo).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
const [, , input, output, ratio = '0.1', error = '0.003'] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(input);
// sin texturas: fuera UV y normales, así los vértices se pueden fusionar y simplificar
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) for (const a of ['TEXCOORD_0', 'NORMAL']) p.setAttribute(a, null);
for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName === 'KHR_draco_mesh_compression') e.dispose();
await MeshoptSimplifier.ready;
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: +ratio, error: +error }), dedup(), prune());
let tris = 0;
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
await io.write(output, doc);
console.log('triangulos', Math.round(tris));
