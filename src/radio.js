// Radio del auto: cumbia, rock nacional y tango generados en el momento con WebAudio.
// Cada tema se arma con una progresión de acordes y un riff que se repite y varía.
const N = (m) => 440 * Math.pow(2, (m - 69) / 12); // nota MIDI -> Hz

export const STATIONS = [
  { name: 'FM La Bailanta 98.3', sub: 'Cumbia de la buena', genre: 'cumbia', bpm: 96 },
  { name: 'Rock Nacional 105.7', sub: 'El aguante', genre: 'rock', bpm: 128 },
  { name: 'Radio 2x4', sub: 'Tango las 24 horas', genre: 'tango', bpm: 112 },
  { name: 'Radio apagada', sub: '', genre: null },
];

const PROG = {
  // raíz (MIDI) y tipo de acorde
  cumbia: [
    [
      [57, 'm'],
      [55, ''],
      [53, ''],
      [52, ''],
    ],
    [
      [57, 'm'],
      [50, 'm'],
      [55, ''],
      [48, ''],
    ],
    [
      [50, 'm'],
      [57, 'm'],
      [55, ''],
      [57, 'm'],
    ],
  ],
  rock: [
    [
      [40, '5'],
      [48, '5'],
      [50, '5'],
      [45, '5'],
    ],
    [
      [45, '5'],
      [43, '5'],
      [50, '5'],
      [45, '5'],
    ],
  ],
  tango: [
    [
      [50, 'm'],
      [45, '7'],
      [45, '7'],
      [50, 'm'],
      [43, 'm'],
      [50, 'm'],
      [45, '7'],
      [50, 'm'],
    ],
  ],
};
const CHORD = { m: [0, 3, 7], '': [0, 4, 7], 7: [0, 4, 7, 10], 5: [0, 7, 12] };

export class Radio {
  constructor(audio) {
    this.audio = audio;
    this.index = 0;
    this.on = false;
    this.step = 0;
    this.next = 0;
    this.song = null;
  }
  get station() {
    return STATIONS[this.index];
  }

  bus() {
    const ctx = this.audio.ctx;
    if (!ctx) return null;
    if (!this.out) {
      // sonido de radio de auto: sin graves profundos ni agudos finos
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 70;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 5200;
      const g = ctx.createGain();
      g.gain.value = 0;
      hp.connect(lp).connect(g).connect(this.audio.master);
      this.out = hp;
      this.gain = g;
    }
    return this.out;
  }

  setOn(on) {
    if (!this.audio.ctx) return;
    this.bus();
    const want = on && !!this.station.genre;
    if (want && !this.on) {
      this.next = this.audio.ctx.currentTime + 0.1;
      this.step = 0;
      this.newSong();
    }
    this.on = want;
    this.gain.gain.setTargetAtTime(want ? 0.32 : 0, this.audio.ctx.currentTime, 0.25);
  }

  cycle() {
    this.index = (this.index + 1) % STATIONS.length;
    this.on = false;
    this.sweep();
    return this.station;
  }

  // "chchch" de cambio de dial
  sweep() {
    const a = this.audio;
    if (!a.ctx) return;
    a.burst(0.25, 2500, 'bandpass', 0.15, 0, 2);
  }

  newSong() {
    const g = this.station.genre;
    const progs = PROG[g];
    const prog = progs[Math.floor(Math.random() * progs.length)];
    // riff de dos compases con notas del acorde y de paso
    const riff = [];
    const dens = g === 'tango' ? 0.55 : g === 'rock' ? 0.4 : 0.6;
    for (let i = 0; i < 32; i++) {
      if (Math.random() < dens || i % 8 === 0) riff.push({ deg: Math.floor(Math.random() * 5), oct: Math.random() < 0.2 ? 12 : 0, len: Math.random() < 0.3 ? 2 : 1 });
      else riff.push(null);
    }
    this.song = { prog, riff, bars: 0, transpose: Math.floor(Math.random() * 5) - 2 };
  }

  update() {
    const a = this.audio;
    if (!this.on || !a.ctx || !this.song) return;
    const ctx = a.ctx;
    const st = this.station;
    const s16 = 60 / st.bpm / 4;
    // si la pestaña se durmió, no recuperar todo de golpe
    if (this.next < ctx.currentTime - 0.3) this.next = ctx.currentTime + 0.05;
    while (this.next < ctx.currentTime + 0.25) {
      this.play(st.genre, this.step, this.next, s16);
      this.next += s16;
      this.step++;
      if (this.step % 16 === 0) {
        this.song.bars++;
        if (this.song.bars >= 24) this.newSong();
      }
    }
  }

  // ---------- Instrumentos ----------
  osc(freq, t, dur, type, vol, { cutoff = 3000, attack = 0.005, vib = 0, detune = 0, q = 0.7 } = {}) {
    const ctx = this.audio.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    if (vib) {
      const l = ctx.createOscillator();
      l.frequency.value = 5.5;
      const lg = ctx.createGain();
      lg.gain.value = vib;
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(t + dur + 0.1);
    }
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  noise(t, dur, freq, type, vol, q = 1) {
    const ctx = this.audio.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.audio.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(this.out);
    n.start(t, Math.random() * 0.8);
    n.stop(t + dur + 0.02);
  }
  kick(t, vol = 0.9) {
    const ctx = this.audio.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.32);
  }
  guiro(t, long) {
    // raspado: varios pulsitos de ruido agudo
    const n = long ? 5 : 2;
    for (let i = 0; i < n; i++) this.noise(t + i * 0.016, 0.014, 4200, 'bandpass', 0.22, 2);
  }

  chordNotes(root, kind) {
    return CHORD[kind].map((iv) => root + iv + this.song.transpose);
  }

  play(genre, step, t, s16) {
    const song = this.song;
    const bar = Math.floor(step / 16);
    const i = step % 16;
    const perBar = genre === 'tango' ? 1 : 1;
    const [root, kind] = song.prog[Math.floor(bar / perBar) % song.prog.length];
    const notes = this.chordNotes(root, kind);
    const rn = song.riff[step % 32];
    if (genre === 'cumbia') {
      // güiro, bombo, timbal, bajo, "chuk" del teclado y el riff del sinte
      if ([0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15].includes(i)) this.guiro(t, i % 2 === 0);
      if (i === 0 || i === 8) this.kick(t, 0.8);
      if (i === 4 || i === 12) this.noise(t, 0.09, 1800, 'bandpass', 0.35, 1.2);
      if (i === 14) this.noise(t, 0.05, 2600, 'bandpass', 0.18, 2);
      const bass = { 0: notes[0] - 12, 4: notes[2] - 24, 8: notes[0] - 12, 12: notes[2] - 24, 14: notes[1] - 24 }[i];
      if (bass) this.osc(N(bass), t, s16 * 1.8, 'triangle', 0.5, { cutoff: 900 });
      if ([2, 6, 10, 14].includes(i)) for (const n of notes) this.osc(N(n + 12), t, s16 * 0.9, 'square', 0.035, { cutoff: 2600 });
      if (rn) {
        const scale = [notes[0], notes[1], notes[2], notes[0] + 12, notes[1] + 12];
        this.osc(N(scale[rn.deg] + 12 + rn.oct), t, s16 * rn.len * 1.6, 'sawtooth', 0.07, { cutoff: 3200, vib: 4, detune: 6 });
        this.osc(N(scale[rn.deg] + 12 + rn.oct), t, s16 * rn.len * 1.6, 'square', 0.045, { cutoff: 2400, detune: -8 });
      }
    } else if (genre === 'rock') {
      if (i === 0 || i === 8 || i === 10) this.kick(t, 0.9);
      if (i === 4 || i === 12) this.noise(t, 0.16, 1500, 'bandpass', 0.55, 0.8);
      if (i % 2 === 0) this.noise(t, 0.04, 8000, 'highpass', 0.12);
      if (i % 2 === 0) {
        // power chord distorsionado (dos sierras desafinadas)
        for (const n of notes) {
          this.osc(N(n), t, s16 * 1.7, 'sawtooth', 0.06, { cutoff: 1800, detune: 7, q: 2 });
          this.osc(N(n), t, s16 * 1.7, 'sawtooth', 0.05, { cutoff: 1800, detune: -7, q: 2 });
        }
      }
      if (i % 4 === 0) this.osc(N(notes[0] - 12), t, s16 * 3.5, 'triangle', 0.45, { cutoff: 700 });
      if (rn && bar % 4 >= 2) {
        const scale = [notes[0] + 12, notes[0] + 15, notes[0] + 17, notes[0] + 19, notes[0] + 22];
        this.osc(N(scale[rn.deg] + 12), t, s16 * rn.len * 1.4, 'sawtooth', 0.05, { cutoff: 2600, vib: 6, q: 3 });
      }
    } else if (genre === 'tango') {
      // marcato en cuatro, bajo con síncopa de habanera y el bandoneón
      if (i % 4 === 0) {
        this.osc(N(notes[0] - 12), t, s16 * 1.2, 'triangle', 0.5, { cutoff: 700 });
        for (const n of notes) this.osc(N(n + 12), t, s16 * 0.8, 'sawtooth', 0.03, { cutoff: 1800 });
        if (i === 0 || i === 8) this.noise(t, 0.05, 900, 'bandpass', 0.2);
      }
      if (i === 6 || i === 14) this.osc(N(notes[2] - 12), t, s16 * 1.2, 'triangle', 0.4, { cutoff: 700 });
      if (rn) {
        const scale = [notes[0], notes[1], notes[2], notes[0] + 12, notes[1] + 12];
        const f = N(scale[rn.deg] + 12 + rn.oct);
        // bandoneón: lengüeta (sierra + cuadrada) con vibrato suave
        this.osc(f, t, s16 * rn.len * 2, 'sawtooth', 0.06, { cutoff: 1900, attack: 0.03, vib: 3, q: 1.5 });
        this.osc(f * 2, t, s16 * rn.len * 2, 'square', 0.025, { cutoff: 2600, attack: 0.03, detune: 5 });
      }
    }
  }
}
