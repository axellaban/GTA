// Íconos del mapa a lo GTA: un círculo de color con borde oscuro y un dibujito adentro.
// Cada uno se dibuja una sola vez en un canvas chico y después se copia (el minimapa se redibuja
// en cada cuadro). Los dibujos están en una grilla de 64×64 con el centro en (32, 32).

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
  g.fillStyle = d.bg;
  g.beginPath();
  g.arc(32, 32, 25, 0, Math.PI * 2);
  g.fill();
  // brillito arriba, como los íconos de radar
  const sh = g.createLinearGradient(0, 8, 0, 34);
  sh.addColorStop(0, 'rgba(255,255,255,0.28)');
  sh.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sh;
  g.beginPath();
  g.arc(32, 32, 25, Math.PI, 0);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(32, 32, 25, 0, Math.PI * 2);
  g.clip();
  if (letter) text(g, letter, 36, INK);
  else d.draw(g, d.bg);
  g.restore();
  cache.set(key, c);
  return c;
}

// dibuja el ícono centrado en (x, y) con el diámetro pedido
export function drawIcon(g, kind, x, y, size, letter = null) {
  g.drawImage(iconCanvas(kind, letter), x - size / 2, y - size / 2, size, size);
}

// lo que se muestra en la leyenda del mapa de pausa, en orden
export const LEGEND = ['mision', 'armeria', 'pintura', 'gym', 'comisaria', 'hospital', 'tren', 'pancho', 'medias', 'kiosco', 'picada', 'corte', 'ambulancia', 'bombero', 'delivery', 'ovni', 'arma', 'vida', 'chaleco', 'coima'];
// de los objetos del piso (pickups) al ícono
export const PICKUP_ICON = { weapon: 'arma', health: 'vida', armor: 'chaleco', coima: 'coima' };
