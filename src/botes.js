// Botes de remo con gente: con las calles inundadas pasan vecinos remando (rescatando a alguien, sacando
// cosas de la casa, de paseo) por las calles, doblan en las esquinas y dejan estela. Los botes son del
// Watercraft Kit de Kenney (CC0, public/models/agua/bote-*.glb, con sus remos); la gente es la del juego
// (src/human.js) con la pose de remar.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ROADS, ROAD_NODES, pointAt, project } from './map.js';
import { makeHuman, animateHuman, randomCivilian } from './human.js';
import { disposeHuman } from './people.js';

const MAX = 3;
const SPEED = 1.25;
const DRAFT = 0.14; // cuánto se hunde el casco

export class Botes {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.models = null;
    this.t = 0;
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

  spawn(world) {
    const at = this.pick(world);
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
      h.root.position.set(0, 0.12, rower ? 0.05 : -0.75 + (i - 1) * 0.0 + (i === 2 ? 0.95 : 0));
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
      if (!wet || d > 190) b.gone = true;
      if (b.gone) continue;
      this.advance(b, world, dt);
      this.place(b, world, dt);
      b.mesh.visible = d < 150;
      if (!b.mesh.visible) continue;
      // flota y se mece; con cada remada se adelanta un poco
      b.rowT += dt * 0.55;
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
      if (d < 1.9 && !P.vehicle) {
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
  }
}
