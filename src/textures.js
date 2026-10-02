// Texturas dibujadas con canvas: fachadas del conurbano, veredas, asfalto, banderas.
import * as THREE from 'three';
import { Rng } from './rng.js';
import { paintFacadeDepth } from './facade-depth.js';

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

function noise(ctx, w, h, rng, amount, alpha = 0.08, ox = 0, oy = 0) {
  for (let i = 0; i < amount; i++) {
    const v = rng.int(0, 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(ox + rng.range(0, w), oy + rng.range(0, h), rng.range(1, 3), rng.range(1, 3));
  }
}

// ---------- Atlas de fachadas ----------
// Celdas de 512x128 (proporción de un piso de ~11 x 3 m). 4 columnas x 16 filas.
export const CELL_W = 512;
export const CELL_H = 128;
const COLS = 4;
const ROWS = 16;

// revoques del barrio más algunos pasteles a lo Vice City (rosa, agua, amarillo, lavanda, celeste, durazno)
export const PLASTER = ['#e6d6b0', '#d6c29c', '#c5d3cb', '#e1bd9b', '#efe4cf', '#b4c6d6', '#d6ae9f', '#ccd6a9', '#eddcbd', '#c4b39a', '#a9c2b0', '#e8c8c8', '#f2b8c6', '#a8e0d8', '#f7e1a8', '#c9b8e8', '#9fd3e6', '#f6c7a5'];

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
  local: [], // vidrieras genéricas
  estacion: [],
  estadio: [],
  galpon: [],
  escuela: [],
  edificio: [], // pisos de edificio
  entrada: [],
  medianera: [],
  pintada: [],
  ladrillo: [],
};

// Segundo lienzo del mismo tamaño: qué se ilumina de noche (ventanas, vidrieras, carteles)
let EM = null;
// Tercer lienzo: aspereza (verde) y metal (azul). El vidrio es liso y refleja el cielo.
let OR = null;
const SURF = { wall: 'rgb(255,236,0)', glass: 'rgb(255,14,0)', metal: 'rgb(255,110,170)', paint: 'rgb(255,175,0)', iron: 'rgb(255,120,90)' };
function surf(kind, x, y, w, h) {
  if (!OR) return;
  OR.fillStyle = SURF[kind];
  OR.fillRect(x, y, w, h);
}
// Aberturas dibujadas en la celda actual (para ponerles marcos 3D en la pared)
let CUR = null;
function record(kind, x, y, w, h) {
  if (!CUR) return;
  CUR.list.push({ kind, x0: (x - CUR.ox) / CELL_W, x1: (x + w - CUR.ox) / CELL_W, y0: (y - CUR.oy) / CELL_H, y1: (y + h - CUR.oy) / CELL_H });
}
// Ladrillo a la vista: se guarda cómo quedó dibujado y, al terminar la celda, lo que siga igual
// (lo que no tapó una ventana, una pintada o un cartel) se marca en el canal rojo del mapa de
// aspereza (0 = ladrillo); el hueco además baja un poco la aspereza (verde 226 en vez de 236).
// Ahí el juego pone la foto (src/facade-photo.js).
function markBrick(ctx, x, y, w, h, kind) {
  if (!CUR || !OR) return;
  const x0 = Math.max(Math.round(x), CUR.ox);
  const y0 = Math.max(Math.round(y), CUR.oy);
  const x1 = Math.min(Math.round(x + w), CUR.ox + CELL_W);
  const y1 = Math.min(Math.round(y + h), CUR.oy + CELL_H);
  if (x1 <= x0 || y1 <= y0) return;
  (CUR.bricks ??= []).push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, kind, snap: ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data });
}
function applyBrickMarks(ctx) {
  for (const b of CUR?.bricks || []) {
    const now = ctx.getImageData(b.x, b.y, b.w, b.h).data;
    const img = OR.getImageData(b.x, b.y, b.w, b.h);
    const o = img.data;
    const hueco = b.kind === 'hueco';
    for (let i = 0; i < now.length; i += 4) {
      const d = Math.max(Math.abs(now[i] - b.snap[i]), Math.abs(now[i + 1] - b.snap[i + 1]), Math.abs(now[i + 2] - b.snap[i + 2]));
      // manchas y humedad suaves siguen siendo ladrillo; lo pintado encima, no
      if (d > 40 || o[i + 1] < 200) continue;
      o[i] = 0;
      if (hueco) o[i + 1] = 226;
    }
    OR.putImageData(img, b.x, b.y);
  }
}

// ¿El rectángulo pisa alguna abertura ya dibujada en la celda?
function overlapsOpening(x, y, w, h) {
  if (!CUR) return false;
  const x0 = (x - CUR.ox) / CELL_W;
  const x1 = (x + w - CUR.ox) / CELL_W;
  const y0 = (y - CUR.oy) / CELL_H;
  const y1 = (y + h - CUR.oy) / CELL_H;
  return CUR.list.some((o) => x0 < o.x1 + 0.02 && x1 > o.x0 - 0.02 && y0 < o.y1 + 0.05 && y1 > o.y0 - 0.05);
}

// Pared de ladrillos: "visto" (el de las casas prolijas) u "hueco" (la casa sin revocar, con columnas y viga de hormigón)
function brickWall(ctx, x, y, w, h, rng, type, mark = true) {
  const out = paintBricks(ctx, x, y, w, h, rng, type);
  if (mark) markBrick(ctx, x, y, w, h, type);
  return out;
}
function paintBricks(ctx, x, y, w, h, rng, type) {
  if (type === 'hueco') {
    ctx.fillStyle = '#9d948a';
    ctx.fillRect(x, y, w, h);
    const bw = 17;
    const bh = 9;
    for (let r = 0; r * bh < h; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let k = -1; k * bw < w; k++) {
        const v = rng.range(-14, 14);
        ctx.fillStyle = `rgb(${196 + v},${104 + v * 0.6},${62 + v * 0.4})`;
        ctx.fillRect(x + k * bw + off + 1, y + r * bh + 1, bw - 2, bh - 2);
        // los agujeritos del ladrillo hueco en las puntas rotas
        if (rng.chance(0.06)) {
          ctx.fillStyle = 'rgba(60,30,20,0.55)';
          ctx.fillRect(x + k * bw + off + 4, y + r * bh + 3, 3, 3);
          ctx.fillRect(x + k * bw + off + 9, y + r * bh + 3, 3, 3);
        }
      }
    }
    // mezcla chorreada
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(150,145,138,${rng.range(0.3, 0.7)})`;
      ctx.fillRect(x + rng.range(0, w), y + rng.range(0, h), rng.range(2, 8), rng.range(1, 3));
    }
    // columnas y viga de encadenado
    ctx.fillStyle = '#a7a39c';
    ctx.fillRect(x, y, 12, h);
    ctx.fillRect(x + w - 12, y, 12, h);
    ctx.fillRect(x, y, w, 9);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(x + 12, y, 2, h);
    ctx.fillRect(x + w - 14, y, 2, h);
    return '#b86a45';
  }
  ctx.fillStyle = '#c9bca6';
  ctx.fillRect(x, y, w, h);
  const bw = 13;
  const bh = 4;
  const tone = rng.pick([
    [168, 82, 52],
    [182, 96, 60],
    [150, 70, 48],
    [190, 118, 78],
  ]);
  for (let r = 0; r * bh < h; r++) {
    const off = r % 2 ? bw / 2 : 0;
    for (let k = -1; k * bw < w; k++) {
      const v = rng.range(-16, 16);
      ctx.fillStyle = `rgb(${tone[0] + v},${tone[1] + v * 0.7},${tone[2] + v * 0.5})`;
      ctx.fillRect(x + k * bw + off + 0.5, y + r * bh + 0.5, bw - 1.2, bh - 1);
    }
  }
  return `rgb(${tone[0]},${tone[1]},${tone[2]})`;
}

// Revoque caído: manchones que dejan ver el ladrillo (evitando puertas y ventanas)
function peel(ctx, x, y, w, h, rng, count) {
  for (let i = 0; i < count; i++) {
    const pw = rng.range(22, 70);
    const ph = rng.range(12, 34);
    let px = 0;
    let py = 0;
    let ok = false;
    for (let t = 0; t < 8 && !ok; t++) {
      px = x + rng.range(4, w - pw - 4);
      py = y + rng.range(4, h - ph - 20);
      ok = !overlapsOpening(px, py, pw, ph);
    }
    if (!ok) continue;
    ctx.save();
    ctx.beginPath();
    const n = 9;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const rx = (pw / 2) * rng.range(0.65, 1);
      const ry = (ph / 2) * rng.range(0.65, 1);
      const px2 = px + pw / 2 + Math.cos(a) * rx;
      const py2 = py + ph / 2 + Math.sin(a) * ry;
      if (k === 0) ctx.moveTo(px2, py2);
      else ctx.lineTo(px2, py2);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(70,55,45,0.35)';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.stroke();
    ctx.clip();
    // (los parches chicos quedan dibujados: la foto no se recorta con la forma del revoque caído)
    brickWall(ctx, px - 6, py - 6, pw + 12, ph + 12, rng, 'visto', false);
    ctx.fillStyle = 'rgba(40,30,25,0.2)';
    ctx.fillRect(px - 6, py - 6, pw + 12, ph + 12);
    ctx.restore();
  }
}

// Humedad que sube desde la vereda, con borde irregular
function damp(ctx, x, y, w, h, rng) {
  for (let k = 0; k < w; k += 4) {
    const hh = 14 + Math.abs(Math.sin(k * 0.031 + rng.next() * 0.4) * 16) + rng.range(0, 5);
    const g = ctx.createLinearGradient(0, y + h - hh, 0, y + h);
    g.addColorStop(0, 'rgba(45,48,32,0)');
    g.addColorStop(1, 'rgba(45,48,32,0.3)');
    ctx.fillStyle = g;
    ctx.fillRect(x + k, y + h - hh, 4, hh);
  }
}

// Rajaduras finitas que salen de las esquinas de las ventanas
function crack(ctx, x, y, len, rng) {
  ctx.strokeStyle = 'rgba(40,32,26,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  let cx = x;
  let cy = y;
  const dir = rng.chance(0.5) ? 1 : -1;
  for (let i = 0; i < 5; i++) {
    cx += dir * rng.range(1, 6);
    cy += len / 5 + rng.range(-2, 2);
    ctx.lineTo(cx, cy);
  }
  ctx.stroke();
}
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

function drawReja(ctx, x, y, w, h, style, color = '#1c1c1c') {
  if (ctx === ACTX && OR) drawReja(OR, x, y, w, h, style, SURF.iron);
  ctx.strokeStyle = color;
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
    ctx.fillStyle = color;
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

const FRAMES = ['#e9e4da', '#d8d4cc', '#8a7a66', '#5a4636', '#b8bcc0'];
function drawWindow(ctx, x, y, w, h, rng, reja = true) {
  record('window', x, y, w, h);
  const frame = rng.pick(FRAMES);
  ctx.fillStyle = frame;
  ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  // vidrio oscuro con el cielo reflejado en diagonal
  const g = ctx.createLinearGradient(x, y, x + w * 0.5, y + h);
  g.addColorStop(0, '#4a6270');
  g.addColorStop(0.45, '#27363f');
  g.addColorStop(1, '#141b20');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = 'rgba(205,228,240,0.13)';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.2, y);
  ctx.lineTo(x + w * 0.5, y);
  ctx.lineTo(x + w * 0.1, y + h);
  ctx.lineTo(x - w * 0.2, y + h);
  ctx.fill();
  // cortinas
  if (rng.chance(0.5)) {
    const cc = rng.pick(['rgba(222,205,170,0.85)', 'rgba(190,170,210,0.8)', 'rgba(205,220,230,0.8)', 'rgba(228,190,170,0.85)', 'rgba(240,236,224,0.85)']);
    const both = rng.chance(0.5);
    for (const side of both ? [0, 1] : [rng.int(0, 1)]) {
      const cw = w * rng.range(0.22, 0.4);
      const cx = side ? x + w - cw : x;
      ctx.fillStyle = cc;
      ctx.fillRect(cx, y, cw, h);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let k = cx + 3; k < cx + cw; k += 6) ctx.fillRect(k, y, 2, h);
    }
  }
  ctx.restore();
  // hoja doble
  ctx.fillStyle = frame;
  ctx.fillRect(x + w / 2 - 1.5, y, 3, h);
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
  surf('paint', x - 3, y - 3, w + 6, h + 6);
  surf('glass', x, y + ph, w, h - ph);
  if (ctx === ACTX && rng.chance(0.3)) crack(ctx, rng.chance(0.5) ? x - 3 : x + w + 3, y + h + 3, rng.range(10, 26), rng);
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
  noise(ctx, w, h, rng, 700, 0.05, x, y);
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

function drawCasa(ctx, x, y, rng, finish = 'revoque') {
  const W = CELL_W;
  const H = CELL_H;
  if (finish === 'revoque') {
    const base = rng.pick(PLASTER);
    ctx.fillStyle = base;
    ctx.fillRect(x, y, W, H);
    if (CUR) CUR.base = base;
  } else {
    const base = brickWall(ctx, x, y, W, H, rng, finish);
    if (CUR) CUR.base = finish === 'hueco' ? '#a7a39c' : base;
  }
  // zócalo (la casa sin revocar no tiene)
  if (finish !== 'hueco') {
    ctx.fillStyle = rng.pick(['#8d8278', '#6f665e', '#9b8f7c', '#7a6a5a']);
    ctx.fillRect(x, y + H - 16, W, 16);
    surf('paint', x, y + H - 16, W, 16);
  }
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
      record('garage', cursor, y + 22, w, H - 38);
      surf('metal', cursor, y + 22, w, H - 38);
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
      record('door', cursor, y + 26, w, H - 42);
      surf('paint', cursor, y + 26, w, H - 42);
      ctx.fillStyle = '#29343b';
      ctx.fillRect(cursor + 12, y + 34, w - 24, 26);
      surf('glass', cursor + 12, y + 34, w - 24, 26);
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
  surf('metal', x + W - 40, y + 40, 18, 24);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + W - 31, y + 40);
  ctx.lineTo(x + W - 31, y);
  ctx.stroke();
  if (finish === 'revoque') peel(ctx, x, y, W, H, rng, rng.chance(0.55) ? rng.int(1, 2) : 0);
  if (finish !== 'hueco') damp(ctx, x, y, W, H, rng);
  stains(ctx, x, y, W, H, rng);
  if (rng.chance(finish === 'hueco' ? 0.5 : 0.3)) {
    const [t, c] = rng.pick(PINTADAS);
    spray(ctx, t, c, x + rng.range(10, 200), y + rng.range(20, 40), rng.int(16, 22), rng);
  }
}

function drawAlto(ctx, x, y, rng, finish = 'revoque') {
  const W = CELL_W;
  const H = CELL_H;
  if (finish === 'revoque') {
    const base = rng.pick(PLASTER);
    ctx.fillStyle = base;
    ctx.fillRect(x, y, W, H);
    if (CUR) CUR.base = base;
  } else {
    brickWall(ctx, x, y, W, H, rng, finish);
    if (CUR) CUR.base = '#a7a39c';
  }
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
    surf('metal', x + W - 90, y + 30, 50, 30);
    ctx.fillStyle = '#9e9e9e';
    ctx.beginPath();
    ctx.arc(x + W - 65, y + 45, 11, 0, Math.PI * 2);
    ctx.fill();
  }
  // parapeto de terraza
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x, y, W, 8);
  if (finish === 'revoque') peel(ctx, x, y, W, H, rng, rng.chance(0.45) ? 1 : 0);
  stains(ctx, x, y, W, H, rng);
}

const SIGN_COLORS = ['#c62828', '#1565c0', '#2e7d32', '#f9a825', '#6a1b9a', '#ef6c00', '#00838f', '#ad1457', '#37474f'];

function drawLocal(ctx, x, y, rng, name) {
  const W = CELL_W;
  const H = CELL_H;
  const base = rng.pick(PLASTER);
  ctx.fillStyle = base;
  ctx.fillRect(x, y, W, H);
  if (CUR) CUR.base = base;
  // banda del cartel (el nombre va en un cartel 3D encima)
  const sc = rng.pick(SIGN_COLORS);
  ctx.fillStyle = sc;
  ctx.fillRect(x + 8, y + 4, W - 16, 30);
  if (name) {
    ctx.fillStyle = sc === '#f9a825' ? '#1a1a1a' : '#ffffff';
    ctx.font = `22px ${FONT}`;
    const tw = ctx.measureText(name).width;
    ctx.fillText(name, x + (W - tw) / 2, y + 28);
  }
  // vidriera y persiana
  const vx = x + 20;
  const vw = W - 40;
  record('shop', vx, y + 42, vw, H - 52);
  record('sign', x + 8, y + 4, W - 16, 30);
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
  surf('metal', vx, y + 42, vw, (H - 52) * up);
  surf('glass', vx, y + 42 + (H - 52) * up, vw, (H - 52) * (1 - up));
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
  const base = rng.pick(['#b8b2a7', '#a39b8e', '#c9c1b3', '#9aa4a8', '#b59a86', '#d0c6b0']);
  ctx.fillStyle = base;
  ctx.fillRect(x, y, W, H);
  if (CUR) CUR.base = base;
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
  noise(ctx, W, H, rng, 400, 0.05, x, y);
}

function drawEntrada(ctx, x, y, rng) {
  drawEdificio(ctx, x, y, rng);
  ctx.fillStyle = '#20262b';
  ctx.fillRect(x + 190, y + 20, 130, CELL_H - 30);
  record('door', x + 190, y + 20, 130, CELL_H - 30);
  surf('glass', x + 190, y + 20, 130, CELL_H - 30);
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
  const base = rng.pick(['#cfc6b6', '#bdb4a5', '#d8d0c2', '#b9ae9b', '#c8c0b4']);
  ctx.fillStyle = base;
  ctx.fillRect(x, y, W, H);
  if (CUR) CUR.base = base;
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
  // ladrillo hueco con los agujeritos a la vista
  markBrick(ctx, x, y, W, H, 'hueco');
}

function drawEstacion(ctx, x, y, rng, upper) {
  const W = CELL_W;
  const H = CELL_H;
  // ladrillo del Ferrocarril del Sud con arcos y guardas crema
  const bw = 22;
  const bh = 9;
  ctx.fillStyle = '#b9a58a';
  ctx.fillRect(x, y, W, H);
  for (let r = 0; r * bh < H; r++) {
    for (let k = -1; k * bw < W; k++) {
      const off = r % 2 ? bw / 2 : 0;
      ctx.fillStyle = rng.pick(['#a3563b', '#9b4d34', '#ad5e40', '#94472f']);
      ctx.fillRect(x + k * bw + off + 1, y + r * bh + 1, bw - 2, bh - 2);
    }
  }
  markBrick(ctx, x, y, W, H, 'visto');
  ctx.fillStyle = '#e7dcc3';
  ctx.fillRect(x, y + (upper ? 0 : H - 10), W, 8);
  ctx.fillRect(x, y + (upper ? H - 16 : 0), W, 10);
  for (let k = 0; k < 4; k++) {
    const wx = x + 28 + k * 124;
    const ww = 70;
    const top = y + (upper ? 26 : 30);
    const bot = y + H - (upper ? 24 : 14);
    ctx.fillStyle = '#e7dcc3';
    ctx.beginPath();
    ctx.moveTo(wx - 6, bot);
    ctx.lineTo(wx - 6, top + ww / 2);
    ctx.arc(wx + ww / 2, top + ww / 2, ww / 2 + 6, Math.PI, 0);
    ctx.lineTo(wx + ww + 6, bot);
    ctx.fill();
    ctx.fillStyle = upper || k % 2 ? '#2b3a44' : '#3a2a20';
    ctx.beginPath();
    ctx.moveTo(wx, bot);
    ctx.lineTo(wx, top + ww / 2);
    ctx.arc(wx + ww / 2, top + ww / 2, ww / 2, Math.PI, 0);
    ctx.lineTo(wx + ww, bot);
    ctx.fill();
    record(upper || k % 2 ? 'window' : 'door', wx, top, ww, bot - top);
    surf(upper || k % 2 ? 'glass' : 'paint', wx, top + ww / 2, ww, bot - top - ww / 2);
    if (EM && rng.chance(0.6)) {
      EM.fillStyle = '#d8b070';
      EM.fillRect(wx + 4, top + ww / 2, ww - 8, bot - top - ww / 2);
    }
  }
  noise(ctx, W, H, rng, 500, 0.05, x, y);
}

function drawEstadio(ctx, x, y, rng) {
  const W = CELL_W;
  const H = CELL_H;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#f2f2f2' : '#6ec3ea';
    ctx.fillRect(x, y + (i * H) / 8, W, H / 8);
  }
  ctx.fillStyle = '#1b4f9c';
  ctx.fillRect(x + 10, y + 40, W - 20, 48);
  ctx.fillStyle = '#ffffff';
  ctx.font = `26px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('CLUB ATLÉTICO TEMPERLEY', x + W / 2, y + 74, W - 30);
  ctx.textAlign = 'left';
  noise(ctx, W, H, rng, 400, 0.05, x, y);
}

function drawGalpon(ctx, x, y, rng) {
  const W = CELL_W;
  const H = CELL_H;
  const chapa = rng.chance(0.5);
  ctx.fillStyle = chapa ? rng.pick(['#8e969b', '#7f8a8f', '#a0a4a6']) : rng.pick(['#cfc6b6', '#bdb4a5']);
  ctx.fillRect(x, y, W, H);
  if (CUR) CUR.base = ctx.fillStyle;
  if (chapa) {
    surf('metal', x, y, W, H);
    for (let k = 0; k < W; k += 8) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x + k, y, 3, H);
    }
  }
  // portón grande
  const px = x + rng.range(40, 260);
  ctx.fillStyle = rng.pick(['#3f4a52', '#5c4636', '#2f4f3a', '#6b6b6b']);
  ctx.fillRect(px, y + 20, 180, H - 20);
  record('garage', px, y + 20, 180, H - 20);
  surf('metal', px, y + 20, 180, H - 20);
  for (let yy = y + 26; yy < y + H; yy += 8) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(px, yy, 180, 2);
  }
  if (rng.chance(0.5)) {
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(px + 30, y + 44, 120, 24);
    ctx.fillStyle = '#b71c1c';
    ctx.font = `14px ${FONT}`;
    ctx.fillText('NO ESTACIONAR', px + 36, y + 61);
  }
  stains(ctx, x, y, W, H, rng);
}

function drawEscuela(ctx, x, y, rng) {
  const W = CELL_W;
  const H = CELL_H;
  ctx.fillStyle = '#e8dcc4';
  ctx.fillRect(x, y, W, H);
  ctx.fillStyle = '#c9b89a';
  ctx.fillRect(x, y + H - 14, W, 14);
  for (let k = 0; k < 4; k++) drawWindow(ctx, x + 24 + k * 122, y + 24, 92, 70, rng, true);
  stains(ctx, x, y, W, H, rng);
}

// Grano fino y manchones grandes de pintura despareja sobre todo el lienzo.
function grain(ctx, w, h, rng) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const S = 40;
  const gw = Math.ceil(w / S) + 2;
  const gh = Math.ceil(h / S) + 2;
  const lat = new Float32Array(gw * gh);
  for (let i = 0; i < lat.length; i++) lat[i] = rng.range(-1, 1);
  for (let y = 0; y < h; y++) {
    const gy = y / S;
    const y0 = Math.floor(gy);
    let fy = gy - y0;
    fy = fy * fy * (3 - 2 * fy);
    for (let x = 0; x < w; x++) {
      const gx = x / S;
      const x0 = Math.floor(gx);
      let fx = gx - x0;
      fx = fx * fx * (3 - 2 * fx);
      const a = lat[y0 * gw + x0];
      const b = lat[y0 * gw + x0 + 1];
      const c = lat[(y0 + 1) * gw + x0];
      const e = lat[(y0 + 1) * gw + x0 + 1];
      const blot = a + (b - a) * fx + (c - a) * fy + (a - b - c + e) * fx * fy;
      const k = 1 + blot * 0.05 + (Math.random() - 0.5) * 0.07;
      const i = (y * w + x) * 4;
      d[i] = Math.min(255, d[i] * k);
      d[i + 1] = Math.min(255, d[i + 1] * k);
      d[i + 2] = Math.min(255, d[i + 2] * k);
    }
  }
  ctx.putImageData(img, 0, 0);
}

let ACTX = null;
export function buildAtlas() {
  const c = canvas(CELL_W * COLS, CELL_H * ROWS);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ACTX = ctx;
  const ec = canvas(CELL_W * COLS, CELL_H * ROWS);
  EM = ec.getContext('2d');
  EM.fillStyle = '#000000';
  EM.fillRect(0, 0, ec.width, ec.height);
  const oc = canvas(CELL_W * COLS, CELL_H * ROWS);
  OR = oc.getContext('2d');
  OR.fillStyle = SURF.wall;
  OR.fillRect(0, 0, oc.width, oc.height);
  const rng = new Rng(77);
  let i = 0;
  const at = (fn) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    CUR = { ox: col * CELL_W, oy: row * CELL_H, list: [], base: null };
    // Cada fachada vive en su celda: ladrillos y desgaste no deben invadir la de al lado.
    for (const target of [ctx, EM, OR]) {
      target.save();
      target.beginPath();
      target.rect(CUR.ox, CUR.oy, CELL_W, CELL_H);
      target.clip();
    }
    fn(col * CELL_W, row * CELL_H);
    for (const target of [ctx, EM, OR]) target.restore();
    applyBrickMarks(ctx);
    const r = uvRect(i++);
    r.open = CUR.list;
    r.base = CUR.base;
    CUR = null;
    return r;
  };
  // casas: revocadas, de ladrillo a la vista y sin revocar
  for (let k = 0; k < 16; k++) ATLAS.casa.push(at((x, y) => drawCasa(ctx, x, y, rng)));
  for (let k = 0; k < 4; k++) ATLAS.casa.push(at((x, y) => drawCasa(ctx, x, y, rng, 'visto')));
  for (let k = 0; k < 3; k++) ATLAS.casa.push(at((x, y) => drawCasa(ctx, x, y, rng, 'hueco')));
  for (let k = 0; k < 6; k++) ATLAS.alto.push(at((x, y) => drawAlto(ctx, x, y, rng)));
  for (let k = 0; k < 2; k++) ATLAS.alto.push(at((x, y) => drawAlto(ctx, x, y, rng, 'hueco')));
  for (let k = 0; k < 8; k++) ATLAS.local.push(at((x, y) => drawLocal(ctx, x, y, rng, null)));
  ATLAS.estacion.push(at((x, y) => drawEstacion(ctx, x, y, rng, false)));
  ATLAS.estacion.push(at((x, y) => drawEstacion(ctx, x, y, rng, true)));
  ATLAS.estadio.push(at((x, y) => drawEstadio(ctx, x, y, rng)));
  ATLAS.galpon.push(at((x, y) => drawGalpon(ctx, x, y, rng)));
  ATLAS.galpon.push(at((x, y) => drawGalpon(ctx, x, y, rng)));
  ATLAS.escuela.push(at((x, y) => drawEscuela(ctx, x, y, rng)));
  for (let k = 0; k < 4; k++) ATLAS.edificio.push(at((x, y) => drawEdificio(ctx, x, y, rng)));
  for (let k = 0; k < 2; k++) ATLAS.entrada.push(at((x, y) => drawEntrada(ctx, x, y, rng)));
  for (let k = 0; k < 4; k++) ATLAS.medianera.push(at((x, y) => drawMedianera(ctx, x, y, rng, null)));
  for (let k = 0; k < 4; k++) ATLAS.pintada.push(at((x, y) => drawMedianera(ctx, x, y, rng, PINTADAS[k * 2 % PINTADAS.length])));
  ATLAS.ladrillo.push(at((x, y) => drawLadrillo(ctx, x, y, rng)));
  if (i > COLS * ROWS) console.warn('Atlas lleno', i);
  // el relieve sale del dibujo limpio; el grano va después para que no quede todo granulado
  const normal = normalMapFrom(c, 2.2);
  // La sombra pintada no es relieve: se aplica después de generar las normales.
  for (const cells of Object.values(ATLAS)) for (const cell of cells) {
    const col = Math.round(cell.u0 * COLS);
    const row = Math.round((1 - cell.v1) * ROWS);
    paintFacadeDepth(ctx, EM, col * CELL_W, row * CELL_H, CELL_W, CELL_H, cell.open);
  }
  grain(ctx, c.width, c.height, rng);
  const t = tex(c);
  t.generateMipmaps = true;
  const e = tex(ec);
  const orm = new THREE.CanvasTexture(oc);
  orm.colorSpace = THREE.NoColorSpace;
  orm.anisotropy = 4;
  EM = null;
  OR = null;
  ACTX = null;
  return { map: t, emissive: e, normal, orm };
}

// Normal map a partir del brillo de un lienzo (lo oscuro se hunde): da relieve con la luz.
export function normalMapFrom(src, strength = 2, repeat = false) {
  const w = src.width;
  const h = src.height;
  const data = src.getContext('2d').getImageData(0, 0, w, h).data;
  const hgt = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) hgt[i] = (data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11) / 255;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const o = img.data;
  const H = (x, y) => {
    if (repeat) {
      x = (x + w) % w;
      y = (y + h) % h;
    } else {
      x = Math.max(0, Math.min(w - 1, x));
      y = Math.max(0, Math.min(h - 1, y));
    }
    return hgt[y * w + x];
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) * strength;
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) * strength;
      let nx = -dx;
      let ny = dy;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const i = (y * w + x) * 4;
      o[i] = (nx * 0.5 + 0.5) * 255;
      o[i + 1] = (ny * 0.5 + 0.5) * 255;
      o[i + 2] = (nz * 0.5 + 0.5) * 255;
      o[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.colorSpace = THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Carteles de comercios (nombres reales de la zona): celdas de 512x64 en un lienzo de 2048x2048
// carteles de los comercios: 4 por fila de 512×64; el alto crece con la cantidad (tope 4096 = 256
// carteles). colors: nombre → { bg, fg } con los colores reales cargados en el relevamiento.
export function signAtlas(names, colors = new Map()) {
  const list = names.slice(0, 256);
  const H = Math.min(4096, Math.max(512, Math.ceil(list.length / 4) * 64));
  const c = canvas(2048, H);
  const g = c.getContext('2d');
  const map = new Map();
  const rng = new Rng(9090);
  list.forEach((n, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = col * 512;
    const y = row * 64;
    const real = colors.get(n);
    const bg = real?.bg ?? rng.pick(SIGN_COLORS);
    g.fillStyle = bg;
    g.fillRect(x + 2, y + 2, 508, 60);
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 3;
    g.strokeRect(x + 6, y + 6, 500, 52);
    g.fillStyle = real?.fg ?? (bg === '#f9a825' ? '#1a1a1a' : '#ffffff');
    g.font = `34px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(n.toUpperCase(), x + 256, y + 34, 480);
    map.set(n, { u0: x / 2048, u1: (x + 512) / 2048, v0: 1 - (y + 64) / H, v1: 1 - y / H });
  });
  const t = tex(c);
  t.anisotropy = 8;
  return { tex: t, uv: (n) => map.get(n) };
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
// Follaje por especie: hojas (y flores) en racimos, más claras arriba a la izquierda.
// kind: 'fresno' (verde), 'tipa' (verde amarillento, hoja chica), 'jacaranda' (flores lilas), 'palo' (flores rosas)
export function leafTexture(kind = 'fresno') {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  const rng = new Rng(404 + kind.length * 17);
  const leaf = { fresno: [0.55, 1, 0.35], tipa: [0.72, 1, 0.34], jacaranda: [0.5, 0.92, 0.4], palo: [0.52, 1, 0.36] }[kind];
  const flower = kind === 'jacaranda' ? [150, 110, 205] : kind === 'palo' ? [232, 120, 170] : null;
  const count = kind === 'tipa' ? 1400 : 950;
  const size = kind === 'tipa' ? 0.7 : 1;
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.pow(rng.next(), 0.6) * 118;
    const x = 128 + Math.cos(a) * r;
    const y = 128 + Math.sin(a) * r * 0.9;
    const light = 1 - (x + y) / 512;
    const isFlower = flower && rng.chance(kind === 'jacaranda' ? 0.72 : 0.35);
    if (isFlower) {
      const k = 0.7 + light * 0.45 + rng.range(-0.1, 0.1);
      g.fillStyle = `rgb(${Math.round(flower[0] * k)},${Math.round(flower[1] * k)},${Math.round(flower[2] * k)})`;
    } else {
      const gch = Math.round(90 + light * 80 + rng.range(-15, 15));
      g.fillStyle = `rgb(${Math.round(gch * leaf[0])},${Math.round(gch * leaf[1])},${Math.round(gch * leaf[2])})`;
    }
    g.save();
    g.translate(x, y);
    g.rotate(rng.range(0, Math.PI));
    g.beginPath();
    g.ellipse(0, 0, rng.range(4, 8) * size, rng.range(2, 4) * size, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const t = tex(c);
  return t;
}

// Tierra de la cazuela del árbol, con su borde de cemento
export function cazuelaTexture() {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  const rng = new Rng(55);
  g.fillStyle = '#8e877a';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#4a3a2c';
  g.fillRect(5, 5, 54, 54);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = rng.pick(['#3b2e22', '#5a4632', '#6b5a3e', '#556b35', '#2f2519']);
    g.fillRect(rng.range(5, 57), rng.range(5, 57), rng.range(1, 3), rng.range(1, 3));
  }
  return tex(c);
}

// Pasto con matas, partes secas y tierra pisada
export function grassTexture(tone = 'verde') {
  const S = 512;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const rng = new Rng(tone === 'verde' ? 21 : 22);
  const dry = tone !== 'verde';
  g.fillStyle = dry ? '#6f7443' : '#4f7a34';
  g.fillRect(0, 0, S, S);
  // manchones grandes (secos o más verdes), repetidos en los bordes para que no se note la costura
  for (let i = 0; i < 14; i++) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    const r = rng.range(40, 140);
    const col = rng.chance(dry ? 0.6 : 0.35) ? 'rgba(150,140,80,0.35)' : 'rgba(40,90,30,0.35)';
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, col);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
  }
  // hojitas de pasto
  for (let i = 0; i < 16000; i++) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    const v = rng.range(-1, 1);
    const yellow = rng.chance(dry ? 0.3 : 0.1);
    g.strokeStyle = yellow ? `rgba(${170 + v * 20},${160 + v * 20},${90 + v * 10},0.7)` : `rgba(${60 + v * 20},${110 + v * 30},${40 + v * 12},0.75)`;
    g.lineWidth = rng.range(0.8, 1.6);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + rng.range(-2, 2), y - rng.range(3, 7));
    g.stroke();
  }
  // tierra pelada
  for (let i = 0; i < (dry ? 9 : 4); i++) {
    const x = rng.range(20, S - 20);
    const y = rng.range(20, S - 20);
    const r = rng.range(10, 34);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(110,90,62,0.8)');
    gr.addColorStop(1, 'rgba(110,90,62,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const map = tex(c, true);
  map.anisotropy = 8;
  return { map, normal: normalMapFrom(c, 1.6, true) };
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

// ---------- Techos (repetibles; cada textura cubre ROOF_M[tipo] metros) ----------
export const ROOF_M = { membrana: 4, ceramica: 2, losa: 5, chapa: 3, tejas: 2 };

// para que las manchas grandes no corten en el borde de la textura: se dibujan tres veces corridas
function wrapBlob(g, S, fn) {
  for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy);
}

export function roofTexture(kind) {
  const S = 512;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const rng = new Rng(kind.length * 131 + 7);
  let bump = 2;
  if (kind === 'membrana') {
    // membrana con aluminio: rollos de 1 m solapados, parches y mugre
    g.fillStyle = '#c3c6c7';
    g.fillRect(0, 0, S, S);
    const roll = S / 4;
    for (let k = 0; k < 4; k++) {
      const v = rng.range(-10, 10);
      g.fillStyle = `rgb(${190 + v},${193 + v},${195 + v})`;
      g.fillRect(0, k * roll, S, roll);
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(0, k * roll, S, 3);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(0, k * roll + 3, S, 2);
      // arrugas del rollo
      for (let i = 0; i < 18; i++) {
        g.fillStyle = `rgba(0,0,0,${rng.range(0.04, 0.1)})`;
        g.fillRect(rng.range(0, S), k * roll + rng.range(6, roll - 6), rng.range(20, 90), 2);
      }
    }
    // un par de parches de membrana nueva (más oscura) y manchas de agua estancada
    for (let i = 0; i < 2; i++) {
      const x = rng.range(40, S - 160);
      const y = rng.range(40, S - 120);
      g.save();
      g.translate(x, y);
      g.rotate(rng.range(-0.3, 0.3));
      g.fillStyle = `rgba(95,96,96,${rng.range(0.18, 0.3)})`;
      g.fillRect(0, 0, rng.range(70, 140), rng.range(50, 100));
      g.restore();
    }
    for (let i = 0; i < 7; i++) {
      const x = rng.range(0, S);
      const y = rng.range(0, S);
      const r = rng.range(60, 170);
      wrapBlob(g, S, (ox, oy) => {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, 'rgba(80,72,60,0.22)');
        gr.addColorStop(1, 'rgba(80,72,60,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      });
    }
    bump = 1.4;
  } else if (kind === 'ceramica') {
    // baldosas cerámicas de 20 cm con pastina, algunas cambiadas y con verdín
    g.fillStyle = '#b9ad9c';
    g.fillRect(0, 0, S, S);
    const n = 10;
    const t = S / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = rng.range(-18, 18);
        const odd = rng.chance(0.04);
        g.fillStyle = odd ? `rgb(${150 + v},${120 + v},${95 + v})` : `rgb(${176 + v},${84 + v * 0.6},${56 + v * 0.4})`;
        g.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(x * t + 3, y * t + 3, t - 8, 3);
      }
    }
    for (let i = 0; i < 7; i++) {
      const x = rng.range(0, S);
      const y = rng.range(0, S);
      const r = rng.range(20, 70);
      wrapBlob(g, S, (ox, oy) => {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, 'rgba(60,70,40,0.3)');
        gr.addColorStop(1, 'rgba(60,70,40,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      });
    }
    bump = 2.4;
  } else if (kind === 'losa') {
    // losa de hormigón: manchas de agua, rajaduras y alguna reparación
    g.fillStyle = '#a19d96';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 16; i++) {
      const x = rng.range(0, S);
      const y = rng.range(0, S);
      const r = rng.range(25, 120);
      wrapBlob(g, S, (ox, oy) => {
        const gr = g.createRadialGradient(x + ox, y + oy, r * 0.6, x + ox, y + oy, r);
        gr.addColorStop(0, 'rgba(70,68,62,0.18)');
        gr.addColorStop(0.9, 'rgba(50,48,44,0.28)');
        gr.addColorStop(1, 'rgba(50,48,44,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      });
    }
    g.strokeStyle = 'rgba(45,40,36,0.5)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      let x = rng.range(0, S);
      let y = rng.range(0, S);
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += rng.range(-18, 18);
        y += rng.range(-18, 18);
        g.lineTo(x, y);
      }
      g.stroke();
    }
    noise(g, S, S, rng, 6000, 0.06);
    bump = 1.8;
  } else if (kind === 'chapa') {
    // chapa acanalada galvanizada, con óxido
    const n = 20;
    const t = S / n;
    for (let k = 0; k < n; k++) {
      const gr = g.createLinearGradient(k * t, 0, (k + 1) * t, 0);
      gr.addColorStop(0, '#7d8589');
      gr.addColorStop(0.5, '#c4cacc');
      gr.addColorStop(1, '#7d8589');
      g.fillStyle = gr;
      g.fillRect(k * t, 0, t, S);
    }
    for (let i = 0; i < 9; i++) {
      const x = rng.range(0, S);
      const y = rng.range(0, S);
      const r = rng.range(20, 90);
      wrapBlob(g, S, (ox, oy) => {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, 'rgba(140,70,30,0.55)');
        gr.addColorStop(1, 'rgba(140,70,30,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      });
    }
    // solapes de chapa y tornillos
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, S / 2, S, 3);
    g.fillRect(0, 0, S, 2);
    bump = 3;
  } else {
    // tejas coloniales: hileras de medias cañas que se solapan
    g.fillStyle = '#6e3322';
    g.fillRect(0, 0, S, S);
    const cols = 12;
    const rows = 8;
    const tw = S / cols;
    const th = S / rows;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const v = rng.range(-20, 20);
        const x = k * tw + (r % 2 ? tw / 2 : 0);
        const gr = g.createLinearGradient(x, 0, x + tw, 0);
        gr.addColorStop(0, `rgb(${120 + v},${52 + v * 0.5},${34 + v * 0.3})`);
        gr.addColorStop(0.45, `rgb(${196 + v},${98 + v * 0.5},${62 + v * 0.3})`);
        gr.addColorStop(1, `rgb(${110 + v},${48 + v * 0.5},${30 + v * 0.3})`);
        g.fillStyle = gr;
        for (const ox of [0, -S]) g.fillRect(x + ox + 1, r * th, tw - 2, th + 4);
        g.fillStyle = 'rgba(30,10,5,0.45)';
        for (const ox of [0, -S]) g.fillRect(x + ox + 1, r * th + th - 3, tw - 2, 5);
      }
    }
    for (let i = 0; i < 8; i++) {
      const x = rng.range(0, S);
      const y = rng.range(0, S);
      const r = rng.range(20, 70);
      wrapBlob(g, S, (ox, oy) => {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, 'rgba(50,55,40,0.35)');
        gr.addColorStop(1, 'rgba(50,55,40,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      });
    }
    bump = 3;
  }
  // las tejas se giran: las canaletas tienen que bajar por la pendiente (la U del techo)
  let out = c;
  if (kind === 'tejas') {
    out = canvas(S, S);
    const g2 = out.getContext('2d');
    g2.translate(S, 0);
    g2.rotate(Math.PI / 2);
    g2.drawImage(c, 0, 0);
  }
  const map = tex(out, true);
  map.anisotropy = 8;
  return { map, normal: normalMapFrom(out, bump, true) };
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

// Vereda de baldosas "vainilla": algunas rotas, otras cambiadas por cemento, manchas y mugre en las juntas.
// 8 x 8 baldosas por textura.
export function sidewalkTexture() {
  const S = 512;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const rng = new Rng(9);
  ctx.fillStyle = '#8f897d';
  ctx.fillRect(0, 0, S, S);
  const n = 8;
  const t = S / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = i * t;
      const y = j * t;
      const v = rng.range(-10, 10);
      const patched = rng.chance(0.05);
      if (patched) {
        // baldosa que se rompió y taparon con cemento
        ctx.fillStyle = `rgb(${150 + v},${150 + v},${146 + v})`;
        ctx.fillRect(x, y, t, t);
        continue;
      }
      ctx.fillStyle = `rgb(${190 + v},${183 + v},${168 + v})`;
      ctx.fillRect(x + 1.5, y + 1.5, t - 3, t - 3);
      // vainillas (barritas en relieve)
      const vert = (i + j) % 2 === 0;
      for (let k = 0; k < 6; k++) {
        const o = 6 + k * ((t - 12) / 6);
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        if (vert) ctx.fillRect(x + o, y + 6, 4, t - 12);
        else ctx.fillRect(x + 6, y + o, t - 12, 4);
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        if (vert) ctx.fillRect(x + o + 4, y + 6, 1.5, t - 12);
        else ctx.fillRect(x + 6, y + o + 4, t - 12, 1.5);
      }
      if (rng.chance(0.08)) {
        // rajadura
        ctx.strokeStyle = 'rgba(50,45,40,0.7)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x + rng.range(0, t), y);
        ctx.lineTo(x + rng.range(0, t), y + t * 0.5);
        ctx.lineTo(x + rng.range(0, t), y + t);
        ctx.stroke();
      }
    }
  }
  // manchas (aceite, chicles, humedad) repetidas en los bordes
  for (let i = 0; i < 26; i++) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    const r = rng.range(4, 40);
    const a = rng.range(0.08, 0.22);
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        const gr = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, `rgba(40,36,30,${a})`);
        gr.addColorStop(1, 'rgba(40,36,30,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
  }
  noise(ctx, S, S, rng, 9000, 0.06);
  const map = tex(c, true);
  map.anisotropy = 8;
  return map;
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

export function busTexture(line, bg = '#c0392b') {
  // faldón del colectivo (10,5 m x 0,55 m): color de la línea, fileteado y el número
  const c = canvas(1024, 54);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 54);
  const ink = ['#f7f9f9', '#f4d03f', '#f2c230'].includes(bg) ? '#1b4f9c' : '#ffffff';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let x = 0; x < 1024; x += 36) {
    ctx.moveTo(x, 40);
    ctx.quadraticCurveTo(x + 9, 30, x + 18, 40);
    ctx.quadraticCurveTo(x + 27, 50, x + 36, 40);
  }
  ctx.stroke();
  ctx.fillRect(0, 8, 1024, 3);
  ctx.fillStyle = ink;
  ctx.font = `bold 30px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(`LÍNEA ${line}`, 40, 26);
  ctx.fillText(`LÍNEA ${line}`, 800, 26);
  return tex(c);
}

// ---------- Texturas de foto (CC0) ----------
// Si están en public/textures/<nombre>_color.jpg (y _normal, _rough), las bajó scripts/texturas.mjs de
// Poly Haven o ambientCG: reemplazan a las dibujadas en el material. Si no están, no pasa nada.
// size: cuántos metros cubre la foto; perTile: cuántos metros cubre una vuelta de UV en esa malla.
// (textures/list.json dice cuáles hay, así no se piden archivos que no existen)
let photoList = null;
export async function usePhoto(mat, name, { size = 3, perTile = 1, rough = true } = {}) {
  photoList ??= fetch('textures/list.json')
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  const list = await photoList;
  // El color y su relieve se cambian juntos: si falta una descarga, queda el material
  // dibujado completo. No mezclar una normal nueva con las baldosas viejas.
  if (!Array.isArray(list) || !list.includes(`${name}_color.jpg`)) return false;
  const L = new THREE.TextureLoader();
  const k = perTile / size;
  const maps = [['map', 'color'], ['normalMap', 'normal']];
  if (rough && 'roughnessMap' in mat) maps.push(['roughnessMap', 'rough']);
  const wanted = maps.filter(([, file]) => list.includes(`${name}_${file}.jpg`));
  const loaded = await Promise.allSettled(wanted.map(([, file]) => L.loadAsync(`textures/${name}_${file}.jpg`)));
  if (loaded.some((r) => r.status === 'rejected')) {
    for (const r of loaded) if (r.status === 'fulfilled') r.value.dispose();
    return false;
  }
  // Sin normal fotográfica, quitar la normal dibujada que ya no coincide con el color.
  for (const [key] of maps) {
    mat[key]?.dispose();
    mat[key] = null;
  }
  loaded.forEach((r, i) => {
    const t = r.value;
    const [key] = wanted[i];
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = key === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    t.repeat.set(k, k);
    mat[key] = t;
  });
  // La rugosidad base sigue bajo el control del clima, incluso si terminó de llover
  // mientras se descargaban las texturas.
  mat.needsUpdate = true;
  return true;
}
