import test from 'node:test';
import assert from 'node:assert/strict';
import { MapView, bindMapControls } from '../src/map-view.js';

const bounds = [-600, -1100, 980, 600];
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≠ ${b}`);

test('la vista general contiene el plano completo y permite volver a coordenadas reales', () => {
  const v = new MapView(bounds);
  for (const [x, z] of [[bounds[0], bounds[1]], [bounds[2], bounds[3]], [10.73, -0.49]]) {
    const p = v.project(x, z);
    assert.ok(p.every((n) => n >= 0 && n <= v.size));
    const back = v.unproject(...p);
    close(back[0], x); close(back[1], z);
  }
});
test('el zoom conserva el punto bajo el cursor y respeta los límites', () => {
  const v = new MapView(bounds);
  v.focus(0, 0);
  const anchor = v.unproject(580, 530);
  v.zoomAt(1.3, 580, 530);
  const after = v.unproject(580, 530);
  close(anchor[0], after[0]); close(anchor[1], after[1]);
  v.zoomAt(100); assert.equal(v.zoom, 4);
  v.zoomAt(0.001); assert.equal(v.zoom, 1);
  assert.deepEqual(v.project(190, -250), [512, 512]);
});
test('arrastrar sigue al dedo y no permite perderse fuera de los bordes del mapa', () => {
  const v = new MapView(bounds);
  v.focus(0, 0);
  const before = v.project(10, 10);
  v.pan(80, -45);
  const after = v.project(10, 10);
  close(after[0] - before[0], 80); close(after[1] - before[1], -45);
  v.pan(1e6, -1e6);
  const half = (v.size / 2 - 32) / v.scale;
  close(v.x, bounds[0] + half); close(v.z, bounds[3] - half);
  v.reset(); assert.equal(v.zoom, 1); assert.equal(v.x, 190); assert.equal(v.z, -250);
});
test('ubicar a Gaspi conserva el mapa visible incluso cerca de sus extremos', () => {
  const v = new MapView(bounds);
  for (const [x, z] of [[-600, -1100], [980, 600], [0, 0]]) {
    v.focus(x, z);
    assert.equal(v.zoom, 2.5);
    const p = v.project(x, z);
    assert.ok(p.every((n) => n >= -1e-8 && n <= 1024 + 1e-8));
  }
});

class Element extends EventTarget {
  constructor() { super(); this.classes = new Set(); this.classList = { add: (v) => this.classes.add(v), remove: (v) => this.classes.delete(v) }; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 512, height: 512 }; }
  setPointerCapture() {}
  focus() {}
}
test('táctil: arrastre, pinza, cancelación y cierre no dejan un gesto pegado', () => {
  const win = new EventTarget(); globalThis.addEventListener = win.addEventListener.bind(win);
  const canvas = new Element(), v = new MapView(bounds); v.focus(0, 0);
  let draws = 0;
  const controls = { plus: new Element(), minus: new Element(), all: new Element(), player: new Element(), position: () => ({ x: 10, z: -20 }) };
  const clear = bindMapControls(canvas, v, () => draws++, controls);
  const send = (type, pointerId, x, y) => {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, { pointerId, clientX: x, clientY: y, button: 0 }); canvas.dispatchEvent(e);
  };
  const before = v.project(0, 0);
  send('pointerdown', 1, 220, 256); send('pointermove', 1, 230, 256);
  close(v.project(0, 0)[0] - before[0], 20);
  send('pointerdown', 2, 290, 256);
  const zoom = v.zoom;
  send('pointermove', 2, 310, 256); assert.ok(v.zoom > zoom);
  send('pointercancel', 2, 310, 256);
  send('pointermove', 1, 240, 256); assert.ok(draws >= 3);
  clear(); assert.equal(canvas.classes.has('dragging'), false);
  const center = [v.x, v.z]; send('pointermove', 1, 400, 256); assert.deepEqual([v.x, v.z], center);
  controls.all.dispatchEvent(new Event('click')); assert.equal(v.zoom, 1);
  controls.player.dispatchEvent(new Event('click')); assert.equal(v.zoom, 2.5);
  close(v.x, 10); close(v.z, -20);
  controls.plus.dispatchEvent(new Event('click')); assert.equal(v.zoom, 3.5);
  controls.minus.dispatchEvent(new Event('click')); close(v.zoom, 2.5);
});

test('rueda y teclado acercan el plano y las flechas desplazan sin salir de la pausa', () => {
  const win = new EventTarget(); globalThis.addEventListener = win.addEventListener.bind(win);
  const canvas = new Element(), v = new MapView(bounds);
  const controls = { plus: new Element(), minus: new Element(), all: new Element(), player: new Element(), position: () => ({ x: 0, z: 0 }) };
  bindMapControls(canvas, v, () => {}, controls);
  const wheel = new Event('wheel', { cancelable: true });
  Object.assign(wheel, { clientX: 256, clientY: 256, deltaY: -200 }); canvas.dispatchEvent(wheel);
  assert.ok(wheel.defaultPrevented); assert.ok(v.zoom > 1);
  const key = (value) => {
    const e = new Event('keydown', { cancelable: true }); Object.assign(e, { key: value }); canvas.dispatchEvent(e); return e;
  };
  v.focus(0, 0); const p = v.project(0, 0);
  assert.ok(key('ArrowRight').defaultPrevented); close(v.project(0, 0)[0] - p[0], -80);
  key('+'); assert.equal(v.zoom, 3.5); key('-'); close(v.zoom, 2.5);
});
