// Instalar como app: en Android (y en compu con Chrome/Edge) se usa el aviso del navegador;
// en iPhone se explica "Compartir → Agregar a inicio". Se muestra antes que todo, una sola vez.
const $ = (id) => document.getElementById(id);
const KEY = 'gta-conurbano-instalar';

export function setupInstall() {
  const standalone = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
  const framed = window.self !== window.top; // dentro de otra página (por ejemplo, un visor): no tiene sentido
  if (framed) return;
  // service worker para que funcione como app y sin conexión
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (standalone) return;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = ios && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  const mobile = ios || /Android/.test(ua) || matchMedia('(pointer: coarse)').matches;
  let deferred = null;
  let seen = false;
  try {
    seen = localStorage.getItem(KEY) === 'visto';
  } catch {
    /* sin almacenamiento */
  }
  const close = () => {
    $('install').hidden = true;
    try {
      localStorage.setItem(KEY, 'visto');
    } catch {
      /* sin almacenamiento */
    }
  };
  $('install-skip').addEventListener('click', close);
  // la pantalla con los pasos para instalar (en iPhone es la única forma)
  const show = () => {
    $('install').hidden = false;
    if (ios) {
      $('install-ios').hidden = !safari;
      $('install-ios-safari').hidden = safari;
    } else {
      $('install-android').hidden = false;
      $('install-btn').hidden = !deferred; // aparece cuando el navegador lo permite
      $('install-android-manual').hidden = !!deferred;
    }
  };
  const prompt = async () => {
    if (!deferred) return show();
    deferred.prompt();
    const r = await deferred.userChoice.catch(() => null);
    deferred = null;
    $('install-desk').hidden = true;
    if (r?.outcome === 'accepted') close();
  };
  $('install-btn').addEventListener('click', prompt);
  $('install-desk').addEventListener('click', prompt);
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    $('install-btn').hidden = false;
    $('install-android-manual').hidden = true;
    // botón en la pantalla de inicio
    $('install-desk').hidden = false;
  });
  addEventListener('appinstalled', () => {
    close();
    $('install-desk').hidden = true;
  });
  // en iPhone no hay aviso del navegador: el botón de inicio abre los pasos
  if (ios) $('install-desk').hidden = false;
  // la pantalla de instalar va primero, solo en celulares y la primera vez
  if (!mobile || seen) return;
  show();
}
