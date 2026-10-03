// Los andenes de Temperley con gente (pedido del dueño): gente esperando el tren (mucha en hora pico, yendo
// a trabajar), que se acerca a las puertas y sube cuando el Roca para; del tren baja gente que camina hacia la
// estación y sale por la puerta de la plaza. Son NPC de tipo 'pasajero' (src/npcs.js les pide qué hacer
// con `brain`): se asustan y corren como cualquiera. Solo existen con Gaspi cerca de la estación.
import * as THREE from 'three';
import { PLATFORMS, STATION } from './map.js';
import { Npc } from './npcs.js';
import { makeHuman, randomCivilian } from './human.js';
import { makePerson, makeLook, PEOPLE } from './people.js';
import { TOUCH } from './input.js';
import { R } from './rng.js';

const SPACING = 20.3; // largo de cada coche del Roca (src/trains.js)
const PACK = new THREE.BoxGeometry(0.3, 0.36, 0.14);
const PACK_MATS = [0x1a1a1a, 0x263238, 0x1565c0, 0x6d4c41, 0x37474f, 0xc62828].map((c) => new THREE.MeshLambertMaterial({ color: c }));

function inside(ring, x, z) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function edgeDist(ring, x, z) {
  let best = { d: Infinity, x: 0, z: 0 };
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const ex = bx - ax;
    const ez = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
    const qx = ax + ex * t;
    const qz = az + ez * t;
    const d = Math.hypot(x - qx, z - qz);
    if (d < best.d) best = { d, x: qx, z: qz };
  }
  return best;
}
// cuánta gente espera según la hora: hora pico a la mañana y a la tarde
function crowdFor(hour) {
  if ((hour > 6.3 && hour < 9.6) || (hour > 17 && hour < 20.2)) return 44;
  if (hour > 9.6 && hour < 22) return 22;
  if (hour > 5 && hour < 6.3) return 12;
  return 5;
}

export class Andenes {
  constructor(npcs, interiors, city, trains) {
    this.npcs = npcs;
    this.interiors = interiors;
    this.city = city;
    this.list = [];
    this.handled = new WeakMap(); // tren → parada ya atendida
    this.spawnT = 0;
    this.active = false;
    // lugares para esperar: amontonados frente a donde quedan las puertas de los trenes que paran (de cada
    // recorrido, con el tren frenado en la estación), del borde del andén hacia adentro
    this.plats = PLATFORMS.map((p) => p[0]).filter((r) => r?.length > 2);
    this.spots = [];
    this.doorSpots = [];
    for (const r of trains.routes) {
      const boxes = [];
      for (let i = 0; i < (r.kind === 'diesel' ? 4 : 7); i++) {
        const p = r.at(r.stopS - i * SPACING - SPACING / 2);
        boxes.push({ x: p.x, z: p.z, h: p.heading });
      }
      for (const d of this.doorsOf({ boxes })) {
        if (this.doorSpots.some((o) => Math.hypot(o.x - d.x, o.z - d.z) < 3)) continue;
        this.doorSpots.push(d);
        const ring = this.plats[d.plat];
        const ix = Math.sin(d.face);
        const iz = Math.cos(d.face);
        for (let k = 0; k < 16; k++) {
          const a = R.range(-4.5, 4.5);
          const b = R.range(0.2, 4.2);
          const x = d.x + iz * a + ix * b;
          const z = d.z - ix * a + iz * b;
          if (!inside(ring, x, z) || edgeDist(ring, x, z).d < 0.9) continue;
          if (this.spots.some((o) => Math.hypot(o.x - x, o.z - z) < 0.7)) continue;
          this.spots.push({ x, z, plat: d.plat, face: d.face + Math.PI + R.range(-0.5, 0.5), used: false });
        }
      }
    }
  }

  platOf(x, z) {
    return this.plats.findIndex((r) => inside(r, x, z));
  }

  // un pasajero nuevo: ropa de ir a trabajar (o de cualquier día), algunos con mochila
  person(x, z, plat) {
    let h = null;
    if (PEOPLE.ready) {
      h = R.chance(0.6)
        ? makePerson(R.chance(0.5) ? 'female' : 'male')
        : makeLook({ shirt: R.pick([0xf2f2f2, 0xbfd7ea, 0xe8e0d0, 0x9fb8cf]), pants: R.pick([0x1c2430, 0x2a2a2a, 0x3b3f46]), longSleeves: true, female: R.chance(0.45) });
    }
    h ??= makeHuman(randomCivilian());
    if (R.chance(0.4)) {
      const pack = new THREE.Mesh(PACK, R.pick(PACK_MATS));
      pack.position.set(0, 0.04, -0.17);
      (h.bones.chest || h.bones.spine).add(pack);
    }
    const n = this.npcs.add(new Npc('pasajero', h, x, z));
    n.y = 1.1;
    n.state = 'idle';
    n.hp = 70;
    n.brave = R.chance(0.15) ? 0.6 : 0.05;
    n.money = R.int(2, 20) * 200;
    n.mission = true; // no los recicla el sistema de vecinos
    n.pas = { plat, mode: 'wait', spot: null, pose: R.chance(0.35) ? 'phone' : R.chance(0.2) ? 'listen' : 'walk', life: 0 };
    this.list.push(n);
    return n;
  }

  freeSpot(plat = -1) {
    const free = this.spots.filter((s) => !s.used && (plat < 0 || s.plat === plat));
    return free.length ? R.pick(free) : null;
  }

  wait(n, s) {
    if (n.pas.spot) n.pas.spot.used = false;
    s.used = true;
    n.pas.spot = s;
    n.pas.mode = 'wait';
    n.target = { x: s.x + R.range(-0.4, 0.4), z: s.z + R.range(-0.4, 0.4) };
  }

  clear() {
    for (const n of this.list) n.dead = true;
    for (const s of this.spots) s.used = false;
    this.list = [];
  }

  update(dt, world) {
    const P = world.player;
    const focus = world.interiors?.focus(P) ?? P;
    const d = Math.hypot(focus.x - STATION.x, focus.z - STATION.z);
    const want = d < 170 && !world.inside;
    if (!want) {
      if (this.active && d > 200) {
        this.clear();
        this.active = false;
      }
      return;
    }
    this.list = this.list.filter((n) => {
      if (n.dead) {
        if (n.pas?.spot) n.pas.spot.used = false;
        return false;
      }
      return true;
    });
    const cap = Math.round(crowdFor(world.time.hour) * (TOUCH ? 0.6 : 1));
    const waiting = this.list.filter((n) => n.pas.mode === 'wait').length;
    // la primera vez ya están esperando; después llegan de a uno desde la estación
    if (!this.active) {
      this.active = true;
      for (let i = 0; i < cap; i++) {
        const s = this.freeSpot();
        if (!s) break;
        const n = this.person(s.x, s.z, s.plat);
        this.wait(n, s);
        n.x = n.target.x;
        n.z = n.target.z;
        n.heading = s.face;
      }
    } else if (waiting < cap && (this.spawnT -= dt) <= 0) {
      this.spawnT = cap >= 44 ? R.range(0.35, 1.1) : R.range(0.8, 2.5);
      const door = this.interiors.platformDoor?.outside;
      const s = this.freeSpot(door ? this.platOf(door.x, door.z) : -1) ?? this.freeSpot();
      if (s) {
        const from = door && R.chance(0.7) ? door : s;
        const n = this.person(from.x, from.z, s.plat);
        this.wait(n, s);
      }
    }
    this.trains(dt, world);
  }

  // un tren que paró en la estación: los que esperan suben por la puerta más cercana y baja gente
  trains(dt, world) {
    for (const t of world.trains.trains) {
      if (t.state !== 'stopped' || !t.boxes?.length) continue;
      const mid = t.boxes[Math.floor(t.boxes.length / 2)];
      if (Math.hypot(mid.x - STATION.x, mid.z - STATION.z) > 140) continue;
      let doors = this.handled.get(t);
      if (!doors || doors.stop !== t.s) {
        doors = this.doorsOf(t);
        doors.stop = t.s;
        this.handled.set(t, doors);
        this.alight(world, doors);
        for (const n of this.list) {
          // algunos esperan otro tren (va a Glew, ellos a Ezeiza)
          if (n.pas.mode !== 'wait' || n.state !== 'idle' || R.chance(0.25)) continue;
          const near = doors.filter((o) => o.plat === n.pas.plat);
          let best = null;
          for (const o of near) {
            const dd = Math.hypot(o.x - n.x, o.z - n.z);
            if (dd < 22 && (!best || dd < best.d)) best = { d: dd, o };
          }
          if (!best) continue;
          if (n.pas.spot) n.pas.spot.used = false;
          n.pas.spot = null;
          n.pas.mode = 'board';
          n.target = { x: best.o.x + R.range(-0.5, 0.5), z: best.o.z + R.range(-0.5, 0.5) };
          n.pas.door = best.o;
        }
      }
      // el tren espera a que terminen de subir (un rato, no para siempre)
      const boarding = this.list.some((n) => n.pas.mode === 'board' && n.state === 'idle');
      if (boarding && t.wait < 1.5 && (t.held = (t.held || 0) + dt) < 8) t.wait = 1.5;
      if (!boarding) t.held = 0;
    }
  }

  // puertas del tren que dan a un andén: a cada costado de cada coche, cerca de las puntas
  doorsOf(t) {
    const out = [];
    for (const b of t.boxes) {
      const fx = Math.sin(b.h);
      const fz = Math.cos(b.h);
      for (const along of [-7.8, 7.8]) {
        for (const side of [-1, 1]) {
          const x = b.x + fx * along + fz * side * 2.35;
          const z = b.z + fz * along - fx * side * 2.35;
          const plat = this.platOf(x, z);
          if (plat < 0 || edgeDist(this.plats[plat], x, z).d < 0.5) continue;
          out.push({ x, z, plat, face: Math.atan2(fz * side, -fx * side) });
        }
      }
    }
    return out;
  }

  // baja gente: camina hacia la estación y sale por la puerta de la plaza
  alight(world, doors) {
    if (!doors.length) return;
    const P = world.player;
    const rush = crowdFor(world.time.hour) >= 44;
    const n0 = Math.min((TOUCH ? 12 : 22) - Math.max(0, this.list.length - 44), rush ? doors.length * 2 : Math.ceil(doors.length / 2));
    const exit = this.interiors.platformDoor?.outside;
    for (let i = 0; i < n0; i++) {
      const o = R.pick(doors);
      if (Math.hypot(o.x - P.x, o.z - P.z) > 120) continue;
      const n = this.person(o.x + R.range(-0.4, 0.4), o.z + R.range(-0.4, 0.4), o.plat);
      n.heading = o.face;
      n.pas.mode = 'leave';
      n.pas.delay = i * 0.35 + R.range(0, 0.5);
      n.pas.pose = 'walk';
      // a la puerta de la estación si está en ese andén; si no, hacia el lado de la estación
      const ring = this.plats[o.plat];
      const goal = exit && inside(ring, exit.x, exit.z) ? exit : this.towardStation(ring, o);
      n.target = { x: goal.x + R.range(-0.8, 0.8), z: goal.z + R.range(-0.8, 0.8) };
      n.h.root.visible = n.pas.delay <= 0;
    }
    // y del otro lado, en la plaza, sale gente de la estación
    const door = this.city.spots.stationDoor;
    const sw = this.city.spots.stationWall;
    if (door && Math.hypot(door.x - P.x, door.z - P.z) < 140) {
      const k = rush ? 5 : 2;
      for (let i = 0; i < k; i++) {
        setTimeout(() => {
          const heading = sw ? Math.atan2(sw.nx, sw.nz) + R.range(-0.6, 0.6) : 0;
          world.npcs.spawnWalker({ x: door.x + R.range(-1.2, 1.2), z: door.z + R.range(-1.2, 1.2), heading }, null);
        }, 9000 + i * 1300);
      }
    }
  }

  // el punto del andén más cerca de la estación (por ahí "salen")
  towardStation(ring, o) {
    let best = null;
    for (let i = 0; i < 40; i++) {
      const x = o.x + R.range(-6, 6);
      const z = STATION.z + R.range(-8, 8);
      if (!inside(ring, x, z) || edgeDist(ring, x, z).d < 1) continue;
      const dd = Math.hypot(x - STATION.x, z - STATION.z);
      if (!best || dd < best.d) best = { x, z, d: dd };
    }
    return best ?? o;
  }

  // lo que hace cada pasajero (lo llama Npcs.update)
  brain(n, dt) {
    const p = n.pas;
    p.life += dt;
    if (p.mode === 'leave') {
      if (p.delay > 0) {
        p.delay -= dt;
        n.h.root.visible = p.delay <= 0;
        return { want: 0, pose: 'walk' };
      }
      const d = Math.hypot(n.target.x - n.x, n.target.z - n.z);
      if (d < 0.8 || p.life > 60) n.dead = true;
      return { want: 1.45, pose: 'walk' };
    }
    if (p.mode === 'board') {
      const d = Math.hypot(n.target.x - n.x, n.target.z - n.z);
      if (d < 0.6) n.dead = true; // subió
      return { want: 1.7, pose: 'walk' };
    }
    // esperando: llega a su lugar y mira para las vías; cada tanto cambia de pie o de lugar
    const d = Math.hypot(n.target.x - n.x, n.target.z - n.z);
    if (d > 0.4) return { want: 1.25, pose: 'walk' };
    if (p.spot) {
      let diff = p.spot.face - n.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      n.heading += diff * Math.min(1, dt * 3);
    }
    return { want: 0, pose: p.pose, t: p.life };
  }
}
