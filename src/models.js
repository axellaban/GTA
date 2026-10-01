// Modelos bajados de internet (de uso libre, con crédito). Por ahora: la Ferrari 458 Italia de
// vicent091036 (Sketchfab), la del ejemplo de autos de three.js. Se maneja como cualquier auto.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { glassMat } from './cars.js';

// El modelo original tiene 359.000 triángulos y viene con Draco: en el iPhone se quedaba sin
// memoria. Se simplificó una vez con glTF-Transform (sin UV ni normales, que no usa) a ~50.000
// y sin compresión; las normales se calculan acá. Se carga una sola vez y cada auto es un clon
// que comparte la geometría.
let base = null;
function ferrariBase() {
  base ??= new GLTFLoader().loadAsync('models/ferrari.glb').then((gltf) => {
    gltf.scene.traverse((o) => {
      if (o.isMesh && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
    });
    return gltf.scene;
  });
  return base;
}

export async function loadFerrari(color = 0xc8102e, { convertible = false } = {}) {
  const model = (await ferrariBase()).clone(true);
  // pintura con laca, cromados y vidrios como el resto de los autos
  const body = model.getObjectByName('body');
  if (body) {
    body.material = new THREE.MeshPhysicalMaterial({ color, metalness: convertible ? 0.25 : 0.6, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 });
    body.userData.paint = true;
  }
  const chrome = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.3, envMapIntensity: 1.5 });
  for (const n of ['rim_fl', 'rim_fr', 'rim_rr', 'rim_rl', 'trim']) {
    const o = model.getObjectByName(n);
    if (o) o.material = chrome;
  }
  const glass = model.getObjectByName('glass');
  if (glass) glass.material = convertible ? glassMat.clone() : glassMat;
  // descapotable: un plano de corte (en el mundo, horizontal) saca el techo y los parantes
  let clip = null;
  if (convertible) {
    clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.95);
    for (const o of [body, glass, model.getObjectByName('trim'), model.getObjectByName('carbon_fibre_trim'), model.getObjectByName('yellow_trim')]) {
      if (o?.material) {
        o.material = o.material.clone(); // propio: el corte no tiene que tocar a la otra Ferrari
        o.material.clippingPlanes = [clip];
        o.material.clipShadows = true;
        o.material.side = THREE.DoubleSide;
      }
    }
  }
  // sombra solo de la carrocería y las ruedas (las piezas chicas no se notan y cuestan)
  model.traverse((o) => {
    if (o.isMesh) o.castShadow = /body|wheel/.test(o.name) || /wheel/.test(o.parent?.name ?? '');
  });
  // las ruedas giran dentro de un pivote (el modelo las trae rotadas)
  const wheels = [];
  for (const n of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']) {
    const w = model.getObjectByName(n);
    if (!w) continue;
    const pivot = new THREE.Group();
    pivot.rotation.order = 'YXZ';
    pivot.position.copy(w.position);
    w.parent.add(pivot);
    pivot.add(w);
    w.position.set(0, 0, 0);
    wheels.push(pivot);
  }
  // el modelo mira hacia -z: se da vuelta para que mire a +z como los demás autos
  model.rotation.y = Math.PI;
  const g = new THREE.Group();
  g.add(model);
  g.userData = { L: 4.55, W: 1.95, wheels, spinSign: -1, kind: 'car', model: 'ferrari', tall: 1.25, clip };
  return g;
}
