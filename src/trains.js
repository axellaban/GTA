// Trenes del Roca, barreras y pasos a nivel.
import * as THREE from 'three';
import { ROUTES, STREETS, TRACKS, YARD } from './map.js';
import { makeTrainCar } from './vehicles.js';
import { R } from './rng.js';

const SPACING = 20.3;

class Route {
  constructor(def) {
    Object.assign(this, def);
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) {
      const [ax, az] = this.pts[i - 1];
      const [bx, bz] = this.pts[i];
      this.cum.push(this.cum[i - 1] + Math.hypot(bx - ax, bz - az));
    }
    this.length = this.cum[this.cum.length - 1];
    // arco donde frena: el punto de la estación más cercano a stopZ
    let best = 0;
    let bd = Infinity;
    this.pts.forEach(([x, z], i) => {
      if (Math.abs(x) > 60) return;
      const d = Math.abs(z - this.stopZ);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    this.stopS = this.cum[best];
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
    this.routes = ROUTES.map((r) => new Route(r));
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
      c.closed = 0; // 0 abierta, 1 cerrada
      const s = c.street;
      const half = s.w / 2;
      for (const side of [-1, 1]) {
        // cada lado cierra el carril que entra hacia las vías (mano derecha)
        const along = side < 0 ? c.min - 4 : c.max + 4;
        const across = s.c + (side < 0 ? 1 : -1) * (half + 0.4) * (s.axis === 'ns' ? -1 : 1);
        const px = s.axis === 'ns' ? across : along;
        const pz = s.axis === 'ns' ? along : across;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), postMat);
        post.position.set(px, 0.6, pz);
        this.scene.add(post);
        const pivot = new THREE.Group();
        pivot.position.set(px, 1.05, pz);
        const len = half + 0.3;
        const boom = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.12), boomMat);
        boom.position.x = len / 2;
        pivot.add(boom);
        // el brazo apunta hacia el centro de la calle
        const toCx = (s.axis === 'ns' ? s.c : along) - px;
        const toCz = (s.axis === 'ns' ? along : s.c) - pz;
        pivot.rotation.y = Math.atan2(-toCz, toCx);
        pivot.userData.baseY = pivot.rotation.y;
        this.scene.add(pivot);
        c.booms.push(pivot);
        // cruz de San Andrés
        const cross = new THREE.Group();
        for (const a of [0.7, -0.7]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.04), xMat);
          bar.rotation.z = a;
          cross.add(bar);
        }
        cross.position.set(px, 2.6, pz);
        const cpost = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), postMat);
        cpost.position.set(px, 1.3, pz);
        this.scene.add(cross, cpost);
      }
      // tablones sobre la calle
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(s.axis === 'ns' ? s.w : c.max - c.min + 4, 0.05, s.axis === 'ns' ? c.max - c.min + 4 : s.w),
        new THREE.MeshLambertMaterial({ color: 0x3d3a36 }),
      );
      plank.position.set(s.axis === 'ns' ? s.c : (c.min + c.max) / 2, 0.33, s.axis === 'ns' ? (c.min + c.max) / 2 : s.c);
      this.scene.add(plank);
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
    for (const c of this.crossings) {
      if (!c.shut) continue;
      const s = c.street;
      const onStreet = s.axis === 'ns' ? Math.abs(x - s.c) < s.w / 2 + 1 && Math.abs(fx) < 0.5 : Math.abs(z - s.c) < s.w / 2 + 1 && Math.abs(fz) < 0.5;
      if (!onStreet) continue;
      const along = s.axis === 'ns' ? z : x;
      const dir = s.axis === 'ns' ? Math.sign(fz) : Math.sign(fx);
      const edge = dir > 0 ? c.min - 5 : c.max + 5;
      const d = (edge - along) * dir;
      if (d > 0 && d < look) return d;
    }
    return null;
  }
}

function findCrossings() {
  const hits = [];
  for (const s of STREETS) {
    for (const t of TRACKS) {
      for (let i = 0; i < t.length - 1; i++) {
        const [ax, az] = t[i];
        const [bx, bz] = t[i + 1];
        const a1 = s.axis === 'ns' ? ax : az;
        const b1 = s.axis === 'ns' ? bx : bz;
        if ((a1 - s.c) * (b1 - s.c) > 0 || a1 === b1) continue;
        const u = (s.c - a1) / (b1 - a1);
        const along = s.axis === 'ns' ? az + (bz - az) * u : ax + (bx - ax) * u;
        if (along < s.a || along > s.b) continue;
        const x = s.axis === 'ns' ? s.c : along;
        const z = s.axis === 'ns' ? along : s.c;
        if (x > YARD.x0 && x < YARD.x1 && z < YARD.z1 && z > -200) continue;
        hits.push({ s, along, x, z });
      }
    }
  }
  const out = [];
  for (const h of hits) {
    const c = out.find((o) => o.street === h.s && h.along > o.min - 25 && h.along < o.max + 25);
    if (c) {
      c.min = Math.min(c.min, h.along);
      c.max = Math.max(c.max, h.along);
    } else out.push({ street: h.s, min: h.along, max: h.along });
  }
  for (const c of out) {
    c.min -= 2;
    c.max += 2;
    const mid = (c.min + c.max) / 2;
    c.x = c.street.axis === 'ns' ? c.street.c : mid;
    c.z = c.street.axis === 'ns' ? mid : c.street.c;
  }
  return out;
}
