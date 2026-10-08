// Lo que se llevó el agua: cuando el bajo nivel se llena, en el fondo quedan cosas que la correntada
// arrastró (billeteras, una mochila, un celular). Brillan un poco para encontrarlas en el agua turbia y se
// agarran solo buceando (como los paquetes escondidos de los GTA). Cuando el agua baja, alguien las levanta.
import * as THREE from 'three';
import { LANES, sOf, depthAt } from './bajo-geo.js';

const COSAS = [
  { name: 'una billetera', plata: 3500, color: 0x4a2c1a, size: [0.11, 0.025, 0.09] },
  { name: 'una billetera', plata: 2800, color: 0x1d1d1f, size: [0.11, 0.025, 0.09] },
  { name: 'una mochila con plata', plata: 9000, color: 0x2b4a8a, size: [0.32, 0.14, 0.42] },
  { name: 'un celular (y la plata de la funda)', plata: 1800, color: 0x101214, size: [0.08, 0.012, 0.16] },
];

export class Tesoros {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.armado = false;
    const glow = document.createElement('canvas');
    glow.width = glow.height = 64;
    const g = glow.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,240,170,1)');
    gr.addColorStop(0.35, 'rgba(255,220,120,0.35)');
    gr.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    this.glowMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glow), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 });
  }

  // puntos en el fondo del bajo nivel (la parte honda y las rampas), sobre las dos manos
  lugares() {
    const out = [];
    for (const L of LANES) {
      for (let i = 0; i < L.length - 1; i++) {
        const [ax, az] = L[i];
        const [bx, bz] = L[i + 1];
        const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 6);
        for (let k = 0; k <= n; k++) {
          const x = ax + ((bx - ax) * k) / n;
          const z = az + ((bz - az) * k) / n;
          const s = sOf(x, z);
          // en la parte más honda (para bucear de verdad)
          if (depthAt(s) < -6) out.push({ x, z });
        }
      }
    }
    return out;
  }

  armar(world) {
    const spots = this.lugares();
    for (const c of COSAS) {
      const p = spots.splice((Math.random() * spots.length) | 0, 1)[0];
      if (!p) break;
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(...c.size), new THREE.MeshStandardMaterial({ color: c.color, roughness: 0.6 }));
      m.rotation.y = Math.random() * Math.PI;
      m.castShadow = false;
      g.add(m);
      const s = new THREE.Sprite(this.glowMat);
      s.scale.setScalar(0.9);
      s.position.y = 0.15;
      g.add(s);
      const x = p.x + (Math.random() - 0.5) * 3;
      const z = p.z + (Math.random() - 0.5) * 3;
      g.position.set(x, world.heightAt(x, z) + c.size[1] / 2 + 0.02, z);
      this.scene.add(g);
      this.list.push({ ...c, g, x, z, ph: Math.random() * 6 });
    }
    this.armado = true;
  }

  update(dt, world) {
    const ag = world.agua;
    if (!ag) return;
    // (con el bajo nivel lleno hasta la mitad ya hay cosas en el fondo)
    const lleno = ag.level > -6;
    if (lleno && !this.armado) this.armar(world);
    if (!lleno && this.armado && ag.level < -8.5) {
      for (const t of this.list) this.scene.remove(t.g);
      this.list = [];
      this.armado = false;
    }
    const P = world.player;
    const T = performance.now() / 1000;
    for (const t of this.list) {
      // titila apenas (para verlo de lejos en el agua turbia)
      t.g.children[1].material.opacity = 0.55 + Math.sin(T * 3 + t.ph) * 0.25;
      t.g.visible = Math.abs(t.x - P.x) < 60 && Math.abs(t.z - P.z) < 60;
      if (!P.diving) continue;
      const d = Math.hypot(t.x - P.x, t.z - P.z, t.g.position.y - P.y);
      if (d < 1.4) {
        t.taken = true;
        this.scene.remove(t.g);
        P.addMoney(t.plata);
        world.hud.flash('¡DEL FONDO!', `Encontraste ${t.name}: +$${t.plata.toLocaleString('es-AR')}`, 'ok', 2.6);
        world.audio.plata?.();
      }
    }
    this.list = this.list.filter((t) => !t.taken);
  }
}
