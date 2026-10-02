// Cinemáticas: videos pre-renderizados (los hace el dueño con Higgsfield; ver R12 en PLAN.md) a pantalla
// completa con franjas negras a lo GTA, el nombre abajo a la izquierda y un botón para saltear.
// Se saltean también con cualquier tecla o tocando la pantalla. playCine devuelve una promesa que se
// resuelve al terminar (o si el video no carga: el juego nunca se queda trabado en la cinemática).
// Cada video va en dos formatos: .mp4 (H.264, iPhone y casi todos) y .webm (VP9, los navegadores sin H.264).

export const CINE = { playing: false };

export function playCine(base, { title = '', sub = '', poster = '' } = {}) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.id = 'cine';
    box.innerHTML = `
      <video playsinline muted preload="auto"${poster ? ` poster="${poster}"` : ''}></video>
      <div class="cine-bar top"></div><div class="cine-bar bottom"></div>
      <div class="cine-title"><strong></strong><span></span></div>
      <button type="button" class="cine-skip">Saltear ▸</button>`;
    box.querySelector('strong').textContent = title;
    box.querySelector('.cine-title span').textContent = sub;
    const video = box.querySelector('video');
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      CINE.playing = false;
      removeEventListener('keydown', onKey, true);
      box.classList.add('out');
      setTimeout(() => box.remove(), 450);
      resolve();
    };
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      finish();
    };
    box.querySelector('.cine-skip').addEventListener('click', finish);
    box.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.cine-skip')) finish();
    });
    addEventListener('keydown', onKey, true);
    video.addEventListener('ended', finish);
    video.addEventListener('error', finish);
    // el título aparece un segundo después de arrancar, como en las presentaciones de GTA
    video.addEventListener('playing', () => setTimeout(() => box.classList.add('titled'), 900), { once: true });
    // si en 6 segundos no arrancó (red lenta o el navegador no lo deja), se sigue al juego
    setTimeout(() => video.currentTime === 0 && finish(), 6000);
    video.src = `${base}.${video.canPlayType('video/mp4; codecs="avc1.4D401F"') ? 'mp4' : 'webm'}`;
    document.body.appendChild(box);
    CINE.playing = true;
    video.play().catch(finish);
  });
}
