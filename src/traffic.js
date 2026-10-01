// Grafo de calles, autos con IA, colectivos y autos estacionados.
import { ROADS, HALF } from './map.js';
import { makeCar, makeBus, makeMoto, makeTruck, makeCarro, CAR_COLORS } from './vehicles.js';
import { ANIMALS, makeAnimal, animalPlay } from './people.js';
import { repairCar } from './cars.js';
import { makeHuman, animateHuman, randomCivilian } from './human.js';
import { R } from './rng.js';

export class Vehicle {
  constructor(mesh, x, z, heading) {
    this.mesh = mesh;
    const u = mesh.userData;
    this.kind = u.kind;
    this.model = u.model;
    this.tall = u.tall;
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
    const moto = this.kind === 'moto';
    this.mesh.position.set(this.x, (this.flat ? -0.08 : 0) + (this.lift || 0), this.z);
    this.mesh.rotation.y = this.heading;
    if (moto) {
      // inclinación en curvas, willy o tirada en el piso
      this.mesh.rotation.z = this.fallen ? 1.35 : this.lean || 0;
      this.mesh.rotation.x = -(this.wheelie || 0);
      if (this.wheelie) this.mesh.position.y += Math.sin(this.wheelie) * 0.72 - (1 - Math.cos(this.wheelie)) * 0.3;
      if (this.fallen) this.mesh.position.y = 0.15;
    } else this.mesh.rotation.z = this.flat ? 0.04 : 0;
    this.wheelSpin += this.speed * dt * 3;
    const u = this.mesh.userData;
    if (u.wheels) {
      u.wheels.forEach((w, i) => {
        w.rotation.x = this.wheelSpin * (u.spinSign ?? 1);
        if (i < 2 && !moto && this.kind !== 'carro') w.rotation.y = this.steer * 0.5;
      });
    }
    // caballo del carro: cuando cargó el modelo CC0, reemplaza al hecho por código
    if (u.horse && !u.horseAnim && ANIMALS.horse) {
      const a = makeAnimal('horse', { length: 2.7 });
      if (a) {
        a.g.position.copy(u.horse.position);
        a.g.rotation.copy(u.horse.rotation);
        u.horse.parent?.remove(u.horse);
        this.mesh.add(a.g);
        u.horseAnim = a;
        u.legs = null;
      }
    }
    if (u.horseAnim) {
      const sp = Math.abs(this.speed);
      animalPlay(u.horseAnim, sp > 0.3 ? 'walk' : 'idle', sp > 0.3 ? Math.max(0.5, sp / 1.6) : 1);
      u.horseAnim.mixer.update(dt);
    }
    // patas del caballo
    if (u.legs) {
      const k = Math.min(1, Math.abs(this.speed) / 2);
      u.legs.forEach((l, i) => {
        const w = Math.sin(this.wheelSpin * 1.6 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0));
        l.rotation.x = w * 0.45 * k;
        // rodilla (adelante) y garrón (atrás) se doblan al levantar la pata
        if (l.userData.lower) l.userData.lower.rotation.x = (i > 1 ? -1 : 1) * Math.max(0, i > 1 ? w : -w) * 0.9 * k;
      });
    }
  }
}

// ---------- Grafo ----------
// Nodos: extremos de tramo (esquinas) y quiebres intermedios. Aristas rectas entre ellos.
function buildGraph() {
  const nodes = [];
  const byKey = new Map();
  const find = (x, z) => {
    const k = `${Math.round(x * 2) / 2},${Math.round(z * 2) / 2}`;
    if (byKey.has(k)) return byKey.get(k);
    const n = { x, z, out: [], id: nodes.length };
    nodes.push(n);
    byKey.set(k, n);
    return n;
  };
  const edges = [];
  for (const r of ROADS) {
    const lane = Math.max(1.2, Math.min(3.4, r.w * 0.2));
    const pts = r.pts;
    if (pts.length < 2) continue;
    const ids = pts.map(([x, z], i) => (i === 0 || i === pts.length - 1 ? find(x, z) : { x, z, out: [], id: nodes.push(null) - 1 }));
    ids.forEach((n) => {
      if (!nodes[n.id]) nodes[n.id] = n;
    });
    for (let i = 0; i < ids.length - 1; i++) {
      const A = ids[i];
      const B = ids[i + 1];
      for (const [from, to] of [
        [A, B],
        [B, A],
      ]) {
        const len = Math.hypot(to.x - from.x, to.z - from.z);
        if (len < 0.05) continue;
        const dx = (to.x - from.x) / len;
        const dz = (to.z - from.z) / len;
        const e = { from, to, street: r, dx, dz, rx: -dz, rz: dx, len, lane };
        from.out.push(e);
        edges.push(e);
      }
    }
  }
  for (const e of edges) e.rev = e.to.out.find((o) => o.to === e.from);
  for (const n of nodes) n.deg = n.out.length;
  return { nodes: nodes.filter(Boolean), edges };
}

export class Traffic {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.graph = buildGraph();
    this.cars = [];
    this.parked = [];
  }

  // un auto del parque automotor del conurbano
  randomCar() {
    const model = R.pick(['duna', 'duna', 'gol', 'gol', 'gol', 'falcon', 'p504', 'p504', 'fiat600', 'pickup', 'pickup', 'remis', 'taxi', 'trafic', 'trafic']);
    return makeCar(model, R.pick(CAR_COLORS));
  }
  randomMoto() {
    const delivery = R.chance(0.45);
    const box = delivery ? R.pick([0xe53935, 0xff6f00, 0x00a650, 0xffc400]) : null;
    const mesh = makeMoto(R.pick([0x1c1c1c, 0xb71c1c, 0x0d47a1, 0x333333, 0xe0e0e0, 0x1b5e20]), { box });
    const c = randomCivilian();
    const look = { ...c, helmet: R.chance(0.7) ? R.pick([0x111111, 0xc62828, 0xf5f5f5, 0x1565c0]) : null, jacket: box ?? (R.chance(0.4) ? 0x222222 : null), shirt: box ?? c.shirt, longSleeves: true };
    const rider = makeHuman(look);
    animateHuman(rider, 0, 0, 'ride');
    rider.root.position.set(0, 0.36, -0.12);
    mesh.add(rider.root);
    return { mesh, rider, look };
  }

  populate(city, player, n = 34, buses = 5) {
    const edges = this.graph.edges.filter((e) => e.len > 25 && e.street.w >= 7);
    this.spawnEdges = edges;
    for (let i = 0; i < n + buses; i++) {
      const isBus = i >= n;
      let mesh;
      if (isBus) mesh = makeBus([160, 74, 548, 549, 318][i - n]);
      else if (i < 2) mesh = makeTruck(R.pick([0xe8e8e8, 0xc62828, 0x1565c0]), R.pick(['FLETES TEMPERLEY', 'DISTRIBUIDORA SUR', 'MUDANZAS LOMAS']));
      else if (i === 5 || i === 21) mesh = makeCar('patrullero'); // la cana también anda dando vueltas
      else mesh = this.randomCar();
      const pool = isBus ? edges.filter((e) => e.street.avenue) : edges;
      const e = R.pick(pool.length ? pool : edges);
      this.spawnOn(mesh, e, R.range(Math.min(5, e.len / 3), e.len * 0.7));
    }
    // muchas motos: delivery, laburantes, pibes
    for (let i = 0; i < 20; i++) {
      const m = this.randomMoto();
      const e = R.pick(edges);
      const v = this.spawnOn(m.mesh, e, R.range(3, e.len * 0.8));
      v.rider = m.rider;
      v.riderLook = m.look;
      v.ai.vmax = R.range(11, 15);
    }
    // el carro del cartonero, por las calles de barrio
    const small = this.graph.edges.filter((e) => e.len > 25 && e.street.w >= 6 && !e.street.avenue);
    for (let i = 0; i < 2 && small.length; i++) {
      const d = makeHuman({ ...randomCivilian(), cap: R.chance(0.6) ? 0x6d4c41 : null, longSleeves: true });
      animateHuman(d, 0, 0, 'sit');
      const v = this.spawnOn(makeCarro(d), R.pick(small), 5);
      v.ai.vmax = R.range(2.6, 3.4);
      v.rider = null;
    }
    // autos estacionados en cordones reales (más cerca de la estación)
    const used = [];
    const spots = city.parking.concat(city.curbSpots.filter(() => R.chance(0.05)));
    for (const c of spots) {
      if (used.some((u) => Math.hypot(u.x - c.x, u.z - c.z) < 6)) continue;
      used.push(c);
      this.addParked(makeCar(R.pick(['duna', 'falcon', 'gol', 'pickup', 'gol']), R.pick(CAR_COLORS)), c.x, c.z, c.heading);
      if (used.length > 110) break;
    }
  }

  addParked(mesh, x, z, heading) {
    const v = new Vehicle(mesh, x, z, heading);
    v.parked = true;
    this.scene.add(mesh);
    this.parked.push(v);
    return v;
  }

  spawnOn(mesh, e, at) {
    const lane = e.lane + (mesh.userData.kind === 'moto' ? 0.7 : mesh.userData.kind === 'carro' ? 1.2 : 0);
    const x = e.from.x + e.dx * at + e.rx * lane;
    const z = e.from.z + e.dz * at + e.rz * lane;
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
    const extra = v.kind === 'moto' ? 0.7 : v.kind === 'carro' ? 1.2 : 0;
    if (a.stage === 'run') {
      const k = e.to.deg > 2 ? Math.min(7, e.len * 0.35) : Math.min(1.5, e.len * 0.3);
      a.tx = e.to.x - e.dx * k + e.rx * (e.lane + extra);
      a.tz = e.to.z - e.dz * k + e.rz * (e.lane + extra);
    } else {
      const n = a.next;
      const k = n.from.deg > 2 ? Math.min(7, n.len * 0.35) : Math.min(1.5, n.len * 0.3);
      a.tx = n.from.x + n.dx * k + n.rx * (n.lane + extra);
      a.tz = n.from.z + n.dz * k + n.rz * (n.lane + extra);
    }
  }

  pickNext(e, v) {
    const opts = e.to.out.filter((o) => o !== e.rev);
    if (!opts.length) return e.rev;
    // los que pasean por un lugar (la Ferrari de Laban) no se alejan: eligen calles que vuelven
    if (v?.home) {
      const d = (o) => Math.hypot(o.to.x - v.home.x, o.to.z - v.home.z);
      const near = opts.filter((o) => d(o) < v.homeR && o.street.w >= 6);
      if (near.length) return R.pick(near);
      return opts.reduce((a, b) => (d(a) < d(b) ? a : b));
    }
    // preferir seguir derecho
    // preferir seguir por la misma calle o la más derecha
    const straight = opts.reduce((best, o) => (o.dx * e.dx + o.dz * e.dz > (best ? best.dx * e.dx + best.dz * e.dz : -2) ? o : best), null);
    if (straight && straight.dx * e.dx + straight.dz * e.dz > 0.7 && R.chance(0.6)) return straight;
    // evitar calles de servicio y pasillos
    const good = opts.filter((o) => o.street.w >= 6.5);
    if (good.length) return R.pick(good);
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
  motos() {
    return this.cars.filter((v) => v.kind === 'moto');
  }

  // Sacar al que maneja un auto: cae al piso y después se enoja o se raja
  ejectDriver(v, world) {
    if (v.laban) return v.laban.eject(v, world);
    const lx = -Math.cos(v.heading);
    const lz = Math.sin(v.heading);
    const d = world.npcs.spawnWalker({ x: v.x + lx * (v.W / 2 + 1.3), z: v.z + lz * (v.W / 2 + 1.3), heading: v.heading + Math.PI / 2 });
    if (!d) return;
    world.npcs.hurt(d, 5, lx, lz, { knock: true, knockT: 1.4, world });
    d.after = R.chance(d.brave) ? 'fight' : 'flee';
    d.say(R.pick(['¡Eh! ¡Chorro! ¡Devolveme el auto!', '¡Mi auto! ¡Mi auto!', '¡Me lo robaron! ¡Policía!']), 3);
    world.audio.alerta();
  }
  // El de la moto sale volando (golpe, tiro o empujón)
  ejectRider(v, world, fx = 0, fz = 0) {
    if (!v.rider) return;
    v.mesh.remove(v.rider.root);
    v.rider = null;
    const d = world.npcs.spawnWalker({ x: v.x + fx * 1.5, z: v.z + fz * 1.5, heading: v.heading }, null, 0, 0, v.riderLook);
    if (d) {
      world.npcs.hurt(d, 10, fx, fz, { knock: true, knockT: 2, world });
      d.after = R.chance(0.5) ? 'fight' : 'flee';
    }
    if (v.ai) {
      this.release(v);
      v.parked = true;
      this.parked.push(v);
    }
    v.fallen = true;
    v.speed = 0;
    v.sync(0);
  }

  // los autos que quedan lejos reaparecen cerca de Gaspi (así siempre hay tránsito)
  recycle(v, player) {
    if (v.keep) return false;
    const d = Math.hypot(v.x - player.x, v.z - player.z);
    if (d < 260) return false;
    const cand = this.spawnEdges.filter((e) => {
      const m = Math.hypot(e.from.x + e.dx * e.len * 0.5 - player.x, e.from.z + e.dz * e.len * 0.5 - player.z);
      return m > 110 && m < 230 && (v.kind !== 'bus' || e.street.avenue);
    });
    if (!cand.length) return false;
    const e = R.pick(cand);
    const lane = e.lane + (v.kind === 'moto' ? 0.7 : 0);
    const at = R.range(3, e.len - 3);
    const x = e.from.x + e.dx * at + e.rx * lane;
    const z = e.from.z + e.dz * at + e.rz * lane;
    // que no aparezca encima de otro
    if (this.cars.some((o) => o !== v && Math.abs(o.x - x) < 8 && Math.abs(o.z - z) < 8)) return false;
    v.x = x;
    v.z = z;
    v.heading = Math.atan2(e.dx, e.dz);
    // vuelve como un auto nuevo
    if (v.damage) {
      v.damage = 0;
      repairCar(v);
    }
    v.ai.edge = e;
    v.ai.stage = 'run';
    v.ai.stuck = 0;
    v.speed = v.ai.vmax * 0.5;
    this.setTarget(v);
    return true;
  }

  update(dt, world) {
    const { player, events, trains, npcs } = world;
    const pv = player.vehicle;
    // lo que queda detrás de la niebla no se dibuja
    for (const v of this.parked) v.mesh.visible = Math.abs(v.x - player.x) < 240 && Math.abs(v.z - player.z) < 240;
    for (const v of this.cars) v.mesh.visible = Math.abs(v.x - player.x) < 280 && Math.abs(v.z - player.z) < 280;
    this.recycleI = ((this.recycleI || 0) + 1) % 30;
    for (let i = this.recycleI; i < this.cars.length; i += 30) this.recycle(this.cars[i], player);
    const police = world.police?.cars || [];
    // grillas de obstáculos (vehículos y peatones) para no comparar todos contra todos
    const CELL = 24;
    const cell = (x, z) => (Math.floor(x / CELL) + 200) * 1000 + Math.floor(z / CELL) + 200;
    const vgrid = new Map();
    const pgrid = new Map();
    const put = (g, o) => {
      const k = cell(o.x, o.z);
      let l = g.get(k);
      if (!l) g.set(k, (l = []));
      l.push(o);
    };
    for (const o of this.cars) put(vgrid, o);
    for (const o of this.parked) put(vgrid, o);
    for (const o of police) put(vgrid, o);
    if (pv) put(vgrid, pv);
    for (const p of npcs.walkers()) put(pgrid, p);
    if (!pv) put(pgrid, player);
    const buf = [];
    const near = (g, x, z) => {
      buf.length = 0;
      const i0 = Math.floor(x / CELL) + 200;
      const j0 = Math.floor(z / CELL) + 200;
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          const l = g.get((i0 + a) * 1000 + j0 + b);
          if (l) for (const o of l) buf.push(o);
        }
      }
      return buf;
    };
    for (const v of this.cars) {
      const a = v.ai;
      // alguien lo está robando: frena
      if (a.hold) {
        v.speed = Math.max(0, v.speed - 12 * dt);
        v.x += v.fx * v.speed * dt;
        v.z += v.fz * v.speed * dt;
        v.sync(dt);
        continue;
      }
      a.panic = Math.max(0, (a.panic || 0) - dt);
      const dx = a.tx - v.x;
      const dz = a.tz - v.z;
      const dist = Math.hypot(dx, dz);
      if (dist < (a.stage === 'run' && a.edge.to.deg <= 2 ? 1.6 : 3.5)) {
        if (a.stage === 'run') {
          a.next = this.pickNext(a.edge, v);
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
      let target = a.vmax * (v.flat ? 0.4 : 1) * (a.panic > 0 ? 1.6 : 1) * (world.weather?.slick ? 0.85 : 1);
      if (a.stage === 'turn' && a.next && a.next.from.deg > 2) target = Math.min(target, 5.5);
      if (Math.abs(diff) > 0.6) target = Math.min(target, 4);
      const fx = v.fx;
      const fz = v.fz;
      // el colectivo frena en las paradas (las del mapa real) a subir y bajar gente
      if (v.kind === 'bus' && this.busStops) {
        if (a.stopWait > 0) {
          a.stopWait -= dt;
          target = 0;
        } else {
          for (const s of this.busStops) {
            if (s === a.lastStop) continue;
            const ox = s.x - v.x;
            const oz = s.z - v.z;
            const ahead = ox * fx + oz * fz;
            if (ahead < -1 || ahead > 20) continue;
            if (Math.abs(ox * fz - oz * fx) > s.w / 2 + 1.5) continue;
            if (ahead < 1.6 && Math.abs(v.speed) < 1) {
              a.stopWait = R.range(5, 8);
              a.lastStop = s;
              target = 0;
            } else target = Math.min(target, Math.sqrt(2 * 2.2 * Math.max(0, ahead - 0.6)) + 0.3);
            break;
          }
        }
      }
      let block = Infinity;
      let reason = null;
      // otros vehículos
      a.ghost = Math.max(0, (a.ghost || 0) - dt);
      for (const o of near(vgrid, v.x + fx * 11, v.z + fz * 11)) {
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
      for (const p of near(pgrid, v.x + fx * 6, v.z + fz * 6)) {
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
      const lt = a.panic > 0 ? null : world.lights?.stopAhead(v, a);
      if (lt != null && lt < block) {
        block = lt;
        reason = 'semaforo';
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
        const e = R.pick(this.spawnEdges);
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
