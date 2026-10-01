// Gym El Kaiser: un box de CrossFit en su dirección real, Rivadavia 321. Galpón negro con el
// portón levantado, el cartel del lobo arriba, racks rojos adentro y los musculosos entrenando
// (press, sentadilla y dominadas). Si les pegás, se defienden.
import * as THREE from 'three';
import { STATION, TRACKS, nearestRoad, distToPolyline, GYM_LOT, GYM_SIZE } from './map.js';
import { randomCivilian } from './human.js';
import { makeStar } from './people.js';
import { R } from './rng.js';

const W = GYM_SIZE.W; // ancho (frente)
const DP = GYM_SIZE.DP; // fondo
const HT = 4.4; // alto

// cartel: escudo negro con borde amarillo, cabeza de lobo roja y negra, ELKAISER y GYM
function logoTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 768;
  const g = c.getContext('2d');
  const path = (pts) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  };
  // silueta del lobo (mirando a la izquierda), con orejas en punta
  const wolf = [[250, 430], [300, 330], [350, 300], [380, 180], [440, 270], [520, 230], [560, 120], [610, 250], [700, 280], [790, 300], [860, 380], [900, 470], [300, 470]];
  const badge = [[120, 440], [904, 440], [930, 470], [930, 690], [880, 730], [150, 730], [100, 690], [100, 470]];
  g.lineJoin = 'round';
  for (const [pts, fill] of [[wolf, '#b8252b'], [badge, '#111']]) {
    path(pts);
    g.lineWidth = 34;
    g.strokeStyle = '#f2c21a';
    g.stroke();
    g.fillStyle = fill;
    g.fill();
  }
  path(wolf);
  g.fillStyle = '#b8252b';
  g.fill();
  // sombras negras del pelaje
  g.fillStyle = '#161010';
  for (const pts of [[[560, 250], [640, 290], [600, 330], [540, 300]], [[700, 300], [800, 330], [760, 380], [690, 350]], [[380, 330], [470, 320], [430, 370]], [[320, 400], [420, 390], [360, 440]]]) {
    path(pts);
    g.fill();
  }
  // ojo amarillo y colmillos
  path([[430, 300], [480, 290], [470, 310]]);
  g.fillStyle = '#ffd23a';
  g.fill();
  g.fillStyle = '#fff';
  for (const x of [300, 330, 360]) {
    path([[x, 420], [x + 18, 420], [x + 8, 452]]);
    g.fill();
  }
  // garras blancas a los costados, agarrando el cartel
  for (const [x, s] of [[150, 1], [860, -1]]) for (let i = 0; i < 3; i++) {
    path([[x + s * i * 26, 470], [x + s * (i * 26 + 18), 470], [x + s * (i * 26 + 30), 540]]);
    g.fill();
  }
  g.textAlign = 'center';
  g.font = '900 150px Impact, "Arial Black", sans-serif';
  g.fillStyle = '#b8252b';
  g.fillText('ELKAISER', 518, 628);
  g.fillStyle = '#fff';
  g.fillText('ELKAISER', 512, 620);
  g.font = '900 72px Impact, "Arial Black", sans-serif';
  g.fillText('GYM', 512, 705);
  // barras de pesas a los lados de GYM
  g.fillRect(250, 675, 180, 8);
  g.fillRect(594, 675, 180, 8);
  for (const x of [250, 262, 762, 774]) g.fillRect(x, 655, 8, 48);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// El lote está reservado en map.js (GYM_LOT: Rivadavia 321, la dirección real). Si los datos del mapa
// cambian y no aparece, se busca un terreno libre frente a una calle cerca de la estación.
function findLot(colliders) {
  if (GYM_LOT) return GYM_LOT;
  for (let r = 40; r <= 190; r += 6) {
    for (let a = 0; a < 60; a++) {
      const ang = (a / 60) * Math.PI * 2 + r;
      const x = STATION.x + Math.cos(ang) * r;
      const z = STATION.z + Math.sin(ang) * r;
      const nr = nearestRoad(x, z);
      if (!nr) continue;
      const half = (nr.road.w ?? 8) / 2;
      if (nr.dist < half + 3 + DP / 2 || nr.dist > half + 3 + DP / 2 + 3) continue;
      if (TRACKS.some((t) => distToPolyline(x, z, t) < 16)) continue;
      let free = true;
      for (const [ox, oz] of [[0, 0], [4, 3], [-4, 3], [4, -3], [-4, -3]]) {
        if (colliders.resolveCircle({ x: x + ox, z: z + oz }, 4)) {
          free = false;
          break;
        }
      }
      if (free) return { x, z, h: Math.atan2(nr.x - x, nr.z - z), edge: nr.dist - half };
    }
  }
  return null;
}

// lo que randomCivilian sortea y pisaría la musculosa (o el cuero): camisetas, buzos, gorras
const CLEAN = { jersey: null, hood: null, jacket: null, tie: null, police: false, longSleeves: false, cap: null, hat: null, helmet: null };

const LINES = ['¡Vamos, chicas, una más!', '¿Qué mirás, Gaspi? Vení a entrenar', '¡Vamos que se puede!', '¡Una más, una más!', '¿Venís a entrenar, Gaspi? La primera es gratis', '¡Esto es El Kaiser, papá!', 'Sin dolor no hay gloria', '¡Arriba ese pecho!', 'Hoy es día de pierna'];

export class Gym {
  constructor(scene, colliders, npcs, heightAt) {
    this.npcs = npcs;
    this.slots = [];
    this.talkT = 0;
    const lot = findLot(colliders);
    if (!lot) return;
    const { x, z, h } = lot;
    this.edge = lot.edge; // distancia del centro al cordón de la calle
    this.x = x;
    this.z = z;
    this.h = h;
    const y = heightAt(x, z);
    const cos = Math.cos(h);
    const sin = Math.sin(h);
    this.world = (lx, lz) => ({ x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos });
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = h;
    const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
    const black = std(0x1b1b1d);
    const box = (w, hh, d, mat, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat);
      m.position.set(px, py, pz);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };
    // galpón: piso de goma, paredes negras, techo y el portón levantado
    box(W, 0.06, DP, std(0x232325, { roughness: 1 }), 0, 0.03, 0);
    box(W, HT, 0.25, black, 0, HT / 2, -DP / 2);
    for (const s of [-1, 1]) box(0.25, HT, DP, black, (s * W) / 2, HT / 2, 0);
    box(W + 0.3, 0.25, DP + 0.3, black, 0, HT, 0);
    box(W, 0.9, 0.25, black, 0, HT - 0.45, DP / 2);
    box(W - 0.6, 0.35, 0.3, std(0x6a6d72, { metalness: 0.5, roughness: 0.5 }), 0, HT - 1.05, DP / 2 - 0.1);
    // cartel grande arriba del frente y el mismo logo en la pared del fondo (como en la foto)
    const logo = new THREE.MeshBasicMaterial({ map: logoTexture(), transparent: true, alphaTest: 0.05, side: THREE.DoubleSide });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), logo);
    sign.position.set(0, HT + 2.6, DP / 2 - 0.1);
    g.add(sign);
    box(0.15, 2.6, 0.15, black, -2.5, HT + 1.1, DP / 2 - 0.25);
    box(0.15, 2.6, 0.15, black, 2.5, HT + 1.1, DP / 2 - 0.25);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), logo);
    back.position.set(0, 3.2, -DP / 2 + 0.14);
    g.add(back);
    // luces del techo (tubos) para que se vea adentro
    const tube = new THREE.MeshBasicMaterial({ color: 0xf4f8ff });
    for (const lx of [-3.5, 0, 3.5]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 5), tube);
      m.position.set(lx, HT - 0.16, 0);
      g.add(m);
    }
    // racks rojos con barra de dominadas, pesas, cajones y kettlebells
    const red = std(0xd21f2a, { roughness: 0.4, metalness: 0.3 });
    for (const rx of [-3.2, 0, 3.2]) {
      for (const s of [-1, 1]) box(0.09, 2.5, 0.09, red, rx + s * 0.6, 1.25, -DP / 2 + 1.1);
      box(1.4, 0.07, 0.07, black, rx, 2.35, -DP / 2 + 1.1);
    }
    const plate = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 20).rotateZ(Math.PI / 2);
    const plateM = std(0x111111, { roughness: 0.6 });
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(plate, plateM);
      m.rotation.y = Math.PI / 2;
      m.position.set(W / 2 - 0.5, 0.22 + (i % 3) * 0.001, -2 + i * 0.07);
      m.rotation.z = 0.12;
      g.add(m);
    }
    const wood = std(0x9a6a3a);
    for (const [bx, bz] of [[-4.6, 1.5], [-4.6, 2.4], [4.8, 2.6]]) box(0.6, 0.5, 0.75, wood, bx, 0.25, bz);
    const kb = std(0x151515, { metalness: 0.4, roughness: 0.5 });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), kb);
      m.position.set(-W / 2 + 0.5, 0.14, -2.5 + i * 0.45);
      g.add(m);
    }
    scene.add(g);
    // paredes sólidas (el frente queda abierto)
    const wall = (ax, az, bx, bz) => {
      const a = this.world(ax, az);
      const b = this.world(bx, bz);
      colliders.addSegment(a.x, a.z, b.x, b.z, HT, 'wall');
    };
    wall(-W / 2, -DP / 2, W / 2, -DP / 2);
    wall(-W / 2, -DP / 2, -W / 2, DP / 2);
    wall(W / 2, -DP / 2, W / 2, DP / 2);
    // quién entrena y dónde (x, z locales)
    this.slots = [
      { lx: -3.2, lz: -1.9, ex: 'pullup', shirt: 0x151515 },
      { lx: 0, lz: -0.6, ex: 'squat', shirt: 0xc0282d, bar: true },
      { lx: 3.2, lz: -0.6, ex: 'press', shirt: 0xf2c21a, bar: true },
      { lx: -1.8, lz: 1.8, ex: 'press', shirt: 0x222222, bar: true, female: true, pants: 0xd81b60, hair: 0x1a1a1a },
      // las chicas fit del box
      { lx: 1.6, lz: 0.9, ex: 'squat', shirt: 0xf48fb1, bar: true, female: true, pants: 0x151515, hair: 0xc9a15a, hairStyle: 'ponytail' },
      { lx: -4.3, lz: 0.2, ex: 'press', shirt: 0x26c6da, bar: true, female: true, pants: 0x37474f, hair: 0x3b2418, hairStyle: 'bun' },
      { lx: 4.4, lz: 1.2, ex: 'squat', shirt: 0xffffff, bar: true, female: true, pants: 0x6a1b9a, hair: 0x2b1d14, hairStyle: 'ponytail' },
      { lx: 0, lz: -2.3, ex: 'pullup', shirt: 0x151515, female: true, pants: 0xef6c00, hair: 0x8a3a1a, hairStyle: 'ponytail' },
      { lx: 2.2, lz: 2.4, ex: null, shirt: 0x151515, kaiser: true },
      // Ciro, el profe: en cuero, el doble de grande que cualquiera y con ganas de pelear
      { lx: -0.5, lz: 3.2, ex: null, ciro: true },
    ];
  }

  spawn(s) {
    const p = this.world(s.lx, s.lz);
    if (s.ciro) return this.spawnCiro(s);
    const look = {
      ...randomCivilian(),
      ...CLEAN,
      female: !!s.female,
      muscle: !s.female,
      fit: !!s.female,
      top: 'tank',
      shirt: s.shirt,
      bottom: s.female ? 'leggings' : 'shorts',
      hairStyle: s.hairStyle ?? (s.female ? 'ponytail' : R.pick(['buzz', 'bald', 'short'])),
      ...(s.hair ? { hair: s.hair } : {}),
      ...(s.pants ? { pants: s.pants } : {}),
      lipstick: !!s.female,
      glasses: false,
      scale: s.kaiser ? 1.12 : 1.04,
    };
    const n = this.npcs.spawnWalker({ x: p.x, z: p.z, heading: this.h }, null, 0, 0, look);
    if (!n) return;
    Object.assign(n, { vmax: 0, mission: true, brave: 1, hp: s.kaiser ? 260 : 180, exercise: s.ex, t: R.range(0, 10) });
    if (s.bar) {
      const bar = new THREE.Group();
      const steel = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 0.9, roughness: 0.3 });
      bar.add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.9, 8).rotateZ(Math.PI / 2), steel));
      const pl = new THREE.CylinderGeometry(0.22, 0.22, 0.07, 18).rotateZ(Math.PI / 2);
      const pm = new THREE.MeshStandardMaterial({ color: s.female ? 0x2f6fd0 : 0x111111, roughness: 0.6 });
      for (const sx of [-0.72, 0.72]) {
        const m = new THREE.Mesh(pl, pm);
        m.position.x = sx;
        bar.add(m);
      }
      bar.visible = false;
      n.h.root.add(bar);
      n.h.bar = bar;
    }
    s.n = n;
    s.home = p;
  }

  // cargaron los modelos de artista: Ciro pasa al suyo
  upgrade() {
    const n = this.slots.find((s) => s.ciro)?.n;
    if (!n || n.dead || n.h.star) return;
    const h = makeStar('ciro');
    if (h) this.npcs.reskin(n, h);
  }

  spawnCiro(s) {
    const p = this.world(s.lx, s.lz);
    const look = { ...randomCivilian(),
      ...CLEAN, female: false, muscle: true, top: 'none', bottom: 'shorts', shorts: 0x151515, pants: 0x151515, hairStyle: 'buzz', hair: 0x1a1410, skin: 0xc68a5e, beard: true, stubble: true, glasses: false, lipstick: false, scale: 2 };
    // con modelo de artista si ya cargó (si no, el nuestro y después upgrade() lo cambia)
    const n = this.npcs.spawnWalker({ x: p.x, z: p.z, heading: this.h }, null, 0, 0, look, makeStar('ciro'));
    if (!n) return;
    Object.assign(n, { vmax: 0, mission: true, brave: 1, hp: 700, r: 0.75, reach: 2.3, chaseV: 4.8, dmgMul: 2.6, knocks: true, ciro: true, killMsg: 'Te fajó Ciro, el profe del gym', t: R.range(0, 10) });
    s.n = n;
    s.home = p;
  }

  update(dt, world) {
    if (!this.slots.length) return;
    // Ciro busca pelea: si Gaspi pasa cerca a pie, lo encara
    const ciro = this.slots.find((s) => s.ciro)?.n;
    if (ciro && !ciro.dead && !ciro.down && ciro.state !== 'fight' && !world.player.vehicle && !world.player.dead && !world.missions?.ciroPeace) {
      const dc = Math.hypot(world.player.x - ciro.x, world.player.z - ciro.z);
      if (dc < 16) {
        this.npcs.setState(ciro, 'fight');
        ciro.fightT = 40;
        ciro.say(R.pick(['¿Qué mirás, flaco? ¡Vení!', 'Soy Ciro, el profe. ¡Acá mando yo!', '¡Te voy a dar una clase gratis, pero de trompadas!', '¡Vení que te rompo!']), 3);
      }
    }
    const P = world.player;
    const d = Math.hypot(P.x - this.x, P.z - this.z);
    for (const s of this.slots) {
      const n = s.n;
      // si no están (o quedaron tirados) y Gaspi no mira, vuelven a entrenar
      if (!n || n.dead || ((n.down || n.state === 'ko') && d > 70)) {
        if (d > 60 && d < 170) {
          if (n && !n.dead) n.dead = true;
          this.spawn(s);
        }
        continue;
      }
      if (n.state === 'walk') {
        if (Math.hypot(n.x - s.home.x, n.z - s.home.z) > 1.5 && d > 40) {
          n.x = s.home.x;
          n.z = s.home.z;
        }
        n.heading = this.h;
      }
    }
    // alguno te habla cuando pasás por la puerta
    this.talkT -= dt;
    if (d < 12 && this.talkT <= 0) {
      this.talkT = R.range(6, 11);
      const s = R.pick(this.slots.filter((s) => s.n && s.n.state === 'walk'));
      s?.n.say(R.pick(LINES), 3);
    }
  }
}
