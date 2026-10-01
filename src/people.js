// Personas con modelo de artista (CC0): low-poly con textura pintada, como Vice City.
// Vienen de Mesh2Motion (github.com/scottpetrovic/mesh2motion-app, carpeta models-variation/human):
// autores elbolilloduro (varones, mujeres, policías, médico), todos CC0.
// Se cargan una vez; cada persona es un clon animado con nuestras poses (src/rig.js).
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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
