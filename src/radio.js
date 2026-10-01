// Radio del auto: cumbia, rock nacional y tango generados en el momento con WebAudio.
// Cada tema se arma con una progresión de acordes y un riff que se repite y varía.
const N = (m) => 440 * Math.pow(2, (m - 69) / 12); // nota MIDI -> Hz

export const STATIONS = [
  {
    name: 'FM La Bailanta 98.3', sub: 'Cumbia de la buena', genre: 'cumbia', bpm: 96, voice: { key: 21 },
    intro: 'Estás escuchando FM La Bailanta, noventa y ocho punto tres. ¡Cumbia de la buena!',
    dj: ['¡Qué tal, gente linda de Temperley! Seguimos con la mejor cumbia', 'Saludos a los muchachos de la estación y a las chicas del kiosco. ¡Arriba esas manos!', 'FM La Bailanta. ¡Que no pare la joda!', 'Se viene otro temazo, para bailar hasta que salga el sol'],
  },
  {
    name: 'Rock Nacional 105.7', sub: 'El aguante', genre: 'rock', bpm: 128, voice: { key: 5 },
    intro: 'Rock Nacional, ciento cinco punto siete. El aguante del sur.',
    dj: ['Esto va para los que están en el corte de Meeks. ¡Aguante!', 'Subile el volumen, que se viene un clásico', 'Rock Nacional. Acá no pasamos reguetón, amigo', 'Si estás manejando, abrochate el cinturón y subí el volumen'],
  },
  {
    name: 'Radio 2x4', sub: 'Tango las 24 horas', genre: 'tango', bpm: 112, voice: { key: 9, female: true },
    intro: 'Radio dos por cuatro. Tango las veinticuatro horas.',
    dj: ['Una noche de Temperley, una milonga y un buen vino', 'Porque veinte años no es nada... seguimos con más tango', 'Radio dos por cuatro. Para los que saben', 'Buenas noches, arrabal. Seguimos'],
  },
  {
    name: 'Flash Conurbano 89.3', sub: 'Los 80 nunca se fueron', genre: 'synth', bpm: 118, voice: { key: 33 },
    intro: 'Flash Conurbano, ochenta y nueve punto tres. Los ochenta nunca se fueron.',
    dj: ['Flash Conurbano. Ponete los anteojos de sol aunque sea de noche', 'Esto va para los que manejan por Meeks con el codo afuera de la ventanilla', 'Sintetizadores, hombreras y gel en el pelo. Flash Conurbano', 'Si tenés un Falcon, este tema es para vos', 'Temperley de noche, neón y un buen tema. ¿Qué más querés?'],
  },
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
  // synthpop: progresiones en menor, con séptimas para el brillo ochentoso
  synth: [
    [
      [57, 'm7'],
      [53, 'M7'],
      [48, ''],
      [55, ''],
    ],
    [
      [50, 'm7'],
      [46, 'M7'],
      [48, ''],
      [57, 'm'],
    ],
    [
      [52, 'm'],
      [48, 'M7'],
      [55, ''],
      [50, ''],
    ],
    [
      [53, 'M7'],
      [55, ''],
      [57, 'm7'],
      [57, 'm7'],
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
const CHORD = { m: [0, 3, 7], '': [0, 4, 7], 7: [0, 4, 7, 10], 5: [0, 7, 12], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11] };

// publicidades truchas del barrio entre tema y tema
const ADS = [
  'Pizzería Los Dos Caños: la muzza más grande de Temperley. Pedí por teléfono y te la llevan en moto.',
  '¿Te robaron el celu? Celulares El Turco: usados, con garantía de una semana.',
  'Gym El Kaiser, al lado de la estación. Vení a entrenar con los más grandes. La primera clase es gratis.',
  'Chapa y pintura: te dejamos el auto como nuevo y nadie te reconoce. Consultá sin compromiso.',
  'Remises Temperley: te llevamos a donde quieras, más o menos rápido.',
  'Armería El Tano: para la seguridad de tu familia. Preguntá por la metra en cuotas.',
  'Milanesas Doña Marta: el sánguche que te devuelve la vida.',
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

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
    if (!want && this.on) window.speechSynthesis?.cancel();
    const turnedOn = want && !this.on;
    this.on = want;
    this.gain.gain.cancelScheduledValues(this.audio.ctx.currentTime);
    this.gain.gain.setTargetAtTime(want ? 0.32 : 0, this.audio.ctx.currentTime, 0.25);
    // al prender, el locutor presenta la radio
    if (turnedOn) setTimeout(() => this.on && this.talk(this.station.intro), 900);
  }

  // locutor o publicidad (con la voz del navegador): la música baja mientras hablan
  talk(text) {
    const st = this.station;
    if (!st.genre || !this.on) return;
    text ??= Math.random() < 0.45 ? pick(ADS) : pick(st.dj);
    if (!this.audio.speak(text, { ...st.voice, force: true })) return;
    const t = this.audio.ctx.currentTime;
    const g = this.gain.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0.06, t, 0.15);
    g.setTargetAtTime(0.32, t + 1.2 + text.length * 0.07, 0.4);
  }

  cycle() {
    window.speechSynthesis?.cancel();
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
    // la melodía del estribillo: una frase de dos compases que se repite (con notas largas)
    const hook = [];
    for (let i = 0; i < 32; i++) {
      if (i % 4 === 0 || Math.random() < 0.28) hook.push({ deg: [0, 1, 2, 3, 4, 2, 1][Math.floor(Math.random() * 7)], len: i % 8 === 0 ? 3 : Math.random() < 0.4 ? 2 : 1 });
      else hook.push(null);
    }
    this.song = { prog, riff, hook, bars: 0, transpose: Math.floor(Math.random() * 5) - 2 };
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
        if (this.song.bars >= (st.genre === 'synth' ? 36 : 24)) {
          this.newSong();
          this.talk();
        }
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

  // Synthpop ochentoso: caja de ritmos con redoblante "gateado", bajo de sinte en octavas,
  // colchón de acordes, arpegio y la melodía del estribillo. Partes: intro, estrofa, estribillo, corte.
  synth(step, t, s16, notes, rn) {
    const song = this.song;
    const bar = Math.floor(step / 16);
    const i = step % 16;
    const part = bar < 4 ? 'intro' : bar < 12 ? 'verso' : bar < 20 ? 'estribillo' : bar < 24 ? 'corte' : 'estribillo';
    const fill = bar % 4 === 3 && i >= 12;
    // batería
    if (part !== 'corte' || i % 8 === 0) {
      if (i % 4 === 0) this.kick(t, 0.95);
      if (part !== 'intro' && (i === 4 || i === 12) && !fill) {
        // redoblante con reverb cortada de golpe: el sonido de los 80
        this.noise(t, 0.22, 1700, 'bandpass', 0.55, 0.7);
        this.noise(t, 0.26, 5200, 'lowpass', 0.22, 0.5);
        this.osc(190, t, 0.08, 'triangle', 0.25, { cutoff: 900 });
      }
      if (part === 'estribillo' && (i === 4 || i === 12)) this.noise(t + 0.008, 0.12, 1200, 'bandpass', 0.3, 2.5);
      this.noise(t, i % 4 === 2 ? 0.12 : 0.035, 9000, 'highpass', i % 4 === 2 ? 0.1 : 0.07);
    }
    if (fill && i % 2 === 0) this.osc(N(45 + (15 - i)), t, 0.18, 'sine', 0.35, { cutoff: 1200 });
    // bajo de sinte en corcheas, saltando de octava
    if (i % 2 === 0 && part !== 'corte') {
      const n = notes[0] - 24 + (i % 4 === 2 ? 12 : 0);
      this.osc(N(n), t, s16 * 1.6, 'sawtooth', 0.22, { cutoff: 520 + (i % 4 === 2 ? 300 : 0), q: 4 });
      this.osc(N(n), t, s16 * 1.6, 'square', 0.1, { cutoff: 400, detune: -5 });
    }
    // colchón de acordes: tres sierras desafinadas, entra lento
    if (i === 0 && part !== 'intro') {
      for (const n of notes) {
        for (const d of [-9, 0, 9]) this.osc(N(n + 12), t, s16 * 16, 'sawtooth', 0.016, { cutoff: part === 'corte' ? 900 : 1700, attack: 0.25, detune: d });
      }
    }
    // arpegio de semicorcheas (sube y baja por el acorde)
    if (part !== 'intro' || bar >= 2) {
      const seq = [0, 1, 2, 3, 2, 1];
      const arp = notes[seq[step % seq.length] % notes.length] + 24;
      this.osc(N(arp), t, s16 * 0.8, 'square', part === 'estribillo' ? 0.045 : 0.03, { cutoff: 2600 });
    }
    // melodía: en el estribillo la frase pegadiza; en la estrofa, el riff más tranquilo
    const scale = [notes[0], notes[1], notes[2], notes[0] + 12, notes[1] + 12];
    const hn = song.hook[step % 32];
    if (part === 'estribillo' && hn) {
      const f = N(scale[hn.deg] + 24);
      this.osc(f, t, s16 * hn.len * 1.8, 'sawtooth', 0.06, { cutoff: 3400, attack: 0.02, vib: 5, detune: 7 });
      this.osc(f, t, s16 * hn.len * 1.8, 'square', 0.04, { cutoff: 2800, attack: 0.02, detune: -7 });
    } else if (part === 'verso' && rn && bar % 2 === 1) {
      this.osc(N(scale[rn.deg] + 24), t, s16 * rn.len * 1.4, 'triangle', 0.08, { cutoff: 3000, vib: 4 });
    }
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
    } else if (genre === 'synth') {
      this.synth(step, t, s16, notes, rn);
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
