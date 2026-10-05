import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playCine, CINE } from '../src/cine.js';

// Eventos y reloj reales de Node; sólo se reemplaza la superficie DOM/media del navegador.
function setup(t, { mp4 = true, playError = null, viewport = null, nativeFullscreen = false, fullscreenError = null } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const video = Object.assign(new EventTarget(), {
    muted: true, currentTime: 0, paused: true, loads: 0, readyState: 0,
    canPlayType: () => mp4 ? 'probably' : '',
    play() { this.paused = false; return playError ? Promise.reject(playError) : Promise.resolve(); },
    pause() { this.paused = true; },
    removeAttribute(name) { delete this[name]; },
    load() { this.loads++; },
  });
  const skip = Object.assign(new EventTarget(), { focus() {}, disabled: false });
  const fullscreen = Object.assign(new EventTarget(), { disabled: false, hidden: false });
  if (nativeFullscreen) {
    video.fullscreenCalls = 0;
    video.webkitEnterFullscreen = function () {
      this.fullscreenCalls++;
      if (fullscreenError) throw fullscreenError;
      this.webkitDisplayingFullscreen = true;
    };
    video.webkitExitFullscreen = function () { this.webkitDisplayingFullscreen = false; };
  }
  const styles = new Map();
  const box = Object.assign(new EventTarget(), {
    classes: new Set(), removed: false,
    style: { setProperty: (name, value) => styles.set(name, value) },
    setAttribute() {},
    querySelector: (selector) => selector === 'video' ? video : selector === '.cine-fullscreen' ? fullscreen : skip,
    remove() { this.removed = true; },
    closest: () => null,
  });
  box.classList = { add: (name) => box.classes.add(name) };
  const keys = new EventTarget();
  const globals = ['document', 'addEventListener', 'removeEventListener', 'visualViewport', 'innerWidth', 'innerHeight'];
  const saved = new Map(globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  globalThis.document = { createElement: () => box, body: { appendChild() {} } };
  globalThis.addEventListener = keys.addEventListener.bind(keys);
  globalThis.removeEventListener = keys.removeEventListener.bind(keys);
  globalThis.visualViewport = viewport;
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 720;
  t.after(() => {
    for (const [name, descriptor] of saved) {
      if (descriptor === undefined) delete globalThis[name]; else Object.defineProperty(globalThis, name, descriptor);
    }
    CINE.playing = false;
  });
  return { video, skip, fullscreen, box, keys, styles };
}

test('la presentación tiene sonido y al saltear lo para antes de devolver el control', async (t) => {
  const { video, skip, box } = setup(t);
  const completion = playCine('cine/intro', { poster: 'cine/intro.jpg', version: 'gaspi-20261004-cierre' });
  assert.equal(video.muted, false);
  assert.equal(video.src, 'cine/intro.mp4?v=gaspi-20261004-cierre');
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
  video.currentTime = 36.875;
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

test('usa el alto visible de Safari, responde al giro y deja de ajustar al salir', async (t) => {
  const viewport = Object.assign(new EventTarget(), { width: 390, height: 664, offsetLeft: 0, offsetTop: 47 });
  const { styles, skip } = setup(t, { viewport });
  const completion = playCine('cine/intro');
  assert.equal(styles.get('--cine-height'), '664px'); // la barra de Safari oculta parte del layout
  assert.equal(styles.get('--cine-top'), '47px');
  Object.assign(viewport, { width: 844, height: 340, offsetLeft: 0, offsetTop: 0 });
  viewport.dispatchEvent(new Event('resize'));
  assert.equal(styles.get('--cine-width'), '844px');
  assert.equal(styles.get('--cine-height'), '340px');
  viewport.offsetTop = 3;
  viewport.dispatchEvent(new Event('scroll'));
  assert.equal(styles.get('--cine-top'), '3px');
  skip.dispatchEvent(new Event('click'));
  await completion;
  viewport.height = 200;
  viewport.dispatchEvent(new Event('resize'));
  assert.equal(styles.get('--cine-height'), '340px');
});

test('sin VisualViewport sigue el tamaño de ventana y oculta pantalla completa si no está disponible', async (t) => {
  const { styles, keys, fullscreen, skip } = setup(t);
  const completion = playCine('cine/intro');
  assert.equal(styles.get('--cine-width'), '1280px');
  assert.equal(fullscreen.hidden, true);
  globalThis.innerHeight = 600;
  keys.dispatchEvent(new Event('resize'));
  assert.equal(styles.get('--cine-height'), '600px');
  skip.dispatchEvent(new Event('click'));
  await completion;
});

test('pantalla completa nativa espera el video y no saltea la intro al tocar su botón', async (t) => {
  const { video, box, keys, fullscreen } = setup(t, { nativeFullscreen: true });
  const completion = playCine('cine/intro');
  assert.equal(fullscreen.hidden, false);
  assert.equal(fullscreen.disabled, true);
  video.readyState = 1;
  video.dispatchEvent(new Event('loadedmetadata'));
  assert.equal(fullscreen.disabled, false);
  keys.closest = () => fullscreen;
  const enter = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Enter' });
  keys.dispatchEvent(enter);
  assert.equal(enter.defaultPrevented, false); // permite la activación normal con teclado
  assert.equal(CINE.playing, true);
  box.closest = (selector) => selector.includes('.cine-fullscreen') ? fullscreen : null;
  box.dispatchEvent(new Event('pointerdown')); // el toque pertenece al botón de pantalla completa
  fullscreen.dispatchEvent(new Event('click'));
  assert.equal(video.fullscreenCalls, 1);
  assert.equal(CINE.playing, true);
  assert.equal(video.paused, false);
  video.dispatchEvent(new Event('webkitendfullscreen'));
  await completion;
  assert.equal(video.paused, true);
  assert.equal(video.webkitDisplayingFullscreen, false);
});

test('un rechazo de pantalla completa mantiene el video y el audio reproduciéndose', async (t) => {
  const { video, fullscreen, skip } = setup(t, { nativeFullscreen: true, fullscreenError: new Error('NotAllowedError') });
  const completion = playCine('cine/intro');
  video.readyState = 1;
  video.dispatchEvent(new Event('loadedmetadata'));
  fullscreen.dispatchEvent(new Event('click'));
  assert.equal(CINE.playing, true);
  assert.equal(video.paused, false);
  skip.dispatchEvent(new Event('click'));
  await completion;
});
