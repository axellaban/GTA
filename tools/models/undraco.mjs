// Saca la compresión Draco de un glTF y lo guarda como .glb normal (sin decodificador en el juego).
// Uso: node undraco.mjs entrada.gltf salida.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
const [, , input, output] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(input);
for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName === 'KHR_draco_mesh_compression') e.dispose();
await doc.transform(dedup(), prune());
await io.write(output, doc);
console.log('listo', output);
