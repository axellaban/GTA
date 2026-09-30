// Texturas dibujadas con canvas: fachadas del conurbano, veredas, asfalto, banderas.
import * as THREE from 'three';
import { Rng } from './rng.js';

const FONT = '"Arial Black", Impact, "Helvetica Neue", Arial, sans-serif';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function noise(ctx, w, h, rng, amount, alpha = 0.08) {
  for (let i = 0; i < amount; i++) {
    const v = rng.int(0, 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(rng.range(0, w), rng.range(0, h), rng.range(1, 3), rng.range(1, 3));
  }
}

// ---------- Atlas de fachadas ----------
// Celdas de 512x128 (proporción de un piso de ~11 x 3 m). 4 columnas x 16 filas.
export const CELL_W = 512;
export const CELL_H = 128;
const COLS = 4;
const ROWS = 16;

export const PLASTER = ['#e6d6b0', '#d6c29c', '#c5d3cb', '#e1bd9b', '#efe4cf', '#b4c6d6', '#d6ae9f', '#ccd6a9', '#eddcbd', '#c4b39a', '#a9c2b0', '#e8c8c8'];

const PINTADAS = [
  ['TEMPERLEY', '#6ec3ea'],
  ['EL GASPI VUELVE', '#1f2a8a'],
  ['VOTÁ A GASPI', '#c62828'],
  ['NO AL TARIFAZO', '#222222'],
  ['CELESTE DE LA CUNA', '#2b8fc8'],
  ['TEMPERLEY ES PASIÓN', '#1f1f1f'],
  ['SE VENDE · DUEÑO DIRECTO', '#b71c1c'],
  ['BASTA DE MOTOCHORROS', '#222222'],
  ['PAN Y TRABAJO', '#b71c1c'],
  ['FLETES · MUDANZAS', '#0d47a1'],
];

export const ATLAS = {
  casa: [], // 0..19
  alto: [], // 20..25 piso superior de casa
  local: {}, // por nombre de local
  edificio: [], // pisos de edificio
  entrada: [],
  medianera: [],
  pintada: [],
  ladrillo: [],
};

// Segundo lienzo del mismo tamaño: qué se ilumina de noche (ventanas, vidrieras, carteles)
let EM = null;
const LIT = ['#e0b070', '#e8c890', '#d8c8a8', '#d89a50', '#8aa6d8'];

function uvRect(i) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const pad = 2 / (COLS * CELL_W);
  return {
    u0: col / COLS + pad,
    u1: (col + 1) / COLS - pad,
    v0: 1 - (row + 1) / ROWS + pad,
    v1: 1 - row / ROWS - pad,
  };
}

function drawReja(ctx, x, y, w, h, style) {
  ctx.strokeStyle = '#1c1c1c';
  ctx.lineWidth = 2.5;
  const n = Math.max(3, Math.round(w / 9));
  for (let i = 0; i <= n; i++) {
    const xx = x + (w * i) / n;
    ctx.beginPath();
    ctx.moveTo(xx, y);
    ctx.lineTo(xx, y + h);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.moveTo(x, y + h * 0.5);
  ctx.lineTo(x + w, y + h * 0.5);
  ctx.stroke();
  if (style === 1) {
    // rulos de herrería
    for (let i = 0; i < n; i += 2) {
      ctx.beginPath();
      ctx.arc(x + (w * (i + 1)) / n, y + h * 0.25, w / n / 2.2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (style === 2) {
    // puntas de lanza arriba
    ctx.fillStyle = '#1c1c1c';
    for (let i = 0; i <= n; i++) {
      const xx = x + (w * i) / n;
      ctx.beginPath();
      ctx.moveTo(xx - 3, y);
      ctx.lineTo(xx, y - 6);
      ctx.lineTo(xx + 3, y);
      ctx.fill();
    }
  }
}

function drawWindow(ctx, x, y, w, h, rng, reja = true) {
  ctx.fillStyle = '#e9e4da';
  ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#39505e');
  g.addColorStop(1, '#1d2830');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  let ph = 0;
  if (rng.chance(0.5)) {
    // persiana de madera baja
    ctx.fillStyle = rng.pick(['#7b5b3a', '#5d6b4a', '#8a8a8a', '#6b4a2e']);
    ph = h * rng.range(0.3, 1);
    ctx.fillRect(x, y, w, ph);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let yy = y + 4; yy < y + ph; yy += 5) {
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
    }
  }
  const style = rng.int(0, 2);
  if (reja) drawReja(ctx, x - 2, y - 2, w + 4, h + 4, style);
  if (EM && ph < h - 4 && rng.chance(0.42)) {
    EM.fillStyle = rng.pick(LIT);
    EM.fillRect(x, y + ph, w, h - ph);
    if (reja) drawReja(EM, x - 2, y - 2, w + 4, h + 4, style);
  }
}

function stains(ctx, x, y, w, h, rng) {
  const g = ctx.createLinearGradient(0, y + h * 0.6, 0, y + h);
  g.addColorStop(0, 'rgba(60,50,40,0)');
  g.addColorStop(1, 'rgba(60,50,40,0.28)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(40,35,30,${rng.range(0.03, 0.09)})`;
    const sx = x + rng.range(0, w);
    ctx.fillRect(sx, y, rng.range(3, 14), rng.range(h * 0.2, h * 0.7));
  }
  noise(ctx, w, h, rng, 700, 0.05);
}

function spray(ctx, text, color, x, y, size, rng) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rng.range(-0.08, 0.06));
  ctx.font = `${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.88;
  ctx.fillText(text, 0, 0);
  ctx.globalAlpha = 0.25;
  ctx.fillText(text, 1.5, 1.5);
  ctx.restore();
}

function drawCasa(ctx, x, y, rng) {
  const W = CELL_W;
  const H = CELL_H;
  ctx.fillStyle = rng.pick(PLASTER);
  ctx.fillRect(x, y, W, H);
  // zócalo
  ctx.fillStyle = rng.pick(['#8d8278', '#6f665e', '#9b8f7c', '#7a6a5a']);
  ctx.fillRect(x, y + H - 16, W, 16);
  const hasGarage = rng.chance(0.45);
  let cursor = x + rng.range(18, 60);
  const items = [];
  if (hasGarage) items.push('garage');
  items.push('door');
  items.push('window');
  if (rng.chance(0.6)) items.push('window');
  items.sort(() => rng.next() - 0.5);
  for (const it of items) {
    if (it === 'garage') {
      const w = 130;
      ctx.fillStyle = rng.pick(['#3f4a52', '#5c4636', '#2f4f3a', '#6b6b6b', '#7a2a24']);
      ctx.fillRect(cursor, y + 22, w, H - 38);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      for (let yy = y + 26; yy < y + H - 18; yy += 7) {
        ctx.beginPath();
        ctx.moveTo(cursor, yy);
        ctx.lineTo(cursor + w, yy);
        ctx.stroke();
      }
      if (rng.chance(0.5)) {
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(cursor + 20, y + 50, 90, 22);
        ctx.fillStyle = '#b71c1c';
        ctx.font = `13px ${FONT}`;
        ctx.fillText('NO ESTACIONAR', cursor + 24, y + 66);
      }
      cursor += w + rng.range(14, 30);
    } else if (it === 'door') {
      const w = 50;
      ctx.fillStyle = rng.pick(['#4a3526', '#2e3b2e', '#3a3f45', '#6d4c33', '#1e2a38']);
      ctx.fillRect(cursor, y + 26, w, H - 42);
      ctx.fillStyle = '#29343b';
      ctx.fillRect(cursor + 12, y + 34, w - 24, 26);
      drawReja(ctx, cursor + 10, y + 32, w - 20, 30, 0);
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(cursor + w - 10, y + 70, 5, 5);
      // número
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cursor + w + 6, y + 36, 34, 14);
      ctx.fillStyle = '#123';
      ctx.font = `11px ${FONT}`;
      ctx.fillText(String(rng.int(100, 2999)), cursor + w + 8, y + 47);
      cursor += w + rng.range(40, 60);
    } else {
      const w = rng.range(58, 90);
      drawWindow(ctx, cursor, y + 30, w, 50, rng, rng.chance(0.92));
      cursor += w + rng.range(22, 40);
    }
    if (cursor > x + W - 60) break;
  }
  // medidor de luz y cables
  ctx.fillStyle = '#9ea4a8';
  ctx.fillRect(x + W - 40, y + 40, 18, 24);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + W - 31, y + 40);
  ctx.lineTo(x + W - 31, y);
  ctx.stroke();
  stains(ctx, x, y, W, H, rng);
  if (rng.chance(0.3)) {
    const [t, c] = rng.pick(PINTADAS);
    spray(ctx, t, c, x + rng.range(10, 200), y + rng.range(20, 40), rng.int(16, 22), rng);
  }
}

function drawAlto(ctx, x, y, rng) {
  const W = CELL_W;
  const H = CELL_H;
  ctx.fillStyle = rng.pick(PLASTER);
  ctx.fillRect(x, y, W, H);
  const n = rng.int(1, 3);
  for (let i = 0; i < n; i++) {
    const wx = x + 40 + (i * (W - 80)) / n + rng.range(0, 20);
    drawWindow(ctx, wx, y + 26, 80, 60, rng, rng.chance(0.6));
    if (rng.chance(0.5)) {
      ctx.fillStyle = '#cfcfcf';
      ctx.fillRect(wx - 8, y + 88, 96, 5);
      drawReja(ctx, wx - 8, y + 62, 96, 26, 2);
    }
  }
  if (rng.chance(0.4)) {
    // aire acondicionado
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(x + W - 90, y + 30, 50, 30);
    ctx.fillStyle = '#9e9e9e';
    ctx.beginPath();
    ctx.arc(x + W - 65, y + 45, 11, 0, Math.PI * 2);
    ctx.fill();
  }
  // parapeto de terraza
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x, y, W, 8);
  stains(ctx, x, y, W, H, rng);
}

const SIGN_COLORS = ['#c62828', '#1565c0', '#2e7d32', '#f9a825', '#6a1b9a', '#ef6c00', '#00838f', '#ad1457', '#37474f'];

function drawLocal(ctx, x, y, rng, name) {
  const W = CELL_W;
  const H = CELL_H;
  ctx.fillStyle = rng.pick(PLASTER);
  ctx.fillRect(x, y, W, H);
  // cartel
  const sc = rng.pick(SIGN_COLORS);
  ctx.fillStyle = sc;
  ctx.fillRect(x + 8, y + 4, W - 16, 30);
  ctx.fillStyle = sc === '#f9a825' ? '#1a1a1a' : '#ffffff';
  ctx.font = `22px ${FONT}`;
  const tw = ctx.measureText(name).width;
  ctx.fillText(name, x + (W - tw) / 2, y + 28);
  // vidriera y persiana
  const vx = x + 20;
  const vw = W - 40;
  ctx.fillStyle = '#26323a';
  ctx.fillRect(vx, y + 42, vw, H - 52);
  // góndolas con colores
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = rng.pick(['#e53935', '#fdd835', '#43a047', '#1e88e5', '#fb8c00', '#ffffff', '#8e24aa']);
    ctx.fillRect(vx + rng.range(4, vw - 14), y + rng.range(60, H - 20), rng.range(5, 12), rng.range(6, 12));
  }
  const up = rng.range(0.25, 0.75);
  if (EM) {
    EM.fillStyle = sc;
    EM.fillRect(x + 8, y + 4, W - 16, 30);
    EM.fillStyle = '#a8864f';
    EM.fillRect(vx, y + 42 + (H - 52) * up, vw, (H - 52) * (1 - up));
  }
  ctx.fillStyle = '#8f969b';
  ctx.fillRect(vx, y + 42, vw, (H - 52) * up);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  for (let yy = y + 45; yy < y + 42 + (H - 52) * up; yy += 5) {
    ctx.beginPath();
    ctx.moveTo(vx, yy);
    ctx.lineTo(vx + vw, yy);
    ctx.stroke();
  }
  if (rng.chance(0.5)) {
    ctx.fillStyle = '#ffeb3b';
    ctx.fillRect(vx + 10, y + 70, 70, 18);
    ctx.fillStyle = '#b71c1c';
    ctx.font = `12px ${FONT}`;
    ctx.fillText(rng.pick(['OFERTA', 'ABIERTO', '2x1', 'FIADO NO']), vx + 14, y + 84);
  }
  stains(ctx, x, y, W, H, rng);
}

function drawEdificio(ctx, x, y, rng) {
  const W = CELL_W;
  const H = CELL_H;
  ctx.fillStyle = rng.pick(['#b8b2a7', '#a39b8e', '#c9c1b3', '#9aa4a8', '#b59a86', '#d0c6b0']);
  ctx.fillRect(x, y, W, H);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const wx = x + 18 + i * (W / n);
    drawWindow(ctx, wx, y + 22, 90, 70, rng, rng.chance(0.25));
    ctx.fillStyle = 'rgba(40,40,40,0.8)';
    ctx.fillRect(wx - 6, y + 92, 102, 4);
    drawReja(ctx, wx - 6, y + 70, 102, 22, 0);
    if (rng.chance(0.35)) {
      ctx.fillStyle = '#ececec';
      ctx.fillRect(wx + 60, y + 40, 34, 22);
    }
    if (rng.chance(0.15)) {
      // ropa colgada
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = rng.pick(['#e53935', '#1e88e5', '#fdd835', '#ffffff', '#43a047']);
        ctx.fillRect(wx + k * 20, y + 74, 12, 16);
      }
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(x, y + H - 6, W, 6);
  noise(ctx, W, H, rng, 400, 0.05);
}

function drawEntrada(ctx, x, y, rng) {
  drawEdificio(ctx, x, y, rng);
  ctx.fillStyle = '#20262b';
  ctx.fillRect(x + 190, y + 20, 130, CELL_H - 30);
  drawReja(ctx, x + 190, y + 20, 130, CELL_H - 30, 1);
  if (EM) {
    EM.fillStyle = '#c8a870';
    EM.fillRect(x + 190, y + 20, 130, CELL_H - 30);
    drawReja(EM, x + 190, y + 20, 130, CELL_H - 30, 1);
  }
  ctx.fillStyle = '#d4af37';
  ctx.font = `14px ${FONT}`;
  ctx.fillText(String(rng.int(1000, 2900)), x + 235, y + 16);
}

function drawMedianera(ctx, x, y, rng, pintada) {
  const W = CELL_W;
  const H = CELL_H;
  ctx.fillStyle = rng.pick(['#cfc6b6', '#bdb4a5', '#d8d0c2', '#b9ae9b', '#c8c0b4']);
  ctx.fillRect(x, y, W, H);
  // revoque saltado (poco, para que no parezca empapelado)
  const holes = rng.int(0, 2);
  for (let i = 0; i < holes; i++) {
    const px = x + rng.range(0, W - 60);
    const py = y + rng.range(0, H - 30);
    const pw = rng.range(20, 60);
    const ph = rng.range(10, 30);
    ctx.fillStyle = 'rgba(160,82,58,0.75)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    for (let yy = py + 5; yy < py + ph; yy += 6) {
      ctx.beginPath();
      ctx.moveTo(px, yy);
      ctx.lineTo(px + pw, yy);
      ctx.stroke();
    }
  }
  stains(ctx, x, y, W, H, rng);
  if (pintada) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x + 10, y + 16, W - 20, H - 32);
    const [t, c] = pintada;
    ctx.font = `34px ${FONT}`;
    ctx.fillStyle = c;
    const tw = Math.min(ctx.measureText(t).width, W - 40);
    ctx.fillText(t, x + (W - tw) / 2, y + H / 2 + 12, W - 40);
  }
}

function drawLadrillo(ctx, x, y, rng) {
  const W = CELL_W;
  const H = CELL_H;
  ctx.fillStyle = '#9c9489';
  ctx.fillRect(x, y, W, H);
  const bw = 34;
  const bh = 17;
  for (let r = 0; r * bh < H; r++) {
    for (let c = -1; c * bw < W; c++) {
      const off = r % 2 ? bw / 2 : 0;
      ctx.fillStyle = rng.pick(['#b8583a', '#a94f33', '#c2653f', '#9d4a31']);
      ctx.fillRect(x + c * bw + off + 1, y + r * bh + 1, bw - 3, bh - 3);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + c * bw + off + 8, y + r * bh + 5, 6, 6);
      ctx.fillRect(x + c * bw + off + 20, y + r * bh + 5, 6, 6);
    }
  }
}

export function buildAtlas(shopNames) {
  const c = canvas(CELL_W * COLS, CELL_H * ROWS);
  const ctx = c.getContext('2d');
  const ec = canvas(CELL_W * COLS, CELL_H * ROWS);
  EM = ec.getContext('2d');
  EM.fillStyle = '#000000';
  EM.fillRect(0, 0, ec.width, ec.height);
  const rng = new Rng(77);
  let i = 0;
  const at = (fn) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    fn(col * CELL_W, row * CELL_H);
    return uvRect(i++);
  };
  for (let k = 0; k < 18; k++) ATLAS.casa.push(at((x, y) => drawCasa(ctx, x, y, rng)));
  for (let k = 0; k < 6; k++) ATLAS.alto.push(at((x, y) => drawAlto(ctx, x, y, rng)));
  for (const name of shopNames) ATLAS.local[name] = at((x, y) => drawLocal(ctx, x, y, rng, name));
  for (let k = 0; k < 5; k++) ATLAS.edificio.push(at((x, y) => drawEdificio(ctx, x, y, rng)));
  for (let k = 0; k < 2; k++) ATLAS.entrada.push(at((x, y) => drawEntrada(ctx, x, y, rng)));
  for (let k = 0; k < 5; k++) ATLAS.medianera.push(at((x, y) => drawMedianera(ctx, x, y, rng, null)));
  for (let k = 0; k < 5; k++) ATLAS.pintada.push(at((x, y) => drawMedianera(ctx, x, y, rng, PINTADAS[k * 2 % PINTADAS.length])));
  ATLAS.ladrillo.push(at((x, y) => drawLadrillo(ctx, x, y, rng)));
  if (i > COLS * ROWS) console.warn('Atlas lleno', i);
  const t = tex(c);
  t.generateMipmaps = true;
  const e = tex(ec);
  EM = null;
  return { map: t, emissive: e };
}

// Toldos a rayas de los locales: 4 combinaciones en filas
export function awningTexture() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  const combos = [
    ['#c62828', '#f5f5f5'],
    ['#2e7d32', '#f5f5f5'],
    ['#1565c0', '#f5f5f5'],
    ['#ef6c00', '#fff3e0'],
  ];
  combos.forEach(([a, b], row) => {
    for (let x = 0; x < 256; x += 32) {
      g.fillStyle = a;
      g.fillRect(x, row * 64, 16, 64);
      g.fillStyle = b;
      g.fillRect(x + 16, row * 64, 16, 64);
    }
    // borde festoneado
    g.fillStyle = a;
    for (let x = 0; x < 256; x += 16) {
      g.beginPath();
      g.arc(x + 8, row * 64 + 58, 8, 0, Math.PI);
      g.fill();
    }
  });
  return tex(c);
}

// Follaje: hojas sobre fondo transparente (para planos cruzados con alphaTest)
export function leafTexture() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  const rng = new Rng(404);
  for (let i = 0; i < 900; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.pow(rng.next(), 0.6) * 118;
    const x = 128 + Math.cos(a) * r;
    const y = 128 + Math.sin(a) * r * 0.9;
    const light = 1 - (x + y) / 512; // más claro arriba a la izquierda
    const gch = Math.round(90 + light * 80 + rng.range(-15, 15));
    g.fillStyle = `rgb(${Math.round(gch * 0.55)},${gch},${Math.round(gch * 0.35)})`;
    g.save();
    g.translate(x, y);
    g.rotate(rng.range(0, Math.PI));
    g.beginPath();
    g.ellipse(0, 0, rng.range(4, 8), rng.range(2, 4), 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const t = tex(c);
  return t;
}

export function brickTexture() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  const rng = new Rng(88);
  g.fillStyle = '#c9b8a0';
  g.fillRect(0, 0, 256, 256);
  const bw = 32;
  const bh = 12;
  for (let r = 0; r * bh < 256; r++) {
    for (let k = -1; k * bw < 256; k++) {
      const off = r % 2 ? bw / 2 : 0;
      g.fillStyle = rng.pick(['#a3563b', '#9b4d34', '#ad5e40', '#94472f', '#b0644a']);
      g.fillRect(k * bw + off + 1, r * bh + 1, bw - 2, bh - 2);
    }
  }
  noise(g, 256, 256, rng, 2500, 0.07);
  return tex(c, true);
}

// ---------- Texturas repetibles ----------
export function asphaltTexture() {
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  const rng = new Rng(3);
  ctx.fillStyle = '#4a4b4d';
  ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 256, rng, 5000, 0.12);
  // parches y grietas
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(20,20,22,${rng.range(0.15, 0.35)})`;
    ctx.beginPath();
    ctx.ellipse(rng.range(0, 256), rng.range(0, 256), rng.range(8, 30), rng.range(5, 20), rng.range(0, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(15,15,15,0.5)';
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    let x = rng.range(0, 256);
    let y = rng.range(0, 256);
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += rng.range(-14, 14);
      y += rng.range(-14, 14);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const t = tex(c, true);
  return t;
}

export function sidewalkTexture() {
  const c = canvas(128, 128);
  const ctx = c.getContext('2d');
  const rng = new Rng(9);
  ctx.fillStyle = '#b9b3a6';
  ctx.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 32) {
    for (let y = 0; y < 128; y += 32) {
      ctx.fillStyle = rng.chance(0.15) ? '#9f978a' : rng.chance(0.5) ? '#c3bdb0' : '#b3ad9f';
      ctx.fillRect(x + 1, y + 1, 30, 30);
      // vainillas
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (let k = 0; k < 4; k++) ctx.fillRect(x + 4 + k * 7, y + 4, 4, 24);
    }
  }
  noise(ctx, 128, 128, rng, 600, 0.08);
  return tex(c, true);
}

export function groundTexture(base = '#6f7a4c') {
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  const rng = new Rng(11);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = rng.pick(['#5c6a3b', '#7c8752', '#86794f', '#65703f', '#8b8a5a']);
    ctx.fillRect(rng.range(0, 256), rng.range(0, 256), rng.range(1, 4), rng.range(1, 4));
  }
  return tex(c, true);
}

export function ballastTexture() {
  const c = canvas(128, 128);
  const ctx = c.getContext('2d');
  const rng = new Rng(21);
  ctx.fillStyle = '#6d655c';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = rng.pick(['#5a524a', '#7d756a', '#8a8177', '#4e4740', '#6b5b4b']);
    ctx.fillRect(rng.range(0, 128), rng.range(0, 128), rng.range(1, 4), rng.range(1, 3));
  }
  return tex(c, true);
}

// Corbata a rayas rojas y blancas de Gaspi.
export function tieTexture() {
  const c = canvas(64, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#d0202f';
  ctx.lineWidth = 7;
  for (let i = -64; i < 128; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 64, 64);
    ctx.stroke();
  }
  const t = tex(c, true);
  t.repeat.set(1, 2);
  return t;
}

export function textTexture(text, { w = 512, h = 128, bg = '#ffffff', fg = '#111111', font = 56, border = null, italic = false } = {}) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, w - 8, h - 8);
  }
  ctx.fillStyle = fg;
  ctx.font = `${italic ? 'italic ' : ''}${font}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const lines = String(text).split('\n');
  lines.forEach((ln, i) => ctx.fillText(ln, w / 2, h / 2 + (i - (lines.length - 1) / 2) * font * 1.05, w - 24));
  return tex(c);
}

// Pasacalles de protesta, pintados a mano sobre tela.
export function bannerTexture(text, rng) {
  const c = canvas(512, 128);
  const ctx = c.getContext('2d');
  const bg = rng.pick(['#f5f1e6', '#fff8e1', '#e3f2fd', '#fbe9e7']);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.moveTo(rng.range(0, 512), 0);
    ctx.lineTo(rng.range(0, 512), 128);
    ctx.stroke();
  }
  ctx.fillStyle = rng.pick(['#c62828', '#1a237e', '#1b5e20', '#111111']);
  ctx.font = `46px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66, 490);
  return tex(c);
}

export function trainSideTexture(kind) {
  const c = canvas(512, 128);
  const ctx = c.getContext('2d');
  if (kind === 'diesel') {
    ctx.fillStyle = '#d9d4c7';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#e0712c';
    ctx.fillRect(0, 84, 512, 22);
  } else {
    ctx.fillStyle = '#eef1f3';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#1b4f9c';
    ctx.fillRect(0, 88, 512, 10);
    ctx.fillStyle = '#6ec3ea';
    ctx.fillRect(0, 100, 512, 6);
  }
  // ventanas
  for (let x = 40; x < 480; x += 66) {
    ctx.fillStyle = '#1e2b36';
    ctx.fillRect(x, 26, 48, 40);
  }
  // puertas
  ctx.fillStyle = '#9aa4ab';
  ctx.fillRect(10, 20, 22, 90);
  ctx.fillRect(480, 20, 22, 90);
  ctx.fillStyle = '#1e2b36';
  ctx.fillRect(14, 28, 14, 36);
  ctx.fillRect(484, 28, 14, 36);
  // grafiti ocasional
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = '#7b1fa2';
  ctx.font = `28px ${FONT}`;
  ctx.fillText('ROCA', 200, 118);
  ctx.restore();
  return tex(c);
}

export function busTexture(line) {
  const c = canvas(512, 128);
  const ctx = c.getContext('2d');
  const colors = [
    ['#f4d03f', '#c0392b'],
    ['#2e86c1', '#f7f9f9'],
    ['#27ae60', '#f4d03f'],
  ];
  const [a, b] = colors[line % colors.length];
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = b;
  ctx.fillRect(0, 80, 512, 14);
  // filete porteño simple
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x < 512; x += 40) {
    ctx.moveTo(x, 104);
    ctx.quadraticCurveTo(x + 10, 96, x + 20, 104);
    ctx.quadraticCurveTo(x + 30, 112, x + 40, 104);
  }
  ctx.stroke();
  for (let x = 30; x < 470; x += 58) {
    ctx.fillStyle = '#1b2631';
    ctx.fillRect(x, 18, 46, 46);
  }
  ctx.fillStyle = '#111';
  ctx.font = `30px ${FONT}`;
  ctx.fillText(String(line), 440, 120);
  return tex(c);
}
