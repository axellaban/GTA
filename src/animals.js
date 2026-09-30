// Perros callejeros y el caballo del carro del cartonero, con forma de verdad: cuerpo con pecho,
// cintura y anca, cuello, cabeza con hocico, orejas, cola y patas que se doblan en la rodilla.
// Se arman con las mismas superficies por perfiles que las personas (body.js).
import * as THREE from 'three';
import { Mesher, loft, ellipsoid } from './body.js';

const FULL = { u0: 0, u1: 1, v0: 0, v1: 1 };
const W = () => [[0, 1]];
let furMat = null;

// pelaje: vetas finas a lo largo del cuerpo (se multiplica por el color de cada parte)
function material() {
  if (furMat) return furMat;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e8e8e8';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1400; i++) {
    const v = 170 + Math.floor(Math.random() * 85);
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = 1;
    const x = Math.random() * 128;
    const y = Math.random() * 128;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 3, y + 4 + Math.random() * 6);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  furMat = new THREE.MeshStandardMaterial({ map: t, vertexColors: true, roughness: 0.88, metalness: 0 });
  return furMat;
}

function part(build) {
  const m = new Mesher();
  build(m);
  const mesh = new THREE.Mesh(m.build(), material());
  mesh.castShadow = true;
  return mesh;
}
const tone = (c, k) => new THREE.Color(c).multiplyScalar(k);

// Pata con rodilla: grupo en la cadera/hombro; `lower` es el grupo que dobla en la rodilla.
function leg(x, y, z, up, low, hoof, color, hoofColor, knee) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(part((m) => loft(m, { keys: up, seg: 10, color, cell: FULL, weights: W })));
  const lower = new THREE.Group();
  lower.position.y = knee;
  lower.add(part((m) => {
    loft(m, { keys: low, seg: 9, color, cell: FULL, weights: W });
    loft(m, { keys: hoof, seg: 9, capStart: true, color: hoofColor, cell: FULL, weights: W });
  }));
  g.add(lower);
  g.userData.lower = lower;
  return g;
}

// ---------- Perro ----------
// Mira hacia +z. Mide unos 55 cm a la cruz.
export function makeDog(color, { floppy = Math.random() < 0.5, patch = Math.random() < 0.4 } = {}) {
  const g = new THREE.Group();
  const belly = patch ? tone(color, 1.6).lerp(new THREE.Color(0xf2ece0), 0.6) : tone(color, 1.15);
  // cuerpo (eje z, de la cola al pecho): [z, ancho, arriba, abajo, altura del centro]
  const body = [
    [-0.36, 0.045, 0.045, 0.045, 0.45],
    [-0.31, 0.095, 0.085, 0.095, 0.43],
    [-0.2, 0.105, 0.085, 0.1, 0.425],
    [-0.04, 0.095, 0.08, 0.07, 0.44],
    [0.1, 0.11, 0.09, 0.12, 0.44],
    [0.22, 0.112, 0.095, 0.135, 0.45],
    [0.3, 0.085, 0.085, 0.105, 0.48],
    [0.34, 0.04, 0.05, 0.05, 0.5],
  ];
  g.add(part((m) => loft(m, { keys: body, axis: 'z', seg: 14, capStart: true, capEnd: true, color: (t, a, x, y) => (y < 0.38 ? belly : color), cell: FULL, weights: W })));
  // cuello y cabeza
  const head = new THREE.Group();
  head.position.set(0, 0.57, 0.3);
  head.add(
    part((m) => {
      loft(m, {
        keys: [
          [-0.06, 0.07, 0.07, 0.08, -0.04],
          [0.02, 0.062, 0.062, 0.068, 0.04],
          [0.08, 0.055, 0.055, 0.058, 0.1],
        ],
        axis: 'z',
        seg: 12,
        color,
        cell: FULL,
        weights: W,
      });
      // cráneo y hocico
      loft(m, {
        keys: [
          [0.06, 0.03, 0.03, 0.03, 0.14],
          [0.09, 0.064, 0.06, 0.058, 0.14],
          [0.15, 0.068, 0.064, 0.058, 0.14],
          [0.2, 0.052, 0.045, 0.048, 0.125],
          [0.24, 0.036, 0.032, 0.036, 0.11],
          [0.3, 0.031, 0.028, 0.031, 0.105],
          [0.33, 0.018, 0.018, 0.02, 0.105],
        ],
        axis: 'z',
        seg: 12,
        capStart: true,
        capEnd: true,
        color: (t, a, x, y) => (t > 0.22 && y < 0.1 ? belly : color),
        cell: FULL,
        weights: W,
      });
      ellipsoid(m, 0, 0.117, 0.33, 0.017, 0.013, 0.012, { seg: 8, color: 0x141010, cell: FULL, weights: W });
      for (const s of [-1, 1]) {
        ellipsoid(m, s * 0.036, 0.162, 0.2, 0.011, 0.01, 0.008, { seg: 8, color: 0x1a120c, cell: FULL, weights: W });
        if (floppy) ellipsoid(m, s * 0.066, 0.13, 0.12, 0.012, 0.045, 0.032, { seg: 8, color: tone(color, 0.8), cell: FULL, weights: W });
        else
          loft(m, {
            keys: [
              [0.19, 0.022, 0.012, 0.012, 0.11],
              [0.23, 0.014, 0.008, 0.008, 0.112],
              [0.26, 0.002, 0.002, 0.002, 0.114],
            ],
            x0: s * 0.045,
            seg: 6,
            color: tone(color, 0.85),
            cell: FULL,
            weights: W,
          });
      }
    }),
  );
  g.add(head);
  // cola
  const tail = new THREE.Group();
  tail.position.set(0, 0.47, -0.33);
  tail.add(
    part((m) =>
      loft(m, {
        keys: [
          [-0.26, 0.012, 0.012, 0.012, 0.1],
          [-0.16, 0.022, 0.022, 0.022, 0.07],
          [-0.06, 0.025, 0.025, 0.025, 0.03],
          [0.02, 0.022, 0.022, 0.022, 0],
        ],
        axis: 'z',
        seg: 8,
        capStart: true,
        color,
        cell: FULL,
        weights: W,
      }),
    ),
  );
  g.add(tail);
  // patas: [altura, ancho, frente, atrás]
  const up = [
    [-0.2, 0.03, 0.032, 0.032],
    [-0.1, 0.04, 0.046, 0.05],
    [0.03, 0.05, 0.06, 0.062],
  ];
  const low = [
    [-0.17, 0.022, 0.024, 0.024],
    [-0.08, 0.021, 0.023, 0.024],
    [0.0, 0.028, 0.031, 0.031],
  ];
  const paw = [
    [-0.2, 0.027, 0.04, 0.025, 0.014],
    [-0.16, 0.023, 0.026, 0.024, 0.005],
  ];
  const legs = [];
  for (const [x, z] of [
    [-0.065, 0.22],
    [0.065, 0.22],
    [-0.07, -0.22],
    [0.07, -0.22],
  ]) {
    const l = leg(x, 0.4, z, up, low, paw, color, tone(color, 0.7), -0.2);
    g.add(l);
    legs.push(l);
  }
  return { g, legs, tail, head };
}

// ---------- Caballo del carro ----------
// Mira hacia +z; el cuerpo va de z = 0,5 (anca) a z = 2 (pecho), como el caballo de antes.
export function makeHorse(coat) {
  const g = new THREE.Group();
  const dark = coat === 0xd8d0c0 ? 0xf0ece4 : tone(coat, 0.45);
  const body = [
    [0.5, 0.1, 0.1, 0.1, 1.34],
    [0.58, 0.21, 0.19, 0.21, 1.31],
    [0.75, 0.245, 0.215, 0.26, 1.29],
    [1.0, 0.235, 0.19, 0.25, 1.26],
    [1.25, 0.245, 0.19, 0.28, 1.27],
    [1.5, 0.245, 0.2, 0.28, 1.3],
    [1.72, 0.225, 0.225, 0.27, 1.34],
    [1.9, 0.17, 0.2, 0.23, 1.39],
    [2.0, 0.08, 0.1, 0.12, 1.41],
  ];
  g.add(part((m) => loft(m, { keys: body, axis: 'z', seg: 18, p: 2.2, capStart: true, capEnd: true, color: coat, cell: FULL, weights: W })));
  // cuello (de abajo hacia arriba, inclinado hacia adelante), crin atrás y collera
  const neck = [
    [1.3, 0.17, 0.27, 0.2, 1.72],
    [1.5, 0.15, 0.21, 0.17, 1.83],
    [1.7, 0.125, 0.15, 0.14, 1.93],
    [1.9, 0.1, 0.115, 0.115, 2.03],
    [2.06, 0.085, 0.1, 0.1, 2.1],
  ];
  g.add(
    part((m) => {
      loft(m, { keys: neck, seg: 14, color: coat, cell: FULL, weights: W });
      loft(m, { keys: neck, from: 1.45, seg: 5, grow: 0.028, arc: [Math.PI - 0.5, Math.PI + 0.5], color: dark, cell: FULL, weights: W });
      loft(m, { keys: neck, from: 1.42, to: 1.54, seg: 14, grow: 0.035, color: 0x3a2616, cell: FULL, weights: W });
      loft(m, {
        keys: [
          [2.06, 0.05, 0.05, 0.05, 2.06],
          [2.13, 0.085, 0.08, 0.09, 2.05],
          [2.25, 0.078, 0.07, 0.08, 2.0],
          [2.38, 0.064, 0.055, 0.07, 1.935],
          [2.47, 0.055, 0.05, 0.062, 1.89],
          [2.52, 0.03, 0.028, 0.035, 1.875],
        ],
        axis: 'z',
        seg: 14,
        capStart: true,
        capEnd: true,
        color: (t) => (t > 2.44 ? tone(coat, 0.6) : coat),
        cell: FULL,
        weights: W,
      });
      // cabezada de cuero sobre el hocico
      loft(m, {
        keys: [
          [2.36, 0.064, 0.055, 0.07, 1.94],
          [2.39, 0.062, 0.054, 0.069, 1.93],
        ],
        axis: 'z',
        seg: 14,
        grow: 0.008,
        color: 0x2a1a10,
        cell: FULL,
        weights: W,
      });
      for (const s of [-1, 1]) {
        ellipsoid(m, s * 0.077, 2.075, 2.2, 0.012, 0.014, 0.018, { seg: 8, color: 0x0e0a08, cell: FULL, weights: W });
        loft(m, {
          keys: [
            [2.1, 0.022, 0.015, 0.015, 2.1],
            [2.17, 0.015, 0.01, 0.01, 2.1],
            [2.22, 0.003, 0.003, 0.003, 2.1],
          ],
          x0: s * 0.045,
          seg: 6,
          color: coat,
          cell: FULL,
          weights: W,
        });
      }
    }),
  );
  // cola
  const tail = new THREE.Group();
  tail.position.set(0, 1.42, 0.5);
  tail.add(
    part((m) =>
      loft(m, {
        keys: [
          [-0.62, 0.035, 0.035, 0.035, -0.14],
          [-0.35, 0.06, 0.06, 0.06, -0.1],
          [-0.12, 0.05, 0.05, 0.05, -0.05],
          [0.0, 0.035, 0.035, 0.035, 0],
        ],
        seg: 10,
        capStart: true,
        color: dark,
        cell: FULL,
        weights: W,
      }),
    ),
  );
  g.add(tail);
  const up = [
    [-0.5, 0.058, 0.06, 0.06],
    [-0.3, 0.082, 0.09, 0.09],
    [-0.1, 0.105, 0.12, 0.12],
    [0.06, 0.12, 0.135, 0.135],
  ];
  const low = [
    [-0.43, 0.052, 0.058, 0.058],
    [-0.37, 0.04, 0.045, 0.047],
    [-0.31, 0.048, 0.055, 0.056],
    [-0.12, 0.038, 0.042, 0.043],
    [0.02, 0.055, 0.062, 0.062],
  ];
  const hoof = [
    [-0.5, 0.058, 0.07, 0.066],
    [-0.43, 0.054, 0.06, 0.06],
  ];
  const legs = [];
  for (const [x, z] of [
    [-0.14, 1.72],
    [0.14, 1.72],
    [-0.15, 0.78],
    [0.15, 0.78],
  ]) {
    const l = leg(x, 1.05, z, up, low, hoof, coat, 0x2a2420, -0.5);
    g.add(l);
    legs.push(l);
  }
  return { g, legs, tail };
}
