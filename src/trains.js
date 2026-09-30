// Trenes del Roca, barreras y pasos a nivel.
import * as THREE from 'three';
import { ROADS, TRACKS, HALF, STATION, project, withCum } from './map.js';
import { makeTrainCar } from './vehicles.js';
import { R } from './rng.js';

const SPACING = 20.3;

// Grafo de vías reales y recorridos que atraviesan la estación de norte a sur
function railRoutes() {
  const nodes = new Map();
  const key = (x, z) => `${Math.round(x)},${Math.round(z)}`;
  const node = (x, z) => {
    const k = key(x, z);
    if (!nodes.has(k)) nodes.set(k, { x, z, adj: [] });
    return nodes.get(k);
  };
  for (const t of TRACKS) {
    for (let i = 0; i < t.length - 1; i++) {
      const a = node(t[i][0], t[i][1]);
      const b = node(t[i + 1][0], t[i + 1][1]);
      const l = Math.hypot(b.x - a.x, b.z - a.z);
      if (l < 0.01) continue;
      a.adj.push({ n: b, l });
      b.adj.push({ n: a, l });
    }
  }
  const all = [...nodes.values()];
  const north = all.filter((n) => n.z < -HALF + 8);
  const south = all.filter((n) => n.z > HALF - 8 || Math.abs(n.x) > HALF - 8);
  // Dijkstra sobre estados (nodo, nodo anterior) para no permitir giros bruscos en los cambios
  const path = (src, dst) => {
    const sk = (n, f) => `${key(n.x, n.z)}|${f ? key(f.x, f.z) : '-'}`;
    const dist = new Map();
    const back = new Map();
    const open = [[0, src, null]];
    dist.set(sk(src, null), 0);
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [d, n, from] = open.splice(bi, 1)[0];
      const k = sk(n, from);
      if (d > (dist.get(k) ?? Infinity) + 1e-6) continue;
      if (n === dst) {
        const out = [];
        let cur = k;
        let node = n;
        let prevNode = from;
        while (node) {
          out.push([node.x, node.z]);
          const b = back.get(cur);
          if (!b) break;
          cur = b.k;
          node = b.n;
          prevNode = b.f;
        }
        void prevNode;
        return { pts: out.reverse(), d };
      }
      for (const { n: m, l } of n.adj) {
        if (from) {
          const ax = n.x - from.x;
          const az = n.z - from.z;
          const bx = m.x - n.x;
          const bz = m.z - n.z;
          const c = (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz) || 1);
          if (c < 0.6) continue;
        }
        const mk = sk(m, n);
        const nd = d + l;
        if (nd < (dist.get(mk) ?? Infinity) - 1e-6) {
          dist.set(mk, nd);
          back.set(mk, { k, n, f: from });
          open.push([nd, m, n]);
        }
      }
    }
    return null;
  };
  const found = [];
  for (const a of north) {
    for (const b of south) {
      const p = path(a, b);
      if (!p || p.pts.length < 3) continue;
      // tiene que pasar por la estación
      const near = p.pts.some(([x, z]) => Math.hypot(x - STATION.x, z - STATION.z) < 45);
      if (!near) continue;
      if (found.some((f) => Math.hypot(f.pts[0][0] - p.pts[0][0], f.pts[0][1] - p.pts[0][1]) < 3 && Math.hypot(f.pts.at(-1)[0] - p.pts.at(-1)[0], f.pts.at(-1)[1] - p.pts.at(-1)[1]) < 3)) continue;
      found.push(p);
    }
  }
  found.sort((a, b) => a.d - b.d);
  const names = ['Glew', 'Ezeiza', 'Bosques', 'Haedo', 'Korn'];
  const routes = [];
  found.slice(0, 5).forEach((p, i) => {
    const southbound = { name: names[i % names.length], kind: i === 3 ? 'diesel' : 'electrico', pts: p.pts };
    routes.push(i % 2 === 0 ? southbound : { ...southbound, name: 'Constitución', pts: p.pts.slice().reverse() });
  });
  return routes;
}

class Route {
  constructor(def) {
    Object.assign(this, def);
    const w = withCum(this.pts);
    this.cum = w.cum;
    this.length = w.len;
    // frena donde el recorrido pasa más cerca del centro de la estación
    const p = project(this.pts, this.cum, STATION.x - 5, STATION.z);
    this.stopS = p.s + 60;
  }
  at(s) {
    s = Math.max(0, Math.min(this.length, s));
    let lo = 0;
    let hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.cum[m] <= s) lo = m;
      else hi = m;
    }
    const seg = this.cum[hi] - this.cum[lo] || 1;
    const t = (s - this.cum[lo]) / seg;
    const [ax, az] = this.pts[lo];
    const [bx, bz] = this.pts[hi];
    return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, heading: Math.atan2(bx - ax, bz - az) };
  }
}

export class Trains {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.routes = railRoutes().map((r) => new Route(r));
    this.trains = [];
    this.crossings = findCrossings();
    this.buildBarriers();
    this.timer = 4;
    this.bellT = 0;
    this.routes.forEach((r, i) => this.spawn(r, i === 0 ? r.stopS - 260 : -R.range(60, 300) - i * 140));
  }

  spawn(route, startS) {
    const n = route.kind === 'diesel' ? 4 : 7;
    const group = [];
    for (let i = 0; i < n; i++) {
      const cab = i === 0 || i === n - 1;
      const car = makeTrainCar(route.kind, cab);
      if (i === n - 1) car.rotation.order = 'YXZ';
      this.scene.add(car);
      car.visible = false;
      group.push({ mesh: car, back: i === n - 1 });
    }
    const t = { route, cars: group, s: startS, v: startS < 0 ? 12 : 0, dir: 1, state: 'running', wait: 0, honked: 0, n };
    this.trains.push(t);
    return t;
  }

  update(dt, player) {
    for (const t of this.trains) {
      const r = t.route;
      const vmax = r.kind === 'diesel' ? 11 : 15;
      if (t.state === 'running') {
        // frenar en el andén
        let target = vmax;
        const toStop = t.dir > 0 ? r.stopS - t.s : t.s - (t.s0 ?? 0);
        if (!t.stopped && t.dir > 0 && toStop > 0) target = Math.min(vmax, Math.sqrt(2 * 0.9 * toStop) + 0.3);
        if (t.s < 0) target = vmax; // todavía fuera del mapa
        t.v += Math.sign(target - t.v) * Math.min(Math.abs(target - t.v), dt * 1.4);
        t.s += t.v * t.dir * dt;
        if (!t.stopped && t.dir > 0 && t.s >= r.stopS - 0.5) {
          t.state = 'stopped';
          t.stopped = true;
          t.wait = r.shuttle ? 22 : 16;
          t.v = 0;
        }
        const tailS = t.s - t.n * SPACING;
        if (t.dir > 0 && tailS > r.length + 10) this.recycle(t);
        if (t.dir < 0 && t.s + t.n * SPACING < -5) this.recycle(t);
      } else if (t.state === 'stopped') {
        t.wait -= dt;
        if (t.wait <= 0) {
          this.audio.bocinaTren(this.vol(player, t) * 0.8);
          t.state = 'running';
          if (r.shuttle) {
            // el diésel de Haedo vuelve por donde vino: la cola pasa a ser la cabeza
            t.s = t.s - t.n * SPACING;
            t.dir = -1;
          }
        }
      } else if (t.state === 'idle') {
        t.wait -= dt;
        if (t.wait <= 0) {
          t.state = 'running';
          t.s = -R.range(40, 120);
          t.dir = 1;
          t.stopped = false;
          t.v = vmax;
        }
      }
      this.place(t);
      // bocina si hay alguien en la vía adelante
      t.honked -= dt;
      if (t.state === 'running' && t.honked <= 0 && player) {
        const head = r.at(t.s);
        const d = Math.hypot(player.x - head.x, player.z - head.z);
        const fx = Math.sin(head.heading) * t.dir;
        const fz = Math.cos(head.heading) * t.dir;
        const ahead = (player.x - head.x) * fx + (player.z - head.z) * fz;
        if (d < 90 && ahead > 0 && Math.abs((player.x - head.x) * fz - (player.z - head.z) * fx) < 3) {
          this.audio.bocinaTren(this.vol(player, t));
          t.honked = 3;
        } else if (this.crossings.some((c) => Math.hypot(c.x - head.x, c.z - head.z) < 60)) {
          this.audio.bocinaTren(this.vol(player, t) * 0.6);
          t.honked = 8;
        }
      }
    }
    this.updateBarriers(dt, player);
  }

  vol(player, t) {
    if (!player) return 0;
    const head = t.route.at(t.s);
    return Math.max(0, 1 - Math.hypot(player.x - head.x, player.z - head.z) / 260);
  }

  recycle(t) {
    t.state = 'idle';
    t.wait = R.range(25, 60);
    for (const c of t.cars) c.mesh.visible = false;
  }

  place(t) {
    const r = t.route;
    t.boxes = [];
    for (let i = 0; i < t.n; i++) {
      const s = t.s - t.dir * i * SPACING - t.dir * SPACING / 2;
      const c = t.cars[i];
      if (t.state === 'idle' || s < -5 || s > r.length + 5) {
        c.mesh.visible = false;
        continue;
      }
      const p = r.at(s);
      c.mesh.visible = true;
      c.mesh.position.set(p.x, 0.25, p.z);
      // la cabina delantera mira en el sentido de marcha
      const face = t.dir > 0 ? p.heading : p.heading + Math.PI;
      c.mesh.rotation.y = c.back ? face + Math.PI : face;
      t.boxes.push({ x: p.x, z: p.z, h: p.heading, moving: t.state === 'running' && t.v > 1 });
    }
  }

  // ¿El punto está dentro de algún coche? Devuelve info del choque.
  hitTest(x, z, r) {
    for (const t of this.trains) {
      if (!t.boxes) continue;
      for (const b of t.boxes) {
        const dx = x - b.x;
        const dz = z - b.z;
        const s = Math.sin(b.h);
        const c = Math.cos(b.h);
        const lz = dx * s + dz * c;
        const lx = dx * c - dz * s;
        if (Math.abs(lx) < 1.5 + r && Math.abs(lz) < 10 + r) return { train: t, box: b, lx, lz, moving: b.moving, speed: t.v };
      }
    }
    return null;
  }

  // ---------- Barreras ----------
  buildBarriers() {
    const boomTex = (() => {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 8;
      const g = c.getContext('2d');
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#ffffff' : '#d32f2f';
        g.fillRect(i * 16, 0, 16, 8);
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const boomMat = new THREE.MeshLambertMaterial({ map: boomTex });
    const postMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const xMat = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });
    for (const c of this.crossings) {
      c.booms = [];
      c.closed = 0;
      const r = c.road;
      const half = r.w / 2;
      for (const side of [-1, 1]) {
        // antes del cruce (side -1) se llega avanzando; después (side 1) se llega retrocediendo
        const s = side < 0 ? c.min - 4 : c.max + 4;
        const p = pointAtRoad(r, s);
        const fx = side < 0 ? p.dx : -p.dx;
        const fz = side < 0 ? p.dz : -p.dz;
        // mano derecha de quien llega
        const rx = -fz;
        const rz = fx;
        const px = p.x + rx * (half + 0.4);
        const pz = p.z + rz * (half + 0.4);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), postMat);
        post.position.set(px, 0.6, pz);
        this.scene.add(post);
        const pivot = new THREE.Group();
        pivot.position.set(px, 1.05, pz);
        const len = half + 0.3;
        const boom = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.12), boomMat);
        boom.position.x = len / 2;
        pivot.add(boom);
        // el brazo apunta hacia el centro de la calle (-r)
        pivot.rotation.y = Math.atan2(rz, -rx);
        this.scene.add(pivot);
        c.booms.push(pivot);
        const cross = new THREE.Group();
        for (const a of [0.7, -0.7]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.04), xMat);
          bar.rotation.z = a;
          cross.add(bar);
        }
        cross.position.set(px, 2.6, pz);
        cross.rotation.y = Math.atan2(fx, fz);
        const cpost = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), postMat);
        cpost.position.set(px, 1.3, pz);
        this.scene.add(cross, cpost);
      }
    }
  }

  updateBarriers(dt, player) {
    this.bellT -= dt;
    let ring = 0;
    for (const c of this.crossings) {
      let near = false;
      for (const t of this.trains) {
        if (!t.boxes || !t.boxes.length) continue;
        for (const b of [t.boxes[0], t.boxes[t.boxes.length - 1]]) {
          if (Math.hypot(b.x - c.x, b.z - c.z) < 95) near = true;
        }
        if (t.boxes.some((b) => Math.hypot(b.x - c.x, b.z - c.z) < 14)) near = true;
      }
      const target = near ? 1 : 0;
      c.closed += Math.sign(target - c.closed) * Math.min(Math.abs(target - c.closed), dt * 0.8);
      c.shut = c.closed > 0.35;
      for (const p of c.booms) p.rotation.z = (1 - c.closed) * 1.45;
      if (near && player) ring = Math.max(ring, 1 - Math.hypot(player.x - c.x, player.z - c.z) / 120);
    }
    if (ring > 0 && this.bellT <= 0) {
      this.audio.campana(ring);
      this.bellT = 0.55;
    }
  }

  // Para el tránsito: ¿hay una barrera baja entre 1 y `look` metros adelante?
  barrierAhead(x, z, fx, fz, look = 16) {
    let best = null;
    for (const c of this.crossings) {
      if (!c.shut) continue;
      if (Math.abs(x - c.x) > 80 || Math.abs(z - c.z) > 80) continue;
      const r = c.road;
      const p = project(r.pts, r.cum, x, z);
      if (p.dist > r.w / 2 + 1) continue;
      const dir = fx * p.dx + fz * p.dz;
      if (Math.abs(dir) < 0.5) continue;
      let d = null;
      if (dir > 0 && p.s < c.min - 5) d = c.min - 5 - p.s;
      if (dir < 0 && p.s > c.max + 5) d = p.s - (c.max + 5);
      if (d !== null && d < look && (best === null || d < best)) best = d;
    }
    return best;
  }
}

function findCrossings() {
  const out = [];
  for (const r of ROADS) {
    const hits = [];
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i];
      const [bx, bz] = r.pts[i + 1];
      for (const t of TRACKS) {
        for (let j = 0; j < t.length - 1; j++) {
          const [cx, cz] = t[j];
          const [dx, dz] = t[j + 1];
          const rx = bx - ax;
          const rz = bz - az;
          const sx = dx - cx;
          const sz = dz - cz;
          const den = rx * sz - rz * sx;
          if (Math.abs(den) < 1e-9) continue;
          const u = ((cx - ax) * sz - (cz - az) * sx) / den;
          const v = ((cx - ax) * rz - (cz - az) * rx) / den;
          if (u >= 0 && u <= 1 && v >= 0 && v <= 1) hits.push(r.cum[i] + u * Math.hypot(rx, rz));
        }
      }
    }
    if (!hits.length) continue;
    hits.sort((a, b) => a - b);
    let group = [hits[0]];
    const flush = () => {
      const min = group[0] - 2;
      const max = group[group.length - 1] + 2;
      const mid = pointAtRoad(r, (min + max) / 2);
      out.push({ road: r, min, max, x: mid.x, z: mid.z });
    };
    for (let k = 1; k < hits.length; k++) {
      if (hits[k] - group[group.length - 1] < 25) group.push(hits[k]);
      else {
        flush();
        group = [hits[k]];
      }
    }
    flush();
  }
  return out;
}

function pointAtRoad(r, s) {
  s = Math.max(0, Math.min(r.len, s));
  let i = 0;
  while (i < r.cum.length - 2 && r.cum[i + 1] < s) i++;
  const [ax, az] = r.pts[i];
  const [bx, bz] = r.pts[i + 1];
  const l = r.cum[i + 1] - r.cum[i] || 1;
  const t = (s - r.cum[i]) / l;
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / l, dz: (bz - az) / l };
}
