import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { rigHuman, setLod } from '../src/rig.js';
import { npcBody } from '../src/npc-body.js';

// La geometría y el esqueleto son los GLB publicados. Se omite solo la textura:
// estas pruebas corren en Node, sin navegador, GPU ni decodificador de WebP.
globalThis.ProgressEvent ??= class { constructor(type, data) { this.type = type; Object.assign(this, data); } };
async function source(name) {
  const raw = await fs.readFile(new URL(`../public/models/people/${name}.glb`, import.meta.url));
  const jsonLength = raw.readUInt32LE(12);
  const json = JSON.parse(raw.subarray(20, 20 + jsonLength).toString());
  const bin = raw.subarray(28 + jsonLength);
  json.buffers[0].uri = `data:application/octet-stream;base64,${bin.toString('base64')}`;
  delete json.images; delete json.textures;
  json.materials = [{ doubleSided: true }];
  for (const m of json.meshes) for (const p of m.primitives) p.material = 0;
  for (const k of ['extensionsUsed', 'extensionsRequired']) json[k] = json[k]?.filter(x => x !== 'EXT_texture_webp');
  return (await new GLTFLoader().parseAsync(JSON.stringify(json), '')).scene;
}
function sync(h) {
  h.rig.apply(); h.root.updateMatrixWorld(true);
  h.root.traverse(o => { if (o.isSkinnedMesh) o.skeleton.update(); });
}
function posedBounds(h, meshName = 'cuerpo') {
  sync(h);
  const mesh = h.rig.model.getObjectByName(meshName), p = new THREE.Vector3();
  const box = new THREE.Box3();
  for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
    mesh.getVertexPosition(i, p); p.applyMatrix4(mesh.matrixWorld); box.expandByPoint(p);
  }
  return box;
}

test('Ciro tiene piel en pecho, hombros y brazos; conserva el presupuesto del celular', async () => {
  const h = rigHuman(await source('mh_ciro'), { height: 3.5 }); sync(h);
  const mesh = h.rig.model.getObjectByName('cuerpo');
  assert.ok(mesh.geometry.index.count / 3 <= 5000);
  const targets = [
    new THREE.Vector3().lerpVectors(h.rig.map.chest.getWorldPosition(new THREE.Vector3()), h.rig.map.neck.getWorldPosition(new THREE.Vector3()), 0.65),
    ...['R', 'L'].map(s => new THREE.Vector3().lerpVectors(h.rig.map[`ua${s}`].getWorldPosition(new THREE.Vector3()), h.rig.map[`fa${s}`].getWorldPosition(new THREE.Vector3()), 0.5)),
  ];
  for (const p of targets) {
    const ray = new THREE.Raycaster(p.clone().add(new THREE.Vector3(0, 0, 2)), new THREE.Vector3(0, 0, -1));
    const hits = ray.intersectObject(mesh, false);
    assert.ok(hits.length > 0, `falta piel a la altura ${p.y.toFixed(2)}`);
    assert.equal(Math.round(mesh.geometry.attributes._part.getX(hits[0].face.a)), 1);
  }
});

test('al caer, la cadera de Ciro queda a nivel del piso y no flotando a un metro', async () => {
  for (const [model, height] of [['mh_ciro', 3.5], ['mh_gaspi', 1.84]]) {
    const h = rigHuman(await source(model), { height });
    const standing = posedBounds(h); assert.ok(Math.abs(standing.min.y) < 0.05, `${model} standing ${standing.min.y}`);
    h.bones.root.rotation.x = -Math.PI / 2; h.bones.root.position.y = 0.12;
    sync(h);
    const hips = h.rig.map.hips.getWorldPosition(new THREE.Vector3());
    assert.ok(hips.y > 0 && hips.y < 0.35, `${model} hips ${hips.y}`);
    const fallen = posedBounds(h);
    assert.ok(fallen.min.y < 0.2, `${model} flotando: ${fallen.min.y}`);
    assert.ok(fallen.max.y < height * 0.6);
    h.bones.root.rotation.set(0, 0, 0); h.bones.root.position.set(0, 0, 0);
    const upright = posedBounds(h); assert.ok(Math.abs(upright.min.y) < 0.05);
  }
});

test('caminar y golpear no separan el esqueleto; el modelo de lejos sigue animado', async () => {
  const h = rigHuman(await source('mh_ciro'), { height: 3.5 });
  const boneLength = (a, b) => h.rig.map[a].getWorldPosition(new THREE.Vector3()).distanceTo(h.rig.map[b].getWorldPosition(new THREE.Vector3()));
  const rest = boneLength('uaR', 'faR');
  for (const far of [false, true]) {
    setLod(h, far);
    h.bones.uaR.rotation.set(-1.1, 0, -0.4); h.bones.faR.rotation.x = -1.3;
    h.bones.thR.rotation.x = 0.5; h.bones.thL.rotation.x = -0.5;
    sync(h);
    assert.ok(Math.abs(boneLength('uaR', 'faR') - rest) < 1e-8);
    const box = posedBounds(h, far ? 'lejos' : 'cuerpo');
    assert.ok(Number.isFinite(box.min.y)); assert.ok(box.getSize(new THREE.Vector3()).y > 2.8);
    assert.equal(h.lods[1].visible, far);
  }
});

test('tiros y apuntado usan el torso alto y ancho de Ciro, incluyendo la carga inicial', () => {
  for (const n of [{ bodyHeight: 3.5, r: 0.75 }, { h: { height: 3.5 }, r: 0.75 }]) {
    const b = npcBody(n);
    assert.ok(b.height > 3.1 && b.radius > 0.65); // cabeza y hombros antes fuera del cilindro de 1,8 m
    assert.ok(b.aimHeight > 2.2 && b.aimHeight < 2.8); // el pecho, no las piernas
  }
  assert.deepEqual(npcBody({}), { height: 1.8, radius: 0.36, aimHeight: 1.25 });
  assert.equal(npcBody({ down: true, h: { height: 3.5 } }).height, 0.875);
  assert.ok(npcBody({ state: 'cower', h: { height: 3.5 } }).height < 3.5);
});
