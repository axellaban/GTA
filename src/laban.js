// "Laban the Creator": pasea por la estación en una Ferrari amarilla descapotable, de traje y
// sombrero blancos (estilo Alan Faena), con tres chicas fit arriba tirando facha.
// La Ferrari va con el tránsito pero no se aleja de la estación ni desaparece.
import * as THREE from 'three';
import { STATION } from './map.js';
import { makeHuman, animateHuman, randomCivilian } from './human.js';
import { loadFerrari } from './models.js';
import { R } from './rng.js';

const CLEAN = { jersey: null, hood: null, cap: null, hat: null, helmet: null, longSleeves: false };

const LABAN = ['¡Laban the Creator, papá!', 'Todo esto lo creé yo', '¡Temperley es nuestro!', '¿Viste la nave, Gaspi?', 'Saluden, chicas, que nos miran'];
const CHICAS = ['¡Uuuh, qué facha!', '¡Hola, Temperley!', '¡Subí el volumen!', '¡Saludá, Gaspi!', '¡Vamos a la costa!'];

export class Laban {
  constructor(scene, traffic) {
    this.traffic = traffic;
    this.riders = [];
    this.talkT = 4;
    this.bubble = null;
    this.ready = this.init(scene).catch((e) => console.warn('No cargó la Ferrari de Laban', e));
  }

  async init() {
    const mesh = await loadFerrari(0xffd60a, { convertible: true });
    // Laban al volante (en Argentina se maneja a la izquierda: +x), una chica de acompañante
    // y dos sentadas en la cola, saludando
    const seat = (look, x, y, z, role) => {
      const full = { ...randomCivilian(), ...CLEAN, ...look };
      const h = makeHuman(full);
      h.root.position.set(x, y, z);
      mesh.add(h.root);
      this.riders.push({ h, role, look: full, t: R.range(0, 6) });
    };
    seat({ female: false, top: 'jacket', jacket: 0xf4f2ec, shirt: 0xffffff, pants: 0xf4f2ec, bottom: 'pants', shoes: 0xf2efe8, fedora: 0xf4f2ec, glasses: true, stubble: true, hairStyle: 'short', hair: 0x2b1d14, scale: 1 }, 0.35, -0.12, -0.2, 'driver');
    const girl = (shirt, hair, hairStyle) => ({ female: true, fit: true, top: 'tank', shirt, bottom: 'shorts', hair, hairStyle, lipstick: true, glasses: R.chance(0.5), scale: 0.98 });
    seat(girl(0xff4fa3, 0xc9a15a, 'long'), -0.35, -0.12, -0.2, 'wave');
    seat(girl(0x26c6da, 0x2b1d14, 'ponytail'), 0.42, 0.52, -1.25, 'wave');
    seat(girl(0xffffff, 0x8a3a1a, 'long'), -0.42, 0.52, -1.25, 'wave');
    // arranca en una calle cerca de la estación
    const t = this.traffic;
    const edges = t.graph.edges.filter((e) => e.len > 25 && e.street.w >= 6.5 && Math.hypot(e.from.x - STATION.x, e.from.z - STATION.z) < 110);
    const e = R.pick(edges.length ? edges : t.graph.edges);
    const v = t.spawnOn(mesh, e, Math.min(8, e.len / 2));
    Object.assign(v, { keep: true, home: { x: STATION.x, z: STATION.z }, homeR: 150, laban: this });
    v.ai.vmax = 7.5;
    this.v = v;
    return v;
  }

  // Gaspi les roba la Ferrari: se bajan todos. Laban se calienta, las chicas salen corriendo.
  eject(v, world) {
    const lx = -Math.cos(v.heading);
    const lz = Math.sin(v.heading);
    this.riders.forEach((r, i) => {
      v.mesh.remove(r.h.root);
      const side = i % 2 ? -1 : 1;
      const back = i > 1 ? 1.4 : 0;
      const n = world.npcs.spawnWalker({ x: v.x + lx * side * (v.W / 2 + 1.2) - v.fx * back, z: v.z + lz * side * (v.W / 2 + 1.2) - v.fz * back, heading: v.heading + (side * Math.PI) / 2 }, null, 0, 0, r.look);
      if (!n) return;
      if (r.role === 'driver') {
        world.npcs.hurt(n, 5, lx, lz, { knock: true, knockT: 1.4, world });
        n.after = 'fight';
        n.say('¡Mi Ferrari! ¡Esto lo creé yo!', 3);
      } else {
        world.npcs.setState(n, 'flee', world.player);
        n.say(R.pick(['¡Aaah! ¡Laban, hacé algo!', '¡Qué hacés, loco!', '¡Nos robaron la Ferrari!']), 2.5);
      }
    });
    this.riders = [];
    this.stolen = true;
    this.bubble = null;
    world.audio.alerta();
  }

  update(dt, world) {
    const v = this.v;
    if (!v) return;
    // el corte del techo sigue al auto (también si la maneja Gaspi y salta)
    const clip = v.mesh.userData.clip;
    if (clip) clip.constant = v.mesh.position.y + 0.95;
    // si la robaron, explotó o salió del tránsito, ya no hay paseo
    const gone = this.stolen || v.wreck || !this.traffic.cars.includes(v);
    for (const r of this.riders) r.h.root.visible = !gone;
    if (gone) return;
    v.ai.vmax = 7.5;
    const P = world.player;
    const d = Math.hypot(P.x - v.x, P.z - v.z);
    if (d > 160) return;
    for (const r of this.riders) {
      r.t += dt;
      animateHuman(r.h, dt, 0, 'sit');
      const b = r.h.bones;
      if (r.role === 'driver') {
        // manos al volante
        b.uaR.rotation.set(-1.15, 0, 0.12);
        b.uaL.rotation.set(-1.15, 0, -0.12);
        b.faR.rotation.x = b.faL.rotation.x = -0.55;
        b.thR.rotation.x = b.thL.rotation.x = -1.2;
        b.shR.rotation.x = b.shL.rotation.x = 0.7;
      } else {
        // saludando con el brazo en alto
        b.uaR.rotation.set(-2.6, 0, 0.35 + Math.sin(r.t * 6) * 0.3);
        b.faR.rotation.x = -0.3 + Math.sin(r.t * 6 + 1) * 0.25;
        b.head.rotation.y = Math.sin(r.t * 0.7) * 0.4;
      }
    }
    // cerca de Gaspi: bocina y frases
    this.talkT -= dt;
    if (this.bubble) {
      this.bubble.t -= dt;
      if (this.bubble.t <= 0) this.bubble = null;
    }
    if (d < 35 && this.talkT <= 0) {
      this.talkT = R.range(5, 9);
      const laban = R.chance(0.5);
      this.bubble = { text: R.pick(laban ? LABAN : CHICAS), t: 3, female: !laban };
      if (R.chance(0.5)) world.audio.bocina?.(0.4);
    }
  }
}
