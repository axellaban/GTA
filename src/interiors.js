// Interiores a lo GTA clásico: en la puerta, E y fundido a negro; adentro hay un ambiente armado
// aparte (fuera del mapa, donde no molesta a nadie) y al salir se vuelve a la calle.
// - Hall de la estación Temperley: boletería, molinetes, bancos y el cartel de próximos trenes.
//   Tiene dos salidas: a la calle y a los andenes.
// - Un kiosco del barrio: mostrador con reja, golosinas, heladera y el kiosquero, que te vende.
// Los ambientes tienen luz pareja de tubo (materiales sin iluminación, con el sombreado de cada
// cara ya puesto en los colores) y paredes con colisión.
import * as THREE from 'three';
import { FastBoxes } from './builder.js';
import { makeHuman, animateHuman, randomCivilian } from './human.js';
import { makePerson, PEOPLE } from './people.js';
import { R } from './rng.js';

const HALL = { x: 1500, z: 1500 };
const KIOSCO = { x: 1560, z: 1500 };

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
  const t = new THREE.CanvasTexture(c);
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

// una persona quieta adentro (sentada, mirando el cartel, atendiendo)
function extra(group, x, z, face, pose, look) {
  const h = (!look && PEOPLE.ready && makePerson(R.chance(0.5) ? 'male' : 'female')) || makeHuman(look ?? randomCivilian());
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
    // molinetes frente a la salida a los andenes
    for (let k = 0; k < 5; k++) {
      const x = -2.4 + k * 1.2;
      F.box(0.28, 1.0, 0.9, 0x9aa4ab, x, 0.5, -D / 2 + 2.2);
      F.box(0.5, 0.05, 0.05, 0xc8ced2, x + 0.38, 0.95, -D / 2 + 2.2);
      F.box(0.2, 0.06, 0.2, 0x2e7d32, x, 1.03, -D / 2 + 2.45);
    }
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
    this.people.push(extra(g, W / 2 - 1.25, 1.2, -Math.PI / 2, 'sit'));
    this.people.push(extra(g, W / 2 - 3, -0.4, Math.PI / 2, 'idle'));
    this.people.push(extra(g, -W / 2 + 1.2, -1.8, -Math.PI / 2, 'idle'));
    this.people.push(extra(g, -2, 1.5, 0.6, 'phone'));
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
    colliders.addSegment(HALL.x - 3, HALL.z - D / 2 + 2.2, HALL.x + 3.2, HALL.z - D / 2 + 2.2, 1, 'wall');
    // puertas
    const door = this.city.spots.stationDoor;
    const sw = this.city.spots.stationWall;
    const out = { x: door.x, z: door.z, face: sw ? Math.atan2(sw.nx, sw.nz) : 0 };
    this.doors.push({ room: 'hall', label: 'Entrar a la estación', outside: out, inside: { x: HALL.x, z: HALL.z + D / 2 - 1.6, face: Math.PI }, exit: 'Salir a la calle' });
    this.hallPlatformExit = { x: HALL.x, z: HALL.z - D / 2 + 1.2 };
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
    this.people.push(extra(g, 0.3, -1.4, 0, 'idle'));
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
    if (d.room === 'kiosco' && near(this.counter, 0.9)) return { text: 'Comprar en el kiosco', run: () => this.shop(world) };
    if (d.room === 'hall' && near(this.hallPlatformExit, 1.8)) return { text: 'Pasar a los andenes', run: () => this.go(world, d, false, 'andenes') };
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

  shop(world) {
    const { player: P, hud, audio } = world;
    const buy = (price, hp, text) => () => {
      if (P.money < price) return hud.toast('No te alcanza');
      P.addMoney(-price);
      P.health = Math.min(100, P.health + hp);
      audio.plata();
      hud.toast(text, 2);
    };
    hud.ask('El kiosquero: "¿Qué llevás, maestro?"', [
      { label: 'Alfajor triple $900 (+15 vida)', run: buy(900, 15, '¡Un alfajor triple! +15 de vida') },
      { label: 'Gaseosa $1.200 (+25 vida)', run: buy(1200, 25, 'Gaseosa bien fría: +25 de vida') },
      { label: 'Nada, gracias', run: () => {} },
    ], 10);
  }

  update(dt, world) {
    if (!this.inside) return;
    for (const p of this.people) animateHuman(p.h, dt, 0, p.pose === 'idle' ? 'walk' : p.pose);
    this.boardT -= dt;
    if (this.inside.room === 'hall' && this.boardT <= 0) {
      this.boardT = 5;
      this.drawBoard(world);
    }
  }
}
