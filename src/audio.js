// Sonido sintetizado con WebAudio: bombos, bocinas, motos, bocina del tren y barreras.
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engine = null;
  }
  start() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise();
      this.setupEngine();
    } catch {
      this.ctx = null;
    }
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

  setupEngine() {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    o.connect(f).connect(g).connect(this.master);
    o.start();
    const mo = this.ctx.createOscillator();
    mo.type = 'square';
    const mf = this.ctx.createBiquadFilter();
    mf.type = 'bandpass';
    mf.frequency.value = 1400;
    const mg = this.ctx.createGain();
    mg.gain.value = 0;
    mo.connect(mf).connect(mg).connect(this.master);
    mo.start();
    this.engine = { o, g, mo, mg };
  }
  // Motor del auto de Gaspi y el "ñeeee" de la moto que se acerca.
  update(carSpeed, inCar, motoDist, onMoto = false) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    const e = this.engine;
    const car = inCar && !onMoto;
    // cambios: el motor sube de vueltas y cae al pasar de marcha
    const sp = Math.abs(carSpeed);
    const gear = sp < 7 ? sp / 7 : sp < 15 ? (sp - 7) / 8 : sp < 24 ? (sp - 15) / 9 : (sp - 24) / 12;
    e.o.frequency.setTargetAtTime(car ? 42 + gear * 55 + sp * 1.2 : 40, t, 0.08);
    e.g.gain.setTargetAtTime(car ? 0.12 + Math.min(0.1, sp * 0.005) : 0, t, 0.2);
    // moto de Gaspi o motos cerca
    const mine = onMoto ? 0.09 : 0;
    const mv = Math.max(mine, motoDist < 60 ? (1 - motoDist / 60) * 0.1 : 0);
    e.mo.frequency.setTargetAtTime(onMoto ? 150 + gear * 200 + sp * 3 : 190 + Math.sin(t * 3) * 25, t, 0.06);
    e.mg.gain.setTargetAtTime(mv, t, 0.2);
  }
}
