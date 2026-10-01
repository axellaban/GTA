// Personas con modelo de artista (CC0): low-poly con textura pintada, como Vice City.
// Vienen de Mesh2Motion (github.com/scottpetrovic/mesh2motion-app, carpeta models-variation/human):
// autores elbolilloduro (varones, mujeres, policías, médico), todos CC0.
// Los "q_" son de Quaternius (Ultimate Modular Men y Women, CC0): low-poly facetado con colores
// lisos, pasados por tools/models/quat.mjs (colores de vértice, una malla, ≤ 4.800 triángulos).
// Se cargan una vez; cada persona es un clon animado con nuestras poses (src/rig.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { rigHuman } from './rig.js';
import { R } from './rng.js';
import faceUrl from './gaspi-face.webp';

const SETS = {
  male: ['male_5', 'male_6', 'male_10', 'male_15', 'male_32', 'doctor_m', 'q_casual', 'q_hoodie', 'q_punk', 'q_worker', 'q_suit', 'q_beach', 'q_farmer'],
  female: ['female_8', 'female_9', 'female_31', 'qf_casual', 'qf_worker', 'qf_formal', 'qf_suit', 'qf_punk', 'qf_adventurer'],
  police: ['police_male', 'police_female'],
  swat: ['swat_male'],
};

// Ropa de otro color para cada vecino: se gira el tono de lo que está saturado y no es piel
// (la piel, el pelo oscuro y lo gris quedan como están). Un material por persona, mismo programa.
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
function tintClothes(material, hue, sat, val) {
  const m = material.clone();
  const at = '#include <map_fragment>';
  m.onBeforeCompile = (shader) => {
    THREE.Material.prototype.onBeforeCompile.call(m, shader);
    shader.uniforms.uTint = { value: new THREE.Vector3(hue, sat, val) };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint;\n' + TINT_GLSL)
      .replace(
        at,
        `${at}
        {
          vec3 cs = pow(max(diffuseColor.rgb, 0.0), vec3(0.4545));
          vec3 hsv = tintHsv(cs);
          float skin = (smoothstep(0.0, 0.03, hsv.x) - smoothstep(0.11, 0.15, hsv.x)) * smoothstep(0.12, 0.22, hsv.y) * (1.0 - smoothstep(0.7, 0.85, hsv.y)) * smoothstep(0.2, 0.38, hsv.z);
          float cloth = (1.0 - skin) * smoothstep(0.14, 0.3, hsv.y);
          hsv.x = fract(hsv.x + uTint.x * cloth);
          hsv.y = clamp(hsv.y * mix(1.0, uTint.y, cloth), 0.0, 1.0);
          hsv.z *= mix(1.0, uTint.z, 1.0 - skin);
          diffuseColor.rgb = pow(tintRgb(hsv), vec3(2.2));
        }`,
      );
  };
  m.customProgramCacheKey = () => 'ropa-tenida';
  return m;
}

// Quaternius: cada vértice dice qué es (atributo _part: 2 ropa, 1 piel, 0 pelo y ojos). La ropa
// cambia de color como en tintClothes y la piel toma otro tono (en el original todos son iguales).
const SKIN_TONES = [[1, 1, 1], [0.96, 0.9, 0.84], [0.86, 0.74, 0.62], [0.74, 0.58, 0.45], [0.6, 0.44, 0.33], [0.9, 0.8, 0.7]];
function tintParts(material, hue, sat, val, skin) {
  const m = material.clone();
  m.onBeforeCompile = (shader) => {
    THREE.Material.prototype.onBeforeCompile.call(m, shader);
    shader.uniforms.uTint = { value: new THREE.Vector3(hue, sat, val) };
    shader.uniforms.uSkin = { value: new THREE.Vector3(...skin) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _part;\nvarying float vPart;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = _part;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint;\nuniform vec3 uSkin;\nvarying float vPart;\n' + TINT_GLSL)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float cloth = step(1.5, vPart);
          float skin = step(0.5, vPart) - cloth;
          vec3 hsv = tintHsv(pow(max(diffuseColor.rgb, 0.0), vec3(0.4545)));
          hsv.x = fract(hsv.x + uTint.x * cloth);
          hsv.y = clamp(hsv.y * mix(1.0, uTint.y, cloth), 0.0, 1.0);
          hsv.z *= mix(1.0, uTint.z, cloth);
          diffuseColor.rgb = pow(tintRgb(hsv), vec3(2.2)) * mix(vec3(1.0), uSkin, skin);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'ropa-partes';
  return m;
}

export const PEOPLE = { ready: false, scenes: {} };

export function loadPeople() {
  const loader = new GLTFLoader();
  const jobs = [];
  for (const [kind, list] of Object.entries(SETS)) {
    for (const f of list) {
      jobs.push(
        loader
          .loadAsync(`models/people/${f}.glb`)
          .then((g) => {
            // Quaternius: sin normales, se dibuja facetado como el original
            g.scene.traverse((o) => {
              if (o.isMesh && !o.geometry.attributes.normal) {
                o.material.flatShading = true;
                o.material.vertexColors = true;
                o.material.needsUpdate = true;
              }
            });
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
  const female = kind === 'female' || /female/.test(s.f);
  const h = rigHuman(s.scene, { female, height: female ? R.range(1.6, 1.7) : R.range(1.7, 1.84) });
  h.file = s.f; // qué modelo es (para pruebas)
  // los vecinos con ropa de otro color (los uniformes quedan como son)
  if (kind === 'male' || kind === 'female') {
    const hue = R.chance(0.25) ? 0 : Math.random();
    const sat = R.range(0.75, 1.3);
    const val = R.range(0.72, 1.18);
    h.rig.model.traverse((o) => {
      if (!o.isMesh) return;
      if (o.geometry.attributes._part) o.material = tintParts(o.material, hue, sat, val, R.pick(SKIN_TONES));
      else if (o.material?.map) o.material = tintClothes(o.material, hue, sat, val);
    });
  }
  return h;
}

// ---------- Gaspi, Laban y Ciro con modelo de artista (Quaternius, CC0) ----------
// La ropa se pinta cambiando los colores de vértice del original (una copia de la geometría por
// personaje: son tres). A Gaspi se le pega la cara de la foto en la cabeza (src/gaspi-face.webp, sacada
// de src/gaspi.webp: enderezada y con borde suave); Laban lleva sombrero y anteojos negros, y Ciro es
// el doble de alto y más ancho de hombros y brazos.
const STARS = {
  gaspi: {
    file: 'q_suit',
    height: 1.84,
    // piel, pelo, saco, pantalón, camisa, corbata (la de la foto es roja)
    paint: { '9d6b3d': 0xe39a82, '110702': 0x4a3120, '040507': 0x26282d, '040404': 0x1d1f23, '757575': 0xf4f4f4, '11141a': 0xc8102e, '0c0906': 0xe39a82, '080503': 0xe39a82 },
    // las cejas del modelo (pelo sobre la cara) también van color piel
    brows: 0xe39a82,
    face: true,
  },
  laban: {
    file: 'q_suit',
    height: 1.8,
    // traje blanco a lo Alan Faena, camisa blanca sin corbata, reloj dorado
    paint: { '9d6b3d': 0xc98e6a, '110702': 0x2b1d14, '040507': 0xf4f2ec, '040404': 0xf4f2ec, '757575': 0xffffff, '11141a': 0xffffff, '0d0d0d': 0xd4af37, '120c09': 0xd4af37 },
    hat: 0xf4f2ec,
    shades: true,
  },
  // en cuero: la musculosa del modelo se pinta color piel
  ciro: { file: 'q_beach', height: 3.5, bulk: 1.25, paint: { '9d6b3d': 0xc68a5e, '4e473a': 0xc68a5e, '110702': 0x1a1410, '340509': 0x151515, '757575': 0x2a2a2a } },
};
const hexAt = (a, i) => [a.getX(i), a.getY(i), a.getZ(i)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const painted = new Map();
const EYES = new Set(['0c0906', '080503']);
const isBrow = (key, pos, i) => key === '110702' && pos.getY(i) < 1.75 && pos.getY(i) > 1.68 && pos.getZ(i) > 0.09 && Math.abs(pos.getX(i)) < 0.11;
function paintGeometry(name, g, paint, brows) {
  if (painted.has(name)) return painted.get(name);
  const out = g.clone();
  const col = out.attributes.color;
  const pos = out.attributes.position; // (clone() ya copió los atributos)
  const c = new THREE.Color();
  if (col) {
    const dst = new THREE.Float32BufferAttribute(new Float32Array(col.count * col.itemSize), col.itemSize);
    for (let i = 0; i < col.count; i++) {
      const key = hexAt(col, i);
      const brow = brows != null && isBrow(key, pos, i);
      const hex = brow ? brows : paint[key];
      // con la cara de la foto, los ojos y las cejas del modelo se meten adentro de la cabeza
      if (brows != null && (brow || EYES.has(key))) pos.setZ(i, pos.getZ(i) - 0.035);
      if (hex != null) c.setHex(hex);
      else c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
      dst.setXYZ(i, c.r, c.g, c.b);
      if (col.itemSize === 4) dst.setW(i, 1);
    }
    out.setAttribute('color', dst);
  }
  painted.set(name, out);
  return out;
}

// piezas pegadas a la cabeza (cara, sombrero, anteojos): se arman en el espacio de la malla del
// original y se pasan al del hueso de la cabeza, así acompañan cualquier pose
function headSpace(source) {
  source.updateMatrixWorld(true);
  let mesh = null;
  let head = null;
  source.traverse((o) => {
    if (o.isSkinnedMesh && !mesh) mesh = o;
    if (o.isBone && /^head$/i.test(o.name)) head = o;
  });
  // lo mismo que hace el skinning con un vértice pegado solo a la cabeza
  const i = mesh.skeleton.bones.findIndex((b) => /^head$/i.test(b.name));
  const toHead = i >= 0 ? mesh.skeleton.boneInverses[i].clone().multiply(mesh.bindMatrix) : head.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  return { mesh, toHead };
}
// la caja de la cara en el modelo (metros del original): la foto se proyecta de frente sobre ella,
// con los ojos en y = 1,70 y el mentón en 1,565 (src/gaspi-face.webp está hecha para esta caja)
const FACE = { x0: -0.13, x1: 0.13, y0: 1.545, y1: 1.835 };
let faceGeo = null;
let faceMat = null;
function faceDecal(source) {
  if (!faceGeo) {
    const { mesh, toHead } = headSpace(source);
    const g = mesh.geometry;
    const pos = g.attributes.position;
    const col = g.attributes.color;
    const idx = g.index;
    const P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const n = new THREE.Vector3();
    const e = new THREE.Vector3();
    const tris = idx ? idx.count : pos.count;
    const pick = [];
    const nrm = new Map(); // normal promedio por vértice: el despegue no abre grietas entre triángulos
    for (let t = 0; t < tris; t += 3) {
      const ids = [0, 1, 2].map((k) => (idx ? idx.getX(t + k) : t + k));
      ids.forEach((i, k) => P[k].fromBufferAttribute(pos, i));
      // el frente de la cara (de la frente al mentón), sin el pelo de arriba
      if (P.some((p) => p.y < FACE.y0 || p.y > FACE.y1 || Math.abs(p.x) > FACE.x1 || p.z < 0.06)) continue;
      n.subVectors(P[1], P[0]).cross(e.subVectors(P[2], P[0])).normalize();
      if (n.z < 0.05 || n.y < -0.7) continue;
      if (col && ids.some((i) => hexAt(col, i) === '110702') && P.some((p) => p.y > 1.765)) continue;
      if (col && ids.some((i) => EYES.has(hexAt(col, i)) || isBrow(hexAt(col, i), pos, i))) continue;
      pick.push(ids);
      for (const i of ids) (nrm.get(i) ?? nrm.set(i, new THREE.Vector3()).get(i)).add(n);
    }
    const out = [];
    const uv = [];
    const p = new THREE.Vector3();
    for (const ids of pick) {
      for (const i of ids) {
        p.fromBufferAttribute(pos, i);
        uv.push((p.x - FACE.x0) / (FACE.x1 - FACE.x0), (p.y - FACE.y0) / (FACE.y1 - FACE.y0));
        p.addScaledVector(nrm.get(i).normalize(), 0.0025).applyMatrix4(toHead);
        out.push(p.x, p.y, p.z);
      }
    }
    faceGeo = new THREE.BufferGeometry();
    faceGeo.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    faceGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    faceGeo.computeBoundingSphere();
    const map = new THREE.TextureLoader().load(faceUrl);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    faceMat = new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.82, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }
  const m = new THREE.Mesh(faceGeo, faceMat);
  m.renderOrder = 1;
  return m;
}

// sombrero blanco (copa, cinta y ala) y anteojos negros, en el espacio de la cabeza
const extras = {};
function hatMesh(source, color) {
  if (!extras.hat) {
    const { toHead } = headSpace(source);
    const crown = new THREE.CylinderGeometry(0.098, 0.112, 0.12, 14).translate(0, 1.875, 0.0);
    const brim = new THREE.CylinderGeometry(0.185, 0.19, 0.012, 18).translate(0, 1.818, 0.0);
    const band = new THREE.CylinderGeometry(0.1135, 0.1135, 0.026, 14).translate(0, 1.833, 0.0);
    extras.hat = [crown, brim].map((g) => g.applyMatrix4(toHead));
    extras.band = band.applyMatrix4(toHead);
  }
  const g = new THREE.Group();
  const felt = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  for (const geo of extras.hat) g.add(new THREE.Mesh(geo, felt));
  g.add(new THREE.Mesh(extras.band, new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.6 })));
  g.traverse((o) => (o.castShadow = !!o.isMesh));
  return g;
}
function shadesMesh(source) {
  if (!extras.shades) {
    const { toHead } = headSpace(source);
    const parts = [-1, 1].map((s) => new THREE.BoxGeometry(0.062, 0.038, 0.012).translate(s * 0.052, 1.704, 0.168));
    parts.push(new THREE.BoxGeometry(0.05, 0.008, 0.008).translate(0, 1.714, 0.17));
    extras.shades = parts.map((g) => g.applyMatrix4(toHead));
  }
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.15, metalness: 0.4 });
  for (const geo of extras.shades) g.add(new THREE.Mesh(geo, m));
  return g;
}

// Gaspi, Laban o Ciro con modelo de artista (null si todavía no cargaron los modelos)
export function makeStar(name) {
  const st = STARS[name];
  const s = Object.values(PEOPLE.scenes)
    .flat()
    .find((x) => x.f === st.file);
  if (!s) return null;
  const h = rigHuman(s.scene, { height: st.height });
  h.file = st.file;
  h.star = name;
  h.tall = st.height + 0.5; // donde va el globito de lo que dice
  h.rig.model.traverse((o) => {
    if (o.isMesh) o.geometry = paintGeometry(name, o.geometry, st.paint, st.brows);
  });
  if (st.bulk) {
    h.rig.model.scale.x *= st.bulk;
    h.rig.model.scale.z *= st.bulk;
  }
  const head = h.rig.map.head;
  if (head) {
    if (st.face) head.add(faceDecal(s.scene));
    if (st.hat != null) head.add(hatMesh(s.scene, st.hat));
    if (st.shades) head.add(shadesMesh(s.scene));
  }
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
