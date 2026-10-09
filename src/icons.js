// Íconos del mapa a lo GTA: un círculo de color con borde oscuro y un dibujito adentro.
// Cada uno se dibuja una sola vez en un canvas chico y después se copia (el minimapa se redibuja
// en cada cuadro). Los dibujos están en una grilla de 64×64 con el centro en (32, 32).
import { VC } from './vc.js';

const S = 64;
const INK = '#111418';
const WHITE = '#ffffff';

const path = (g, pts, close = true) => {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  if (close) g.closePath();
};
const rrect = (g, x, y, w, h, r) => {
  g.beginPath();
  // Safari viejo no tiene roundRect: queda cuadrado
  if (g.roundRect) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
};
const text = (g, t, size = 34, color = WHITE, dy = 0) => {
  g.font = `900 ${size}px 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(t, 32, 33 + dy);
};
const star = (g, cx, cy, ro, ri, n = 5) => {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro;
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  path(g, pts);
};
const pistol = (g) => {
  g.fillStyle = WHITE;
  rrect(g, 14, 21, 34, 9, 2);
  g.fill();
  path(g, [[17, 29], [29, 29], [27, 46], [17, 46]]);
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = WHITE;
  g.beginPath();
  g.arc(31, 32, 5, 0, Math.PI);
  g.stroke();
  g.fillRect(44, 18, 3, 4);
};

// fondo, dibujo y nombre para la leyenda
export const ICONS = {
  armeria: { bg: '#c0392b', label: 'Armería', draw: pistol },
  // territorios de las bandas
  arbolitos: { bg: '#1b5e20', label: 'Los Arbolitos', draw: (g) => text(g, 'US$', 26) },
  jubilados: {
    bg: '#5d4b7a',
    label: 'Los Jubilados',
    draw(g) {
      // bastón
      g.strokeStyle = WHITE;
      g.lineWidth = 5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(34, 50);
      g.lineTo(34, 22);
      g.arc(27, 22, 7, 0, Math.PI, true);
      g.stroke();
    },
  },
  pintura: {
    bg: '#2e9e5b',
    label: 'Chapa y pintura',
    draw(g) {
      // aerosol con la nubecita de pintura
      g.fillStyle = WHITE;
      rrect(g, 21, 25, 16, 25, 4);
      g.fill();
      g.fillRect(24, 17, 10, 8);
      g.fillRect(34, 19, 6, 3);
      for (const [x, y, r] of [[45, 17, 2.6], [49, 22, 2.2], [45, 26, 2.4], [51, 15, 1.6]]) {
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
    },
  },
  lavadero: {
    bg: '#1e6fd0',
    label: 'Lavadero',
    draw(g) {
      // auto con gotas
      g.fillStyle = WHITE;
      rrect(g, 14, 33, 36, 11, 4);
      g.fill();
      path(g, [[21, 33], [26, 25], [39, 25], [44, 33]]);
      g.fill();
      for (const x of [22, 42]) {
        g.beginPath();
        g.arc(x, 45, 4, 0, Math.PI * 2);
        g.fill();
      }
      for (const [x, y] of [[22, 13], [32, 9], [42, 13]]) {
        path(g, [[x, y], [x + 3.5, y + 6], [x - 3.5, y + 6]]);
        g.fill();
        g.beginPath();
        g.arc(x, y + 7, 3.6, 0, Math.PI * 2);
        g.fill();
      }
    },
  },
  bar: {
    bg: '#6d3b1e',
    label: 'Bar',
    draw(g) {
      // chopp de cerveza con espuma
      g.fillStyle = '#ffc93c';
      rrect(g, 18, 20, 22, 30, 3);
      g.fill();
      g.fillStyle = WHITE;
      for (const [x, r] of [[21, 5], [29, 6], [37, 5]]) {
        g.beginPath();
        g.arc(x, 19, r, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = WHITE;
      g.lineWidth = 4;
      g.beginPath();
      g.arc(42, 34, 7, -Math.PI / 2, Math.PI / 2);
      g.stroke();
    },
  },
  pizzeria: {
    bg: '#d84315',
    label: 'Pizzería',
    draw(g) {
      // porción de pizza
      g.fillStyle = '#f2c27a';
      path(g, [[14, 18], [50, 18], [32, 52]]);
      g.fill();
      g.fillStyle = '#ffe082';
      path(g, [[18, 22], [46, 22], [32, 47]]);
      g.fill();
      g.fillStyle = '#c62828';
      for (const [x, y] of [[26, 27], [37, 28], [32, 37]]) {
        g.beginPath();
        g.arc(x, y, 3.3, 0, Math.PI * 2);
        g.fill();
      }
    },
  },
  gym: {
    bg: '#e0a400',
    label: 'Gym El Kaiser',
    draw(g) {
      g.fillStyle = WHITE;
      g.fillRect(14, 30, 36, 5);
      rrect(g, 13, 20, 7, 25, 2);
      g.fill();
      rrect(g, 44, 20, 7, 25, 2);
      g.fill();
      rrect(g, 20, 24, 5, 17, 2);
      g.fill();
      rrect(g, 39, 24, 5, 17, 2);
      g.fill();
    },
  },
  nafta: {
    bg: '#d23a1e',
    label: 'Estación de servicio',
    draw(g, bg) {
      // surtidor con la manguera
      g.fillStyle = WHITE;
      rrect(g, 17, 14, 20, 36, 3);
      g.fill();
      g.fillRect(14, 48, 26, 4);
      g.fillStyle = bg;
      g.fillRect(21, 19, 12, 9);
      g.strokeStyle = WHITE;
      g.lineWidth = 3.5;
      g.beginPath();
      g.moveTo(37, 22);
      g.lineTo(45, 26);
      g.lineTo(45, 42);
      g.lineTo(41, 46);
      g.stroke();
    },
  },
  tren: {
    bg: '#2c5fa8',
    label: 'Estación (tren)',
    draw(g, bg) {
      g.fillStyle = WHITE;
      rrect(g, 19, 13, 26, 32, 6);
      g.fill();
      g.fillStyle = bg;
      rrect(g, 23, 18, 18, 11, 2);
      g.fill();
      for (const x of [26, 38]) {
        g.beginPath();
        g.arc(x, 38, 2.6, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = WHITE;
      g.lineWidth = 3.5;
      g.beginPath();
      g.moveTo(24, 46);
      g.lineTo(18, 53);
      g.moveTo(40, 46);
      g.lineTo(46, 53);
      g.stroke();
    },
  },
  pancho: {
    bg: '#c62828',
    label: 'Panchos',
    draw(g) {
      g.fillStyle = '#f2c27a';
      g.beginPath();
      g.ellipse(32, 36, 19, 8, -0.25, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#b5452c';
      g.beginPath();
      g.ellipse(32, 31, 21, 5.5, -0.25, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#ffe14a';
      g.lineWidth = 2.6;
      g.beginPath();
      for (let i = 0; i <= 8; i++) g[i ? 'lineTo' : 'moveTo'](17 + i * 3.8, 32 - i * 1.1 + (i % 2 ? -2 : 2));
      g.stroke();
    },
  },
  medias: {
    bg: '#7b4fc0',
    label: 'Medias',
    draw(g) {
      g.fillStyle = WHITE;
      path(g, [[25, 13], [37, 13], [37, 36], [46, 42], [45, 50], [33, 50], [25, 42]]);
      g.fill();
      g.fillStyle = '#c9b6ee';
      g.fillRect(25, 17, 12, 3);
      g.fillRect(25, 22, 12, 3);
    },
  },
  kiosco: {
    bg: '#d35400',
    label: 'Kiosco',
    draw(g) {
      // bolsa con manija
      g.fillStyle = WHITE;
      path(g, [[18, 26], [46, 26], [43, 50], [21, 50]]);
      g.fill();
      g.strokeStyle = WHITE;
      g.lineWidth = 3.5;
      g.beginPath();
      g.arc(32, 26, 8, Math.PI, 0);
      g.stroke();
    },
  },
  hospital: {
    bg: '#e53935',
    label: 'Hospital',
    draw(g) {
      text(g, 'H', 40);
    },
  },
  comisaria: {
    bg: '#1e3a8a',
    label: 'Comisaría',
    draw(g) {
      g.fillStyle = '#ffd54a';
      star(g, 32, 33, 18, 8);
      g.fill();
    },
  },
  picada: {
    bg: '#222222',
    label: 'Picadas',
    draw(g) {
      g.fillStyle = WHITE;
      g.fillRect(17, 12, 3.5, 40);
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 3; j++) {
          g.fillStyle = (i + j) % 2 ? '#111111' : WHITE;
          g.fillRect(21 + i * 6.5, 13 + j * 6.5, 6.5, 6.5);
        }
      }
    },
  },
  corte: {
    bg: '#f57c00',
    label: 'Cortes y marchas',
    draw(g) {
      g.fillStyle = WHITE;
      path(g, [[32, 12], [52, 48], [12, 48]]);
      g.fill();
      text(g, '!', 26, '#f57c00', 5);
    },
  },
  ovni: {
    bg: '#1b5e20',
    label: 'Plato volador',
    draw(g) {
      g.fillStyle = '#9ff7ff';
      g.beginPath();
      g.ellipse(32, 29, 9, 8, 0, Math.PI, 0);
      g.fill();
      g.fillStyle = WHITE;
      g.beginPath();
      g.ellipse(32, 33, 21, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#7dffb0';
      for (const x of [20, 28, 36, 44]) {
        g.beginPath();
        g.arc(x, 34, 1.8, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 0.5;
      path(g, [[26, 38], [38, 38], [44, 52], [20, 52]]);
      g.fill();
      g.globalAlpha = 1;
    },
  },
  mision: {
    bg: '#f2c21a',
    label: 'Misión (la letra es de quién te la da)',
    draw(g) {
      text(g, 'M', 36, INK);
    },
  },
  ambulancia: {
    bg: '#ffffff',
    label: 'Changa de paramédico',
    draw(g) {
      g.fillStyle = '#e53935';
      g.fillRect(27, 15, 10, 34);
      g.fillRect(15, 27, 34, 10);
    },
  },
  bombero: {
    bg: '#e53935',
    label: 'Changa de bombero',
    draw(g) {
      // llama
      g.fillStyle = '#ffd54a';
      g.beginPath();
      g.moveTo(32, 11);
      g.bezierCurveTo(44, 24, 48, 34, 42, 44);
      g.bezierCurveTo(38, 51, 26, 51, 22, 44);
      g.bezierCurveTo(17, 36, 22, 28, 27, 22);
      g.bezierCurveTo(27, 30, 30, 32, 32, 33);
      g.bezierCurveTo(31, 26, 34, 18, 32, 11);
      g.fill();
    },
  },
  delivery: {
    bg: '#00897b',
    label: 'Changa de delivery',
    draw(g) {
      g.fillStyle = WHITE;
      g.fillRect(17, 20, 30, 26);
      g.fillStyle = '#00897b';
      g.fillRect(29, 20, 6, 26);
      g.fillRect(17, 30, 30, 3);
    },
  },
  arma: { bg: '#ffa726', label: 'Armas', draw: pistol },
  vida: {
    bg: '#ff5a5a',
    label: 'Milanesas (vida)',
    draw(g) {
      g.fillStyle = WHITE;
      g.beginPath();
      g.moveTo(32, 49);
      g.bezierCurveTo(10, 34, 14, 14, 32, 24);
      g.bezierCurveTo(50, 14, 54, 34, 32, 49);
      g.fill();
    },
  },
  chaleco: {
    bg: '#3b82d6',
    label: 'Chalecos',
    draw(g) {
      g.fillStyle = WHITE;
      path(g, [[32, 12], [48, 18], [46, 36], [32, 51], [18, 36], [16, 18]]);
      g.fill();
    },
  },
  coima: {
    bg: '#ffd23a',
    label: 'Coimas (una estrella menos)',
    draw(g) {
      text(g, '$', 40, INK);
    },
  },
  tobogan: {
    bg: '#0d47a1',
    label: 'Tobogán y pileta (terraza, piso 32)',
    draw(g) {
      g.strokeStyle = WHITE;
      g.lineWidth = 5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(18, 14);
      g.bezierCurveTo(50, 18, 14, 34, 46, 40);
      g.stroke();
      g.lineWidth = 3;
      for (const y of [46, 52]) {
        g.beginPath();
        g.moveTo(14, y);
        g.quadraticCurveTo(20, y - 4, 26, y);
        g.quadraticCurveTo(32, y + 4, 38, y);
        g.quadraticCurveTo(44, y - 4, 50, y);
        g.stroke();
      }
    },
  },
  aura: {
    bg: '#7b1fa2',
    label: 'Ronda de aura (plaza, de 10 a 23 h)',
    draw(g) {
      // un destello de cuatro puntas y dos chiquitos
      g.fillStyle = WHITE;
      for (const [cx, cy, r] of [[29, 34, 17], [46, 18, 7], [47, 45, 5]]) {
        star(g, cx, cy, r, r * 0.28, 4);
        g.fill();
      }
    },
  },
  seleccion: {
    bg: '#4fa9e0',
    label: 'La Selección y el show de drones (plaza, de noche)',
    draw(g) {
      // la camiseta albiceleste con el 10 (en hueco)
      g.save();
      g.beginPath();
      g.moveTo(22, 12);
      g.quadraticCurveTo(32, 19, 42, 12);
      g.lineTo(54, 20);
      g.lineTo(49, 30);
      g.lineTo(44, 27);
      g.lineTo(44, 52);
      g.lineTo(20, 52);
      g.lineTo(20, 27);
      g.lineTo(15, 30);
      g.lineTo(10, 20);
      g.closePath();
      g.fillStyle = WHITE;
      g.fill();
      g.clip();
      g.fillStyle = '#4fa9e0';
      for (const x of [17, 29, 41]) g.fillRect(x, 10, 6, 44);
      g.restore();
      g.fillStyle = '#1b2440';
      g.font = '900 15px Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('10', 32, 38);
    },
  },
  heli: {
    bg: '#c8102e',
    label: 'Helicóptero (terraza de las torres)',
    draw(g) {
      g.fillStyle = WHITE;
      g.beginPath();
      g.ellipse(28, 34, 11, 8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillRect(36, 31, 16, 4);
      g.fillRect(49, 26, 3, 10);
      g.fillRect(10, 21, 36, 3);
      g.fillRect(26, 21, 4, 8);
      g.fillRect(18, 44, 20, 2.5);
    },
  },
  tanque: {
    bg: '#4b5320',
    label: 'Tanque del Ejército',
    draw(g) {
      // de costado: orugas, casco, torreta y el cañón largo
      g.fillStyle = WHITE;
      rrect(g, 9, 37, 46, 11, 5.5);
      g.fill();
      path(g, [[12, 37], [16, 30], [50, 30], [54, 37]]);
      g.fill();
      rrect(g, 21, 21, 20, 10, 3);
      g.fill();
      g.fillRect(39, 23.5, 18, 3.5);
      g.fillStyle = '#4b5320';
      for (const x of [15, 23, 31, 39, 47]) {
        g.beginPath();
        g.arc(x + 1, 42.5, 2.6, 0, Math.PI * 2);
        g.fill();
      }
    },
  },
  matanza: {
    bg: '#b71c1c',
    label: 'Matanzas',
    draw(g) {
      // calavera
      g.fillStyle = WHITE;
      g.beginPath();
      g.arc(32, 28, 15, 0, Math.PI * 2);
      g.fill();
      rrect(g, 23, 34, 18, 12, 3);
      g.fill();
      g.fillStyle = '#b71c1c';
      g.beginPath();
      g.arc(26, 28, 4.5, 0, Math.PI * 2);
      g.arc(38, 28, 4.5, 0, Math.PI * 2);
      g.fill();
      path(g, [[32, 32], [29.5, 37], [34.5, 37]]);
      g.fill();
      for (const x of [27, 32, 37]) g.fillRect(x - 0.8, 41, 1.6, 6);
    },
  },
  figu: {
    bg: '#ff4fd8',
    label: 'Figuritas',
    draw(g) {
      g.fillStyle = WHITE;
      star(g, 32, 33, 17, 7);
      g.fill();
    },
  },
};

const cache = new Map();
// letra: para misiones (la inicial de quien la da)
export function iconCanvas(kind, letter = null) {
  const key = letter ? `${kind}:${letter}` : kind;
  if (cache.has(key)) return cache.get(key);
  const d = ICONS[kind];
  const bg = VC ? ({ mision: '#f39cce', pintura: '#329a90', lavadero: '#368fb0',
    tren: '#387997', pancho: '#ca8c53', gym: '#a17d45', nafta: '#bd6a73',
    jubilados: '#8869a7', vida: '#cf588b', coima: '#d8ad57' }[kind] ?? d.bg) : d.bg;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  // sombra, borde oscuro y fondo de color
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.arc(33, 34, 29, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = INK;
  g.beginPath();
  g.arc(32, 32, 29, 0, Math.PI * 2);
  g.fill();
  if (VC) {
    g.fillStyle = '#fff4e4';
    g.beginPath(); g.arc(32, 32, 27, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = bg;
  g.beginPath();
  g.arc(32, 32, 25, 0, Math.PI * 2);
  g.fill();
  // brillito arriba, como los íconos de radar
  if (!VC) {
    const sh = g.createLinearGradient(0, 8, 0, 34);
    sh.addColorStop(0, 'rgba(255,255,255,0.28)');
    sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sh;
    g.beginPath(); g.arc(32, 32, 25, Math.PI, 0); g.fill();
  }
  g.save();
  g.beginPath();
  g.arc(32, 32, 25, 0, Math.PI * 2);
  g.clip();
  if (letter) text(g, letter, 36, INK);
  else d.draw(g, bg);
  g.restore();
  cache.set(key, c);
  return c;
}

// dibuja el ícono centrado en (x, y) con el diámetro pedido
export function drawIcon(g, kind, x, y, size, letter = null) {
  g.drawImage(iconCanvas(kind, letter), x - size / 2, y - size / 2, size, size);
}

// lo que se muestra en la leyenda del mapa de pausa, en orden
export const LEGEND = ['mision', 'armeria', 'arbolitos', 'jubilados', 'pintura', 'gym', 'nafta', 'comisaria', 'hospital', 'tren', 'pancho', 'medias', 'kiosco', 'picada', 'corte', 'ambulancia', 'bombero', 'delivery', 'ovni', 'heli', 'tanque', 'tobogan', 'aura', 'seleccion', 'matanza', 'arma', 'vida', 'chaleco', 'coima'];
// de los objetos del piso (pickups) al ícono
export const PICKUP_ICON = { weapon: 'arma', health: 'vida', armor: 'chaleco', coima: 'coima' };
