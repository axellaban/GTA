// Sonido sintetizado con WebAudio: bombos, bocinas, tiros, motores (src/motores.js), bocina del tren y barreras.
import { Gearbox, MotorVoice, motorOf } from './motores.js';

// medio segundo de silencio en WAV: un <audio> en bucle con esto pasa la sesión de audio del iPhone a
// "reproducción" (si no, con la llave de silencio puesta, WebAudio no suena)
function silentWav() {
  const n = 4000;
  const b = new Uint8Array(44 + n);
  const dv = new DataView(b.buffer);
  const str = (o, t) => [...t].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + n, true);
  str(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true);
  dv.setUint32(28, 8000, true);
  dv.setUint16(32, 1, true);
  dv.setUint16(34, 8, true);
  str(36, 'data');
  dv.setUint32(40, n, true);
  b.fill(128, 44);
  let bin = '';
  for (const x of b) bin += String.fromCharCode(x);
  return 'data:audio/wav;base64,' + btoa(bin);
}

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.others = [];
    this.nearT = 0;
  }
  // se llama dentro del toque en "Jugar" (los navegadores del celu solo dejan sonar después de un gesto)
  start() {
    if (this.ctx) {
      this.resume();
      return;
    }
    try {
      try {
        // iPhone (Safari 16.4+): que suene aunque esté la llave de silencio
        if (navigator.audioSession) navigator.audioSession.type = 'playback';
      } catch {
        /* nada */
      }
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      // compresor al final: los motores y los tiros suenan fuerte sin romper los parlantes del celu
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.knee.value = 10;
      this.comp.ratio.value = 4;
      this.comp.attack.value = 0.004;
      this.comp.release.value = 0.2;
      this.master.connect(this.comp).connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise();
      this.unlock();
      // el celu suspende el audio al bloquear la pantalla, con la intro o una llamada: se retoma en el
      // próximo toque o al volver
      const again = () => this.resume();
      for (const ev of ['touchend', 'pointerup', 'click', 'keydown']) window.addEventListener(ev, again, { capture: true, passive: true });
      document.addEventListener('visibilitychange', () => !document.hidden && this.resume());
    } catch {
      this.ctx = null;
    }
  }
  unlock() {
    const c = this.ctx;
    // una muestra en silencio dentro del gesto (iPhone viejo) y arrancar el contexto
    const s = c.createBufferSource();
    s.buffer = c.createBuffer(1, 1, 22050);
    s.connect(c.destination);
    s.start(0);
    c.resume?.().catch(() => {});
    // iPhone sin audioSession: un <audio> mudo en bucle
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios && !navigator.audioSession) {
      const a = document.createElement('audio');
      a.setAttribute('x-webkit-airplay', 'deny');
      a.setAttribute('playsinline', '');
      a.loop = true;
      a.src = silentWav();
      a.play().catch(() => {});
      this.silent = a;
    }
    // las voces del navegador también se destraban con un gesto
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis?.speak(u);
    } catch {
      /* sin voces */
    }
  }
  resume() {
    const c = this.ctx;
    if (!c) return;
    if (c.state !== 'running') c.resume?.().catch(() => {});
    if (this.silent?.paused) this.silent.play().catch(() => {});
  }
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    if (this.muted) window.speechSynthesis?.cancel();
    return this.muted;
  }
  // Voces con la síntesis del navegador: español latino (argentino si el equipo lo tiene).
  // Una sola voz a la vez; cada personaje con su tono (key) para que no suenen todos iguales.
  speak(text, { female = false, key = 0, vol = 1, force = false } = {}) {
    const S = window.speechSynthesis;
    if (!S || this.muted || !this.ctx) return false;
    if (S.speaking || S.pending) {
      if (!force) return false;
      S.cancel();
    }
    if (!this.voices?.length) {
      const all = S.getVoices();
      const lang = (v) => v.lang.replace('_', '-');
      this.voices = ['es-AR', 'es-419', 'es-US', 'es-MX', 'es-', 'es'].flatMap((l) => all.filter((v) => lang(v).startsWith(l)));
    }
    if (!this.voices.length) return false;
    // si hay voces de mujer y de hombre en el mismo idioma, elegir la que va
    const fem = /paulina|m[oó]nica|helena|laura|sabina|luciana|isabel|elena|marisol|ang[eé]lica|soledad|female|mujer/i;
    const same = this.voices.filter((v) => v.lang === this.voices[0].lang);
    const voice = same.find((v) => fem.test(v.name) === female) || this.voices[0];
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    const k = (Math.sin(key * 12.9898) * 43758.5453) % 1;
    u.pitch = (female ? 1.25 : 0.85) + Math.abs(k) * 0.3;
    u.rate = 1.08 + Math.abs(k) * 0.12;
    u.volume = Math.max(0.2, Math.min(1, vol));
    S.speak(u);
    return true;
  }
  makeNoise() {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  env(node, t, a, peak, dur) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  vol(v) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(this.master);
    return g;
  }

  // Bombo de murga: golpe grave + chasquido
  bombo(v = 1) {
    if (!this.ctx || v < 0.02) return;
    const t = this.ctx.currentTime;
    const out = this.vol(v);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
    this.env(g, t, 0.005, 0.9, 0.4);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.45);
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const ng = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1800;
    this.env(ng, t, 0.002, 0.25, 0.05);
    n.connect(f).connect(ng).connect(out);
    n.start(t);
    n.stop(t + 0.06);
  }
  platillo(v = 1) {
    if (!this.ctx || v < 0.02) return;
    const t = this.ctx.currentTime;
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 6500;
    const g = this.ctx.createGain();
    this.env(g, t, 0.002, 0.35 * v, 0.25);
    n.connect(f).connect(g).connect(this.master);
    n.start(t);
    n.stop(t + 0.3);
  }
  tone(freqs, dur, type = 'square', v = 0.3, t0 = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + t0;
    const out = this.vol(v);
    for (const fr of freqs) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = fr;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      g.gain.setValueAtTime(0.4, t + dur - 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2200;
      o.connect(f).connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }
  bocina(v = 0.5) {
    this.tone([392, 494], 0.35, 'square', v * 0.35);
  }
  bocinaTren(v = 0.6) {
    this.tone([311, 370, 466], 1.4, 'sawtooth', v * 0.3);
  }
  campana(v = 0.4) {
    if (!this.ctx || v < 0.02) return;
    this.tone([1480], 0.18, 'triangle', v * 0.5);
  }
  golpe(v = 0.6) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = this.ctx.createGain();
    this.env(g, t, 0.003, v, 0.25);
    n.connect(f).connect(g).connect(this.master);
    n.start(t);
    n.stop(t + 0.3);
  }
  ladrido(v = 0.5) {
    if (!this.ctx || v < 0.02) return;
    for (let i = 0; i < 2; i++) {
      const t = this.ctx.currentTime + i * 0.22;
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(260, t + 0.12);
      const g = this.ctx.createGain();
      this.env(g, t, 0.005, v * 0.35, 0.14);
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      o.connect(f).connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.16);
    }
  }
  plata() {
    this.tone([988, 1319], 0.12, 'square', 0.12);
    this.tone([1319, 1760], 0.16, 'square', 0.12, 0.1);
  }
  alerta() {
    this.tone([220, 233], 0.5, 'sawtooth', 0.22);
  }
  // el celu sonando
  ring() {
    for (let i = 0; i < 3; i++) {
      this.tone([1318, 1568], 0.12, 'square', 0.1, i * 0.45);
      this.tone([1568, 1976], 0.12, 'square', 0.1, i * 0.45 + 0.14);
    }
  }
  // misión cumplida: arpegio que sube
  cumplida() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone([f, f * 1.5], i === 3 ? 0.6 : 0.16, 'square', 0.14, i * 0.14));
  }
  // misión fallida: dos notas que bajan
  fallida() {
    this.tone([392, 466], 0.3, 'sawtooth', 0.16);
    this.tone([311, 370], 0.6, 'sawtooth', 0.16, 0.3);
  }

  // ruido filtrado con envolvente: base de tiros, golpes y explosiones
  burst(dur, freq, type, peak, t0 = 0, q = 0.7) {
    if (!this.ctx) return null;
    const t = this.ctx.currentTime + t0;
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    n.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, 0.002, peak, dur);
    n.connect(f).connect(g).connect(this.master);
    n.start(t, Math.random() * 0.5);
    n.stop(t + dur + 0.05);
    return f;
  }
  thump(f0, f1, dur, peak, t0 = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + t0;
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, 0.003, peak, dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  // petardeo del escape: un estampido seco y grave, a veces doble
  petardeo(v = 0.5) {
    this.thump(110, 40, 0.12, v * 0.9);
    this.burst(0.09, 700, 'lowpass', v * 0.7);
    if (Math.random() < 0.4) {
      this.thump(95, 38, 0.1, v * 0.6, 0.11);
      this.burst(0.07, 600, 'lowpass', v * 0.45, 0.11);
    }
  }
  // motosierra: motor de dos tiempos que acelera en cada corte
  motosierra(v = 0.6) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(95, t);
    o.frequency.linearRampToValueAtTime(160, t + 0.12);
    o.frequency.linearRampToValueAtTime(125, t + 0.34);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    const g = this.ctx.createGain();
    this.env(g, t, 0.01, v * 0.5, 0.34);
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.4);
    this.burst(0.3, 3000, 'bandpass', v * 0.2);
  }
  disparo(kind = 'pistola', v = 1) {
    if (!this.ctx || v < 0.02) return;
    if (kind === 'escopeta') {
      this.burst(0.5, 1200, 'lowpass', 1.1 * v);
      this.thump(120, 38, 0.35, 0.9 * v);
      this.burst(0.9, 500, 'lowpass', 0.25 * v, 0.06);
    } else if (kind === 'ametralladora') {
      // calibre grueso: golpe grave y seco, con eco corto
      this.burst(0.2, 1800, 'lowpass', 1.0 * v);
      this.thump(150, 42, 0.18, 0.85 * v);
      this.burst(0.35, 600, 'lowpass', 0.18 * v, 0.03);
    } else if (kind === 'bazuca') {
      // disparo del cohete: estampido sordo y el siseo del motor que se aleja
      this.thump(90, 30, 0.5, 1.1 * v);
      this.burst(0.35, 900, 'lowpass', 0.9 * v);
      const f = this.burst(1.4, 2600, 'bandpass', 0.35 * v, 0.05, 1.2);
      if (f) f.frequency.exponentialRampToValueAtTime(700, this.ctx.currentTime + 1.4);
    } else if (kind === 'revolver') {
      this.burst(0.28, 2400, 'lowpass', 0.95 * v);
      this.thump(180, 50, 0.22, 0.7 * v);
      this.burst(0.6, 700, 'lowpass', 0.15 * v, 0.05);
    } else {
      this.burst(0.16, 3200, 'lowpass', 0.8 * v);
      this.thump(220, 70, 0.12, 0.45 * v);
      this.burst(0.4, 900, 'lowpass', 0.1 * v, 0.04);
    }
  }
  // rayo del plato volador: barrido agudo que cae, con un chasquido
  zap() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(2400, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.25);
    const g = this.ctx.createGain();
    this.env(g, t, 0.003, 0.35, 0.28);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.32);
    this.burst(0.06, 5000, 'highpass', 0.4);
  }
  click() {
    this.burst(0.03, 4000, 'highpass', 0.3);
  }
  recarga() {
    this.burst(0.04, 3000, 'bandpass', 0.35, 0, 3);
    this.burst(0.05, 2200, 'bandpass', 0.4, 0.18, 3);
  }
  whoosh(v = 0.3) {
    if (!this.ctx) return;
    const f = this.burst(0.18, 600, 'bandpass', v * 0.6, 0, 1.5);
    if (f) f.frequency.exponentialRampToValueAtTime(2200, this.ctx.currentTime + 0.15);
  }
  metal(v = 0.5) {
    this.burst(0.12, 2600, 'bandpass', v * 0.5, 0, 6);
    this.tone([1830, 2710], 0.15, 'triangle', v * 0.08);
  }
  explosion(v = 1) {
    if (!this.ctx) return;
    this.burst(1.6, 700, 'lowpass', 1.2 * v);
    this.thump(90, 25, 1.2, 1.2 * v);
    this.burst(2.4, 250, 'lowpass', 0.6 * v, 0.1);
  }
  trueno(v = 0.8, delay = 0) {
    if (!this.ctx) return;
    this.burst(0.25, 1800, 'lowpass', 0.35 * v, delay);
    this.burst(3.5, 180, 'lowpass', 0.9 * v, delay + 0.05);
    this.thump(60, 28, 2.5, 0.5 * v, delay);
  }
  // Sirena de patrullero: dos tonos que suben y bajan (se prende y apaga)
  sirena(v) {
    if (!this.ctx) return;
    if (!this.siren) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.45;
      const lg = this.ctx.createGain();
      lg.gain.value = 320;
      lfo.connect(lg).connect(o.frequency);
      o.frequency.value = 980;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2400;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      o.connect(f).connect(g).connect(this.master);
      o.start();
      lfo.start();
      this.siren = { g };
    }
    this.siren.g.gain.setTargetAtTime(Math.min(0.12, v * 0.12), this.ctx.currentTime, 0.3);
  }
  // Helicóptero: pulso grave
  helicoptero(v) {
    if (!this.ctx) return;
    if (!this.heli) {
      const n = this.ctx.createBufferSource();
      n.buffer = this.noiseBuf;
      n.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 260;
      const am = this.ctx.createGain();
      am.gain.value = 0.5;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 11;
      const lg = this.ctx.createGain();
      lg.gain.value = 0.5;
      lfo.connect(lg).connect(am.gain);
      const g = this.ctx.createGain();
      g.gain.value = 0;
      n.connect(f).connect(am).connect(g).connect(this.master);
      n.start();
      lfo.start();
      this.heli = { g };
    }
    this.heli.g.gain.setTargetAtTime(Math.min(0.5, v * 0.5), this.ctx.currentTime, 0.4);
  }
  // Chirrido de gomas al derrapar
  chirrido(v) {
    if (!this.ctx) return;
    if (!this.screech) {
      const n = this.ctx.createBufferSource();
      n.buffer = this.noiseBuf;
      n.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2100;
      f.Q.value = 6;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      n.connect(f).connect(g).connect(this.master);
      n.start();
      this.screech = { g, f };
    }
    this.screech.g.gain.setTargetAtTime(v * 0.22, this.ctx.currentTime, 0.05);
    this.screech.f.frequency.setTargetAtTime(1800 + v * 700, this.ctx.currentTime, 0.1);
  }
  // Lluvia: ruido suave continuo
  lluvia(v) {
    if (!this.ctx) return;
    if (!this.rain) {
      const n = this.ctx.createBufferSource();
      n.buffer = this.noiseBuf;
      n.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 900;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      n.connect(f).connect(g).connect(this.master);
      n.start();
      this.rain = { g };
    }
    this.rain.g.gain.setTargetAtTime(v * 0.08, this.ctx.currentTime, 1);
  }

  // Motores: el del auto o la moto que manejás (con caja de cambios) y los de los autos y motos que pasan
  // cerca (hasta 3, con paneo y Doppler). v: el vehículo del jugador · cam: la cámara (el oído)
  update(dt, v, cam, traffic, crime) {
    if (!this.ctx) return;
    dt = Math.min(dt, 0.1);
    const name = v && !v.wreck ? motorOf(v) : null;
    if (name !== this.mine?.name || (this.mine && this.mine.v !== v)) {
      this.mine?.voice.stop();
      this.mine = name ? { name, v, voice: new MotorVoice(this.ctx, this.master, name), box: new Gearbox(name) } : null;
    }
    if (this.mine) {
      const m = this.mine;
      const rpm = m.box.update(dt, v.speed ?? 0, v.vmax ?? 30, v.throttle ?? 0);
      m.voice.set(rpm, m.box.load, 0.62);
    }
    this.nearby(dt, v, cam, traffic, crime);
  }
  nearby(dt, mine, cam, traffic, crime) {
    if (!cam) return;
    const lx = cam.position.x;
    const lz = cam.position.z;
    if ((this.nearT -= dt) <= 0) {
      this.nearT = 0.3;
      const cands = [];
      const add = (c) => {
        if (!c || c === mine || c.wreck || c.dead || !motorOf(c)) return;
        const d = Math.hypot(c.x - lx, c.z - lz);
        if (d < 48) cands.push([d, c]);
      };
      for (const c of traffic?.cars ?? []) add(c);
      for (const m of crime?.motos ?? []) if (m.state !== 'down' && m.state !== 'gone') add(m.v);
      cands.sort((a, b) => a[0] - b[0]);
      const pick = new Set(cands.slice(0, 3).map((x) => x[1]));
      this.others = this.others.filter((o) => {
        if (pick.has(o.car)) return pick.delete(o.car) || true;
        o.voice.stop(0.4);
        return false;
      });
      for (const car of pick) {
        const name = motorOf(car);
        this.others.push({ car, voice: new MotorVoice(this.ctx, this.master, name, true), box: new Gearbox(name), prev: Math.abs(car.speed ?? 0), thr: 0.3 });
      }
    }
    // la derecha de la cámara, para el paneo
    const e = cam.matrixWorld.elements;
    const rx = e[0];
    const rz = e[2];
    const rl = Math.hypot(rx, rz) || 1;
    for (const o of this.others) {
      const c = o.car;
      const dx = c.x - lx;
      const dz = c.z - lz;
      const d = Math.max(0.5, Math.hypot(dx, dz));
      const sp = c.speed ?? 0;
      const acc = (Math.abs(sp) - o.prev) / Math.max(dt, 1e-3);
      o.prev = Math.abs(sp);
      o.thr += (Math.max(0, Math.min(1, 0.25 + acc / 3)) - o.thr) * Math.min(1, dt * 4);
      const vmax = { moto: 29, diesel: 18, sport: 45 }[o.voice.name] ?? 30;
      const rpm = o.box.update(dt, sp, vmax, o.thr);
      // Doppler: el "ñeeeooo" del que pasa
      const vr = -((c.fx ?? 0) * sp * dx + (c.fz ?? 0) * sp * dz) / d;
      const pitch = Math.max(0.85, Math.min(1.18, 343 / (343 - vr)));
      const fall = Math.max(0, 1 - d / 48);
      o.voice.set(rpm, o.box.load, 0.5 * fall * fall, pitch, Math.max(-0.9, Math.min(0.9, ((dx * rx + dz * rz) / rl / d) * 0.9)));
    }
  }
}
