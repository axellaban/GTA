// Gente del barrio: vecinos, trapitos, gente pidiendo, perdidos que deambulan y perros.
import * as THREE from 'three';
import { makeHuman, animateHuman, randomCivilian, SKINS, HAIRS } from './human.js';
import { R } from './rng.js';

const SIDE = 1.6; // distancia al borde de la manzana por donde camina la gente

export class Npc {
  constructor(type, human, x, z) {
    this.type = type;
    this.h = human;
    this.x = x;
    this.z = z;
    this.y = 0.15;
    this.heading = R.range(0, Math.PI * 2);
    this.speed = 0;
    this.state = 'idle';
    this.t = 0;
    this.knockT = 0;
    this.bubble = null;
    this.cool = 0;
    this.r = 0.32;
  }
  say(text, dur = 3) {
    this.bubble = { text, t: dur };
  }
  get mesh() {
    return this.h.root;
  }
}

function lines(type) {
  return {
    zombie: ['¿Tenés un peso, amigo?', 'Amigo... amigo...', '¿Me convidás un pucho?', 'Eeeh... pará, pará...', '¿Qué hacés, rey?'],
    mendigo: ['¿Una monedita, pa?', 'Una ayudita para comer, jefe', 'Dios te bendiga'],
    vecino: ['¡Qué calor!', 'Otra vez sin luz...', '¿Viste el partido?', 'Uh, se viene el corte en Meeks', 'Ya ni el Roca pasa a horario', '¡Chau, Gaspi!'],
  }[type];
}

export class Npcs {
  constructor(scene, city, colliders, heightAt, audio) {
    this.scene = scene;
    this.city = city;
    this.colliders = colliders;
    this.heightAt = heightAt;
    this.audio = audio;
    this.list = [];
    this.dogs = [];
    this.blocks = city.blocks.filter((b) => b.x1 - b.x0 > 20 && b.z1 - b.z0 > 20);
    this.linkBlocks();
  }

  linkBlocks() {
    for (const b of this.blocks) {
      b.nb = {};
      for (const o of this.blocks) {
        if (o === b) continue;
        const sameRow = Math.abs(o.z0 - b.z0) < 1 && Math.abs(o.z1 - b.z1) < 1;
        const sameCol = Math.abs(o.x0 - b.x0) < 1 && Math.abs(o.x1 - b.x1) < 1;
        if (sameRow && o.x0 > b.x1 && o.x0 - b.x1 < 16) b.nb.E = o;
        if (sameRow && b.x0 > o.x1 && b.x0 - o.x1 < 16) b.nb.W = o;
        if (sameCol && o.z0 > b.z1 && o.z0 - b.z1 < 16) b.nb.S = o;
        if (sameCol && b.z0 > o.z1 && b.z0 - o.z1 < 16) b.nb.N = o;
      }
    }
  }

  nearestBlock(x, z) {
    let best = this.blocks[0];
    let bd = Infinity;
    for (const b of this.blocks) {
      const cx = Math.max(b.x0, Math.min(x, b.x1));
      const cz = Math.max(b.z0, Math.min(z, b.z1));
      const d = Math.hypot(cx - x, cz - z);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  corner(b, i) {
    return [
      [b.x0 + SIDE, b.z0 + SIDE],
      [b.x1 - SIDE, b.z0 + SIDE],
      [b.x1 - SIDE, b.z1 - SIDE],
      [b.x0 + SIDE, b.z1 - SIDE],
    ][i];
  }

  add(npc) {
    this.scene.add(npc.mesh);
    this.list.push(npc);
    return npc;
  }

  populate() {
    // vecinos caminando por la vereda
    for (let i = 0; i < 46; i++) this.spawnWalker();
    // trapitos: estacionamiento de la estación y Av. Almirante Brown
    const trapSpots = [
      [60, -60],
      [60, -10],
      [60, 30],
      [173, -60],
      [-73, -120],
      [188, 40],
    ];
    for (const [x, z] of trapSpots) {
      const h = makeHuman({ ...randomCivilian(), vest: 0xc6ff00, cap: R.chance(0.5) ? 0x1a237e : null, franela: true });
      const n = this.add(new Npc('trapito', h, x, z));
      n.home = { x, z };
    }
    // gente pidiendo, sentada en la vereda
    const beg = [
      [-71.5, -6, -Math.PI / 2],
      [-71.5, 24, -Math.PI / 2],
      [-88, 60, Math.PI / 2],
      [86.5, -100, -Math.PI / 2],
      [172, 10, Math.PI / 2],
    ];
    for (const [x, z, heading] of beg) {
      const h = makeHuman({ skin: R.pick(SKINS), hair: R.pick(HAIRS), shirt: R.pick([0x6d5c47, 0x4e4e4e, 0x5d4037]), pants: 0x3e3a36, beard: true, hairStyle: 'long', cup: true });
      const n = this.add(new Npc('mendigo', h, x, z));
      n.state = 'sit';
      n.heading = heading;
    }
    for (let i = 0; i < 7; i++) this.spawnZombie();
    for (let i = 0; i < 8; i++) this.spawnDog();
  }

  spawnWalker(at) {
    const b = at?.block ?? R.pick(this.blocks);
    const ci = R.int(0, 3);
    const [cx, cz] = this.corner(b, ci);
    const h = makeHuman(randomCivilian());
    const n = this.add(new Npc('vecino', h, at?.x ?? cx, at?.z ?? cz));
    n.block = b;
    n.ci = ci;
    n.dir = R.chance(0.5) ? 1 : -1;
    n.vmax = R.range(1.1, 1.6);
    n.state = 'walk';
    n.phone = R.chance(0.2);
    this.nextCorner(n);
    return n;
  }

  spawnZombie(near) {
    const b = R.pick(this.blocks);
    let [x, z] = this.corner(b, R.int(0, 3));
    if (near) {
      const a = R.range(0, Math.PI * 2);
      x = near.x + Math.cos(a) * R.range(50, 90);
      z = near.z + Math.sin(a) * R.range(50, 90);
    }
    const h = makeHuman({ skin: R.pick([0xc9a88f, 0xb89478, 0xa88a70]), hair: 0x2b2420, shirt: R.pick([0x4e4a45, 0x5d5348, 0x3d3d3d]), pants: 0x333333, hood: R.chance(0.5) ? 0x3a3a3a : null, beard: R.chance(0.5), scale: R.range(0.9, 1) });
    const n = this.add(new Npc('zombie', h, x, z));
    n.state = 'wander';
    n.vmax = R.range(0.5, 0.9);
    n.target = { x, z };
    return n;
  }

  spawnDog() {
    const g = new THREE.Group();
    const col = R.pick([0x6b4a2b, 0x2a2420, 0xb88a4a, 0xd9c7a3, 0x8a6a4a]);
    const m = new THREE.MeshLambertMaterial({ color: col });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.75), m);
    body.position.y = 0.5;
    g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.3), m);
    head.position.set(0, 0.72, 0.45);
    g.add(head);
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.08), m);
    ear.position.set(0, 0.86, 0.4);
    g.add(ear);
    const legs = [];
    for (const [x, z] of [
      [-0.1, 0.28],
      [0.1, 0.28],
      [-0.1, -0.28],
      [0.1, -0.28],
    ]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.08), m);
      l.position.set(x, 0.18, z);
      g.add(l);
      legs.push(l);
    }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), m);
    tail.position.set(0, 0.62, -0.45);
    tail.rotation.x = -0.6;
    g.add(tail);
    g.traverse((o) => (o.castShadow = true));
    const b = R.pick(this.blocks);
    const [x, z] = this.corner(b, R.int(0, 3));
    const dog = { g, legs, tail, x, z, heading: 0, speed: 0, target: { x, z }, t: R.range(0, 5), barkT: 0, phase: 0 };
    this.scene.add(g);
    this.dogs.push(dog);
  }

  nextCorner(n) {
    // al llegar a una esquina, a veces cruza la calle hacia la manzana vecina
    if (n.crossing) {
      n.crossing = false;
    } else if (R.chance(0.3)) {
      const dirs = [
        ['N', 'W'],
        ['N', 'E'],
        ['S', 'E'],
        ['S', 'W'],
      ][n.ci];
      const side = R.pick(dirs);
      const o = n.block.nb[side];
      if (o) {
        const flipN = { 0: 3, 1: 2, 2: 1, 3: 0 };
        const flipE = { 0: 1, 1: 0, 2: 3, 3: 2 };
        n.block = o;
        n.ci = side === 'N' || side === 'S' ? flipN[n.ci] : flipE[n.ci];
        const [tx, tz] = this.corner(o, n.ci);
        n.target = { x: tx, z: tz };
        n.crossing = true;
        return;
      }
    }
    n.ci = (n.ci + n.dir + 4) % 4;
    const [tx, tz] = this.corner(n.block, n.ci);
    n.target = { x: tx, z: tz };
  }

  // Gente que camina (para que el tránsito frene)
  walkers() {
    return this.list.filter((n) => n.knockT <= 0 && n.state !== 'sit');
  }

  knock(n, fx, fz, force = 3) {
    if (n.type === 'piquetero') return;
    n.knockT = 3.5;
    n.x += fx * force * 0.5;
    n.z += fz * force * 0.5;
    n.say(R.pick(['¡Ay!', '¡Pará, animal!', '¡Eh! ¡Qué hacés!', '¡Me mataste, loco!']), 2.5);
    this.audio.golpe(0.5);
  }

  update(dt, world) {
    const { player, time } = world;
    const night = time.night;
    for (const n of this.list) {
      n.t += dt;
      if (n.bubble) {
        n.bubble.t -= dt;
        if (n.bubble.t <= 0) n.bubble = null;
      }
      n.cool -= dt;
      const dp = Math.hypot(player.x - n.x, player.z - n.z);
      const far = dp > 190;
      n.mesh.visible = !far;
      if (n.knockT > 0) {
        n.knockT -= dt;
        if (!far) animateHuman(n.h, dt, 0, 'knocked');
        this.place(n);
        continue;
      }
      let pose = 'walk';
      let want = 0;
      if (n.type === 'vecino') {
        if (n.state === 'angry') {
          n.target = { x: player.x, z: player.z };
          want = 3.2;
          n.angryT -= dt;
          if (n.angryT <= 0) n.state = 'walk';
          pose = 'fist';
        } else {
          want = n.vmax;
          pose = n.phone ? 'phone' : 'walk';
          if (Math.hypot(n.target.x - n.x, n.target.z - n.z) < 0.8) this.nextCorner(n);
          if (dp < 4 && n.cool <= 0 && R.chance(0.01)) {
            n.say(R.pick(lines('vecino')), 2.5);
            n.cool = 20;
          }
        }
      } else if (n.type === 'trapito') {
        want = this.updateTrapito(n, dt, world, dp);
        pose = n.state === 'approach' ? 'walk' : 'wave';
        if (n.state === 'idle' && !world.traffic.all().some((v) => v.speed > 1 && Math.hypot(v.x - n.x, v.z - n.z) < 14)) pose = 'walk';
      } else if (n.type === 'mendigo') {
        pose = 'sit';
        if (dp < 3.5 && n.cool <= 0 && !player.vehicle) {
          n.say(R.pick(lines('mendigo').slice(0, 2)), 3.5);
          n.cool = 25;
        }
      } else if (n.type === 'zombie') {
        pose = 'zombie';
        want = n.vmax;
        if (dp < 11 && !player.vehicle && n.cool <= 0) {
          n.target = { x: player.x, z: player.z };
          want = n.vmax * 1.5;
          if (dp < 1.3) {
            player.grabbed = Math.max(player.grabbed, 0.4);
            if (!n.bubble) n.say(R.pick(lines('zombie')), 2.5);
          }
        } else if (Math.hypot(n.target.x - n.x, n.target.z - n.z) < 1 || n.t > 12) {
          n.t = 0;
          n.target = { x: n.x + R.range(-25, 25), z: n.z + R.range(-25, 25) };
        }
        if (!night && dp > 150 && this.list.filter((o) => o.type === 'zombie').length > 7) n.dead = true;
      }
      if (want > 0 && n.target) {
        const dx = n.target.x - n.x;
        const dz = n.target.z - n.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.2) {
          let h = Math.atan2(dx, dz);
          if (n.type === 'zombie') h += Math.sin(n.t * 1.7) * 0.6;
          let diff = h - n.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          n.heading += diff * Math.min(1, dt * 6);
          n.speed = Math.min(want, d * 2);
          n.x += Math.sin(n.heading) * n.speed * dt;
          n.z += Math.cos(n.heading) * n.speed * dt;
        } else n.speed = 0;
      } else n.speed = 0;
      // choque contra casas y rejas
      if (n.type !== 'mendigo') {
        const p = { x: n.x, z: n.z };
        this.colliders.resolveCircle(p, n.r);
        n.x = p.x;
        n.z = p.z;
      }
      if (!far) animateHuman(n.h, dt, n.speed, pose);
      this.place(n);
    }
    this.list = this.list.filter((n) => {
      if (n.dead) this.scene.remove(n.mesh);
      return !n.dead;
    });
    // de noche salen más
    const zombies = this.list.filter((n) => n.type === 'zombie').length;
    if (night && zombies < 16 && R.chance(dt * 0.5)) this.spawnZombie(player);
    this.updateDogs(dt, world);
  }

  place(n) {
    const y = this.heightAt(n.x, n.z);
    n.y += (y - n.y) * 0.3;
    n.mesh.position.set(n.x, n.y, n.z);
    n.mesh.rotation.y = n.heading;
  }

  updateTrapito(n, dt, world, dp) {
    const { player, hud, audio } = world;
    if (n.state === 'idle') {
      if (!n.target || Math.hypot(n.target.x - n.x, n.target.z - n.z) < 0.5) {
        if (n.t > 4) {
          n.t = 0;
          n.target = { x: n.home.x + R.range(-4, 4), z: n.home.z + R.range(-6, 6) };
        } else return 0;
      }
      return 0.8;
    }
    if (n.state === 'approach') {
      n.target = { x: player.x, z: player.z };
      if (player.vehicle) {
        n.state = 'idle';
        return 0;
      }
      if (dp < 1.8) {
        n.state = 'ask';
        const car = n.car;
        n.say('¡Te lo cuido, jefe! Son $3.000', 4);
        hud.ask(
          'El trapito te pide $3.000 para "cuidarte" el auto',
          [
            {
              label: 'Pagar $3.000',
              run: () => {
                if (player.money >= 3000) {
                  player.addMoney(-3000);
                  car.cuidado = true;
                  n.say('¡Quedate tranquilo, maestro!', 3);
                } else {
                  n.say('¿No tenés? Bueno, después vemos...', 3);
                  car.revenge = true;
                }
                n.state = 'idle';
              },
            },
            {
              label: 'No, gracias',
              run: () => {
                n.say('Mmm... bueno. Cuidate el auto, eh.', 3.5);
                car.revenge = true;
                n.state = 'idle';
                audio.alerta();
              },
            },
          ],
          7,
          1,
        );
      }
      if (n.t > 25) n.state = 'idle';
      return 3;
    }
    return 0;
  }

  // Cuando Gaspi deja un auto: el trapito más cercano viene a cobrar.
  onPark(v) {
    let best = null;
    let bd = 35;
    for (const n of this.list) {
      if (n.type !== 'trapito' || n.state !== 'idle') continue;
      const d = Math.hypot(n.x - v.x, n.z - v.z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (best && !v.cuidado) {
      best.state = 'approach';
      best.car = v;
      best.t = 0;
      best.say('¡Eeeh, maestro! ¡Maestro!', 2);
    }
  }

  updateDogs(dt, world) {
    const { player, crime } = world;
    for (const d of this.dogs) {
      d.t += dt;
      d.barkT -= dt;
      const moto = crime.nearestMoto(d.x, d.z, 35);
      let want = 0;
      if (moto) {
        d.target = { x: moto.x, z: moto.z };
        want = 7.5;
        if (d.barkT <= 0) {
          const dist = Math.hypot(player.x - d.x, player.z - d.z);
          this.audio.ladrido(Math.max(0, 1 - dist / 80));
          d.barkT = R.range(0.6, 1.4);
        }
      } else {
        const dp = Math.hypot(player.x - d.x, player.z - d.z);
        if (dp < 7 && !player.vehicle) {
          d.target = { x: player.x - Math.sin(player.heading) * 1.5, z: player.z - Math.cos(player.heading) * 1.5 };
          want = Math.min(4, dp);
        } else if (Math.hypot(d.target.x - d.x, d.target.z - d.z) < 1 || d.t > 10) {
          d.t = 0;
          d.target = { x: d.x + R.range(-20, 20), z: d.z + R.range(-20, 20) };
        } else want = 1.2;
      }
      const dx = d.target.x - d.x;
      const dz = d.target.z - d.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.6 && want > 0) {
        d.heading = Math.atan2(dx, dz);
        d.speed = Math.min(want, dist * 2);
      } else d.speed = 0;
      d.x += Math.sin(d.heading) * d.speed * dt;
      d.z += Math.cos(d.heading) * d.speed * dt;
      const p = { x: d.x, z: d.z };
      this.colliders.resolveCircle(p, 0.35);
      d.x = p.x;
      d.z = p.z;
      d.phase += dt * (4 + d.speed * 3);
      d.legs.forEach((l, i) => (l.rotation.x = Math.sin(d.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * Math.min(0.8, d.speed * 0.25)));
      d.tail.rotation.y = Math.sin(d.t * 12) * 0.6;
      d.g.position.set(d.x, this.heightAt(d.x, d.z), d.z);
      d.g.rotation.y = d.heading;
    }
  }
}
