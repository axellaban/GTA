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
};

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
  return rigHuman(s.scene, { female, height: female ? R.range(1.6, 1.7) : R.range(1.7, 1.84) });
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
    const c = ANIMALS.clips.find((x) => x.name === clip);
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
