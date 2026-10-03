// Gente que siempre está en su lugar (relevamiento del dueño):
// - Borrachos en la puerta del Supermercado Luna, con el porrón en la mano, tambaleándose y
//   pidiendo para el vino. Si les pegás, algunos se ponen pesados.
// - Chicos en la puerta del Colegio Eccleston a la hora de la escuela (de 7:30 a 18:30), con
//   uniforme y mochila, jugando a la mancha. Como en los GTA, a los chicos no se los puede lastimar:
//   si hay tiros o lío, salen corriendo.
import * as THREE from 'three';
import { Npc } from './npcs.js';
import { makeHuman } from './human.js';
import { makeLook } from './people.js';
import { R } from './rng.js';

const LINES = {
  borracho: ['¡Eh, amigo! ¿Tenés para un vinito?', '¡Hip! ...vos sos el de la tele, ¿no?', '¡Aguante Temperley, loco!', 'Un porrón más y me voy, lo juro', 'Te quiero, hermano. En serio te digo.', '¿Qué mirás? ...¡hip!'],
  chico: ['¡Dale, dale!', '¡Mancha!', '¡No vale, no vale!', '¡Mi mamá ya viene!', '¿Jugamos a la pelota?', '¡Profe, profe!', '¡Te toca a vos!'],
};

const bottleGeo = new THREE.CylinderGeometry(0.032, 0.036, 0.24, 8).translate(0, -0.1, 0.04);
const bottleMat = new THREE.MeshStandardMaterial({ color: 0x4a2a10, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.85 });
const packGeo = new THREE.BoxGeometry(0.28, 0.32, 0.13);

// dónde está la puerta de un lugar con cartel (city.shopSigns): un poco afuera, en la vereda
function doorOf(city, re, near = null) {
  let best = null;
  for (const s of city.shopSigns || []) {
    if (!re.test(s.name || '')) continue;
    const d = near ? Math.hypot(s.x - near.x, s.z - near.z) : 0;
    if (!best || d < best.d) best = { ...s, d };
  }
  return best && { x: best.x + best.nx * 2.2, z: best.z + best.nz * 2.2, nx: best.nx, nz: best.nz };
}

export class Barrio {
  constructor(npcs, city) {
    this.npcs = npcs;
    this.luna = doorOf(city, /SUPERMERCADO LUNA/i) ?? doorOf(city, /\bLUNA\b/i);
    this.eccleston = doorOf(city, /ECCLESTON/i);
    this.kids = [];
    if (this.luna) for (let i = 0; i < 3; i++) this.spawnDrunk(i);
  }

  spawnDrunk(i) {
    const at = this.luna;
    const sx = at.nz;
    const sz = -at.nx;
    const x = at.x + sx * (i - 1) * 1.6 + at.nx * R.range(-0.3, 0.6);
    const z = at.z + sz * (i - 1) * 1.6 + at.nz * R.range(-0.3, 0.6);
    const look = { skin: R.pick([0xc68b62, 0xd9a882, 0xb07a52]), hair: R.pick([0x2b1d14, 0x5a5a5a, 0x1a1a1a]), hairStyle: R.pick(['short', 'curly', 'bald']), top: R.pick(['jersey', 'tshirt', 'hoodie']), jersey: 'temperley', shirt: R.pick([0x6b6b6b, 0x4e342e, 0x2e4a2e]), pants: R.pick([0x3a3a40, 0x2c3e5c]), shoes: 0x2a2a2a, stubble: true, tired: true, belly: R.chance(0.7), scale: R.range(0.96, 1.04) };
    const h = makeLook(look) || makeHuman(look);
    const n = this.npcs.add(new Npc('borracho', h, x, z));
    n.look = look;
    n.state = 'idle';
    n.home = { x, z };
    n.hp = 70;
    n.brave = 0.6;
    n.money = R.int(0, 2) * 500;
    n.mission = true;
    n.heading = Math.atan2(at.nx, at.nz) + R.range(-0.8, 0.8);
    const b = new THREE.Mesh(bottleGeo, bottleMat);
    n.h.bones.handR.add(b);
    n.sway = R.range(0, 6);
  }

  spawnKids() {
    const at = this.eccleston;
    if (!at) return;
    const sx = at.nz;
    const sz = -at.nx;
    for (let i = 0; i < 11; i++) {
      const girl = i % 2 === 1;
      const x = at.x + sx * R.range(-5, 5) + at.nx * R.range(0, 3);
      const z = at.z + sz * R.range(-5, 5) + at.nz * R.range(0, 3);
      const look = {
        child: true,
        female: girl,
        skin: R.pick([0xf0c8a8, 0xe0b090, 0xd9a882, 0xc68b62]),
        hair: R.pick([0x2b1d14, 0x4a3020, 0x1a1a1a, 0x8a5a2a, 0xc9a15a]),
        hairStyle: girl ? R.pick(['ponytail', 'long', 'bob']) : R.pick(['short', 'curly', 'side']),
        top: 'long',
        shirt: 0x1d3a6b,
        bottom: girl ? 'skirt' : 'pants',
        skirt: 0x5a5f6b,
        pants: 0x55595e,
        shoes: 0x1a1a1a,
        socks: 0xf2f2f2,
        scale: R.range(0.62, 0.78),
      };
      const h = makeLook(look) || makeHuman(look);
      const n = this.npcs.add(new Npc('chico', h, x, z));
      n.look = look;
      n.state = 'idle';
      n.home = { x: at.x + at.nx * 1.5, z: at.z + at.nz * 1.5 };
      n.hp = 9999;
      n.mission = true;
      // mochila de colores en la espalda
      const pack = new THREE.Mesh(packGeo, new THREE.MeshLambertMaterial({ color: R.pick([0xc62828, 0x1565c0, 0xf9a825, 0x2e7d32, 0x8e24aa, 0xff7043]) }));
      pack.position.set(0, 0.05, -0.17);
      (n.h.bones.chest || n.h.bones.spine).add(pack);
      this.kids.push(n);
    }
  }

  update(dt, world) {
    // los chicos están a la hora del colegio; a la noche no queda ninguno
    const hour = world.time.hour;
    const school = hour > 7.5 && hour < 18.5;
    if (school && !this.kids.length && this.eccleston) this.spawnKids();
    if (!school && this.kids.length) {
      for (const k of this.kids) k.dead = true;
      this.kids = [];
    }
  }

  // lo que hace cada uno (lo llama Npcs.update)
  brain(n, dt, world, dp) {
    const P = world.player;
    if (n.type === 'borracho') {
      // se tambalea alrededor de la puerta, toma de a sorbos y le pide a Gaspi
      n.sway += dt;
      if (!n.target || Math.hypot(n.target.x - n.x, n.target.z - n.z) < 0.4) {
        if (R.chance(dt * 0.4)) n.target = { x: n.home.x + R.range(-1.5, 1.5), z: n.home.z + R.range(-1.5, 1.5) };
      }
      if (n.target) n.heading += Math.sin(n.sway * 2.3) * dt * 0.8;
      if (dp < 5 && !P.vehicle && n.cool <= 0) {
        n.say(R.pick(LINES.borracho), 3);
        n.cool = R.range(8, 14);
      }
      const drinking = n.sway % 9 < 1.4;
      return { want: n.target ? 0.55 : 0, pose: drinking ? 'eat' : 'walk', t: drinking ? (n.sway % 9) / 1.4 : 0 };
    }
    // chicos: corren entre ellos (la mancha) cerca de la puerta
    n.playT = (n.playT ?? R.range(0, 3)) - dt;
    if (n.playT <= 0 || !n.target) {
      n.playT = R.range(1.5, 4);
      const run = R.chance(0.5);
      n.run = run;
      n.target = { x: n.home.x + R.range(-5, 5), z: n.home.z + R.range(-4, 4) };
    }
    if (dp < 8 && n.cool <= 0 && R.chance(dt * 0.3)) {
      n.say(R.pick(LINES.chico), 2);
      n.cool = R.range(6, 12);
    }
    return { want: n.run ? 3.4 : 1.1, pose: 'walk' };
  }
}
