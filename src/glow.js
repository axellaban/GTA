// Halos de luz de noche: faroles de sodio, faros y luces traseras de los autos,
// más un foco real que ilumina la calle delante del auto de Gaspi.
import * as THREE from 'three';

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function points(n, color, size, tex) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const m = new THREE.PointsMaterial({ color, size, map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0 });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

export class Glows {
  constructor(scene, city) {
    const tex = glowTexture();
    this.lamps = points(city.lamps.length, 0xffb455, 7, tex);
    const pos = this.lamps.geometry.attributes.position;
    city.lamps.forEach((l, i) => pos.setXYZ(i, l.x, 7.75, l.z));
    this.maxCars = 140;
    this.heads = points(this.maxCars * 2, 0xfff1c8, 2.4, tex);
    this.tails = points(this.maxCars * 2, 0xff2a18, 1.4, tex);
    scene.add(this.lamps, this.heads, this.tails);
    // foco del auto de Gaspi (siempre en escena para no recompilar materiales)
    this.spot = new THREE.SpotLight(0xfff0cc, 0, 45, 0.55, 0.5, 1.2);
    scene.add(this.spot, this.spot.target);
  }

  update(world, k) {
    const { traffic, player } = world;
    const on = k > 0.02;
    for (const p of [this.lamps, this.heads, this.tails]) {
      p.visible = on;
      p.material.opacity = Math.min(1, k * 1.2);
    }
    if (!on) {
      this.spot.intensity = 0;
      return;
    }
    const hp = this.heads.geometry.attributes.position;
    const tp = this.tails.geometry.attributes.position;
    let n = 0;
    const all = traffic.cars.concat(player.vehicle ? [player.vehicle] : []);
    for (const v of all) {
      if (n >= this.maxCars) break;
      if (!v.mesh.visible || v.kind === 'moto') continue;
      const fx = v.fx;
      const fz = v.fz;
      const rx = fz;
      const rz = -fx;
      const half = v.L / 2 + 0.05;
      const w = v.W / 2 - 0.28;
      const y = v.kind === 'bus' ? 0.9 : 0.62;
      for (const s of [-1, 1]) {
        hp.setXYZ(n * 2 + (s > 0 ? 1 : 0), v.x + fx * half + rx * w * s, y, v.z + fz * half + rz * w * s);
        tp.setXYZ(n * 2 + (s > 0 ? 1 : 0), v.x - fx * half + rx * w * s, y + 0.1, v.z - fz * half + rz * w * s);
      }
      n++;
    }
    this.heads.geometry.setDrawRange(0, n * 2);
    this.tails.geometry.setDrawRange(0, n * 2);
    hp.needsUpdate = true;
    tp.needsUpdate = true;
    const v = player.vehicle;
    if (v) {
      this.spot.intensity = 60 * k;
      this.spot.position.set(v.x + v.fx * (v.L / 2), 1.1, v.z + v.fz * (v.L / 2));
      this.spot.target.position.set(v.x + v.fx * 18, 0, v.z + v.fz * 18);
    } else this.spot.intensity = 0;
  }
}
