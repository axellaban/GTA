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
    return this.muted;
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
  update(carSpeed, inCar, motoDist) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    const e = this.engine;
    e.o.frequency.setTargetAtTime(inCar ? 45 + Math.abs(carSpeed) * 5 : 40, t, 0.1);
    e.g.gain.setTargetAtTime(inCar ? 0.12 + Math.min(0.1, Math.abs(carSpeed) * 0.005) : 0, t, 0.2);
    const mv = motoDist < 60 ? (1 - motoDist / 60) * 0.1 : 0;
    e.mo.frequency.setTargetAtTime(190 + Math.sin(t * 3) * 25, t, 0.1);
    e.mg.gain.setTargetAtTime(mv, t, 0.2);
  }
}
