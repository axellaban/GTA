// Personas con modelo de artista: los vecinos, la policía y los clientes salen de MakeHuman (CC0,
// makehumancommunity.org): cuerpo, cara, piel, ropa y pelo armados con tools/models/mh (build.py +
// pack.mjs), cada uno con su cara y su ropa (camisetas de Banfield, Temperley, Boca, River…), ~5.000
// triángulos y una textura de 1024. Gaspi, Laban, Ciro, el Comandante y las chicas también; los sistemas que
// piden un look de human.js lo reciben con makeLook. El SWAT es de Mesh2Motion (elbolilloduro, CC0).
// Se cargan una vez; cada persona es un clon animado con nuestras poses (src/rig.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { rigHuman } from './rig.js';
import { R } from './rng.js';
import { TOUCH } from './input.js';
import { freeAfterUpload } from './textures.js';
import { wearCap, wearHelmetMH, wearShades, wearChain, holdCloth, holdCup } from './wear.js';

const SETS = {
  male: ['mh_banfield', 'mh_temperley', 'mh_boca', 'mh_river', 'mh_pibe', 'mh_laburante', 'mh_oficinista', 'mh_gordo', 'mh_flaco', 'mh_musculoso', 'mh_rayado', 'mh_jubilado_old', 'mh_abuelo_old', 'mh_barba', 'mh_bigote'],
  female: ['mh_f_remera', 'mh_f_short', 'mh_f_deporte', 'mh_f_vestido', 'mh_f_madre', 'mh_f_afro', 'mh_f_abuela_old'],
  police: ['mh_policia', 'mh_policia_f'],
  swat: ['swat_male'],
  // no salen como vecinos al azar: los usan makeLook (linyera, armero, chicos) y makeStar/makeGirl
  special: ['mh_linyera', 'mh_armero_old', 'mh_chico', 'mh_chica'],
  stars: ['mh_gaspi', 'mh_laban', 'mh_ciro', 'mh_comandante', 'mh_f_fiesta', 'mh_f_gym'],
};

// Ropa de otro color para cada vecino: se gira el tono en HSV. Un material por persona, mismo programa.
const TINT_GLSL = /* glsl */ `
vec3 tintHsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 tintRgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}`;
// MakeHuman (tools/models/mh): _part dice 1 piel, 2 torso, 5 mangas, 6 pantalón, 3 pelo, 7 cejas, 0 lo demás
// (ojos, zapatos). En userData (extras del glb) viene qué ropa no cambia de color al azar (camisetas,
// uniformes, jeans: fixed), la luminancia media de arriba y de abajo (lum: para pintarla de un color dado
// conservando las sombras), los colores de pelo posibles (hair) y las medidas de la cabeza (head).
// La piel ya viene con su textura (clara u oscura): acá solo se varía un poco el tono. El pelo (gris
// neutro en el atlas, luminancia media 0,18) toma el color que le toque: negro, castaño, rubio, canoso…
const MH_SKIN = [[1, 1, 1], [0.97, 0.93, 0.9], [0.93, 0.86, 0.8], [1.02, 0.98, 0.95]];
export const MH_HAIR = { negro: [0.025, 0.02, 0.018], oscuro: [0.05, 0.032, 0.022], castano: [0.12, 0.07, 0.04], claro: [0.3, 0.2, 0.11], rubio: [0.55, 0.42, 0.24], platino: [0.85, 0.8, 0.66], colorado: [0.32, 0.1, 0.04], canoso: [0.4, 0.4, 0.4], blanco: [0.75, 0.74, 0.72] };
const MH_HAIR_W = [['negro', 4], ['oscuro', 5], ['castano', 4], ['claro', 1.5], ['rubio', 1], ['colorado', 0.4]];
// allowed: los colores que admite el modelo (userData.hair del glb; p. ej. morochos: negro u oscuro)
function mhHair(old, allowed) {
  if (old && R.chance(0.7)) return MH_HAIR[R.chance(0.5) ? 'canoso' : 'blanco'];
  const list = allowed ? MH_HAIR_W.filter(([k]) => allowed.includes(k)) : MH_HAIR_W;
  let t = Math.random() * list.reduce((a, b) => a + b[1], 0);
  for (const [k, w] of list) if ((t -= w) <= 0) return MH_HAIR[k];
  return MH_HAIR.oscuro;
}
const lin = (hex) => new THREE.Color(hex); // THREE.Color guarda en lineal (como el shader)
// pelado (o con gorra, casco, sombrero): la misma malla sin los triángulos del pelo (_part 3), compartida
// por todos los del mismo modelo; así tampoco tira sombra
const BALD = new WeakMap();
function baldGeometry(g) {
  if (!BALD.has(g)) {
    const part = g.attributes._part;
    const idx = g.index.array;
    const keep = [];
    for (let i = 0; i < idx.length; i += 3) {
      if (Math.round(part.getX(idx[i])) === 3) continue;
      keep.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    const out = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(g.attributes)) out.setAttribute(k, a);
    out.setIndex(keep);
    out.boundingBox = g.boundingBox;
    out.boundingSphere = g.boundingSphere;
    BALD.set(g, out);
  }
  return BALD.get(g);
}
function dressMesh(m, ud, o) {
  m.material = tintMH(m.material, ud, o);
  if (o.bald && m.geometry.attributes._part && m.geometry.index) m.geometry = baldGeometry(m.geometry);
}
// o: { hue, sat, val (cambio al azar), skin [r,g,b], hair [r,g,b], top, vest, bottom (colores hex que se
// imponen: remera, chaleco solo en el torso, pantalón) }
function tintMH(material, ud, o) {
  const m = material.clone();
  const v4 = (hex) => (hex == null ? new THREE.Vector4(0, 0, 0, 0) : new THREE.Vector4(...lin(hex).toArray(), 1));
  const fixed = ud.fixed ?? { top: false, bottom: true };
  const lum = ud.lum ?? { top: 0.3, bottom: 0.1 };
  m.onBeforeCompile = (shader) => {
    THREE.Material.prototype.onBeforeCompile.call(m, shader);
    Object.assign(shader.uniforms, {
      uTint: { value: new THREE.Vector3(o.hue ?? 0, o.sat ?? 1, o.val ?? 1) },
      uSkin: { value: new THREE.Vector3(...(o.skin ?? [1, 1, 1])) },
      uHair: { value: new THREE.Vector3(...(o.hair ?? MH_HAIR.oscuro)) },
      uTop: { value: v4(o.top) },
      uVest: { value: v4(o.vest) },
      uBottom: { value: v4(o.bottom) },
      uFix: { value: new THREE.Vector2(fixed.top ? 1 : 0, fixed.bottom ? 1 : 0) },
      uLum: { value: new THREE.Vector2(Math.max(0.02, lum.top), Math.max(0.02, lum.bottom)) },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _part;\nvarying float vPart;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = _part;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint;\nuniform vec3 uSkin;\nuniform vec3 uHair;\nuniform vec4 uTop;\nuniform vec4 uVest;\nuniform vec4 uBottom;\nuniform vec2 uFix;\nuniform vec2 uLum;\nvarying float vPart;\n' + TINT_GLSL)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float p = floor(vPart + 0.5);
          float skin = 1.0 - step(0.5, abs(p - 1.0));
          float hairK = 1.0 - step(0.5, abs(p - 3.0)) + 1.0 - step(0.5, abs(p - 7.0)); // pelo y cejas
          float torso = 1.0 - step(0.5, abs(p - 2.0));
          float top = torso + 1.0 - step(0.5, abs(p - 5.0));
          float bottom = 1.0 - step(0.5, abs(p - 6.0));
          float shiftK = top * (1.0 - uFix.x) + bottom * (1.0 - uFix.y);
          vec3 hsv = tintHsv(pow(max(diffuseColor.rgb, 0.0), vec3(0.4545)));
          hsv.x = fract(hsv.x + uTint.x * shiftK);
          hsv.y = clamp(hsv.y * mix(1.0, uTint.y, shiftK), 0.0, 1.0);
          hsv.z *= mix(1.0, uTint.z, shiftK);
          vec3 c = pow(tintRgb(hsv), vec3(2.2)) * mix(vec3(1.0), uSkin, skin);
          float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          c = mix(c, uTop.rgb * min(lum / uLum.x, 2.5), top * uTop.a);
          c = mix(c, uVest.rgb * min(lum / uLum.x, 2.5), torso * uVest.a);
          c = mix(c, uBottom.rgb * min(lum / uLum.y, 2.5), bottom * uBottom.a);
          diffuseColor.rgb = mix(c, uHair * (lum / 0.18), hairK);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'ropa-mh3';
  return m;
}

export const PEOPLE = { ready: false, scenes: {} };

function halve(t) {
  const img = t.image;
  if (!img?.width || img.width <= 512) return;
  const c = document.createElement('canvas');
  c.width = img.width / 2;
  c.height = img.height / 2;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  img.close?.(); // ImageBitmap: se libera ya
  t.image = c;
  t.needsUpdate = true;
  freeAfterUpload(t);
}

export function loadPeople() {
  const loader = new GLTFLoader();
  const jobs = [];
  for (const [kind, list] of Object.entries(SETS)) {
    for (const f of list) {
      jobs.push(
        loader
          .loadAsync(`models/people/${f}.glb`)
          .then((g) => {
            // en el celular (poca memoria de placa) la textura de los MakeHuman baja de 1024 a 512
            if (TOUCH && /^mh_/.test(f)) g.scene.traverse((o) => o.isMesh && o.material.map && halve(o.material.map));
            (PEOPLE.scenes[kind] ??= []).push({ f, scene: g.scene });
          })
          .catch((e) => console.warn('No cargó', f, e)),
      );
    }
  }
  return Promise.all(jobs).then(() => (PEOPLE.ready = Object.keys(PEOPLE.scenes).length > 0));
}

// una persona nueva del tipo pedido ('male', 'female', 'police'), o null si todavía no cargaron
export function makePerson(kind) {
  const list = PEOPLE.scenes[kind];
  if (!list?.length) return null;
  const s = R.pick(list);
  const female = kind === 'female' || /female|^mh_f_|_f$/.test(s.f);
  // los de MakeHuman ya vienen con su altura (la abuela es bajita, el flaco alto): apenas se varía
  let height = female ? R.range(1.6, 1.7) : R.range(1.7, 1.84);
  if (/^mh_/.test(s.f)) {
    s.h0 ??= new THREE.Box3().setFromObject(s.scene).getSize(new THREE.Vector3()).y;
    height = s.h0 * R.range(0.97, 1.03);
  }
  const h = rigHuman(s.scene, { female, height });
  h.file = s.f; // qué modelo es (para pruebas)
  // los vecinos con ropa de otro color (los uniformes quedan como son)
  if (kind === 'male' || kind === 'female') {
    const hue = R.chance(0.25) ? 0 : Math.random();
    const sat = R.range(0.75, 1.3);
    const val = R.range(0.72, 1.18);
    h.rig.model.traverse((o) => {
      if (!o.isMesh) return;
      if (/^mh_/.test(s.f)) o.material = tintMH(o.material, s.scene.userData, { hue, sat, val, skin: R.pick(MH_SKIN), hair: mhHair(/_old/.test(s.f), s.scene.userData.hair) });
    });
  }
  return h;
}

// ---------- Personajes (MakeHuman): Gaspi, Laban, Ciro, el Comandante y las chicas ----------
// Gaspi: traje negro, camisa blanca, corbata roja a rayas y la cara de la foto horneada en la textura de la
// cabeza (src/gaspi-face.webp). Laban: traje blanco a lo Alan Faena, sombrero y anteojos negros. Ciro: en
// cuero, el doble de alto. El Comandante: traje blanco, pelo platinado, bronceado, anteojos y cadenita.
const STARS = {
  gaspi: { file: 'mh_gaspi', height: 1.84, hair: 'oscuro' },
  laban: { file: 'mh_laban', height: 1.8, hair: 'oscuro', shades: true, bald: true }, // el sombrero tapa el pelo
  ciro: { file: 'mh_ciro', height: 3.5, hair: 'negro' },
  comandante: { file: 'mh_comandante', height: 1.86, hair: 'platino', skin: [1.06, 0.93, 0.8], shades: true, chain: true },
};
const sceneOf = (f) =>
  Object.values(PEOPLE.scenes)
    .flat()
    .find((x) => x.f === f);
// color de pelo: nombre de la paleta o hex de los looks de human.js
const hairColor = (v) => (typeof v === 'string' ? MH_HAIR[v] : v != null ? lin(v).toArray() : MH_HAIR.oscuro);
// tono de piel de un look de human.js, relativo a la piel media de esos looks (la textura ya trae el suyo)
const SKIN_REF = lin(0xd9a882);
function skinMul(hex) {
  if (hex == null) return [1, 1, 1];
  const c = lin(hex);
  return [c.r / SKIN_REF.r, c.g / SKIN_REF.g, c.b / SKIN_REF.b].map((v) => Math.min(1.15, Math.max(0.45, v)));
}

// Gaspi, Laban, Ciro o el Comandante (null si todavía no cargaron los modelos)
export function makeStar(name) {
  return dress(STARS[name], name);
}
// Las chicas: 'fiesta' (las del Ferrucho de Laban, de vestido) o 'gym' (top y calzas).
// o: { dress | shirt, pants, hair, skin }
export function makeGirl(kind, o = {}) {
  const st =
    kind === 'fiesta'
      ? { file: 'mh_f_fiesta', height: 1.7, female: true, top: o.dress ?? 0xff4fa3, bottom: o.dress ?? 0xff4fa3, hair: o.hair ?? 0xc9a15a, skin: skinMul(o.skin) }
      : { file: 'mh_f_gym', height: 1.68, female: true, top: o.shirt ?? 0xf48fb1, bottom: o.pants ?? 0x151515, hair: o.hair ?? 0x2b1d14, skin: skinMul(o.skin) };
  return dress(st, 'chica');
}
function dress(st, star) {
  const s = sceneOf(st.file);
  if (!s) return null;
  const h = rigHuman(s.scene, { height: st.height, female: !!st.female });
  h.file = st.file;
  h.star = star;
  h.tall = st.height + 0.5; // donde va el globito de lo que dice
  // todo viene en la textura: solo se fijan el pelo (gris neutro en el atlas), la piel y la ropa pedida
  const o = { hair: hairColor(st.hair), skin: st.skin, top: st.top, vest: st.vest, bottom: st.bottom, bald: st.bald };
  h.rig.model.traverse((m) => {
    if (m.isMesh) dressMesh(m, s.scene.userData, o);
  });
  if (st.shades) wearShades(h);
  if (st.chain) wearChain(h);
  return h;
}

// ---------- Cualquier look de human.js con un modelo MakeHuman ----------
// Los sistemas que arman su gente con makeHuman (trapitos, panchero, bandas, chicos del colegio, hinchas…)
// piden un "look"; acá se elige el modelo que más se parece (chico, mujer, viejo, panza, bigote, barba,
// musculoso, camiseta de club) y se le imponen los colores (remera, chaleco, pantalón, pelo, piel) y la
// gorra o el casco. null si todavía no cargaron los modelos (el sistema usa makeHuman y después se cambia).
const JERSEY_FILE = { banfield: 'mh_banfield', temperley: 'mh_temperley', boca: 'mh_boca', river: 'mh_river', argentina: 'mh_pibe' };
const gray = (hex) => {
  const hsl = {};
  new THREE.Color(hex).getHSL(hsl);
  return hsl.s < 0.15 && hsl.l > 0.3;
};
export function makeLook(o) {
  if (!PEOPLE.ready || !o || o.alien) return null;
  const kid = o.child || (o.scale ?? 1) < 0.85;
  const old = o.old || (o.hair != null && gray(o.hair));
  let top = o.top ?? 'tshirt';
  if (o.jacket) top = 'jacket';
  else if (o.hood) top = 'hoodie';
  else if (o.jersey && o.top == null) top = 'jersey';
  let file;
  if (kid) file = o.female ? 'mh_chica' : 'mh_chico';
  else if (o.police) file = o.female ? 'mh_policia_f' : 'mh_policia';
  else if (top === 'jersey' && !o.female) file = JERSEY_FILE[o.jersey] ?? 'mh_banfield';
  else if (o.female) file = old ? 'mh_f_abuela_old' : R.pick(['mh_f_remera', 'mh_f_short', 'mh_f_madre', 'mh_f_deporte']);
  else if (o.beard && (o.tired || o.hairStyle === 'long')) file = 'mh_linyera';
  else if (o.mustache) file = o.muscle ? 'mh_armero_old' : 'mh_bigote';
  else if (o.muscle) file = 'mh_musculoso';
  else if (o.belly) file = R.pick(o.shirt != null ? ['mh_gordo', 'mh_bigote'] : ['mh_gordo', 'mh_bigote', 'mh_laburante']);
  else if (old) file = R.pick(['mh_jubilado_old', 'mh_abuelo_old']);
  else if (o.stubble || o.beard) file = 'mh_barba';
  else file = R.pick(['mh_barba', 'mh_flaco', 'mh_rayado', 'mh_oficinista', 'mh_bigote', 'mh_gordo']);
  const s = sceneOf(file);
  if (!s) return null;
  const ud = s.scene.userData;
  const female = /^mh_f_|_f$|chica/.test(file);
  s.h0 ??= new THREE.Box3().setFromObject(s.scene).getSize(new THREE.Vector3()).y;
  const h = rigHuman(s.scene, { female, height: s.h0 * (kid ? R.range(0.92, 1.08) : (o.scale ?? 1) * R.range(0.98, 1.02)) });
  h.file = file;
  h.look = o;
  // colores: la remera (o campera/buzo) donde el modelo no trae camiseta de club; el chaleco solo en el torso
  const shirt = top === 'jacket' ? o.jacket : top === 'hoodie' ? o.hood : o.shirt;
  const opts = {
    hair: o.hair != null ? hairColor(o.hair) : mhHair(old, ud.hair),
    skin: o.skin != null ? skinMul(o.skin) : R.pick(MH_SKIN),
    top: ud.fixed?.top || shirt == null ? null : shirt,
    vest: o.vest,
    bottom: o.pants ?? null,
    bald: o.hairStyle === 'bald' || o.helmet != null || o.cap != null, // con gorra o casco no asoma el pelo
  };
  if (opts.top == null && !ud.fixed?.top) Object.assign(opts, { hue: Math.random(), sat: R.range(0.8, 1.2), val: R.range(0.8, 1.1) });
  h.rig.model.traverse((m) => {
    if (m.isMesh) dressMesh(m, ud, opts);
  });
  if (o.helmet != null) wearHelmetMH(h, o.helmet);
  else if (o.cap != null) wearCap(h, o.cap, { badge: o.police ? 0xd4af37 : null });
  if (o.glasses && R.chance(0.5)) wearShades(h, 0x1a1a1a, true);
  if (o.franela) holdCloth(h);
  if (o.cup) holdCup(h);
  return h;
}

// Cambia el cuerpo de un personaje que ya está en escena por otro: lo colgado de los huesos o de la
// raíz (armas, la barra del gym) pasa al nuevo, que queda en el mismo lugar y con la misma vista.
const OWN = new Set(['root', 'bones', 'mesh', 'rig', 'geos', 'lod', 'keep', 'female', 'phase', 'file', 'star']);
export function swapHuman(oldH, newH) {
  const r0 = oldH.root;
  const r1 = newH.root;
  r1.position.copy(r0.position);
  r1.rotation.copy(r0.rotation);
  r1.visible = r0.visible;
  const own = new Set();
  for (const b of Object.values(oldH.bones)) own.add(b);
  for (const [name, b] of Object.entries(oldH.bones)) {
    const nb = newH.bones[name];
    if (!nb) continue;
    for (const c of [...b.children]) if (!own.has(c)) nb.add(c);
  }
  for (const c of [...r0.children]) if (c !== oldH.mesh && !own.has(c) && !c.isSkinnedMesh) r1.add(c);
  for (const k of Object.keys(oldH)) if (!OWN.has(k) && !(k in newH)) newH[k] = oldH[k];
  r0.parent?.add(r1);
  r0.removeFromParent();
  return newH;
}

// ---------- Animales (CC0, Mesh2Motion: perro y caballo con el esqueleto del zorro) ----------
// Las animaciones (quieto, caminar, correr, sentarse, ladrar, morir) salen de fox-animations.glb,
// recortado con tools/models/anims.mjs. Se reproducen con un AnimationMixer por animal.
export const ANIMALS = { dog: null, horse: null, clips: null };

export function loadAnimals() {
  const loader = new GLTFLoader();
  return Promise.all(['dog', 'horse', 'quadruped-anims'].map((f) => loader.loadAsync(`models/animals/${f}.glb`)))
    .then(([d, h, a]) => {
      ANIMALS.dog = d.scene;
      ANIMALS.horse = h.scene;
      ANIMALS.clips = a.animations;
    })
    .catch((e) => console.warn('No cargaron los animales', e));
}

// Las animaciones vienen del zorro: se sacan las pistas de huesos que el modelo no tiene (la nariz),
// una sola vez por animal, para que three no avise en cada clon.
const CLIPS = {};
function clipFor(kind, name, src) {
  const key = kind + name;
  if (key in CLIPS) return CLIPS[key];
  const c = ANIMALS.clips.find((x) => x.name === name);
  if (!c) return (CLIPS[key] = null);
  const names = new Set();
  src.traverse((o) => names.add(o.name));
  const tracks = c.tracks.filter((t) => names.has(THREE.PropertyBinding.parseTrackName(t.name).nodeName));
  return (CLIPS[key] = new THREE.AnimationClip(c.name, c.duration, tracks));
}

// un animal con su mezclador: { g, mixer, actions, cur }. length: largo del cuerpo en metros.
export function makeAnimal(kind, { length = 0.95, tint = null } = {}) {
  const src = ANIMALS[kind];
  if (!src || !ANIMALS.clips) return null;
  const model = cloneSkinned(src);
  const box = new THREE.Box3().setFromObject(model);
  const k = length / Math.max(0.01, box.max.z - box.min.z, box.max.x - box.min.x);
  const g = new THREE.Group();
  model.scale.setScalar(k);
  model.position.y = -box.min.y * k;
  g.add(model);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.frustumCulled = false;
    if (tint != null) {
      o.material = o.material.clone();
      o.material.color.multiply(new THREE.Color(tint));
    }
  });
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [n, clip] of [['idle', 'Idle'], ['walk', 'Walk'], ['run', 'Run'], ['sit', 'Sit'], ['bark', 'Bark'], ['death', 'Death']]) {
    const c = clipFor(kind, clip, src);
    if (c) actions[n] = mixer.clipAction(c);
  }
  if (actions.death) {
    actions.death.setLoop(THREE.LoopOnce, 1);
    actions.death.clampWhenFinished = true;
  }
  actions.idle?.play();
  return { g, mixer, actions, cur: 'idle' };
}

// cambia de animación con un fundido corto
export function animalPlay(a, name, timeScale = 1) {
  const next = a.actions[name];
  if (!next) return;
  next.timeScale = timeScale;
  if (a.cur === name) return;
  next.reset().fadeIn(0.25).play();
  a.actions[a.cur]?.fadeOut(0.25);
  a.cur = name;
}
