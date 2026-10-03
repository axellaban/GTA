import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playCine, CINE } from '../src/cine.js';

// Eventos y reloj reales de Node; sólo se reemplaza la superficie DOM/media del navegador.
function setup(t, { mp4 = true, playError = null } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const video = Object.assign(new EventTarget(), {
    muted: true, currentTime: 0, paused: true, loads: 0,
    canPlayType: () => mp4 ? 'probably' : '',
    play() { this.paused = false; return playError ? Promise.reject(playError) : Promise.resolve(); },
    pause() { this.paused = true; },
    removeAttribute(name) { delete this[name]; },
    load() { this.loads++; },
  });
  const skip = Object.assign(new EventTarget(), { focus() {}, disabled: false });
  const box = Object.assign(new EventTarget(), {
    classes: new Set(), removed: false,
    setAttribute() {},
    querySelector: (selector) => selector === 'video' ? video : skip,
    remove() { this.removed = true; },
    closest: () => null,
  });
  box.classList = { add: (name) => box.classes.add(name) };
  const keys = new EventTarget();
  const doc = globalThis.document;
  const add = globalThis.addEventListener;
  const remove = globalThis.removeEventListener;
  globalThis.document = { createElement: () => box, body: { appendChild() {} } };
  globalThis.addEventListener = keys.addEventListener.bind(keys);
  globalThis.removeEventListener = keys.removeEventListener.bind(keys);
  t.after(() => {
    if (doc === undefined) delete globalThis.document; else globalThis.document = doc;
    if (add === undefined) delete globalThis.addEventListener; else globalThis.addEventListener = add;
    if (remove === undefined) delete globalThis.removeEventListener; else globalThis.removeEventListener = remove;
    CINE.playing = false;
  });
  return { video, skip, box, keys };
}

test('la presentación tiene sonido y al saltear lo para antes de devolver el control', async (t) => {
  const { video, skip, box } = setup(t);
  const completion = playCine('cine/intro', { poster: 'cine/intro.jpg', version: 'gaspi-20261003' });
  assert.equal(video.muted, false);
  assert.equal(video.src, 'cine/intro.mp4?v=gaspi-20261003');
  assert.equal(CINE.playing, true);
  skip.dispatchEvent(new Event('click'));
  assert.equal(video.paused, true);
  assert.equal(CINE.playing, false);
  await completion;
  assert.equal(box.removed, false); // conserva el último cuadro durante el fundido
  t.mock.timers.tick(450);
  assert.equal(box.removed, true);
  assert.equal(video.src, undefined);
  assert.equal(video.loads, 1);
  t.mock.timers.tick(6000);
  assert.equal(video.loads, 1); // el temporizador viejo no vuelve a cerrar la intro
});

test('Sin sonido se respeta y el fin del video devuelve el control', async (t) => {
  const { video } = setup(t);
  const completion = playCine('cine/intro', { muted: true });
  assert.equal(video.muted, true);
  video.currentTime = 41;
  video.dispatchEvent(new Event('ended'));
  await completion;
  assert.equal(video.paused, true);
  assert.equal(CINE.playing, false);
});

test('una tecla saltea y no llega a los controles del juego', async (t) => {
  const { keys, video } = setup(t);
  const completion = playCine('cine/intro');
  const key = new Event('keydown', { cancelable: true });
  keys.dispatchEvent(key);
  await completion;
  assert.equal(key.defaultPrevented, true);
  assert.equal(video.paused, true);
  assert.equal(CINE.playing, false);
});

test('sin H.264 se usa WebM; un error de carga permite jugar', async (t) => {
  const { video } = setup(t, { mp4: false });
  const completion = playCine('cine/intro');
  assert.equal(video.src, 'cine/intro.webm');
  video.dispatchEvent(new Event('error'));
  await completion;
  assert.equal(CINE.playing, false);
  assert.equal(video.paused, true);
});

test('si la red nunca arranca la intro, a los seis segundos permite jugar', async (t) => {
  const { video } = setup(t);
  const completion = playCine('cine/intro');
  t.mock.timers.tick(6000);
  await completion;
  assert.equal(CINE.playing, false);
  assert.equal(video.paused, true);
});

test('si el navegador rechaza la reproducción, permite jugar sin audio residual', async (t) => {
  const { video } = setup(t, { playError: new Error('NotAllowedError') });
  await playCine('cine/intro');
  assert.equal(CINE.playing, false);
  assert.equal(video.paused, true);
});
