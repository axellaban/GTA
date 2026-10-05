import test from 'node:test';
import assert from 'node:assert/strict';
import { Colliders } from '../src/physics.js';
import { safeCamera, cameraInsidePlayer } from '../src/camera-safe.js';
const anchor = { x: 0, y: 1.7, z: 0 };
test('el ángulo mínimo del auto no mete la cámara debajo del terreno', () => {
  for (const d of [8.5, 14, 17]) {
    const p = { x: 0, y: 2.2 + Math.sin(-0.35) * d, z: Math.cos(-0.35) * d };
    assert.ok(p.y < 0); // reproduce el punto negro anterior
    safeCamera({ ...anchor, y: 2.2 }, p, new Colliders(), () => 0);
    assert.ok(p.y >= 0.4);
  }
});
test('una pared pegada acerca la cámara sin el mínimo anterior del 25%', () => {
  const c = new Colliders(); c.addSegment(-5, 1, 5, 1, 3);
  const p = safeCamera(anchor, { x: 0, y: 1.7, z: 5 }, c, () => 0);
  assert.ok(p.z <= 0.61); // antes quedaba a 1,25 m: detrás de la pared de 1 m
});
test('se vuelve a comprobar la cámara suavizada que corta una esquina', () => {
  const c = new Colliders(); c.addSegment(-2, 1, 2, 1, 5);
  const p = { x: 1, y: 1.8, z: 3 };
  safeCamera(anchor, p, c, () => 0);
  assert.ok(p.z < 0.7);
});
test('las paredes altas frenan la cámara elevada; se puede mirar por encima de las bajas', () => {
  const c = new Colliders(); c.addSegment(-5, 2, 5, 2, 20);
  assert.ok(c.cameraFraction(anchor, { x: 0, y: 15, z: 5 }) < 1);
  const low = new Colliders(); low.addSegment(-5, 2, 5, 2, 2);
  assert.equal(low.cameraFraction({ ...anchor, y: 5 }, { x: 0, y: 6, z: 5 }), 1);
});
test('barandas elevadas se respetan a su altura y permiten pasar por abajo', () => {
  const c = new Colliders(); c.add3d(-5, 2, 5, 2, 4, 1);
  assert.equal(c.cameraFraction(anchor, { x: 0, y: 1.7, z: 5 }), 1);
  assert.ok(c.cameraFraction({ ...anchor, y: 4.5 }, { x: 0, y: 4.5, z: 5 }) < 1);
});
test('piso inclinado y cercanía al extremo de una pared respetan el margen', () => {
  const c = new Colliders(); c.addSegment(0.2, 2, 3, 2, 5);
  assert.ok(c.cameraFraction(anchor, { x: 0, y: 1.7, z: 5 }) < 1);
  const p = safeCamera(anchor, { x: 2, y: -3, z: -4 }, c, (x) => x * 0.5);
  assert.ok(p.y >= p.x * 0.5 + 0.4);
});

test('el torso no tapa el cuadro cuando la pared obliga a acercar la cámara', () => {
  const p = { x: 0, y: 0, z: 0 };
  assert.equal(cameraInsidePlayer({ x: 0, y: 1.7, z: 0.6 }, p), true);
  assert.equal(cameraInsidePlayer({ x: 0, y: 1.7, z: 2 }, p), false);
  assert.equal(cameraInsidePlayer({ x: 0, y: 5, z: 0.6 }, p), false);
  assert.equal(cameraInsidePlayer({ x: 0, y: 1.7, z: 0.6 }, { ...p, vehicle: {} }), false);
});
