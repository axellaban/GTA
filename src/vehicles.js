// Autos del conurbano, colectivos, motos y formaciones del Roca.
import * as THREE from 'three';
import { busTexture, trainSideTexture, textTexture } from './textures.js';

const M = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
const glass = M(0x1b2630);
const tire = M(0x151515);
const chrome = M(0xc8c8c8);
const motoWheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.1, 12).rotateZ(Math.PI / 2);

function mesh(g, m, x, y, z, parent) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  parent.add(o);
  return o;
}

export const CAR_COLORS = [0xd8d4c8, 0x8c1c13, 0x1f3a60, 0x2c2c2c, 0x9aa3a8, 0x3b5e2b, 0xc9a227, 0xf2f2f2, 0x6b3e26, 0x2d6e8a, 0xa84a1c];
export { makeCar, lightMat } from './cars.js';

export function makeBus(line = 518) {
  const g = new THREE.Group();
  const L = 11;
  const W = 2.5;
  const side = new THREE.MeshLambertMaterial({ map: busTexture(line) });
  const plain = M([0xf4d03f, 0x2e86c1, 0x27ae60][line % 3]);
  const mats = [side, side, plain, plain, plain, plain];
  mesh(new THREE.BoxGeometry(W, 2.6, L), mats, 0, 1.75, 0, g);
  mesh(new THREE.BoxGeometry(W * 0.95, 1.2, 0.06), glass, 0, 2.1, L / 2 + 0.01, g);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.35), new THREE.MeshBasicMaterial({ map: textTexture(`${line} TEMPERLEY`, { w: 256, h: 48, bg: '#111', fg: '#ffb300', font: 30 }) }));
  sign.position.set(0, 2.85, L / 2 + 0.04);
  g.add(sign);
  const wheels = [];
  for (const [x, z] of [
    [-W / 2, L / 2 - 2],
    [W / 2, L / 2 - 2],
    [-W / 2, -L / 2 + 2.4],
    [W / 2, -L / 2 + 2.4],
  ]) {
    const w = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12).rotateZ(Math.PI / 2), tire, x, 0.5, z, g);
    wheels.push(w);
  }
  const head = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.3, 0.2, 0.05), head, s * 0.9, 0.9, L / 2 + 0.02, g);
  g.userData = { L, W, wheels, headMat: head, kind: 'bus' };
  return g;
}

export function makeMoto(color = 0x1c1c1c) {
  const g = new THREE.Group();
  const paint = M(color);
  mesh(new THREE.BoxGeometry(0.3, 0.35, 1.3), paint, 0, 0.62, 0, g);
  mesh(new THREE.BoxGeometry(0.34, 0.14, 0.7), M(0x111111), 0, 0.86, -0.2, g);
  mesh(new THREE.BoxGeometry(0.7, 0.05, 0.05), chrome, 0, 1.05, 0.55, g);
  mesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), chrome, 0, 0.85, 0.6, g);
  const wheels = [mesh(motoWheelGeo, tire, 0, 0.32, 0.75, g), mesh(motoWheelGeo, tire, 0, 0.32, -0.7, g)];
  const head = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  mesh(new THREE.BoxGeometry(0.16, 0.12, 0.05), head, 0, 0.95, 0.68, g);
  g.userData = { L: 1.9, W: 0.7, wheels, headMat: head, kind: 'moto' };
  return g;
}

// Formación del Roca: `cars` coches de 20 m. La cabina mira hacia +z.
export function makeTrainCar(kind = 'electrico', cab = false) {
  const g = new THREE.Group();
  const side = new THREE.MeshLambertMaterial({ map: trainSideTexture(kind) });
  const body = kind === 'diesel' ? 0xd9d4c7 : 0xeef1f3;
  const plain = M(body);
  const L = 19.6;
  mesh(new THREE.BoxGeometry(2.9, 3.4, L), [side, side, M(0x9aa0a4), plain, plain, plain], 0, 2.35, 0, g);
  mesh(new THREE.BoxGeometry(2.6, 0.5, L - 3), M(0x2a2d30), 0, 0.5, 0, g);
  if (cab) {
    mesh(new THREE.BoxGeometry(2.3, 1.1, 0.06), glass, 0, 3.0, L / 2 + 0.02, g);
    const stripe = kind === 'diesel' ? 0xe0712c : 0x1b4f9c;
    mesh(new THREE.BoxGeometry(2.92, 0.5, 0.06), M(stripe), 0, 1.7, L / 2 + 0.02, g);
    const lights = new THREE.MeshBasicMaterial({ color: 0xfff6d0 });
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.3, 0.2, 0.05), lights, s * 0.9, 1.3, L / 2 + 0.03, g);
  }
  if (kind === 'electrico') {
    // pantógrafo
    mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), M(0x444444), 0, 4.4, 3, g);
    mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), M(0x444444), 0, 4.2, 3, g);
  }
  g.userData = { L: 20 };
  return g;
}
