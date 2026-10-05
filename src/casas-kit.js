// Piezas de las casas hechas en Blender (tools/blender/casas.py): la cornisa moldurada del frente (con la
// albardilla que tapa el pretil), el equipo de afuera del aire acondicionado split y el toldo de brazos
// de los comercios. addBuildings (src/city.js) anota dónde va cada una; arrancan como las cajas de antes
// (la faja del frente y la caja blanca) y cuando carga el modelo se les cambia la geometría. Los toldos
// nuevos aparecen recién cuando cargan (hasta ahí quedan los planos de siempre: hideOnLoad).
import * as THREE from 'three';
import { swapGeometry, loadBlenderMeshes } from './blender.js';

// lo que sobresale la cornisa de la pared: en una esquina entre dos frentes, cada tramo se estira eso
// para que se crucen (si no, queda una muesca)
const OVER = 0.22;

export class HouseKit {
  constructor() {
    this.cornices = [];
    this.airs = [];
    this.awnings = [[], [], [], []];
    this.arms = [];
    this.hideOnLoad = [];
  }

  // toldo de a ≈1,2 m sobre el frente de a (ax, az) a (bx, bz) (de izquierda a derecha mirando desde afuera),
  // enganchado a la altura y; row: los colores de las rayas (una fila de awningTexture)
  awning(ax, az, bx, bz, y, row) {
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.8) return;
    const n = Math.max(1, Math.round(L / 1.2));
    const dx = (bx - ax) / L;
    const dz = (bz - az) / L;
    const rot = Math.atan2(-dz, dx);
    for (let k = 0; k < n; k++) {
      const t = ((k + 0.5) * L) / n;
      this.awnings[row].push([ax + dx * t, y, az + dz * t, rot, L / (n * 1.2)]);
    }
    for (const t of [0.06, L - 0.06]) this.arms.push([ax + dx * t, y, az + dz * t, rot]);
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

  build({ awningTexture } = {}) {
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
    // toldos: una malla por combinación de colores; todas con la misma textura (se sube una vez y el lienzo
    // se libera: src/textures.js) y cada una con la v corrida a su fila cuando carga el modelo
    const empty = () => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Array(9).fill(0), 3));
    const awnings = [];
    let awnMat = null;
    if (awningTexture) {
      // (la v del glTF va para abajo: sin flipY, la fila r de la textura queda entre r/4 y (r + 1)/4)
      awningTexture.flipY = false;
      awningTexture.wrapS = THREE.RepeatWrapping;
      awnMat = new THREE.MeshLambertMaterial({ map: awningTexture, side: THREE.DoubleSide });
    }
    this.awnings.forEach((list, row) => {
      if (!list.length || !awnMat) return;
      const m = new THREE.InstancedMesh(empty(), awnMat, list.length);
      m.userData.row = row;
      list.forEach(([x, y, z, rot, sx], i) => m.setMatrixAt(i, m4.compose(p.set(x, y, z), q.setFromAxisAngle(up, rot), s.set(sx, 1, 1))));
      m.castShadow = m.receiveShadow = true;
      m.visible = false;
      m.userData.cell = 160;
      awnings.push(m);
    });
    const arms = new THREE.InstancedMesh(empty(), new THREE.MeshLambertMaterial(), Math.max(1, this.arms.length));
    arms.count = this.arms.length;
    this.arms.forEach(([x, y, z, rot], i) => arms.setMatrixAt(i, m4.compose(p.set(x, y, z), q.setFromAxisAngle(up, rot), s.set(1, 1, 1))));
    arms.visible = false;
    arms.userData.cell = 120;
    loadBlenderMeshes('models/houses/casas.glb')
      .then((geo) => {
        if (geo.cornisa) swapGeometry(cornices, geo.cornisa);
        if (geo.aire) swapGeometry(airs, geo.aire, { white: true });
        if (geo.toldo && geo.brazo) {
          for (const m of awnings) {
            const g = geo.toldo.clone();
            const uv = g.attributes.uv;
            for (let i = 0; i < uv.count; i++) uv.setY(i, (m.userData.row + uv.getY(i)) / 4);
            swapGeometry(m, g);
            m.visible = true;
          }
          swapGeometry(arms, geo.brazo);
          arms.visible = true;
          for (const o of this.hideOnLoad) o.visible = false;
        }
      })
      .catch((e) => console.warn('piezas de las casas:', e.message));
    return { cornices, airs, awnings, arms };
  }
}
