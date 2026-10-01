import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector2, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { ScaledBloomPass } from '../src/bloom.js';

test('el compositor respeta la escala del resplandor al agregar, redimensionar y cambiar DPR', () => {
  const renderer = { getPixelRatio: () => 1 };
  const composer = new EffectComposer(renderer, new WebGLRenderTarget(960, 540));
  const bloom = new ScaledBloomPass(new Vector2(960, 540), 0.5, 0.35, 0.55, 0.9);
  const size = () => [bloom.renderTargetBright.width, bloom.renderTargetBright.height];
  try {
    assert.deepEqual(size(), [240, 135]);
    composer.addPass(bloom);
    assert.deepEqual(size(), [240, 135]);
    composer.setSize(1280, 720);
    assert.deepEqual(size(), [320, 180]);
    composer.setPixelRatio(1.5);
    assert.deepEqual(size(), [480, 270]);
    composer.setSize(1, 1);
    for (const rt of [...bloom.renderTargetsHorizontal, ...bloom.renderTargetsVertical]) {
      assert.ok(rt.width >= 1 && rt.height >= 1);
    }
  } finally {
    bloom.dispose();
    composer.dispose();
  }
});
