// La torre de Almirante Brown 2973 (esquina Esmeralda): la más alta de Temperley, con un tobogán
// gigante en la terraza que da una vuelta y media por afuera del edificio, a cien metros de la calle,
// y cae en la pileta. Se sube con el ascensor de la entrada (E), arriba se camina la terraza, E al pie
// de la torrecita para tirarse, y E en el borde de la pileta para meterse o salir.
import * as THREE from 'three';
import { FastBoxes } from './builder.js';
import { roofWalkway } from './physics.js';
import { textTexture } from './textures.js';
import { R } from './rng.js';
import { animateHuman } from './human.js';

const TOP = 14; // altura de la largada sobre la terraza
const POOL_FLOOR = 0.2; // el fondo de la pileta (sobre la terraza)
const WATER = 0.95;

export function buildTobogan(scene, city) {
  const tb = city.buildingList.find((b) => b.b.extra === 'tobogan');
  if (!tb) return null;
  const ring = tb.ring;
  const H = tb.h;
  // marco local: s a lo largo del frente (desde la esquina), d hacia adentro del edificio
  const [ax, az] = ring[0];
  const [bx, bz] = ring[1];
  const [cx, cz] = ring[2];
  const L = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / L;
  const uz = (bz - az) / L;
  let nx = -uz;
  let nz = ux;
  if ((cx - bx) * nx + (cz - bz) * nz < 0) {
    nx = -nx;
    nz = -nz;
  }
  const Dp = Math.abs((cx - bx) * nx + (cz - bz) * nz);
  const at = (s, d, y = H) => new THREE.Vector3(ax + ux * s + nx * d, y, az + uz * s + nz * d);
  const rot = Math.atan2(-uz, ux);
  const F = new FastBoxes();
  const C = city.colliders;
  // ---- la pileta (con borde de 1 m; se entra y se sale con E) ----
  const P0 = { s: 5, d: 9 };
  const P1 = { s: L - 3, d: Dp - 2 };
  const pr = [at(P0.s, P0.d), at(P1.s, P0.d), at(P1.s, P1.d), at(P0.s, P1.d)].map((v) => [v.x, v.z]);
  const pc = at((P0.s + P1.s) / 2, (P0.d + P1.d) / 2);
  const pw = P1.s - P0.s;
  const pd = P1.d - P0.d;
  // borde de venecitas y el fondo celeste
  for (const [s0, d0, s1, d1] of [
    [P0.s, P0.d, P1.s, P0.d],
    [P1.s, P0.d, P1.s, P1.d],
    [P1.s, P1.d, P0.s, P1.d],
    [P0.s, P1.d, P0.s, P0.d],
  ]) {
    const a = at(s0, d0);
    const b = at(s1, d1);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    F.rbox(len + 0.3, 1.1, 0.3, 0xf2f2f2, (a.x + b.x) / 2, H + 0.55, (a.z + b.z) / 2, Math.atan2(-(b.z - a.z) / len, (b.x - a.x) / len));
    C.add3d(a.x, a.z, b.x, b.z, H, 1.1);
  }
  F.rbox(pw, 0.2, pd, 0x5ec8e8, pc.x, H + 0.1, pc.z, rot);
  // reposeras
  for (let k = 0; k < 3; k++) {
    const p = at(P0.s + 1 + k * 2.6, P0.d - 2.2);
    F.rbox(0.7, 0.35, 1.9, [0xff7043, 0xfdd835, 0x26c6da][k], p.x, H + 0.18, p.z, rot);
  }
  // ---- la torrecita de largada (andamio con escalera) ----
  const T = { s: 2, d: 6 };
  for (const [ds, dd] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const p = at(T.s + ds * 0.9, T.d + dd * 0.9);
    F.box(0.14, TOP + 1.2, 0.14, 0x5f6a70, p.x, H + (TOP + 1.2) / 2, p.z);
  }
  for (let y = 2; y < TOP; y += 2) {
    const p = at(T.s, T.d);
    F.rbox(2.0, 0.08, 0.08, 0x5f6a70, p.x, H + y, p.z, rot);
  }
  const top = at(T.s, T.d, H + TOP);
  F.rbox(2.2, 0.15, 2.2, 0x8a8f96, top.x, top.y - 0.08, top.z, rot);
  // ---- el tobogán: de la torrecita sale por el costado, da una vuelta y media afuera y vuelve a la pileta ----
  const axis = { s: -5, d: 6 };
  const Rh = 4;
  const pts = [at(T.s, T.d, H + TOP + 0.6), at(T.s - 1.6, T.d, H + TOP + 0.4)];
  const turns = 1.5;
  const n = 30;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const a = k * turns * Math.PI * 2;
    pts.push(at(axis.s + Math.cos(a) * Rh, axis.d + Math.sin(a) * Rh, H + TOP - 0.4 - k * (TOP - 3.6)));
  }
  const end = at(P0.s + 2.4, (P0.d + P1.d) / 2, H + WATER + 0.4);
  pts.push(at(-1.5, 6 + Rh * 0.2, H + 3.0), at(1.5, 8.5, H + 2.4), at(P0.s, (P0.d + P1.d) / 2, H + 1.6), end);
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 360, 0.85, 14, false),
    new THREE.MeshStandardMaterial({ color: 0xffc400, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false }),
  );
  tube.castShadow = true;
  scene.add(tube);
  // poste central y ménsulas a la pared
  const ap = at(axis.s, axis.d, H);
  F.box(0.4, TOP + 0.6, 0.4, 0xd84315, ap.x, H + 1.8 + (TOP - 1.8) / 2, ap.z);
  for (const y of [3, 8, 13]) {
    const a = at(axis.s, axis.d, H + y);
    const b = at(0, axis.d, H + y);
    F.rbox(Math.hypot(b.x - a.x, b.z - a.z), 0.25, 0.25, 0xd84315, (a.x + b.x) / 2, H + y, (a.z + b.z) / 2, rot);
  }
  // ---- el ascensor de arriba (la casilla) ----
  const lift = at(L - 2.2, 3);
  F.rbox(2.2, 2.7, 2.2, 0xd9d4c8, lift.x, H + 1.35, lift.z, rot);
  F.rbox(1.0, 2.1, 0.1, 0x6b7a85, lift.x - nx * 1.12, H + 1.05, lift.z - nz * 1.12, rot);
  C.addCircle(lift.x, lift.z, 1.3, H + 2.7);
  scene.add(F.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })));
  // el agua
  const water = new THREE.Mesh(new THREE.PlaneGeometry(pw - 0.1, pd - 0.1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2bb3e6, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.72 }));
  water.position.set(pc.x, H + WATER, pc.z);
  water.rotation.y = rot;
  scene.add(water);
  // cartel arriba del frente
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), new THREE.MeshBasicMaterial({ map: textTexture('TOBOGÁN · PILETA', { w: 1024, h: 180, bg: '#0d47a1', fg: '#ffffff', font: 120, border: '#ffeb3b' }) }));
  const sp = at(L / 2, -0.15, H + 3);
  sign.position.copy(sp);
  sign.rotation.y = Math.atan2(-nx, -nz);
  scene.add(sign);
  // la terraza se camina (menos la pileta, que tiene su fondo más arriba) y tiene parapeto
  const roof = roofWalkway(ring, H);
  roof.hole = pr;
  city.walkways.push(roof, { ...roofWalkway(pr, H + POOL_FLOOR) });
  for (let k = 0; k < ring.length; k++) {
    const [x0, z0] = ring[k];
    const [x1, z1] = ring[(k + 1) % ring.length];
    C.add3d(x0, z0, x1, z1, H, 1.1);
  }
  // la puerta del ascensor en la vereda
  const door = at(L / 2, -1.4, 0);
  return { building: tb, H, curve, length: curve.getLength(), pool: { ring: pr, s0: P0, s1: P1, at }, ladder: at(T.s + 1.6, T.d), lift: at(L - 2.2, 4.6), door: { x: door.x, z: door.z }, water, at, L, Dp };
}

function inRing(x, z, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i];
    const [xj, zj] = r[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function edge(x, z, r) {
  let best = Infinity;
  let bp = null;
  for (let i = 0; i < r.length; i++) {
    const [ax, az] = r[i];
    const [bx, bz] = r[(i + 1) % r.length];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) {
      best = d;
      bp = { x: ax + dx * t, z: az + dz * t };
    }
  }
  return { d: best, p: bp };
}

export class Tobogan {
  constructor(t) {
    this.t = t;
    this.ride = null;
    this.fade = document.createElement('div');
    Object.assign(this.fade.style, { position: 'fixed', inset: '0', background: '#000', opacity: '0', pointerEvents: 'none', transition: 'opacity 0.5s', zIndex: '40' });
    document.body.appendChild(this.fade);
  }

  // por dónde anda Gaspi: 'calle', 'terraza' o 'pileta'
  where(P) {
    const t = this.t;
    if (!t || P.y < t.H - 2) return 'calle';
    return inRing(P.x, P.z, t.pool.ring) && P.y < t.H + 0.6 ? 'pileta' : 'terraza';
  }

  teleport(world, x, z, y, then) {
    const P = world.player;
    this.busy = true;
    this.fade.style.opacity = '1';
    setTimeout(() => {
      P.x = x;
      P.z = z;
      P.y = y;
      P.vy = 0;
      P.mvx = P.mvz = 0;
      then?.();
      this.fade.style.opacity = '0';
      this.busy = false;
    }, 550);
  }

  action(world) {
    const t = this.t;
    const P = world.player;
    if (!t || this.ride || this.busy || P.vehicle || P.ufo || P.dead) return null;
    const w = this.where(P);
    if (w === 'calle') {
      if (Math.hypot(P.x - t.door.x, P.z - t.door.z) < 2.2) return { text: 'Subir en el ascensor a la terraza (piso 32)', run: () => this.teleport(world, t.lift.x, t.lift.z, t.H, () => world.hud.flash('PISO 32', 'Tobogán: E al pie de la torrecita · Pileta: E en el borde', 'ok', 3)) };
      return null;
    }
    if (w === 'terraza') {
      if (Math.hypot(P.x - t.lift.x, P.z - t.lift.z) < 1.8) return { text: 'Bajar en el ascensor', run: () => this.teleport(world, t.door.x, t.door.z, 0.15) };
      if (Math.hypot(P.x - t.ladder.x, P.z - t.ladder.z) < 1.8) return { text: '¡Tirarse por el tobogán!', run: () => this.start(world) };
      const e = edge(P.x, P.z, t.pool.ring);
      if (e.d < 1.3)
        return {
          text: 'Meterte en la pileta',
          run: () => {
            const c = t.at((t.pool.s0.s + t.pool.s1.s) / 2, (t.pool.s0.d + t.pool.s1.d) / 2);
            const k = 1.2 / Math.hypot(c.x - e.p.x, c.z - e.p.z);
            P.x = e.p.x + (c.x - e.p.x) * k;
            P.z = e.p.z + (c.z - e.p.z) * k;
            P.y = t.H + POOL_FLOOR;
            this.splash(world, P.x, P.z, 10);
          },
        };
      return null;
    }
    // en la pileta
    const e = edge(P.x, P.z, t.pool.ring);
    if (e.d < 1.4)
      return {
        text: 'Salir de la pileta',
        run: () => {
          const c = t.at((t.pool.s0.s + t.pool.s1.s) / 2, (t.pool.s0.d + t.pool.s1.d) / 2);
          const k = 1.3 / Math.hypot(e.p.x - c.x, e.p.z - c.z);
          P.x = e.p.x + (e.p.x - c.x) * k;
          P.z = e.p.z + (e.p.z - c.z) * k;
          P.y = t.H;
        },
      };
    return null;
  }

  splash(world, x, z, n = 24) {
    world.fx.dust(x, this.t.H + WATER + 0.2, z, n, [0.85, 0.95, 1], 3.5);
    world.audio.burst?.(0.4, 700, 'lowpass', 0.35, 0, 0.6);
  }

  start(world) {
    const P = world.player;
    this.ride = { k: 0, v: 3 };
    P.cutscene = true;
    P.attack = null;
    world.hud.flash('¡TOBOGÁN!', 'A cien metros de la calle...', 'ok', 2.2);
    world.audio.tone?.([520, 660, 880], 0.3, 'sine', 0.1);
  }

  update(dt, world) {
    const r = this.ride;
    if (!r) return;
    const P = world.player;
    const c = this.t.curve;
    const k = r.k;
    const p = c.getPointAt(Math.min(1, k));
    const tan = c.getTangentAt(Math.min(1, k));
    // cae como en un tobogán: acelera con la pendiente (y un poco de roce)
    r.v = Math.max(4, Math.min(19, r.v + (-tan.y * 9.8 - r.v * 0.08) * dt));
    r.k += (r.v * dt) / this.t.length;
    P.x = p.x;
    P.z = p.z;
    P.y = p.y - 0.55;
    P.vy = 0;
    P.heading = Math.atan2(tan.x, tan.z);
    P.speed = 0;
    P.h.root.position.set(P.x, P.y, P.z);
    P.h.root.rotation.y = P.heading;
    animateHuman(P.h, dt, 0, 'sit');
    P.h.rig?.apply();
    if (Math.random() < dt * 20) world.fx.dust(p.x, p.y - 0.4, p.z, 1, [0.85, 0.95, 1], 0.8);
    if (r.k >= 1) {
      // ¡al agua!
      this.ride = null;
      P.cutscene = false;
      P.y = this.t.H + POOL_FLOOR;
      this.splash(world, P.x, P.z, 30);
      world.hud.flash('¡SPLASH!', R.pick(['¡Qué viaje!', 'Diez puntos', '¡De nuevo, de nuevo!']), 'ok', 2);
      P.addRespeto?.(1);
    }
  }
}
