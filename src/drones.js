// Show de drones arriba de la plaza (pedido del dueño): el de la despedida de Messi de la Selección
// (Monumental, 6/10/2026, después del 3-0 a Benín). Mil drones despegan, y antes del homenaje forman
// SANCOR SEGUROS (la publicidad que se ligó los silbidos de todo el estadio); después el 10 y MESSI, la
// camiseta, un jugador pateando (con la derecha: el otro meme de la noche, Leo es zurdo), la Copa, el
// Obelisco y ¡GRACIAS LEO! con las tres estrellas, y vuelven a bajar.
// Cada figura se dibuja acá con canvas (letras y trazos propios: sin logos ni fotos) y los drones se
// reparten sobre lo dibujado en una grilla pareja. Entre una figura y otra cada drone va al punto libre
// más cercano de la siguiente (así no se cruzan todos), y los que sobran apagan la luz. El vuelo, el
// color y el brillo los calcula la placa: la compu solo cambia los destinos al pasar de figura.
import * as THREE from 'three';

export const N = 1000;
const CW = 720;
const CH = 440;
const WIDTH = 86; // ancho de una figura en el cielo (m)
const MPP = WIDTH / CW;
const FONT = '"Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif';
const LUZ = 1.9; // brillo de los leds (pasa el umbral del bloom)

// ---------- las figuras ----------
const CELESTE = '#6cc4ff';
const BLANCO = '#ffffff';
const ORO = '#ffc23a';

function fitFont(g, text, px, maxW, weight = 900) {
  g.font = `${weight} ${px}px ${FONT}`;
  const w = g.measureText(text).width;
  if (w > maxW) g.font = `${weight} ${Math.floor((px * maxW) / w)}px ${FONT}`;
}
function texto(g, text, y, px, color) {
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitFont(g, text, px, CW * 0.94);
  g.fillText(text, CW / 2, y);
}
function estrella(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 ? r * 0.42 : r;
    g.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
  }
  g.closePath();
  g.fill();
}
// palito con las puntas redondas (brazos y piernas del jugador)
function trazo(g, pts, w, color) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(...pts[0]);
  for (const p of pts.slice(1)) g.lineTo(...p);
  g.stroke();
}

const FIGURAS = {
  sancor(g) {
    // la publicidad: el nombre en dos renglones, azul y blanco
    texto(g, 'SANCOR', CH * 0.33, 168, '#2f74ff');
    texto(g, 'SEGUROS', CH * 0.74, 120, BLANCO);
  },
  messi(g) {
    texto(g, '10', CH * 0.36, 250, CELESTE);
    texto(g, 'MESSI', CH * 0.82, 120, BLANCO);
  },
  camiseta(g) {
    const cx = CW / 2;
    const t = 34;
    g.beginPath();
    g.moveTo(cx - 62, t);
    g.quadraticCurveTo(cx, t + 46, cx + 62, t);
    g.lineTo(cx + 150, t + 26);
    g.lineTo(cx + 252, t + 122);
    g.lineTo(cx + 196, t + 178);
    g.lineTo(cx + 150, t + 136);
    g.lineTo(cx + 146, t + 372);
    g.lineTo(cx - 146, t + 372);
    g.lineTo(cx - 150, t + 136);
    g.lineTo(cx - 196, t + 178);
    g.lineTo(cx - 252, t + 122);
    g.lineTo(cx - 150, t + 26);
    g.closePath();
    g.save();
    g.clip();
    for (let i = -6; i < 7; i++) {
      g.fillStyle = i % 2 ? BLANCO : CELESTE;
      g.fillRect(cx + i * 46 - 23, 0, 46, CH);
    }
    g.restore();
    // el 10 en hueco (sin drones)
    g.globalCompositeOperation = 'destination-out';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 150px ${FONT}`;
    g.fillText('10', cx, t + 236);
    g.globalCompositeOperation = 'source-over';
  },
  // el jugador pateando, de costado mirando a la derecha: la pierna de adelante (la que patea) es la derecha
  jugadorA(g) {
    jugador(g, false);
  },
  jugadorB(g) {
    jugador(g, true);
  },
  copa(g) {
    // una copa dorada genérica: base, cuerpo que se angosta y se abre, y el globo arriba
    const cx = CW / 2;
    g.fillStyle = '#d99a1c';
    g.beginPath();
    g.moveTo(cx - 74, 420);
    g.lineTo(cx + 74, 420);
    g.lineTo(cx + 58, 352);
    g.lineTo(cx - 58, 352);
    g.closePath();
    g.fill();
    g.fillStyle = ORO;
    g.beginPath();
    g.moveTo(cx - 48, 352);
    g.bezierCurveTo(cx - 20, 310, cx - 92, 250, cx - 66, 196);
    g.lineTo(cx + 66, 196);
    g.bezierCurveTo(cx + 92, 250, cx + 20, 310, cx + 48, 352);
    g.closePath();
    g.fill();
    g.beginPath();
    g.arc(cx, 128, 74, 0, Math.PI * 2);
    g.fill();
    // las vetas del cuerpo y los meridianos del globo, más claros
    g.strokeStyle = '#fff1b8';
    g.lineWidth = 9;
    g.beginPath();
    g.ellipse(cx, 128, 32, 74, 0, 0, Math.PI * 2);
    g.moveTo(cx - 74, 128);
    g.lineTo(cx + 74, 128);
    g.moveTo(cx - 34, 340);
    g.bezierCurveTo(cx + 30, 300, cx - 50, 240, cx + 10, 200);
    g.stroke();
  },
  obelisco(g) {
    const cx = CW / 2;
    g.fillStyle = '#f2f6ff';
    g.beginPath();
    g.moveTo(cx - 40, 420);
    g.lineTo(cx + 40, 420);
    g.lineTo(cx + 25, 92);
    g.lineTo(cx, 30);
    g.lineTo(cx - 25, 92);
    g.closePath();
    g.fill();
    // la ventanita de arriba
    g.globalCompositeOperation = 'destination-out';
    g.fillRect(cx - 7, 104, 14, 20);
    g.globalCompositeOperation = 'source-over';
    // la avenida (luces celestes) y dos banderas a los costados
    g.fillStyle = CELESTE;
    g.fillRect(cx - 250, 412, 500, 10);
    for (const s of [-1, 1]) {
      const x = cx + s * 170;
      g.fillStyle = BLANCO;
      g.fillRect(x - 3, 250, 6, 160);
      g.fillStyle = CELESTE;
      g.fillRect(x + (s > 0 ? -84 : 3), 250, 81, 22);
      g.fillStyle = BLANCO;
      g.fillRect(x + (s > 0 ? -84 : 3), 272, 81, 22);
      g.fillStyle = CELESTE;
      g.fillRect(x + (s > 0 ? -84 : 3), 294, 81, 22);
      estrella(g, x + (s > 0 ? -43 : 43), 283, 9, ORO);
    }
  },
  gracias(g) {
    estrella(g, CW / 2 - 120, 62, 44, ORO);
    estrella(g, CW / 2, 50, 50, ORO);
    estrella(g, CW / 2 + 120, 62, 44, ORO);
    texto(g, '¡GRACIAS', 200, 124, BLANCO);
    texto(g, 'LEO!', 338, 150, CELESTE);
  },
};

function jugador(g, patea) {
  const piel = '#ffe0c0';
  // cabeza, cuerpo (la camiseta celeste) y la pierna de apoyo
  g.fillStyle = piel;
  g.beginPath();
  g.arc(352, 78, 34, 0, Math.PI * 2);
  g.fill();
  trazo(g, [[346, 134], [328, 246]], 64, CELESTE);
  trazo(g, [[336, 130], [324, 238]], 14, BLANCO);
  trazo(g, [[326, 262], [350, 330], [356, 402], [392, 406]], 28, BLANCO);
  // brazos (se cambian al patear)
  if (patea) {
    trazo(g, [[340, 146], [282, 168], [232, 132]], 24, piel);
    trazo(g, [[352, 146], [404, 182], [446, 214]], 24, piel);
  } else {
    trazo(g, [[352, 146], [412, 168], [462, 140]], 24, piel);
    trazo(g, [[340, 146], [282, 178], [240, 214]], 24, piel);
  }
  // la pierna derecha: atrás cargando, o adelante pegándole, y la pelota
  if (patea) {
    trazo(g, [[330, 262], [410, 304], [484, 284]], 30, BLANCO);
    g.fillStyle = BLANCO;
    g.beginPath();
    g.arc(588, 238, 24, 0, Math.PI * 2);
    g.fill();
    // la estela de la pelota
    for (let i = 1; i < 5; i++) {
      g.beginPath();
      g.arc(588 - i * 26, 238 + i * 12, 7 - i, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    trazo(g, [[330, 262], [278, 322], [212, 288]], 30, BLANCO);
    g.fillStyle = BLANCO;
    g.beginPath();
    g.arc(436, 384, 24, 0, Math.PI * 2);
    g.fill();
  }
}

// Reparte hasta `max` drones sobre lo dibujado: grilla de triángulos (más pareja que una cuadrada), con
// el paso justo para que entren. Devuelve posiciones (m, centradas, y para arriba) y colores lineales.
function muestrear(nombre, max) {
  const c = document.createElement('canvas');
  c.width = CW;
  c.height = CH;
  const g = c.getContext('2d', { willReadFrequently: true });
  FIGURAS[nombre](g);
  const img = g.getImageData(0, 0, CW, CH).data;
  const grid = (s) => {
    const out = [];
    let row = 0;
    for (let y = s / 2; y < CH; y += s * 0.866, row++) {
      for (let x = row % 2 ? s : s / 2; x < CW; x += s) {
        const i = ((y | 0) * CW + (x | 0)) * 4;
        if (img[i + 3] > 150) out.push(x, y, img[i], img[i + 1], img[i + 2]);
      }
    }
    return out;
  };
  let lo = 2;
  let hi = 40;
  for (let k = 0; k < 16; k++) {
    const mid = (lo + hi) / 2;
    if (grid(mid).length / 5 > max) lo = mid;
    else hi = mid;
  }
  const raw = grid(hi);
  const n = raw.length / 5;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (raw[i * 5] - CW / 2) * MPP;
    pos[i * 3 + 1] = (CH / 2 - raw[i * 5 + 1]) * MPP;
    pos[i * 3 + 2] = 0;
    tmp.setRGB(raw[i * 5 + 2] / 255, raw[i * 5 + 3] / 255, raw[i * 5 + 4] / 255, THREE.SRGBColorSpace);
    col[i * 3] = tmp.r;
    col[i * 3 + 1] = tmp.g;
    col[i * 3 + 2] = tmp.b;
  }
  return { n, pos, col };
}

// la grilla del despegue y el aterrizaje: acostada, a `alto` m por debajo del centro del show
function grilla(alto) {
  const side = Math.ceil(Math.sqrt(N));
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = ((i % side) - side / 2) * 2;
    pos[i * 3 + 1] = -alto;
    pos[i * 3 + 2] = (Math.floor(i / side) - side / 2) * 2;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0.55;
  }
  return { n: N, pos, col };
}

// El guion del show (segundos): figura, cuánto tarda en armarse, cuánto queda quieta y qué se dice
export const GUION = [
  { fig: 'despegue', ir: 3, quieto: 2 },
  { fig: 'sancor', ir: 7, quieto: 7 },
  { fig: 'messi', ir: 4, quieto: 7 },
  { fig: 'camiseta', ir: 4, quieto: 7 },
  { fig: 'jugadorA', ir: 4, quieto: 1.4 },
  { fig: 'jugadorB', ir: 0.7, quieto: 0.9 },
  { fig: 'jugadorA', ir: 1.1, quieto: 0.5 },
  { fig: 'jugadorB', ir: 0.7, quieto: 3 },
  { fig: 'copa', ir: 4, quieto: 7 },
  { fig: 'obelisco', ir: 4, quieto: 7 },
  { fig: 'gracias', ir: 4, quieto: 10 },
  { fig: 'aterrizaje', ir: 7, quieto: 1.5 },
];
export const DURACION = GUION.reduce((a, p) => a + p.ir + p.quieto, 0);

const VERT = /* glsl */ `
attribute vec3 aFrom;
attribute vec3 aTo;
attribute vec4 cFrom;
attribute vec4 cTo;
attribute float aSeed;
uniform float uK;
uniform float uT;
uniform float uPx;
uniform float uSize;
varying vec4 vCol;
void main() {
  // cada drone sale un poco antes o después que los demás y vuela en curva (hacia adelante o atrás del
  // plano de la figura), así no chocan en el medio
  float k = clamp(uK * 1.35 - aSeed * 0.35, 0.0, 1.0);
  float e = k * k * (3.0 - 2.0 * k);
  vec3 p = mix(aFrom, aTo, e);
  float arc = sin(e * 3.14159);
  p.z += arc * (aSeed - 0.5) * 14.0;
  p.y += arc * 1.5;
  // quietos en el aire nunca están del todo: el GPS y el viento los mueven unos centímetros
  p += vec3(sin(uT * 1.7 + aSeed * 61.0), sin(uT * 1.3 + aSeed * 37.0), sin(uT * 1.1 + aSeed * 23.0)) * 0.07;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vec4 c = mix(cFrom, cTo, smoothstep(0.15, 0.85, k));
  float px = uSize * uPx / max(1.0, -mv.z);
  // de lejos el punto no baja de 2 píxeles: se compensa con menos brillo
  gl_PointSize = clamp(px, 2.0, 28.0);
  vCol = vec4(c.rgb * c.a * min(1.0, px / 2.0), 1.0);
}`;
const FRAG = /* glsl */ `
varying vec4 vCol;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  float l = exp(-r2 * 7.0) + exp(-r2 * 2.2) * 0.18;
  gl_FragColor = vec4(vCol.rgb * l, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Drones {
  // at: centro del show en el cielo { x, y, z }; mira: hacia dónde mira la figura (punto en el piso)
  constructor(scene, at, mira) {
    this.scene = scene;
    this.at = at;
    this.mira = mira;
    this.formas = null; // pasos del guion ya repartidos (se preparan de a uno, sin trabar el juego)
    this.prep = 0;
    this.paso = -1;
    this.t = 0;
    this.on = false;
    this.yaw = Math.atan2(mira.x - at.x, mira.z - at.z);
    this.guion = GUION;
    this.cache = {};
  }

  // figura de un paso del guion, con sus puntos ya acomodados a los drones del paso anterior
  preparar() {
    if (this.formas && this.prep >= GUION.length) return true;
    this.formas ??= [];
    const i = this.prep++;
    const p = GUION[i];
    let f;
    if (p.fig === 'despegue' || p.fig === 'aterrizaje') f = grilla(this.at.y - 28);
    else f = this.cache[p.fig] ??= muestrear(p.fig, N - 40);
    const prev = this.formas[i - 1];
    this.formas.push(prev ? asignar(prev, f) : apagados(f, p.fig === 'despegue'));
    return this.prep >= GUION.length;
  }

  build() {
    const geo = new THREE.BufferGeometry();
    const z3 = () => new THREE.BufferAttribute(new Float32Array(N * 3), 3);
    const z4 = () => new THREE.BufferAttribute(new Float32Array(N * 4), 4);
    geo.setAttribute('position', z3());
    geo.setAttribute('aFrom', z3());
    geo.setAttribute('aTo', z3());
    geo.setAttribute('cFrom', z4());
    geo.setAttribute('cTo', z4());
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) seed[i] = Math.random();
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.u = { uK: { value: 0 }, uT: { value: 0 }, uPx: { value: 500 }, uSize: { value: 1.05 } };
    // mezcla por máximo (no suma): donde los puntos se pisan, la luz no se quema en una mancha blanca
    const mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, fog: false });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.points.visible = false;
    this.scene.add(this.points);
  }

  // arranca el show (las figuras tienen que estar preparadas)
  start() {
    if (!this.points) this.build();
    while (!this.preparar());
    this.on = true;
    this.t = 0;
    this.paso = -1;
    this.points.visible = true;
    this.irA(0, true);
  }

  stop() {
    this.on = false;
    if (this.points) this.points.visible = false;
  }

  irA(i, desdeApagado = false) {
    const geo = this.points.geometry;
    const A = geo.attributes;
    const f = this.formas[i];
    if (desdeApagado) {
      A.aFrom.array.set(f.pos);
      A.cFrom.array.fill(0);
    } else {
      const g = this.formas[i - 1];
      A.aFrom.array.set(g.pos);
      A.cFrom.array.set(g.col);
    }
    A.aTo.array.set(f.pos);
    A.cTo.array.set(f.col);
    for (const k of ['aFrom', 'aTo', 'cFrom', 'cTo']) A[k].needsUpdate = true;
    this.paso = i;
    this.t0 = this.t;
    this.u.uK.value = 0;
  }

  // qué figura hay ahora (o null), para que la gente reaccione
  get figura() {
    if (!this.on || this.paso < 0) return null;
    const p = GUION[this.paso];
    return { fig: p.fig, armada: this.t - this.t0 > p.ir * 0.8, t: this.t - this.t0 - p.ir };
  }

  update(dt, camera, renderer) {
    if (!this.on) return;
    this.t += dt;
    this.u.uT.value = this.t;
    const p = GUION[this.paso];
    const k = Math.min(1, (this.t - this.t0) / p.ir);
    this.u.uK.value = k;
    if (this.t - this.t0 >= p.ir + p.quieto) {
      if (this.paso + 1 >= GUION.length) return this.stop();
      this.irA(this.paso + 1);
    }
    // la figura gira despacio hacia donde está la cámara (si no, de costado no se lee)
    const want = Math.atan2(camera.position.x - this.at.x, camera.position.z - this.at.z);
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += Math.max(-dt * 0.12, Math.min(dt * 0.12, d));
    this.points.position.set(this.at.x, this.at.y, this.at.z);
    this.points.rotation.set(0, this.yaw, 0);
    // tamaño de los puntos en píxeles por metro a un metro de distancia
    const h = renderer?.domElement?.height || innerHeight;
    this.u.uPx.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  }
}

// los drones del despegue (todos), con la luz encendida en blanco tenue
function apagados(f, encendidos) {
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 4);
  pos.set(f.pos.subarray(0, N * 3));
  for (let i = 0; i < N; i++) {
    col[i * 4] = f.col[i * 3] * LUZ;
    col[i * 4 + 1] = f.col[i * 3 + 1] * LUZ;
    col[i * 4 + 2] = f.col[i * 3 + 2] * LUZ;
    col[i * 4 + 3] = encendidos ? 0.6 : 0;
  }
  return { pos, col };
}

// cada punto de la figura nueva se lo lleva el drone libre más cercano (en orden al azar); los drones que
// sobran apagan la luz y se quedan donde estaban
function asignar(prev, f) {
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 4);
  const libre = new Uint8Array(N).fill(1);
  const P = prev.pos;
  const orden = [...Array(f.n).keys()].sort(() => Math.random() - 0.5);
  for (const j of orden) {
    const x = f.pos[j * 3];
    const y = f.pos[j * 3 + 1];
    const z = f.pos[j * 3 + 2];
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < N; i++) {
      if (!libre[i]) continue;
      const dx = P[i * 3] - x;
      const dy = P[i * 3 + 1] - y;
      const dz = P[i * 3 + 2] - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    libre[best] = 0;
    pos[best * 3] = x;
    pos[best * 3 + 1] = y;
    pos[best * 3 + 2] = z;
    col[best * 4] = f.col[j * 3] * LUZ;
    col[best * 4 + 1] = f.col[j * 3 + 1] * LUZ;
    col[best * 4 + 2] = f.col[j * 3 + 2] * LUZ;
    col[best * 4 + 3] = 1;
  }
  for (let i = 0; i < N; i++) {
    if (!libre[i]) continue;
    pos[i * 3] = P[i * 3];
    pos[i * 3 + 1] = P[i * 3 + 1];
    pos[i * 3 + 2] = P[i * 3 + 2] - 3; // apagados, un poco atrás
    col[i * 4 + 3] = 0;
  }
  return { pos, col };
}
