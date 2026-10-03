// Ruido de motor sintetizado (sin grabaciones). Cada tipo de motor se arma una sola vez como dos bucles
// cortos, a vueltas bajas y altas: los pulsos del escape de cada cilindro (en un cuatro tiempos, uno cada dos
// vueltas), cada cilindro un poco distinto (el "rrrum" desparejo), con ruido de combustión, el golpeteo del
// diésel, las resonancias del caño y una saturación suave. En el juego cada bucle suena con el tono que piden
// las vueltas y se mezclan; la carga (el acelerador) satura más, abre el filtro y sube el volumen; al soltar,
// el motor queda opaco y más bajo. Los parlantes del celu casi no dan graves: el cuerpo del sonido está en los
// armónicos y el raspado (de 200 a 3000 Hz), no en el bajo.

// cyl: cilindros · idle/red: vueltas en ralentí y al máximo · lo/hi: vueltas de cada bucle · amp: fuerza de cada
// cilindro · jit: desparejo de cada explosión · dec: cuánto dura cada pulso (ms) · rasp: ruido de combustión ·
// knock: golpeteo (diésel) · res: resonancias del caño [Hz, Q, ganancia] · lp: filtro sin carga y a fondo ·
// gears: velocidad de cada marcha (fracción de la máxima) · vol: volumen relativo
export const MOTORES = {
  // Falcon, patrullero, pickup: seis en línea grueso, con algo de desparejo
  seis: { cyl: 6, idle: 700, red: 5200, lo: 1050, hi: 3300, amp: [1, 0.8, 1.1, 0.86, 1.04, 0.9], jit: 0.07, dec: 3.4, rasp: 0.4, knock: 0, res: [[110, 1.3, 1.3], [340, 2.2, 0.9], [1150, 2.6, 0.45]], lp: [950, 5600], gears: [0.22, 0.4, 0.6, 0.8, 1.03], vol: 1 },
  // Gol, Duna, 504, taxis, remises: cuatro cilindros, más agudo y parejo
  cuatro: { cyl: 4, idle: 850, red: 6200, lo: 1300, hi: 4000, amp: [1, 0.9, 1.06, 0.92], jit: 0.04, dec: 2.6, rasp: 0.5, knock: 0, res: [[150, 1.4, 1], [520, 2.2, 0.9], [1600, 2.8, 0.45]], lp: [1100, 6200], gears: [0.2, 0.37, 0.56, 0.77, 1.03], vol: 0.85 },
  // Ferrari y deportivos: ocho cilindros que gritan arriba
  sport: { cyl: 8, idle: 950, red: 8200, lo: 1700, hi: 5400, amp: [1, 0.86, 1.08, 0.9, 1.04, 0.84, 1.1, 0.92], jit: 0.05, dec: 2.1, rasp: 0.55, knock: 0, res: [[170, 1.4, 1.1], [640, 2.4, 1.1], [2100, 2.8, 0.6]], lp: [1500, 8500], gears: [0.17, 0.31, 0.47, 0.64, 0.82, 1.03], vol: 1.05 },
  // colectivo, camión, Trafic, autobomba, tanque: diésel con golpeteo
  diesel: { cyl: 6, idle: 620, red: 2700, lo: 820, hi: 1950, amp: [1, 0.92, 1.05, 0.95, 1.02, 0.9], jit: 0.05, dec: 4.2, rasp: 0.55, knock: 0.9, res: [[80, 1.1, 1.3], [260, 2, 0.8], [1900, 1.8, 0.7]], lp: [800, 4200], gears: [0.14, 0.26, 0.42, 0.62, 0.82, 1.03], vol: 1.1 },
  // moto de 150 de un cilindro (delivery, motochorros, la de Gaspi): petardeo seco que sube a "ñeeee"
  moto: { cyl: 1, idle: 1500, red: 9500, lo: 2500, hi: 6600, amp: [1], jit: 0.05, dec: 2.3, rasp: 0.65, knock: 0, res: [[240, 1.8, 1], [820, 2.8, 1.2], [2500, 3, 0.6]], lp: [1700, 7500], gears: [0.26, 0.46, 0.7, 1.03], vol: 1.25 },
};

export function motorOf(v) {
  if (!v || v.kind === 'carro') return null; // el carro del cartonero va a caballo
  if (v.kind === 'moto') return 'moto';
  if (v.kind === 'bus' || v.kind === 'tank' || ['camion', 'trafic', 'firetruck', 'ambulance'].includes(v.model)) return 'diesel';
  if (v.model?.startsWith('ferrucho') || v.model === 'q_sport' || v.model === 'q_coupe') return 'sport';
  if (['falcon', 'patrullero', 'pickup', 'q_suv'].includes(v.model)) return 'seis';
  return 'cuatro';
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// filtro pasabanda (RBJ) sobre un bucle: dos pasadas para que el estado del filtro empalme el final con el
// principio (el bucle no hace clic)
function bandpass(x, sr, f, q) {
  const w = (2 * Math.PI * f) / sr;
  const al = Math.sin(w) / (2 * q);
  const a0 = 1 + al;
  const b0 = al / a0;
  const b2 = -al / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - al) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < x.length; i++) {
      const v = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x[i];
      y2 = y1;
      y1 = v;
      if (pass) y[i] = v;
    }
  }
  return y;
}

// un bucle de ~1,2 s del motor P girando a rpm vueltas por minuto
function renderLoop(sr, P, rpm, seed) {
  const rnd = rng(seed);
  const cycHz = rpm / 120; // un ciclo completo (cuatro tiempos) cada dos vueltas
  const nCyc = Math.max(3, Math.round(cycHz * 1.2));
  const L = Math.round((nCyc / cycHz) * sr);
  const per = L / nCyc;
  const fire = per / P.cyl;
  const x = new Float32Array(L);
  const dec = Math.min((P.dec / 1000) * sr, fire * 0.75);
  const rise = 0.00022 * sr;
  const len = Math.min(L - 1, Math.round(dec * 6));
  const kdec = 0.00045 * sr;
  const klen = Math.round(kdec * 6);
  for (let c = 0; c < nCyc; c++) {
    for (let k = 0; k < P.cyl; k++) {
      const pos = Math.floor(c * per + (k + (rnd() - 0.5) * P.jit) * fire + L) % L;
      const a = P.amp[k % P.amp.length] * (1 + (rnd() - 0.5) * 0.14);
      let nz = 0;
      for (let i = 0; i < len; i++) {
        const env = (1 - Math.exp(-i / rise)) * Math.exp(-i / dec);
        nz = nz * 0.55 + (rnd() * 2 - 1) * 0.45;
        x[(pos + i) % L] += a * env * (1 + P.rasp * nz * 2.2);
      }
      // diésel: el "tac" metálico de cada inyección
      for (let i = 0; P.knock && i < klen; i++) x[(pos + i) % L] += P.knock * a * Math.exp(-i / kdec) * (rnd() * 2 - 1);
    }
  }
  let mean = 0;
  for (let i = 0; i < L; i++) mean += x[i];
  mean /= L;
  for (let i = 0; i < L; i++) x[i] -= mean;
  // caño de escape: algo del pulso directo y sus resonancias
  const y = new Float32Array(L);
  for (let i = 0; i < L; i++) y[i] = x[i] * 0.35;
  for (const [f, q, g] of P.res) {
    const b = bandpass(x, sr, f, q);
    for (let i = 0; i < L; i++) y[i] += b[i] * g;
  }
  let peak = 1e-6;
  for (let i = 0; i < L; i++) peak = Math.max(peak, Math.abs(y[i]));
  for (let i = 0; i < L; i++) y[i] = Math.tanh((y[i] / peak) * 1.6) / Math.tanh(1.6);
  return y;
}

const CURVE = (() => {
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * 3.2) / Math.tanh(3.2);
  }
  return c;
})();

// los bucles de cada motor (se arman la primera vez que hacen falta)
const BUFS = new WeakMap();
function buffers(ctx, name) {
  if (!BUFS.has(ctx)) BUFS.set(ctx, {});
  const all = BUFS.get(ctx);
  if (!all[name]) {
    const P = MOTORES[name];
    const mk = (rpm, seed) => {
      const d = renderLoop(ctx.sampleRate, P, rpm, seed);
      const b = ctx.createBuffer(1, d.length, ctx.sampleRate);
      b.getChannelData(0).set(d);
      return b;
    };
    all[name] = { lo: mk(P.lo, 11 + name.length), hi: mk(P.hi, 97 + name.length) };
  }
  return all[name];
}

// Una voz de motor: dos bucles → saturación → filtro → volumen (→ paneo) → salida
export class MotorVoice {
  constructor(ctx, out, name, pan = false) {
    this.ctx = ctx;
    this.name = name;
    this.P = MOTORES[name];
    const B = buffers(ctx, name);
    const src = (b) => {
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.loop = true;
      return s;
    };
    this.lo = src(B.lo);
    this.hi = src(B.hi);
    this.gLo = ctx.createGain();
    this.gHi = ctx.createGain();
    this.pre = ctx.createGain();
    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = CURVE;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = 0.9;
    this.amp = ctx.createGain();
    this.amp.gain.value = 0;
    this.lo.connect(this.gLo).connect(this.pre);
    this.hi.connect(this.gHi).connect(this.pre);
    this.pre.connect(this.shaper).connect(this.lp).connect(this.amp);
    this.pan = pan && ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (this.pan) this.amp.connect(this.pan).connect(out);
    else this.amp.connect(out);
    const t = ctx.currentTime;
    // cada voz arranca en otro punto del bucle (dos autos iguales no suenan en fase)
    this.lo.start(t, Math.random() * B.lo.duration);
    this.hi.start(t, Math.random() * B.hi.duration);
  }
  // rpm: vueltas · load: carga 0..1 · vol: volumen · pitch: corrimiento extra (Doppler) · pan: -1..1
  set(rpm, load, vol, pitch = 1, pan = 0, tc = 0.04) {
    const P = this.P;
    const t = this.ctx.currentTime;
    const r = Math.max(P.idle * 0.85, Math.min(P.red * 1.02, rpm));
    this.lo.playbackRate.setTargetAtTime((r / P.lo) * pitch, t, tc);
    this.hi.playbackRate.setTargetAtTime((r / P.hi) * pitch, t, tc);
    const k = Math.max(0, Math.min(1, (r - P.lo) / (P.hi - P.lo)));
    this.gLo.gain.setTargetAtTime(Math.cos((k * Math.PI) / 2), t, tc);
    this.gHi.gain.setTargetAtTime(Math.sin((k * Math.PI) / 2), t, tc);
    const n = (r - P.idle) / (P.red - P.idle);
    this.pre.gain.setTargetAtTime(0.22 + load * 0.55 + n * 0.12, t, 0.06);
    this.lp.frequency.setTargetAtTime(P.lp[0] + (P.lp[1] - P.lp[0]) * Math.min(1, 0.3 * n + 0.75 * load), t, 0.06);
    this.amp.gain.setTargetAtTime(vol * P.vol * (0.58 + 0.42 * load) * (0.8 + 0.3 * n), t, 0.06);
    if (this.pan) this.pan.pan.setTargetAtTime(pan, t, 0.08);
  }
  stop(fade = 0.25) {
    const t = this.ctx.currentTime;
    this.amp.gain.setTargetAtTime(0, t, fade / 3);
    this.lo.stop(t + fade + 0.05);
    this.hi.stop(t + fade + 0.05);
    setTimeout(() => this.amp.disconnect(), (fade + 0.2) * 1000);
  }
}

// Caja de cambios de mentira: de la velocidad (y el acelerador) a las vueltas del motor
export class Gearbox {
  constructor(name) {
    this.P = MOTORES[name];
    this.gear = 0;
    this.rpm = this.P.idle;
    this.shift = 0;
    this.load = 0;
  }
  update(dt, speed, vmax, throttle) {
    const P = this.P;
    const G = P.gears;
    const sp = Math.abs(speed);
    const ratio = (g) => sp / Math.max(1, vmax * G[g]);
    const span = P.red - P.idle;
    // subir de marcha: a fondo cerca del corte, paseando antes; bajar cuando las vueltas caen
    if (this.shift <= 0) {
      const up = throttle > 0.6 ? 0.9 : 0.55;
      if (this.gear < G.length - 1 && ratio(this.gear) > up) {
        this.gear++;
        this.shift = 0.22;
      } else if (this.gear > 0 && ratio(this.gear - 1) < (throttle > 0.6 ? 0.62 : 0.38)) this.gear--;
    }
    this.shift -= dt;
    const thr = Math.max(0, throttle);
    let target = P.idle + ratio(this.gear) * span;
    // parado o arrancando: el embrague patina y el motor sube con el acelerador
    if (this.gear === 0) target = Math.max(target, P.idle + thr * span * (sp < 1 ? 0.55 : 0.32));
    target = Math.min(P.red * 1.01, target);
    // corte de inyección al tope
    if (target > P.red * 0.99 && thr > 0.5) target -= Math.random() * span * 0.06;
    const k = this.shift > 0 ? 9 : target > this.rpm ? 6 : 4;
    this.rpm += (target - this.rpm) * Math.min(1, dt * k);
    const want = this.shift > 0 ? 0.05 : thr;
    this.load += (want - this.load) * Math.min(1, dt * 10);
    return this.rpm;
  }
}
