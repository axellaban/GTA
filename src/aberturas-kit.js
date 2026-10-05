// Marcos de ventanas y puertas hechos en Blender (tools/blender/aberturas.py): alféizar con goterón,
// guardapolvo con gola, jambas molduradas, umbral de granito y persianas de enrollar a medio bajar (con
// las tablillas renderizadas en Cycles). addFrames (src/city.js) anota cada pieza en la medida de la
// abertura pintada en la fachada; son instancias estiradas a lo largo (el perfil no cambia, así que no se
// deforma). Arrancan como las cajas de antes y cuando carga el modelo se les cambia la geometría.
import * as THREE from 'three';
import { swapGeometry, loadBlenderMeshes } from './blender.js';

// las cajas de antes, en el marco de cada pieza (hasta que carga el modelo)
const BOXES = {
  alfeizar: () => new THREE.BoxGeometry(1, 0.07, 0.17).translate(0, -0.035, 0.085),
  dintel: () => new THREE.BoxGeometry(1, 0.1, 0.09).translate(0, 0.05, 0.045),
  jamba: () => new THREE.BoxGeometry(0.06, 1, 0.05).translate(0, 0.5, 0.025),
  umbral: () => new THREE.BoxGeometry(1, 0.12, 0.4).translate(0, 0.06, 0.2),
  // (la persiana es nueva: no se ve hasta que carga)
  persiana: () => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Array(9).fill(0), 3)),
};
// persianas de PVC blancas o grises, de madera y alguna verde
export const SHUTTERS = [0xf2f0ea, 0xf2f0ea, 0xd4d6d8, 0xc9b28c, 0x8a6240, 0x5f8a62].map((c) => new THREE.Color(c));

export class OpeningKit {
  constructor() {
    this.at = {};
    for (const k of Object.keys(BOXES)) this.at[k] = [];
  }

  // pieza `name` con el origen en (x, y, z), girada `rot` (+z hacia afuera de la pared) y estirada
  put(name, x, y, z, rot, sx, sy, sz, color) {
    this.at[name].push([x, y, z, rot, sx, sy, sz, color]);
  }

  build() {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    const meshes = {};
    for (const [name, list] of Object.entries(this.at)) {
      if (!list.length) continue;
      const mat = new THREE.MeshLambertMaterial();
      const m = new THREE.InstancedMesh(BOXES[name](), mat, list.length);
      list.forEach(([x, y, z, rot, sx, sy, sz, c], i) => {
        m.setMatrixAt(i, m4.compose(p.set(x, y, z), q.setFromAxisAngle(up, rot), s.set(sx, sy, sz)));
        m.setColorAt(i, col.set(c));
      });
      m.castShadow = name !== 'persiana' && name !== 'jamba';
      m.receiveShadow = true;
      m.name = `aberturas-${name}`;
      // se apagan de lejos, de a cuadrados de 160 m (src/chunks.js)
      m.userData.cell = 160;
      meshes[name] = m;
    }
    Promise.all([loadBlenderMeshes('models/houses/aberturas.glb'), new THREE.TextureLoader().loadAsync('textures/persiana.webp')])
      .then(([geo, slats]) => {
        for (const [name, m] of Object.entries(meshes)) if (geo[name]) swapGeometry(m, geo[name]);
        if (meshes.persiana) {
          slats.colorSpace = THREE.SRGBColorSpace;
          // las coordenadas del glTF ya vienen con la v para abajo
          slats.flipY = false;
          slats.anisotropy = 4;
          meshes.persiana.material.map = slats;
          meshes.persiana.material.needsUpdate = true;
        }
      })
      .catch((e) => console.warn('aberturas de Blender:', e.message));
    return Object.values(meshes);
  }
}
