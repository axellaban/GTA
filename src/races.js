// Picadas: carreras callejeras contra autos del barrio por las avenidas, como las carreras de GTA.
// Hay una largada marcada en una avenida; si llegás en auto, te ofrecen correr. Se larga con cuenta
// regresiva, hay que pasar por los aros rojos en orden y el que llega primero cobra (de noche, más).
import * as THREE from 'three';
import { makeCar } from './vehicles.js';
import { Vehicle } from './traffic.js';
import { R } from './rng.js';

const MODELS = ['falcon', 'p504', 'gol', 'duna', 'fiat600'];
const COLORS = [0x111111, 0xf2f2f2, 0xc62828, 0x1565c0, 0xf9a825, 0x2e7d32];

function ringMesh(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 3.2, 32, 1, true), mat);
  tube.position.y = 1.6;
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.6, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
  ring.position.y = 0.08;
  g.add(tube, ring);
  g.userData.tube = tube;
  return g;
}

export class Races {
  constructor(scene, traffic, nav, colliders) {
    this.scene = scene;
    this.traffic = traffic;
    this.nav = nav;
    this.colliders = colliders;
    this.race = null;
    this.cool = 0;
    this.t = 0;
    // largada: un tramo largo de avenida
    const e = traffic.graph.edges.filter((x) => x.street.avenue && x.len > 40).sort((a, b) => b.len - a.len)[0] ?? traffic.graph.edges[0];
    this.start = { x: e.from.x + e.dx * 12 + e.rx * e.lane, z: e.from.z + e.dz * 12 + e.rz * e.lane, heading: Math.atan2(e.dx, e.dz), edge: e };
    this.marker = ringMesh(0xff3355);
    this.marker.position.set(this.start.x, 0.02, this.start.z);
    scene.add(this.marker);
    this.cp = ringMesh(0xff3355);
    this.cp.visible = false;
    scene.add(this.cp);
    this.flag = ringMesh(0xffffff);
    this.flag.visible = false;
    scene.add(this.flag);
  }

  markers() {
    if (this.race) return this.race.state === 'run' || this.race.state === 'count' ? [{ x: this.race.cps[this.race.next].x, z: this.race.cps[this.race.next].z }] : [];
    return [{ x: this.start.x, z: this.start.z }];
  }

  // recorrido: desde la largada hasta una esquina lejana, por las calles anchas
  route() {
    const s = this.start;
    const a = s.edge.to; // la esquina de adelante
    const far = this.traffic.graph.nodes.filter((n) => {
      const d = Math.hypot(n.x - s.x, n.z - s.z);
      return d > 420 && d < 560 && n.out.some((e) => e.street.w >= 9);
    });
    for (let k = 0; k < 8 && far.length; k++) {
      const b = R.pick(far);
      const path = this.nav.path(a, b);
      if (!path || path.length < 3) continue;
      const pts = [{ x: s.x, z: s.z }, { x: a.x, z: a.z }, ...path.map((e) => ({ x: e.to.x, z: e.to.z }))];
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
      if (cum.at(-1) < 450) continue;
      // un aro cada ~120 m (siempre en una esquina del recorrido) y el último es la llegada
      const cps = [];
      let last = 0;
      for (let i = 2; i < pts.length; i++) {
        if (cum[i] - last > 110 || i === pts.length - 1) {
          cps.push({ ...pts[i], s: cum[i] });
          last = cum[i];
        }
      }
      return { pts, cum, cps };
    }
    return null;
  }

  // la acción de E (en auto, frenado en la largada)
  action(world) {
    const P = world.player;
    const v = P.vehicle;
    if (this.race || this.cool > 0 || !v || v.kind === 'bus' || v.kind === 'carro' || world.missions?.m) return null;
    if (Math.hypot(v.x - this.start.x, v.z - this.start.z) > 6 || Math.abs(v.speed) > 3) return null;
    const night = world.time.night;
    const prize = night ? 8000 : 5000;
    return {
      text: `Correr una picada ($${prize.toLocaleString('es-AR')} al ganador)`,
      run: () => this.begin(world, prize),
    };
  }

  begin(world, prize) {
    const route = this.route();
    const { hud, player: P } = world;
    if (!route) {
      hud.toast('Hoy no hay picada: volvé más tarde', 2);
      return;
    }
    const s = this.start;
    const fx = Math.sin(s.heading);
    const fz = Math.cos(s.heading);
    const rx = -fz;
    const rz = fx;
    // grilla de largada: tres rivales al lado y atrás de Gaspi
    const v = P.vehicle;
    v.x = s.x;
    v.z = s.z;
    v.heading = s.heading;
    v.vx = v.vz = 0;
    v.speed = 0;
    const racers = [];
    for (const [side, back] of [
      [1, 0],
      [0, -7],
      [1, -7],
    ]) {
      const mesh = makeCar(R.pick(MODELS), R.pick(COLORS));
      const rv = new Vehicle(mesh, s.x + rx * side * 3.2 - fx * back * -1, s.z + rz * side * 3.2 - fz * back * -1, s.heading);
      rv.racer = true;
      rv.keep = true;
      rv.parked = true;
      this.scene.add(mesh);
      this.traffic.parked.push(rv);
      racers.push({ v: rv, i: 1, lane: (side - 0.5) * 1.6, vmax: R.range(24, 28), done: false, prog: 0 });
    }
    this.race = { ...route, racers, state: 'count', t: 3.5, next: 0, prize, start: { x: s.x, z: s.z, h: s.heading }, place: 1, finished: 0 };
    this.marker.visible = false;
    hud.flash('PICADA EN LA AVENIDA', 'Pasá por los aros rojos. El primero que llega cobra', 'warn', 2.4);
  }

  // avanza un auto rival hacia el próximo punto del recorrido
  drive(r, dt, world) {
    const race = this.race;
    const v = r.v;
    const pts = race.pts;
    let tgt = pts[Math.min(r.i, pts.length - 1)];
    if (Math.hypot(tgt.x - v.x, tgt.z - v.z) < 7 && r.i < pts.length - 1) {
      r.i++;
      tgt = pts[r.i];
    }
    // un poco corrido al costado, para que no vayan en fila india
    const prev = pts[Math.max(0, r.i - 1)];
    const sx = tgt.x - prev.x;
    const sz = tgt.z - prev.z;
    const sl = Math.hypot(sx, sz) || 1;
    const tx = tgt.x - (sz / sl) * r.lane;
    const tz = tgt.z + (sx / sl) * r.lane;
    let diff = Math.atan2(tx - v.x, tz - v.z) - v.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    v.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff)) * Math.min(1, Math.abs(v.speed) / 5 + 0.3);
    // frena antes de las esquinas cerradas
    let vmax = r.vmax;
    const nxt = pts[Math.min(r.i + 1, pts.length - 1)];
    const ang = Math.abs(Math.atan2(nxt.x - tgt.x, nxt.z - tgt.z) - Math.atan2(sx, sz));
    const turn = Math.min(ang, Math.PI * 2 - ang);
    const dTurn = Math.hypot(tgt.x - v.x, tgt.z - v.z);
    if (turn > 0.5 && dTurn < 30) vmax = Math.min(vmax, 11 + dTurn * 0.4);
    if (Math.abs(diff) > 0.5) vmax = Math.min(vmax, 10);
    // si Gaspi quedó muy atrás, aflojan un poco (y si va adelante, aprietan)
    const gap = r.prog - race.playerProg;
    vmax *= gap > 120 ? 0.85 : gap < -60 ? 1.12 : 1;
    v.speed += Math.sign(vmax - v.speed) * Math.min(Math.abs(vmax - v.speed), (vmax > v.speed ? 7 : 14) * dt);
    // si quedó trabado contra una esquina, se destraba solo
    r.stuck = Math.abs(v.speed) < 2 ? (r.stuck || 0) + dt : 0;
    if (r.stuck > 2.5) {
      r.stuck = 0;
      v.heading = Math.atan2(tx - v.x, tz - v.z);
      v.x += Math.sin(v.heading) * 2.5;
      v.z += Math.cos(v.heading) * 2.5;
    }
    v.x += v.fx * v.speed * dt;
    v.z += v.fz * v.speed * dt;
    for (const c of v.circles()) {
      const p = { x: c.x, z: c.z };
      if (this.colliders.resolveCircle(p, c.r)) {
        v.x += p.x - c.x;
        v.z += p.z - c.z;
        v.speed *= 0.9;
      }
    }
    v.sync(dt);
    r.prog = race.cum[Math.max(0, r.i - 1)] + Math.max(0, sl - Math.hypot(tgt.x - v.x, tgt.z - v.z));
  }

  // cuánto avanzó Gaspi sobre el recorrido (proyección cerca de donde estaba)
  progress(x, z) {
    const race = this.race;
    let best = race.playerProg ?? 0;
    let bd = Infinity;
    for (let i = 1; i < race.pts.length; i++) {
      const a = race.pts[i - 1];
      const b = race.pts[i];
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const l2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2));
      const d = Math.hypot(x - (a.x + ex * t), z - (a.z + ez * t));
      const s = race.cum[i - 1] + Math.sqrt(l2) * t;
      if (d < bd && Math.abs(s - (race.playerProg ?? 0)) < 160) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  update(dt, world) {
    this.t += dt;
    this.cool = Math.max(0, this.cool - dt);
    const { player: P, hud, audio } = world;
    const race = this.race;
    // la largada se ve si Gaspi anda en auto y no está corriendo
    this.marker.visible = !race && this.cool <= 0 && !!P.vehicle && P.vehicle.kind !== 'bus';
    if (this.marker.visible) this.marker.userData.tube.material.opacity = 0.3 + Math.sin(this.t * 3) * 0.1;
    if (!race) return;
    const v = P.vehicle;
    if (race.state === 'count') {
      // quietos hasta el "¡YA!"
      if (v) {
        v.x = race.start.x;
        v.z = race.start.z;
        v.heading = race.start.h;
        v.vx = v.vz = 0;
        v.speed = 0;
        v.sync?.(0);
      }
      const before = Math.ceil(race.t);
      race.t -= dt;
      const now = Math.ceil(race.t);
      if (now !== before && now >= 1 && now <= 3) {
        hud.flash(String(now), '', 'warn', 0.8);
        audio.tone?.([520], 0.18, 'square', 0.15);
      }
      if (race.t <= 0) {
        race.state = 'run';
        hud.flash('¡YA!', '', 'ok', 1);
        audio.tone?.([1040], 0.4, 'square', 0.18);
      }
    }
    if (race.state === 'run') {
      if (!v || v.wreck || P.dead) return this.end(world, 'Abandonaste la picada');
      race.playerProg = this.progress(v.x, v.z);
      for (const r of race.racers) {
        if (r.done) continue;
        this.drive(r, dt, world);
        if (r.i >= race.pts.length - 1 && Math.hypot(r.v.x - race.pts.at(-1).x, r.v.z - race.pts.at(-1).z) < 8) {
          r.done = true;
          race.finished++;
          r.v.speed = 0;
        }
      }
      const cp = race.cps[race.next];
      if (Math.hypot(v.x - cp.x, v.z - cp.z) < 6.5) {
        race.next++;
        audio.tone?.([880, 1320], 0.12, 'square', 0.12);
        if (race.next >= race.cps.length) return this.finish(world);
      }
      race.place = 1 + race.racers.filter((r) => r.done || r.prog > race.playerProg).length;
    } else {
      for (const r of race.racers) r.v.sync(0);
    }
    // aro del próximo punto y bandera en la llegada
    const cp = race.cps[Math.min(race.next, race.cps.length - 1)];
    const last = race.next >= race.cps.length - 1;
    this.cp.visible = !last;
    this.flag.visible = true;
    this.cp.position.set(cp.x, 0.02, cp.z);
    const fin = race.cps.at(-1);
    this.flag.position.set(fin.x, 0.02, fin.z);
    this.cp.userData.tube.material.opacity = 0.35 + Math.sin(this.t * 4) * 0.1;
  }

  objective() {
    const race = this.race;
    if (!race) return null;
    const cp = race.cps[Math.min(race.next, race.cps.length - 1)];
    if (race.state === 'count') return { text: 'Picada: preparate…', target: cp };
    return { text: `Picada: aro ${race.next + 1}/${race.cps.length} · vas ${race.place}º de 4`, target: cp };
  }

  finish(world) {
    const race = this.race;
    const { player: P, hud, audio } = world;
    const place = 1 + race.finished;
    if (place === 1) {
      P.addMoney(race.prize);
      P.addRespeto(3);
      audio.cumplida?.();
      hud.flash('¡GANASTE LA PICADA!', `+$${race.prize.toLocaleString('es-AR')} · Respeto +3`, 'ok', 3.5);
    } else if (place === 2) {
      P.addMoney(Math.round(race.prize / 4));
      hud.flash('SEGUNDO', `Algo es algo: +$${Math.round(race.prize / 4).toLocaleString('es-AR')}`, 'warn', 3);
    } else hud.flash('PERDISTE LA PICADA', `Llegaste ${place}º. Los pibes se cagan de risa`, 'bad', 3);
    this.end(world);
  }

  end(world, reason) {
    const race = this.race;
    if (reason) world.hud.flash('PICADA', reason, 'bad', 2.5);
    // los rivales quedan estacionados donde frenaron (se los puede robar)
    for (const r of race.racers) {
      r.v.speed = 0;
      r.v.racer = false;
      r.v.keep = false;
    }
    this.race = null;
    this.cp.visible = false;
    this.flag.visible = false;
    this.cool = 40;
  }
}
