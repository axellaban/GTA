// Saltos acrobáticos: rampas amarillas en calles largas. Si pasás rápido, el auto vuela
// en cámara lenta y al caer te pagan por distancia y altura, como los "saltos insólitos".
import * as THREE from 'three';
import { ROADS, STATION } from './map.js';

export const RAMPS = 8;

// rampa: cuña de 4,2 m que sube 1,1 m, amarilla con franjas negras
function rampMesh() {
  const s = new THREE.Shape();
  s.moveTo(-2.1, 0);
  s.lineTo(2.1, 0);
  s.lineTo(2.1, 1.1);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 2.8, bevelEnabled: false }).translate(0, 0, -1.4);
  // el largo va en x: girarlo para que suba hacia +z
  g.rotateY(-Math.PI / 2);
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#f2c21a';
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#151515';
  for (let i = -64; i < 64; i += 24) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i + 12, 0);
    x.lineTo(i + 76, 64);
    x.lineTo(i + 64, 64);
    x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  m.castShadow = m.receiveShadow = true;
  return m;
}

export class Stunts {
  constructor(scene) {
    this.ramps = [];
    // tramos rectos largos, a distancias variadas de la estación y separados entre sí
    const cand = [];
    for (const r of ROADS) {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i];
        const [bx, bz] = r.pts[i + 1];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 70) continue;
        const x = (ax + bx) / 2;
        const z = (az + bz) / 2;
        const d = Math.hypot(x - STATION.x, z - STATION.z);
        if (d < 90 || d > 560) continue;
        cand.push({ x, z, dx: (bx - ax) / L, dz: (bz - az) / L, w: r.w ?? 8, d });
      }
    }
    cand.sort((a, b) => a.d - b.d);
    for (const c of cand) {
      if (this.ramps.length >= RAMPS) break;
      if (this.ramps.some((r) => Math.hypot(r.x - c.x, r.z - c.z) < 150)) continue;
      // en el carril de la derecha
      const off = c.w / 4;
      const r = { id: this.ramps.length, x: c.x - c.dz * off, z: c.z + c.dx * off, dx: c.dx, dz: c.dz };
      const m = rampMesh();
      m.position.set(r.x, 0.01, r.z);
      m.rotation.y = Math.atan2(r.dx, r.dz);
      scene.add(m);
      this.ramps.push(r);
    }
  }

  update(dt, world) {
    const P = world.player;
    const v = P.vehicle;
    // si se bajó en el aire, el auto vuelve al piso
    if (this.last && this.last !== v && this.last.air) {
      this.last.air = null;
      this.last.lift = 0;
      this.last.sync(0);
    }
    this.last = v;
    if (!v) return;
    if (v.air) {
      // en el aire: sigue derecho y cae; al tocar el piso, el premio
      const a = v.air;
      a.t += dt;
      a.vy -= 9.8 * dt;
      a.y += a.vy * dt;
      a.top = Math.max(a.top, a.y);
      if (a.y <= 0) {
        v.lift = 0;
        v.air = null;
        world.fx.shake += 0.35;
        world.audio.golpe?.(0.9);
        const dist = Math.hypot(v.x - a.x0, v.z - a.z0);
        if (a.t > 0.7 && dist > 12) {
          const pay = Math.round((dist * 60 + a.top * 400) / 100) * 100;
          const first = !P.saltos.has(a.id);
          P.saltos.add(a.id);
          P.addMoney(pay);
          if (first) P.addRespeto(1);
          world.audio.cumplida?.();
          world.hud.flash(first ? '¡SALTO INSÓLITO!' : 'SALTO', `${Math.round(dist)} m de largo · ${a.top.toFixed(1)} m de alto · +$${pay.toLocaleString('es-AR')}${first ? ` · ${P.saltos.size}/${RAMPS}` : ''}`, 'ok', 3);
        }
        return;
      }
      v.lift = a.y;
      return;
    }
    if (Math.abs(v.speed) < 11) return;
    for (const r of this.ramps) {
      const rx = v.x - r.x;
      const rz = v.z - r.z;
      const along = rx * r.dx + rz * r.dz;
      const lat = rx * r.dz - rz * r.dx;
      // hay que entrar por el lado bajo, en el sentido de la rampa
      const fwd = (v.fx * r.dx + v.fz * r.dz) * Math.sign(v.speed);
      if (Math.abs(lat) > 1.7 || fwd < 0.8) continue;
      if (along > 1.6 && along < 2.6) {
        v.air = { id: r.id, y: 1.1, vy: Math.abs(v.speed) * 0.34, t: 0, top: 1.1, x0: v.x, z0: v.z };
        world.audio.whoosh?.(0.6);
        break;
      }
    }
  }
}
