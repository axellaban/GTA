// Piezas de las casas hechas en Blender (tools/blender/casas.py): la cornisa moldurada del frente (con la
// albardilla que tapa el pretil) y el equipo de afuera del aire acondicionado split. addBuildings
// (src/city.js) anota dónde va cada una; arrancan como las cajas de antes (la faja del frente y la caja
// blanca) y cuando carga el modelo se les cambia la geometría.
import * as THREE from 'three';
import { swapGeometry, loadBlenderMeshes } from './blender.js';

// lo que sobresale la cornisa de la pared: en una esquina entre dos frentes, cada tramo se estira eso
// para que se crucen (si no, queda una muesca)
const OVER = 0.22;

export class HouseKit {
  constructor() {
    this.cornices = [];
    this.airs = [];
  }

  // cornisa de un frente: de p0 a p1 (de izquierda a derecha mirando desde afuera) en el borde del techo h;
  // e0/e1: si se estira en esa punta (esquina con otro frente); depth: cuánto sobresale (1 = lo del modelo)
  cornice(p0, p1, h, e0, e1, color, depth = 1) {
    const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    if (L < 0.3) return;
    const dx = (p1[0] - p0[0]) / L;
    const dz = (p1[1] - p0[1]) / L;
    const a = -e0 * OVER;
    const b = L + e1 * OVER;
    const t = (a + b) / 2;
    this.cornices.push([p0[0] + dx * t, h, p0[1] + dz * t, Math.atan2(-dz, dx), (b - a) / 2, color, depth]);
  }

  // aire acondicionado con la espalda contra la pared (x, z: centro del equipo; rot: +z hacia afuera)
  air(x, y, z, rot) {
    this.airs.push([x, y, z, rot]);
  }

  build() {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    // la faja de antes, en el marco de un tramo de 2 m (hasta que carga la de Blender)
    const band = new THREE.BoxGeometry(2, 0.22, 0.14).translate(0, -0.14, 0.07);
    const cornices = new THREE.InstancedMesh(band, new THREE.MeshLambertMaterial(), Math.max(1, this.cornices.length));
    cornices.count = this.cornices.length;
    this.cornices.forEach(([x, y, z, rot, sx, color, sz], i) => {
      cornices.setMatrixAt(i, m4.compose(p.set(x, y, z), q.setFromAxisAngle(up, rot), s.set(sx, 1, sz)));
      cornices.setColorAt(i, color);
    });
    const airs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.45, 0.28), new THREE.MeshLambertMaterial({ color: 0xe6e6e6 }), Math.max(1, this.airs.length));
    airs.count = this.airs.length;
    this.airs.forEach(([x, y, z, rot], i) => airs.setMatrixAt(i, m4.compose(p.set(x, y, z), q.setFromAxisAngle(up, rot), s.set(1, 1, 1))));
    cornices.name = 'cornisas';
    airs.name = 'aires';
    cornices.castShadow = cornices.receiveShadow = true;
    airs.castShadow = airs.receiveShadow = true;
    // cuadrados más chicos para apagar de lejos (src/chunks.js)
    cornices.userData.cell = 160;
    airs.userData.cell = 120;
    loadBlenderMeshes('models/houses/casas.glb')
      .then((geo) => {
        if (geo.cornisa) swapGeometry(cornices, geo.cornisa);
        if (geo.aire) swapGeometry(airs, geo.aire, { white: true });
      })
      .catch((e) => console.warn('piezas de las casas:', e.message));
    return { cornices, airs };
  }
}
