// Ronda de chicos "farmeando aura" en la Plaza Comandante Tomás Espora (pedido del dueño): 30 chicos en
// círculo; de a uno pasan al medio y hacen el baile del nene del bote ("aura farming") mientras los demás
// aplauden, filman con el celu y al final le ponen puntaje de aura (modo competencia: el récord queda). Si
// Gaspi se para en el medio, le toca a él: bailando junta aura y respeto. Son de tipo 'chico': no se los
// puede lastimar (como en los GTA) y si hay lío salen corriendo y después vuelven a la ronda.
import * as THREE from 'three';
import { Npc } from './npcs.js';
import { makeHuman } from './human.js';
import { makeLook } from './people.js';
import { R } from './rng.js';

const N = 30;
const RADIUS = 5.4;
// un claro de la plaza, lejos de árboles, faroles y palmeras (medido con los datos del mapa)
export const AURA_SPOT = { x: -71, z: -95 };
const NAMES = ['Thiago', 'Benja', 'Valen', 'Mili', 'Lauti', 'Juli', 'Santi', 'Delfi', 'Tomi', 'Cami', 'Bauti', 'Martu', 'Fran', 'Agus', 'Lola', 'Joaco', 'Male', 'Nico', 'Sofi', 'Gonza', 'Uma', 'Facu', 'Pili', 'Mateo', 'Isa', 'Lucho', 'Abril', 'Dylan', 'Mía', 'Elías'];
const CHEER = ['¡Aura, aura, aura!', '¡Está cocinando!', '¡Dale que farmea!', 'Uhhh, los mogeó', '¡Re piola!', 'Tiene aura de protagonista', '¡Mirá esa cara de nada!', 'Filmalo, filmalo', '¡Que no pare!'];
const GOOD = ['¡+{n} de aura!', '¡Aura infinita! +{n}', '¡Nos mogeó a todos! +{n}', '+{n} de aura, bro'];
const BAD = ['-{n} de aura... cringe', 'Ese es un NPC: -{n} de aura', 'Le falta aura: -{n}', 'Nada de aura, bro. -{n}'];
const GASPI = ['¡EL DEL CELU TIENE AURA! +{n}', '¡Aura de jefe! +{n}', '¡Nos mogeó a todos! +{n} de aura'];
const PHONE = new THREE.BoxGeometry(0.075, 0.15, 0.012);
const PHONE_MAT = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.5 });
const fill = (s, n) => s.replace('{n}', n.toLocaleString('es-AR'));
const DANCE = 7; // segundos que baila cada uno

export class Aura {
  constructor(npcs) {
    this.npcs = npcs;
    this.kids = [];
    this.clock = 0;
    this.turn = null; // { kid | 'gaspi', t }
    this.next = 0;
    this.best = { name: null, score: 0 };
    this.gaspiT = 0;
    this.prizeT = 0;
  }

  spawn() {
    const C = AURA_SPOT;
    for (let i = 0; i < N; i++) {
      const girl = R.chance(0.45);
      const a = (i / N) * Math.PI * 2;
      const x = C.x + Math.sin(a) * RADIUS;
      const z = C.z + Math.cos(a) * RADIUS;
      const look = {
        child: true,
        female: girl,
        skin: R.pick([0xf0c8a8, 0xe0b090, 0xd9a882, 0xc68b62, 0xa86f48]),
        hair: R.pick([0x2b1d14, 0x4a3020, 0x1a1a1a, 0x8a5a2a, 0xc9a15a]),
        hairStyle: girl ? R.pick(['ponytail', 'long', 'bob']) : R.pick(['short', 'curly', 'side']),
        top: R.pick(['tshirt', 'tshirt', 'hoodie', 'jersey']),
        jersey: R.pick(['temperley', 'banfield', 'boca', 'river', 'argentina']),
        shirt: R.pick([0xf2f2f2, 0x1a1a1a, 0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0x8e24aa, 0xff7043]),
        hood: R.pick([0x1a1a1a, 0x37474f, 0x6d4c41, 0x283593]),
        pants: R.pick([0x1a1a1a, 0x2c3e5c, 0x55595e, 0x3e2723]),
        shoes: R.pick([0xf2f2f2, 0x1a1a1a, 0xe53935]),
        scale: R.range(0.66, 0.84),
      };
      const h = makeLook(look) || makeHuman(look);
      const n = this.npcs.add(new Npc('chico', h, x, z));
      n.look = look;
      n.state = 'idle';
      n.hp = 9999;
      n.mission = true;
      n.name = NAMES[i];
      n.aura = { spot: { x, z }, act: R.pick(['clap', 'clap', 'clap', 'film', 'film', 'listen']), off: R.range(0, 1) };
      n.heading = Math.atan2(C.x - x, C.z - z);
      if (n.aura.act === 'film') {
        // el celu en la mano derecha, de canto hacia el que baila
        const ph = new THREE.Mesh(PHONE, PHONE_MAT);
        ph.position.set(-0.03, -0.09, 0.04);
        ph.rotation.set(0.2, 0, 1.4);
        n.h.bones.handR.add(ph);
      }
      this.kids.push(n);
    }
    this.next = 2;
  }

  clear() {
    for (const k of this.kids) k.dead = true;
    this.kids = [];
    this.turn = null;
  }

  update(dt, world) {
    const P = world.player;
    const hour = world.time.hour;
    // a la tarde, después del colegio, hasta la noche; solo si Gaspi anda cerca (30 chicos pesan)
    const d = Math.hypot(P.x - AURA_SPOT.x, P.z - AURA_SPOT.z);
    const want = hour > 13 && hour < 21.5 && d < 150;
    if (want && !this.kids.length) this.spawn();
    if (!want && this.kids.length && d > 170) this.clear();
    if (!this.kids.length) return;
    this.kids = this.kids.filter((k) => !k.dead);
    this.clock += dt;
    // Gaspi en el medio, a pie y quieto: le toca bailar a él
    const inside = !P.vehicle && !P.dead && Math.hypot(P.x - AURA_SPOT.x, P.z - AURA_SPOT.z) < 1.6;
    if (inside && this.turn?.who !== 'gaspi') {
      if (this.turn?.kid) this.turn.kid.aura.out = true;
      this.turn = { who: 'gaspi', t: 0 };
      world.hud?.flash('AURA', 'Quedate quieto en el medio: bailás y los chicos te ponen puntaje', 'warn', 3);
    }
    if (this.turn?.who === 'gaspi') {
      if (!inside) {
        this.turn = null;
        this.next = 1.5;
        P.danceT = 0;
        return;
      }
      if (P.speed < 0.3) {
        this.turn.t += dt;
        P.danceT = 0.2;
        P.danceClock = this.clock;
        this.cheer(world, 0.9, dt);
      }
      if (this.turn.t > DANCE) {
        const n = R.int(40, 99) * 100 + (P.respeto ?? 0) * 100;
        const judge = R.pick(this.kids);
        judge?.say(fill(R.pick(GASPI), n), 3.5);
        if (n > this.best.score) this.best = { name: 'Gaspi', score: n };
        // el respeto se gana una vez cada tanto (si no, se farmea infinito)
        if (this.prizeT <= 0) {
          P.respeto = (P.respeto ?? 0) + 1;
          world.audio?.plata?.();
          world.hud?.flash('+1 RESPETO', `Farmeaste ${n.toLocaleString('es-AR')} de aura. Récord: ${this.best.name} (${this.best.score.toLocaleString('es-AR')})`, 'good', 4);
          this.prizeT = 120;
        }
        this.turn = { who: 'gaspi', t: -9999 }; // ya bailó: hasta que salga del medio
      }
    }
    this.prizeT -= dt;
    // turno de los chicos: uno pasa al medio, baila y vuelve
    if (!this.turn) {
      this.next -= dt;
      if (this.next <= 0) {
        const free = this.kids.filter((k) => k.state !== 'flee' && !k.down);
        const kid = R.pick(free);
        if (kid) {
          this.turn = { who: 'kid', kid, t: 0 };
          kid.aura.out = false;
          kid.aura.dancing = false;
        }
      }
    } else if (this.turn.who === 'kid') {
      const k = this.turn.kid;
      if (k.dead || k.state === 'flee') {
        this.turn = null;
        this.next = 2;
      } else if (k.aura.dancing) {
        this.turn.t += dt;
        this.cheer(world, 0.5, dt);
        if (this.turn.t > DANCE) {
          const good = R.chance(0.65);
          const n = good ? R.int(5, 90) * 100 : R.int(2, 40) * 100;
          const judge = R.pick(this.kids.filter((x) => x !== k));
          judge?.say(fill(R.pick(good ? GOOD : BAD), n), 3);
          if (good && n > this.best.score) {
            this.best = { name: k.name, score: n };
            setTimeout(() => k.dead || k.say(`¡Récord! ${n.toLocaleString('es-AR')} de aura`, 2.5), 1800);
          }
          k.aura.dancing = false;
          k.aura.out = true;
          this.turn = null;
          this.next = R.range(2.5, 4);
        }
      }
    }
  }

  cheer(world, rate, dt) {
    const P = world.player;
    if (Math.hypot(P.x - AURA_SPOT.x, P.z - AURA_SPOT.z) > 30 || !R.chance(dt * rate)) return;
    const k = R.pick(this.kids);
    if (k && !k.bubble && k.cool <= 0) {
      k.say(R.pick(CHEER), 2);
      k.cool = R.range(4, 9);
    }
  }

  // lo que hace cada chico de la ronda (lo llama Barrio.brain)
  brain(n, dt) {
    const C = AURA_SPOT;
    const a = n.aura;
    const turn = this.turn;
    const mine = turn?.who === 'kid' && turn.kid === n && !a.out;
    const goal = mine ? C : a.spot;
    n.target = { x: goal.x, z: goal.z };
    const far = Math.hypot(goal.x - n.x, goal.z - n.z);
    if (far > 0.35) return { want: mine ? 1.6 : 1.3, pose: 'walk' };
    if (mine) {
      a.dancing = true;
      // mira para el lado de la ronda donde está Gaspi (o a la plaza), con cara seria
      n.heading += Math.sin(this.clock * 0.4) * dt * 0.6;
      n.poseT = this.clock;
      return { want: 0, pose: 'aura', t: this.clock };
    }
    // en su lugar: mirando al medio
    n.heading = Math.atan2(C.x - n.x, C.z - n.z);
    const dancing = turn && (turn.who === 'gaspi' ? turn.t > 0 : turn.kid?.aura.dancing);
    if (!dancing) return { want: 0, pose: 'listen', t: 0 };
    n.poseT = this.clock + a.off * 0.3;
    return { want: 0, pose: a.act, t: n.poseT };
  }
}
