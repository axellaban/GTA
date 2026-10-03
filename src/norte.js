// La franja norte del mapa (pedido del dueño, en su lugar real según OpenStreetMap):
// - el Sanatorio Juncal, en Juncal y Almirante Brown, sobre Almirante Brown: muy grande, blanco, con el
//   nombre arriba, la cruz roja, la H y la entrada de la guardia con su marquesina;
// - el puesto de flores de Cerrito y Almirante Brown, con la florista (se le compra un ramo con E).
// El paso a nivel de Cerrito lo arma src/trains.js solo, donde la calle cruza las vías.
import * as THREE from 'three';
import { FastBoxes } from './builder.js';
import { textTexture } from './textures.js';
import { nearestRoad } from './map.js';
import { Npc } from './npcs.js';
import { makeHuman } from './human.js';
import { makeLook } from './people.js';
import { R } from './rng.js';

// en la vereda de la esquina de Cerrito y Almirante Brown (lado de la florería de OSM)
export const FLORES = { x: -40.5, z: -1044.5 };
const RAMO = 2000;
const FLOWER_COLS = [0xe53935, 0xfdd835, 0xffffff, 0xf48fb1, 0x8e24aa, 0xff7043, 0xffeb3b, 0xc2185b];

// pared de un anillo con su normal hacia afuera
function edges(ring) {
  let cx = 0;
  let cz = 0;
  for (const [x, z] of ring) {
    cx += x;
    cz += z;
  }
  cx /= ring.length;
  cz /= ring.length;
  const out = [];
  for (let k = 0; k < ring.length; k++) {
    const [ax, az] = ring[k];
    const [bx, bz] = ring[(k + 1) % ring.length];
    const l = Math.hypot(bx - ax, bz - az);
    if (l < 3) continue;
    const ux = (bx - ax) / l;
    const uz = (bz - az) / l;
    let nx = uz;
    let nz = -ux;
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    if ((mx - cx) * nx + (mz - cz) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    out.push({ ax, az, bx, bz, ux, uz, nx, nz, l, mx, mz });
  }
  return out;
}

export class Norte {
  constructor(scene, city, npcs) {
    this.scene = scene;
    this.city = city;
    this.npcs = npcs;
    this.florista = null;
    this.ramoT = 0;
    this.buildSanatorio();
    this.buildFlores();
  }

  buildSanatorio() {
    const tb = this.city.buildingList.find((b) => b.b.extra === 'sanatorio');
    if (!tb) return;
    const { ring, h } = tb;
    // el frente: la pared más larga que da a Almirante Brown
    let front = null;
    for (const e of edges(ring)) {
      const near = nearestRoad(e.mx + e.nx * 8, e.mz + e.nz * 8);
      const onBrown = near?.road.name === 'Almirante Brown' && near.dist < 9;
      const score = (onBrown ? 1000 : 0) + e.l;
      if (!front || score > front.score) front = { ...e, score };
    }
    const e = front;
    const ang = Math.atan2(e.nx, e.nz);
    const at = (t, off, y) => new THREE.Vector3(e.ax + e.ux * t + e.nx * off, y, e.az + e.uz * t + e.nz * off);
    const F = new FastBoxes();
    const put = (w, hh, d, color, p) => F.rbox(w, hh, d, color, p.x, p.y, p.z, ang);
    // la guardia: marquesina en voladizo hasta el cordón (la vereda es angosta), puertas de vidrio y una
    // franja roja; con vereda ancha lleva columnas
    const tg = Math.min(e.l * 0.22, 12);
    // hasta dónde llega la vereda desde la pared
    const gapAt = (t) => {
      const p = at(t, 0.2, 0);
      const nr = nearestRoad(p.x, p.z);
      return nr ? Math.max(1.2, Math.min(3, nr.dist - nr.road.w / 2 - 0.3)) : 2.6;
    };
    const gap = gapAt(tg);
    put(7.2, 0.35, gap, 0xf4f4f2, at(tg, gap / 2, 3.4));
    put(7.2, 0.12, 0.06, 0xd32f2f, at(tg, gap + 0.02, 3.3));
    const posts = gap > 2.2;
    if (posts) for (const s of [-3.3, 3.3]) put(0.22, 3.3, 0.22, 0xdedede, at(tg + s, gap - 0.25, 1.65));
    put(4.2, 2.6, 0.12, 0x3d5566, at(tg, 0.06, 1.45));
    // la entrada principal: puertas de vidrio y un alero
    const tm = e.l * 0.62;
    put(5.6, 2.8, 0.12, 0x3d5566, at(tm, 0.06, 1.55));
    const am = Math.min(2.2, gapAt(tm));
    put(7, 0.25, am, 0xe9e9e6, at(tm, am / 2, 3.2));
    // bandas celestes entre pisos sobre la fachada blanca
    for (let y = 3.1; y < h - 1; y += 3.1) put(e.l - 0.6, 0.18, 0.08, 0x90caf9, at(e.l / 2, 0.05, y));
    // brazo del cartel de la H
    put(0.08, 0.08, 1.0, 0x8a939b, at(1.5, 0.5, 5.35));
    const m = F.mesh(new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = true;
    m.receiveShadow = true;
    this.scene.add(m);
    // carteles: el nombre arriba de la terraza (letras sobre un marco), el de la guardia y el de la entrada
    const sign = (text, w, hh, opts, p, double = false) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshBasicMaterial({ map: textTexture(text, opts), side: double ? THREE.DoubleSide : THREE.FrontSide }));
      mesh.position.copy(p);
      mesh.rotation.y = ang;
      this.scene.add(mesh);
      return mesh;
    };
    const big = Math.min(e.l - 4, 22);
    sign('SANATORIO JUNCAL', big, big / 8, { w: 1024, h: 128, bg: '#ffffff', fg: '#0d47a1', font: 92 }, at(e.l / 2, 0.3, h + 0.5 + big / 16));
    const fr = new FastBoxes();
    fr.rbox(big + 0.3, 0.2, 0.25, 0x9aa4ad, ...at(e.l / 2, 0.15, h + 0.45).toArray(), ang);
    for (const s of [-big / 2 + 1, 0, big / 2 - 1]) fr.rbox(0.15, big / 8 + 0.2, 0.15, 0x9aa4ad, ...at(e.l / 2 + s, 0.05, h + 0.45 + big / 16).toArray(), ang);
    this.scene.add(fr.mesh(new THREE.MeshLambertMaterial({ vertexColors: true })));
    sign('GUARDIA', 5.2, 0.62, { w: 512, h: 64, bg: '#d32f2f', fg: '#ffffff', font: 56 }, at(tg, gap + 0.03, 3.42));
    sign('SANATORIO JUNCAL', 5.4, 0.7, { w: 768, h: 100, bg: '#0d47a1', fg: '#ffffff', font: 64 }, at(tm, 0.08, 3.4));
    // la cruz roja (se ve de lejos y de noche brilla) y la H azul en la esquina
    const red = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    const cross = new THREE.Group();
    cross.add(new THREE.Mesh(new THREE.BoxGeometry(4, 1.3, 0.3), red), new THREE.Mesh(new THREE.BoxGeometry(1.3, 4, 0.3), red));
    cross.position.copy(at(e.l * 0.9, 0.2, h - 3.2));
    cross.rotation.y = ang;
    this.scene.add(cross);
    // la H azul de cartel bandera, colgada de la fachada en la esquina
    sign('H', 1.4, 1.4, { w: 128, h: 128, bg: '#1565c0', fg: '#ffffff', font: 110 }, at(1.5, 0.95, 4.6), true).rotation.y = ang + Math.PI / 2;
    if (posts) {
      for (const s of [-3.3, 3.3]) {
        const p = at(tg + s, gap - 0.25, 0);
        this.city.colliders.addCircle(p.x, p.z, 0.2, 3.3, 'prop');
      }
    }
    this.sanatorio = { x: (e.ax + e.bx) / 2 + e.nx * 4, z: (e.az + e.bz) / 2 + e.nz * 4, guardia: at(tg, 2.5, 0) };
  }

  buildFlores() {
    const { x, z } = FLORES;
    // mirando a la calle más cercana
    const near = nearestRoad(x, z);
    const heading = near ? Math.atan2(near.x - x, near.z - z) : 0;
    this.heading = heading;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const g = new THREE.Group();
    g.position.set(x, 0.15, z);
    g.rotation.y = heading;
    // +z local: hacia la calle (donde se para el cliente); -z: atrás, la florista
    const F = new FastBoxes();
    F.box(2.6, 0.85, 1.1, 0x2e6b3a, 0, 0.42, 0.1);
    F.box(2.7, 0.06, 1.2, 0x5d4037, 0, 0.87, 0.1);
    // gradas con baldes de flores
    for (let i = 0; i < 3; i++) F.box(2.5, 0.05, 0.4, 0x6d4c41, 0, 0.9 + i * 0.32, -0.15 - i * 0.28 + 0.6);
    for (const s of [-1.3, 1.3]) for (const d of [-0.42, 0.62]) F.box(0.06, 2.4, 0.06, 0x37474f, s, 1.2, d);
    F.box(2.9, 0.08, 1.6, 0x37474f, 0, 2.4, 0.12);
    const frame = F.mesh(new THREE.MeshLambertMaterial({ vertexColors: true }));
    frame.castShadow = true;
    g.add(frame);
    // toldo a rayas verdes y blancas
    const awn = textTexture(' ', { w: 64, h: 64, bg: '#ffffff' });
    const c = awn.image.getContext?.('2d');
    if (c) {
      c.fillStyle = '#2e7d32';
      for (let i = 0; i < 64; i += 16) c.fillRect(i, 0, 8, 64);
    }
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.9), new THREE.MeshLambertMaterial({ map: awn, side: THREE.DoubleSide }));
    roof.rotation.x = -Math.PI / 2 + 0.22;
    roof.position.set(0, 2.62, 0.2);
    g.add(roof);
    // los ramos: baldes y flores (una sola malla por cosa)
    const buckets = [];
    const blooms = [];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 6; j++) {
        const bx = -1.05 + j * 0.42;
        const by = 0.93 + i * 0.32;
        const bz = 0.6 - i * 0.28 - 0.15;
        buckets.push([bx, by + 0.11, bz]);
        const col = FLOWER_COLS[(i * 6 + j * 5) % FLOWER_COLS.length];
        for (let k = 0; k < 7; k++) blooms.push([bx + R.range(-0.13, 0.13), by + R.range(0.42, 0.62), bz + R.range(-0.12, 0.12), col]);
      }
    }
    const bm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.1, 0.24, 8), new THREE.MeshLambertMaterial({ color: 0x9e9e9e }), buckets.length);
    const m4 = new THREE.Matrix4();
    buckets.forEach(([a, b, d], i) => bm.setMatrixAt(i, m4.makeTranslation(a, b, d)));
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.05, 0.4, 6), new THREE.MeshLambertMaterial({ color: 0x388e3c }), buckets.length);
    buckets.forEach(([a, b, d], i) => stems.setMatrixAt(i, m4.makeTranslation(a, b + 0.25, d)));
    const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.075, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), blooms.length);
    const col = new THREE.Color();
    blooms.forEach(([a, b, d, cc], i) => {
      fl.setMatrixAt(i, m4.makeTranslation(a, b, d));
      fl.setColorAt(i, col.setHex(cc));
    });
    g.add(bm, stems, fl);
    // cartel pintado a mano
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.42), new THREE.MeshBasicMaterial({ map: textTexture('FLORES · RAMOS', { w: 512, h: 120, bg: '#fff8e1', fg: '#c2185b', font: 72, italic: true }) }));
    sg.position.set(0, 2.18, 0.93);
    g.add(sg);
    this.scene.add(g);
    this.city.colliders.addCircle(x, z, 1.25, 2.4, 'prop');
    // el cliente, del lado de la calle; la florista, atrás
    this.client = { x: x + fx * 1.6, z: z + fz * 1.6 };
    this.home = { x: x - fx * 1.25, z: z - fz * 1.25 };
    this.flores = { x, z };
  }

  spawnFlorista() {
    const look = { female: true, skin: R.pick([0xe0b090, 0xd9a882, 0xc68b62]), hair: 0x3b2618, hairStyle: 'bob', top: 'tshirt', shirt: 0x6a1b9a, longSleeves: true, pants: 0x263238, shoes: 0x1a1a1a, scale: 0.98 };
    const h = makeLook(look) || makeHuman(look);
    const n = this.npcs.add(new Npc('florista', h, this.home.x, this.home.z));
    n.look = look;
    n.state = 'idle';
    n.home = { ...this.home };
    n.heading = this.heading;
    n.hp = 90;
    n.mission = true;
    this.florista = n;
  }

  update(dt, world) {
    const P = world.player;
    // la florista: solo cuando Gaspi anda cerca (como los amigos de Clau)
    const d = Math.hypot(P.x - FLORES.x, P.z - FLORES.z);
    if (d < 150 && !this.florista) this.spawnFlorista();
    if (this.florista && (d > 200 || this.florista.dead)) {
      if (!this.florista.dead) this.florista.dead = true;
      this.florista = null;
    }
    if (this.ramoT > 0) {
      this.ramoT -= dt;
      if (this.ramoT <= 0) this.dropRamo(world);
    }
  }

  action(world) {
    const P = world.player;
    const n = this.florista;
    if (!n || P.vehicle || Math.hypot(P.x - this.client.x, P.z - this.client.z) > 2.6) return null;
    if (n.killed || n.down || n.state === 'flee' || Math.hypot(n.x - this.home.x, n.z - this.home.z) > 3) return null;
    return {
      text: `Comprar un ramo de flores ($${RAMO.toLocaleString('es-AR')})`,
      run: () => {
        if (P.money < RAMO) {
          world.hud?.toast('No te alcanza ni para un clavel');
          return;
        }
        P.addMoney(-RAMO);
        P.health = Math.min(100, P.health + 10);
        world.audio?.plata?.();
        n.say(R.pick(['¡Tomá, fresquitas! Para la novia', 'Las rosas, las más lindas', '¡Que lo disfrute, joven!', 'Con esto la conquistás, seguro']), 3);
        P.say(R.pick(['Son para mi vieja', 'Para Clau, que juega al truco', 'Para alguien especial']), 2.5);
        this.giveRamo(world);
      },
    };
  }

  // el ramo en la mano de Gaspi un rato
  giveRamo(world) {
    const hand = world.player.h?.bones?.handR;
    if (!hand) return;
    this.dropRamo(world);
    const g = new THREE.Group();
    const paper = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 8, 1, true), new THREE.MeshLambertMaterial({ color: 0xf5e6c8, side: THREE.DoubleSide }));
    paper.rotation.x = Math.PI;
    g.add(paper);
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), new THREE.MeshLambertMaterial({ color: FLOWER_COLS[i % FLOWER_COLS.length] }));
      b.position.set(R.range(-0.06, 0.06), 0.18 + R.range(0, 0.05), R.range(-0.06, 0.06));
      g.add(b);
    }
    g.position.set(0, -0.08, 0.04);
    g.rotation.set(0.3, 0, 0);
    hand.add(g);
    this.ramo = { g, hand };
    this.ramoT = 90;
  }

  dropRamo() {
    if (!this.ramo) return;
    this.ramo.hand.remove(this.ramo.g);
    this.ramo.g.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    this.ramo = null;
  }
}
