// Armas: datos y modelos (en la mano y como objeto para agarrar).
import * as THREE from 'three';
import { BoxBuilder } from './builder.js';

export const WEAPONS = {
  punos: { id: 'punos', name: 'Piñas', melee: true },
  // la motosierra la tiene siempre: mientras apretás, corta sin parar
  motosierra: { id: 'motosierra', name: 'Motosierra', melee: true, saw: true, auto: true, dmg: 40, range: 1.9, dur: 0.32, knock: false, verb: 'Cortar' },
  baston: { id: 'baston', name: 'Bastón presidencial', melee: true, dmg: 44, range: 2.4, dur: 0.5, verb: 'Bastón' },
  palo: { id: 'palo', name: 'Palo', melee: true, dmg: 34, range: 2.1, dur: 0.62, verb: 'Palo' },
  revolver: { id: 'revolver', name: 'Revólver 38', gun: true, dmg: 52, rate: 0.55, mag: 6, reload: 2.2, range: 75, spread: 0.012, pellets: 1, pose: 'aim', ammoPickup: 18, sound: 'revolver' },
  pistola: { id: 'pistola', name: 'Pistola 9 mm', gun: true, dmg: 30, rate: 0.19, mag: 15, reload: 1.6, range: 65, spread: 0.022, pellets: 1, pose: 'aim', ammoPickup: 45, sound: 'pistola', auto: true },
  metra: { id: 'metra', name: 'Metra', gun: true, dmg: 20, rate: 0.085, mag: 30, reload: 1.9, range: 55, spread: 0.035, pellets: 1, pose: 'aim', ammoPickup: 60, sound: 'metra', auto: true },
  molotov: { id: 'molotov', name: 'Molotov', throw: true, ammoPickup: 3 },
  escopeta: { id: 'escopeta', name: 'Tumbera', gun: true, dmg: 17, rate: 0.95, mag: 2, reload: 2.6, range: 28, spread: 0.1, pellets: 7, pose: 'aimLong', knock: true, ammoPickup: 12, sound: 'escopeta' },
  // ametralladora con cinta: tira sin parar, patea fuerte y voltea a la gente
  ametralladora: { id: 'ametralladora', name: 'Ametralladora', gun: true, heavy: true, dmg: 36, rate: 0.068, mag: 100, reload: 3.6, range: 85, spread: 0.03, pellets: 1, pose: 'aimLong', knock: true, ammoPickup: 200, sound: 'ametralladora', auto: true },
  // bazuca: un cohete por vez, con estela de humo, que explota donde pega
  bazuca: { id: 'bazuca', name: 'Bazuca', gun: true, rocket: true, heavy: true, dmg: 0, rate: 1.1, mag: 1, reload: 2.4, range: 160, spread: 0.004, pellets: 1, pose: 'aimLong', ammoPickup: 5, sound: 'bazuca' },
  // lanzallamas (el de los jubilados): chorro de fuego mientras apretás; quema gente y autos
  lanzallamas: { id: 'lanzallamas', name: 'Lanzallamas', gun: true, flame: true, heavy: true, auto: true, dmg: 0, rate: 0.05, mag: 120, reload: 2.8, range: 8.5, spread: 0, pellets: 1, pose: 'aimLong', ammoPickup: 120 },
};
export const ORDER = ['punos', 'motosierra', 'baston', 'palo', 'revolver', 'pistola', 'metra', 'ametralladora', 'escopeta', 'molotov', 'bazuca', 'lanzallamas'];

const metal = 0x2a2c30;
const wood = 0x7a4a26;

// Geometrías con el caño hacia +z (se giran para ir en la mano)
function gunGeo(id) {
  const B = new BoxBuilder();
  if (id === 'palo') {
    B.add(new THREE.CylinderGeometry(0.045, 0.028, 0.9, 8).rotateX(Math.PI / 2).translate(0, 0, 0.36), wood);
    B.add(new THREE.CylinderGeometry(0.032, 0.032, 0.14, 8).rotateX(Math.PI / 2).translate(0, 0, -0.08), 0x222222);
  } else if (id === 'revolver') {
    B.box(0.035, 0.035, 0.2, metal, 0, 0.05, 0.12);
    B.add(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8).rotateX(Math.PI / 2).translate(0, 0.035, 0.02), 0x3a3c40);
    B.box(0.03, 0.1, 0.05, wood, 0, -0.03, -0.03);
    B.box(0.006, 0.02, 0.04, metal, 0, 0.0, 0.03);
  } else if (id === 'pistola') {
    B.box(0.032, 0.045, 0.19, 0x18191b, 0, 0.045, 0.08);
    B.box(0.03, 0.11, 0.045, 0x18191b, 0, -0.03, -0.0);
    B.box(0.006, 0.025, 0.04, 0x18191b, 0, -0.005, 0.045);
  } else if (id === 'motosierra') {
    // cuerpo naranja con manija arriba y la espada con la cadena
    B.box(0.13, 0.17, 0.3, 0xf07a1a, 0, 0.02, 0.02);
    B.box(0.14, 0.05, 0.12, 0x222222, 0, 0.13, -0.02);
    B.box(0.03, 0.12, 0.03, 0x222222, 0, 0.19, 0.04);
    B.box(0.035, 0.1, 0.12, 0x222222, 0, -0.02, -0.18);
    B.box(0.026, 0.09, 0.6, 0x3a3a3a, 0, 0.0, 0.46);
    B.box(0.02, 0.065, 0.6, 0xc8ccd0, 0, 0.0, 0.46);
  } else if (id === 'baston') {
    // bastón presidencial: puño de oro con borlas celeste y blanca, caña negra y hoja de espada
    B.add(new THREE.SphereGeometry(0.045, 12, 8).translate(0, 0, -0.2), 0xd9b04a);
    B.add(new THREE.CylinderGeometry(0.012, 0.02, 0.12, 6).translate(0.035, -0.05, -0.18), 0x75aadb);
    B.add(new THREE.CylinderGeometry(0.012, 0.02, 0.12, 6).translate(-0.035, -0.05, -0.18), 0xf4f4f4);
    B.add(new THREE.CylinderGeometry(0.024, 0.022, 0.32, 10).rotateX(Math.PI / 2).translate(0, 0, -0.01), 0x151210);
    B.add(new THREE.CylinderGeometry(0.052, 0.052, 0.03, 12).rotateX(Math.PI / 2).translate(0, 0, 0.16), 0xd9b04a);
    B.box(0.012, 0.038, 0.72, 0xdfe4ea, 0, 0, 0.53);
    B.box(0.006, 0.02, 0.06, 0xdfe4ea, 0, 0, 0.91);
  } else if (id === 'metra') {
    B.box(0.045, 0.075, 0.3, 0x1a1b1d, 0, 0.04, 0.08);
    B.box(0.03, 0.17, 0.045, 0x1a1b1d, 0, -0.07, 0.12);
    B.box(0.03, 0.1, 0.045, 0x1a1b1d, 0, -0.03, -0.02);
    B.add(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6).rotateX(Math.PI / 2).translate(0, 0.05, 0.28), 0x2a2c30);
    B.box(0.02, 0.05, 0.2, 0x2a2c30, 0, 0.03, -0.16);
  } else if (id === 'molotov') {
    // botella verde con el trapo
    B.add(new THREE.CylinderGeometry(0.04, 0.042, 0.18, 10).rotateX(Math.PI / 2).translate(0, 0, 0.05), 0x2e6b3a);
    B.add(new THREE.CylinderGeometry(0.015, 0.03, 0.08, 8).rotateX(Math.PI / 2).translate(0, 0, 0.18), 0x2e6b3a);
    B.box(0.03, 0.03, 0.07, 0xe8d8b0, 0, 0, 0.24);
  } else if (id === 'escopeta') {
    // tumbera: caño de hierro con culata de madera atada
    B.add(new THREE.CylinderGeometry(0.022, 0.022, 0.6, 8).rotateX(Math.PI / 2).translate(0, 0.04, 0.32), 0x3b3a38);
    B.add(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8).rotateX(Math.PI / 2).translate(0, 0.04, 0.05), 0x5a4a3a);
    B.box(0.04, 0.09, 0.32, wood, 0, 0.0, -0.14);
    B.box(0.045, 0.02, 0.02, 0x9a8a60, 0, 0.04, 0.12);
    B.box(0.045, 0.02, 0.02, 0x9a8a60, 0, 0.04, -0.04);
  } else if (id === 'ametralladora') {
    // cajón del mecanismo, caño largo con camisa agujereada, culata, cinta de balas y bípode plegado
    B.box(0.06, 0.1, 0.34, 0x1c1d1f, 0, 0.04, 0.06);
    B.add(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 10).rotateX(Math.PI / 2).translate(0, 0.055, 0.44), 0x2a2b2e);
    for (let i = 0; i < 5; i++) B.box(0.064, 0.012, 0.03, 0x111111, 0, 0.086, 0.3 + i * 0.07);
    B.add(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 8).rotateX(Math.PI / 2).translate(0, 0.055, 0.72), 0x3a3b3e);
    B.add(new THREE.CylinderGeometry(0.022, 0.028, 0.05, 8).rotateX(Math.PI / 2).translate(0, 0.055, 0.81), 0x1a1a1a);
    B.box(0.045, 0.12, 0.28, 0x3b2a1c, 0, -0.01, -0.26);
    B.box(0.035, 0.12, 0.05, 0x1c1d1f, 0, -0.06, 0.0);
    B.box(0.09, 0.09, 0.1, 0x3d4a2a, -0.075, 0.0, 0.08);
    for (let i = 0; i < 4; i++) B.box(0.03, 0.012, 0.016, 0xc9a227, -0.03 - i * 0.012, 0.06 - i * 0.03, 0.06);
    B.box(0.012, 0.012, 0.2, 0x222222, 0.02, 0.02, 0.55);
    B.box(0.012, 0.012, 0.2, 0x222222, -0.02, 0.02, 0.55);
    B.box(0.012, 0.05, 0.012, 0x111111, 0, 0.115, 0.6);
  } else if (id === 'lanzallamas') {
    // tubo con boquilla, garrafa roja abajo, manguera y el piloto encendido en la punta
    B.add(new THREE.CylinderGeometry(0.03, 0.035, 0.7, 10).rotateX(Math.PI / 2).translate(0, 0.06, 0.3), 0x3a3b3e);
    B.add(new THREE.CylinderGeometry(0.045, 0.03, 0.1, 10).rotateX(Math.PI / 2).translate(0, 0.06, 0.68), 0x1c1c1c);
    B.add(new THREE.CylinderGeometry(0.075, 0.075, 0.34, 12).rotateX(Math.PI / 2).translate(0, -0.07, 0.12), 0xc62828);
    B.add(new THREE.SphereGeometry(0.075, 10, 6).scale(1, 1, 0.6).translate(0, -0.07, 0.29), 0xc62828);
    B.add(new THREE.SphereGeometry(0.075, 10, 6).scale(1, 1, 0.6).translate(0, -0.07, -0.05), 0xc62828);
    B.box(0.035, 0.11, 0.045, 0x222222, 0, 0.0, -0.02);
    B.box(0.03, 0.1, 0.04, 0x222222, 0, 0.0, 0.32);
    B.box(0.02, 0.02, 0.14, 0x111111, 0.05, -0.01, 0.1);
    B.add(new THREE.SphereGeometry(0.022, 8, 6).translate(0, 0.02, 0.74), 0x4fc3f7);
  } else if (id === 'bazuca') {
    // tubo verde oliva sobre el hombro: boca acampanada atrás, mira, empuñadura y el cohete asomando
    B.add(new THREE.CylinderGeometry(0.06, 0.06, 1.15, 14).rotateX(Math.PI / 2).translate(0, 0.1, 0.05), 0x4a5a34);
    B.add(new THREE.CylinderGeometry(0.085, 0.065, 0.14, 14).rotateX(Math.PI / 2).translate(0, 0.1, -0.56), 0x3e4c2b);
    B.add(new THREE.CylinderGeometry(0.068, 0.068, 0.05, 14).rotateX(Math.PI / 2).translate(0, 0.1, 0.62), 0x2e3820);
    B.add(new THREE.ConeGeometry(0.05, 0.16, 12).rotateX(Math.PI / 2).translate(0, 0.1, 0.71), 0x6b6f4a);
    B.box(0.012, 0.016, 0.9, 0xd9c36a, 0, 0.165, 0.05);
    B.box(0.04, 0.06, 0.05, 0x1c1c1c, -0.07, 0.17, 0.2);
    B.box(0.035, 0.11, 0.045, 0x222222, 0, 0.0, 0.0);
    B.box(0.035, 0.1, 0.045, 0x222222, 0, 0.01, 0.3);
  }
  return B.geometry();
}

// cohete en vuelo: ojiva, cuerpo y aletas (la estela la pone el combate)
let rocketGeo = null;
export function rocketMesh() {
  if (rocketGeo) {
    const m = new THREE.Mesh(rocketGeo, mat);
    m.castShadow = true;
    return m;
  }
  const B = new BoxBuilder();
  B.add(new THREE.CylinderGeometry(0.045, 0.045, 0.42, 10).rotateX(Math.PI / 2), 0x5b6340);
  B.add(new THREE.ConeGeometry(0.048, 0.16, 10).rotateX(Math.PI / 2).translate(0, 0, 0.29), 0x7a7d58);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.BoxGeometry(0.008, 0.07, 0.1).translate(0, 0.07, -0.17);
    f.rotateZ((i / 4) * Math.PI * 2);
    B.add(f, 0x2a2a2a);
  }
  rocketGeo = B.geometry();
  return rocketMesh();
}

const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.45 });
const cache = new Map();
function geoFor(id) {
  if (!cache.has(id)) cache.set(id, gunGeo(id));
  return cache.get(id);
}

// Mesh para colgar del hueso de la mano derecha: el caño sigue al antebrazo (-y del hueso)
export function handWeapon(id) {
  const m = new THREE.Mesh(geoFor(id), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(0, -0.06, 0.02);
  m.castShadow = true;
  return m;
}

// Objeto que gira en el piso
export function pickupWeapon(id) {
  const m = new THREE.Mesh(geoFor(id), mat);
  m.scale.setScalar(['palo', 'baston', 'motosierra'].includes(id) ? 1.2 : ['ametralladora', 'bazuca', 'lanzallamas'].includes(id) ? 1.3 : 2.2);
  return m;
}
