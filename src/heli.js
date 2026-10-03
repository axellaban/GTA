// Las torres de Temperley (los tres edificios en H al lado de la estación). En la más cercana:
// - una escalera de incendio en zigzag, de fierro, que sube desde el patio angosto entre las alas
//   (el callejón) hasta la terraza;
// - la terraza se camina (con parapeto) y tiene un helipuerto con un helicóptero que se puede agarrar
//   y volar: WASD hacia donde mira la cámara, Espacio sube, Shift baja, F para bajarte cuando tocás
//   el piso (o la terraza de la torre).
import * as THREE from 'three';
import { FastBoxes } from './builder.js';
import { pointInRing, outward } from './city.js';
import { roofWalkway, walkwayHeight } from './physics.js';
import { textTexture } from './textures.js';

const STEEL = 0x3a4046;
const STEP = 0x5b6167;
const SKID = 1.45; // de la panza del helicóptero a los patines
const SPEED = 24;

function centroid(r) {
  let x = 0;
  let z = 0;
  for (const [a, b] of r) {
    x += a;
    z += b;
  }
  return { x: x / r.length, z: z / r.length };
}
function edgeDist(x, z, r) {
  let best = Infinity;
  for (let i = 0; i < r.length; i++) {
    const [ax, az] = r[i];
    const [bx, bz] = r[(i + 1) % r.length];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

// escalera, terraza y helipuerto en la torre más cercana a la estación
export function buildTower(scene, city) {
  const door = city.spots.stationDoor;
  const list = city.buildingList.filter((b) => b.h > 35 && b.ring.length >= 8);
  if (!list.length || !door) return null;
  list.sort((a, b) => {
    const ca = centroid(a.ring);
    const cb = centroid(b.ring);
    return Math.hypot(ca.x - door.x, ca.z - door.z) - Math.hypot(cb.x - door.x, cb.z - door.z);
  });
  const tb = list[0];
  const ring = tb.ring;
  const H = tb.h;
  const C = centroid(ring);
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [x, z] of ring) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  // la pared del fondo del callejón: mira a un patio que queda adentro de la caja del edificio
  let wall = null;
  for (let k = 0; k < ring.length; k++) {
    const e = outward(ring, k);
    if (e.l < 8) continue;
    let ok = true;
    for (const t of [0.12, 0.5, 0.88]) {
      for (const d of [0.8, 3.3]) if (pointInRing(e.ax + (e.bx - e.ax) * t + e.nx * d, e.az + (e.bz - e.az) * t + e.nz * d, ring)) ok = false;
    }
    const px = (e.ax + e.bx) / 2 + e.nx * 4;
    const pz = (e.az + e.bz) / 2 + e.nz * 4;
    if (px < x0 + 0.5 || px > x1 - 0.5 || pz < z0 + 0.5 || pz > z1 - 0.5) ok = false;
    const d = Math.hypot((e.ax + e.bx) / 2 - C.x, (e.az + e.bz) / 2 - C.z);
    if (ok && (!wall || d < wall.d)) wall = { e, k, d };
  }
  if (!wall) return null;
  const e = wall.e;
  const at = (s, o) => ({ x: e.ax + e.ux * s + e.nx * o, z: e.az + e.uz * s + e.nz * o });
  const rot = Math.atan2(-e.uz, e.ux); // para rbox: el ancho va a lo largo de la pared
  const rotN = Math.atan2(-e.nz, e.nx);
  const F = new FastBoxes();
  const W = city.walkways;
  const C3 = city.colliders;
  const s0 = 1.6;
  const s1 = e.l - 1.6;
  const run = s1 - s0;
  const yb = 0.15;
  const n = Math.max(2, Math.ceil((H - yb) / (run * 0.62)));
  const rise = (H - yb) / n;
  const LANE = [0.95, 2.35];
  for (let i = 0; i < n; i++) {
    const up = i % 2 === 0;
    const o = LANE[i % 2];
    const ya = yb + i * rise;
    const yz = ya + rise;
    const a = at(up ? s0 : s1, o);
    const c = at(up ? s1 : s0, o);
    W.push({ ax: a.x, az: a.z, bx: c.x, bz: c.z, w: 1.3, y0: ya, y1: yz });
    // escalones
    const k = Math.ceil(rise / 0.2);
    for (let j = 0; j < k; j++) {
      const t = (j + 0.5) / k;
      const p = at(up ? s0 + run * t : s1 - run * t, o);
      F.rbox(run / k + 0.03, 0.06, 1.25, STEP, p.x, ya + (rise * (j + 1)) / k - 0.03, p.z, rot);
    }
    // el descanso del final (cruza los dos carriles)
    const sL = up ? s1 + 0.8 : s0 - 0.8;
    const p = at(sL, 0.25);
    const q = at(sL, 3.0);
    W.push({ ax: p.x, az: p.z, bx: q.x, bz: q.z, w: 1.6, y0: yz, y1: yz });
    const m = at(sL, 1.65);
    F.rbox(1.6, 0.1, 2.9, STEP, m.x, yz - 0.05, m.z, rot);
    // baranda de afuera del descanso
    F.rbox(1.6, 0.05, 0.05, STEEL, at(sL, 3.05).x, yz + 1.0, at(sL, 3.05).z, rot);
  }
  // jaula: columnas en las esquinas y barandas horizontales cada metro y medio
  for (const [s, o] of [
    [s0 - 1.6, 3.1],
    [s1 + 1.6, 3.1],
    [s0 - 1.6, 0.1],
    [s1 + 1.6, 0.1],
    [(s0 + s1) / 2, 3.1],
    [(s0 + s1) / 2, 1.65],
  ]) {
    const p = at(s, o);
    F.box(0.12, H + 1.1, 0.12, STEEL, p.x, (H + 1.1) / 2, p.z);
  }
  for (let y = 1.6; y < H + 1; y += 1.5) {
    const p = at((s0 + s1) / 2, 3.1);
    F.rbox(run + 3.2, 0.05, 0.05, STEEL, p.x, y, p.z, rot);
    for (const s of [s0 - 1.6, s1 + 1.6]) {
      const q = at(s, 1.6);
      F.rbox(3.0, 0.05, 0.05, STEEL, q.x, y, q.z, rotN);
    }
  }
  // barandas que frenan (abajo se entra por debajo: arrancan a 1,2 m)
  const A = at(s0 - 1.6, 3.1);
  const B = at(s1 + 1.6, 3.1);
  C3.add3d(A.x, A.z, B.x, B.z, 1.2, H - 0.1);
  for (const s of [s0 - 1.6, s1 + 1.6]) {
    const p = at(s, 0);
    const q = at(s, 3.1);
    C3.add3d(p.x, p.z, q.x, q.z, 1.2, H - 0.1);
  }
  const M0 = at(s0, 1.65);
  const M1 = at(s1, 1.65);
  C3.add3d(M0.x, M0.z, M1.x, M1.z, 0.65, H);
  scene.add(F.mesh(new THREE.MeshLambertMaterial({ vertexColors: true })));

  // terraza caminable con parapeto (menos donde llega la escalera)
  W.push(roofWalkway(ring, H));
  for (let k = 0; k < ring.length; k++) {
    if (k === wall.k) continue;
    const [ax, az] = ring[k];
    const [bx, bz] = ring[(k + 1) % ring.length];
    C3.add3d(ax, az, bx, bz, H, 1.0);
  }
  // helipuerto: el punto de la terraza más lejos de los bordes
  let pad = null;
  for (let x = x0 + 2; x < x1 - 2; x += 0.8) {
    for (let z = z0 + 2; z < z1 - 2; z += 0.8) {
      if (!pointInRing(x, z, ring)) continue;
      const d = edgeDist(x, z, ring);
      if (!pad || d > pad.d) pad = { x, z, d };
    }
  }
  const padMat = new THREE.MeshBasicMaterial({ map: textTexture('H', { w: 256, h: 256, bg: '#2b2f33', fg: '#ffd400', font: 190, border: '#ffd400' }) });
  const r = Math.min(4.6, pad.d - 0.3);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 32).rotateX(-Math.PI / 2), padMat);
  disc.position.set(pad.x, H + 0.03, pad.z);
  disc.rotation.y = rot;
  disc.receiveShadow = true;
  scene.add(disc);
  return { building: tb, H, pad: { x: pad.x, z: pad.z, y: H }, foot: at(s0 - 1.2, 1.6), wall };
}

// ---------- El helicóptero ----------
function heliModel() {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.35, metalness: 0.3 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.4, metalness: 0.3 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1d2b38, roughness: 0.08, metalness: 0.9 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12).scale(1, 0.95, 1.7), white);
  body.castShadow = true;
  g.add(body);
  const stripe = new THREE.Mesh(new THREE.SphereGeometry(1.32, 16, 12, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.14).scale(1, 0.95, 1.7), red);
  g.add(stripe);
  const front = new THREE.Mesh(new THREE.SphereGeometry(1.02, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(Math.PI / 2), glass);
  front.position.set(0, 0.2, 1.3);
  g.add(front);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.32, 5, 10).rotateX(Math.PI / 2), white);
  boom.position.set(0, 0.35, -3.6);
  boom.castShadow = true;
  g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.7), red);
  fin.position.set(0, 0.8, -6);
  g.add(fin);
  const tail = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.3, 0.12), dark);
    b.rotation.x = (i * Math.PI) / 2;
    tail.add(b);
  }
  tail.position.set(0.16, 0.8, -6);
  g.add(tail);
  const rotor = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 5.4), dark);
    b.position.z = 2.6;
    const arm = new THREE.Group();
    arm.rotation.y = (i * Math.PI) / 2;
    arm.add(b);
    rotor.add(arm);
  }
  rotor.position.y = 1.55;
  g.add(rotor);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8), dark);
  mast.position.y = 1.3;
  g.add(mast);
  for (const s of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 3.2), dark);
    skid.position.set(s * 0.9, -SKID, 0);
    g.add(skid);
    for (const z of [-0.8, 0.8]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), dark);
      leg.position.set(s * 0.8, -1.15, z);
      leg.rotation.z = s * 0.25;
      g.add(leg);
    }
  }
  return { g, rotor, tail };
}

export class Heli {
  constructor(scene, tower) {
    this.scene = scene;
    const m = heliModel();
    this.g = m.g;
    this.rotor = m.rotor;
    this.tail = m.tail;
    scene.add(this.g);
    const p = tower?.pad ?? { x: 0, y: 0, z: 0 };
    this.x = p.x;
    this.z = p.z;
    this.y = p.y + SKID;
    this.yaw = 0.6;
    this.vx = this.vy = this.vz = 0;
    this.spin = 0;
    this.rpm = 0;
    this.state = 'parked';
    this.hp = 100;
    this.sync();
  }

  sync() {
    this.g.position.set(this.x, this.y, this.z);
    const fwd = this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw);
    const side = this.vx * Math.cos(this.yaw) - this.vz * Math.sin(this.yaw);
    this.g.rotation.set(Math.max(-0.35, Math.min(0.35, fwd * 0.014)), this.yaw, Math.max(-0.3, Math.min(0.3, side * 0.012)));
  }

  // piso debajo: la calle o la terraza del edificio que haya
  floorAt(x, z, world) {
    let y = world.heightAt(x, z);
    const b = world.destroy?.buildingAt(x, z);
    if (b && pointInRing(x, z, b.ring)) y = Math.max(y, b.h);
    return y;
  }

  // a mano para subirse (a pie, al lado y a la misma altura)
  near(P) {
    return this.state === 'parked' && !P.vehicle && !P.ufo && !P.dead && Math.hypot(P.x - this.x, P.z - this.z) < 4.2 && Math.abs(P.y - (this.y - SKID)) < 1.6;
  }

  board(world) {
    const P = world.player;
    this.state = 'player';
    P.ufo = this;
    P.h.root.visible = false;
    P.mvx = P.mvz = 0;
    this.vx = this.vy = this.vz = 0;
    world.combat.syncHand(P);
    world.hud.flash('¡TE ROBASTE UN HELICÓPTERO!', matchMedia('(pointer: coarse)').matches ? 'Joystick: volar · Subir/Bajar · F (cuando tocás el piso) para bajarte' : 'WASD volar · Espacio sube · Shift baja · F para bajarte cuando tocás el piso', 'ok', 4);
    if (!this.once) {
      this.once = true;
      P.addRespeto(3);
    }
  }

  hit() {}

  fly(dt, world) {
    const { input, player: P, colliders } = world;
    const ax = input.axis();
    const c = P.camYaw;
    const fx = -Math.sin(c);
    const fz = -Math.cos(c);
    const tx = (fx * -ax.y - fz * ax.x) * SPEED;
    const tz = (fz * -ax.y + fx * ax.x) * SPEED;
    const up = (input.down(' ', 'jump') ? 1 : 0) - (input.down('shift', 'c', 'down') ? 1 : 0);
    const k = Math.min(1, dt * 1.6);
    this.vx += (tx - this.vx) * k;
    this.vz += (tz - this.vz) * k;
    this.vy += (up * 9 - this.vy) * Math.min(1, dt * 2.5);
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.y += this.vy * dt;
    const floor = this.floorAt(this.x, this.z, world) + SKID;
    if (this.y < floor) {
      this.y = floor;
      this.vy = Math.max(0, this.vy);
    }
    this.y = Math.min(160, this.y);
    // paredes más altas que los patines
    const p = { x: this.x, z: this.z };
    if (colliders.resolveCircle(p, 2.2, (b) => b.h > this.y - SKID + 0.2 && !(b.y0 > this.y + 1))) {
      this.x = p.x;
      this.z = p.z;
      this.vx *= 0.4;
      this.vz *= 0.4;
    }
    // la trompa gira hacia donde va
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 1.5) {
      let d = Math.atan2(this.vx, this.vz) - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 1.8);
    }
    this.sync();
    P.x = this.x;
    P.z = this.z;
    P.y = this.y - 1.2;
    P.speed = sp;
    P.heading = this.yaw;
    const low = this.y - floor < 0.5;
    world.hud.prompt('F', low ? 'Bajarse del helicóptero' : 'Bajá hasta el piso para bajarte');
    if (input.hit('f')) {
      input.pressed.delete('f');
      if (low) this.leave(world);
      else world.hud.toast('Bajá más (Shift) para bajarte', 1.6);
    }
  }

  leave(world) {
    const P = world.player;
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const px = this.x + rx * 2.4;
    const pz = this.z + rz * 2.4;
    const ground = this.y - SKID;
    // que haya donde pararse (la calle o una terraza que se camina)
    const g = Math.max(world.heightAt(px, pz), walkwayHeight(P.walkways, px, pz, ground + 0.2));
    if (Math.abs(g - ground) > 0.6) {
      world.hud.toast('Acá no te podés bajar: aterrizá en la calle o en la terraza de la torre', 2.4);
      return;
    }
    this.state = 'parked';
    this.vx = this.vy = this.vz = 0;
    P.ufo = null;
    P.x = px;
    P.z = pz;
    P.y = g;
    P.vy = 0;
    P.h.root.visible = true;
    P.mvx = P.mvz = 0;
    world.combat.syncHand(P);
    world.hud.prompt(null);
  }

  update(dt, world) {
    const on = this.state === 'player';
    this.rpm += ((on ? 1 : 0) - this.rpm) * Math.min(1, dt * (on ? 0.8 : 0.35));
    this.spin += dt * this.rpm * 28;
    this.rotor.rotation.y = this.spin;
    this.tail.rotation.x = this.spin * 1.6;
    if (!on) this.sync();
    const P = world.player;
    const d = Math.hypot(P.x - this.x, P.z - this.z, P.y - this.y);
    world.heliVol = this.rpm * Math.max(0, 1 - d / 150) * 0.55;
  }
}
