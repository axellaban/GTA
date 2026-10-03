// Interiores a lo GTA clásico: en la puerta, E y fundido a negro; adentro hay un ambiente armado
// aparte (fuera del mapa, donde no molesta a nadie) y al salir se vuelve a la calle.
// - Hall de la estación Temperley: boletería, molinetes, bancos y el cartel de próximos trenes.
//   Tiene dos salidas: a la calle y a los andenes.
// - Un kiosco del barrio: mostrador con reja, golosinas, heladera y el kiosquero, que te vende.
// - Un bar (el más cerca de la estación con cartel de bar o café): barra, botellas, la tele con el
//   partido del Gasolero y parroquianos; en la barra se pide.
// - Una pizzería: horno de ladrillo, mostrador con las pizzas, mesas con mantel a cuadros.
// Los ambientes tienen luz pareja de tubo (materiales sin iluminación, con el sombreado de cada
// cara ya puesto en los colores) y paredes con colisión.
import * as THREE from 'three';
import { FastBoxes } from './builder.js';
import { freeAfterUpload } from './textures.js';
import { makeHuman, animateHuman, randomCivilian } from './human.js';
import { makePerson, makeLook, PEOPLE } from './people.js';
import { R } from './rng.js';
import { Npc } from './npcs.js';
import { WEAPONS, pickupWeapon, handWeapon } from './weapons.js';

const HALL = { x: 1500, z: 1500 };
export const FARE_TREN = 650; // el pasaje con la SUBE (molinete o al subir al tren)
const KIOSCO = { x: 1560, z: 1500 };
const BAR = { x: 1620, z: 1500 };
const PIZZA = { x: 1680, z: 1500 };
const ARMERIA = { x: 1740, z: 1500 };
const CORREO = { x: 1810, z: 1500 };

// lo que se exhibe en la armería: [arma, precio] (chaleco y balas son especiales)
const STOCK = [
  ['revolver', 3500],
  ['pistola', 5000],
  ['escopeta', 6000],
  ['metra', 7000],
  ['molotov', 3000],
  ['ametralladora', 14000],
  ['lanzallamas', 18000],
  ['bazuca', 25000],
  ['baston', 9000],
  ['chaleco', 4000],
  ['balas', 2000],
];
const STOCK_NAME = { chaleco: 'Chaleco antibalas', balas: 'Balas para todo', molotov: '3 molotov' };

// lo que se vende en cada lugar: [texto, precio, vida]
const MENUS = {
  kiosco: { who: 'El kiosquero: "¿Qué llevás, maestro?"', items: [['Alfajor triple', 900, 15], ['Gaseosa', 1200, 25]] },
  bar: { who: 'El mozo: "¿Qué te sirvo, Gaspi?"', items: [['Fernet con coca', 2500, 35], ['Porrón de rubia', 1800, 25], ['Café con medialunas', 1400, 15]] },
  correo: { who: 'Don Manolo, el mozo: "¿Qué le sirvo, joven?"', items: [['Vermú con soda y maní', 1500, 20], ['Café en jarrito', 900, 10], ['Ginebra Bols', 1200, 15], ['Picada de salame y queso', 4500, 50]] },
  pizza: { who: 'El pizzero: "¿Qué sale, jefe?"', items: [['Porción de muzza', 1500, 30], ['Porción de fugazzeta', 1800, 35], ['Fainá', 700, 10], ['Grande de muzza', 7000, 100]] },
};

// el local real más cerca de la estación cuyo cartel dice `re` (y la puerta: una de pickups.shops)
function realShop(city, pickups, re) {
  const door = city.spots.stationDoor;
  const signs = (city.shopSigns || []).filter((s) => re.test(s.name || ''));
  signs.sort((a, b) => Math.hypot(a.x - door.x, a.z - door.z) - Math.hypot(b.x - door.x, b.z - door.z));
  for (const sgn of signs) {
    const shop = (pickups.shops || []).reduce((best, s) => (Math.hypot(s.x - sgn.x, s.z - sgn.z) < (best ? Math.hypot(best.x - sgn.x, best.z - sgn.z) : 7) ? s : best), null);
    if (shop) return { name: sgn.name, shop };
  }
  return null;
}

// cuatro paredes, techo y la luz de tubo; el anillo de colisión va aparte
function roomBox(F, W, D, H, wall, ceil = 0xe8e8e8) {
  F.box(W, H, 0.15, wall, 0, H / 2, -D / 2);
  F.box(W, H, 0.15, wall, 0, H / 2, D / 2);
  F.box(0.15, H, D, wall, -W / 2, H / 2, 0);
  F.box(0.15, H, D, wall, W / 2, H / 2, 0);
  F.box(W, 0.15, D, ceil, 0, H, 0);
  F.box(1.2, 0.05, 0.2, 0xfffbe8, 0, H - 0.1, 0);
}
function roomWalls(colliders, at, W, D) {
  colliders.addRing(
    [
      [at.x - W / 2 + 0.12, at.z - D / 2 + 0.12],
      [at.x + W / 2 - 0.12, at.z - D / 2 + 0.12],
      [at.x + W / 2 - 0.12, at.z + D / 2 - 0.12],
      [at.x - W / 2 + 0.12, at.z + D / 2 - 0.12],
    ],
    3,
    'wall',
  );
}
// mesa con dos sillas (a los costados en x)
function table(F, x, z, top = 0x6d4c33) {
  F.box(0.8, 0.05, 0.8, top, x, 0.75, z);
  F.box(0.08, 0.72, 0.08, 0x2a2a2a, x, 0.36, z);
  F.box(0.5, 0.04, 0.5, 0x2a2a2a, x, 0.02, z);
  for (const s of [-1, 1]) {
    F.box(0.42, 0.05, 0.42, 0x5a3a22, x + s * 0.75, 0.46, z);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) F.box(0.04, 0.44, 0.04, 0x3a2414, x + s * 0.75 + a * 0.17, 0.22, z + b * 0.17);
    F.box(0.04, 0.5, 0.42, 0x5a3a22, x + s * 0.94, 0.72, z);
  }
}

// sombreado fijo por cara: arriba claro, abajo oscuro, costados intermedios
function shaded(F) {
  const m = F.mesh(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const col = m.geometry.attributes.color;
  const nor = m.geometry.attributes.normal;
  for (let i = 0; i < col.count; i++) {
    const ny = nor.getY(i);
    const k = ny > 0.5 ? 1 : ny < -0.5 ? 0.6 : 0.8 + nor.getX(i) * 0.07 + nor.getZ(i) * 0.04;
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = freeAfterUpload(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// cartel plano (texto) mirando hacia +z local, girado rot
function sign(group, text, { w, h, x, y, z, rot = 0, bg = '#1b5e20', fg = '#ffffff', font = 64 }) {
  const t = canvasTex(512, Math.round((512 * h) / w), (g, W, H) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = fg;
    g.font = `bold ${font}px Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, W / 2, H / 2, W - 20);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
  m.position.set(x, y, z);
  m.rotation.y = rot;
  group.add(m);
  return m;
}

function floorTex(a, b, n = 8) {
  const t = canvasTex(256, 256, (g) => {
    const s = 256 / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = (i + j) % 2 ? a : b;
      g.fillRect(i * s, j * s, s, s);
    }
    g.fillStyle = 'rgba(0,0,0,0.06)';
    for (let k = 0; k < 400; k++) g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const GATE_BAR = new THREE.BoxGeometry(0.5, 0.035, 0.035);
const GATE_MAT = new THREE.MeshBasicMaterial({ color: 0xd9dee2 });
const GATE_LIGHT = new THREE.BoxGeometry(0.07, 0.04, 0.07);

// una persona quieta adentro (sentada, mirando el cartel, atendiendo)
function extra(group, x, z, face, pose, look) {
  const h = (!look && PEOPLE.ready && makePerson(R.chance(0.5) ? 'male' : 'female')) || makeLook(look) || makeHuman(look ?? randomCivilian());
  h.root.position.set(x, 0, z);
  h.root.rotation.y = face;
  group.add(h.root);
  return { h, pose };
}

export class Interiors {
  constructor(scene, city, colliders, pickups) {
    this.scene = scene;
    this.city = city;
    this.inside = null; // ambiente donde está Gaspi
    this.busy = false;
    this.people = [];
    this.boardT = 0;
    this.doors = [];
    this.buildHall(colliders);
    this.buildKiosco(colliders, pickups);
    this.buildBar(colliders, pickups);
    this.buildPizzeria(colliders, pickups);
    this.buildArmeria(colliders, pickups);
    this.buildCorreo(colliders, pickups);
    this.fade = document.createElement('div');
    Object.assign(this.fade.style, { position: 'fixed', inset: '0', background: '#000', opacity: '0', pointerEvents: 'none', transition: 'opacity 0.4s', zIndex: '40' });
    document.body.appendChild(this.fade);
  }

  // ---------- Hall de la estación ----------
  buildHall(colliders) {
    const g = new THREE.Group();
    g.position.set(HALL.x, 0, HALL.z);
    const F = new FastBoxes();
    const W = 16;
    const D = 10;
    const H = 5.6;
    const cream = 0xe6d9bd;
    const green = 0x2f5d46;
    // paredes, techo y zócalo verde ferroviario
    F.box(W, H, 0.2, cream, 0, H / 2, -D / 2);
    F.box(W, H, 0.2, cream, 0, H / 2, D / 2);
    F.box(0.2, H, D, cream, -W / 2, H / 2, 0);
    F.box(0.2, H, D, cream, W / 2, H / 2, 0);
    F.box(W, 0.2, D, 0xd8cdb4, 0, H, 0);
    for (const [w, d, x, z] of [
      [W, 0.05, 0, -D / 2 + 0.12],
      [W, 0.05, 0, D / 2 - 0.12],
      [0.05, D, -W / 2 + 0.12, 0],
      [0.05, D, W / 2 - 0.12, 0],
    ])
      F.box(w, 1.3, d, green, x, 0.65, z);
    // vigas del techo y tubos de luz
    for (let k = -2; k <= 2; k++) {
      F.box(0.25, 0.35, D, 0x8a6a48, k * 3.2, H - 0.25, 0);
      F.box(1.4, 0.06, 0.18, 0xfffbe8, k * 3.2 + 1.6, H - 0.5, 0);
    }
    // puerta a la calle (adelante) y a los andenes (atrás)
    F.box(2.6, 3.2, 0.1, 0x4a3020, 0, 1.6, D / 2 - 0.15);
    F.box(0.08, 3.2, 0.12, 0x2a1a10, 0, 1.6, D / 2 - 0.2);
    F.box(3.2, 3.4, 0.1, 0x1c2a22, 0, 1.7, -D / 2 + 0.15);
    // boletería: dos ventanillas con reja en la pared izquierda
    for (const z of [-1.8, 1.8]) {
      F.box(0.1, 1.1, 1.4, 0x22313a, -W / 2 + 0.15, 1.65, z);
      for (let k = 0; k < 6; k++) F.box(0.04, 1.1, 0.03, 0x1a1a1a, -W / 2 + 0.22, 1.65, z - 0.6 + k * 0.24);
      F.box(0.5, 0.08, 1.6, 0x6b4a2e, -W / 2 + 0.4, 1.05, z);
    }
    // molinetes frente a la salida a los andenes: cinco cuerpos con lector de SUBE y el trípode que gira;
    // a los costados, baranda hasta las paredes (no se pasa por al lado)
    const LZ = -D / 2 + 2.2;
    this.gates = [];
    for (let k = 0; k < 5; k++) {
      const x = -2.4 + k * 1.2;
      F.box(0.28, 1.0, 0.9, 0x9aa4ab, x, 0.5, LZ);
      F.box(0.3, 0.04, 0.92, 0x6e7880, x, 1.02, LZ);
      F.box(0.16, 0.05, 0.16, 0x1f6fb5, x, 1.06, LZ + 0.32); // lector SUBE
      const arm = new THREE.Group();
      for (let j = 0; j < 3; j++) {
        const bar = new THREE.Mesh(GATE_BAR, GATE_MAT);
        bar.position.x = 0.26;
        const holder = new THREE.Group();
        holder.rotation.z = (j * Math.PI * 2) / 3;
        holder.add(bar);
        arm.add(holder);
      }
      arm.position.set(x + 0.15, 0.92, LZ);
      g.add(arm);
      const light = new THREE.Mesh(GATE_LIGHT, new THREE.MeshBasicMaterial({ color: 0xc62828 }));
      light.position.set(x, 1.1, LZ - 0.32);
      g.add(light);
      this.gates.push({ x: HALL.x + x + 0.6, z: HALL.z + LZ, arm, light, spin: 0, target: 0, ok: 0 });
    }
    for (const [x0, x1] of [[-W / 2, -2.55], [2.55 + 0.65, W / 2]]) {
      F.box(x1 - x0, 0.05, 0.05, 0xc8ced2, (x0 + x1) / 2, 1.0, LZ);
      F.box(x1 - x0, 0.05, 0.05, 0xc8ced2, (x0 + x1) / 2, 0.55, LZ);
      for (let x = x0 + 0.4; x < x1; x += 1.2) F.box(0.05, 1.0, 0.05, 0xc8ced2, x, 0.5, LZ);
    }
    this.hallLine = HALL.z + LZ;
    // bancos de madera
    for (const z of [-2.2, 1.6]) {
      F.box(0.5, 0.08, 2.4, 0x7a5432, W / 2 - 1.2, 0.48, z);
      F.box(0.08, 0.5, 2.4, 0x7a5432, W / 2 - 0.95, 0.78, z);
      for (const dz of [-1, 1]) F.box(0.45, 0.45, 0.08, 0x333333, W / 2 - 1.2, 0.22, z + dz);
    }
    // tacho y máquina de gaseosas
    F.box(0.5, 0.9, 0.5, 0x3a5a3a, 3.5, 0.45, D / 2 - 0.6);
    F.box(1.0, 1.9, 0.8, 0xc62828, -5.6, 0.95, D / 2 - 0.6);
    F.box(0.7, 1.1, 0.05, 0x223344, -5.6, 1.2, D / 2 - 1.02);
    g.add(shaded(F));
    // piso calcáreo en damero
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: floorTex('#efe8d8', '#2b2b2b', 8) }));
    fl.material.map.repeat.set(W / 4, D / 4);
    fl.position.y = 0.01;
    g.add(fl);
    // carteles
    sign(g, 'BOLETERÍA · CARGA SUBE', { w: 3.6, h: 0.5, x: -W / 2 + 0.13, y: 2.6, z: 0, rot: Math.PI / 2, bg: '#0f5fa8' });
    sign(g, 'ANDENES ↑', { w: 2.6, h: 0.55, x: 0, y: 3.8, z: -D / 2 + 0.13, bg: '#1b5e20' });
    sign(g, 'SALIDA · AV. MEEKS', { w: 2.8, h: 0.5, x: 0, y: 3.6, z: D / 2 - 0.13, rot: Math.PI, bg: '#1b5e20' });
    sign(g, 'ESTACIÓN TEMPERLEY', { w: 5, h: 0.7, x: 0, y: 4.5, z: D / 2 - 0.13, rot: Math.PI, bg: '#10306e', font: 70 });
    // cartel de próximos trenes (se actualiza con la hora del juego)
    this.boardCanvas = document.createElement('canvas');
    this.boardCanvas.width = 512;
    this.boardCanvas.height = 300;
    this.boardTex = new THREE.CanvasTexture(this.boardCanvas);
    this.boardTex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2), new THREE.MeshBasicMaterial({ map: this.boardTex }));
    board.position.set(W / 2 - 0.13, 3, -0.3);
    board.rotation.y = -Math.PI / 2;
    g.add(board);
    // gente adentro
    this.people.push({ ...extra(g, W / 2 - 1.25, 1.2, -Math.PI / 2, 'sit'), room: 'hall' });
    this.people.push({ ...extra(g, W / 2 - 3, -0.4, Math.PI / 2, 'idle'), room: 'hall' });
    this.people.push({ ...extra(g, -W / 2 + 1.2, -1.8, -Math.PI / 2, 'idle'), room: 'hall' });
    this.people.push({ ...extra(g, -2, 1.5, 0.6, 'phone'), room: 'hall' });
    this.scene.add(g);
    this.hall = g;
    // paredes con colisión (en el marco del mundo)
    const ring = [
      [HALL.x - W / 2 + 0.15, HALL.z - D / 2 + 0.15],
      [HALL.x + W / 2 - 0.15, HALL.z - D / 2 + 0.15],
      [HALL.x + W / 2 - 0.15, HALL.z + D / 2 - 0.15],
      [HALL.x - W / 2 + 0.15, HALL.z + D / 2 - 0.15],
    ];
    colliders.addRing(ring, 5, 'wall');
    colliders.addSegment(HALL.x - W / 2, HALL.z + LZ, HALL.x + W / 2, HALL.z + LZ, 1.2, 'wall');
    // puertas
    const door = this.city.spots.stationDoor;
    const sw = this.city.spots.stationWall;
    const out = { x: door.x, z: door.z, face: sw ? Math.atan2(sw.nx, sw.nz) : 0 };
    this.doors.push({ room: 'hall', label: 'Entrar a la estación', outside: out, inside: { x: HALL.x, z: HALL.z + D / 2 - 1.6, face: Math.PI }, exit: 'Salir a la calle' });
    this.hallPlatformExit = { x: HALL.x, z: HALL.z - D / 2 + 1.2 };
    // la puerta del lado de los andenes: en la pared del edificio que da a las vías
    const pd = this.platformDoorSpot();
    if (pd) {
      this.platformDoor = { room: 'hall', label: 'Entrar a la estación', outside: pd, inside: { x: HALL.x, z: HALL.z - D / 2 + 0.9, face: 0 }, exit: 'Pasar a los andenes' };
      this.doors.push(this.platformDoor);
    }
    // gente que entra y sale por los molinetes (se mueve solo con Gaspi adentro)
    this.walkers = [];
    for (let i = 0; i < 8; i++) {
      const w = extra(g, 0, 0, 0, 'walk');
      this.walkers.push(w);
      this.resetWalker(w, true);
    }
  }

  // dónde queda la puerta de la estación del lado de las vías (afuera, sobre el andén)
  platformDoorSpot() {
    const st = this.city.buildingList?.find((b) => b.kind === 'estacion');
    const sw = this.city.spots.stationWall;
    if (!st || !sw) return null;
    // la pared opuesta a la de la plaza
    const r = st.ring;
    let best = null;
    for (let k = 0; k < r.length; k++) {
      const [ax, az] = r[k];
      const [bx, bz] = r[(k + 1) % r.length];
      const l = Math.hypot(bx - ax, bz - az);
      if (l < 8) continue;
      let nx = (bz - az) / l;
      let nz = -(bx - ax) / l;
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      // normal hacia afuera: lejos del centro del edificio
      let cx = 0;
      let cz = 0;
      for (const [x, z] of r) {
        cx += x;
        cz += z;
      }
      cx /= r.length;
      cz /= r.length;
      if ((mx - cx) * nx + (mz - cz) * nz < 0) {
        nx = -nx;
        nz = -nz;
      }
      const facing = nx * sw.nx + nz * sw.nz; // -1: opuesta a la de la plaza
      if (!best || facing < best.facing) best = { facing, x: mx + nx * 2.4, z: mz + nz * 2.4, nx, nz };
    }
    return best && best.facing < -0.5 ? { x: best.x, z: best.z, face: Math.atan2(best.nx, best.nz) } : null;
  }

  // la gente del hall: de la calle a los andenes (pasando un molinete) o al revés
  resetWalker(w, first = false) {
    const k = R.int(0, 4);
    const gate = this.gates[k];
    const toPlat = R.chance(0.5);
    const street = { x: HALL.x + R.range(-1.2, 1.2), z: HALL.z + 4.4 };
    const plat = { x: HALL.x + R.range(-1.5, 1.5), z: HALL.z - 4.4 };
    const a = { x: gate.x, z: gate.z + 0.9 };
    const b = { x: gate.x, z: gate.z - 0.9 };
    w.path = toPlat ? [street, a, b, plat] : [plat, b, a, street];
    w.gate = gate;
    w.i = first ? R.int(0, 2) : 0;
    const p = w.path[w.i];
    w.x = p.x + (first ? R.range(-0.3, 0.3) : 0);
    w.z = p.z;
    w.v = R.range(1.15, 1.5);
    w.wait = first ? 0 : R.range(0, 2.5);
  }

  updateWalkers(dt, world) {
    const P = world.player;
    for (const w of this.walkers) {
      if (w.wait > 0) {
        w.wait -= dt;
        w.h.root.visible = false;
        continue;
      }
      w.h.root.visible = true;
      const t = w.path[w.i + 1];
      if (!t) {
        this.resetWalker(w);
        continue;
      }
      const dx = t.x - w.x;
      const dz = t.z - w.z;
      const d = Math.hypot(dx, dz);
      // no le pasan por encima a Gaspi
      const blocked = Math.hypot(P.x - (w.x + (dx / (d || 1)) * 0.6), P.z - (w.z + (dz / (d || 1)) * 0.6)) < 0.55;
      const sp = blocked ? 0 : w.v;
      if (d < 0.08) {
        // pasa el molinete: bip y el trípode gira
        if (w.i === 1) this.spinGate(w.gate, world, true);
        w.i++;
      } else {
        const st = Math.min(d, sp * dt);
        w.x += (dx / d) * st;
        w.z += (dz / d) * st;
        w.h.root.rotation.y = Math.atan2(dx, dz);
      }
      w.h.root.position.set(w.x - HALL.x, 0, w.z - HALL.z);
      animateHuman(w.h, dt, sp, 'walk');
    }
  }

  spinGate(gate, world, ok) {
    gate.target += (Math.PI * 2) / 3;
    gate.ok = ok ? 0.8 : -0.8;
    if (world && this.inside?.room === 'hall') {
      if (ok) world.audio.tone([1760], 0.08, 'square', 0.05);
      else world.audio.tone([440, 330], 0.25, 'square', 0.06);
    }
  }

  updateGates(dt) {
    for (const g of this.gates || []) {
      g.spin += (g.target - g.spin) * Math.min(1, dt * 9);
      g.arm.rotation.z = g.spin;
      g.ok -= Math.sign(g.ok) * Math.min(Math.abs(g.ok), dt);
      g.light.material.color.setHex(g.ok > 0 ? 0x43a047 : 0xc62828);
    }
  }

  // pasar el molinete: con la SUBE (paga), colado de un salto (el de seguridad a veces te ve) o salir
  turnstile(world, gate, dir, mode) {
    const P = world.player;
    const { hud, audio } = world;
    const from = { x: gate.x, z: gate.z + dir * 0.9 };
    const to = { x: gate.x, z: gate.z - dir * 0.9 };
    if (mode === 'sube') {
      if (P.money < FARE_TREN) return hud.toast('No te alcanza la SUBE', 1.8);
      P.addMoney(-FARE_TREN);
      P.fareT = 600; // con eso viaja (src/transit.js)
      audio.tone([1760, 1760], 0.07, 'square', 0.06);
      hud.toast(`SUBE: -$${FARE_TREN} · Saldo $${P.money.toLocaleString('es-AR')}`, 1.8);
    }
    this.spinGate(gate, null, true);
    P.x = from.x;
    P.z = from.z;
    P.auto = {
      from,
      to,
      t: 0,
      dur: mode === 'salto' ? 0.7 : 1.0,
      jump: mode === 'salto',
      done: () => {
        if (mode !== 'salto') return;
        if (R.chance(0.45)) {
          world.hud.flash('¡TE COLASTE!', 'El de seguridad te vio saltar el molinete', 'bad', 2.2);
          const door = this.city.spots.stationDoor;
          world.police.crime('colado', door.x, door.z);
          if (world.police.stars === 0) {
            world.police.heat = Math.max(world.police.heat, 1.05);
            world.police.updateStars();
          }
        } else world.hud.toast('Te colaste. Nadie vio nada', 1.8);
      },
    };
  }

  drawBoard(world) {
    const g = this.boardCanvas.getContext('2d');
    g.fillStyle = '#0b0b0b';
    g.fillRect(0, 0, 512, 300);
    g.fillStyle = '#ffb300';
    g.font = 'bold 30px monospace';
    g.fillText('PRÓXIMOS TRENES', 18, 40);
    g.font = 'bold 24px monospace';
    const now = world.time.hour;
    const rows = (world.trains?.routes || []).slice(0, 5).map((r, i) => {
      const h = (now + 0.05 + i * 0.12 + ((i * 7) % 5) * 0.03) % 24;
      const hh = String(Math.floor(h)).padStart(2, '0');
      const mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
      return [r.name.toUpperCase().slice(0, 13), `${hh}:${mm}`, `AND ${1 + (i % 3)}`];
    });
    rows.forEach(([d, t, a], i) => {
      const y = 92 + i * 42;
      g.fillStyle = '#ffd54f';
      g.fillText(d.padEnd(13, ' '), 18, y);
      g.fillText(t, 300, y);
      g.fillStyle = '#9ccc65';
      g.fillText(a, 410, y);
    });
    this.boardTex.needsUpdate = true;
  }

  // ---------- Kiosco ----------
  buildKiosco(colliders, pickups) {
    // un kiosco de verdad del mapa: el cartel "KIOSCO" más cerca de la estación
    const door = this.city.spots.stationDoor;
    const signs = (this.city.shopSigns || []).filter((s) => /KIOSCO/i.test(s.name || ''));
    signs.sort((a, b) => Math.hypot(a.x - door.x, a.z - door.z) - Math.hypot(b.x - door.x, b.z - door.z));
    const sgn = signs[0];
    const shop = sgn && (pickups.shops || []).reduce((best, s) => (Math.hypot(s.x - sgn.x, s.z - sgn.z) < (best ? Math.hypot(best.x - sgn.x, best.z - sgn.z) : 7) ? s : best), null);
    if (!shop) return;
    this.kioscoName = sgn.name;
    const g = new THREE.Group();
    g.position.set(KIOSCO.x, 0, KIOSCO.z);
    const F = new FastBoxes();
    const W = 4.6;
    const D = 5;
    const H = 3;
    const wall = 0xf0e6d2;
    F.box(W, H, 0.15, wall, 0, H / 2, -D / 2);
    F.box(W, H, 0.15, wall, 0, H / 2, D / 2);
    F.box(0.15, H, D, wall, -W / 2, H / 2, 0);
    F.box(0.15, H, D, wall, W / 2, H / 2, 0);
    F.box(W, 0.15, D, 0xe8e8e8, 0, H, 0);
    F.box(1.2, 0.05, 0.2, 0xfffbe8, 0, H - 0.1, 0);
    // puerta de vidrio con reja
    F.box(1.1, 2.3, 0.06, 0x3d5566, 0, 1.15, D / 2 - 0.1);
    for (let k = 0; k < 5; k++) F.box(0.03, 2.3, 0.03, 0x1a1a1a, -0.44 + k * 0.22, 1.15, D / 2 - 0.15);
    // mostrador con vidrio y la reja de la ventanita
    F.box(W - 0.4, 1.0, 0.6, 0x8d6e4a, 0, 0.5, -0.6);
    F.box(W - 0.4, 0.04, 0.62, 0xbcd6e0, 0, 1.02, -0.6);
    for (let k = 0; k < 12; k++) F.box(0.03, 1.2, 0.03, 0x222222, -W / 2 + 0.4 + k * 0.35, 1.65, -0.35);
    F.box(W - 0.4, 0.05, 0.05, 0x222222, 0, 2.25, -0.35);
    // estantes con golosinas atrás y a los costados
    const cols = [0xe53935, 0xfdd835, 0x1e88e5, 0x43a047, 0xfb8c00, 0x8e24aa, 0xffffff, 0x6d4c41];
    for (let row = 0; row < 4; row++) {
      F.box(W - 0.4, 0.04, 0.35, 0x9e9e9e, 0, 0.9 + row * 0.42, -D / 2 + 0.3);
      for (let k = 0; k < 16; k++) F.box(0.18, 0.22 + (k % 3) * 0.04, 0.25, cols[(k + row * 3) % cols.length], -W / 2 + 0.45 + k * 0.24, 1.04 + row * 0.42, -D / 2 + 0.3);
    }
    for (const sx of [-1, 1]) {
      for (let row = 0; row < 3; row++) {
        F.box(0.35, 0.04, 2, 0x9e9e9e, sx * (W / 2 - 0.25), 0.7 + row * 0.45, 1.1);
        for (let k = 0; k < 7; k++) F.box(0.22, 0.2, 0.2, cols[(k * 3 + row) % cols.length], sx * (W / 2 - 0.25), 0.82 + row * 0.45, 0.3 + k * 0.26);
      }
    }
    // heladera de bebidas con puerta de vidrio
    F.box(0.8, 1.9, 0.7, 0xe0e0e0, -W / 2 + 0.55, 0.95, -1.6);
    F.box(0.05, 1.6, 0.6, 0x9fd3e6, -W / 2 + 0.97, 1.0, -1.6);
    for (let row = 0; row < 4; row++) for (let k = 0; k < 3; k++) F.box(0.08, 0.25, 0.08, [0xb71c1c, 0x1b5e20, 0xff6f00][k], -W / 2 + 0.75, 0.45 + row * 0.38, -1.8 + k * 0.2);
    g.add(shaded(F));
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: floorTex('#c9c2b4', '#a59d8e', 6) }));
    fl.material.map.repeat.set(W / 1.5, D / 1.5);
    fl.position.y = 0.01;
    g.add(fl);
    sign(g, this.kioscoName, { w: 2.6, h: 0.45, x: 0, y: 2.6, z: -D / 2 + 0.09, bg: '#c62828', font: 60 });
    sign(g, 'QUINIELA · CARGÁ TU SUBE', { w: 2.4, h: 0.35, x: W / 2 - 0.09, y: 2.4, z: 1.1, rot: -Math.PI / 2, bg: '#0f5fa8', font: 46 });
    // el kiosquero
    this.people.push({ ...extra(g, 0.3, -1.4, 0, 'idle'), room: 'kiosco' });
    this.scene.add(g);
    colliders.addRing(
      [
        [KIOSCO.x - W / 2 + 0.12, KIOSCO.z - D / 2 + 0.12],
        [KIOSCO.x + W / 2 - 0.12, KIOSCO.z - D / 2 + 0.12],
        [KIOSCO.x + W / 2 - 0.12, KIOSCO.z + D / 2 - 0.12],
        [KIOSCO.x - W / 2 + 0.12, KIOSCO.z + D / 2 - 0.12],
      ],
      3,
      'wall',
    );
    colliders.addSegment(KIOSCO.x - W / 2, KIOSCO.z - 0.3, KIOSCO.x + W / 2, KIOSCO.z - 0.3, 1, 'wall');
    this.counter = { x: KIOSCO.x, z: KIOSCO.z + 0.2 };
    this.doors.push({ room: 'kiosco', label: `Entrar al kiosco "${this.kioscoName}"`, outside: { x: shop.x, z: shop.z, face: Math.atan2(shop.nx, shop.nz) }, inside: { x: KIOSCO.x, z: KIOSCO.z + D / 2 - 1.1, face: Math.PI }, exit: 'Salir a la calle' });
  }

  // ---------- Bar ----------
  buildBar(colliders, pickups) {
    const real = realShop(this.city, pickups, /\bBAR\b|CAF[EÉ]|BODEG|CERVEC|\bPUB\b|CONFITER/i);
    if (!real) return;
    this.barName = real.name;
    const g = new THREE.Group();
    g.position.set(BAR.x, 0, BAR.z);
    const F = new FastBoxes();
    const W = 7;
    const D = 6.4;
    const H = 3.2;
    roomBox(F, W, D, H, 0xe8dcc0, 0xd8cfbf);
    // zócalo de madera
    for (const [w, d, x, z] of [[W, 0.04, 0, -D / 2 + 0.1], [W, 0.04, 0, D / 2 - 0.1], [0.04, D, -W / 2 + 0.1, 0], [0.04, D, W / 2 - 0.1, 0]]) F.box(w, 1.1, d, 0x5d3a1a, x, 0.55, z);
    // la barra
    const bz = -D / 2 + 1.5;
    F.box(W - 2, 1.08, 0.6, 0x6d4422, -0.6, 0.54, bz);
    F.box(W - 1.9, 0.06, 0.7, 0x3e2510, -0.6, 1.1, bz);
    F.box(W - 2, 0.06, 0.06, 0xc9a227, -0.6, 0.18, bz + 0.33);
    // banquetas
    for (let k = 0; k < 5; k++) {
      const x = -W / 2 + 1.3 + k * 0.95;
      F.box(0.36, 0.06, 0.36, 0x8b1a1a, x, 0.76, bz + 0.75);
      F.box(0.06, 0.74, 0.06, 0x2a2a2a, x, 0.37, bz + 0.75);
      F.box(0.3, 0.03, 0.3, 0x2a2a2a, x, 0.02, bz + 0.75);
    }
    // estantes con botellas atrás de la barra (y el espejo)
    F.box(W - 2.4, 1.3, 0.03, 0x9fb6c0, -0.6, 1.9, -D / 2 + 0.1);
    const bottles = [0x1b5e20, 0x8d5524, 0xc9a227, 0x4e342e, 0xd7ccc8, 0x2e7d32, 0x6d1b1b, 0xffb300];
    for (let row = 0; row < 3; row++) {
      F.box(W - 2.2, 0.04, 0.28, 0x3e2510, -0.6, 1.35 + row * 0.5, -D / 2 + 0.22);
      for (let k = 0; k < 18; k++) F.box(0.08, 0.3 - (k % 3) * 0.04, 0.08, bottles[(k * 5 + row) % bottles.length], -W / 2 + 1.35 + k * 0.27, 1.52 + row * 0.5, -D / 2 + 0.24);
    }
    // canilla de cerveza y la heladera
    F.box(0.12, 0.35, 0.12, 0xc0c0c0, 0.8, 1.3, bz);
    F.box(0.8, 1.9, 0.6, 0xd0d0d0, W / 2 - 0.6, 0.95, -D / 2 + 0.5);
    // mesas
    table(F, -1.6, 1.4);
    table(F, 1.6, 1.4);
    g.add(shaded(F));
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: floorTex('#7a5a3c', '#6a4c31', 10) }));
    fl.material.map.repeat.set(W / 2, D / 2);
    fl.position.y = 0.01;
    g.add(fl);
    sign(g, this.barName, { w: 3, h: 0.5, x: -0.6, y: 2.85, z: -D / 2 + 0.09, bg: '#3e2510', fg: '#ffd27a', font: 60 });
    // la tele con el partido del Gasolero
    const tv = canvasTex(320, 180, (c, w, h) => {
      c.fillStyle = '#2e7d32';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = 3;
      c.strokeRect(10, 10, w - 20, h - 20);
      c.beginPath();
      c.arc(w / 2, h / 2, 26, 0, Math.PI * 2);
      c.moveTo(w / 2, 10);
      c.lineTo(w / 2, h - 10);
      c.stroke();
      c.fillStyle = 'rgba(0,0,0,0.65)';
      c.fillRect(8, 8, 190, 30);
      c.fillStyle = '#ffffff';
      c.font = 'bold 20px Arial';
      c.fillText('TEMPERLEY 2 - 0 BANFIELD', 14, 30);
    });
    const tvm = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.75), new THREE.MeshBasicMaterial({ map: tv }));
    tvm.position.set(W / 2 - 0.1, 2.3, 0.6);
    tvm.rotation.y = -Math.PI / 2;
    g.add(tvm);
    sign(g, 'EL GASOLERO · TEMPERLEY', { w: 2.4, h: 0.4, x: -W / 2 + 0.09, y: 2.4, z: 0.8, rot: Math.PI / 2, bg: '#5bb8e8', fg: '#ffffff', font: 46 });
    // el mozo y los parroquianos mirando el partido
    this.people.push({ ...extra(g, -0.6, bz - 0.7, 0, 'idle'), room: 'bar' });
    for (const [x, face] of [[-W / 2 + 2.25, -Math.PI / 2], [-W / 2 + 4.15, -Math.PI / 2]]) {
      const p = extra(g, x, bz + 0.8, face + Math.PI, 'sit');
      p.h.root.position.y = 0.3;
      this.people.push({ ...p, room: 'bar' });
    }
    const p = extra(g, 1.6 - 0.75, 1.4, Math.PI / 2, 'sit');
    this.people.push({ ...p, room: 'bar' });
    this.scene.add(g);
    roomWalls(colliders, BAR, W, D);
    colliders.addSegment(BAR.x - W / 2, BAR.z + bz + 0.35, BAR.x + W / 2 - 1.1, BAR.z + bz + 0.35, 1, 'wall');
    this.barCounter = { x: BAR.x + 0.4, z: BAR.z + bz + 0.75 };
    this.doors.push({ room: 'bar', label: `Entrar al bar "${this.barName}"`, outside: { x: real.shop.x, z: real.shop.z, face: Math.atan2(real.shop.nx, real.shop.nz) }, inside: { x: BAR.x, z: BAR.z + D / 2 - 1.1, face: Math.PI }, exit: 'Salir a la calle' });
  }

  // ---------- El Viejo Correo (Av. Meeks 1357): bar notable, clásico y antiguo ----------
  // Boiserie de madera oscura, piso de damero, barra larga con estaño y caja registradora, espejo con
  // estantes de botellas, ventiladores de techo, mesas de mármol con sillas de Viena, la pared de los
  // casilleros de bronce del viejo correo y el buzón rojo. Atiende Don Manolo (chaleco y moñito) y hay
  // parroquianos jugando al truco y leyendo el diario.
  buildCorreo(colliders, pickups) {
    const real = realShop(this.city, pickups, /VIEJO CORREO/i);
    if (!real) return;
    const g = new THREE.Group();
    g.position.set(CORREO.x, 0, CORREO.z);
    const F = new FastBoxes();
    const W = 9;
    const D = 7.4;
    const H = 3.8;
    roomBox(F, W, D, H, 0xd9c49a, 0x6b4a2e);
    // boiserie: madera oscura hasta 1,5 m con moldura
    for (const [w, d, x, z] of [[W, 0.05, 0, -D / 2 + 0.1], [W, 0.05, 0, D / 2 - 0.1], [0.05, D, -W / 2 + 0.1, 0], [0.05, D, W / 2 - 0.1, 0]]) {
      F.box(w, 1.5, d, 0x4a2a14, x, 0.75, z);
      F.box(w + (d < 0.1 && w > 1 ? 0 : 0.02), 0.08, d + 0.04, 0x7a5030, x, 1.52, z);
    }
    // cornisa arriba
    for (const [w, d, x, z] of [[W, 0.12, 0, -D / 2 + 0.12], [W, 0.12, 0, D / 2 - 0.12], [0.12, D, -W / 2 + 0.12, 0], [0.12, D, W / 2 - 0.12, 0]]) F.box(w, 0.18, d, 0x5a3a20, x, H - 0.2, z);
    // la barra larga con tapa de estaño y apoyapié de bronce
    const bz = -D / 2 + 1.7;
    F.box(W - 2.6, 1.1, 0.62, 0x4a2a14, -0.7, 0.55, bz);
    for (let k = 0; k < 7; k++) F.box(0.04, 0.8, 0.02, 0x2e1a0c, -W / 2 + 1.2 + k * 0.92, 0.55, bz + 0.32);
    F.box(W - 2.5, 0.06, 0.74, 0xb8b8b0, -0.7, 1.13, bz);
    F.box(W - 2.6, 0.05, 0.05, 0xc9a227, -0.7, 0.2, bz + 0.38);
    // caja registradora antigua y la cafetera de bronce
    F.box(0.45, 0.32, 0.36, 0x8a6a2a, 1.6, 1.32, bz - 0.05);
    F.box(0.42, 0.14, 0.2, 0xc9a227, 1.6, 1.55, bz - 0.12);
    F.box(0.5, 0.55, 0.38, 0xc9a227, -2.6, 1.43, bz - 0.08);
    F.box(0.2, 0.18, 0.2, 0x8a6a2a, -2.6, 1.8, bz - 0.08);
    // banquetas altas
    for (let k = 0; k < 6; k++) {
      const x = -W / 2 + 1.4 + k * 0.95;
      F.box(0.38, 0.07, 0.38, 0x6b1a1a, x, 0.78, bz + 0.8);
      F.box(0.06, 0.76, 0.06, 0xc9a227, x, 0.38, bz + 0.8);
      F.box(0.32, 0.03, 0.32, 0x2a2a2a, x, 0.02, bz + 0.8);
    }
    // espejo con marco y estantes con botellas (vermú, ginebra, licores)
    F.box(W - 2.4, 1.5, 0.04, 0x8fa3a8, -0.7, 2.25, -D / 2 + 0.11);
    F.box(W - 2.2, 0.1, 0.08, 0x5a3a20, -0.7, 3.04, -D / 2 + 0.12);
    const bottles = [0x5d1a1a, 0x1b4d2a, 0xc9a227, 0x3e2510, 0xd7ccc8, 0x7a1f1f, 0x2e4a1e, 0xb5651d];
    for (let row = 0; row < 3; row++) {
      F.box(W - 2.6, 0.04, 0.26, 0x5a3a20, -0.7, 1.55 + row * 0.48, -D / 2 + 0.22);
      for (let k = 0; k < 22; k++) F.box(0.08, 0.32 - (k % 3) * 0.05, 0.08, bottles[(k * 3 + row) % bottles.length], -W / 2 + 1.5 + k * 0.27, 1.73 + row * 0.48, -D / 2 + 0.24);
    }
    // casilleros de bronce del viejo correo (la pared de la izquierda)
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 9; c++) {
        const z = -1.8 + c * 0.42;
        F.box(0.04, 0.34, 0.38, (r + c) % 4 ? 0xb08a3a : 0x9a7428, -W / 2 + 0.14, 1.75 + r * 0.33, z);
        F.box(0.05, 0.05, 0.05, 0x3a2a14, -W / 2 + 0.17, 1.82 + r * 0.33, z + 0.1);
      }
    }
    // el buzón rojo de pie
    F.box(0.5, 1.1, 0.42, 0xb71c1c, -W / 2 + 0.55, 0.65, 2.3);
    F.box(0.56, 0.1, 0.48, 0x8a1010, -W / 2 + 0.55, 1.24, 2.3);
    F.box(0.3, 0.04, 0.02, 0x111111, -W / 2 + 0.81, 1.0, 2.3);
    // mesas de mármol con sillas de Viena
    const marble = 0xe8e4dc;
    for (const [x, z] of [[-2.3, 1.0], [0.4, 1.0], [3.0, 0.4], [-0.9, 2.6], [2.0, 2.5]]) {
      F.box(0.75, 0.05, 0.75, marble, x, 0.76, z);
      F.box(0.06, 0.72, 0.06, 0x1a1a1a, x, 0.37, z);
      F.box(0.45, 0.03, 0.45, 0x1a1a1a, x, 0.02, z);
      for (const s of [-1, 1]) {
        F.box(0.4, 0.04, 0.4, 0x3e2510, x + s * 0.7, 0.46, z);
        for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) F.box(0.03, 0.44, 0.03, 0x2e1a0c, x + s * 0.7 + a * 0.16, 0.22, z + b * 0.16);
        F.box(0.03, 0.55, 0.36, 0x3e2510, x + s * 0.88, 0.74, z);
      }
    }
    // naipes y vasitos en la mesa del truco
    for (let k = 0; k < 4; k++) F.box(0.07, 0.01, 0.1, 0xf5f0e6, -2.45 + k * 0.1, 0.79, 0.95 + (k % 2) * 0.08);
    for (const [x, z] of [[-2.05, 1.2], [-2.55, 0.75], [0.6, 1.15]]) F.box(0.06, 0.1, 0.06, 0x7a1f1f, x, 0.84, z);
    // lámparas colgantes (globos tibios) y dos ventiladores de techo
    for (const [x, z] of [[-2.3, 1.0], [0.4, 1.0], [3.0, 0.4], [-2.5, bz], [1.5, bz]]) {
      F.box(0.02, 0.8, 0.02, 0x222222, x, H - 0.45, z);
      F.box(0.28, 0.22, 0.28, 0xffe0a0, x, H - 0.95, z);
    }
    g.add(shaded(F));
    // el piso de damero blanco y negro
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: floorTex('#efe9dc', '#1e1e1e', 8) }));
    fl.material.map.repeat.set(W / 1.6, D / 1.6);
    fl.position.y = 0.01;
    g.add(fl);
    this.correoFans = [];
    for (const x of [-1.6, 2.2]) {
      const fan = new THREE.Group();
      const blade = new THREE.MeshBasicMaterial({ color: 0x4a2a14 });
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.16), blade);
        b.position.x = 0.5;
        const arm = new THREE.Group();
        arm.rotation.y = (i * Math.PI) / 2;
        arm.add(b);
        fan.add(arm);
      }
      fan.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 10), new THREE.MeshBasicMaterial({ color: 0xc9a227 })));
      fan.position.set(x, H - 0.45, 1.7);
      g.add(fan);
      this.correoFans.push(fan);
    }
    // carteles y cuadros: el nombre sobre el espejo, Correos y Telégrafos y la foto del Temperley de antes
    sign(g, 'EL VIEJO CORREO', { w: 3.6, h: 0.5, x: -0.7, y: 3.35, z: -D / 2 + 0.1, bg: '#1f3d2b', fg: '#e8c66a', font: 64 });
    sign(g, 'CORREOS Y TELÉGRAFOS', { w: 2.4, h: 0.32, x: -W / 2 + 0.1, y: 3.95 - 0.55, z: -0.1, rot: Math.PI / 2, bg: '#6b1a1a', fg: '#f3e6c4', font: 50 });
    const foto = canvasTex(256, 180, (c, w, h) => {
      c.fillStyle = '#3a2a1a';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#c9b48a';
      c.fillRect(12, 12, w - 24, h - 24);
      // la estación vieja en sepia: el andén, el techo y una locomotora
      c.fillStyle = '#8a7350';
      c.fillRect(24, 110, w - 48, 14);
      c.fillRect(40, 60, 120, 10);
      for (let k = 0; k < 5; k++) c.fillRect(46 + k * 26, 70, 4, 40);
      c.fillStyle = '#5a4630';
      c.fillRect(150, 80, 70, 30);
      c.fillRect(196, 62, 10, 18);
      c.beginPath();
      c.arc(166, 112, 8, 0, Math.PI * 2);
      c.arc(204, 112, 8, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#3a2a1a';
      c.font = 'italic 16px Georgia, serif';
      c.fillText('Temperley, 1910', 30, 150);
    });
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.78), new THREE.MeshBasicMaterial({ map: foto }));
    frame.position.set(W / 2 - 0.12, 2.3, -0.6);
    frame.rotation.y = -Math.PI / 2;
    g.add(frame);
    const tango = canvasTex(180, 256, (c, w, h) => {
      c.fillStyle = '#e8dcc0';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#7a1f1f';
      c.font = 'bold 30px Georgia, serif';
      c.textAlign = 'center';
      c.fillText('GRAN', w / 2, 46);
      c.fillText('BAILE', w / 2, 80);
      c.fillStyle = '#1a1a1a';
      c.font = 'italic 22px Georgia, serif';
      c.fillText('de tango', w / 2, 112);
      c.fillRect(70, 130, 40, 70);
      c.beginPath();
      c.arc(90, 124, 14, 0, Math.PI * 2);
      c.fill();
      c.font = '16px Georgia, serif';
      c.fillText('Sábado 22 hs', w / 2, 230);
    });
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.85), new THREE.MeshBasicMaterial({ map: tango }));
    poster.position.set(W / 2 - 0.12, 2.25, 1.6);
    poster.rotation.y = -Math.PI / 2;
    g.add(poster);
    // Don Manolo atrás de la barra; el truco y el del diario
    const manolo = extra(g, -0.4, bz - 0.75, 0, 'idle', { skin: 0xe0b896, hair: 0xd9d9d9, hairStyle: 'bald', mustache: true, shirt: 0xf5f5f5, jacket: 0x2a1a10, tie: 0x111111, pants: 0x1a1a1a, belly: true, scale: 1.0 });
    this.people.push({ ...manolo, room: 'correo' });
    for (const [x, z, face] of [[-3.0, 1.0, Math.PI / 2], [-1.6, 1.0, -Math.PI / 2], [1.1, 1.0, -Math.PI / 2], [2.7, 2.5, -Math.PI / 2]]) {
      const p = extra(g, x, z, face, 'sit', { ...randomCivilian(), hair: R.pick([0xd9d9d9, 0xbdbdbd, 0x5a5a5a]), cap: R.chance(0.3) ? 0x3a3a3a : null, longSleeves: true });
      p.h.root.position.y = 0.05;
      this.people.push({ ...p, room: 'correo' });
    }
    this.scene.add(g);
    roomWalls(colliders, CORREO, W, D);
    colliders.addSegment(CORREO.x - W / 2, CORREO.z + bz + 0.36, CORREO.x + W / 2 - 1.3, CORREO.z + bz + 0.36, 1, 'wall');
    for (const [x, z] of [[-2.3, 1.0], [0.4, 1.0], [3.0, 0.4], [-0.9, 2.6], [2.0, 2.5]]) colliders.addCircle(CORREO.x + x, CORREO.z + z, 0.45, 1, 'prop');
    this.correoCounter = { x: CORREO.x - 0.4, z: CORREO.z + bz + 0.8 };
    this.doors.push({ room: 'correo', label: 'Entrar a El Viejo Correo', outside: { x: real.shop.x, z: real.shop.z, face: Math.atan2(real.shop.nx, real.shop.nz) }, inside: { x: CORREO.x + 2.6, z: CORREO.z + D / 2 - 1.1, face: Math.PI }, exit: 'Salir a Meeks' });
  }

  // ---------- Pizzería ----------
  buildPizzeria(colliders, pickups) {
    const real = realShop(this.city, pickups, /PIZZ/i);
    if (!real) return;
    this.pizzaName = real.name;
    const g = new THREE.Group();
    g.position.set(PIZZA.x, 0, PIZZA.z);
    const F = new FastBoxes();
    const W = 6.6;
    const D = 6.2;
    const H = 3.1;
    roomBox(F, W, D, H, 0xf4f1ea);
    // guarda de azulejos rojos
    for (const [w, d, x, z] of [[W, 0.04, 0, -D / 2 + 0.1], [W, 0.04, 0, D / 2 - 0.1], [0.04, D, -W / 2 + 0.1, 0], [0.04, D, W / 2 - 0.1, 0]]) F.box(w, 0.18, d, 0xc62828, x, 1.45, z);
    // horno de ladrillo con la boca encendida
    F.box(2.0, 1.6, 1.4, 0xa0522d, W / 2 - 1.2, 0.8, -D / 2 + 0.8);
    F.box(1.7, 0.5, 1.2, 0x8b4513, W / 2 - 1.2, 1.85, -D / 2 + 0.8);
    F.box(0.9, 0.55, 0.05, 0x1a0d05, W / 2 - 1.2, 1.15, -D / 2 + 1.52);
    F.box(0.7, 0.2, 0.04, 0xff8a1a, W / 2 - 1.2, 1.0, -D / 2 + 1.55);
    F.box(0.3, 1.3, 0.3, 0x6d3b1e, W / 2 - 1.2, 2.45, -D / 2 + 0.6);
    // mostrador con vitrina
    const cz = -D / 2 + 1.9;
    F.box(3.4, 1.0, 0.7, 0xd9d2c4, -1.1, 0.5, cz);
    F.box(3.4, 0.04, 0.72, 0x2a2a2a, -1.1, 1.02, cz);
    F.box(3.3, 0.35, 0.03, 0xbcd6e0, -1.1, 1.22, cz + 0.33);
    // mesas con mantel a cuadros
    table(F, -1.5, 1.3, 0xffffff);
    table(F, 1.6, 1.3, 0xffffff);
    g.add(shaded(F));
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: floorTex('#efefef', '#262626', 8) }));
    fl.material.map.repeat.set(W / 2, D / 2);
    fl.position.y = 0.01;
    g.add(fl);
    // manteles y pizzas (planos con dibujo)
    const cloth = canvasTex(128, 128, (c, w) => {
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
        c.fillStyle = (i + j) % 2 ? '#c62828' : '#ffffff';
        c.fillRect(i * 16, j * 16, 16, 16);
      }
    });
    for (const x of [-1.5, 1.6]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: cloth }));
      m.position.set(x, 0.78, 1.3);
      g.add(m);
    }
    const pizzaTex = (fug) =>
      canvasTex(128, 128, (c, w) => {
        c.fillStyle = '#d9a35a';
        c.beginPath();
        c.arc(64, 64, 62, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = fug ? '#f3ead2' : '#f7e08a';
        c.beginPath();
        c.arc(64, 64, 54, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = fug ? '#c9b98a' : '#c0392b';
        for (let k = 0; k < 26; k++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * 46;
          c.beginPath();
          c.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, fug ? 6 : 3, 0, Math.PI * 2);
          c.fill();
        }
        if (!fug) {
          c.fillStyle = '#2e5d1e';
          for (let k = 0; k < 6; k++) c.fillRect(30 + Math.random() * 68, 30 + Math.random() * 68, 4, 4);
        }
      });
    const pz = new THREE.CircleGeometry(0.22, 20).rotateX(-Math.PI / 2);
    [false, true, false].forEach((fug, i) => {
      const m = new THREE.Mesh(pz, new THREE.MeshBasicMaterial({ map: pizzaTex(fug) }));
      m.position.set(-2.2 + i * 1.1, 1.05, cz);
      g.add(m);
    });
    const onTable = new THREE.Mesh(pz, new THREE.MeshBasicMaterial({ map: pizzaTex(false) }));
    onTable.position.set(1.6, 0.8, 1.3);
    g.add(onTable);
    sign(g, this.pizzaName, { w: 3, h: 0.5, x: -1.1, y: 2.6, z: -D / 2 + 0.09, bg: '#c62828', fg: '#ffffff', font: 60 });
    sign(g, 'MUZZA · FUGAZZETTA · FAINÁ · NAPOLITANA', { w: 3, h: 0.36, x: -W / 2 + 0.09, y: 2.3, z: 0.6, rot: Math.PI / 2, bg: '#1b1b1b', fg: '#ffd27a', font: 34 });
    this.people.push({ ...extra(g, -1.1, cz - 0.75, 0, 'idle'), room: 'pizza' });
    const p = extra(g, -1.5 - 0.75, 1.3, -Math.PI / 2, 'sit');
    this.people.push({ ...p, room: 'pizza' });
    const q = extra(g, 1.6 + 0.75, 1.3, Math.PI / 2, 'sit');
    this.people.push({ ...q, room: 'pizza' });
    this.scene.add(g);
    roomWalls(colliders, PIZZA, W, D);
    colliders.addSegment(PIZZA.x - W / 2, PIZZA.z + cz + 0.38, PIZZA.x + 0.6, PIZZA.z + cz + 0.38, 1, 'wall');
    colliders.addSegment(PIZZA.x + W / 2 - 2.2, PIZZA.z - D / 2 + 1.5, PIZZA.x + W / 2, PIZZA.z - D / 2 + 1.5, 1.6, 'wall');
    this.pizzaCounter = { x: PIZZA.x - 1.1, z: PIZZA.z + cz + 0.75 };
    this.doors.push({ room: 'pizza', label: `Entrar a la pizzería "${this.pizzaName}"`, outside: { x: real.shop.x, z: real.shop.z, face: Math.atan2(real.shop.nx, real.shop.nz) }, inside: { x: PIZZA.x, z: PIZZA.z + D / 2 - 1.1, face: Math.PI }, exit: 'Salir a la calle' });
  }

  // ---------- Armería "El Tano" (a lo Ammu-Nation) ----------
  // Las armas en exhibición en las paredes: te parás enfrente y la comprás. El Tano atiende atrás del
  // mostrador con la escopeta abajo: si le apuntás, le pegás o le tirás, es bravo y te recaga a
  // escopetazos. Si lo bajás, te llevás lo que quieras gratis (y la cana se entera).
  buildArmeria(colliders, pickups) {
    const shops = pickups.shops || [];
    const shop = shops[Math.floor(shops.length * 0.3)];
    if (!shop) return;
    const g = new THREE.Group();
    g.position.set(ARMERIA.x, 0, ARMERIA.z);
    const F = new FastBoxes();
    const W = 9;
    const D = 7;
    const H = 3.4;
    roomBox(F, W, D, H, 0x5d6b5a, 0xcfcfcf);
    // zócalo oscuro y paneles perforados donde cuelgan las armas
    for (const [w, d, x, z] of [[W, 0.04, 0, -D / 2 + 0.1], [W, 0.04, 0, D / 2 - 0.1], [0.04, D, -W / 2 + 0.1, 0], [0.04, D, W / 2 - 0.1, 0]]) F.box(w, 0.9, d, 0x2b2f2a, x, 0.45, z);
    F.box(W - 3.2, 1.5, 0.05, 0xc8b28a, 1.2, 1.75, -D / 2 + 0.11);
    F.box(0.05, 1.5, D - 2.4, 0xc8b28a, W / 2 - 0.11, 1.75, -0.4);
    // mostrador en L a la izquierda, con vidrio arriba (y cajas de balas adentro)
    const cx = -W / 2 + 1.7;
    F.box(0.7, 1.0, 4.2, 0x3e2b1c, cx, 0.5, -D / 2 + 2.3);
    F.box(0.74, 0.05, 4.24, 0x1c1c1c, cx, 1.02, -D / 2 + 2.3);
    F.box(0.05, 0.3, 4.1, 0xbcd6e0, cx + 0.36, 1.2, -D / 2 + 2.3);
    for (let k = 0; k < 8; k++) F.box(0.22, 0.14, 0.3, [0x8d6e63, 0x2e7d32, 0xc62828, 0xffb300][k % 4], cx, 0.85, -D / 2 + 0.7 + k * 0.45);
    // caja registradora y alfombra
    F.box(0.4, 0.25, 0.35, 0x222222, cx, 1.17, -D / 2 + 3.8);
    F.box(2.4, 0.02, 1.4, 0x6b1b1b, 0.3, 0.02, D / 2 - 1.1);
    g.add(shaded(F));
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: floorTex('#5a5a55', '#4a4a46', 8) }));
    fl.material.map.repeat.set(W / 2, D / 2);
    fl.position.y = 0.01;
    g.add(fl);
    sign(g, 'ARMERÍA EL TANO', { w: 3.4, h: 0.55, x: 1.2, y: 2.85, z: -D / 2 + 0.09, bg: '#7a1c12', fg: '#ffd27a', font: 66 });
    sign(g, 'PROHIBIDO APUNTAR AL VENDEDOR', { w: 2.6, h: 0.32, x: -W / 2 + 0.09, y: 2.5, z: -0.8, rot: Math.PI / 2, bg: '#111111', fg: '#ff5252', font: 40 });
    sign(g, 'NO SE FÍA', { w: 1.2, h: 0.3, x: cx + 0.37, y: 1.6, z: -D / 2 + 3.9, rot: Math.PI / 2, bg: '#f5f1e6', fg: '#b71c1c', font: 60 });
    // las armas en exhibición: fondo del local y pared derecha
    this.displays = [];
    const spots = [];
    for (let k = 0; k < 5; k++) spots.push({ x: -1.0 + k * 1.1, z: -D / 2 + 0.16, rot: 0 });
    for (let k = 0; k < 4; k++) spots.push({ x: W / 2 - 0.16, z: -D / 2 + 1.2 + k * 1.15, rot: -Math.PI / 2 });
    spots.push({ x: 2.6, z: D / 2 - 0.16, rot: Math.PI }, { x: 3.7, z: D / 2 - 0.16, rot: Math.PI });
    STOCK.forEach(([id, price], i) => {
      const sp = spots[i];
      if (!sp) return;
      const holder = new THREE.Group();
      holder.position.set(sp.x, 0, sp.z);
      holder.rotation.y = sp.rot;
      let m;
      if (id === 'chaleco' || id === 'balas') {
        const B = new FastBoxes();
        if (id === 'chaleco') {
          B.box(0.5, 0.6, 0.12, 0x283a5a, 0, 1.65, 0.12);
          B.box(0.3, 0.07, 0.13, 0xf2f2f2, 0, 1.8, 0.13);
        } else for (let k = 0; k < 6; k++) B.box(0.16, 0.12, 0.14, [0x2e7d32, 0xc62828, 0xffb300][k % 3], -0.2 + (k % 3) * 0.2, 1.45 + Math.floor(k / 3) * 0.14, 0.12);
        m = shaded(B);
      } else {
        m = pickupWeapon(id);
        m.scale.setScalar(['palo', 'baston', 'ametralladora', 'bazuca', 'lanzallamas'].includes(id) ? 1 : 1.6);
        // colgada de costado contra el panel
        m.rotation.set(0, Math.PI / 2, 0);
        m.position.set(0, 1.65, 0.14);
      }
      holder.add(m);
      const label = `${STOCK_NAME[id] ?? WEAPONS[id]?.name ?? id}`;
      sign(holder, `${label} $${price.toLocaleString('es-AR')}`, { w: 0.95, h: 0.2, x: 0, y: 1.18, z: 0.12, bg: '#f5f1e6', fg: '#1a1a1a', font: 34 });
      g.add(holder);
      // dónde se para Gaspi para comprarla (en el mundo)
      const nx = Math.sin(sp.rot);
      const nz = Math.cos(sp.rot);
      this.displays.push({ id, price, label, x: ARMERIA.x + sp.x + nx * 0.85, z: ARMERIA.z + sp.z + nz * 0.85, mesh: m });
    });
    this.scene.add(g);
    roomWalls(colliders, ARMERIA, W, D);
    // el mostrador no se cruza
    colliders.addSegment(ARMERIA.x + cx + 0.36, ARMERIA.z - D / 2, ARMERIA.x + cx + 0.36, ARMERIA.z - D / 2 + 4.4, 1, 'wall');
    colliders.addSegment(ARMERIA.x + cx - 0.36, ARMERIA.z - D / 2 + 4.4, ARMERIA.x + cx + 0.36, ARMERIA.z - D / 2 + 4.4, 1, 'wall');
    this.armeroAt = { x: ARMERIA.x + cx - 0.75, z: ARMERIA.z - D / 2 + 2.4, face: Math.PI / 2 };
    this.armeriaDoor = { room: 'armeria', label: 'Entrar a la armería "El Tano"', outside: { x: shop.x, z: shop.z, face: Math.atan2(shop.nx, shop.nz) }, inside: { x: ARMERIA.x + 0.3, z: ARMERIA.z + D / 2 - 1.1, face: Math.PI }, exit: 'Salir a la calle' };
    this.doors.push(this.armeriaDoor);
  }
  // El Tano: un vecino de verdad (se le puede pegar, y pega)
  spawnArmero(npcs) {
    this.npcs = npcs;
    const at = this.armeroAt;
    if (!at) return;
    const look = { skin: 0xd9a882, hair: 0x9e9e9e, hairStyle: 'short', mustache: true, top: 'tank', shirt: 0x4e5b3a, pants: 0x2b2f2a, shoes: 0x2a1a10, belly: true, muscle: true, scale: 1.08 };
    const n = npcs.add(new Npc('armero', makeLook(look) || makeHuman(look), at.x, at.z));
    n.look = look;
    n.state = 'idle';
    n.home = { x: at.x, z: at.z };
    n.heading = at.face;
    n.hp = 340;
    n.money = 30000;
    n.mission = true;
    n.dropGun = 'escopeta';
    n.gun = handWeapon('escopeta');
    n.h.bones.handR.add(n.gun);
    this.armero = n;
    this.armeroGone = 0;
  }
  // lo que hace El Tano (lo llama Npcs.update)
  armeroBrain(n, dt, world, dp) {
    const P = world.player;
    const inside = this.inside?.room === 'armeria';
    if (!n.angry) {
      n.target = Math.hypot(n.home.x - n.x, n.home.z - n.z) > 0.4 ? { x: n.home.x, z: n.home.z } : null;
      if (inside && dp < 9) {
        n.heading += (((Math.atan2(P.x - n.x, P.z - n.z) - n.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 3);
        // apuntarle es buscarlo
        if (P.aiming && world.npcs.inSights(P, n)) {
          n.aimedT = (n.aimedT || 0) + dt;
          if (n.aimedT > 0.7) this.armeroAngry(n, world, '¿Me apuntás a mí? ¡En mi local no, pibe!');
        } else n.aimedT = 0;
        if (n.cool <= 0) {
          n.say(R.pick(['¿Qué buscás, pibe?', 'Mirá todo lo que quieras, pero no toques.', 'Lo que ves, se paga.', 'Acá no se fía, eh.']), 2.6);
          n.cool = R.range(10, 16);
        }
      }
      return { want: n.target ? 1.4 : 0, pose: inside && dp < 9 ? 'holdGun' : 'walk' };
    }
    // bravo: escopetazos de cerca, culatazo si lo tenés encima
    if (!inside || P.dead) return { want: 0, pose: 'aimLong' };
    n.heading = Math.atan2(P.x - n.x, P.z - n.z);
    n.target = null;
    n.cd = (n.cd ?? 0.5) - dt;
    if (dp < 1.4 && n.fightCd <= 0) {
      n.act = { pose: 'cross', t: 0, dur: 0.35 };
      n.fightCd = 1.2;
      P.hurt(16, 'El Tano te dio un culatazo');
      P.hitReact?.(n.x, n.z);
      world.audio.golpe(0.8);
    } else if (n.cd <= 0) {
      for (let k = 0; k < 5; k++) world.combat.enemyShoot(world, n, 0.62, 'escopeta');
      world.fx.shake += 0.15;
      n.cd = R.range(1.0, 1.5);
      if (!n.bubble && R.chance(0.4)) n.say(R.pick(['¡Fuera de mi local!', '¡Tomá, chorro!', '¡Acá no robás!']), 1.8);
    }
    return { want: 0, pose: 'aimLong' };
  }
  armeroAngry(n, world, line) {
    if (n.angry || n.killed) return;
    n.angry = true;
    n.cd = 0.5;
    n.say(line ?? '¡Ah, te hacés el loco en mi local!', 2.2);
    world.hud.flash('ARMERÍA', '¡El Tano es bravo! Cubrite', 'bad', 1.8);
  }

  // ---------- Entrar y salir ----------
  // dónde "está" Gaspi para la ciudad (para que no se vacíen las calles mientras está adentro)
  focus(P) {
    return this.inside ? this.inside.outside : P;
  }

  action(world) {
    const P = world.player;
    if (this.busy || P.vehicle || P.dead) return null;
    const near = (p, r) => Math.hypot(P.x - p.x, P.z - p.z) < r;
    if (!this.inside) {
      const d = this.doors.find((o) => near(o.outside, 2.4));
      if (!d) return null;
      if (world.police.stars > 0) return { text: 'Con la cana atrás no te dejan entrar', run: () => {} };
      return { text: d.label, run: () => this.go(world, d, true) };
    }
    const d = this.inside;
    if (d.room === 'armeria') {
      const it = this.displays.find((o) => near(o, 0.95) && o.mesh.visible);
      if (it) {
        const n = this.armero;
        const dead = !n || n.killed || n.state === 'ko';
        if (!dead && n.angry) return null;
        if (dead) return { text: `Llevarte ${it.label} (gratis)`, run: () => this.takeItem(world, it, true) };
        return { text: `Comprar ${it.label} · $${it.price.toLocaleString('es-AR')}`, run: () => this.takeItem(world, it, false) };
      }
    }
    if (d.room === 'kiosco' && near(this.counter, 0.9)) return { text: 'Comprar en el kiosco', run: () => this.shop(world, 'kiosco') };
    if (d.room === 'bar' && near(this.barCounter, 1.1)) return { text: 'Pedir en la barra', run: () => this.shop(world, 'bar') };
    if (d.room === 'correo' && near(this.correoCounter, 1.2)) return { text: 'Pedirle a Don Manolo', run: () => this.shop(world, 'correo') };
    if (d.room === 'pizza' && near(this.pizzaCounter, 1.1)) return { text: 'Pedir en el mostrador', run: () => this.shop(world, 'pizza') };
    if (d.room === 'hall') {
      if (P.auto) return null;
      // los molinetes: del lado de la calle se paga (o se salta), del lado de los andenes se sale libre
      const gate = this.gates.reduce((b, g) => (Math.abs(P.x - g.x) < Math.abs(P.x - b.x) ? g : b));
      const side = P.z > this.hallLine ? 1 : -1;
      if (Math.abs(P.z - this.hallLine) < 1.15 && Math.abs(P.x - gate.x) < 0.9) {
        if (side < 0) return { text: 'Salir por el molinete', run: () => this.turnstile(world, gate, -1, 'salida') };
        return {
          text: `Molinete: pasar la SUBE ($${FARE_TREN})`,
          run: () =>
            world.hud.ask('Molinete', [
              { label: `Pasar la SUBE ($${FARE_TREN})`, run: () => this.turnstile(world, gate, 1, 'sube') },
              { label: 'Colarse saltando el molinete', run: () => this.turnstile(world, gate, 1, 'salto') },
              { label: 'Nada', run: () => {} },
            ]),
        };
      }
      if (side < 0 && near(this.hallPlatformExit, 1.8)) return { text: 'Pasar a los andenes', run: () => this.go(world, this.platformDoor ?? d, false, this.platformDoor ? null : 'andenes') };
      const street = this.doors[0];
      if (side > 0 && near(street.inside, 1.4)) return { text: street.exit, run: () => this.go(world, street, false) };
      return null;
    }
    if (near(d.inside, 1.4)) return { text: d.exit, run: () => this.go(world, d, false) };
    return null;
  }

  go(world, door, enter, where = null) {
    const P = world.player;
    this.busy = true;
    this.fade.style.opacity = '1';
    setTimeout(() => {
      if (enter) {
        this.saved = { zoom: P.zoom, pitch: P.camPitch };
        P.x = door.inside.x;
        P.z = door.inside.z;
        P.heading = door.inside.face;
        P.zoom = 0.7;
        P.camPitch = 0.22;
        this.inside = door;
        world.inside = door.room;
        if (door.room === 'hall') this.drawBoard(world);
      } else {
        let p = door.outside;
        let face = door.outside.face;
        if (where === 'andenes') {
          p = world.transit?.platformNear(door.outside.x, door.outside.z) ?? p;
          face = P.heading;
        }
        P.x = p.x;
        P.z = p.z;
        P.heading = face;
        if (this.saved) {
          P.zoom = this.saved.zoom;
          P.camPitch = this.saved.pitch;
        }
        this.inside = null;
        world.inside = null;
      }
      P.camYaw = P.heading + Math.PI;
      P.speed = 0;
      P.mvx = P.mvz = 0;
      this.fade.style.opacity = '0';
      this.busy = false;
    }, 420);
  }

  takeItem(world, it, free) {
    const { player: P, hud, audio, combat } = world;
    if (!free) {
      if (P.money < it.price) return hud.toast('No te alcanza, pibe', 1.8);
      P.addMoney(-it.price);
      this.armero?.say(R.pick(['¡Buena elección!', 'Llevalo, es tuyo. Y no lo usés acá adentro.', 'Con eso no te para nadie.']), 2.2);
      audio.plata();
    } else {
      audio.recarga?.();
      // lo robado no vuelve a la pared hasta que repongan
      it.mesh.visible = false;
    }
    if (it.id === 'chaleco') P.armor = 100;
    else if (it.id === 'balas') {
      for (const [id, a] of Object.entries(P.ammo)) if (WEAPONS[id]?.gun) a.res += WEAPONS[id].ammoPickup;
    } else combat.give(P, it.id);
    audio.recarga?.();
    hud.toast(free ? `Te llevaste: ${it.label}` : `Compraste: ${it.label}`, 1.8);
  }

  shop(world, kind = 'kiosco') {
    const { player: P, hud, audio } = world;
    const menu = MENUS[kind];
    const buy = (name, price, hp) => () => {
      if (P.money < price) return hud.toast('No te alcanza');
      P.addMoney(-price);
      P.health = Math.min(100, P.health + hp);
      audio.plata();
      hud.toast(hp >= 100 ? `${name}: vida al máximo` : `${name}: +${hp} de vida`, 2);
    };
    const items = menu.items.map(([name, price, hp]) => ({ label: `${name} $${price.toLocaleString('es-AR')} (${hp >= 100 ? 'vida al máximo' : `+${hp} vida`})`, run: buy(name, price, hp) }));
    hud.ask(menu.who, [...items, { label: 'Nada, gracias', run: () => {} }], 10);
  }

  update(dt, world) {
    // los ventiladores de techo de El Viejo Correo
    if (this.inside?.room === 'correo') for (const f of this.correoFans || []) f.rotation.y += dt * 2.4;
    // al Tano, si lo bajaron, lo reemplaza otro al rato (con Gaspi afuera) y reponen lo robado
    const n = this.armero;
    if (n && (n.killed || n.dead) && this.inside?.room !== 'armeria') {
      this.armeroGone += dt;
      if (this.armeroGone > 150 && world.police.stars === 0) {
        n.dead = true;
        for (const it of this.displays) it.mesh.visible = true;
        this.spawnArmero(this.npcs);
      }
    }
    if (n && n.angry && !this.inside && !n.killed) {
      // se le pasa cuando te vas
      n.calmT = (n.calmT || 0) + dt;
      if (n.calmT > 60) n.angry = false;
    } else if (n) n.calmT = 0;
    if (!this.inside) return;
    for (const p of this.people) if (!p.room || p.room === this.inside.room) animateHuman(p.h, dt, 0, p.pose === 'idle' ? 'walk' : p.pose);
    if (this.inside.room === 'hall') {
      this.updateGates(dt);
      this.updateWalkers(dt, world);
    }
    this.boardT -= dt;
    if (this.inside.room === 'hall' && this.boardT <= 0) {
      this.boardT = 5;
      this.drawBoard(world);
    }
  }
}
