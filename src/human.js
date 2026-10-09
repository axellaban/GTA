// Personas con esqueleto (SkinnedMesh): cuerpo continuo que se dobla sin cortes (ver body.js),
// cabeza esculpida con la cara dibujada, manos, zapatos, peinados y ropa (remeras, camisetas de
// fútbol, camperas, buzos, trajes, polleras, jeans, el chaleco de la Bonaerense).
// Todas comparten un material y un atlas de texturas, así cada persona es una sola llamada de dibujo.
import * as THREE from 'three';
import gaspiUrl from './gaspi.webp';
import { BONES, B, Mesher, loft, ellipsoid, chain, head, shell, prim, smooth } from './body.js';
import { combatPose, COMBAT_POSES } from './moves.js';

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
  return { x: col * CW, y: row * CH, w: CW, h: CH, u0: (col * CW + 1) / AW, u1: ((col + 1) * CW - 1) / AW, v0: 1 - ((row + 1) * CH - 1) / AH, v1: 1 - (row * CH + 1) / AH };
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

// sombra "horneada" como en los personajes de la PS2: costados más oscuros que el frente y la
// espalda (u = 0,25 y 0,75), y un poco en los bordes de arriba y abajo
function sideShade(g, r, a) {
  const grad = g.createLinearGradient(r.x, 0, r.x + CW, 0);
  for (const [s, k] of [[0, 1], [0.25, 0], [0.5, 1], [0.75, 0], [1, 1]]) grad.addColorStop(s, `rgba(0,0,0,${a * k})`);
  g.fillStyle = grad;
  g.fillRect(r.x, r.y, CW, CH);
  const v = g.createLinearGradient(0, r.y, 0, r.y + CH);
  v.addColorStop(0, `rgba(0,0,0,${a * 0.5})`);
  v.addColorStop(0.12, 'rgba(0,0,0,0)');
  v.addColorStop(0.88, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${a * 0.5})`);
  g.fillStyle = v;
  g.fillRect(r.x, r.y, CW, CH);
}
// tela pintada: sombra de costados, pliegues con luz y sombra, y costuras con puntadas
function paintedCloth(g, r, a) {
  sideShade(g, r, a);
  for (let i = 0; i < 46; i++) {
    const x = r.x + rnd() * CW;
    const y = r.y + rnd() * CH;
    const dx = (rnd() - 0.5) * 50;
    const dy = 18 + rnd() * 40;
    const bend = (rnd() - 0.5) * 30;
    for (const [col, off, w] of [['rgba(0,0,0,0.13)', 0, 3.5], ['rgba(255,255,255,0.12)', 3, 2]]) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x + off, y);
      g.quadraticCurveTo(x + dx / 2 + bend + off, y + dy / 2, x + dx + off, y + dy);
      g.stroke();
    }
  }
  for (const u of [0, 0.5, 1]) {
    const x = r.x + u * CW;
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(x - 1.5, r.y, 3, CH);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    for (let y = 0; y < CH; y += 7) g.fillRect(x + 3, r.y + y, 1, 4);
  }
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
  paintedCloth(g, r, 0.22);
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
  sideShade(g, r, 0.12);
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
  // gastado más claro adelante de los muslos (u = 0,25) y sombra en los costados
  const fade = g.createRadialGradient(r.x + CW * 0.25, r.y + CH * 0.45, 4, r.x + CW * 0.25, r.y + CH * 0.45, CW * 0.2);
  fade.addColorStop(0, 'rgba(255,255,255,0.28)');
  fade.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = fade;
  g.fillRect(r.x, r.y, CW, CH);
  paintedCloth(g, r, 0.2);
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
// Gaspi tiene su cara en un bloque de 2×2 celdas (el doble de resolución), al final del atlas.
const GASPI_CELLS = [54, 55, 62, 63];
const ALIEN_CELL = 53;
const GASPI_RECT = (() => {
  const r = cellRect(54);
  const r2 = cellRect(63);
  return { x: r.x, y: r.y, w: CW * 2, h: CH * 2, u0: r.u0, u1: r2.u1, v0: r2.v0, v1: r.v1 };
})();
const clamp1 = (v) => Math.max(-1, Math.min(1, v));

function drawHead(r, o) {
  const g = actx;
  const W = r.w ?? CW;
  const HH = r.h ?? CH;
  const k = W / 256; // escala de trazos
  const FX = (nx) => r.x + (0.5 + Math.asin(clamp1(nx)) / Math.PI) * W;
  const FY = (ny) => r.y + (Math.acos(clamp1(ny)) / Math.PI) * HH;
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
  g.save();
  g.beginPath();
  g.rect(r.x, r.y, W, HH);
  g.clip();
  const skin = new THREE.Color(o.skin);
  const skinHex = hex(skin);
  g.fillStyle = skinHex;
  g.fillRect(r.x, r.y, W, HH);
  // poros y manchitas
  for (let n = 0; n < 900 * k * k; n++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.045)' : 'rgba(255,255,255,0.045)';
    g.fillRect(r.x + rnd() * W, r.y + rnd() * HH, 1.5 * k, 1.5 * k);
  }
  const hairC = new THREE.Color(o.hair);
  const rgb = (c, a) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
  const bald = o.hairStyle === 'bald';
  // volumen: luz en la frente, el puente de la nariz y los pómulos; sombra en las cuencas,
  // a los costados de la nariz, bajo la nariz, bajo el labio y bajo el mentón
  blob(0, 0.45, 0.5, 0.22, 'rgba(255,244,232,0.12)');
  blob(0, -0.05, 0.035, 0.16, 'rgba(255,244,232,0.12)');
  blob(0, -0.24, 0.05, 0.04, 'rgba(255,244,232,0.14)');
  // (al extraterrestre no se le ponen sombras ni rubor de piel humana: sobre verde quedan marrones)
  for (const s of o.alien ? [] : [-1, 1]) {
    blob(0.33 * s, 0.13, 0.17, 0.09, 'rgba(70,35,25,0.24)');
    blob(0.43 * s, -0.12, 0.18, 0.1, 'rgba(255,238,224,0.1)');
    blob(0.1 * s, -0.16, 0.05, 0.1, 'rgba(90,45,35,0.1)');
    blob(0.6 * s, -0.4, 0.18, 0.28, 'rgba(90,45,35,0.1)');
    blob(0.22 * s, -0.43, 0.05, 0.12, o.female ? 'rgba(90,45,35,0.04)' : 'rgba(90,45,35,0.09)');
    blob(0.47 * s, -0.22, 0.2, 0.15, o.female ? 'rgba(215,95,95,0.17)' : 'rgba(200,95,85,0.08)');
  }
  if (o.alien) {
    // boquita fina y dos agujeritos de nariz, en verde oscuro
    blob(0, -0.48, 0.12, 0.018, 'rgba(20,60,15,0.55)');
    for (const s of [-1, 1]) blob(0.05 * s, -0.2, 0.018, 0.012, 'rgba(20,60,15,0.6)');
  } else {
    blob(0, -0.31, 0.09, 0.035, 'rgba(70,30,25,0.2)');
    blob(0, -0.63, 0.13, 0.045, 'rgba(70,35,25,0.17)');
    blob(0, -0.98, 0.7, 0.14, 'rgba(60,30,20,0.35)');
  }
  // barba de dos días (sombra pareja con puntitos finos) o barba
  if (!o.female && (o.stubble || o.beard)) {
    // la barba afeitada deja una sombra gris azulada, no marrón
    const bc = o.beard ? hairC.clone().lerp(skin, 0.1) : hairC.clone().lerp(new THREE.Color(0x3c4048), 0.55).lerp(skin, 0.3);
    const soft = o.gaspi ? 0.75 : 1;
    blob(0, -0.66, 0.66, 0.34, rgb(bc, (o.beard ? 0.95 : 0.3) * soft));
    blob(0, -0.42, 0.2, 0.06, rgb(bc, (o.beard ? 0.9 : 0.26) * soft));
    for (const s of [-1, 1]) blob(0.6 * s, -0.4, 0.14, 0.3, rgb(bc, (o.beard ? 0.8 : 0.18) * soft));
    for (let n = 0; n < (o.beard ? 1800 : 900) * k * k; n++) {
      const nx = (rnd() * 2 - 1) * 0.7;
      const ny = -0.35 - rnd() * 0.62;
      if (Math.abs(nx) > 0.72 - (-0.35 - ny) * 0.35) continue;
      g.fillStyle = rgb(bc, (o.beard ? 0.5 : 0.2) * soft);
      g.fillRect(FX(nx), FY(ny), k, k);
    }
  }
  if (o.mustache && !o.female) {
    g.fillStyle = hex(hairC);
    g.beginPath();
    g.ellipse(FX(0), FY(-0.43), FX(0.16) - FX(0), (FY(-0.47) - FY(-0.41)) / 2, 0, 0, Math.PI * 2);
    g.fill();
  }
  // extraterrestre: dos ojos negros enormes, rasgados hacia arriba, con brillo
  if (o.alien) {
    for (const s of [-1, 1]) {
      const cx = FX(0.3 * s);
      const cy = FY(0.12);
      const w = (FX(0.5) - FX(0.08)) / 2;
      const h = w * 0.62;
      g.save();
      g.translate(cx, cy);
      g.rotate(s * -0.42);
      const eg = g.createRadialGradient(0, 0, w * 0.1, 0, 0, w);
      eg.addColorStop(0, '#1b1f1d');
      eg.addColorStop(1, '#050605');
      g.fillStyle = eg;
      g.beginPath();
      g.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.beginPath();
      g.ellipse(-s * w * 0.35, -h * 0.35, w * 0.16, h * 0.18, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
  // ojos: almendra con sombra del párpado, iris con degradé, pupila y brillo
  const iris = new THREE.Color(o.eyes ?? '#4a3222');
  for (const s of o.alien ? [] : [-1, 1]) {
    const cx = FX(0.33 * s);
    const cy = FY(0.1);
    const w = (FX(0.45) - FX(0.21)) / 2;
    const h = w * (o.female ? 0.46 : 0.4);
    const almond = () => {
      g.beginPath();
      g.moveTo(cx - s * w, cy + h * 0.05);
      g.bezierCurveTo(cx - s * w * 0.5, cy - h * 1.35, cx + s * w * 0.45, cy - h * 1.25, cx + s * w, cy - h * 0.05);
      g.bezierCurveTo(cx + s * w * 0.4, cy + h * 1.05, cx - s * w * 0.45, cy + h * 1.05, cx - s * w, cy + h * 0.05);
      g.closePath();
    };
    // pliegue del párpado
    g.strokeStyle = 'rgba(90,50,40,0.35)';
    g.lineWidth = 1.4 * k;
    g.beginPath();
    g.moveTo(cx - s * w * 0.9, cy - h * 0.7);
    g.quadraticCurveTo(cx, cy - h * 2.1, cx + s * w * 0.95, cy - h * 0.8);
    g.stroke();
    g.save();
    almond();
    g.clip();
    g.fillStyle = '#ece6dc';
    g.fillRect(cx - w * 1.2, cy - h * 1.5, w * 2.4, h * 3);
    const ir = h * 1.0;
    const ig = g.createRadialGradient(cx, cy - h * 0.1, ir * 0.1, cx, cy - h * 0.1, ir);
    ig.addColorStop(0, rgb(iris.clone().lerp(new THREE.Color(0xffffff), 0.25), 1));
    ig.addColorStop(0.7, rgb(iris, 1));
    ig.addColorStop(1, rgb(iris.clone().multiplyScalar(0.45), 1));
    g.fillStyle = ig;
    g.beginPath();
    g.arc(cx, cy - h * 0.1, ir, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0b0806';
    g.beginPath();
    g.arc(cx, cy - h * 0.1, ir * 0.42, 0, Math.PI * 2);
    g.fill();
    // sombra del párpado de arriba sobre el ojo
    const sh = g.createLinearGradient(0, cy - h * 1.2, 0, cy);
    sh.addColorStop(0, 'rgba(40,20,15,0.55)');
    sh.addColorStop(1, 'rgba(40,20,15,0)');
    g.fillStyle = sh;
    g.fillRect(cx - w * 1.2, cy - h * 1.3, w * 2.4, h * 1.3);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.arc(cx + s * ir * 0.3, cy - h * 0.45, Math.max(1, ir * 0.18), 0, Math.PI * 2);
    g.fill();
    g.restore();
    // línea del párpado (pestañas) y del de abajo
    g.strokeStyle = o.female ? '#140d0a' : 'rgba(35,20,14,0.9)';
    g.lineWidth = (o.female ? 2.4 : 1.6) * k;
    g.beginPath();
    g.moveTo(cx - s * w, cy + h * 0.05);
    g.bezierCurveTo(cx - s * w * 0.5, cy - h * 1.35, cx + s * w * 0.45, cy - h * 1.25, cx + s * w * (o.female ? 1.15 : 1), cy - h * (o.female ? 0.35 : 0.05));
    g.stroke();
    g.strokeStyle = 'rgba(80,45,35,0.35)';
    g.lineWidth = 0.9 * k;
    g.beginPath();
    g.moveTo(cx - s * w * 0.9, cy + h * 0.2);
    g.bezierCurveTo(cx - s * w * 0.4, cy + h * 1.05, cx + s * w * 0.4, cy + h * 1.05, cx + s * w, cy);
    g.stroke();
    if (o.tired) blob(0.33 * s, -0.01, 0.12, 0.04, 'rgba(80,45,70,0.35)');
    // cejas: trazos cortos de pelo, más gruesas del lado de adentro
    const bc = hairC.clone().multiplyScalar(0.92);
    const thick = o.female ? 0.6 : o.gaspi ? 1.15 : 1;
    const N = Math.round(70 * k * thick);
    for (let n = 0; n < N; n++) {
      const t = rnd();
      const bx = 0.14 + t * 0.37;
      const by = 0.205 + Math.sin(Math.min(1, t * 1.3) * Math.PI) * (o.female ? 0.07 : 0.045) - t * 0.02;
      const x0 = FX(bx * s);
      const y0 = FY(by + (rnd() - 0.5) * 0.03 * (1.4 - t) * thick);
      const len = (2.5 + rnd() * 2.5) * k;
      const ang = t < 0.3 ? -1.1 : -0.3;
      g.strokeStyle = rgb(bc, 0.35 + rnd() * 0.3);
      g.lineWidth = 0.75 * k;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x0 + s * Math.cos(ang) * len, y0 + Math.sin(ang) * len);
      g.stroke();
    }
  }
  // nariz y boca humanas (el extraterrestre tiene las suyas, más arriba)
  if (!o.alien) {
  // nariz: fosas suaves
  for (const s of [-1, 1]) {
    g.fillStyle = 'rgba(60,25,20,0.45)';
    g.beginPath();
    g.ellipse(FX(0.045 * s), FY(-0.3), 2 * k, 1.2 * k, s * 0.3, 0, Math.PI * 2);
    g.fill();
  }
  // boca: labio de arriba más oscuro, de abajo más claro con brillo, comisuras
  const lip = o.lipstick ? new THREE.Color(o.lipstick) : skin.clone().lerp(new THREE.Color(0xa84a44), 0.5);
  const my = -0.5;
  const smirk = o.gaspi ? 0.018 : 0;
  g.fillStyle = hex(lip.clone().multiplyScalar(0.8));
  g.beginPath();
  g.moveTo(FX(-0.2), FY(my - smirk * 0.3));
  g.quadraticCurveTo(FX(-0.09), FY(my + 0.07), FX(0), FY(my + 0.042));
  g.quadraticCurveTo(FX(0.09), FY(my + 0.07), FX(0.2), FY(my + smirk));
  g.closePath();
  g.fill();
  const lg = g.createLinearGradient(0, FY(my), 0, FY(my - 0.09));
  lg.addColorStop(0, hex(lip));
  lg.addColorStop(1, hex(lip.clone().multiplyScalar(0.85)));
  g.fillStyle = lg;
  g.beginPath();
  g.moveTo(FX(-0.19), FY(my - smirk * 0.3));
  g.quadraticCurveTo(FX(0), FY(my - (o.female ? 0.12 : 0.1)), FX(0.19), FY(my + smirk));
  g.closePath();
  g.fill();
  blob(0.02, my - 0.035, 0.05, 0.012, 'rgba(255,255,255,0.18)');
  g.strokeStyle = 'rgba(50,15,15,0.7)';
  g.lineWidth = 1.2 * k;
  g.beginPath();
  g.moveTo(FX(-0.21), FY(my - smirk * 0.3 - 0.005));
  g.quadraticCurveTo(FX(0), FY(my - 0.014), FX(0.21), FY(my + smirk + 0.004));
  g.stroke();
  for (const s of [-1, 1]) blob(0.21 * s, my, 0.025, 0.02, 'rgba(60,20,20,0.25)');
  }
  if (o.glasses) {
    g.strokeStyle = '#141414';
    g.lineWidth = 2.5 * k;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.rect(FX(0.33 * s) - 11 * k, FY(0.2), 22 * k, FY(-0.02) - FY(0.2));
      g.stroke();
    }
    g.beginPath();
    g.moveTo(FX(-0.2), FY(0.12));
    g.lineTo(FX(0.2), FY(0.12));
    g.stroke();
  }
  // cuero cabelludo bajo el borde del pelo (para que no se vea piel en el borde del casquete)
  if (!bald) {
    const gr = g.createLinearGradient(0, FY(0.72), 0, FY(0.52));
    gr.addColorStop(0, hex(hairC));
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(r.x, r.y, W, FY(0.52) - r.y);
    // los bordes de la celda son la parte de atrás de la cabeza (pelo arriba, nuca abajo)
    g.fillStyle = hex(hairC);
    g.fillRect(r.x, r.y, 4 * k, FY(-0.3) - r.y);
    g.fillRect(r.x + W - 4 * k, r.y, 4 * k, FY(-0.3) - r.y);
  }
  g.restore();
  atlasTex.needsUpdate = true;
}

function headCell(o) {
  if (o.gaspi) {
    if (!cellCache.has('gaspi')) {
      cellCache.set('gaspi', GASPI_RECT);
      drawHead(GASPI_RECT, o);
    }
    return GASPI_RECT;
  }
  const key = [o.skin, o.hair, o.hairStyle, o.beard, o.stubble, o.mustache, o.glasses, o.tired, o.female, o.lipstick, o.eyes, o.alien].join('|');
  if (cellCache.has(key)) return cellCache.get(key);
  // el extraterrestre tiene su celda reservada (si el atlas se llena, no le toca la cara de otro)
  if (o.alien) {
    const r = cellRect(ALIEN_CELL);
    cellCache.set(key, r);
    drawHead(r, o);
    return r;
  }
  if (nextCell >= ALIEN_CELL) {
    // atlas lleno: reusar una cabeza cualquiera
    const any = [...cellCache.values()][Math.floor(Math.random() * cellCache.size)];
    return any;
  }
  const r = cellRect(nextCell++);
  cellCache.set(key, r);
  drawHead(r, o);
  return r;
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
// pantalón de vestir: cae recto desde la cadera, sin marcar rodilla ni pantorrilla
const TROUSER = [
  [0.05, 0.061, 0.066, 0.068],
  [0.2, 0.061, 0.065, 0.068],
  [0.4, 0.063, 0.067, 0.07],
  [0.55, 0.067, 0.071, 0.073],
  [0.7, 0.076, 0.08, 0.083],
  [0.85, 0.087, 0.09, 0.096],
  [1.0, 0.092, 0.088, 0.1],
];
// faldón del saco: cae derecho sobre la cadera y la cola
const JACKET_SKIRT = [
  [0.83, 0.186, 0.114, 0.126, -0.004],
  [0.93, 0.184, 0.11, 0.124, -0.004],
  [1.03, 0.18, 0.11, 0.118, 0.004],
];
// mano colgando (palma hacia el cuerpo): [altura, grosor, ancho adelante, ancho atrás, corrimiento]
const HAND = [
  [0.845, 0.01, 0.012, 0.012, 0.002],
  [0.86, 0.017, 0.028, 0.026, 0.003],
  [0.89, 0.02, 0.036, 0.033, 0.004],
  [0.93, 0.021, 0.04, 0.035, 0.002],
  [0.97, 0.022, 0.036, 0.031, 0],
  [1.005, 0.024, 0.027, 0.026, 0],
];
const PALM = [
  [0.868, 0.016, 0.034, 0.03, 0.003],
  [0.89, 0.02, 0.038, 0.034, 0.004],
  [0.93, 0.021, 0.04, 0.035, 0.002],
  [0.97, 0.022, 0.036, 0.031, 0],
  [1.005, 0.024, 0.027, 0.026, 0],
];
// dedos: [corrimiento a lo ancho de la mano, largo]
const FINGERS = [
  [0.024, 0.068],
  [0.008, 0.076],
  [-0.008, 0.07],
  [-0.023, 0.056],
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
  const sx = female ? 0.178 : o.muscle ? 0.214 : 0.195; // hombros
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
    // musculoso: pecho y espalda anchos, cintura fina (en V)
    if (o.muscle) {
      for (const k of TK) {
        const c = smooth(1.12, 1.32, k[0]) * (1 - smooth(1.57, 1.62, k[0]));
        k[1] *= 1 + 0.17 * c;
        k[2] *= 1 + 0.26 * c;
        k[3] *= 1 + 0.14 * c;
        if (k[0] > 0.95 && k[0] < 1.12) k[1] *= 0.95;
      }
    }
    const jacketed = top === 'suit' || top === 'jacket' || top === 'police' || top === 'hoodie';
    const seam = -Math.PI / 2; // costura al costado: adelante u = 0,25 y atrás u = 0,75

    // ---- pelvis (pantalón o pollera) y torso (lo de arriba) ----
    const pelvisColor = bottom === 'skirt' || bottom === 'dress' ? (o.skirt ?? pants) : pants;
    loft(m, { keys: TK, to: 1.06, seg: seg(20), p: 2.4, capStart: true, color: pelvisColor, cell: bottom === 'jeans' ? rect(CELL.denim) : fab, weights: (x, y) => torsoW(y), seam });
    const topCell = top === 'jersey' ? rect(7 + JERSEYS.indexOf(o.jersey)) : top === 'none' ? skinCell : fab;
    // saco: hombros rectos con hombrera, que cubren el hombro redondo del brazo
    const TKtop = top === 'suit' ? TK.map((k) => [k[0], k[1] + 0.045 * smooth(1.4, 1.53, k[0]) * (1 - smooth(1.575, 1.61, k[0])), ...k.slice(2)]) : TK;
    const topGrow = (t) => (jacketed ? 0.012 : 0.003) * smooth(1.61, 1.55, t) + (t < 1.1 ? 0.004 : 0);
    loft(m, {
      keys: TKtop,
      from: top === 'suit' ? 1.0 : top === 'jacket' ? 0.97 : 1.03,
      seg: seg(20),
      p: 2.4,
      color: (t, a, x, y, z) => {
        // en cuero: pectorales y abdominales marcados con sombra
        if (top === 'none') {
          const fa = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
          if (fa < 0.62 && Math.abs(t - 1.355) < 0.012) return tone(skin, 0.82);
          if (fa < 0.03 && t > 1.04 && t < 1.34) return tone(skin, 0.84);
          if (fa < 0.3 && t > 1.04 && t < 1.32 && [1.115, 1.185, 1.255].some((b) => Math.abs(t - b) < 0.008)) return tone(skin, 0.86);
          return skin;
        }
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
    if (top === 'suit') {
      const skirtW = (x, y) => {
        const k = 0.45 * smooth(1.0, 0.84, y);
        const left = smooth(-0.05, 0.05, x);
        return [
          [B.hips, 1 - k],
          [B.thL, k * left],
          [B.thR, k * (1 - left)],
        ];
      };
      for (const inside of [false, true]) loft(m, { keys: JACKET_SKIRT, seg: seg(20), p: 2.4, grow: inside ? -0.004 : 0, inside, color: inside ? tone(topColor, 0.6) : topColor, cell: fab, weights: skirtW, seam });
    }
    // cuello
    const NK = (female ? NECK_F : NECK).map((k) => (o.muscle ? [k[0], k[1] * 1.3, k[2] * 1.3, k[3] * 1.3, k[4]] : k));
    loft(m, { keys: NK, seg: seg(12), color: skin, cell: skinCell, weights: (x, y) => torsoW(y) });

    // ---- cabeza ----
    const H = { cx: 0, cy: 1.79, cz: 0.014, rx: female ? 0.073 : 0.078, ry: female ? 0.11 : 0.116, rz: female ? 0.097 : 0.103, female };
    head(m, H, headCell({ ...o, skin, hair, female }), 0xffffff, D);
    for (const s of [-1, 1]) ellipsoid(m, s * (H.rx - 0.004), H.cy - 0.005, H.cz - 0.014, 0.012, 0.03, 0.019, { seg: 8, color: tone(skin, 0.95), cell: skinCell, weights: () => [[B.head, 1]] });
    addHair(m, H, o, hair, female);

    // ---- brazos y manos (el derecho en -x: el personaje mira hacia +z) ----
    // brazos: con músculos, hombros y bíceps bien marcados
    const AK = (female ? ARM_F : ARM_M).map(([t, a, b, c]) => {
      const k = o.muscle ? (t > 1.28 ? 1.5 : t > 1.02 ? 1.3 : 1.1) : o.fit ? 1.08 : 1;
      return [t, a * k, b * k, c * k];
    });
    const sleeveTo = top === 'tank' || top === 'none' ? 1.62 : top === 'tshirt' || top === 'jersey' ? (female ? 1.46 : 1.38) : 1.0;
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
      if (D >= 0.9) {
        // de cerca: palma y cuatro dedos un poco doblados hacia la palma
        loft(m, { keys: PALM, x0: s * sx, seg: seg(10), p: 2.3, capStart: true, color: skin, cell: skinCell, weights: (x, y) => armW(y) });
        for (const [dz, len] of FINGERS) {
          const top = 0.885;
          loft(m, {
            keys: [
              [top - len, 0.0062, 0.0062, 0.0062, dz, -s * 0.016],
              [top - len * 0.55, 0.0085, 0.0085, 0.0085, dz, -s * 0.007],
              [top, 0.0098, 0.0098, 0.0098, dz, 0],
            ],
            x0: s * sx,
            seg: 6,
            capStart: true,
            color: skin,
            cell: skinCell,
            weights: () => [[B[hand], 1]],
          });
        }
      } else loft(m, { keys: HAND, x0: s * sx, seg: seg(10), p: 2.3, capStart: true, color: skin, cell: skinCell, weights: (x, y) => armW(y) });
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
      const trousers = bottom === 'pants';
      loft(m, { keys: trousers ? (female ? TROUSER.map(([t, a, b, c]) => [t, a * 0.94, b * 0.94, c * 0.94]) : TROUSER) : LK, x0: s * lx, seg: seg(12), color: legColor, grow: trousers ? 0 : legGrow, cell: bottom === 'jeans' ? rect(CELL.denim) : bareLegs || bottom === 'shorts' ? skinCell : fab, weights: (x, y) => legW(y) });
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
  const h = { root, mesh, bones, phase: Math.random() * 10, geos, lod: 0, keep: !!o.gaspi, female };
  root.userData.human = h;
  ALL.add(h);
  return h;
}

// Nivel de detalle: cerca de la cámara el cuerpo completo, lejos el liviano.
const ALL = new Set();
// un personaje que se fue del juego: se olvida y se liberan sus mallas de la placa (son solo suyas; si
// volviera a escena, three las vuelve a subir)
export function forgetHuman(h) {
  ALL.delete(h);
  for (const g of h.geos ?? []) g.dispose();
}
const wp = new THREE.Vector3();
export function updateHumanLod(camera, near) {
  for (const h of ALL) {
    if (!h.root.parent) {
      // ya no está en escena: si no vuelve en un rato, se olvida
      h.gone = (h.gone || 0) + 1;
      if (h.gone > 300) forgetHuman(h);
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
  loft(m, { keys: NK, from: 1.595, to: 1.668, seg: seg(14), grow: 0.006, color: o.shirt ?? 0xf4f4f4, cell: fab, weights: W });
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
  // mechones: surcos finos en la dirección del peinado (para que no parezca un casco)
  const strands = (s, a, th) => 0.0022 * Math.sin(a * 23 + th * 7) * (1 - s * 0.6) + 0.0012 * Math.sin(a * 41 - th * 13);
  if (style === 'short' && !cap) {
    const base = thick;
    thick = (s, a, th) => base(s, a, th) + strands(s, a, th) * taper(s);
  }
  // raya al costado (Gaspi): volumen arriba peinado hacia un lado, jopo adelante y nuca rebajada
  if (style === 'side' && !cap)
    thick = (s, a, th) => {
      const sweep = Math.max(0, Math.cos(a + 0.7));
      const front = Math.max(0, Math.cos(a)) ** 2;
      const quiff = 0.011 * front * smooth(0.25, 0.7, s) * (1 - smooth(0.82, 1, s));
      const nape = 1 - 0.55 * smooth(0.55, 1, s) * Math.max(0, -Math.cos(a));
      return (0.009 + 0.013 * (1 - s * s) + 0.008 * (1 - s * s) * sweep + quiff + strands(s, a + 0.5, th)) * taper(s) * nape;
    };
  const fine = o.gaspi ? { rows: 16, cols: 44 } : {};
  shell(m, H, { ...fine, front: female ? 0.35 : 0.33, side: female ? 0.52 : 0.45, back: female ? 0.66 : 0.62, burns: female ? 0 : 0.06, color: hair, cell: hc, thick });
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
  } else if (o.fedora != null) {
    // sombrero de ala ancha con cinta negra (el de Laban, estilo Alan Faena)
    const y0 = H.cy + H.ry * 0.62;
    prim(m, new THREE.CylinderGeometry(0.205, 0.205, 0.012, 24).translate(0, y0, H.cz), 'head', o.fedora, fab);
    prim(m, new THREE.CylinderGeometry(0.088, 0.104, 0.12, 20).translate(0, y0 + 0.064, H.cz), 'head', o.fedora, fab);
    prim(m, new THREE.CylinderGeometry(0.106, 0.106, 0.03, 20).translate(0, y0 + 0.022, H.cz), 'head', 0x151515, fab);
  }
  void W;
}

// ---------- Animación ----------
function reset(h) {
  for (const b of Object.values(h.bones)) b.rotation.set(0, 0, 0);
  const r = h.bones.root;
  r.position.set(0, 0, 0);
  h.bones.hips.position.set(0, 0.95, 0);
  if (h.bar) h.bar.visible = false;
}

// Anima caminata y poses. `speed` en m/s. `t` (0..1) es el avance de un golpe.
// `post(bones)`: retoques encima de la pose (mirar a alguien, inclinarse) antes de copiarla al modelo.
// cuánto dura el paso de una pose a otra (s): los golpes y las reacciones casi sin mezcla para que peguen
const BLEND = { swim: 0.35, tread: 0.35, dive: 0.4, jab: 0.06, cross: 0.07, hook: 0.08, uppercut: 0.08, kick: 0.1, hit: 0.04, block: 0.05, punch: 0.06, swing: 0.07, dead: 0.3, knocked: 0.22, getup: 0.12, aim: 0.12, aimLong: 0.14 };
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
export function animateHuman(h, dt, speed, pose = 'walk', t = 0, post = null) {
  // al cambiar de pose se parte de cómo estaba el cuerpo y se llega a la nueva en un instante (sin saltos)
  const list = (h.boneList ??= Object.values(h.bones));
  if (pose !== h.poseKey && h.out && dt > 0) {
    h.from ??= new Float32Array(list.length * 4 + 6);
    h.from.set(h.out);
    h.blendT = 0;
    h.blendD = BLEND[pose] ?? BLEND[h.poseKey] ?? 0.18;
  } else if (pose !== h.poseKey) h.blendD = 0;
  h.poseKey = pose;
  poseHuman(h, dt, speed, pose, t);
  if (h.blendD > 0) {
    h.blendT += dt;
    const k = Math.min(1, h.blendT / h.blendD);
    if (k >= 1) h.blendD = 0;
    else {
      const e = k * k * (3 - 2 * k);
      const f = h.from;
      for (let i = 0; i < list.length; i++) {
        qa.fromArray(f, i * 4);
        qb.copy(list[i].quaternion);
        list[i].quaternion.slerpQuaternions(qa, qb, e);
      }
      const o = list.length * 4;
      const hp = h.bones.hips.position;
      const rp = h.bones.root.position;
      hp.set(f[o] + (hp.x - f[o]) * e, f[o + 1] + (hp.y - f[o + 1]) * e, f[o + 2] + (hp.z - f[o + 2]) * e);
      rp.set(f[o + 3] + (rp.x - f[o + 3]) * e, f[o + 4] + (rp.y - f[o + 4]) * e, f[o + 5] + (rp.z - f[o + 5]) * e);
    }
  }
  // lo que quedó (antes de los retoques de "post") es el punto de partida de la próxima mezcla
  const out = (h.out ??= new Float32Array(list.length * 4 + 6));
  for (let i = 0; i < list.length; i++) list[i].quaternion.toArray(out, i * 4);
  const o = list.length * 4;
  h.bones.hips.position.toArray(out, o);
  h.bones.root.position.toArray(out, o + 3);
  post?.(h.bones);
  // personajes de modelo externo (src/rig.js): copiar la pose al esqueleto real
  h.rig?.apply();
}
function poseHuman(h, dt, speed, pose = 'walk', t = 0) {
  // ritmo del paso medido para que el pie apoyado no patine: caminando ~0,8 zancadas por segundo,
  // corriendo a fondo ~1,6 (como una persona de verdad)
  h.phase += (h.walkBack && speed > 0.1 ? -1 : 1) * dt * (speed < 0.1 ? 1 : speed < 1 ? 2 + speed * 2.85 : 4.6 + speed * 0.25 + Math.max(0, speed - 3) * 1.35);
  const s = Math.sin(h.phase);
  const c = Math.cos(h.phase);
  const amp = Math.min(0.85, speed * 0.26);
  const b = h.bones;
  reset(h);

  if (pose === 'dead') {
    // tirado sin vida: boca arriba o boca abajo, brazos y piernas como cayeron (t es la semilla)
    const v = t;
    const face = v > 0.55;
    b.root.rotation.x = face ? Math.PI / 2 : -Math.PI / 2;
    b.root.rotation.z = (v - 0.5) * 0.5;
    b.root.position.set(0, 0.11, 0);
    b.uaR.rotation.set(-0.4 - v * 1.7, 0, -0.9 - v * 0.7);
    b.uaL.rotation.set(-2.0 + v * 1.5, 0, 1.1 - v * 0.5);
    b.faR.rotation.x = -0.25 - v * 0.9;
    b.faL.rotation.x = -1.0 + v * 0.7;
    b.thR.rotation.set(-0.15 - v * 0.55, 0, -0.3);
    b.thL.rotation.set(0.05 + v * 0.25, 0, 0.22 + v * 0.3);
    b.shR.rotation.x = 0.35 + v * 0.9;
    b.shL.rotation.x = 0.08;
    b.ftR.rotation.x = 0.6;
    b.ftL.rotation.x = 0.5;
    b.head.rotation.set(face ? 0 : 0.15, 1.0 - v * 2.0, 0);
    return;
  }
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
  if (pose === 'press' || pose === 'squat' || pose === 'pullup') {
    // entrenando en el gym: t es el avance de la repetición (0..1)
    const k = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
    if (pose === 'press') {
      b.uaR.rotation.set(-1.3 - 1.55 * k, 0, 0.55 - 0.3 * k);
      b.uaL.rotation.set(-1.3 - 1.55 * k, 0, -0.55 + 0.3 * k);
      b.faR.rotation.x = b.faL.rotation.x = -1.9 * (1 - k) - 0.1;
      if (h.bar) {
        h.bar.visible = true;
        h.bar.position.set(0, 1.62 + 0.52 * k, 0.1);
      }
    } else if (pose === 'squat') {
      b.hips.position.y -= 0.4 * k;
      b.thR.rotation.x = b.thL.rotation.x = -1.4 * k;
      b.shR.rotation.x = b.shL.rotation.x = 1.75 * k;
      b.ftR.rotation.x = b.ftL.rotation.x = -0.35 * k;
      b.spine.rotation.x = 0.3 * k;
      b.uaR.rotation.set(-1.5, 0, 0.25);
      b.uaL.rotation.set(-1.5, 0, -0.25);
      b.faR.rotation.x = b.faL.rotation.x = -2.1;
      if (h.bar) {
        h.bar.visible = true;
        h.bar.position.set(0, 1.55 - 0.4 * k, 0.2);
      }
    } else {
      // dominadas colgado del rack
      b.hips.position.y += 0.5 * k;
      b.uaR.rotation.set(-2.95 + 1.2 * k, 0, 0.35 + 0.3 * k);
      b.uaL.rotation.set(-2.95 + 1.2 * k, 0, -0.35 - 0.3 * k);
      b.faR.rotation.x = b.faL.rotation.x = -0.2 - 1.7 * k;
      b.shR.rotation.x = b.shL.rotation.x = 0.5;
      b.thR.rotation.x = b.thL.rotation.x = -0.2;
    }
    b.head.rotation.x = -0.1;
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
  if (pose === 'truco' || pose === 'guitar') {
    // sentado en una silla de plástico: jugando al truco (las cartas en las manos, cada tanto tira una a la
    // mesa) o tocando la guitarra (la izquierda en el mástil, la derecha rasguea). t: reloj en segundos
    b.hips.position.y = 0.42;
    b.thR.rotation.set(-1.45, 0, -0.06);
    b.thL.rotation.set(-1.4, 0, 0.08);
    b.shR.rotation.x = 1.35;
    b.shL.rotation.x = 1.42;
    b.spine.rotation.x = 0.16;
    if (pose === 'truco') {
      const cyc = t % 7.5;
      const th = cyc > 5.6 && cyc < 6.6 ? Math.sin(((cyc - 5.6) / 1) * Math.PI) : 0;
      b.uaL.rotation.set(-0.72, 0, -0.3);
      b.faL.rotation.x = -1.35;
      b.uaR.rotation.set(-0.72 - 0.45 * th, 0, 0.3 - 0.1 * th);
      b.faR.rotation.x = -1.35 + 0.95 * th;
      b.spine.rotation.x = 0.2 + 0.12 * th;
      b.head.rotation.set(0.32 - 0.12 * th + Math.sin(t * 0.7) * 0.04, Math.sin(t * 0.31) * 0.25, 0);
    } else {
      const st = Math.sin(t * 9);
      b.uaL.rotation.set(-0.85, 0.2, -0.75);
      b.faL.rotation.x = -1.15;
      b.uaR.rotation.set(-0.35, 0, 0.42);
      b.faR.rotation.x = -1.55 + st * 0.18;
      b.head.rotation.set(0.25 + Math.sin(t * 1.8) * 0.06, -0.3, Math.sin(t * 0.9) * 0.08);
      b.chest.rotation.y = 0.12;
    }
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
  if (pose === 'remar') {
    // remando sentado en el bote (mirando para atrás): se estira adelante con los brazos largos, mete los
    // remos y tira echándose atrás con los codos doblados. t: el reloj de las remadas (ciclos)
    const k = 0.5 - 0.5 * Math.cos((t % 1) * Math.PI * 2);
    b.hips.position.y = 0.42;
    b.thR.rotation.set(-1.25 + k * 0.25, 0, -0.12);
    b.thL.rotation.set(-1.25 + k * 0.25, 0, 0.12);
    b.shR.rotation.x = b.shL.rotation.x = 1.05 - k * 0.35;
    b.spine.rotation.x = 0.42 - 0.62 * k;
    b.chest.rotation.x = 0.08 - 0.1 * k;
    b.uaR.rotation.set(-1.3 + 0.85 * k, 0, 0.32 + 0.25 * k);
    b.uaL.rotation.set(-1.3 + 0.85 * k, 0, -0.32 - 0.25 * k);
    b.faR.rotation.x = b.faL.rotation.x = -0.12 - 1.45 * k;
    b.head.rotation.x = -0.25 + 0.3 * k;
    return;
  }
  if (pose === 'dive') {
    // buceando (pecho, como en GTA): el cuerpo acostado e inclinado hacia donde va (h.divePitch), los brazos
    // se abren y tiran hacia atrás, vuelven juntos por adelante, y las piernas patean de rana. El origen de
    // la persona queda en el medio del cuerpo. t: el reloj de las brazadas (ciclos)
    const ph = t % 1;
    const th = Math.PI / 2 - (h.divePitch || 0);
    b.root.rotation.x = th;
    b.root.position.set(0, -0.92 * Math.cos(th), -0.92 * Math.sin(th));
    const pull = ph < 0.3 ? Math.sin((ph / 0.3) * Math.PI * 0.5) : ph < 0.55 ? 1 - (ph - 0.3) / 0.25 : 0;
    const rec = ph >= 0.3 && ph < 0.55 ? Math.sin(((ph - 0.3) / 0.25) * Math.PI) : 0;
    for (const [ua, fa, side] of [
      [b.uaR, b.faR, -1],
      [b.uaL, b.faL, 1],
    ]) {
      ua.rotation.set(-Math.PI + 0.25 + pull * 1.15 - rec * 0.6, 0, side * (0.12 + pull * 0.85 - rec * 0.4));
      fa.rotation.x = -0.1 - rec * 1.6 - pull * 0.25;
    }
    const kick = ph >= 0.4 && ph < 0.75 ? Math.sin(((ph - 0.4) / 0.35) * Math.PI * 0.5) : ph >= 0.75 && ph < 0.9 ? 1 - (ph - 0.75) / 0.15 : 0;
    b.thR.rotation.set(-0.85 * kick, 0, -0.38 * kick);
    b.thL.rotation.set(-0.85 * kick, 0, 0.38 * kick);
    b.shR.rotation.x = b.shL.rotation.x = 1.7 * kick + 0.05;
    b.ftR.rotation.x = b.ftL.rotation.x = 0.8 - 0.9 * kick;
    b.neck.rotation.x = -0.5;
    b.head.rotation.x = -0.15;
    b.spine.rotation.x = -0.05 + pull * 0.06;
    return;
  }
  if (pose === 'swim' || pose === 'tread') {
    // en el agua (src/agua.js): el origen de la persona queda en la superficie.
    // t: el reloj de las brazadas (en ciclos; una brazada de cada brazo por ciclo)
    const P = Math.PI * 2;
    if (pose === 'swim') {
      // crol: el cuerpo acostado boca abajo, la cabeza apenas afuera, las brazadas alternadas (el brazo
      // entra adelante, tira por abajo del cuerpo hasta la cadera y vuelve por arriba del agua con el
      // codo doblado), el cuerpo rola hacia el brazo que tira, patada corta y rápida, y cada dos
      // brazadas gira la cabeza para respirar del lado del brazo que vuelve
      const ph = t % 1;
      const roll = Math.sin(ph * P);
      b.root.rotation.x = 1.42;
      // (la espalda y los hombros quedan a ras del agua)
      b.root.position.set(0, -0.19 - roll * 0.015, -0.92);
      for (const [ua, fa, side, off] of [
        [b.uaR, b.faR, -1, 0],
        [b.uaL, b.faL, 1, 0.5],
      ]) {
        const q = (ph + off) % 1;
        // ángulo del brazo: -pi adelante (entrada), 0 junto a la cadera, +pi otra vez adelante por arriba
        const a = -Math.PI + q * P;
        const rec = q > 0.5 ? Math.sin((q - 0.5) * 2 * Math.PI) : 0; // recobro (afuera del agua)
        ua.rotation.set(a, 0, side * (0.18 + rec * 0.35));
        fa.rotation.x = -0.15 - rec * 1.35 - (q < 0.5 ? Math.sin(q * 2 * Math.PI) * 0.45 : 0);
      }
      b.spine.rotation.y = roll * 0.32;
      b.chest.rotation.y = roll * 0.18;
      b.hips.rotation.y = -roll * 0.12;
      const breathe = Math.floor(t) % 2 === 1 ? Math.max(0, Math.sin(ph * P)) : 0;
      b.neck.rotation.x = -0.42;
      b.head.rotation.set(-0.12, breathe * 1.05, 0);
      const k = Math.sin(t * P * 3);
      b.thR.rotation.x = k * 0.3;
      b.thL.rotation.x = -k * 0.3;
      b.shR.rotation.x = 0.25 + Math.max(0, k) * 0.35;
      b.shL.rotation.x = 0.25 + Math.max(0, -k) * 0.35;
      b.ftR.rotation.x = b.ftL.rotation.x = 0.85;
      return;
    }
    // flotando en el lugar: parado en el agua con los hombros en la superficie, piernas en "batidora"
    // y las manos remando a los costados
    const p = t * P;
    const bob = Math.sin(p * 2) * 0.035;
    b.root.position.set(0, -1.38 + bob, 0);
    b.spine.rotation.x = 0.12;
    b.thR.rotation.set(-0.55 + Math.sin(p) * 0.3, 0, -0.22);
    b.thL.rotation.set(-0.55 - Math.sin(p) * 0.3, 0, 0.22);
    b.shR.rotation.x = 1.0 + Math.sin(p + 1.2) * 0.35;
    b.shL.rotation.x = 1.0 - Math.sin(p + 1.2) * 0.35;
    b.ftR.rotation.x = b.ftL.rotation.x = 0.35;
    const sc = Math.sin(p * 2);
    b.uaR.rotation.set(-0.35, sc * 0.45, -1.05);
    b.uaL.rotation.set(-0.35, -sc * 0.45, 1.05);
    b.faR.rotation.x = b.faL.rotation.x = -0.55;
    b.neck.rotation.x = -0.12;
    b.head.rotation.x = -0.05;
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
  if (pose === 'manejar') {
    // sentado al volante (el origen va arriba del almohadón): la cadera apenas arriba del asiento, el respaldo
    // un poco reclinado, las piernas hacia los pedales y las dos manos en el volante. t: cuánto dobla (-1 a 1)
    const st = Math.max(-1, Math.min(1, t || 0));
    b.hips.position.y = 0.1;
    b.spine.rotation.x = -0.16;
    b.chest.rotation.x = 0.06;
    b.thR.rotation.set(-1.32, 0, -0.05);
    b.thL.rotation.set(-1.38, 0, 0.08);
    b.shR.rotation.x = 1.05;
    b.shL.rotation.x = 1.25;
    b.ftR.rotation.x = -0.25;
    b.ftL.rotation.x = -0.15;
    // las manos giran con el volante: una sube y la otra baja
    b.uaR.rotation.set(-1.05 - st * 0.18, 0.25, 0.22 + st * 0.12);
    b.uaL.rotation.set(-1.05 + st * 0.18, -0.25, -0.22 + st * 0.12);
    b.faR.rotation.x = -0.75 + st * 0.15;
    b.faL.rotation.x = -0.75 - st * 0.15;
    b.head.rotation.set(0.04, st * 0.18, 0);
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
  // Caminata y carrera: la rodilla se dobla en el vuelo de la pierna (no cuando apoya), el pie
  // apoya el talón y despega con la punta, la cadera sube y baja dos veces por paso y gira con la
  // pierna que avanza, el pecho gira al revés, los brazos acompañan con el codo más doblado al
  // correr y la cabeza se queda mirando al frente.
  const run = smooth(2.6, 5, speed);
  const kneeA = Math.min(1.9, 0.3 + speed * 0.3);
  for (const [side, th, sh, ft, ua, fa] of [
    [1, b.thR, b.shR, b.ftR, b.uaR, b.faR],
    [-1, b.thL, b.shL, b.ftL, b.uaL, b.faL],
  ]) {
    const u = s * side; // > 0: la pierna va atrás
    const swing = Math.max(0, -c * side); // vuelo: la pierna viene para adelante
    th.rotation.x = u * amp - swing * run * 0.25;
    sh.rotation.x = 0.04 + swing * kneeA + Math.max(0, u) * amp * 0.35;
    // talón al apoyar (punta arriba) y punta al despegar
    ft.rotation.x = -Math.max(0, -u) * amp * 0.45 * (1 - swing) + Math.max(0, u) * amp * 0.5 - swing * kneeA * 0.3;
    ua.rotation.x = -u * amp * (0.75 - run * 0.32);
    ua.rotation.z = -side * (0.07 + amp * 0.05);
    fa.rotation.x = -0.18 - run * 1.15 - Math.max(0, -u) * amp * (0.45 + run * 0.3);
  }
  const bob = amp * (0.028 + run * 0.03);
  b.hips.position.y = 0.95 - bob * 0.5 + bob * c * c + run * 0.02 * Math.abs(c);
  b.hips.position.x = -s * amp * 0.018 * (1 - run);
  b.hips.rotation.y = -s * amp * (0.16 - run * 0.04);
  b.hips.rotation.z = c * amp * 0.035;
  b.chest.rotation.y = s * amp * (0.22 + run * 0.08);
  b.spine.rotation.x = 0.03 + run * 0.16 + amp * 0.04;
  b.head.rotation.y = -(b.hips.rotation.y + b.chest.rotation.y) * 0.85;
  b.head.rotation.x = -b.spine.rotation.x * 0.6 + Math.abs(c) * amp * 0.03;
  // caminando de costado (apuntando): la cadera y las piernas van para donde camina, el pecho no
  h.strafeHip = h.strafe && speed > 0.1 ? Math.max(-1.1, Math.min(1.1, h.strafe)) * 0.75 * Math.min(1, speed / 0.8) : 0;
  b.hips.rotation.y += h.strafeHip;
  // quieto: respira, pasa el peso de una pierna a la otra y mira alrededor. Se mezcla de a poco
  // con la caminata al frenar o arrancar (sin saltos de pose).
  const idleW = 1 - smooth(0.05, 0.9, speed);
  if (idleW > 0.001) {
    const t = h.phase;
    const sway = Math.sin(t * 0.35);
    const mix = (o, k, v) => (o[k] += (v - o[k]) * idleW);
    mix(b.chest.rotation, 'x', Math.sin(t * 1.6) * 0.018);
    mix(b.hips.position, 'x', sway * 0.018);
    mix(b.hips.rotation, 'z', -sway * 0.035);
    mix(b.spine.rotation, 'z', sway * 0.025);
    mix(b.shR.rotation, 'x', 0.05 + Math.max(0, -sway) * 0.12);
    mix(b.shL.rotation, 'x', 0.05 + Math.max(0, sway) * 0.12);
    mix(b.thR.rotation, 'x', -Math.max(0, -sway) * 0.06);
    mix(b.thL.rotation, 'x', -Math.max(0, sway) * 0.06);
    mix(b.faR.rotation, 'x', -0.14 + Math.sin(t * 0.5) * 0.03);
    mix(b.faL.rotation, 'x', -0.14 + Math.sin(t * 0.5 + 1) * 0.03);
    mix(b.head.rotation, 'y', Math.sin(t * 0.13) * 0.35 * smooth(0.3, 0.9, Math.abs(Math.sin(t * 0.07))));
    mix(b.head.rotation, 'x', Math.sin(t * 0.17) * 0.05);
  }

  if (COMBAT_POSES.has(pose)) {
    // pelea y armas: src/moves.js
    combatPose(h, b, pose, t, speed);
  } else if (pose === 'eat') {
    // comiendo un pancho: la mano va a la boca, mastica, vuelve
    const g = h.phase;
    const bite = Math.max(0, Math.sin(g * 1.2)) ** 3;
    b.uaR.rotation.set(-0.55 - 0.55 * bite, 0.45, 0.25 + 0.1 * bite);
    b.faR.rotation.x = -1.45 - 0.6 * bite;
    b.uaL.rotation.set(-0.25, -0.2, -0.12);
    b.faL.rotation.x = -0.9;
    b.head.rotation.set(-0.08 * bite + Math.sin(g * 6) * 0.02 * (1 - bite), Math.sin(g * 0.5) * 0.15, 0);
  } else if (pose === 'aura') {
    // "farmear aura" (el baile del nene del bote): cara seria, se balancea al ritmo, las rodillas marcan
    // el pulso y los brazos hacen ondas largas, uno y después el otro. t: reloj del ritmo en segundos
    const g = t * Math.PI * 2 * 0.95;
    const sway = Math.sin(g);
    const bob = Math.abs(Math.sin(g));
    b.hips.position.y -= 0.035 * bob;
    b.hips.position.x = sway * 0.03;
    b.hips.rotation.z = -sway * 0.07;
    b.hips.rotation.y = sway * 0.12;
    b.spine.rotation.z = sway * 0.05;
    b.chest.rotation.set(0.04, -sway * 0.16, sway * 0.06);
    b.thR.rotation.x = b.thL.rotation.x = -0.2 * bob;
    b.shR.rotation.x = b.shL.rotation.x = 0.4 * bob;
    b.ftR.rotation.x = b.ftL.rotation.x = -0.2 * bob;
    b.head.rotation.set(0.07 * bob - 0.04, sway * 0.18, -sway * 0.08);
    // qué brazo lleva la onda (cambia cada dos balanceos, mezclado)
    const k = Math.max(0, Math.min(1, 0.5 + 1.6 * Math.sin(g * 0.5)));
    const wr = k * k * (3 - 2 * k);
    const wave = (ua, fa, side, w) => {
      const s = Math.sin(g + (side > 0 ? 0 : Math.PI));
      const roll = Math.sin(g * 2);
      // activo: el brazo afuera a la altura del hombro, barre de adelante al costado y la muñeca ondula
      const ax = -0.7 - 0.4 * s;
      const az = side * (1.25 + 0.3 * s);
      const fx = -0.35 - 0.45 * (0.5 + 0.5 * roll);
      // quieto: colgando, apenas con el ritmo
      ua.rotation.set(ax * w + 0.08 * sway * (1 - w), 0.25 * side * w, az * w + side * 0.12 * (1 - w));
      fa.rotation.x = fx * w - 0.35 * (1 - w);
    };
    wave(b.uaR, b.faR, -1, wr);
    wave(b.uaL, b.faL, 1, 1 - wr);
  } else if (pose === 'clap') {
    // aplaudiendo al ritmo (la ronda alrededor del que baila). t: reloj en segundos
    const g = t * Math.PI * 2 * 1.9;
    const open = 0.5 + 0.5 * Math.cos(g);
    b.uaR.rotation.set(-1.0, -0.2, 0.32 - 0.5 * open);
    b.uaL.rotation.set(-1.0, 0.2, -0.32 + 0.5 * open);
    b.faR.rotation.x = b.faL.rotation.x = -1.0;
    b.chest.rotation.x = 0.03 * open;
    b.head.rotation.x = -0.05 + 0.05 * open;
  } else if (pose === 'talk') {
    // hablando: la mano derecha acompaña lo que dice, a veces las dos; cabeza y hombros se mueven
    const g = h.phase;
    const beat = 0.5 + 0.5 * Math.sin(g * 2.3);
    const both = Math.max(0, Math.sin(g * 0.6));
    b.uaR.rotation.set(-0.3 - 0.35 * beat, 0.3, 0.12 + 0.1 * beat);
    b.faR.rotation.x = -1.15 + Math.sin(g * 4.2) * 0.32;
    b.uaL.rotation.set(-0.12 - 0.4 * both, -0.25 * both, -0.08 - 0.08 * both);
    b.faL.rotation.x = -0.18 - 1.0 * both + Math.sin(g * 3.6 + 1) * 0.2 * both;
    b.chest.rotation.y = Math.sin(g * 0.9) * 0.08;
    b.head.rotation.set(Math.sin(g * 3.1) * 0.06, Math.sin(g * 0.8) * 0.12, Math.sin(g * 1.3) * 0.07);
  } else if (pose === 'listen') {
    // escuchando: el peso en una pierna, las manos juntas adelante o en los bolsillos, y asiente
    const g = h.phase;
    const nod = Math.max(0, Math.sin(g * 1.7)) ** 6;
    const pockets = Math.sin(h.phase * 0.05 + 2) > 0;
    if (pockets) {
      b.uaR.rotation.set(0.12, 0, -0.22);
      b.uaL.rotation.set(0.12, 0, 0.22);
      b.faR.rotation.x = -0.35;
      b.faL.rotation.x = -0.35;
    } else {
      b.uaR.rotation.set(-0.15, 0.35, 0.25);
      b.uaL.rotation.set(-0.15, -0.35, -0.25);
      b.faR.rotation.x = -0.95;
      b.faL.rotation.x = -0.95;
    }
    b.head.rotation.set(0.05 + nod * 0.18, Math.sin(g * 0.4) * 0.1, Math.sin(g * 0.5) * 0.05);
  } else if (pose === 'zombie') {
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
  } else if (pose === 'reload') {
    // recarga: el arma baja frente al pecho, la otra mano va y viene con el cargador, mira el arma
    const k = Math.sin(Math.min(1, t) * Math.PI);
    b.uaR.rotation.set(-0.75, 0, 0.2);
    b.faR.rotation.x = -1.05;
    b.uaL.rotation.set(-0.6 - 0.35 * k, 0, -0.35);
    b.faL.rotation.set(-1.2 + Math.sin(Math.min(1, t) * Math.PI * 3) * 0.35 * k, 0, 0);
    b.chest.rotation.y = 0.15;
    b.head.rotation.x = 0.4 * k;
    b.neck.rotation.x = 0.15 * k;
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
  } else if (pose === 'cradle') {
    // a upa: los dos brazos acunando (Martín con los mellizos), meciéndose de un pie al otro
    const rock = Math.sin(h.phase * 1.6);
    b.uaR.rotation.set(-0.62, 0, 0.42);
    b.uaL.rotation.set(-0.62, 0, -0.42);
    b.faR.rotation.x = b.faL.rotation.x = -1.75;
    b.chest.rotation.z = rock * 0.05;
    b.hips.position.x += rock * 0.02;
    b.head.rotation.set(0.38, rock * 0.15, 0);
  } else if (pose === 'cielo') {
    // mirando para arriba (el show de drones de src/drones.js): el cuello y la cabeza para atrás, el pecho
    // apenas, siguiendo la figura. h.cieloV dice qué hacen las manos: 0 juntas adelante, 1 señalando,
    // 2 filmando con el celu en alto, 3 en la cabeza (no lo pueden creer), 4 aplaudiendo, 5 colgando.
    // h.cieloK: cuánto levanta la cabeza (según lo lejos que está la figura). t: reloj en segundos
    const g = t;
    const up = h.cieloK ?? 1;
    b.spine.rotation.x = -0.05 * up;
    b.chest.rotation.x = -0.07 * up;
    b.neck.rotation.x = -0.3 * up;
    b.head.rotation.set(-0.38 * up + Math.sin(g * 0.5 + h.phase) * 0.03, Math.sin(g * 0.21 + h.phase) * 0.12, 0);
    const v = h.cieloV ?? 0;
    if (v === 0) {
      b.uaR.rotation.set(-0.15, 0.35, 0.25);
      b.uaL.rotation.set(-0.15, -0.35, -0.25);
      b.faR.rotation.x = b.faL.rotation.x = -0.95;
    } else if (v === 1) {
      // el brazo derecho estirado hacia la figura, el izquierdo colgando
      b.uaR.rotation.set(-2.35 + Math.sin(g * 0.7) * 0.06, 0, -0.12);
      b.faR.rotation.x = -0.12;
      b.uaL.rotation.set(0.05, 0, 0.1);
      b.faL.rotation.x = -0.2;
    } else if (v === 2) {
      b.uaR.rotation.set(-1.75, 0.1, 0.32);
      b.uaL.rotation.set(-1.75, -0.1, -0.32);
      b.faR.rotation.x = b.faL.rotation.x = -1.05;
    } else if (v === 3) {
      b.uaR.rotation.set(-2.5, 0, -0.55);
      b.uaL.rotation.set(-2.5, 0, 0.55);
      b.faR.rotation.x = b.faL.rotation.x = -1.95;
    } else if (v === 4) {
      const open = 0.5 + 0.5 * Math.cos(g * Math.PI * 2 * 1.8);
      b.uaR.rotation.set(-1.15, -0.2, 0.32 - 0.5 * open);
      b.uaL.rotation.set(-1.15, 0.2, -0.32 + 0.5 * open);
      b.faR.rotation.x = b.faL.rotation.x = -1.0;
    }
  } else if (pose === 'film') {
    // filmando con el celu: las dos manos adelante a la altura de la cara, siguiendo lo que pasa
    const g = t * 0.7;
    b.uaR.rotation.set(-0.95, 0.1, 0.42);
    b.uaL.rotation.set(-0.95, -0.1, -0.42);
    b.faR.rotation.x = b.faL.rotation.x = -1.45;
    b.chest.rotation.y = Math.sin(g) * 0.08;
    b.head.rotation.set(0.12, Math.sin(g) * 0.06, 0);
  } else if (pose === 'phone') {
    b.uaR.rotation.set(-0.35, 0, 0.35);
    b.faR.rotation.x = -2.3;
    b.head.rotation.set(0.1, 0, -0.15);
  }
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
