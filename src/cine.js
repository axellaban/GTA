// Cinemáticas pre-renderizadas con su mezcla de audio y títulos (ver R12 en PLAN.md).
// Se saltean también con cualquier tecla o tocando la pantalla. playCine devuelve una promesa que se
// resuelve al terminar (o si el video no carga: el juego nunca se queda trabado en la cinemática).
// Cada video va en dos formatos: .mp4 (H.264, iPhone y casi todos) y .webm (VP9, los navegadores sin H.264).

export const CINE = { playing: false };

export function playCine(base, { poster = '', muted = false, version = '' } = {}) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.id = 'cine';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Presentación de GTA VI Conurba');
    box.innerHTML = `
      <video playsinline preload="auto"></video>
      <button type="button" class="cine-fullscreen" hidden>Pantalla completa ⛶</button>
      <button type="button" class="cine-skip">Saltear ▸</button>`;
    const video = box.querySelector('video');
    const fullscreen = box.querySelector('.cine-fullscreen');
    const nativeFullscreen = video.webkitEnterFullscreen || video.webkitEnterFullScreen;
    fullscreen.hidden = !nativeFullscreen && !box.requestFullscreen;
    fullscreen.disabled = video.readyState < 1;
    video.muted = muted;
    if (poster) video.poster = poster;
    // Safari puede tener un viewport de layout más alto que la pantalla visible.
    const viewport = globalThis.visualViewport;
    const fitViewport = () => {
      const width = viewport?.width ?? globalThis.innerWidth;
      const height = viewport?.height ?? globalThis.innerHeight;
      if (!(width > 0 && height > 0)) return;
      box.style.setProperty('--cine-width', `${width}px`);
      box.style.setProperty('--cine-height', `${height}px`);
      box.style.setProperty('--cine-left', `${viewport?.offsetLeft ?? 0}px`);
      box.style.setProperty('--cine-top', `${viewport?.offsetTop ?? 0}px`);
    };
    fitViewport();
    addEventListener('resize', fitViewport);
    addEventListener('fullscreenchange', fitViewport);
    viewport?.addEventListener('resize', fitViewport);
    viewport?.addEventListener('scroll', fitViewport);
    let done = false;
    let startupTimer;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(startupTimer);
      // Parar antes de volver al juego: el fundido visual no puede dejar música o voz sonando.
      video.pause();
      CINE.playing = false;
      removeEventListener('keydown', onKey, true);
      removeEventListener('resize', fitViewport);
      removeEventListener('fullscreenchange', fitViewport);
      viewport?.removeEventListener('resize', fitViewport);
      viewport?.removeEventListener('scroll', fitViewport);
      if (video.webkitDisplayingFullscreen) {
        try { video.webkitExitFullscreen?.(); } catch { /* la reproducción ya está parada */ }
      }
      if (document.fullscreenElement === box) document.exitFullscreen?.().catch(() => {});
      box.classList.add('out');
      box.querySelector('.cine-skip').disabled = true;
      fullscreen.disabled = true;
      setTimeout(() => {
        video.removeAttribute('src');
        video.load();
        box.remove();
      }, 450);
      resolve();
    };
    const onKey = (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('.cine-fullscreen')) return;
      e.preventDefault();
      e.stopPropagation();
      finish();
    };
    box.querySelector('.cine-skip').addEventListener('click', finish);
    fullscreen.addEventListener('click', async () => {
      if (done) return;
      try {
        // iPhone ofrece pantalla completa nativa para video aunque no la ofrezca para un div.
        if (nativeFullscreen) nativeFullscreen.call(video);
        else await box.requestFullscreen({ navigationUI: 'hide' });
      } catch { /* si el navegador la rechaza, la intro sigue en el viewport visible */ }
    });
    box.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.cine-skip, .cine-fullscreen')) finish();
    });
    addEventListener('keydown', onKey, true);
    video.addEventListener('ended', finish);
    video.addEventListener('error', finish);
    video.addEventListener('webkitendfullscreen', finish);
    video.addEventListener('loadedmetadata', () => { if (!done) fullscreen.disabled = false; }, { once: true });
    video.addEventListener('playing', () => clearTimeout(startupTimer), { once: true });
    // si en 6 segundos no arrancó (red lenta o el navegador no lo deja), se sigue al juego
    startupTimer = setTimeout(() => video.currentTime === 0 && finish(), 6000);
    const ext = video.canPlayType('video/mp4; codecs="avc1.4D401F"') ? 'mp4' : 'webm';
    video.src = `${base}.${ext}${version ? `?v=${encodeURIComponent(version)}` : ''}`;
    document.body.appendChild(box);
    CINE.playing = true;
    box.querySelector('.cine-skip').focus({ preventScroll: true });
    video.play().catch(finish);
  });
}
