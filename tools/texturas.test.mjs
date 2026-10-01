import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

test('las fotos se aplican completas y conservan el material si falla la red', async () => {
  const fetchOriginal = globalThis.fetch;
  const loadOriginal = THREE.TextureLoader.prototype.loadAsync;
  let manifest;
  let fail;
  let loaded = [];
  globalThis.fetch = async () => ({ ok: true, json: async () => manifest });
  THREE.TextureLoader.prototype.loadAsync = async function (url) {
    if (url.includes(fail)) throw new Error('descarga interrumpida');
    const t = new THREE.Texture();
    t.addEventListener('dispose', () => { t.userData.disposed = true; });
    loaded.push(t);
    return t;
  };
  let version = 0;
  const run = async (list, failure) => {
    manifest = list;
    fail = failure;
    loaded = [];
    const { usePhoto } = await import(`../src/textures.js?test=${version++}`);
    const mat = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), normalMap: new THREE.Texture(), roughness: 0.3 });
    const old = [mat.map, mat.normalMap];
    const ok = await usePhoto(mat, 'asfalto', { size: 3, perTile: 9 });
    return { mat, old, ok };
  };
  try {
    const full = ['asfalto_color.jpg', 'asfalto_normal.jpg', 'asfalto_rough.jpg'];
    const good = await run(full);
    assert.equal(good.ok, true);
    assert.deepEqual(good.mat.map.repeat.toArray(), [3, 3]);
    assert.equal(good.mat.map.colorSpace, THREE.SRGBColorSpace);
    assert.equal(good.mat.normalMap.colorSpace, THREE.NoColorSpace);
    assert.equal(good.mat.roughnessMap.colorSpace, THREE.NoColorSpace);
    assert.equal(good.mat.roughness, 0.3);
    const broken = await run(full, '_normal');
    assert.equal(broken.ok, false);
    assert.equal(broken.mat.map, broken.old[0]);
    assert.equal(broken.mat.normalMap, broken.old[1]);
    assert.ok(loaded.every((t) => t.userData.disposed));
    const empty = await run([]);
    assert.equal(empty.ok, false);
    assert.equal(loaded.length, 0);
    const colorOnly = await run(['asfalto_color.jpg']);
    assert.equal(colorOnly.ok, true);
    assert.equal(colorOnly.mat.normalMap, null);
  } finally {
    globalThis.fetch = fetchOriginal;
    THREE.TextureLoader.prototype.loadAsync = loadOriginal;
  }
});
