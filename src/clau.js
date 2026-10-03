// La casa de Clau (pedido del dueño): una casa de dos pisos sobre Av. Eva Perón (la esquina real, con Emilio
// Castro, cae afuera del mapa: va en la casa más cercana sobre la avenida, src/map.js `CLAU`). En la terraza,
// Clau y sus amigos juegan al truco en una mesa de plástico: Pablo el alto, Ale con la vincha de call center
// y Laban el creador de traje y sombrero amarillos; Gonza toca la guitarra, Martín acuna a los mellizos y Nico
// está con su caballo. Se sube con E en la puerta (y se juega una mano con E en la mesa).
import * as THREE from 'three';
import { FastBoxes } from './builder.js';
import { roofWalkway } from './physics.js';
import { textTexture } from './textures.js';
import { nearestRoad } from './map.js';
import { animateHuman } from './human.js';
import { makeLook, makeStar, makeAnimal, animalPlay, PEOPLE, disposeHuman } from './people.js';
import { wearHeadset } from './wear.js';
import { R } from './rng.js';

const LINES = {
  truco: ['¡Truco!', '¡Quiero retruco!', '¡Quiero vale cuatro!', 'Envido', '¡Real envido!', '¡Falta envido!', 'Son buenas', 'Tengo veintiocho', '¡Treinta y tres!', 'Me voy al mazo', 'No quiero', '¿Quién da?', 'Tengo el ancho de espada, eh'],
  clau: ['¡Bienvenidos a la casa de Clau!', 'Acá se juega al truco como la gente', '¿Otra mano?'],
  pablo: ['Desde acá arriba te veo las cartas', 'Pará que me agacho', '¡Truco, y no se habla más!'],
  martin: ['Shhh, que se duermen los mellizos', 'Repartan sin mí, que tengo a los nenes', '¿Alguien tiene una mamadera?'],
  nico: ['Quieto, che, que es una terraza', 'El caballo también quiere jugar', 'Lo subí por la escalera, no preguntes'],
  gonza: ['♪ La la laaa, Temperley de mi vida ♪', '♪ Una zamba para el truco ♪', 'Pidan un tema, dale'],
  ale: ['Buenas tardes, le habla Ale, ¿en qué lo puedo ayudar?', 'Su llamada es muy importante para nosotros', 'Le derivo con el área correspondiente', '¡Envido! ...no, señora, no era para usted'],
  laban: ['Esto es contenido, hermano', 'El amarillo es el nuevo blanco', 'Yo soy el creador', '¡Truco con estilo!'],
};

const plastic = 0xf1f1ee;

// carta española: dorso con guarda o de frente con el palo
function cardTex(face) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfaf5';
  g.fillRect(0, 0, 64, 96);
  if (!face) {
    g.fillStyle = '#b3261e';
    g.fillRect(5, 5, 54, 86);
    g.strokeStyle = '#f2c94c';
    g.lineWidth = 3;
    for (let i = -96; i < 96; i += 12) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 96, 96);
      g.stroke();
    }
  } else {
    g.fillStyle = R.pick(['#c9a227', '#2e5aa8', '#b3261e', '#2e7d32']);
    g.beginPath();
    g.arc(32, 48, 14, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#222';
    g.font = 'bold 18px sans-serif';
    g.fillText(String(R.pick([1, 3, 7, 12])), 6, 20);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class CasaClau {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.people = [];
    this.clock = 0;
    this.talkT = 2;
    this.fade = null;
    const tb = city.buildingList.find((b) => b.b.extra === 'clau');
    if (!tb) return;
    const ring = tb.ring;
    this.H = tb.h;
    let cx = 0;
    let cz = 0;
    for (const [x, z] of ring) {
      cx += x;
      cz += z;
    }
    cx /= ring.length;
    cz /= ring.length;
    // el frente: la pared que da a la avenida; n apunta hacia adentro de la casa
    let front = null;
    for (let k = 0; k < ring.length; k++) {
      const [ax, az] = ring[k];
      const [bx, bz] = ring[(k + 1) % ring.length];
      const l = Math.hypot(bx - ax, bz - az);
      if (l < 4) continue;
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      let nx = -(bz - az) / l;
      let nz = (bx - ax) / l;
      if ((cx - mx) * nx + (cz - mz) * nz < 0) {
        nx = -nx;
        nz = -nz;
      }
      const d = nearestRoad(mx - nx * 4, mz - nz * 4)?.dist ?? 99;
      if (!front || d < front.d) front = { d, mx, mz, nx, nz, l };
    }
    this.front = front;
    this.center = { x: cx, z: cz };
    const g = new THREE.Group();
    g.position.set(cx, this.H, cz);
    g.rotation.y = Math.atan2(front.nx, front.nz); // +z local: de la calle hacia el fondo
    this.group = g;
    scene.add(g);
    this.local = (x, z) => new THREE.Vector3(x, 0, z).applyEuler(g.rotation).add(new THREE.Vector3(cx, this.H, cz));
    this.buildTerrace(ring);
    // la puerta de la calle y la casilla de la escalera arriba
    this.door = { x: front.mx - front.nx * 1.6, z: front.mz - front.nz * 1.6 };
    const top = this.local(this.stairLocal.x, this.stairLocal.z);
    this.top = { x: top.x, z: top.z };
    this.table = this.local(0, 0.5);
    // la terraza se camina y tiene baranda
    city.walkways.push(roofWalkway(ring, this.H));
    for (let k = 0; k < ring.length; k++) {
      const [x0, z0] = ring[k];
      const [x1, z1] = ring[(k + 1) % ring.length];
      city.colliders.add3d(x0, z0, x1, z1, this.H, 1.05);
    }
    this.fade = document.createElement('div');
    Object.assign(this.fade.style, { position: 'fixed', inset: '0', background: '#000', opacity: '0', pointerEvents: 'none', transition: 'opacity 0.45s', zIndex: '40' });
    document.body.appendChild(this.fade);
  }

  buildTerrace(ring) {
    const g = this.group;
    const F = new FastBoxes();
    // piso de baldosas coloradas sobre la losa
    g.updateMatrixWorld(true);
    const inv = g.matrixWorld.clone().invert();
    const pts = ring.map(([x, z]) => new THREE.Vector3(x, this.H, z).applyMatrix4(inv));
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.z)));
    const floorGeo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    const tiles = document.createElement('canvas');
    tiles.width = tiles.height = 128;
    const tg = tiles.getContext('2d');
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        tg.fillStyle = (i + j) % 2 ? '#b0553a' : '#a24a31';
        tg.fillRect(i * 32, j * 32, 31, 31);
      }
    }
    const tt = new THREE.CanvasTexture(tiles);
    tt.wrapS = tt.wrapT = THREE.RepeatWrapping;
    tt.colorSpace = THREE.SRGBColorSpace;
    tt.repeat.set(0.5, 0.5);
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({ map: tt }));
    floor.position.y = 0.04;
    floor.receiveShadow = true;
    g.add(floor);
    // baranda de caño sobre el borde
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k];
      const b = pts[(k + 1) % pts.length];
      const l = Math.hypot(b.x - a.x, b.z - a.z);
      const rot = Math.atan2(b.x - a.x, b.z - a.z);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, l), new THREE.MeshLambertMaterial({ color: 0x2b2b2b }));
      m.position.set((a.x + b.x) / 2, 1.0, (a.z + b.z) / 2);
      m.rotation.y = rot;
      g.add(m);
      for (let s = 0; s <= l; s += 1.4) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.0, 0.04), m.material);
        p.position.set(a.x + ((b.x - a.x) * s) / l, 0.5, a.z + ((b.z - a.z) * s) / l);
        g.add(p);
      }
    }
    // mesa redonda de plástico blanca y cuatro sillas (más una para Gonza)
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.04, 20), new THREE.MeshLambertMaterial({ color: plastic }));
    top.position.set(0, 0.74, 0.5);
    top.castShadow = true;
    g.add(top);
    F.box(0.08, 0.72, 0.08, plastic, 0, 0.36, 0.5);
    F.box(0.5, 0.03, 0.5, plastic, 0, 0.02, 0.5);
    this.seats = [
      { who: 'clau', x: 0, z: 1.38, rot: Math.PI },
      { who: 'pablo', x: 0, z: -0.38, rot: 0 },
      { who: 'ale', x: 0.88, z: 0.5, rot: -Math.PI / 2 },
      { who: 'laban', x: -0.88, z: 0.5, rot: Math.PI / 2 },
      { who: 'gonza', x: 2.5, z: 2.3, rot: Math.atan2(-2.5, 0.5 - 2.3) },
    ];
    for (const s of this.seats) {
      const c = new THREE.Group();
      const sf = new FastBoxes();
      sf.box(0.46, 0.05, 0.44, plastic, 0, 0.42, 0);
      sf.box(0.46, 0.45, 0.05, plastic, 0, 0.66, -0.22);
      for (const [a, b] of [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]]) sf.box(0.04, 0.42, 0.04, plastic, a, 0.21, b);
      c.add(sf.mesh(new THREE.MeshLambertMaterial({ vertexColors: true })));
      c.position.set(s.x, 0.04, s.z);
      c.rotation.y = s.rot;
      g.add(c);
    }
    // cartas: el mazo, las tiradas y las que tiene cada uno en la mano (ver spawn)
    this.cardBack = new THREE.MeshBasicMaterial({ map: cardTex(false) });
    const CARD = new THREE.PlaneGeometry(0.06, 0.09).rotateX(-Math.PI / 2);
    this.CARD = CARD;
    const mazo = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.09), this.cardBack);
    mazo.position.set(0.18, 0.775, 0.32);
    g.add(mazo);
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(CARD, new THREE.MeshBasicMaterial({ map: cardTex(true) }));
      c.position.set(-0.15 + i * 0.07, 0.765, 0.5 + (i % 2) * 0.05);
      c.rotation.y = (i - 2) * 0.3;
      g.add(c);
    }
    // fernet, coca, vasos y el mate
    F.box(0.08, 0.26, 0.08, 0x2a1a0f, 0.3, 0.89, 0.62);
    F.box(0.1, 0.32, 0.1, 0x7a1010, 0.38, 0.92, 0.48);
    for (const [x, z] of [[-0.3, 0.75], [0.25, 0.85], [-0.35, 0.25], [0.32, 0.2]]) F.box(0.07, 0.11, 0.07, 0x3b2312, x, 0.82, z);
    F.box(0.09, 0.1, 0.09, 0x6b4a2a, -0.2, 0.81, 0.62);
    F.box(0.01, 0.12, 0.01, 0xc0c0c0, -0.18, 0.88, 0.62);
    // casilla de la escalera en la esquina del fondo, con el tanque negro arriba (la puerta mira a la mesa)
    const lb = { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), z0: Math.min(...pts.map((p) => p.z)), z1: Math.max(...pts.map((p) => p.z)) };
    const cx = lb.x1 - 1.4;
    const cz = lb.z1 - 1.4;
    F.box(2.0, 2.3, 2.0, 0xe6d5b8, cx, 1.15, cz);
    F.box(0.9, 1.9, 0.05, 0x5a3a22, cx - 0.3, 0.95, cz - 1.02);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.9, 14), new THREE.MeshLambertMaterial({ color: 0x151515 }));
    tank.position.set(cx, 2.76, cz);
    g.add(tank);
    this.stairLocal = { x: cx - 0.3, z: cz - 1.8 };
    // la soga con ropa tendida, en el otro rincón del fondo
    const sx = lb.x0 + 0.8;
    const sz = lb.z1 - 0.9;
    F.box(0.04, 1.8, 0.04, 0x777777, sx, 0.9, sz);
    F.box(0.04, 1.8, 0.04, 0x777777, sx + 4, 0.9, sz - 0.4);
    const cols = [0xe53935, 0xfafafa, 0x1e88e5, 0xfdd835, 0x43a047, 0xfafafa];
    for (let i = 0; i < 6; i++) {
      const t = (i + 0.5) / 6;
      F.box(0.42, 0.55, 0.02, cols[i], sx + 4 * t, 1.45, sz - 0.4 * t);
    }
    const m = F.mesh(new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = true;
    g.add(m);
    // cartel pintado en el frente: LA CASA DE CLAU
    const f = this.front;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.8), new THREE.MeshBasicMaterial({ map: textTexture('LA CASA DE CLAU', { w: 1024, h: 196, bg: '#f6e7c8', fg: '#b3261e', font: 120, border: '#2e5aa8' }) }));
    sign.position.set(f.mx - f.nx * 0.08, 3.6, f.mz - f.nz * 0.08);
    sign.rotation.y = Math.atan2(-f.nx, -f.nz);
    this.scene.add(sign);
  }

  // los amigos (cuando Gaspi anda cerca y ya cargaron los modelos)
  spawn() {
    const g = this.group;
    const put = (h, x, z, rot, pose, who) => {
      h.root.position.set(x, 0.04, z);
      h.root.rotation.y = rot;
      g.add(h.root);
      this.people.push({ h, pose, who, off: R.range(0, 7), x, z });
      return h;
    };
    const seat = (who) => this.seats.find((s) => s.who === who);
    const cards = (h) => {
      // abanico de tres cartas en la mano izquierda
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(this.CARD, this.cardBack);
        c.rotation.set(Math.PI / 2 - 0.3, (i - 1) * 0.25, 0);
        c.position.set((i - 1) * 0.025, -0.1, 0.05);
        h.bones.handL.add(c);
      }
    };
    const s1 = seat('clau');
    const clau = makeLook({ shirt: 0x2e7d32, pants: 0x2c3e5c, hairStyle: 'short', stubble: true });
    if (clau) cards(put(clau, s1.x, s1.z, s1.rot, 'truco', 'clau'));
    const s2 = seat('pablo');
    const pablo = makeLook({ shirt: 0x37474f, pants: 0x1a1a1a, scale: 1.2 });
    if (pablo) cards(put(pablo, s2.x, s2.z, s2.rot, 'truco', 'pablo'));
    const s3 = seat('ale');
    const ale = makeLook({ shirt: 0x1565c0, pants: 0x3a3a3a, longSleeves: true });
    if (ale) {
      cards(put(ale, s3.x, s3.z, s3.rot, 'truco', 'ale'));
      wearHeadset(ale);
    }
    const s4 = seat('laban');
    const laban = makeStar('laban', { top: 0xffd400, bottom: 0xffd400, hat: 0xffd400 });
    if (laban) cards(put(laban, s4.x, s4.z, s4.rot, 'truco', 'laban'));
    const s5 = seat('gonza');
    const gonza = makeLook({ shirt: 0x1a1a1a, pants: 0x2c3e5c, beard: false, stubble: true });
    if (gonza) {
      put(gonza, s5.x, s5.z, s5.rot, 'guitar', 'gonza');
      gonza.bones.chest.add(guitar());
    }
    const martin = makeLook({ shirt: 0x8d6e63, pants: 0x2c3e5c });
    if (martin) {
      put(martin, -2.2, 2.3, Math.atan2(2.2, 0.5 - 2.3), 'cradle', 'martin');
      for (const s of [-1, 1]) martin.bones.chest.add(baby(s));
    }
    const nico = makeLook({ shirt: 0xf2f2f2, pants: 0x4e342e, cap: 0x3e2723 });
    if (nico) put(nico, -2.9, -1.7, Math.atan2(2.9, 0.5 + 1.7), 'walk', 'nico');
    const horse = makeAnimal('horse', { length: 2.6 });
    if (horse) {
      horse.g.position.set(-4.3, 0.04, -1.2);
      horse.g.rotation.y = 0.15;
      g.add(horse.g);
      this.horse = horse;
    }
    this.spawned = true;
  }

  despawn() {
    for (const p of this.people) {
      p.h.root.removeFromParent();
      disposeHuman(p.h);
    }
    this.people = [];
    this.horse?.g.removeFromParent();
    this.horse = null;
    this.spawned = false;
  }

  update(dt, world) {
    if (!this.group) return;
    const P = world.player;
    const d = Math.hypot(P.x - this.center.x, P.z - this.center.z);
    if (!this.spawned && d < 140 && PEOPLE.ready) this.spawn();
    else if (this.spawned && d > 190) this.despawn();
    if (!this.spawned || d > 80) return;
    this.clock += dt;
    for (const p of this.people) animateHuman(p.h, dt, 0, p.pose, this.clock + p.off);
    if (this.horse) {
      this.horse.mixer.update(dt);
      animalPlay(this.horse, 'idle');
    }
    // charla de la mesa (globitos y voces, ver speakers en main.js)
    this.talkT -= dt;
    if (this.talkT <= 0 && d < 40) {
      this.talkT = R.range(2.5, 5);
      const p = R.pick(this.people);
      if (p) {
        const lines = p.pose === 'truco' && R.chance(0.6) ? LINES.truco : LINES[p.who] ?? LINES.truco;
        this.bubble = { text: R.pick(lines), t: 3, who: p };
      }
    }
    if (this.bubble && (this.bubble.t -= dt) <= 0) this.bubble = null;
  }

  // para los globitos: dónde está el que habla
  talker() {
    const b = this.bubble;
    if (!b) return null;
    const p = new THREE.Vector3();
    b.who.h.root.getWorldPosition(p);
    return { x: p.x, y: p.y + (b.who.pose === 'truco' || b.who.pose === 'guitar' ? 1.6 : 2.1) * (b.who.h.root.scale.y || 1), z: p.z, b, key: b.who.off * 9 };
  }

  teleport(world, x, z, y) {
    const P = world.player;
    this.busy = true;
    this.fade.style.opacity = '1';
    setTimeout(() => {
      P.x = x;
      P.z = z;
      P.y = y;
      P.vy = 0;
      P.mvx = P.mvz = 0;
      this.fade.style.opacity = '0';
      this.busy = false;
    }, 500);
  }

  action(world) {
    const P = world.player;
    if (!this.group || this.busy || P.vehicle || P.dead) return null;
    const up = P.y > this.H - 1;
    if (!up && Math.hypot(P.x - this.door.x, P.z - this.door.z) < 2.4) return { text: 'Subir a la terraza de Clau', run: () => this.teleport(world, this.top.x, this.top.z, this.H) };
    if (up && Math.hypot(P.x - this.top.x, P.z - this.top.z) < 1.6) return { text: 'Bajar a la calle', run: () => this.teleport(world, this.door.x, this.door.z, 0.15) };
    if (up && Math.hypot(P.x - this.table.x, P.z - this.table.z) < 2.2 && this.spawned)
      return {
        text: 'Jugar una mano de truco',
        run: () =>
          world.hud.ask('Te dan tres cartas. ¿Qué cantás?', [
            { label: '¡Truco!', run: () => this.hand(world, 'truco') },
            { label: 'Envido', run: () => this.hand(world, 'envido') },
            { label: 'Me voy al mazo', run: () => world.hud.toast('Te fuiste al mazo. Laban: "Cobarde, pero con estilo"', 2.5) },
          ]),
      };
    return null;
  }

  hand(world, call) {
    const win = R.chance(call === 'truco' ? 0.5 : 0.55);
    const n = call === 'truco' ? 3000 : 1500;
    world.player.addMoney(win ? n : -Math.min(world.player.money, n / 2));
    if (win) world.audio.plata();
    world.hud.flash(win ? '¡GANASTE LA MANO!' : 'PERDISTE LA MANO', win ? `+$${n.toLocaleString('es-AR')} · Clau: "¡Qué suerte tiene el de traje!"` : `Pablo el alto: "Te vi las cartas desde acá arriba"`, win ? 'ok' : 'bad', 3);
    this.bubble = { text: call === 'truco' ? (win ? 'No quiero...' : '¡Quiero retruco!') : win ? 'Son buenas' : '¡Treinta y tres!', t: 2.5, who: R.pick(this.people) };
  }
}

// bebé envuelto en una mantita (para Martín): el cuerpo acostado en los brazos, la cabeza con gorrito
function baby(side) {
  const g = new THREE.Group();
  const blanket = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.26, 4, 10), new THREE.MeshLambertMaterial({ color: side > 0 ? 0x90caf9 : 0xf8bbd0 }));
  blanket.rotation.z = Math.PI / 2;
  g.add(blanket);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), new THREE.MeshLambertMaterial({ color: 0xeac0a0 }));
  head.position.set(side * 0.23, 0.04, 0.02);
  g.add(head);
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.079, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.2), new THREE.MeshLambertMaterial({ color: side > 0 ? 0xffffff : 0xfff3c4 }));
  hat.position.set(side * 0.245, 0.05, 0.02);
  hat.rotation.z = -side * 1.1;
  g.add(hat);
  // uno más arriba y adelante que el otro: los dos a upa
  g.position.set(side * 0.03, side > 0 ? -0.06 : -0.24, side > 0 ? 0.27 : 0.23);
  g.rotation.set(0.15, side * 0.15, side * 0.08);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

// guitarra criolla: caja, boca, mástil y clavijero, cruzada sobre el pecho
function guitar() {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0xc8833a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x3e2316 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.1, 18), wood);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1, 1, 1.25);
  g.add(body);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), dark);
  hole.position.set(0, 0.08, 0.052);
  g.add(hole);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.03), dark);
  neck.position.set(0, 0.42, 0.02);
  g.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.03), dark);
  head.position.set(0, 0.72, 0.02);
  g.add(head);
  g.position.set(0.02, -0.18, 0.2);
  g.rotation.set(0.1, 0, 1.15);
  g.traverse((o) => (o.castShadow = true));
  return g;
}
