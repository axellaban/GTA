// Personas low-poly armadas con cajas: Gaspi, vecinos, trapitos, motochorros, etc.
import * as THREE from 'three';
import { tieTexture } from './textures.js';

import { BoxBuilder } from './builder.js';

let tieMat = null;

export const SKINS = [0xe8c4a8, 0xd9a882, 0xc68b62, 0xa86f4a, 0x8a5a3a, 0xf1d2bb];
export const HAIRS = [0x2b1d14, 0x4a3020, 0x1a1a1a, 0x6b4a2b, 0x8a8a8a, 0xb88a4a];

// Cada persona son 6 mallas (cuerpo, 2 piernas, 2 brazos, cabeza) con colores por vértice.
export function makeHuman(o = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // se inclina al caer o sentarse
  root.add(body);
  const skin = o.skin ?? 0xd9a882;
  const shirt = o.shirt ?? 0x3f6fa0;
  const pants = o.pants ?? 0x2d3440;
  const shoes = o.shoes ?? 0x1c1c1c;
  const hair = o.hair ?? 0x2b1d14;
  const torsoColor = o.jacket ?? shirt;

  const B = new BoxBuilder();
  B.box(0.36, 0.2, 0.22, pants, 0, 0.95, 0);
  B.box(0.46, 0.62, 0.26, torsoColor, 0, 1.36, 0);
  if (o.jacket) B.box(0.14, 0.36, 0.02, shirt, 0, 1.49, 0.135);
  if (o.vest) {
    B.box(0.48, 0.5, 0.28, o.vest, 0, 1.36, 0);
    B.box(0.49, 0.05, 0.29, 0xdddddd, 0, 1.26, 0);
  }
  if (o.belly) B.box(0.4, 0.3, 0.12, torsoColor, 0, 1.2, 0.15);
  body.add(B.mesh());
  if (o.tie) {
    if (!tieMat) tieMat = new THREE.MeshLambertMaterial({ map: tieTexture() });
    for (const [w, h, y] of [
      [0.07, 0.36, 1.44],
      [0.09, 0.06, 1.64],
    ]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.025), tieMat);
      t.position.set(0, y, 0.15);
      body.add(t);
    }
  }

  const legs = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.1 * s, 0.95, 0);
    body.add(pivot);
    const L = new BoxBuilder();
    L.box(0.15, 0.88, 0.17, pants, 0, -0.44, 0);
    L.box(0.16, 0.09, 0.28, shoes, 0, -0.9, 0.05);
    pivot.add(L.mesh());
    legs.push(pivot);
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.3 * s, 1.62, 0);
    body.add(pivot);
    const A = new BoxBuilder();
    A.box(0.12, 0.6, 0.13, torsoColor, 0, -0.3, 0);
    A.box(0.1, 0.12, 0.11, skin, 0, -0.66, 0);
    if (o.franela && s > 0) A.box(0.3, 0.3, 0.02, 0xf5d90a, 0, -0.8, 0.05);
    if (o.cup && s < 0) A.box(0.1, 0.12, 0.1, 0xe8e8e8, 0, -0.72, 0.08);
    pivot.add(A.mesh());
    arms.push(pivot);
  }
  const head = new THREE.Group();
  head.position.set(0, 1.8, 0);
  body.add(head);
  const H = new BoxBuilder();
  H.box(0.1, 0.08, 0.1, skin, 0, -0.1, 0);
  H.box(0.25, 0.28, 0.26, skin, 0, 0.06, 0);
  H.box(0.05, 0.03, 0.01, 0x1a1a1a, -0.06, 0.09, 0.131);
  H.box(0.05, 0.03, 0.01, 0x1a1a1a, 0.06, 0.09, 0.131);
  if (o.beard) H.box(0.24, 0.1, 0.03, hair, 0, -0.03, 0.13);
  if (o.helmet) {
    H.box(0.32, 0.26, 0.33, o.helmet, 0, 0.14, 0);
    H.box(0.26, 0.1, 0.02, 0x111111, 0, 0.07, 0.17);
  } else if (o.hood) {
    H.box(0.3, 0.32, 0.3, o.hood, 0, 0.1, -0.02);
  } else if (o.cap) {
    H.box(0.27, 0.1, 0.28, o.cap, 0, 0.23, 0);
    H.box(0.24, 0.03, 0.14, o.cap, 0, 0.19, 0.18);
  } else if (o.hairStyle !== 'bald') {
    H.box(0.27, 0.09, 0.28, hair, 0, 0.23, -0.005);
    H.box(0.27, 0.16, 0.06, hair, 0, 0.13, -0.12);
    if (o.hairStyle === 'long') H.box(0.27, 0.3, 0.08, hair, 0, -0.02, -0.14);
  }
  head.add(H.mesh());

  const h = { root, body, legs, arms, head, phase: Math.random() * 10, pose: 'stand', lean: 0 };
  root.scale.setScalar(o.scale ?? 1);
  root.userData.human = h;
  return h;
}

// Anima caminata y poses. `speed` en m/s.
export function animateHuman(h, dt, speed, pose = 'walk') {
  h.phase += dt * (2 + speed * 2.4);
  const s = Math.sin(h.phase);
  const amp = Math.min(0.9, speed * 0.28);
  const [ll, rl] = h.legs;
  const [la, ra] = h.arms;
  h.body.rotation.set(0, 0, 0);
  h.body.position.set(0, 0, 0);
  la.rotation.set(0, 0, 0);
  ra.rotation.set(0, 0, 0);
  ll.rotation.set(0, 0, 0);
  rl.rotation.set(0, 0, 0);
  h.head.rotation.set(0, 0, 0);

  if (pose === 'knocked') {
    h.body.rotation.x = -Math.PI / 2;
    h.body.position.y = 0.15;
    h.body.position.z = -0.9;
    la.rotation.z = 1.2;
    ra.rotation.z = -1.4;
    return;
  }
  if (pose === 'sit') {
    h.body.position.y = -0.5;
    ll.rotation.x = -1.5;
    rl.rotation.x = -1.5;
    la.rotation.x = -0.6 + Math.sin(h.phase * 0.3) * 0.05;
    ra.rotation.x = -0.9;
    h.head.rotation.x = 0.25;
    return;
  }
  ll.rotation.x = s * amp;
  rl.rotation.x = -s * amp;
  la.rotation.x = -s * amp * 0.8;
  ra.rotation.x = s * amp * 0.8;
  h.body.position.y = Math.abs(Math.cos(h.phase)) * amp * 0.06;

  if (pose === 'zombie') {
    la.rotation.x = -1.2 + Math.sin(h.phase * 0.5) * 0.2;
    ra.rotation.x = -1.0 + Math.cos(h.phase * 0.4) * 0.25;
    h.body.rotation.z = Math.sin(h.phase * 0.35) * 0.18;
    h.body.rotation.x = 0.15;
    h.head.rotation.z = Math.sin(h.phase * 0.3) * 0.3;
    h.head.rotation.x = 0.3;
  } else if (pose === 'wave') {
    ra.rotation.x = -2.6 + Math.sin(h.phase * 3) * 0.4;
    ra.rotation.z = Math.sin(h.phase * 3) * 0.5;
  } else if (pose === 'drum') {
    la.rotation.x = -0.9 + Math.max(0, Math.sin(h.phase * 3)) * 0.9;
    ra.rotation.x = -0.9 + Math.max(0, Math.sin(h.phase * 3 + Math.PI)) * 0.9;
  } else if (pose === 'banner') {
    la.rotation.x = -2.9;
    ra.rotation.x = -2.9;
  } else if (pose === 'fist') {
    ra.rotation.x = -2.8 + Math.sin(h.phase * 4) * 0.35;
  } else if (pose === 'punch') {
    ra.rotation.x = -1.6;
    h.body.rotation.y = -0.3;
  } else if (pose === 'ride') {
    ll.rotation.x = -1.3;
    rl.rotation.x = -1.3;
    ll.rotation.z = 0.25;
    rl.rotation.z = -0.25;
    la.rotation.x = -1.2;
    ra.rotation.x = -1.2;
    h.body.position.y = -0.45;
  } else if (pose === 'phone') {
    ra.rotation.x = -2.3;
    ra.rotation.z = 0.5;
    h.head.rotation.x = 0.2;
  }
}

export function randomCivilian(rng) {
  const r = rng ?? Math;
  const pick = (a) => a[Math.floor(r.random ? r.random() * a.length : r.next() * a.length)];
  return {
    skin: pick(SKINS),
    hair: pick(HAIRS),
    shirt: pick([0x3f6fa0, 0xb03a2e, 0x2e7d32, 0xf2f2f2, 0x6a1b9a, 0xf9a825, 0x455a64, 0x1e88e5, 0xd81b60, 0x795548]),
    pants: pick([0x2d3440, 0x1c2a4a, 0x4e4e4e, 0x6d5c47, 0x1a1a1a, 0x37474f]),
    hairStyle: pick(['short', 'short', 'long', 'bald']),
    cap: Math.random() < 0.2 ? pick([0xc62828, 0x1a237e, 0xffffff, 0x6ec3ea]) : null,
    belly: Math.random() < 0.2,
    scale: 0.92 + Math.random() * 0.14,
  };
}

// Gaspi: saco oscuro, camisa blanca, corbata a rayas rojas y blancas, pelo castaño.
export function makeGaspi() {
  return makeHuman({
    skin: 0xe6bea0,
    hair: 0x5a3a22,
    jacket: 0x26282d,
    shirt: 0xf4f4f4,
    tie: true,
    pants: 0x1d1f23,
    shoes: 0x111111,
    scale: 1.04,
  });
}
