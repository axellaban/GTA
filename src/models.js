// Modelos bajados de internet (de uso libre, con crédito). Por ahora: la Ferrari 458 Italia de
// vicent091036 (Sketchfab), la del ejemplo de autos de three.js. Se maneja como cualquier auto.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { glassMat } from './cars.js';

export async function loadFerrari(color = 0xc8102e, { convertible = false } = {}) {
  const draco = new DRACOLoader().setDecoderPath('draco/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const gltf = await loader.loadAsync('models/ferrari.glb');
  draco.dispose();
  const model = gltf.scene;
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
        o.material = o.material === chrome ? chrome.clone() : o.material;
        o.material.clippingPlanes = [clip];
        o.material.clipShadows = true;
        o.material.side = THREE.DoubleSide;
      }
    }
  }
  model.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
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
