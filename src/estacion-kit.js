// Molduras de la estación hechas en Blender (tools/blender/estacion.py): arquivoltas con clave e
// impostas sobre los arcos pintados en la fachada (drawEstacion en textures.js), jambas, alféizares,
// la cornisa de arriba, la guarda entre pisos y el zócalo. addBuildings (src/city.js) anota dónde va
// cada pieza; las instancias arrancan sin forma (la fachada pintada se ve igual que antes) y cuando
// el modelo carga se cambia la geometría en el lugar (los pedazos de src/chunks.js la comparten).
import * as THREE from 'three';
import { CELL_W, CELL_H } from './textures.js';
import { swapGeometry, loadBlenderMeshes } from './blender.js';

const FLOOR_H = 3.1;
// lo que sobresale cada pieza que corre a lo largo de la pared: se estira eso en cada punta para
// que en las esquinas las de las dos paredes se crucen en vez de dejar un hueco
const DEPTH = { cornisa: 0.34, guarda: 0.07, zocalo: 0.07 };
// guarda: tapa la franja crema pintada arriba de la planta baja y la de abajo del primer piso
const GUARDA_Y = FLOOR_H + 0.07;
const GUARDA_SY = 1.4;
// zócalo: hasta donde empiezan las puertas pintadas (14 px de la celda de planta baja)
const ZOCALO_SY = ((14 / CELL_H) * FLOOR_H) / 0.45;

export class StationFacade {
  constructor() {
    this.at = { arco: [], jambas: [], alfeizar: [], cornisa: [], guarda: [], zocalo: [] };
  }

  put(name, x, y, z, rot, sx = 1, sy = 1) {
    this.at[name].push([x, y, z, rot, sx, sy]);
  }

  // los vanos de un paño de pared (los que registró drawEstacion): (x0, z0) -> (x1, z1) de izquierda
  // a derecha mirando desde afuera, de y a yy de alto
  openings(x0, z0, x1, z1, y, yy, open) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const dx = (x1 - x0) / len;
    const dz = (z1 - z0) / len;
    const rot = Math.atan2(-dz, dx);
    const H = yy - y;
    for (const o of open) {
      const w = (o.x1 - o.x0) * len;
      const t = ((o.x0 + o.x1) / 2) * len;
      const x = x0 + dx * t;
      const z = z0 + dz * t;
      const top = yy - o.y0 * H;
      const bot = yy - o.y1 * H;
      // el arco pintado es medio óvalo: el ancho del vano por 35 px de la celda de alto
      const rv = (((o.x1 - o.x0) * CELL_W) / 2 / CELL_H) * H;
      const spring = top - rv;
      this.put('arco', x, spring, z, rot, w, rv * 2);
      this.put('jambas', x, spring, z, rot, w, spring - bot);
      if (o.kind === 'window') this.put('alfeizar', x, bot, z, rot, w, 1);
    }
  }

  // cornisa, guarda y zócalo a lo largo de una pared entera, en tramos de 2 m estirados para que
  // entren justo
  edge(ax, az, bx, bz, h) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.5) return;
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    const rot = Math.atan2(-dz, dx);
    // la cornisa ocupa el último piso, el que queda a medias debajo del techo
    const y0 = Math.floor((h - 0.01) / FLOOR_H) * FLOOR_H;
    const runs = [
      ['cornisa', y0, (h - y0) / 0.65],
      ['guarda', GUARDA_Y, GUARDA_SY],
      ['zocalo', 0, ZOCALO_SY],
    ];
    for (const [name, y, sy] of runs) {
      if (name === 'guarda' && h < FLOOR_H * 1.5) continue;
      const e = DEPTH[name];
      const L = len + e * 2;
      const n = Math.max(1, Math.round(L / 2));
      for (let k = 0; k < n; k++) {
        const t = -e + (L * (k + 0.5)) / n;
        this.put(name, ax + dx * t, y, az + dz * t, rot, L / (n * 2), sy);
      }
    }
  }

  build() {
    const cream = new THREE.MeshStandardMaterial({ color: 0xe7dcc3, roughness: 0.85 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.9 });
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const meshes = {};
    for (const [name, list] of Object.entries(this.at)) {
      if (!list.length) continue;
      // sin forma hasta que carga el modelo: un triángulo vacío
      const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Array(9).fill(0), 3));
      const m = new THREE.InstancedMesh(g, name === 'zocalo' ? stone : cream, list.length);
      list.forEach(([x, y, z, rot, sx, sy], i) => {
        m4.compose(p.set(x, y, z), q.setFromAxisAngle(up, rot), s.set(sx, sy, 1));
        m.setMatrixAt(i, m4);
      });
      // solo las piezas grandes tiran sombra (la cornisa sobre la fachada, los arcos)
      m.castShadow = name === 'cornisa' || name === 'arco';
      m.receiveShadow = true;
      meshes[name] = m;
    }
    loadBlenderMeshes('models/station/fachada.glb')
      .then((geo) => {
        for (const [name, m] of Object.entries(meshes)) if (geo[name]) swapGeometry(m, geo[name]);
      })
      .catch((e) => console.warn('molduras de la estación:', e.message));
    return Object.values(meshes);
  }
}
