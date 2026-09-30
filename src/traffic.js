// Grafo de calles, autos con IA, colectivos y autos estacionados.
import { STREETS, HALF } from './map.js';
import { makeCar, makeBus, CAR_COLORS } from './vehicles.js';
import { R } from './rng.js';

export class Vehicle {
  constructor(mesh, x, z, heading) {
    this.mesh = mesh;
    const u = mesh.userData;
    this.kind = u.kind;
    this.L = u.L;
    this.W = u.W;
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.damage = 0;
    this.flat = false;
    this.ai = null;
    this.driver = null;
    this.wheelSpin = 0;
    this.honkT = 0;
    this.sync(0);
  }
  get fx() {
    return Math.sin(this.heading);
  }
  get fz() {
    return Math.cos(this.heading);
  }
  circles() {
    const r = this.W / 2 + 0.1;
    const k = Math.max(0, this.L / 2 - r);
    const n = Math.max(2, Math.ceil(this.L / (r * 2)));
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : -k + (2 * k * i) / (n - 1);
      out.push({ x: this.x + this.fx * t, z: this.z + this.fz * t, r });
    }
    return out;
  }
  sync(dt) {
    this.mesh.position.set(this.x, this.flat ? -0.08 : 0, this.z);
    this.mesh.rotation.y = this.heading;
    this.mesh.rotation.z = this.flat ? 0.04 : 0;
    this.wheelSpin += this.speed * dt * 3;
    const wh = this.mesh.userData.wheels;
    if (wh) wh.forEach((w, i) => {
      w.rotation.x = this.wheelSpin;
      if (i < 2 && this.kind !== 'moto') w.rotation.y = this.steer * 0.5;
    });
  }
}

// ---------- Grafo ----------
function buildGraph() {
  const nodes = [];
  const find = (x, z) => {
    for (const n of nodes) if (Math.abs(n.x - x) < 0.5 && Math.abs(n.z - z) < 0.5) return n;
    const n = { x, z, out: [], id: nodes.length };
    nodes.push(n);
    return n;
  };
  const edges = [];
  for (const s of STREETS) {
    const stops = new Set([s.a, s.b]);
    for (const o of STREETS) {
      if (o.axis === s.axis) continue;
      if (o.c >= s.a - 0.5 && o.c <= s.b + 0.5 && s.c >= o.a - 0.5 && s.c <= o.b + 0.5) stops.add(o.c);
    }
    const list = [...stops].sort((a, b) => a - b);
    const lane = s.avenue ? 2.7 : 1.5;
    for (let i = 0; i < list.length - 1; i++) {
      const p = s.axis === 'ns' ? [s.c, list[i]] : [list[i], s.c];
      const q = s.axis === 'ns' ? [s.c, list[i + 1]] : [list[i + 1], s.c];
      const A = find(p[0], p[1]);
      const B = find(q[0], q[1]);
      for (const [from, to] of [
        [A, B],
        [B, A],
      ]) {
        const len = Math.hypot(to.x - from.x, to.z - from.z);
        const dx = (to.x - from.x) / len;
        const dz = (to.z - from.z) / len;
        const e = { from, to, street: s, dx, dz, rx: -dz, rz: dx, len, lane };
        from.out.push(e);
        edges.push(e);
      }
    }
  }
  for (const e of edges) e.rev = e.to.out.find((o) => o.to === e.from);
  return { nodes, edges };
}

export class Traffic {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.graph = buildGraph();
    this.cars = [];
    this.parked = [];
  }

  populate(city, player, n = 26, buses = 3) {
    const edges = this.graph.edges.filter((e) => e.len > 40);
    for (let i = 0; i < n + buses; i++) {
      const isBus = i >= n;
      const mesh = isBus ? makeBus([160, 266, 318][i - n]) : makeCar(R.pick(['duna', 'duna', 'falcon', 'gol', 'gol', 'pickup', 'remis', i === 3 ? 'patrullero' : 'duna']), R.pick(CAR_COLORS));
      const e = R.pick(edges);
      this.spawnOn(mesh, e, R.range(10, e.len - 20));
    }
    // autos estacionados junto al cordón y en el estacionamiento de la estación
    for (let i = 0; i < 70; i++) {
      const s = R.pick(STREETS);
      const side = R.chance(0.5) ? 1 : -1;
      const off = s.w / 2 - 1.15;
      const along = R.range(s.a + 12, s.b - 12);
      if (STREETS.some((o) => o.axis !== s.axis && Math.abs(o.c - along) < o.w / 2 + 7)) continue;
      const x = s.axis === 'ns' ? s.c + side * off : along;
      const z = s.axis === 'ns' ? along : s.c + side * off;
      if (this.parked.some((p) => Math.hypot(p.x - x, p.z - z) < 6)) continue;
      const heading = s.axis === 'ns' ? (side > 0 ? Math.PI : 0) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.addParked(makeCar(R.pick(['duna', 'falcon', 'gol', 'pickup']), R.pick(CAR_COLORS)), x, z, heading);
    }
    for (const p of city.parking) if (R.chance(0.55)) this.addParked(makeCar(R.pick(['duna', 'gol', 'falcon']), R.pick(CAR_COLORS)), p.x, p.z, p.heading);
  }

  addParked(mesh, x, z, heading) {
    const v = new Vehicle(mesh, x, z, heading);
    v.parked = true;
    this.scene.add(mesh);
    this.parked.push(v);
    return v;
  }

  spawnOn(mesh, e, at) {
    const x = e.from.x + e.dx * at + e.rx * e.lane;
    const z = e.from.z + e.dz * at + e.rz * e.lane;
    const v = new Vehicle(mesh, x, z, Math.atan2(e.dx, e.dz));
    v.ai = { edge: e, stage: 'run', wait: 0, stuck: 0, vmax: v.kind === 'bus' ? 8.5 : R.range(9, 12.5) };
    this.setTarget(v);
    v.speed = v.ai.vmax * 0.6;
    this.scene.add(mesh);
    this.cars.push(v);
    return v;
  }

  setTarget(v) {
    const a = v.ai;
    const e = a.edge;
    if (a.stage === 'run') {
      a.tx = e.to.x - e.dx * 7 + e.rx * e.lane;
      a.tz = e.to.z - e.dz * 7 + e.rz * e.lane;
    } else {
      const n = a.next;
      a.tx = n.from.x + n.dx * 7 + n.rx * n.lane;
      a.tz = n.from.z + n.dz * 7 + n.rz * n.lane;
    }
  }

  pickNext(e) {
    const opts = e.to.out.filter((o) => o !== e.rev);
    if (!opts.length) return e.rev;
    // preferir seguir derecho
    const straight = opts.find((o) => Math.abs(o.dx - e.dx) < 0.01 && Math.abs(o.dz - e.dz) < 0.01);
    if (straight && R.chance(0.55)) return straight;
    return R.pick(opts);
  }

  // Quita un auto del tránsito (Gaspi se lo lleva).
  release(v) {
    this.cars = this.cars.filter((c) => c !== v);
    this.parked = this.parked.filter((c) => c !== v);
    v.ai = null;
    v.parked = false;
  }

  all() {
    return this.cars.concat(this.parked);
  }

  update(dt, world) {
    const { player, events, trains, npcs } = world;
    const pv = player.vehicle;
    // lo que queda detrás de la niebla no se dibuja
    for (const v of this.parked) v.mesh.visible = Math.abs(v.x - player.x) < 240 && Math.abs(v.z - player.z) < 240;
    for (const v of this.cars) v.mesh.visible = Math.abs(v.x - player.x) < 280 && Math.abs(v.z - player.z) < 280;
    for (const v of this.cars) {
      const a = v.ai;
      const dx = a.tx - v.x;
      const dz = a.tz - v.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 3.5) {
        if (a.stage === 'run') {
          a.next = this.pickNext(a.edge);
          a.stage = 'turn';
        } else {
          a.edge = a.next;
          a.stage = 'run';
        }
        this.setTarget(v);
      }
      // dirección
      const want = Math.atan2(a.tx - v.x, a.tz - v.z);
      let diff = want - v.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turnRate = 1.6;
      v.steer = Math.max(-1, Math.min(1, diff * 2));
      v.heading += Math.max(-turnRate * dt, Math.min(turnRate * dt, diff)) * Math.min(1, v.speed / 3 + 0.3);

      // velocidad objetivo
      let target = a.vmax * (v.flat ? 0.4 : 1);
      if (a.stage === 'turn') target = Math.min(target, 5.5);
      if (Math.abs(diff) > 0.6) target = Math.min(target, 4);
      const fx = v.fx;
      const fz = v.fz;
      let block = Infinity;
      let reason = null;
      // otros vehículos
      const others = this.cars.concat(this.parked);
      if (pv) others.push(pv);
      a.ghost = Math.max(0, (a.ghost || 0) - dt);
      for (const o of others) {
        if (o === v) continue;
        // destrabar cruces: por un rato ignora a los otros autos de la IA
        if (a.ghost > 0 && o.ai) continue;
        const ox = o.x - v.x;
        const oz = o.z - v.z;
        const ahead = ox * fx + oz * fz;
        if (ahead <= 0 || ahead > 22) continue;
        const lat = Math.abs(ox * fz - oz * fx);
        if (lat < (o.W + v.W) / 2 + 0.05) {
          const d = ahead - (o.L + v.L) / 2;
          if (d < block) {
            block = d;
            reason = o === pv ? 'player' : 'car';
          }
        }
      }
      // peatones (incluido Gaspi a pie)
      const peds = npcs.walkers();
      if (!pv) peds.push(player);
      for (const p of peds) {
        const ox = p.x - v.x;
        const oz = p.z - v.z;
        const ahead = ox * fx + oz * fz;
        if (ahead <= 0 || ahead > 12) continue;
        if (Math.abs(ox * fz - oz * fx) < v.W / 2 + 0.9) {
          const d = ahead - v.L / 2 - 0.5;
          if (d < block) {
            block = d;
            reason = p === player ? 'player' : 'ped';
          }
        }
      }
      // cortes, marchas y barreras
      const ev = events.blockAhead(v.x, v.z, fx, fz, 26);
      if (ev !== null && ev - v.L / 2 < block) {
        block = ev - v.L / 2;
        reason = 'corte';
      }
      const bar = trains.barrierAhead(v.x + fx * v.L * 0.5, v.z + fz * v.L * 0.5, fx, fz, 20);
      if (bar !== null && bar < block) {
        block = bar;
        reason = 'barrera';
      }
      if (block < Infinity) target = Math.min(target, Math.max(0, (block - 2.5) * 1.3));
      a.reason = block < 10 ? reason : null;

      const acc = target > v.speed ? 3 : 9;
      v.speed += Math.sign(target - v.speed) * Math.min(Math.abs(target - v.speed), acc * dt);
      v.x += fx * v.speed * dt;
      v.z += fz * v.speed * dt;

      // bocinazos y paciencia
      if (v.speed < 0.4 && block < 10) {
        a.wait += dt;
        v.honkT -= dt;
        if ((reason === 'corte' || reason === 'player') && a.wait > 2 && v.honkT <= 0) {
          const d = Math.hypot(player.x - v.x, player.z - v.z);
          if (d < 90) this.audio.bocina((1 - d / 90) * 0.8);
          v.honkT = R.range(1.5, 5);
        }
        if (reason === 'car' && a.wait > 6) {
          a.ghost = 2.5;
          a.wait = 0;
        }
        if (reason === 'corte' && a.wait > 10) {
          // se cansa y pega la vuelta
          a.edge = a.edge.rev;
          a.stage = 'run';
          a.wait = 0;
          this.setTarget(v);
        }
      } else a.wait = 0;

      // si queda trabado lejos del jugador, reaparece en otro lado
      if (v.speed < 0.2) a.stuck += dt;
      else a.stuck = 0;
      if (a.stuck > 35 && Math.hypot(player.x - v.x, player.z - v.z) > 120) {
        const e = R.pick(this.graph.edges.filter((e) => e.len > 40));
        v.x = e.from.x + e.dx * 20 + e.rx * e.lane;
        v.z = e.from.z + e.dz * 20 + e.rz * e.lane;
        v.heading = Math.atan2(e.dx, e.dz);
        a.edge = e;
        a.stage = 'run';
        a.stuck = 0;
        this.setTarget(v);
      }
      v.x = Math.max(-HALF + 2, Math.min(HALF - 2, v.x));
      v.z = Math.max(-HALF + 2, Math.min(HALF - 2, v.z));
      v.sync(dt);
    }
  }
}
