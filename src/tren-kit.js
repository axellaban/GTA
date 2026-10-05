// Coches del tren hechos en Blender (tools/blender/tren.py): carrocería con hombros redondeados (con la
// textura de siempre: ventanas con gente, puertas y franjas), trompa con parabrisas y faros, bogies con
// ruedas, equipos de abajo y del techo, fuelles y el pantógrafo del eléctrico. makeTrainCar (src/vehicles.js)
// arma el coche de cajas de antes y lo anota acá: cuando carga el modelo (o enseguida, si ya cargó) se le
// cambian las piezas. trains.js solo mueve el grupo, así que no se entera.
import * as THREE from 'three';
import { loadBlenderMeshes } from './blender.js';

const L = 19.6;
let geo = null;
const pending = [];
const parts = new THREE.MeshLambertMaterial({ vertexColors: true });

loadBlenderMeshes('models/vehicles/tren.glb')
  .then((g) => {
    if (!g.tren_caja || !g.tren_cabina) return;
    // la textura del costado es de lienzo (flipY): la v del glTF va al revés
    for (const k of ['tren_caja', 'tren_cabina']) {
      const uv = g[k].attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    }
    geo = g;
    for (const p of pending.splice(0)) upgrade(p);
  })
  .catch((e) => console.warn('tren de Blender:', e.message));

// car: el grupo de makeTrainCar; side: su material con la textura del costado
export function trainKit(car, kind, cab, side) {
  const p = { car, kind, cab, side };
  if (geo) upgrade(p);
  else pending.push(p);
}

function upgrade({ car, kind, cab, side }) {
  for (const c of [...car.children]) car.remove(c);
  // la sombra de contacto horneada también en la carrocería
  side.vertexColors = true;
  side.needsUpdate = true;
  const add = (g, mat, z = 0, ry = 0) => {
    if (!g) return;
    const m = new THREE.Mesh(g, mat);
    m.position.z = z;
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    car.add(m);
  };
  add(cab ? geo.tren_cabina : geo.tren_caja, side);
  add(geo.tren_bajo, parts);
  add(geo.tren_techo, parts);
  if (kind === 'electrico') add(geo.pantografo, parts, 3);
  if (cab) add(kind === 'diesel' ? geo.tren_frente_d : geo.tren_frente_e, parts);
  // fuelles en las puntas que dan a otro coche
  add(geo.tren_fuelle, parts, -L / 2, Math.PI);
  if (!cab) add(geo.tren_fuelle, parts, L / 2);
}
