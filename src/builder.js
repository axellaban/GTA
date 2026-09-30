// Junta muchas cajas de colores en una sola malla (una llamada de dibujo en vez de veinte).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const tmp = new THREE.Color();

export class BoxBuilder {
  constructor() {
    this.geos = [];
  }
  add(geo, color, x = 0, y = 0, z = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    g.translate(x, y, z);
    tmp.set(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = tmp.r;
      arr[i * 3 + 1] = tmp.g;
      arr[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.geos.push(g);
    return this;
  }
  box(w, h, d, color, x, y, z) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z);
  }
  get empty() {
    return this.geos.length === 0;
  }
  geometry() {
    return mergeGeometries(this.geos);
  }
  mesh(material = vcMat) {
    const m = new THREE.Mesh(mergeGeometries(this.geos), material);
    m.castShadow = true;
    return m;
  }
}

// Cajas escritas directo en arreglos (24 vértices, indexadas): para miles de piezas chicas.
const FACES = [
  // normal, 4 esquinas en unidades de medio tamaño
  [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
  [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
  [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
  [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
  [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
  [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
];
export class FastBoxes {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
  }
  box(w, h, d, color, x, y, z) {
    tmp.set(color);
    for (const [n, corners] of FACES) {
      const b = this.pos.length / 3;
      for (const [cx, cy, cz] of corners) {
        this.pos.push(x + (cx * w) / 2, y + (cy * h) / 2, z + (cz * d) / 2);
        this.nor.push(n[0], n[1], n[2]);
        this.col.push(tmp.r, tmp.g, tmp.b);
      }
      this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
  // caja girada `rot` radianes alrededor del eje vertical (w a lo largo de la dirección rot)
  rbox(w, h, d, color, x, y, z, rot) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    tmp.set(color);
    for (const [n, corners] of FACES) {
      const b = this.pos.length / 3;
      const nx = n[0] * c + n[2] * s;
      const nz = -n[0] * s + n[2] * c;
      for (const [cx, cy, cz] of corners) {
        const lx = (cx * w) / 2;
        const lz = (cz * d) / 2;
        this.pos.push(x + lx * c + lz * s, y + (cy * h) / 2, z - lx * s + lz * c);
        this.nor.push(nx, n[1], nz);
        this.col.push(tmp.r, tmp.g, tmp.b);
      }
      this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
  mesh(material = vcMat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    const m = new THREE.Mesh(g, material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
}
