// Changas de rescate como en Vice City: con la ambulancia llevás heridos al centro de salud y con
// la autobomba apagás autos prendidos fuego. Vehículos del Car Kit de Kenney (CC0). Cada viaje
// seguido paga más (nivel). Se cortan si te bajás o se acaba el tiempo.
import * as THREE from 'three';
import { loadKenney } from './models.js';
import { DATA as D, STATION, nearestStreetName } from './map.js';
import { R } from './rng.js';

const fmt = (n) => `$${Math.round(n).toLocaleString('es-AR')}`;

// centros de salud reales del mapa (Overture)
function hospitals() {
  const out = [];
  for (const b of D.buildings) {
    if (!b.n || !/salud|hospital|cl[ií]nica|m[eé]dic|sanatorio/i.test(b.n) || /veterin/i.test(b.n)) continue;
    let x = 0;
    let z = 0;
    for (const [a, c] of b.r) {
      x += a;
      z += c;
    }
    out.push({ x: x / b.r.length, z: z / b.r.length, name: b.n });
  }
  return out.length ? out : [{ x: STATION.x, z: STATION.z, name: 'la guardia' }];
}

// estaciona un vehículo contra el cordón de la calle (de tránsito) más cercana a p, y saca lo
// que hubiera estacionado ahí
function parkNear(world, mesh, p) {
  const { traffic, scene } = world;
  let best = null;
  for (const e of traffic.graph.edges) {
    if (e.street.w < 6.5 || e.len < 12) continue;
    const t = Math.max(4, Math.min(e.len - 4, (p.x - e.from.x) * e.dx + (p.z - e.from.z) * e.dz));
    const x = e.from.x + e.dx * t;
    const z = e.from.z + e.dz * t;
    const d = Math.hypot(p.x - x, p.z - z);
    if (!best || d < best.d) best = { e, t, d };
  }
  if (!best) return null;
  const { e, t } = best;
  const off = e.street.w / 2 - (mesh.userData.W ?? 2) / 2 - 0.3;
  const v = traffic.addParked(mesh, e.from.x + e.dx * t + e.rx * off, e.from.z + e.dz * t + e.rz * off, Math.atan2(e.dx, e.dz));
  for (const o of traffic.parked.slice()) {
    if (o !== v && Math.hypot(o.x - v.x, o.z - v.z) < 7) {
      scene.remove(o.mesh);
      traffic.parked.splice(traffic.parked.indexOf(o), 1);
    }
  }
  return v;
}

export class Rescue {
  constructor(world) {
    this.w = world;
    this.active = null;
    this.offered = null;
    this.hospitals = hospitals();
    this.init().catch((e) => console.warn('No cargaron la ambulancia o la autobomba', e));
  }

  async init() {
    const w = this.w;
    const h = this.hospitals[0];
    this.ambulance = parkNear(w, await loadKenney('ambulance', { length: 5.6 }), { x: h.x, z: h.z });
    // la autobomba, a una cuadra de la estación
    this.firetruck = parkNear(w, await loadKenney('firetruck', { length: 7.4 }), { x: STATION.x + 70, z: STATION.z + 40 });
  }

  objective() {
    const a = this.active;
    if (!a) return null;
    const s = Math.ceil(a.t);
    if (a.kind === 'ambulance') {
      return a.stage === 'pick' ? { text: `Buscá al herido en ${a.street}: ${s} s`, target: a.n } : { text: `Llevalo a ${a.dest.name}: ${s} s`, target: a.dest };
    }
    return { text: a.spray > 0 ? `Apagando el fuego… ${Math.round((a.spray / 3) * 100)}%` : `Apagá el auto que se quema en ${a.street}: ${s} s`, target: a.car };
  }

  start(kind) {
    const w = this.w;
    const P = w.player;
    if (kind === 'ambulance') {
      // un herido tirado en la vereda
      const n = w.npcs.spawnWalker(null, P, 70, 220);
      if (!n) return;
      Object.assign(n, { mission: true, state: 'ko', koT: -60, hp: 25, vmax: 0 });
      n.say('¡Ayuda! ¡Una ambulancia!', 4);
      this.active = { kind, stage: 'pick', n, t: 70, street: nearestStreetName(n.x, n.z) };
      w.hud.flash('CHANGA DE PARAMÉDICO', `Hay un herido en ${this.active.street}. Andá a buscarlo`, 'ok', 2.8);
    } else {
      const cars = w.traffic.parked.filter((c) => c.kind === 'car' && !c.wreck && c !== this.ambulance && c !== this.firetruck && Math.hypot(c.x - P.x, c.z - P.z) > 80 && Math.hypot(c.x - P.x, c.z - P.z) < 260);
      if (!cars.length) return;
      const car = R.pick(cars);
      car.burning = 9999;
      car.fireJob = true;
      this.active = { kind, car, t: 75, spray: 0, street: nearestStreetName(car.x, car.z) };
      w.hud.flash('CHANGA DE BOMBERO', `Se prende fuego un auto en ${this.active.street}. ¡Rápido!`, 'ok', 2.8);
    }
    w.audio.alerta?.();
  }

  end(msg) {
    this.jetOff();
    const a = this.active;
    if (a?.n && !a.n.dead) a.n.mission = false;
    if (a?.car?.fireJob) {
      // nadie lo apagó: termina explotando
      a.car.fireJob = false;
      a.car.burning = 2;
    }
    this.active = null;
    this.level = 0;
    if (msg) this.w.hud.flash('SE CAYÓ LA CHANGA', msg, 'bad', 2.6);
  }

  pay(text) {
    const w = this.w;
    this.level = (this.level || 0) + 1;
    const pay = 2500 + this.level * 1200;
    w.player.addMoney(pay);
    w.player.addRespeto(1);
    w.audio.cumplida?.();
    w.hud.flash(text, `+${fmt(pay)} · Nivel ${this.level}`, 'ok', 2.6);
    const kind = this.active.kind;
    this.active = null;
    setTimeout(() => w.player.vehicle?.model === kind && !this.active && this.start(kind), 2500);
  }

  update(dt) {
    const w = this.w;
    const v = w.player.vehicle;
    const kind = v?.model;
    if (!this.active) {
      if ((kind === 'ambulance' || kind === 'firetruck') && this.offered !== v && !w.missions.m) {
        this.offered = v;
        this.start(kind);
      }
      if (!v) this.offered = null;
      return;
    }
    const a = this.active;
    if (kind !== a.kind) return this.end(a.kind === 'ambulance' ? 'Te bajaste de la ambulancia' : 'Te bajaste de la autobomba');
    a.t -= dt;
    const slow = Math.abs(v.speed) < 3;
    if (a.kind === 'ambulance') {
      if (a.stage === 'pick') {
        if (a.n.dead || a.n.killed) return this.end('El herido no aguantó');
        if (a.t <= 0) return this.end('Llegaste tarde: se lo llevó otro');
        if (slow && Math.hypot(a.n.x - v.x, a.n.z - v.z) < 7) {
          a.n.dead = true; // sube a la ambulancia
          a.dest = this.hospitals.reduce((b, h) => (Math.hypot(h.x - v.x, h.z - v.z) < Math.hypot(b.x - v.x, b.z - v.z) ? h : b));
          a.stage = 'hosp';
          a.t = Math.round(Math.hypot(a.dest.x - v.x, a.dest.z - v.z) / 9 + 25);
          w.hud.flash('SUBIÓ EL HERIDO', `Llevalo a ${a.dest.name}`, 'ok', 2.4);
        }
      } else {
        if (a.t <= 0) return this.end('El herido no llegó al centro de salud');
        if (slow && Math.hypot(a.dest.x - v.x, a.dest.z - v.z) < 14) this.pay('¡HERIDO A SALVO!');
      }
      return;
    }
    // autobomba: frenar cerca del auto y quedarse rociando unos segundos
    const car = a.car;
    if (car.wreck) return this.end('Explotó antes de que llegaras');
    const d = Math.hypot(car.x - v.x, car.z - v.z);
    if (slow && d < 12) {
      a.spray += dt;
      this.waterJet(w, v, car, dt);
      if (a.spray >= 3) {
        this.jetOff();
        car.burning = 0;
        car.fireJob = false;
        car.damage = Math.min(car.damage || 0, 80);
        this.pay('¡FUEGO APAGADO!');
      }
    } else {
      this.jetOff();
      a.spray = Math.max(0, a.spray - dt);
      if (a.t <= 0) this.end('Se quemó todo: llegaste tarde');
    }
  }

  // Chorro del cañón de agua de la autobomba: un arco de agua (tubo translúcido que se rehace cada
  // cuadro), gotas que caen con la gravedad y vapor donde pega en el auto prendido fuego.
  waterJet(w, v, car, dt) {
    const o = new THREE.Vector3(v.x + v.fx * v.L * 0.18, (v.tall ?? 2.6) + 0.15, v.z + v.fz * v.L * 0.18);
    const e = new THREE.Vector3(car.x, 1.1, car.z);
    const d = o.distanceTo(e);
    // la punta del arco sube según la distancia y tiembla un poco (la presión)
    const mid = o.clone().lerp(e, 0.5);
    mid.y += 1.2 + d * 0.12 + Math.sin(performance.now() * 0.02) * 0.08;
    const curve = new THREE.QuadraticBezierCurve3(o, mid, e);
    if (!this.jet) {
      this.jetMat = new THREE.MeshBasicMaterial({ color: 0xd6ecff, transparent: true, opacity: 0.55, depthWrite: false });
      this.jet = new THREE.Mesh(new THREE.BufferGeometry(), this.jetMat);
      this.jet.frustumCulled = false;
      w.scene.add(this.jet);
    }
    this.jet.geometry.dispose();
    this.jet.geometry = new THREE.TubeGeometry(curve, 18, 0.07, 6, false);
    this.jet.visible = true;
    // gotas que se desprenden del chorro y caen
    const n = Math.min(8, Math.round(dt * 120));
    for (let i = 0; i < n; i++) {
      const t = Math.random();
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      w.fx.alpha.add({ x: p.x, y: p.y, z: p.z, vx: tan.x * 9 + R.range(-0.8, 0.8), vy: tan.y * 9 + R.range(-0.5, 0.5), vz: tan.z * 9 + R.range(-0.8, 0.8), grav: -9.8, drag: 0.4, life: 0, max: R.range(0.4, 0.8), s0: 0.16, s1: 0.32, c0: [0.82, 0.9, 1], a: 0.55, fadeIn: 0.02 });
    }
    // donde pega: salpicadura y vapor (el fuego se va apagando)
    if (Math.random() < dt * 25) w.fx.spray(car.x + R.range(-0.8, 0.8), car.z + R.range(-0.8, 0.8), R.range(-1.5, 1.5), R.range(-1.5, 1.5), 1.6);
    if (Math.random() < dt * 14) w.fx.smoke(car.x + R.range(-0.6, 0.6), 1.4, car.z + R.range(-0.6, 0.6), 1, { s0: 0.6, s1: 2.6, life: 0.9, a: 0.45 });
    this.jetSnd = (this.jetSnd || 0) - dt;
    if (this.jetSnd <= 0) {
      this.jetSnd = 0.18;
      w.audio.burst(0.25, 1800, 'highpass', 0.12, 0, 0.4);
    }
  }
  jetOff() {
    if (this.jet) this.jet.visible = false;
  }
}
