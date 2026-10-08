// Botes de remo con gente: con las calles inundadas pasan vecinos remando (rescatando a alguien, sacando
// cosas de la casa, de paseo) por las calles, doblan en las esquinas y dejan estela. Los botes son del
// Watercraft Kit de Kenney (CC0, public/models/agua/bote-*.glb, con sus remos); la gente es la del juego
// (src/human.js) con la pose de remar.
// Gaspi se puede subir a uno (F; si tiene dueño, se lo saca y el vecino cae al agua) y remar: W/S para
// adelante y atrás, A/D para girar, F para bajarse. Arriba de los autos que flotan hay vecinos varados
// pidiendo ayuda: si Gaspi pasa en bote al lado, se suben (plata y respeto por cada rescate).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ROADS, ROAD_NODES, pointAt, project } from './map.js';
import { makeHuman, animateHuman, randomCivilian } from './human.js';
import { disposeHuman } from './people.js';

const MAX = 3;
const VARADOS = 2;
const GRITOS = ['¡AYUDA!', '¡Acá! ¡Acá!', '¡Sáquenme de acá!', '¡Por favor, un bote!', '¡No sé nadar!'];
const SPEED = 1.25;
const DRAFT = 0.14; // cuánto se hunde el casco

export class Botes {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.models = null;
    this.t = 0;
    this.varados = [];
    const L = new GLTFLoader();
    Promise.all(['bote-chico', 'bote-grande'].map((n) => L.loadAsync(`models/agua/${n}.glb`)))
      .then((gs) => {
        this.models = gs.map((g) => {
          const root = g.scene;
          root.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          return root;
        });
      })
      .catch((e) => console.warn('botes:', e));
  }

  // un tramo de calle con agua cerca de Gaspi (lejos de la vista directa)
  pick(world) {
    const ag = world.agua;
    const P = world.player;
    for (let tries = 0; tries < 30; tries++) {
      const r = ROADS[(Math.random() * ROADS.length) | 0];
      if (r.bajo || r.len < 30) continue;
      const s = Math.random() * r.len;
      const p = pointAt(r.pts, r.cum, s);
      const d = Math.hypot(p.x - P.x, p.z - P.z);
      if (d < 45 || d > 130) continue;
      if (ag.depth(p.x, p.z) < 0.5) continue;
      return { r, s };
    }
    return null;
  }

  // at: { r, s } para ponerlo en un lugar (si no, uno cerca de Gaspi fuera de la vista)
  spawn(world, at = this.pick(world)) {
    if (!at || !this.models) return;
    const big = Math.random() < 0.45;
    const mesh = this.models[big ? 1 : 0].clone(true);
    const oars = mesh.getObjectByName('paddles');
    this.scene.add(mesh);
    // el que rema mira para atrás (así se rema con remos); los demás van sentados mirando adelante
    const people = [];
    const n = big ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const h = makeHuman({ ...randomCivilian(), scale: 0.95 + Math.random() * 0.08 });
      const rower = i === 0;
      // el que rema en el medio; atrás uno y, en el bote grande, otro adelante
      h.root.position.set(0, 0.12, rower ? 0.05 : i === 1 ? -0.8 : 0.85);
      h.root.rotation.y = rower ? Math.PI : 0;
      mesh.add(h.root);
      people.push({ h, rower, ph: Math.random() * 10 });
    }
    const b = { mesh, oars, people, r: at.r, s: at.s, dir: Math.random() < 0.5 ? 1 : -1, side: 1.6 + Math.random() * 1.2, x: 0, z: 0, heading: 0, ph: Math.random() * 10, ripT: 0, rowT: Math.random(), big };
    this.place(b, world, 0, true);
    this.list.push(b);
  }

  // pone el bote en la calle más cercana a (x, z) (para probar desde la consola)
  placeNear(b, x, z, world) {
    let best = null;
    for (const r of ROADS) {
      if (r.bajo) continue;
      const p = project(r.pts, r.cum, x, z);
      if (!best || p.dist < best.p.dist) best = { r, p };
    }
    if (!best) return;
    b.r = best.r;
    b.s = best.p.s;
    this.place(b, world, 0, true);
  }

  // sigue la calle; en la esquina elige otra calle con agua (o se vuelve)
  advance(b, world, dt) {
    const ag = world.agua;
    b.s += b.dir * SPEED * dt;
    if (b.s < 0 || b.s > b.r.len) {
      const endX = b.s < 0 ? b.r.pts[0][0] : b.r.pts[b.r.pts.length - 1][0];
      const endZ = b.s < 0 ? b.r.pts[0][1] : b.r.pts[b.r.pts.length - 1][1];
      let node = null;
      let best = 4;
      for (const n of ROAD_NODES) {
        const d = Math.abs(n.x - endX) + Math.abs(n.z - endZ);
        if (d < best) {
          best = d;
          node = n;
        }
      }
      const arms = node ? node.arms.filter((a) => a.road !== b.r && !a.road.bajo) : [];
      const ok = arms.filter((a) => {
        const p = pointAt(a.road.pts, a.road.cum, a.end === 0 ? 6 : a.road.len - 6);
        return ag.depth(p.x, p.z) > 0.45;
      });
      if (ok.length) {
        const a = ok[(Math.random() * ok.length) | 0];
        b.r = a.road;
        b.dir = a.end === 0 ? 1 : -1;
        b.s = a.end === 0 ? 0.5 : a.road.len - 0.5;
      } else {
        b.dir = -b.dir;
        b.s = Math.max(0, Math.min(b.r.len, b.s));
      }
    }
    // poca agua adelante: pega la vuelta
    const ahead = pointAt(b.r.pts, b.r.cum, b.s + b.dir * 5);
    if (ag.depth(ahead.x, ahead.z) < 0.35) b.dir = -b.dir;
  }

  place(b, world, dt, snap = false) {
    const p = pointAt(b.r.pts, b.r.cum, b.s);
    // va por su mano (a la derecha), sin pegarse al cordón
    const dx = p.dx * b.dir;
    const dz = p.dz * b.dir;
    const tx = p.x - dz * b.side;
    const tz = p.z + dx * b.side;
    const want = Math.atan2(dx, dz);
    if (snap) {
      b.x = tx;
      b.z = tz;
      b.heading = want;
    } else {
      // gira y se acomoda despacio (es un bote)
      const k = Math.min(1, dt * 0.9);
      b.x += (tx - b.x) * k;
      b.z += (tz - b.z) * k;
      let d = want - b.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      b.heading += d * Math.min(1, dt * 1.2);
    }
  }

  update(dt, world) {
    const ag = world.agua;
    this.t += dt;
    const wet = ag && ag.streetDepth > 0.45 && !world.inside;
    // con agua alta van apareciendo; cuando baja, se van
    if (wet && this.list.length < MAX && Math.random() < dt * 0.3) this.spawn(world);
    const P = world.player;
    for (const b of this.list) {
      const d = Math.hypot(b.x - P.x, b.z - P.z);
      if (!b.mine && (!wet || d > 190)) b.gone = true;
      if (b.gone) continue;
      // el de Gaspi lo mueve ride(); uno sin nadie que reme queda a la deriva
      if (b.mine) {
        /* nada */
      } else if (b.people.some((p) => p.rower)) {
        this.advance(b, world, dt);
        this.place(b, world, dt);
      } else {
        b.x += ag.flow.x * 0.6 * dt;
        b.z += ag.flow.y * 0.6 * dt;
      }
      b.mesh.visible = d < 150;
      if (!b.mesh.visible) continue;
      // flota y se mece; con cada remada se adelanta un poco
      if (!b.mine && b.people.some((p) => p.rower)) b.rowT += dt * 0.55;
      const stroke = Math.sin(b.rowT * Math.PI * 2);
      const bob = Math.sin(this.t * 1.7 + b.ph) * 0.03 * (1 + ag.rain);
      b.mesh.position.set(b.x, ag.level - DRAFT + bob, b.z);
      b.mesh.rotation.set(Math.sin(this.t * 1.1 + b.ph) * 0.03 - stroke * 0.015, b.heading, Math.cos(this.t * 0.9 + b.ph) * 0.035, 'YXZ');
      // los remos: entran al agua, tiran y vuelven por el aire
      if (b.oars) {
        b.oars.rotation.y = stroke * 0.42;
        b.oars.rotation.z = Math.cos(b.rowT * Math.PI * 2) * 0.12;
      }
      for (const p of b.people) {
        if (p.rower) animateHuman(p.h, dt, 0, 'remar', b.rowT);
        else animateHuman(p.h, dt, 0, 'sit', this.t + p.ph);
      }
      // estela: ondas en la proa y donde entran los remos
      b.ripT -= dt;
      if (b.ripT <= 0) {
        b.ripT = 0.45;
        const fx = Math.sin(b.heading);
        const fz = Math.cos(b.heading);
        ag.ripple(b.x + fx * 1.3, b.z + fz * 1.3, 0.55);
        if (stroke > 0.6) {
          ag.ripple(b.x + fz * 1.3, b.z - fx * 1.3, 0.4);
          ag.ripple(b.x - fz * 1.3, b.z + fx * 1.3, 0.4);
        }
      }
      // Gaspi nadando choca con el bote (no lo atraviesa)
      if (d < 1.9 && !P.vehicle && !b.mine) {
        const k = (1.9 - d) / Math.max(d, 0.01);
        P.x += (P.x - b.x) * k;
        P.z += (P.z - b.z) * k;
      }
    }
    for (const b of this.list) {
      if (!b.gone) continue;
      this.scene.remove(b.mesh);
      for (const p of b.people) disposeHuman(p.h);
    }
    this.list = this.list.filter((b) => !b.gone);
    this.updateVarados(dt, world, wet);
  }

  // ---------- Gaspi en bote ----------
  // el bote más cercano a Gaspi (a menos de 2,8 m)
  near(P) {
    let best = null;
    for (const b of this.list) {
      if (b.mine || b.gone) continue;
      const d = Math.hypot(b.x - P.x, b.z - P.z);
      if (d < 2.8 && (!best || d < best.d)) best = { b, d };
    }
    if (best) best.b.d = best.d;
    return best?.b ?? null;
  }
  board(b, world) {
    const P = world.player;
    const rower = b.people.find((p) => p.rower);
    if (rower) {
      // se lo sacás: el que remaba cae al agua y sale nadando, puteando
      b.mesh.remove(rower.h.root);
      disposeHuman(rower.h);
      b.people = b.people.filter((p) => p !== rower);
      const sx = Math.cos(b.heading) * 1.6;
      const sz = -Math.sin(b.heading) * 1.6;
      const n = world.npcs.spawnWalker({ x: b.x + sx, z: b.z + sz, heading: b.heading + Math.PI / 2 }, P);
      n?.say?.(['¡Eh! ¡Mi bote!', '¡Chorro! ¡Devolvé el bote!', '¡Encima con la inundación, guacho!'][(Math.random() * 3) | 0], 3.5);
      world.agua.ripple(b.x + sx, b.z + sz, 1);
      world.audio.chapuzon?.(0.7);
    }
    b.mine = true;
    b.speed = 0;
    P.boat = b;
    P.swimming = P.diving = false;
    P.aiming = false;
    world.hud.flash(rower ? 'BOTE ROBADO' : 'EN BOTE', 'W/S remar · A/D girar · F bajarse. Rescatá a los vecinos varados.', 'ok', 3);
  }
  leave(world) {
    const P = world.player;
    const b = P.boat;
    if (!b) return;
    P.boat = null;
    b.mine = false;
    b.speed = 0;
    // al costado del bote, en el agua
    P.x = b.x + Math.cos(b.heading) * 1.7;
    P.z = b.z - Math.sin(b.heading) * 1.7;
    P.y = world.agua.level;
    P.mvx = P.mvz = 0;
    world.agua.ripple(P.x, P.z, 0.8);
  }
  ride(dt, world) {
    const P = world.player;
    const b = P.boat;
    const { input } = world;
    const ag = world.agua;
    const ax = input.axis();
    const fast = input.down('shift') || input.sprint;
    const throttle = -ax.y;
    b.speed = b.speed ?? 0;
    b.speed += (throttle * (fast ? 2.9 : 1.9) - b.speed) * Math.min(1, dt * 0.7);
    b.heading -= ax.x * dt * 0.95 * (0.35 + Math.min(1, Math.abs(b.speed)));
    const nx = b.x + Math.sin(b.heading) * b.speed * dt;
    const nz = b.z + Math.cos(b.heading) * b.speed * dt;
    // encalla donde hay poca agua; contra las casas rebota
    if (ag.depth(nx, nz) < 0.3) {
      b.speed = 0;
      if (!b.avisoEncalla) world.hud.toast('El bote tocó fondo: dale para atrás o bajate (F)', 2.5);
      b.avisoEncalla = true;
    } else {
      b.avisoEncalla = false;
      const p = { x: nx, z: nz };
      if (world.colliders.resolveCircle(p, 1.15)) b.speed *= -0.25;
      b.x = p.x;
      b.z = p.z;
    }
    // remadas: el ritmo sigue al empuje
    const prev = b.rowT;
    if (Math.abs(throttle) > 0.05) b.rowT += dt * (0.3 + Math.abs(b.speed) * 0.2) * Math.sign(throttle || 1);
    if (Math.floor(prev * 1) !== Math.floor(b.rowT * 1)) world.audio.brazada?.(0.35);
    // Gaspi sentado en el banco del medio, mirando para atrás (como se rema)
    P.x = b.x;
    P.z = b.z;
    P.heading = b.heading + Math.PI;
    P.y = (b.mesh.position.y || ag.level) + 0.12;
    P.speed = 0;
    P.mvx = P.mvz = 0;
    animateHuman(P.h, dt, 0, 'remar', b.rowT);
    // si se vació la calle, se baja solo
    if (ag.depth(b.x, b.z) < 0.15) this.leave(world);
  }

  // ---------- Vecinos varados ----------
  updateVarados(dt, world, wet) {
    const P = world.player;
    const deep = wet && world.agua.streetDepth > 0.6;
    if (deep && this.varados.length < VARADOS && Math.random() < dt * 0.15) this.spawnVarado(world);
    for (const v of this.varados) {
      const car = v.car;
      if (!deep || !car.floating || Math.hypot(car.x - P.x, car.z - P.z) > 160) v.gone = true;
      if (v.gone) continue;
      v.t += dt;
      // parado en el techo del auto que flota, haciendo señas
      v.h.root.position.set(car.x, (car.floatY ?? 0) + (car.tall ?? 1.45), car.z);
      v.h.root.rotation.y = Math.atan2(P.x - car.x, P.z - car.z);
      animateHuman(v.h, dt, 0, 'wave', v.t);
      v.sayT -= dt;
      if (v.sayT <= 0) {
        v.sayT = 3.5 + Math.random() * 3;
        v.bubble = { text: GRITOS[(Math.random() * GRITOS.length) | 0], t: 2.5 };
      }
      if (v.bubble) {
        v.bubble.t -= dt;
        if (v.bubble.t <= 0) v.bubble = null;
      }
      // Gaspi pasa al lado en bote: se sube
      const b = P.boat;
      if (b && Math.hypot(b.x - car.x, b.z - car.z) < 3.4) {
        const seats = [-0.8, 0.85].filter((z) => !b.people.some((p) => Math.abs(p.h.root.position.z - z) < 0.2));
        if (!seats.length) {
          if (!v.lleno) world.hud.toast('No hay más lugar en el bote', 2);
          v.lleno = true;
          continue;
        }
        this.scene.remove(v.h.root);
        v.h.root.position.set(0, 0.12, seats[0]);
        v.h.root.rotation.set(0, 0, 0);
        b.mesh.add(v.h.root);
        b.people.push({ h: v.h, rower: false, ph: Math.random() * 10 });
        v.rescued = true;
        v.gone = true;
        P.addMoney(4000);
        P.addRespeto?.(3);
        world.hud.flash('¡RESCATE!', 'Subiste a un vecino al bote. +$4.000 y respeto.', 'ok', 2.6);
        world.audio.plata?.();
        world.events?.pushNews('Temperley: vecinos rescatados en bote en plena inundación');
      }
    }
    for (const v of this.varados) {
      if (!v.gone || v.rescued) continue;
      this.scene.remove(v.h.root);
      disposeHuman(v.h);
    }
    this.varados = this.varados.filter((v) => !v.gone);
  }
  // (car: arriba de cuál; si no, uno que flote cerca de Gaspi pero no encima)
  spawnVarado(world, car = null) {
    const P = world.player;
    if (!car) {
      const cars = [...world.traffic.parked, ...world.traffic.cars].filter((c) => c.floating && c.kind !== 'moto' && c.kind !== 'bus' && !this.varados.some((v) => v.car === c));
      const ok = cars.filter((c) => {
        const d = Math.hypot(c.x - P.x, c.z - P.z);
        return d > 18 && d < 90;
      });
      if (!ok.length) return;
      car = ok[(Math.random() * ok.length) | 0];
    }
    const h = makeHuman({ ...randomCivilian(), scale: 0.95 + Math.random() * 0.08 });
    this.scene.add(h.root);
    this.varados.push({ h, car, t: Math.random() * 5, sayT: Math.random() * 2, bubble: null });
  }
  // los globitos de los varados (los dibuja el HUD con los demás)
  speakers() {
    return this.varados.filter((v) => v.bubble).map((v) => ({ x: v.car.x, y: v.h.root.position.y + 2.2, z: v.car.z, b: v.bubble, female: v.h.female }));
  }
}
