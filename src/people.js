// Personas con modelo de artista (CC0): low-poly con textura pintada, como Vice City.
// Vienen de Mesh2Motion (github.com/scottpetrovic/mesh2motion-app, carpeta models-variation/human):
// autores elbolilloduro (varones, mujeres, policías, médico), todos CC0.
// Se cargan una vez; cada persona es un clon animado con nuestras poses (src/rig.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { rigHuman } from './rig.js';
import { R } from './rng.js';

const SETS = {
  male: ['male_5', 'male_6', 'male_10', 'male_15', 'male_32', 'doctor_m'],
  female: ['female_8', 'female_9', 'female_31'],
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
  m.onBeforeCompile = (shader) => {
    THREE.Material.prototype.onBeforeCompile.call(m, shader);
    shader.uniforms.uTint = { value: new THREE.Vector3(hue, sat, val) };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint;\n' + TINT_GLSL)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
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

export const PEOPLE = { ready: false, scenes: {} };

export function loadPeople() {
  const loader = new GLTFLoader();
  const jobs = [];
  for (const [kind, list] of Object.entries(SETS)) {
    for (const f of list) {
      jobs.push(
        loader
          .loadAsync(`models/people/${f}.glb`)
          .then((g) => (PEOPLE.scenes[kind] ??= []).push({ f, scene: g.scene }))
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
  // los vecinos con ropa de otro color (los uniformes quedan como son)
  if (kind === 'male' || kind === 'female') {
    const hue = R.chance(0.25) ? 0 : Math.random();
    const sat = R.range(0.75, 1.3);
    const val = R.range(0.72, 1.18);
    h.rig.model.traverse((o) => {
      if (o.isMesh && o.material?.map) o.material = tintClothes(o.material, hue, sat, val);
    });
  }
  return h;
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
