// Misiones con historia: te llaman al celu (si todavía lo tenés), aparece un marcador amarillo en
// el mapa y al entrar empieza. Cada misión tiene etapas con su objetivo; se falla si te bajan,
// te agarra la cana o se acaba el tiempo. Al cumplirla: plata, respeto y la próxima llamada.
import * as THREE from 'three';
import { STATION, nearestStreetName } from './map.js';
import { R } from './rng.js';

const fmt = (n) => `$${Math.round(n).toLocaleString('es-AR')}`;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Marcador de GTA: cilindro amarillo translúcido que late, con una luz que sube
export function makeMarker() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 28, 1, true), mat);
  tube.position.y = 0.8;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.8, depthWrite: false }));
  ring.position.y = 0.06;
  g.add(tube, ring);
  g.userData = { tube, ring };
  g.visible = false;
  return g;
}

// Las misiones. start(ctx): dónde está el marcador. stages: lo que hay que hacer, en orden.
// Cada etapa: text (objetivo), target (a dónde apunta el GPS), enter (arranca), update (devuelve
// true si se cumplió, o un texto si falló).
const DEFS = [
  {
    id: 'encomienda',
    title: 'LA ENCOMIENDA DEL TURCO',
    name: 'La encomienda del Turco',
    giver: 'El Turco del kiosco',
    call: 'Gaspi, tengo una encomienda urgente para un cliente. ¿Me la llevás en auto? Pasá por el kiosco.',
    reward: 8000,
    respeto: 2,
    start: (c) => c.near(STATION, 30, 80),
    stages: [
      {
        text: () => 'Conseguí un auto (sin romperlo)',
        skip: (c) => c.inCar(),
        target: (c) => c.nearestCar(),
        update: (c) => c.inCar(),
      },
      {
        enter: (c) => {
          c.m.dest = c.near(c.m.origin, 300, 460);
          c.m.timer = 105;
          c.m.damage0 = c.P.vehicle?.damage || 0;
        },
        text: (c) => `Llevá la encomienda a ${nearestStreetName(c.m.dest.x, c.m.dest.z)}`,
        target: (c) => c.m.dest,
        update: (c, dt) => {
          c.m.timer -= dt;
          if (c.m.timer <= 0) return 'Llegaste tarde: el cliente se fue';
          const v = c.P.vehicle;
          if (v && (v.damage || 0) - c.m.damage0 > 60) return 'Chocaste tanto que se rompió la encomienda';
          return dist(c.P, c.m.dest) < 9 && (!v || Math.abs(v.speed) < 4);
        },
      },
    ],
  },
  {
    id: 'celu',
    title: 'EL CELU DE DOÑA MARTA',
    name: 'El celu de Doña Marta',
    giver: 'Doña Marta',
    call: 'Nene, unos vivos me arrebataron el celu. Están parando por el barrio. ¿Me lo recuperás?',
    reward: 6000,
    respeto: 3,
    start: (c) => c.near(c.P, 60, 150),
    begin: (c) => {
      // la señora espera en el marcador
      c.m.lady = c.npcs.spawnWalker({ x: c.m.origin.x + 1.2, z: c.m.origin.z + 1.2, heading: 0 }, null, 0, 0, { female: true, skin: 0xe8c4a8, hair: 0x9a9a9a, hairStyle: 'bun', top: 'long', shirt: 0x7e5a8c, bottom: 'skirt', skirt: 0x3a3a48, shoes: 0x3a2a20, glasses: true, scale: 0.94 });
      if (c.m.lady) {
        c.m.lady.vmax = 0;
        c.m.lady.mission = true;
        c.m.lady.say('¡Por favor, nene, era de mi nieta!', 3);
      }
    },
    stages: [
      {
        enter: (c) => {
          c.m.spot = c.near(c.m.origin, 170, 280);
          c.m.thugs = [0, 1].map((i) => {
            const n = c.npcs.spawnWalker({ x: c.m.spot.x + i * 1.4, z: c.m.spot.z + (i ? 0.8 : 0), heading: 0 }, null, 0, 0, {
              skin: R.pick([0xc68b62, 0xd9a882, 0xa86f4a]),
              hair: 0x1a1a1a,
              hairStyle: 'buzz',
              top: 'hoodie',
              shirt: R.pick([0x222222, 0x3a3a3a, 0x1e2a44]),
              bottom: 'pants',
              pants: 0x1a1a1a,
              shoes: 0xf2f2f2,
              cap: i ? 0x111111 : null,
            });
            if (n) {
              n.vmax = 0;
              n.brave = 1;
              n.money = 2000;
              n.mission = true;
            }
            return n;
          });
        },
        text: (c) => `Andá a donde paran los chorros, en ${nearestStreetName(c.m.spot.x, c.m.spot.z)}`,
        target: (c) => c.m.spot,
        update: (c) => dist(c.P, c.m.spot) < 16,
      },
      {
        enter: (c) => {
          for (const n of c.m.thugs) if (n && !n.down) {
            c.npcs.setState(n, 'fight');
            n.fightT = 999;
            n.say(R.pick(['¿Qué mirás, gil?', '¡Tomatelá!', 'Rajá de acá, amigo']), 2.5);
          }
          c.hud.flash('¡SON ELLOS!', 'Bajalos y recuperá el celu', 'warn', 2.2);
        },
        text: () => 'Bajá a los chorros',
        target: (c) => c.m.thugs.find((n) => n && !n.down) ?? c.m.spot,
        update: (c) => {
          // mientras estén parados, siguen peleando aunque Gaspi se aleje un poco
          for (const n of c.m.thugs) if (n && !n.down && n.state !== 'fight' && dist(c.P, n) < 40) {
            c.npcs.setState(n, 'fight');
            n.fightT = 999;
          }
          return c.m.thugs.every((n) => !n || n.down);
        },
      },
      {
        enter: (c) => c.hud.toast('¡Recuperaste el celu de Doña Marta!', 2.5),
        text: () => 'Devolvele el celu a Doña Marta',
        target: (c) => c.m.lady ?? c.m.origin,
        update: (c) => {
          if (c.m.lady?.down) return 'Doña Marta quedó tirada en la vereda';
          return dist(c.P, c.m.lady ?? c.m.origin) < 3.2;
        },
      },
    ],
    done: (c) => c.m.lady?.say('¡Gracias, nene! Sos un sol. Tomá, para la SUBE', 3.5),
  },
  {
    id: 'bolso',
    title: 'EL BOLSO DEL NEGRO',
    name: 'El bolso del Negro',
    giver: 'El Negro',
    call: 'Gaspi, dejé un bolso en la estación. Buscalo y traémelo al taller... ojo, que la cana lo tiene marcado.',
    reward: 15000,
    respeto: 4,
    start: (c) => c.near(c.P, 80, 160),
    stages: [
      {
        text: () => 'Buscá el bolso en la estación Temperley',
        target: (c) => c.city.spots.stationDoor,
        update: (c) => dist(c.P, c.city.spots.stationDoor) < 6,
      },
      {
        enter: (c) => {
          c.police.heat = Math.max(c.police.heat, 3.2);
          c.police.updateStars();
          c.police.lostT = 0;
          c.police.spawnT = 1;
          c.police.flash = 2;
          c.audio.alerta();
          c.hud.flash('¡LA CANA!', 'Te estaban esperando. Perdelos', 'bad', 2.6);
        },
        text: () => 'Perdé a la Bonaerense',
        target: () => null,
        update: (c) => c.police.stars === 0,
      },
      {
        enter: (c) => (c.m.dest = c.near(c.P, 220, 380)),
        text: (c) => `Llevá el bolso al taller en ${nearestStreetName(c.m.dest.x, c.m.dest.z)}`,
        target: (c) => c.m.dest,
        update: (c) => {
          if (c.police.stars > 0) return null;
          return dist(c.P, c.m.dest) < 7 && (!c.P.vehicle || Math.abs(c.P.vehicle.speed) < 4);
        },
      },
    ],
  },
];

export class Missions {
  constructor(scene, world, save = {}) {
    this.w = world;
    this.marker = makeMarker();
    scene.add(this.marker);
    this.next = save.next ?? 0; // próxima misión (vuelven a empezar al terminar todas)
    this.done = save.done ?? 0;
    this.offer = null; // misión ofrecida: {def, origin}
    this.m = null; // misión en curso
    this.callT = 25; // primera llamada al rato de terminar el tutorial
    this.t = 0;
  }
  save() {
    return { next: this.next, done: this.done };
  }
  // contexto para las funciones de cada misión
  get c() {
    const w = this.w;
    const self = this;
    return {
      w,
      m: this.m ?? this.offer,
      P: w.player,
      npcs: w.npcs,
      hud: w.hud,
      police: w.police,
      audio: w.audio,
      city: w.city,
      inCar: () => !!w.player.vehicle && w.player.vehicle.kind !== 'bus',
      nearestCar: () => {
        let best = null;
        let bd = Infinity;
        for (const v of w.traffic.all()) {
          if (v.kind !== 'car' || v.wreck) continue;
          const d = dist(v, w.player);
          if (d < bd) {
            bd = d;
            best = v;
          }
        }
        return best;
      },
      near: (p, a, b) => self.near(p, a, b),
    };
  }
  near(p, rmin, rmax) {
    return this.w.npcs.sidewalkPoint(p.x, p.z, rmin, rmax) ?? { x: p.x + rmin, z: p.z };
  }

  // lo que muestra el HUD: {text, target} o null
  objective() {
    if (this.m) {
      const st = this.m.def.stages[this.m.stage];
      const t = st.text(this.c);
      return { text: this.m.timer > 0 ? `${t} · ${Math.ceil(this.m.timer)} s` : t, target: st.target(this.c) };
    }
    if (this.offer) return { text: `${this.offer.def.name}: andá al marcador amarillo`, target: this.offer.origin };
    return null;
  }
  markers() {
    return this.offer ? [{ x: this.offer.origin.x, z: this.offer.origin.z }] : [];
  }

  update(dt, ready) {
    const w = this.w;
    const P = w.player;
    this.t += dt;
    // marcador que late
    const mk = this.marker;
    mk.visible = !!this.offer && !this.m;
    if (mk.visible) {
      const o = this.offer.origin;
      mk.position.set(o.x, w.heightAt ? w.heightAt(o.x, o.z) : 0.15, o.z);
      const k = 0.85 + Math.sin(this.t * 3) * 0.15;
      mk.userData.tube.scale.set(k, 1, k);
      mk.userData.tube.material.opacity = 0.25 + Math.sin(this.t * 3) * 0.08;
    }
    if (this.m) return this.run(dt);
    if (this.offer) {
      if (dist(P, this.offer.origin) < 1.6 && !P.dead && !(w.police.stars > 0)) this.begin();
      return;
    }
    // la próxima llamada
    if (!ready || w.hud.dialog || P.dead) return;
    this.callT -= dt;
    if (this.callT > 0) return;
    if (!P.phone) {
      w.hud.toast('Te quisieron llamar, pero no tenés celu', 2.5);
      this.callT = 60;
      return;
    }
    this.ring();
  }

  ring() {
    const w = this.w;
    const def = DEFS[this.next % DEFS.length];
    w.audio.ring?.();
    // la voz del que llama, como en el celu
    setTimeout(() => w.audio.speak?.(def.call, { female: /^Doña/.test(def.giver), key: this.next + 11, force: true }), 1300);
    w.hud.ask(`📱 ${def.giver}: "${def.call}"`, [
      {
        label: 'Atender: "Dale, voy"',
        run: () => {
          this.offer = { def, origin: null };
          this.offer.origin = def.start(this.c);
          w.hud.toast('Tenés una misión: andá al marcador amarillo', 2.5);
        },
      },
      { label: 'Cortar', run: () => (this.callT = 45) },
    ], 9, 1);
    this.callT = 45;
  }

  begin() {
    const w = this.w;
    const def = this.offer.def;
    this.m = { def, origin: this.offer.origin, stage: -1, timer: 0 };
    this.offer = null;
    w.hud.flash(def.title, def.giver, 'warn', 3);
    def.begin?.(this.c);
    this.advance();
  }
  advance() {
    const m = this.m;
    m.stage++;
    const def = m.def;
    // saltear etapas que ya están cumplidas (por ejemplo, si ya está arriba de un auto)
    while (m.stage < def.stages.length && def.stages[m.stage].skip?.(this.c)) m.stage++;
    if (m.stage >= def.stages.length) return this.complete();
    m.timer = 0;
    def.stages[m.stage].enter?.(this.c);
  }
  run(dt) {
    const w = this.w;
    const m = this.m;
    if (w.player.dead) return this.fail('Te bajaron');
    const r = m.def.stages[m.stage].update(this.c, dt);
    if (typeof r === 'string') return this.fail(r);
    if (r) {
      this.w.audio.plata();
      this.advance();
    }
  }
  complete() {
    const w = this.w;
    const def = this.m.def;
    def.done?.(this.c);
    w.player.addMoney(def.reward);
    w.player.addRespeto(def.respeto);
    w.audio.cumplida?.();
    w.hud.flash('¡MISIÓN CUMPLIDA!', `${fmt(def.reward)} · Respeto +${def.respeto}`, 'ok', 4);
    this.cleanup();
    this.m = null;
    this.next++;
    this.done++;
    this.callT = R.range(35, 60);
  }
  fail(reason) {
    const w = this.w;
    w.audio.fallida?.();
    w.hud.flash('MISIÓN FALLIDA', reason, 'bad', 3.5);
    const def = this.m.def;
    this.cleanup();
    this.m = null;
    // se puede volver a intentar: el marcador queda donde empezó
    this.offer = { def, origin: def.start(this.c) };
  }
  // la cana te agarró: la misión se cae
  busted() {
    if (this.m) this.fail('Te agarró la Bonaerense');
  }
  cleanup() {
    const m = this.m;
    if (!m) return;
    // los chorros que siguen parados se van; la señora vuelve a caminar
    for (const n of m.thugs || []) if (n && !n.down) this.w.npcs.setState(n, 'flee', this.w.player);
    for (const n of [...(m.thugs || []), m.lady]) if (n) n.mission = false;
    if (m.lady && !m.lady.down) m.lady.vmax = 1.1;
  }
}
