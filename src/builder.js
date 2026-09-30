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
  mesh(material = vcMat) {
    const m = new THREE.Mesh(mergeGeometries(this.geos), material);
    m.castShadow = true;
    return m;
  }
}
