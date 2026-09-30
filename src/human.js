// Personas con esqueleto (SkinnedMesh): cuerpo continuo que se dobla sin cortes (ver body.js),
// cabeza esculpida con la cara dibujada, manos, zapatos, peinados y ropa (remeras, camisetas de
// fútbol, camperas, buzos, trajes, polleras, jeans, el chaleco de la Bonaerense).
// Todas comparten un material y un atlas de texturas, así cada persona es una sola llamada de dibujo.
import * as THREE from 'three';
import gaspiUrl from './gaspi.webp';
import { BONES, B, Mesher, loft, ellipsoid, chain, head, shell, prim, smooth } from './body.js';

export const SKINS = [0xe8c4a8, 0xd9a882, 0xc68b62, 0xa86f4a, 0x8a5a3a, 0xf1d2bb];
export const HAIRS = [0x2b1d14, 0x4a3020, 0x1a1a1a, 0x6b4a2b, 0x8a8a8a, 0xb88a4a];

// ---------- Atlas ----------
// Celdas de 256x256. Las de ropa se multiplican por el color del vértice; las caras cubren la
// mitad de adelante de la cabeza (u = 0,5 es el centro de la cara).
const AW = 2048;
const AH = 2048;
const CW = 256;
const CH = 256;
const COLS = AW / CW;
const CELL = { fabric: 0, tie: 1, vest: 2, skin: 3, hair: 4, denim: 5, policia: 6 };
const JERSEYS = ['argentina', 'boca', 'river', 'banfield', 'temperley', 'independiente'];
// color principal de cada camiseta (para las mangas)
const JERSEY_SLEEVE = { argentina: 0x75aadb, boca: 0x0b2a6f, river: 0xf4f4f4, banfield: 0x0a7a3b, temperley: 0x6ec3ea, independiente: 0xd4121c };
const FIRST_HEAD = 7 + JERSEYS.length;
let atlas = null;
let actx = null;
let atlasTex = null;
let nextCell = FIRST_HEAD;
const cellCache = new Map();
export let humanMat = null;

function hex(c) {
  return `#${new THREE.Color(c).getHexString()}`;
}
function cellRect(i) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  return { x: col * CW, y: row * CH, u0: (col * CW + 1) / AW, u1: ((col + 1) * CW - 1) / AW, v0: 1 - ((row + 1) * CH - 1) / AH, v1: 1 - (row * CH + 1) / AH };
}
const rnd = Math.random;

function noise(g, r, n, lo, hi, w = 2, h = 2) {
  for (let i = 0; i < n; i++) {
    const v = lo + Math.floor(rnd() * (hi - lo));
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(r.x + rnd() * CW, r.y + rnd() * CH, w, h);
  }
}
function clipCell(g, r) {
  g.save();
  g.beginPath();
  g.rect(r.x, r.y, CW, CH);
  g.clip();
}

function initAtlas() {
  if (atlas) return;
  atlas = document.createElement('canvas');
  atlas.width = AW;
  atlas.height = AH;
  actx = atlas.getContext('2d');
  const g = actx;
  // tela: grano y pliegues suaves
  let r = cellRect(CELL.fabric);
  clipCell(g, r);
  g.fillStyle = '#ededed';
  g.fillRect(r.x, r.y, CW, CH);
  noise(g, r, 5000, 205, 255, 2, 2);
  for (let i = 0; i < 16; i++) {
    g.fillStyle = 'rgba(0,0,0,0.05)';
    g.fillRect(r.x + rnd() * CW, r.y, 3 + rnd() * 8, CH);
  }
  g.restore();
  // corbata a rayas rojas y blancas
  r = cellRect(CELL.tie);
  clipCell(g, r);
  g.fillStyle = '#f4f4f4';
  g.fillRect(r.x, r.y, CW, CH);
  // la corbata mide ~2,5 cm de ancho y ~40 de largo: en la celda se estira 16 veces a lo alto,
  // así que las rayas se dibujan casi horizontales para que en el cuerpo queden a 45°
  g.strokeStyle = '#d0202f';
  g.lineWidth = 7;
  for (let y = -20; y < CH + 20; y += 17) {
    g.beginPath();
    g.moveTo(r.x, r.y + y);
    g.lineTo(r.x + CW, r.y + y + 16);
    g.stroke();
  }
  g.restore();
  // chaleco flúor con dos bandas reflectivas
  r = cellRect(CELL.vest);
  clipCell(g, r);
  g.fillStyle = '#ffffff';
  g.fillRect(r.x, r.y, CW, CH);
  noise(g, r, 1500, 225, 255);
  g.fillStyle = '#bdbdbd';
  g.fillRect(r.x, r.y + CH * 0.3, CW, CH * 0.09);
  g.fillRect(r.x, r.y + CH * 0.62, CW, CH * 0.09);
  g.restore();
  // piel: casi blanca con poros (se multiplica por el color de la piel)
  r = cellRect(CELL.skin);
  clipCell(g, r);
  g.fillStyle = '#f7f7f7';
  g.fillRect(r.x, r.y, CW, CH);
  noise(g, r, 3000, 228, 255, 1, 1);
  g.restore();
  // pelo: mechones verticales
  r = cellRect(CELL.hair);
  clipCell(g, r);
  g.fillStyle = '#e6e6e6';
  g.fillRect(r.x, r.y, CW, CH);
  for (let i = 0; i < 900; i++) {
    const v = 150 + Math.floor(rnd() * 105);
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = 1 + rnd() * 1.5;
    const x = r.x + rnd() * CW;
    const y = r.y + rnd() * CH;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + (rnd() - 0.5) * 8, y + 20, x + (rnd() - 0.5) * 6, y + 30 + rnd() * 40);
    g.stroke();
  }
  g.restore();
  // jean: sarga en diagonal y costuras
  r = cellRect(CELL.denim);
  clipCell(g, r);
  g.fillStyle = '#e0e0e0';
  g.fillRect(r.x, r.y, CW, CH);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 1;
  for (let i = -CH; i < CW; i += 3) {
    g.beginPath();
    g.moveTo(r.x + i, r.y + CH);
    g.lineTo(r.x + i + CH, r.y);
    g.stroke();
  }
  noise(g, r, 2500, 170, 255, 2, 1);
  g.fillStyle = 'rgba(210,150,60,0.55)';
  g.fillRect(r.x + CW * 0.49, r.y, 2, CH);
  g.fillRect(r.x + CW * 0.99, r.y, 2, CH);
  g.restore();
  // chaleco de la Bonaerense: azul con POLICÍA atrás y escudo adelante
  r = cellRect(CELL.policia);
  clipCell(g, r);
  g.fillStyle = '#1b2640';
  g.fillRect(r.x, r.y, CW, CH);
  noise(g, r, 1500, 20, 60);
  g.fillStyle = '#1b2640';
  g.globalAlpha = 0.7;
  g.fillRect(r.x, r.y, CW, CH);
  g.globalAlpha = 1;
  g.fillStyle = '#f4f4f4';
  g.font = `bold ${CH * 0.1}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('POLICÍA', r.x + CW * 0.75, r.y + CH * 0.3);
  g.font = `bold ${CH * 0.045}px sans-serif`;
  g.fillText('PROVINCIA DE BS. AS.', r.x + CW * 0.75, r.y + CH * 0.39);
  g.font = `bold ${CH * 0.05}px sans-serif`;
  g.fillText('POLICÍA', r.x + CW * 0.31, r.y + CH * 0.26);
  g.fillStyle = '#e3b23c';
  g.beginPath();
  g.arc(r.x + CW * 0.19, r.y + CH * 0.27, CW * 0.018, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // camisetas de fútbol (u = 0,25 adelante, 0,75 atrás; v = 1 arriba)
  JERSEYS.forEach((team, k) => drawJersey(cellRect(7 + k), team));
  atlasTex = new THREE.CanvasTexture(atlas);
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.anisotropy = 4;
  humanMat = new THREE.MeshStandardMaterial({ map: atlasTex, vertexColors: true, roughness: 0.78, metalness: 0 });
}

function drawJersey(r, team) {
  const g = actx;
  clipCell(g, r);
  const X = (u) => r.x + u * CW;
  const Y = (v) => r.y + (1 - v) * CH;
  const stripes = (a, b, n) => {
    g.fillStyle = a;
    g.fillRect(r.x, r.y, CW, CH);
    g.fillStyle = b;
    for (let i = 0; i < n; i++) g.fillRect(X(i / n), r.y, CW / n / 2, CH);
  };
  let num = '#111';
  if (team === 'argentina') stripes('#ffffff', '#75aadb', 10);
  else if (team === 'banfield') stripes('#ffffff', '#0a7a3b', 10);
  else if (team === 'boca') {
    g.fillStyle = '#0b2a6f';
    g.fillRect(r.x, r.y, CW, CH);
    g.fillStyle = '#f5c518';
    g.fillRect(r.x, Y(0.62), CW, CH * 0.17);
    num = '#f5c518';
  } else if (team === 'river') {
    g.fillStyle = '#f4f4f4';
    g.fillRect(r.x, r.y, CW, CH);
    g.fillStyle = '#d0202f';
    for (const c of [0.25, 0.75]) {
      g.beginPath();
      g.moveTo(X(c - 0.16), Y(1));
      g.lineTo(X(c - 0.06), Y(1));
      g.lineTo(X(c + 0.16), Y(0.15));
      g.lineTo(X(c + 0.06), Y(0.15));
      g.closePath();
      g.fill();
    }
  } else {
    g.fillStyle = team === 'temperley' ? '#6ec3ea' : '#d4121c';
    g.fillRect(r.x, r.y, CW, CH);
    num = '#ffffff';
    g.fillStyle = '#ffffff';
    g.fillRect(r.x, Y(1), CW, CH * 0.05);
  }
  // grano de tela
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(0,0,0,${0.04 + rnd() * 0.05})`;
    g.fillRect(r.x + rnd() * CW, r.y + rnd() * CH, 2, 2);
  }
  // el 10 atrás
  g.fillStyle = num;
  g.font = `bold ${CH * 0.3}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('10', X(0.75), Y(0.55));
  g.restore();
}

// ---------- Caras ----------
// La cara ocupa la mitad de adelante de la cabeza: nx va de -1 (derecha del personaje) a 1,
// ny de 1 (arriba) a -1 (mentón). Ver headPoint en body.js.
function drawHead(i, o) {
  const r = cellRect(i);
  const g = actx;
  const FX = (nx) => r.x + (0.5 + Math.asin(Math.max(-1, Math.min(1, nx))) / Math.PI) * CW;
  const FY = (ny) => r.y + (Math.acos(Math.max(-1, Math.min(1, ny))) / Math.PI) * CH;
  const blob = (nx, ny, rx, ry, color) => {
    const cx = FX(nx);
    const cy = FY(ny);
    const R = Math.max(1, (FX(nx + rx) - FX(nx - rx)) / 2);
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    gr.addColorStop(0, color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.translate(cx, cy);
    g.scale(1, Math.max(0.2, (FY(ny - ry) - FY(ny + ry)) / 2 / R));
    g.translate(-cx, -cy);
    g.fillStyle = gr;
    g.fillRect(cx - R, cy - R, R * 2, R * 2);
    g.restore();
  };
  clipCell(g, r);
  const skin = new THREE.Color(o.skin);
  const skinHex = hex(skin);
  g.fillStyle = skinHex;
  g.fillRect(r.x, r.y, CW, CH);
  // poros y manchitas
  for (let k = 0; k < 900; k++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    g.fillRect(r.x + rnd() * CW, r.y + rnd() * CH, 1.5, 1.5);
  }
  const hairC = new THREE.Color(o.hair);
  const bald = o.hairStyle === 'bald';
  {
    // volumen: sombra en las cuencas, costados de la nariz, bajo el labio y bajo el mentón
    for (const s of [-1, 1]) {
      blob(0.33 * s, 0.12, 0.17, 0.1, 'rgba(70,35,25,0.2)');
      blob(0.09 * s, -0.2, 0.05, 0.1, 'rgba(90,45,35,0.1)');
      blob(0.48 * s, -0.22, 0.2, 0.16, o.female ? 'rgba(210,90,90,0.16)' : 'rgba(190,90,80,0.08)');
    }
    blob(0, -0.62, 0.14, 0.05, 'rgba(70,35,25,0.14)');
    blob(0, -0.97, 0.6, 0.12, 'rgba(60,30,20,0.3)');
    // barba de dos días (sombra pareja) o barba
    if (!o.female && (o.stubble || o.beard)) {
      const bc = hairC.clone().lerp(skin, o.beard ? 0.1 : 0.35);
      const rgb = `${Math.round(bc.r * 255)},${Math.round(bc.g * 255)},${Math.round(bc.b * 255)}`;
      blob(0, -0.66, 0.66, 0.34, `rgba(${rgb},${o.beard ? 0.95 : 0.32})`);
      blob(0, -0.42, 0.2, 0.06, `rgba(${rgb},${o.beard ? 0.9 : 0.28})`);
      for (const s of [-1, 1]) blob(0.6 * s, -0.4, 0.14, 0.3, `rgba(${rgb},${o.beard ? 0.8 : 0.2})`);
      for (let k = 0; k < (o.beard ? 1800 : 900); k++) {
        const nx = (rnd() * 2 - 1) * 0.7;
        const ny = -0.35 - rnd() * 0.62;
        if (Math.abs(nx) > 0.72 - (-0.35 - ny) * 0.35) continue;
        g.fillStyle = `rgba(${rgb},${o.beard ? 0.5 : 0.22})`;
        g.fillRect(FX(nx), FY(ny), 1, 1);
      }
    }
    if (o.mustache && !o.female) {
      g.fillStyle = hex(hairC);
      g.beginPath();
      g.ellipse(FX(0), FY(-0.43), FX(0.16) - FX(0), (FY(-0.47) - FY(-0.41)) / 2, 0, 0, Math.PI * 2);
      g.fill();
    }
    // ojos
    const iris = o.eyes ?? '#4a3222';
    for (const s of [-1, 1]) {
      const cx = FX(0.33 * s);
      const cy = FY(0.1);
      const w = (FX(0.43) - FX(0.23)) / 2;
      const h = (FY(0.07) - FY(0.13)) / 2 + 1.5;
      g.fillStyle = '#efe9e0';
      g.beginPath();
      g.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = iris;
      g.beginPath();
      g.arc(cx, cy, h * 0.95, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0d0907';
      g.beginPath();
      g.arc(cx, cy, h * 0.42, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillRect(cx + h * 0.2, cy - h * 0.5, 1.5, 1.5);
      // párpado de arriba (más marcado y con pestañas en mujeres)
      g.strokeStyle = o.female ? '#1a1210' : 'rgba(40,22,15,0.9)';
      g.lineWidth = o.female ? 2.6 : 1.8;
      g.beginPath();
      g.ellipse(cx, cy + 1, w * 1.05, h * 1.25, 0, Math.PI * 1.08, Math.PI * 1.92);
      g.stroke();
      if (o.female) {
        g.beginPath();
        g.moveTo(cx + s * w, cy - 1);
        g.lineTo(cx + s * (w + 4), cy - 4);
        g.stroke();
      }
      g.strokeStyle = 'rgba(80,45,35,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(cx, cy, w, h * 1.1, 0, Math.PI * 0.15, Math.PI * 0.85);
      g.stroke();
      if (o.tired) blob(0.33 * s, 0.0, 0.12, 0.04, 'rgba(80,45,70,0.35)');
      // cejas
      g.strokeStyle = hex(hairC.clone().multiplyScalar(0.75));
      g.lineWidth = o.female ? 2.2 : 3.6;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(FX(0.15 * s), FY(0.2));
      g.quadraticCurveTo(FX(0.33 * s), FY(o.female ? 0.29 : 0.27), FX(0.5 * s), FY(0.2));
      g.stroke();
    }
    // nariz: fosas
    g.fillStyle = 'rgba(60,25,20,0.55)';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(FX(0.045 * s), FY(-0.3), 2.2, 1.4, 0, 0, Math.PI * 2);
      g.fill();
    }
    // boca
    const lip = o.lipstick ? new THREE.Color(o.lipstick) : skin.clone().lerp(new THREE.Color(0xa0463e), 0.38);
    const my = -0.5;
    g.fillStyle = hex(lip.clone().multiplyScalar(0.82));
    g.beginPath();
    g.moveTo(FX(-0.17), FY(my));
    g.quadraticCurveTo(FX(-0.08), FY(my + 0.05), FX(0), FY(my + 0.03));
    g.quadraticCurveTo(FX(0.08), FY(my + 0.05), FX(0.17), FY(my));
    g.closePath();
    g.fill();
    g.fillStyle = hex(lip);
    g.beginPath();
    g.moveTo(FX(-0.16), FY(my));
    g.quadraticCurveTo(FX(0), FY(my - (o.female ? 0.085 : 0.065)), FX(0.16), FY(my));
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(50,15,15,0.7)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(FX(-0.17), FY(my));
    g.quadraticCurveTo(FX(0), FY(my - 0.012), FX(0.17), FY(my));
    g.stroke();
    if (o.glasses) {
      g.strokeStyle = '#141414';
      g.lineWidth = 2.5;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.rect(FX(0.33 * s) - 11, FY(0.19), 22, FY(-0.02) - FY(0.19));
        g.stroke();
      }
      g.beginPath();
      g.moveTo(FX(-0.2), FY(0.12));
      g.lineTo(FX(0.2), FY(0.12));
      g.stroke();
    }
  }
  // cuero cabelludo bajo el borde del pelo (para que no se vea piel en el borde del casquete)
  if (!bald) {
    const gr = g.createLinearGradient(0, FY(0.72), 0, FY(0.52));
    gr.addColorStop(0, hex(hairC));
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(r.x, r.y, CW, FY(0.52) - r.y);
    // los bordes de la celda son la parte de atrás de la cabeza (pelo arriba, nuca abajo)
    g.fillStyle = hex(hairC);
    g.fillRect(r.x, r.y, 4, FY(-0.3) - r.y);
    g.fillRect(r.x + CW - 4, r.y, 4, FY(-0.3) - r.y);
  }
  g.restore();
  atlasTex.needsUpdate = true;
}

function headCell(o) {
  const key = o.gaspi ? 'gaspi' : [o.skin, o.hair, o.hairStyle, o.beard, o.stubble, o.mustache, o.glasses, o.tired, o.female, o.lipstick, o.eyes].join('|');
  if (cellCache.has(key)) return cellCache.get(key);
  if (nextCell >= COLS * (AH / CH)) {
    // atlas lleno: reusar una cabeza cualquiera
    const any = [...cellCache.values()][Math.floor(Math.random() * cellCache.size)];
    return any;
  }
  const i = nextCell++;
  cellCache.set(key, i);
  drawHead(i, o);
  return i;
}

// ---------- Cuerpo ----------
// Perfiles [altura, ancho, frente, espalda, corrimiento adelante]
const TORSO_M = [
  [0.84, 0.065, 0.05, 0.05, 0],
  [0.87, 0.132, 0.082, 0.088, 0],
  [0.93, 0.166, 0.092, 0.108, -0.005],
  [1.0, 0.166, 0.094, 0.102, 0],
  [1.08, 0.158, 0.094, 0.09, 0.005],
  [1.18, 0.164, 0.1, 0.09, 0.008],
  [1.28, 0.176, 0.118, 0.096, 0.01],
  [1.38, 0.188, 0.126, 0.1, 0.01],
  [1.46, 0.196, 0.118, 0.102, 0.005],
  [1.52, 0.2, 0.098, 0.096, 0],
  [1.555, 0.2, 0.086, 0.09, -0.004],
  [1.58, 0.186, 0.074, 0.08, -0.006],
  [1.603, 0.14, 0.062, 0.068, -0.008],
  [1.625, 0.07, 0.056, 0.059, -0.008],
];
const TORSO_F = [
  [0.84, 0.065, 0.05, 0.05, 0],
  [0.87, 0.136, 0.082, 0.092, 0],
  [0.94, 0.172, 0.092, 0.114, -0.005],
  [1.0, 0.162, 0.09, 0.102, 0],
  [1.08, 0.136, 0.082, 0.082, 0.005],
  [1.18, 0.142, 0.086, 0.08, 0.008],
  [1.27, 0.154, 0.1, 0.082, 0.01],
  [1.35, 0.162, 0.126, 0.085, 0.012],
  [1.41, 0.166, 0.12, 0.087, 0.01],
  [1.48, 0.172, 0.096, 0.088, 0.004],
  [1.535, 0.176, 0.082, 0.084, 0],
  [1.565, 0.165, 0.068, 0.074, -0.004],
  [1.592, 0.122, 0.056, 0.062, -0.006],
  [1.617, 0.06, 0.05, 0.052, -0.006],
];
const NECK = [
  [1.57, 0.069, 0.064, 0.071, -0.006],
  [1.64, 0.063, 0.058, 0.065, -0.002],
  [1.7, 0.058, 0.052, 0.06, 0.002],
  [1.76, 0.052, 0.046, 0.053, 0.004],
];
const NECK_F = NECK.map(([t, a, b, c, d]) => [t, a * 0.8, b * 0.8, c * 0.8, d]);
// brazo colgando: [altura, ancho, frente, atrás]
const ARM_M = [
  [0.995, 0.027, 0.028, 0.027],
  [1.04, 0.032, 0.033, 0.031],
  [1.12, 0.039, 0.041, 0.037],
  [1.2, 0.042, 0.043, 0.04],
  [1.25, 0.04, 0.04, 0.039],
  [1.3, 0.045, 0.048, 0.043],
  [1.4, 0.052, 0.056, 0.049],
  [1.48, 0.057, 0.059, 0.055],
  [1.53, 0.058, 0.058, 0.056],
  [1.555, 0.05, 0.05, 0.049],
  [1.572, 0.03, 0.03, 0.03],
];
const ARM_F = ARM_M.map(([t, a, b, c]) => [t, a * 0.84, b * 0.84, c * 0.84]);
// pierna: [altura, ancho, frente, atrás]
const LEG_M = [
  [0.06, 0.036, 0.04, 0.042],
  [0.12, 0.037, 0.04, 0.045],
  [0.2, 0.044, 0.047, 0.054],
  [0.32, 0.053, 0.05, 0.064],
  [0.42, 0.05, 0.049, 0.056],
  [0.5, 0.049, 0.051, 0.049],
  [0.58, 0.057, 0.059, 0.057],
  [0.7, 0.069, 0.071, 0.071],
  [0.82, 0.079, 0.081, 0.084],
  [0.92, 0.086, 0.084, 0.094],
  [1.0, 0.084, 0.08, 0.09],
];
for (const k of LEG_M) for (let j = 1; j < 4; j++) k[j] *= 1.06;
const LEG_F = LEG_M.map(([t, a, b, c]) => {
  const k = t < 0.45 ? 0.88 : 1.02;
  return [t, a * k, b * k, c * k];
});
// mano colgando (palma hacia el cuerpo): [altura, grosor, ancho adelante, ancho atrás, corrimiento]
const HAND = [
  [0.845, 0.01, 0.012, 0.012, 0.002],
  [0.86, 0.017, 0.028, 0.026, 0.003],
  [0.89, 0.02, 0.036, 0.033, 0.004],
  [0.93, 0.021, 0.04, 0.035, 0.002],
  [0.97, 0.022, 0.036, 0.031, 0],
  [1.005, 0.024, 0.027, 0.026, 0],
];
const THUMB = [
  [0.9, 0.009, 0.009, 0.009, 0.047],
  [0.93, 0.011, 0.011, 0.011, 0.043],
  [0.975, 0.013, 0.013, 0.013, 0.028],
];
// zapato (eje z, de talón a punta): [z, ancho, arriba, abajo, altura del centro]
const SHOE = [
  [-0.075, 0.029, 0.03, 0.03, 0.045],
  [-0.06, 0.037, 0.046, 0.04, 0.05],
  [-0.02, 0.042, 0.05, 0.045, 0.05],
  [0.04, 0.045, 0.036, 0.04, 0.045],
  [0.1, 0.045, 0.029, 0.034, 0.038],
  [0.15, 0.038, 0.023, 0.029, 0.032],
  [0.178, 0.02, 0.014, 0.019, 0.028],
];

const tone = (c, k) => new THREE.Color(c).multiplyScalar(k);

export function makeHuman(o = {}) {
  initAtlas();
  const female = !!o.female;
  const skin = o.skin ?? 0xd9a882;
  const hair = o.hair ?? 0x2b1d14;
  const shirt = o.shirt ?? 0x3f6fa0;
  const pants = o.pants ?? 0x2d3440;
  const shoes = o.shoes ?? 0x1c1c1c;
  // tipo de ropa de arriba
  let top = o.top ?? 'tshirt';
  if (o.police) top = 'police';
  else if (o.tie && o.jacket) top = 'suit';
  else if (o.jacket) top = 'jacket';
  else if (o.hood) top = 'hoodie';
  else if (o.jersey) top = 'jersey';
  else if (o.longSleeves && top === 'tshirt') top = 'long';
  const bottom = o.bottom ?? 'pants';
  const topColor = top === 'suit' || top === 'jacket' ? (o.jacket ?? shirt) : top === 'hoodie' ? (o.hood ?? shirt) : top === 'jersey' ? 0xffffff : shirt;
  const sleeveColor = top === 'jersey' ? JERSEY_SLEEVE[o.jersey] ?? 0xffffff : topColor;
  const sx = female ? 0.185 : 0.205; // hombros
  const lx = female ? 0.09 : 0.095; // piernas
  const build = (D) => {
    const seg = (n) => Math.max(5, Math.round(n * D));
    const m = new Mesher();
    const rect = (i) => cellRect(i);
    const fab = rect(CELL.fabric);
    const skinCell = rect(CELL.skin);
    const torsoW = chain(['head', 'neck', 'chest', 'spine', 'hips'], [1.7, 1.6, 1.32, 1.1], [0.02, 0.03, 0.06, 0.06]);
    const TK = (female ? TORSO_F : TORSO_M).map((k) => k.slice());
    if (o.belly) for (const k of TK) if (k[0] > 1.02 && k[0] < 1.34) k[2] += 0.045 * Math.sin(((k[0] - 1.02) / 0.32) * Math.PI);
    const jacketed = top === 'suit' || top === 'jacket' || top === 'police' || top === 'hoodie';
    const seam = -Math.PI / 2; // costura al costado: adelante u = 0,25 y atrás u = 0,75

    // ---- pelvis (pantalón o pollera) y torso (lo de arriba) ----
    const pelvisColor = bottom === 'skirt' || bottom === 'dress' ? (o.skirt ?? pants) : pants;
    loft(m, { keys: TK, to: 1.06, seg: seg(20), p: 2.4, capStart: true, color: pelvisColor, cell: bottom === 'jeans' ? rect(CELL.denim) : fab, weights: (x, y) => torsoW(y), seam });
    const topCell = top === 'jersey' ? rect(7 + JERSEYS.indexOf(o.jersey)) : fab;
    const topGrow = (t) => (jacketed ? 0.012 : 0.003) * smooth(1.61, 1.55, t) + (t < 1.1 ? 0.004 : 0);
    loft(m, {
      keys: TK,
      from: top === 'suit' ? 0.87 : top === 'jacket' ? 0.97 : 1.03,
      seg: seg(20),
      p: 2.4,
      color: (t, a, x, y, z) => {
        if (top === 'tank' && t > 1.5 && Math.abs(Math.sin(a)) > 0.75) return skin;
        // escote en V para las mujeres, cuello redondo para el resto
        if (female && top !== 'police' && t > 1.5 && Math.abs(a) < 0.35 - (1.6 - t) * 1.2) return skin;
        if (top === 'jacket' && Math.abs(a) < 0.16) return o.shirt ?? 0x222222; // campera abierta
        return topColor;
      },
      grow: topGrow,
      cell: topCell,
      weights: (x, y) => torsoW(y),
      seam,
    });
    // cuello
    const NK = female ? NECK_F : NECK;
    loft(m, { keys: NK, seg: seg(12), color: skin, cell: skinCell, weights: (x, y) => torsoW(y) });

    // ---- cabeza ----
    const H = { cx: 0, cy: 1.79, cz: 0.014, rx: female ? 0.073 : 0.078, ry: female ? 0.11 : 0.116, rz: female ? 0.097 : 0.103, female };
    const cell = headCell({ ...o, skin, hair, female });
    head(m, H, rect(cell), 0xffffff, D);
    for (const s of [-1, 1]) ellipsoid(m, s * (H.rx - 0.004), H.cy - 0.005, H.cz - 0.014, 0.012, 0.03, 0.019, { seg: 8, color: tone(skin, 0.95), cell: skinCell, weights: () => [[B.head, 1]] });
    addHair(m, H, o, hair, female);

    // ---- brazos y manos (el derecho en -x: el personaje mira hacia +z) ----
    const AK = female ? ARM_F : ARM_M;
    const sleeveTo = top === 'tank' ? 1.62 : top === 'tshirt' || top === 'jersey' ? (female ? 1.46 : 1.38) : 1.0;
    for (const [s, ua, fa, hand] of [
      [-1, 'uaR', 'faR', 'handR'],
      [1, 'uaL', 'faL', 'handL'],
    ]) {
      const armW = chain(['chest', ua, fa, hand], [1.565, 1.25, 1.0], [0.03, 0.035, 0.012]);
      const sleeve = (t) => t > sleeveTo;
      loft(m, {
        keys: AK,
        x0: 0.0 + s * sx,
        seg: seg(12),
        color: (t) => (sleeve(t) ? (top === 'suit' && t < 1.03 ? 0xf4f4f4 : sleeveColor) : skin),
        grow: (t) => (sleeve(t) ? (jacketed ? 0.011 : 0.006) * (1 - 0.7 * smooth(1.52, 1.59, t)) : 0),
        cell: fab,
        weights: (x, y) => armW(y),
      });
      loft(m, { keys: HAND, x0: s * sx, seg: seg(10), p: 2.3, capStart: true, color: skin, cell: skinCell, weights: (x, y) => armW(y) });
      loft(m, { keys: THUMB, x0: s * (sx - 0.012), seg: seg(7), capStart: true, color: skin, cell: skinCell, weights: () => [[B[hand], 1]] });
      if (o.cup && s > 0) prim(m, new THREE.CylinderGeometry(0.04, 0.035, 0.1, 10).translate(s * sx, 0.88, 0.07), hand, 0xe8e8e8, fab);
      if (o.franela && s < 0) prim(m, new THREE.BoxGeometry(0.02, 0.26, 0.3).translate(s * (sx + 0.025), 0.8, 0.06), hand, 0xf5d90a, fab);
    }

    // ---- piernas y zapatos ----
    const LK = female ? LEG_F : LEG_M;
    const bareLegs = bottom === 'skirt' || bottom === 'dress';
    const legColor = (t) => {
      if (bottom === 'shorts') return t > 0.56 ? pants : t < 0.12 && o.socks !== false ? 0xf2f2f2 : skin;
      if (bareLegs) return o.tights ?? (t < 0.11 && !female ? 0xf2f2f2 : skin);
      return pants;
    };
    const legGrow = (t) => {
      if (bottom === 'shorts') return t > 0.56 ? 0.012 : 0;
      if (bareLegs || bottom === 'leggings') return 0;
      // pantalón: más recto (menos pantorrilla) y ancho abajo, sobre el zapato
      const loose = bottom === 'jeans' ? 0.004 : 0.008;
      return loose + 0.01 * smooth(0.45, 0.2, t) * (1 - smooth(0.1, 0.02, t));
    };
    for (const [s, th, sh, ft] of [
      [-1, 'thR', 'shR', 'ftR'],
      [1, 'thL', 'shL', 'ftL'],
    ]) {
      const legW = chain(['hips', th, sh, ft], [0.95, 0.5, 0.085], [0.05, 0.05, 0.02]);
      loft(m, { keys: LK, x0: s * lx, seg: seg(12), color: legColor, grow: legGrow, cell: bottom === 'jeans' ? rect(CELL.denim) : bareLegs || bottom === 'shorts' ? skinCell : fab, weights: (x, y) => legW(y) });
      const sole = o.sole ?? (shoes === 0xf2f2f2 || o.sneakers ? 0xf2f2f2 : 0x1a1a1a);
      loft(m, { keys: SHOE, axis: 'z', x0: s * lx, seg: seg(12), p: 2.6, capStart: true, capEnd: true, color: (t, a, x, y) => (y < 0.016 ? sole : shoes), cell: fab, weights: () => [[B[ft], 1]] });
    }
    // pollera o vestido: cae de la cintura y sigue a las piernas
    if (bareLegs) {
      const hem = o.mini ? 0.68 : 0.52;
      const SK = [
        [hem, 0.2, 0.16, 0.17, -0.005],
        [(hem + 0.95) / 2, 0.18, 0.13, 0.14, -0.005],
        [0.95, 0.17, 0.1, 0.118, -0.004],
        [1.06, 0.14, 0.088, 0.086, 0.005],
      ];
      const skW = (x, y) => {
        const k = 0.75 * smooth(1.0, hem, y);
        const left = smooth(-0.05, 0.05, x);
        return [
          [B.hips, 1 - k],
          [B.thL, k * left],
          [B.thR, k * (1 - left)],
        ];
      };
      for (const inside of [false, true]) loft(m, { keys: SK, seg: seg(20), color: o.skirt ?? pants, grow: inside ? -0.004 : 0, inside, cell: fab, weights: skW, seam });
    }

    // ---- ropa encima ----
    if (top === 'suit') addSuit(m, TK, o, seg, torsoW, topGrow);
    if (top === 'police') {
      // chaleco azul con POLICÍA atrás, cinturón y funda
      loft(m, { keys: TK, from: 1.02, to: 1.565, seg: seg(20), p: 2.4, grow: 0.022, color: 0xffffff, cell: rect(CELL.policia), weights: (x, y) => torsoW(y), seam });
    }
    if (o.vest) loft(m, { keys: TK, from: 1.06, to: 1.56, seg: seg(20), p: 2.4, grow: 0.02, color: o.vest, cell: rect(CELL.vest), weights: (x, y) => torsoW(y), seam });
    if (top === 'police' || bottom === 'pants' || bottom === 'jeans') {
      // cinturón
      loft(m, { keys: TK, from: 0.99, to: 1.035, seg: seg(20), p: 2.4, grow: 0.006, color: top === 'police' ? 0x111111 : 0x3a2618, cell: fab, weights: (x, y) => torsoW(y), seam });
      if (top === 'police') prim(m, new THREE.BoxGeometry(0.05, 0.13, 0.08).translate(-0.17, 0.95, 0.0), 'hips', 0x111111, fab);
    }
    if (top === 'hoodie') {
      // bolsillo canguro y capucha caída en la espalda
      loft(m, { keys: TK, from: 1.08, to: 1.21, seg: seg(20), p: 2.4, grow: 0.018, arc: [-0.6, 0.6], color: tone(topColor, 0.85), cell: fab, weights: (x, y) => torsoW(y) });
      loft(m, {
        keys: [
          [1.5, 0.1, 0.05, 0.12, -0.01],
          [1.58, 0.11, 0.06, 0.13, -0.015],
          [1.66, 0.09, 0.06, 0.1, -0.02],
        ],
        seg: seg(14),
        arc: [Math.PI * 0.55, Math.PI * 1.45],
        color: tone(topColor, 0.9),
        cell: fab,
        weights: (x, y) => torsoW(y),
      });
    }
    if (top === 'jacket') {
      // cuello de la campera
      loft(m, { keys: TK, from: 1.56, to: 1.62, seg: seg(20), p: 2.4, grow: 0.02, arc: [0.35, Math.PI * 2 - 0.35], color: topColor, cell: fab, weights: (x, y) => torsoW(y) });
    }
    // gorra, casco o capucha
    addHat(m, H, o);

    const geo = m.build();
    geo.computeBoundingSphere();
    geo.boundingSphere.radius += 0.6;
    return geo;
  };
  // de cerca, el cuerpo completo; de lejos, uno con menos de la mitad de vértices
  const D = o.detail ?? 1;
  const geos = [build(D), build(Math.min(0.5, D * 0.45))];
  const geo = geos[0];

  // esqueleto (en mujeres los hombros y las piernas un poco más juntos)
  const REST = {
    root: [[0, 0, 0], null],
    hips: [[0, 0.95, 0], 'root'],
    spine: [[0, 1.1, 0], 'hips'],
    chest: [[0, 1.32, 0], 'spine'],
    neck: [[0, 1.6, 0], 'chest'],
    head: [[0, 1.68, 0], 'neck'],
    uaR: [[-sx, 1.55, 0], 'chest'],
    faR: [[-sx, 1.25, 0], 'uaR'],
    handR: [[-sx, 0.99, 0], 'faR'],
    uaL: [[sx, 1.55, 0], 'chest'],
    faL: [[sx, 1.25, 0], 'uaL'],
    handL: [[sx, 0.99, 0], 'faL'],
    thR: [[-lx, 0.93, 0], 'hips'],
    shR: [[-lx, 0.5, 0], 'thR'],
    ftR: [[-lx, 0.08, 0], 'shR'],
    thL: [[lx, 0.93, 0], 'hips'],
    shL: [[lx, 0.5, 0], 'thL'],
    ftL: [[lx, 0.08, 0], 'shL'],
  };
  const bones = {};
  for (const name of BONES) {
    const [pos, parent] = REST[name];
    const b = new THREE.Bone();
    b.name = name;
    const pp = parent ? REST[parent][0] : [0, 0, 0];
    b.position.set(pos[0] - pp[0], pos[1] - pp[1], pos[2] - pp[2]);
    if (parent) bones[parent].add(b);
    bones[name] = b;
  }
  const mesh = new THREE.SkinnedMesh(geo, humanMat);
  mesh.add(bones.root);
  mesh.castShadow = true;
  mesh.bind(new THREE.Skeleton(BONES.map((n) => bones[n])));
  const root = new THREE.Group();
  root.add(mesh);
  root.scale.setScalar((o.scale ?? 1) * (female ? 0.95 : 1));
  const h = { root, mesh, bones, phase: Math.random() * 10, geos, lod: 0, keep: !!o.gaspi };
  root.userData.human = h;
  ALL.add(h);
  return h;
}

// Nivel de detalle: cerca de la cámara el cuerpo completo, lejos el liviano.
const ALL = new Set();
const wp = new THREE.Vector3();
export function updateHumanLod(camera, near) {
  for (const h of ALL) {
    if (!h.root.parent) {
      // ya no está en escena: si no vuelve en un rato, se olvida
      h.gone = (h.gone || 0) + 1;
      if (h.gone > 300) ALL.delete(h);
      continue;
    }
    h.gone = 0;
    h.root.getWorldPosition(wp);
    const want = h.keep || wp.distanceToSquared(camera.position) < near * near ? 0 : 1;
    if (want !== h.lod) {
      h.lod = want;
      h.mesh.geometry = h.geos[want];
    }
  }
}

// Saco abierto: camisa blanca en V, corbata, solapas y cuello
function addSuit(m, TK, o, seg, torsoW, g) {
  const fab = cellRect(CELL.fabric);
  const w = (t) => 0.04 + smooth(1.24, 1.6, t) * 0.36; // mitad del ancho de la V (en radianes)
  const W = (x, y) => torsoW(y);
  loft(m, { keys: TK, from: 1.24, to: 1.612, seg: seg(10), p: 2.4, grow: (t) => g(t) + 0.0015, arc: (t) => [-w(t), w(t)], color: o.shirt ?? 0xf4f4f4, cell: fab, weights: W });
  if (o.tie) {
    const tw = (t) => (t > 1.585 ? 0.085 : 0.05 + 0.028 * smooth(1.56, 1.24, t)) * smooth(1.2, 1.245, t) + 0.008;
    loft(m, { keys: TK, from: 1.2, to: 1.606, seg: seg(4), p: 2.4, grow: (t) => g(t) + 0.005, arc: (t) => [-tw(t), tw(t)], color: 0xffffff, cell: cellRect(CELL.tie), weights: W });
  }
  for (const s of [-1, 1]) {
    const arc = (t) => (s > 0 ? [w(t), w(t) + 0.13] : [-w(t) - 0.13, -w(t)]);
    loft(m, { keys: TK, from: 1.24, to: 1.585, seg: seg(3), p: 2.4, grow: (t) => g(t) + 0.004, arc, color: tone(o.jacket, 0.7), cell: fab, weights: W });
  }
  // cuello de la camisa (blanco, alrededor del cuello) y del saco (atrás)
  const NK = o.female ? NECK_F : NECK;
  loft(m, { keys: NK, from: 1.595, to: 1.645, seg: seg(14), grow: 0.006, color: o.shirt ?? 0xf4f4f4, cell: fab, weights: W });
  loft(m, { keys: NK, from: 1.575, to: 1.625, seg: seg(12), grow: 0.016, arc: [1.1, Math.PI * 2 - 1.1], color: tone(o.jacket, 0.85), cell: fab, weights: W });
  // botón
  loft(m, { keys: TK, from: 1.14, to: 1.165, seg: 3, p: 2.4, grow: (t) => g(t) + 0.003, arc: [-0.05, 0.05], color: 0x111111, cell: fab, weights: W });
}

// Peinados: casquete que sigue la cabeza, con melena, colita o rodete según el estilo
function addHair(m, H, o, hair, female) {
  const style = o.hairStyle ?? (female ? 'long' : 'short');
  if (style === 'bald' || o.helmet || o.hood) return;
  const hc = cellRect(CELL.hair);
  const W = () => [[B.head, 1]];
  const cap = o.cap != null;
  if (style === 'curly' && !cap) {
    shell(m, H, { front: 0.28, side: 0.46, back: 0.62, burns: 0.04, color: hair, cell: hc, thick: (s, a, th) => (0.022 + 0.008 * Math.sin(a * 9) * Math.sin(th * 11)) * (1 - s ** 4 * 0.85) });
    return;
  }
  const tight = style === 'ponytail' || style === 'bun';
  const taper = (s) => 1 - 0.88 * smooth(0.45, 1, s);
  let thick = style === 'buzz' || cap ? () => 0.003 : (s) => (tight ? 0.006 : 0.008 + 0.012 * (1 - s * s)) * taper(s);
  // raya al costado: más volumen del lado derecho de la frente, peinado hacia el otro lado
  if (style === 'side' && !cap) thick = (s, a) => (0.009 + 0.013 * (1 - s * s) + 0.007 * (1 - s * s) * Math.max(0, Math.cos(a + 0.7))) * taper(s);
  shell(m, H, { front: female ? 0.35 : 0.33, side: female ? 0.52 : 0.45, back: female ? 0.66 : 0.62, burns: female ? 0 : 0.06, color: hair, cell: hc, thick });
  if (cap) return;
  if (style === 'long' || style === 'bob') {
    const yb = style === 'bob' ? 1.66 : o.hairLen ?? 1.46;
    const keys = [
      [yb, 0.125, 0.1, 0.122, -0.028],
      [(yb + 1.64) / 2, 0.12, 0.1, 0.12, -0.018],
      [1.64, 0.105, 0.1, 0.116, -0.006],
      [1.72, 0.097, 0.1, 0.112, 0.004],
      [1.8, 0.093, 0.1, 0.108, 0.01],
      [1.86, 0.08, 0.09, 0.094, 0.012],
    ].filter((k, i, arr) => i === 0 || k[0] > arr[0][0] + 0.02);
    const arc = [Math.PI * 0.4, Math.PI * 1.6];
    for (const inside of [false, true]) loft(m, { keys, seg: 14, arc, grow: inside ? -0.007 : 0, inside, color: hair, cell: hc, weights: W });
  } else if (style === 'ponytail') {
    loft(m, {
      keys: [
        [1.56, 0.012, 0.012, 0.012, -0.15],
        [1.66, 0.026, 0.026, 0.026, -0.14],
        [1.76, 0.03, 0.03, 0.03, -0.125],
        [1.82, 0.022, 0.022, 0.022, -0.108],
      ],
      seg: 10,
      capStart: true,
      color: hair,
      cell: hc,
      weights: W,
    });
  } else if (style === 'bun') {
    ellipsoid(m, 0, 1.9, -0.07, 0.045, 0.04, 0.045, { seg: 12, color: hair, cell: hc, weights: W });
  }
}

function addHat(m, H, o) {
  const fab = cellRect(CELL.fabric);
  const W = () => [[B.head, 1]];
  if (o.helmet) {
    shell(m, H, { front: 0.36, side: 0.62, back: 0.68, color: o.helmet, cell: fab, thick: () => 0.032 });
    prim(m, new THREE.BoxGeometry(0.19, 0.07, 0.02).translate(0, 1.79, H.cz + H.rz + 0.03), 'head', 0x121416, fab);
  } else if (o.hood) {
    shell(m, H, { front: 0.25, side: 0.66, back: 0.76, color: o.hood, cell: fab, thick: (s) => 0.028 + 0.01 * s });
  } else if (o.cap != null) {
    shell(m, H, { front: 0.37, side: 0.39, back: 0.41, color: o.cap, cell: fab, thick: () => 0.012 });
    // visera
    const v = new THREE.CylinderGeometry(0.085, 0.085, 0.01, 14, 1, false, -Math.PI / 2, Math.PI);
    v.scale(1, 1, 0.85).rotateX(-0.12).translate(0, 1.868, H.cz + H.rz - 0.01);
    prim(m, v, 'head', tone(o.cap, 0.9), fab);
    if (o.police) prim(m, new THREE.BoxGeometry(0.03, 0.03, 0.006).translate(0, 1.88, H.cz + H.rz + 0.012), 'head', 0xe3b23c, fab);
  }
  void W;
}

// ---------- Animación ----------
function reset(h) {
  for (const b of Object.values(h.bones)) b.rotation.set(0, 0, 0);
  const r = h.bones.root;
  r.position.set(0, 0, 0);
  h.bones.hips.position.set(0, 0.95, 0);
}

// Anima caminata y poses. `speed` en m/s. `t` (0..1) es el avance de un golpe.
export function animateHuman(h, dt, speed, pose = 'walk', t = 0) {
  h.phase += dt * (2 + speed * 2.4);
  const s = Math.sin(h.phase);
  const c = Math.cos(h.phase);
  const amp = Math.min(0.85, speed * 0.26);
  const b = h.bones;
  reset(h);

  if (pose === 'knocked') {
    b.root.rotation.x = -Math.PI / 2;
    b.root.position.set(0, 0.12, 0);
    b.uaR.rotation.z = -1.3;
    b.uaL.rotation.z = 1.1;
    b.thR.rotation.z = -0.2;
    b.thL.rotation.x = -0.4;
    b.shL.rotation.x = 0.6;
    b.head.rotation.y = 0.4;
    return;
  }
  if (pose === 'sit') {
    b.hips.position.y = 0.42;
    b.thR.rotation.x = -1.45;
    b.thL.rotation.x = -1.35;
    b.shR.rotation.x = 1.3;
    b.shL.rotation.x = 1.45;
    b.spine.rotation.x = 0.15;
    b.uaL.rotation.x = -0.5 + Math.sin(h.phase * 0.3) * 0.08;
    b.faL.rotation.x = -0.9;
    b.uaR.rotation.x = -0.3;
    b.faR.rotation.x = -0.8;
    b.head.rotation.x = 0.3;
    return;
  }
  if (pose === 'cower') {
    // agachado con las manos en la cabeza
    b.hips.position.y = 0.55;
    b.thR.rotation.x = -1.6;
    b.thL.rotation.x = -1.3;
    b.shR.rotation.x = 2.2;
    b.shL.rotation.x = 1.9;
    b.ftR.rotation.x = -0.6;
    b.spine.rotation.x = 0.7;
    b.head.rotation.x = 0.4;
    b.uaR.rotation.set(-2.6, 0, 0.5);
    b.uaL.rotation.set(-2.6, 0, -0.5);
    b.faR.rotation.x = -2.1;
    b.faL.rotation.x = -2.1;
    b.root.position.x = Math.sin(h.phase * 9) * 0.01;
    return;
  }
  if (pose === 'getup') {
    // de estar tirado a parado: t va de 0 (piso) a 1 (parado)
    const k = Math.min(1, t);
    b.root.rotation.x = -Math.PI / 2 * (1 - k) * (1 - k);
    b.root.position.set(0, 0.12 * (1 - k), 0);
    b.thR.rotation.x = -1.2 * Math.sin(k * Math.PI);
    b.shR.rotation.x = 1.6 * Math.sin(k * Math.PI);
    b.uaR.rotation.x = -0.8 * Math.sin(k * Math.PI);
    b.uaL.rotation.x = -0.8 * Math.sin(k * Math.PI);
    return;
  }
  if (pose === 'ride') {
    b.hips.position.y = 0.55;
    b.thR.rotation.set(-1.35, 0, -0.2);
    b.thL.rotation.set(-1.35, 0, 0.2);
    b.shR.rotation.x = 1.2;
    b.shL.rotation.x = 1.2;
    b.spine.rotation.x = 0.3;
    b.uaR.rotation.x = -1.0;
    b.uaL.rotation.x = -1.0;
    b.faR.rotation.x = -0.5;
    b.faL.rotation.x = -0.5;
    return;
  }
  // caminata base: piernas, rodillas, brazos opuestos, codos y balanceo
  b.thR.rotation.x = s * amp;
  b.thL.rotation.x = -s * amp;
  b.shR.rotation.x = Math.max(0, s) * amp * 1.4 + 0.05;
  b.shL.rotation.x = Math.max(0, -s) * amp * 1.4 + 0.05;
  b.ftR.rotation.x = -Math.max(0, s) * amp * 0.5;
  b.ftL.rotation.x = -Math.max(0, -s) * amp * 0.5;
  b.uaR.rotation.x = -s * amp * 0.75;
  b.uaL.rotation.x = s * amp * 0.75;
  b.uaR.rotation.z = -0.08;
  b.uaL.rotation.z = 0.08;
  b.faR.rotation.x = -0.25 - Math.max(0, -s) * amp * 0.5;
  b.faL.rotation.x = -0.25 - Math.max(0, s) * amp * 0.5;
  b.hips.position.y = 0.95 + Math.abs(c) * amp * 0.05;
  b.hips.rotation.y = s * amp * 0.12;
  b.chest.rotation.y = -s * amp * 0.18;
  b.spine.rotation.x = speed > 4 ? 0.15 : 0.03;
  // respiración en reposo
  if (speed < 0.1) b.chest.rotation.x = Math.sin(h.phase * 0.5) * 0.02;

  if (pose === 'zombie') {
    b.uaR.rotation.x = -1.2 + Math.sin(h.phase * 0.5) * 0.2;
    b.uaL.rotation.x = -1.0 + Math.cos(h.phase * 0.4) * 0.25;
    b.faR.rotation.x = -0.2;
    b.faL.rotation.x = -0.35;
    b.spine.rotation.set(0.28, 0, Math.sin(h.phase * 0.35) * 0.16);
    b.head.rotation.set(0.35, 0, Math.sin(h.phase * 0.3) * 0.35);
  } else if (pose === 'wave') {
    b.uaR.rotation.set(-2.5 + Math.sin(h.phase * 3) * 0.3, 0, -0.3 + Math.sin(h.phase * 3) * 0.4);
    b.faR.rotation.x = -0.5;
  } else if (pose === 'drum') {
    b.uaR.rotation.x = -0.7;
    b.uaL.rotation.x = -0.7;
    b.faR.rotation.x = -0.6 - Math.max(0, Math.sin(h.phase * 3)) * 0.9;
    b.faL.rotation.x = -0.6 - Math.max(0, Math.sin(h.phase * 3 + Math.PI)) * 0.9;
  } else if (pose === 'banner') {
    b.uaR.rotation.x = -2.8;
    b.uaL.rotation.x = -2.8;
    b.faR.rotation.x = -0.2;
    b.faL.rotation.x = -0.2;
  } else if (pose === 'fist') {
    b.uaR.rotation.x = -2.6 + Math.sin(h.phase * 4) * 0.3;
    b.faR.rotation.x = -0.4 - Math.max(0, Math.sin(h.phase * 4)) * 0.5;
  } else if (pose === 'punch' || pose === 'jab' || pose === 'cross') {
    // golpe recto: guardia -> brazo extendido -> vuelve. Jab con la izquierda.
    const ext = Math.sin(Math.min(1, t) * Math.PI);
    const left = pose === 'jab';
    guard(b);
    const [ua, fa] = left ? [b.uaL, b.faL] : [b.uaR, b.faR];
    ua.rotation.x = -1.2 - ext * 0.4;
    ua.rotation.z = (left ? -1 : 1) * ext * 0.25;
    fa.rotation.x = -1.9 + ext * 1.9;
    b.chest.rotation.y = (left ? -0.25 : 0.45) * ext;
    b.spine.rotation.x = 0.1 + ext * 0.08;
  } else if (pose === 'hook') {
    const ext = Math.sin(Math.min(1, t) * Math.PI);
    guard(b);
    b.uaR.rotation.set(-1.45, 0, 1.2 * ext);
    b.faR.rotation.x = -1.4;
    b.faR.rotation.y = ext * 0.5;
    b.chest.rotation.y = -0.2 + ext * 0.9;
    b.hips.rotation.y = ext * 0.3;
  } else if (pose === 'kick') {
    const ext = Math.sin(Math.min(1, t) * Math.PI);
    guard(b);
    b.thR.rotation.x = -1.5 * ext;
    b.shR.rotation.x = 1.2 * (1 - ext) * Math.min(1, t * 3);
    b.thL.rotation.x = 0.15 * ext;
    b.spine.rotation.x = -0.25 * ext;
    b.hips.position.y = 0.95 - 0.04 * ext;
  } else if (pose === 'guard') {
    guard(b);
  } else if (pose === 'swing') {
    // palo: de atrás del hombro hacia adelante
    const k = Math.min(1, t);
    const a = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65;
    const hit = k < 0.35 ? 0 : Math.sin(((k - 0.35) / 0.65) * Math.PI);
    b.uaR.rotation.set(-2.4 * a - 1.0 * hit, 0, 0.3 + 0.5 * hit);
    b.faR.rotation.x = -0.9 * a;
    b.uaL.rotation.set(-1.2, 0, -0.6);
    b.faL.rotation.x = -1.2;
    b.chest.rotation.y = 0.6 * a - 0.7 * hit;
  } else if (pose === 'aim') {
    // pistola a dos manos, a la altura de los ojos
    b.uaR.rotation.set(-1.52, 0, 0.12);
    b.faR.rotation.x = -0.05;
    b.uaL.rotation.set(-1.4, 0, -0.55);
    b.faL.rotation.set(-0.25, 0, 0);
    b.chest.rotation.y = 0.12;
    b.head.rotation.y = 0.05;
    b.uaR.rotation.x -= t * 0.35;
  } else if (pose === 'aimLong') {
    // escopeta al hombro
    b.uaR.rotation.set(-1.1, 0, 0.5);
    b.faR.rotation.x = -1.2;
    b.uaL.rotation.set(-1.45, 0, -0.35);
    b.faL.rotation.x = -0.2;
    b.chest.rotation.y = 0.35;
    b.head.rotation.y = -0.2;
    b.chest.rotation.x = -t * 0.12;
  } else if (pose === 'holdGun') {
    b.uaR.rotation.set(-0.35, 0, -0.05);
    b.faR.rotation.x = -0.9;
  } else if (pose === 'hit') {
    const k = Math.sin(Math.min(1, t) * Math.PI);
    b.spine.rotation.x = -0.35 * k;
    b.head.rotation.x = -0.5 * k;
    b.uaR.rotation.set(-0.6 * k, 0, -0.6 * k);
    b.uaL.rotation.set(-0.6 * k, 0, 0.6 * k);
  } else if (pose === 'handsup') {
    b.uaR.rotation.set(-2.9, 0, 0.3);
    b.uaL.rotation.set(-2.9, 0, -0.3);
    b.faR.rotation.x = -0.4;
    b.faL.rotation.x = -0.4;
  } else if (pose === 'flee') {
    b.uaR.rotation.set(-1.5 + s * 0.5, 0, -0.4);
    b.uaL.rotation.set(-1.5 - s * 0.5, 0, 0.4);
    b.spine.rotation.x = 0.25;
  } else if (pose === 'carry') {
    // vendedor: bolsa colgando de un brazo, el otro ofreciendo
    b.uaL.rotation.set(-0.2, 0, 0.25);
    b.faL.rotation.x = -1.3;
    b.uaR.rotation.set(-1.1 + Math.sin(h.phase * 0.8) * 0.15, 0, 0.1);
    b.faR.rotation.x = -0.6;
  } else if (pose === 'phone') {
    b.uaR.rotation.set(-0.35, 0, 0.35);
    b.faR.rotation.x = -2.3;
    b.head.rotation.set(0.1, 0, -0.15);
  }
}

function guard(b) {
  b.uaR.rotation.set(-0.9, 0, 0.35);
  b.uaL.rotation.set(-0.9, 0, -0.35);
  b.faR.rotation.x = -2.0;
  b.faL.rotation.x = -2.0;
  b.spine.rotation.x = 0.12;
  b.head.rotation.x = 0.08;
}

export function randomCivilian() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const chance = (p) => Math.random() < p;
  const common = {
    skin: pick(SKINS),
    eyes: pick(['#4a3222', '#2f2118', '#5b4128', '#6b5a2e', '#3d5a3a', '#4b6b8a']),
    glasses: chance(0.12),
    tired: chance(0.08),
    scale: 0.93 + Math.random() * 0.13,
  };
  if (chance(0.5)) {
    // mujeres
    const top = pick(['tshirt', 'tshirt', 'long', 'long', 'tank', 'jersey', 'hoodie']);
    const bottom = pick(['jeans', 'jeans', 'jeans', 'leggings', 'pants', 'skirt', 'dress', 'shorts']);
    const shirt = pick([0xf2f2f2, 0xd81b60, 0xf48fb1, 0x6a1b9a, 0x1e88e5, 0x2e7d32, 0xf9a825, 0x212121, 0xc62828, 0x80cbc4, 0xffab91, 0xb39ddb]);
    return {
      ...common,
      female: true,
      hair: pick([0x2b1d14, 0x4a3020, 0x1a1a1a, 0x6b4a2b, 0x8a3a1a, 0xc9a15a, 0x3b2418]),
      hairStyle: pick(['long', 'long', 'ponytail', 'ponytail', 'bun', 'bob', 'curly']),
      hairLen: 1.4 + Math.random() * 0.14,
      top,
      jersey: top === 'jersey' ? pick(JERSEYS) : null,
      shirt,
      bottom,
      pants: bottom === 'jeans' ? pick([0x3a5a8c, 0x2d3f66, 0x1f2a44, 0x6b86b0, 0x1a1a1a]) : bottom === 'leggings' ? 0x151515 : pick([0x2d3440, 0x1a1a1a, 0x6d5c47, 0xe8e0d0]),
      skirt: bottom === 'dress' ? shirt : pick([0x1a1a1a, 0x3949ab, 0x8e2438, 0x2e7d32, 0xd8c3a5]),
      mini: chance(0.35),
      shoes: pick([0xf2f2f2, 0xf2f2f2, 0x1c1c1c, 0x6b4a2b, 0xd7ccc8]),
      lipstick: chance(0.45) ? pick([0xb0303a, 0xc2185b, 0x9c4a4a, 0xd46a6a]) : null,
      cap: chance(0.05) ? pick([0x1a1a1a, 0xf5f5f5, 0xc62828]) : null,
    };
  }
  // hombres
  const r = Math.random();
  const top = r < 0.2 ? 'jersey' : r < 0.48 ? 'tshirt' : r < 0.64 ? 'long' : r < 0.8 ? 'hoodie' : r < 0.92 ? 'jacket' : 'tank';
  const bottom = pick(['jeans', 'jeans', 'jeans', 'pants', 'pants', 'shorts']);
  const shirt = pick([0x3f6fa0, 0xb03a2e, 0x2e7d32, 0xf2f2f2, 0x6a1b9a, 0xf9a825, 0x455a64, 0x1e88e5, 0xd81b60, 0x795548, 0x6ec3ea, 0x212121]);
  return {
    ...common,
    hair: pick(HAIRS),
    hairStyle: pick(['short', 'short', 'short', 'buzz', 'buzz', 'bald', 'curly', 'long']),
    top,
    jersey: top === 'jersey' ? pick(JERSEYS) : null,
    shirt,
    jacket: top === 'jacket' ? pick([0x1a1a1a, 0x3e4a3a, 0x283593, 0x5d4037, 0x8e2438]) : null,
    bottom,
    pants: bottom === 'jeans' ? pick([0x3a5a8c, 0x2d3f66, 0x1f2a44, 0x6b86b0]) : pick([0x2d3440, 0x1c2a4a, 0x4e4e4e, 0x6d5c47, 0x1a1a1a, 0x37474f]),
    shoes: pick([0x1c1c1c, 0xf2f2f2, 0xf2f2f2, 0x6b4a2b, 0x2a2a2a]),
    cap: chance(0.18) ? pick([0xc62828, 0x1a237e, 0xffffff, 0x6ec3ea, 0x1a1a1a]) : null,
    stubble: chance(0.4),
    beard: chance(0.15),
    mustache: chance(0.1),
    belly: chance(0.2),
  };
}

// Gaspi: saco oscuro, camisa blanca, corbata a rayas rojas y blancas, pelo castaño con raya al
// costado y barba de dos días. (La foto va en la tarjeta SUBE; en 3D la cara va pintada.)
let gaspiPhoto = null;
export function loadGaspiPhoto() {
  return new Promise((res) => {
    if (gaspiPhoto) return res(gaspiPhoto);
    const img = new Image();
    img.onload = () => res((gaspiPhoto = img));
    img.onerror = () => res(null);
    img.src = gaspiUrl;
  });
}
export function makeGaspi() {
  return makeHuman({
    skin: 0xe2ae92,
    hair: 0x4a3120,
    hairStyle: 'side',
    eyes: '#5b4128',
    stubble: true,
    jacket: 0x26282d,
    shirt: 0xf4f4f4,
    tie: true,
    pants: 0x1d1f23,
    shoes: 0x111111,
    gaspi: true,
    detail: 1.4,
    scale: 1.04,
  });
}
