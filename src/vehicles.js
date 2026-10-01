// Autos del conurbano, colectivos, motos y formaciones del Roca.
import * as THREE from 'three';
import { busTexture, trainSideTexture, textTexture } from './textures.js';
import { BoxBuilder } from './builder.js';
import { R } from './rng.js';
import { makeHorse } from './animals.js';

const M = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
const glass = M(0x1b2630);
const tire = M(0x151515);
const chrome = M(0xc8c8c8);
const motoWheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.1, 14).rotateZ(Math.PI / 2);

function mesh(g, m, x, y, z, parent) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  parent.add(o);
  return o;
}

// los de siempre más pasteles de los 80 (rosa, turquesa, crema, celeste, menta, coral), como Vice City
export const CAR_COLORS = [0xd8d4c8, 0x8c1c13, 0x1f3a60, 0x2c2c2c, 0x9aa3a8, 0x3b5e2b, 0xc9a227, 0xf2f2f2, 0x6b3e26, 0x2d6e8a, 0xa84a1c, 0xf4a6c6, 0x52c7c0, 0xf3ead3, 0x9fd8e8, 0xb8e6c4, 0xff8a65];
export { makeCar, lightMat } from './cars.js';
import { lightMat } from './cars.js';

// Colectivo: carrocería perfilada, ventanillas con parantes, parabrisas, puertas del lado derecho,
// cartel de línea y fileteado en el faldón.
// Líneas que pasan por la estación Temperley. Los colores son de fantasía; el cartel dice el
// destino cuando lo sabemos (160: Claypole; 549: Cruce de Lomas) y si no, Temperley.
export const BUS_LINES = {
  160: { top: 0xf2c230, band: 0xc0392b, skirt: '#c0392b', dest: 'CLAYPOLE' },
  74: { top: 0xf2f2f2, band: 0x1e5aa8, skirt: '#1e5aa8', dest: 'TEMPERLEY' },
  548: { top: 0x2e86c1, band: 0xf2f2f2, skirt: '#f7f9f9', dest: 'TEMPERLEY' },
  549: { top: 0xe67e22, band: 0x1a1a1a, skirt: '#1a1a1a', dest: 'CRUCE DE LOMAS' },
  318: { top: 0x27ae60, band: 0xf4d03f, skirt: '#f4d03f', dest: 'TEMPERLEY' },
  266: { top: 0x8e44ad, band: 0xf2f2f2, skirt: '#f7f9f9', dest: 'TEMPERLEY' },
  278: { top: 0xc0392b, band: 0xf2c230, skirt: '#f2c230', dest: 'TEMPERLEY' },
};
export function makeBus(line = 160) {
  const g = new THREE.Group();
  const L = 11.5;
  const W = 2.5;
  const H = 3.05;
  const L_ = BUS_LINES[line] ?? BUS_LINES[160];
  const { top, band } = L_;
  // perfil lateral (x = largo, frente en +x)
  const s = new THREE.Shape();
  const f = L / 2;
  const r = -L / 2;
  s.moveTo(r + 0.2, 0.38);
  s.lineTo(f - 0.25, 0.38);
  s.quadraticCurveTo(f, 0.38, f, 0.7);
  s.lineTo(f, 1.25);
  s.lineTo(f - 0.12, H - 0.45);
  s.quadraticCurveTo(f - 0.2, H, f - 0.7, H);
  s.lineTo(r + 0.45, H);
  s.quadraticCurveTo(r, H, r, H - 0.4);
  s.lineTo(r, 0.6);
  s.quadraticCurveTo(r, 0.38, r + 0.2, 0.38);
  const body = new THREE.ExtrudeGeometry(s, { depth: W - 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 8 });
  body.rotateY(-Math.PI / 2);
  body.translate(W / 2 - 0.05, 0, 0);
  const paint = new THREE.Mesh(body, new THREE.MeshStandardMaterial({ color: top, roughness: 0.4, metalness: 0.25 }));
  paint.castShadow = true;
  paint.receiveShadow = true;
  g.add(paint);
  const D = new BoxBuilder();
  const glass = 0x101820;
  // faldón de color y paragolpes
  D.box(W + 0.03, 0.55, L - 0.3, band, 0, 0.72, 0);
  D.box(W + 0.06, 0.28, 0.14, 0x1a1a1a, 0, 0.5, f + 0.03);
  D.box(W + 0.06, 0.28, 0.14, 0x1a1a1a, 0, 0.5, r - 0.03);
  // ventanillas con parantes
  const z0 = r + 0.5;
  const z1 = f - 1.9;
  for (const sx of [-1, 1]) {
    D.box(0.04, 0.95, z1 - z0, glass, sx * (W / 2 + 0.01), 2.05, (z0 + z1) / 2);
    for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / 6) D.box(0.06, 0.95, 0.09, top, sx * (W / 2 + 0.02), 2.05, z);
  }
  // ventanilla del chofer y puertas (a la derecha, lado -x)
  D.box(0.04, 1.0, 1.1, glass, W / 2 + 0.01, 2.0, f - 1.0);
  D.box(0.04, 2.1, 1.0, glass, -W / 2 - 0.01, 1.5, f - 1.05);
  D.box(0.04, 2.1, 1.0, glass, -W / 2 - 0.01, 1.5, -0.6);
  D.box(0.05, 2.1, 0.04, 0x9a9a9a, -W / 2 - 0.02, 1.5, f - 1.05);
  D.box(0.05, 2.1, 0.04, 0x9a9a9a, -W / 2 - 0.02, 1.5, -0.6);
  // parabrisas y luneta
  D.box(W * 0.9, 1.35, 0.05, glass, 0, 2.02, f + 0.005);
  D.box(0.06, 1.35, 0.06, top, 0, 2.02, f + 0.02);
  D.box(W * 0.8, 0.8, 0.05, glass, 0, 2.2, r - 0.005);
  // ruedas: pasaruedas negros
  for (const z of [f - 2.2, r + 2.6]) for (const sx of [-1, 1]) D.box(0.06, 0.95, 1.2, 0x0c0c0c, sx * (W / 2 + 0.02), 0.62, z);
  // espejos
  for (const sx of [-1, 1]) D.box(0.08, 0.35, 0.12, 0x1a1a1a, sx * (W / 2 + 0.25), 2.3, f + 0.1);
  const det = D.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.5 }));
  g.add(det);
  // fileteado con el número de línea en el faldón
  const side = new THREE.MeshLambertMaterial({ map: busTexture(line, L_.skirt), transparent: true });
  for (const sx of [-1, 1]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(L - 1, 0.55), side);
    pl.position.set(sx * (W / 2 + 0.035), 0.72, 0);
    pl.rotation.y = (sx * Math.PI) / 2;
    g.add(pl);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.32), new THREE.MeshBasicMaterial({ map: textTexture(`${line}  ${L_.dest}`, { w: 256, h: 44, bg: '#111', fg: '#ffb300', font: L_.dest.length > 10 ? 22 : 28 }) }));
  sign.position.set(0, H - 0.3, f - 0.02);
  g.add(sign);
  const wheels = [];
  for (const [x, z] of [
    [-W / 2 + 0.15, f - 2.2],
    [W / 2 - 0.15, f - 2.2],
    [-W / 2 + 0.15, r + 2.6],
    [W / 2 - 0.15, r + 2.6],
  ]) wheels.push(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.32, 16).rotateZ(Math.PI / 2), tire, x, 0.5, z, g));
  // luces (se encienden de noche con el mismo material que los autos)
  const Lb = new BoxBuilder();
  for (const sx of [-1, 1]) {
    Lb.box(0.34, 0.2, 0.05, 0xfff3cf, sx * 0.85, 0.95, f + 0.03);
    Lb.box(0.12, 0.1, 0.05, 0xffa000, sx * 1.1, 0.95, f + 0.03);
    Lb.box(0.25, 0.3, 0.05, 0xb01010, sx * 1.0, 1.2, r - 0.03);
  }
  g.add(Lb.mesh(lightMat));
  const head = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  g.userData = { L, W, wheels, headMat: head, kind: 'bus', model: 'colectivo', tall: H };
  return g;
}

// Moto de calle (110/150 cc). Con `box` lleva la caja de delivery atrás.
const motoTex = new Map();
export function makeMoto(color = 0x1c1c1c, { box = null, label = 'DELIVERY' } = {}) {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const B = new BoxBuilder();
  const dark = 0x151515;
  // cuadro, tanque, asiento, cachas y guardabarros
  B.add(new THREE.CylinderGeometry(0.035, 0.035, 1.05, 6).rotateX(Math.PI / 2 - 0.35).translate(0, 0.62, 0.05), 0x2a2a2a);
  B.box(0.3, 0.2, 0.42, color, 0, 0.86, 0.22);
  B.box(0.27, 0.1, 0.62, dark, 0, 0.9, -0.24);
  B.box(0.32, 0.22, 0.5, color, 0, 0.7, -0.35);
  B.box(0.18, 0.05, 0.4, color, 0, 0.72, 0.72);
  B.box(0.16, 0.05, 0.36, color, 0, 0.72, -0.78);
  // motor y caño de escape
  B.box(0.24, 0.24, 0.3, 0x3a3a3a, 0, 0.42, 0.05);
  B.add(new THREE.CylinderGeometry(0.035, 0.045, 0.6, 8).rotateX(Math.PI / 2).translate(0.15, 0.36, -0.45), 0x9a9a9a);
  // horquilla, manubrio y óptica
  for (const s of [-1, 1]) B.add(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 6).rotateX(-0.35).translate(s * 0.08, 0.66, 0.68), 0xb0b0b0);
  B.add(new THREE.CylinderGeometry(0.018, 0.018, 0.66, 6).rotateZ(Math.PI / 2).translate(0, 1.02, 0.56), 0x1a1a1a);
  B.box(0.2, 0.18, 0.12, color, 0, 0.96, 0.66);
  for (const s of [-1, 1]) B.box(0.04, 0.02, 0.06, 0xb0b0b0, s * 0.18, 1.12, 0.58);
  if (box) {
    // caja de reparto
    B.box(0.46, 0.44, 0.44, box, 0, 1.22, -0.66);
    B.box(0.48, 0.05, 0.46, 0x222222, 0, 1.0, -0.66);
    B.box(0.2, 0.03, 0.4, 0x222222, 0, 0.97, -0.5);
  }
  const body = B.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.35 }));
  g.add(body);
  if (box) {
    if (!motoTex.has(label + box)) motoTex.set(label + box, textTexture(label, { w: 256, h: 128, bg: `#${new THREE.Color(box).getHexString()}`, fg: '#ffffff', font: 44 }));
    const sign = new THREE.MeshBasicMaterial({ map: motoTex.get(label + box) });
    for (const s of [-1, 1]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.22), sign);
      pl.position.set(s * 0.232, 1.24, -0.66);
      pl.rotation.y = (s * Math.PI) / 2;
      g.add(pl);
    }
  }
  const wheels = [];
  for (const z of [0.72, -0.72]) {
    const w = new THREE.Group();
    w.add(new THREE.Mesh(motoWheelGeo, tire));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.11, 10).rotateZ(Math.PI / 2), chrome);
    w.add(hub);
    w.position.set(0, 0.32, z);
    w.traverse((o) => (o.castShadow = true));
    g.add(w);
    wheels.push(w);
  }
  const head = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  mesh(new THREE.BoxGeometry(0.14, 0.1, 0.05), head, 0, 0.96, 0.73, g);
  mesh(new THREE.BoxGeometry(0.12, 0.05, 0.03), new THREE.MeshBasicMaterial({ color: 0xb01010 }), 0, 0.8, -1.0, g);
  g.userData = { L: 1.95, W: 0.7, wheels, headMat: head, kind: 'moto', model: box ? 'delivery' : 'moto' };
  return g;
}

// Camión de reparto: cabina + caja con cartel
export function makeTruck(color = 0xe8e8e8, label = 'FLETES TEMPERLEY') {
  const g = new THREE.Group();
  const L = 7.2;
  const W = 2.35;
  const B = new BoxBuilder();
  const dark = 0x1a1a1a;
  // chasis
  B.box(W * 0.8, 0.3, L * 0.95, dark, 0, 0.62, 0);
  // cabina
  B.box(W, 1.55, 1.9, color, 0, 1.55, L / 2 - 0.95);
  B.box(W * 0.98, 0.35, 0.6, color, 0, 0.95, L / 2 - 0.1);
  B.box(W * 0.92, 0.7, 0.05, 0x10161c, 0, 1.95, L / 2 + 0.005);
  for (const s of [-1, 1]) B.box(0.05, 0.6, 0.9, 0x10161c, s * (W / 2 + 0.005), 1.95, L / 2 - 0.6);
  B.box(W * 0.8, 0.25, 0.05, 0x2a2a2a, 0, 0.95, L / 2 + 0.2);
  B.box(W + 0.05, 0.2, 0.15, dark, 0, 0.62, L / 2 + 0.12);
  for (const s of [-1, 1]) B.box(0.08, 0.3, 0.08, dark, s * (W / 2 + 0.12), 2.05, L / 2 - 0.2);
  // caja de carga
  B.box(W + 0.1, 2.5, L - 2.2, 0xf2f2f2, 0, 2.05, -1.05);
  B.box(W + 0.12, 0.12, L - 2.15, 0x9e9e9e, 0, 0.84, -1.05);
  const body = B.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 }));
  body.receiveShadow = true;
  g.add(body);
  const sign = new THREE.MeshLambertMaterial({ map: textTexture(label, { w: 512, h: 128, bg: '#f2f2f2', fg: '#b3261e', font: 50 }) });
  for (const s of [-1, 1]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(L - 2.6, 0.9), sign);
    pl.position.set(s * (W / 2 + 0.07), 2.3, -1.05);
    pl.rotation.y = (s * Math.PI) / 2;
    g.add(pl);
  }
  const wheels = [];
  for (const [x, z] of [
    [-W / 2 + 0.2, L / 2 - 1.2],
    [W / 2 - 0.2, L / 2 - 1.2],
    [-W / 2 + 0.2, -L / 2 + 1.6],
    [W / 2 - 0.2, -L / 2 + 1.6],
    [-W / 2 + 0.2, -L / 2 + 0.6],
    [W / 2 - 0.2, -L / 2 + 0.6],
  ]) wheels.push(mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.32, 14).rotateZ(Math.PI / 2), tire, x, 0.48, z, g));
  const head = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.3, 0.2, 0.05), head, s * 0.8, 1.0, L / 2 + 0.06, g);
  g.userData = { L, W, wheels, headMat: head, kind: 'car', model: 'camion', tall: 3.3 };
  return g;
}

// Carro de cartonero tirado por un caballo, con el cartonero sentado adelante
export function makeCarro(driver) {
  const g = new THREE.Group();
  const wood = M(0x7a5a3a);
  const B = new BoxBuilder();
  // carro (atrás, centrado en z = -1)
  B.box(1.3, 0.08, 1.9, 0x7a5a3a, 0, 0.75, -1);
  for (const s of [-1, 1]) B.box(0.06, 0.45, 1.9, 0x6a4a2a, s * 0.62, 1.0, -1);
  B.box(1.3, 0.45, 0.06, 0x6a4a2a, 0, 1.0, -1.93);
  // cartones y bolsas
  B.box(0.9, 0.5, 0.7, 0xb08a58, -0.1, 1.2, -1.3);
  B.box(0.6, 0.4, 0.5, 0xc79e66, 0.25, 1.35, -0.7);
  B.box(0.5, 0.35, 0.45, 0xf2f2f2, -0.3, 1.15, -0.6);
  B.box(0.7, 0.3, 0.6, 0xa07a48, 0.1, 1.6, -1.2);
  // varas hasta el caballo
  for (const s of [-1, 1]) B.box(0.05, 0.05, 1.6, 0x5a3a1a, s * 0.4, 0.95, 0.6);
  const body = B.mesh(new THREE.MeshLambertMaterial({ vertexColors: true }));
  g.add(body);
  // caballo
  const horse = makeHorse(R.pick([0x6b4226, 0x3b2616, 0xa0785a, 0xd8d0c0, 0x8a5a36]));
  horse.g.traverse((o) => (o.castShadow = true));
  g.add(horse.g);
  const legs = horse.legs;
  const wheels = [];
  for (const s of [-1, 1]) {
    const w = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 14).rotateZ(Math.PI / 2), wood, s * 0.72, 0.55, -1, g);
    wheels.push(w);
  }
  if (driver) {
    driver.root.position.set(0, 0.35, -0.2);
    g.add(driver.root);
  }
  g.userData = { L: 4.4, W: 1.45, wheels, legs, horse: horse.g, kind: 'carro', model: 'carro', tall: 2.2 };
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
