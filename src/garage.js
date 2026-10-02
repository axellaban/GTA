// Chapa y pintura como el Pay 'n' Spray de GTA: un taller con portón levadizo. Entrás despacio con
// el auto, la cámara queda afuera mirando el portón, baja la persiana, se escucha el soplete y el
// compresor, sube la persiana y sale el auto arreglado y de otro color (la cana te pierde).
import * as THREE from 'three';
import { makeMarker } from './missions.js';
import { paintMat, repairCar } from './cars.js';
import { CAR_COLORS } from './vehicles.js';
import { textTexture } from './textures.js';
import { R } from './rng.js';

export const GARAGE_COST = 1500;
const DOOR_W = 3.6;
const DOOR_H = 2.9;

function shutterTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  for (let y = 0; y < 256; y += 8) {
    g.fillStyle = y % 16 ? '#9aa3a8' : '#7d868c';
    g.fillRect(0, y, 128, 8);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, y + 7, 128, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Garages {
  constructor(scene, shops) {
    this.scene = scene;
    this.list = [];
    this.shutterTex = shutterTexture();
    for (const s of shops) if (s) this.build(s);
  }

  build(s) {
    const nx = s.nx;
    const nz = s.nz;
    // el frente del local (pickups.shops queda 1,6 m afuera)
    const fx = s.x - nx * 1.6;
    const fz = s.z - nz * 1.6;
    const g = new THREE.Group();
    g.position.set(fx, 0, fz);
    g.rotation.y = Math.atan2(nx, nz);
    // la boca oscura del taller (el auto "entra" ahí) con su marco
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, DOOR_H), new THREE.MeshBasicMaterial({ color: 0x07090b }));
    dark.position.set(0, DOOR_H / 2, 0.06);
    g.add(dark);
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, DOOR_H + 0.25, 0.22), frameMat);
      p.position.set(sx * (DOOR_W / 2 + 0.11), (DOOR_H + 0.25) / 2, 0.1);
      g.add(p);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + 0.44, 0.45, 0.4), frameMat);
    top.position.set(0, DOOR_H + 0.22, 0.18);
    g.add(top);
    // la persiana: un plano de chapa acanalada que sube y baja
    const shutter = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, DOOR_H), new THREE.MeshLambertMaterial({ map: this.shutterTex, side: THREE.DoubleSide }));
    shutter.position.set(0, DOOR_H / 2, 0.14);
    g.add(shutter);
    // cartel arriba, con el precio
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W + 0.6, 0.62), new THREE.MeshBasicMaterial({ map: textTexture(`CHAPA Y PINTURA · $${GARAGE_COST.toLocaleString('es-AR')}`, { w: 1024, h: 160, bg: '#1b5e20', fg: '#ffffff', font: 84, border: '#ffeb3b' }) }));
    sign.position.set(0, DOOR_H + 0.85, 0.42);
    g.add(sign);
    // luz giratoria naranja (se prende mientras trabajan)
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0x5a3a10 }));
    beacon.position.set(DOOR_W / 2 + 0.1, DOOR_H + 0.55, 0.45);
    g.add(beacon);
    g.traverse((o) => (o.castShadow = o.isMesh && o !== dark));
    this.scene.add(g);
    const marker = makeMarker();
    marker.userData.tube.material.color.set(0x3ddc84);
    marker.userData.ring.material.color.set(0x7dffb0);
    marker.scale.set(2.2, 1.4, 2.2);
    const mx = fx + nx * 4.2;
    const mz = fz + nz * 4.2;
    marker.position.set(mx, 0.15, mz);
    this.scene.add(marker);
    // shut: 0 = abierta (arriba), 1 = cerrada
    this.list.push({ x: mx, z: mz, fx, fz, nx, nz, g, shutter, beacon, marker, shut: 1, want: 0, state: 'idle', t: 0, used: false });
  }

  setShutter(gar, k) {
    gar.shut = k;
    const h = Math.max(0.02, k) * DOOR_H;
    gar.shutter.scale.y = Math.max(0.02, k);
    gar.shutter.position.y = DOOR_H - h / 2;
    this.shutterTex.repeat.set(1, Math.max(0.02, k));
  }

  // mientras el auto está adentro, la cámara mira el portón desde la calle
  camera(cam) {
    const gar = this.active;
    if (!gar) return false;
    const sx = gar.nz;
    const sz = -gar.nx;
    cam.position.set(gar.fx + gar.nx * 11 + sx * 4, 3.4, gar.fz + gar.nz * 11 + sz * 4);
    cam.lookAt(gar.fx + gar.nx * 1, 1.6, gar.fz + gar.nz * 1);
    return true;
  }

  update(dt, world) {
    const { player: P, police, hud, audio, fx } = world;
    const v = P.vehicle;
    for (const gar of this.list) {
      const near = Math.hypot(gar.x - P.x, gar.z - P.z) < 180;
      gar.marker.visible = near && gar.state === 'idle';
      // la persiana sube sola cuando te acercás con un auto (y baja si te vas)
      if (gar.state === 'idle') {
        const dv = v ? Math.hypot(gar.x - v.x, gar.z - v.z) : 99;
        gar.want = dv < 30 && v.kind !== 'moto' && v.kind !== 'bus' && v.kind !== 'tank' ? 0 : 1;
        const k = gar.shut + Math.sign(gar.want - gar.shut) * Math.min(Math.abs(gar.want - gar.shut), dt * 0.9);
        if (k !== gar.shut) this.setShutter(gar, k);
        if (dv > 7) gar.used = false;
        if (!v || gar.used || dv > 3.2 || Math.abs(v.speed) > 4 || gar.shut > 0.2) continue;
        gar.used = true;
        if (v.kind === 'moto' || v.kind === 'bus' || v.kind === 'tank') continue;
        if (!police.stars && !v.damage && !v.flat) {
          hud.flash('CHAPA Y PINTURA', 'Está impecable. Volvé cuando lo choques o te busque la cana', 'ok', 2.4);
          continue;
        }
        if (P.money < GARAGE_COST) {
          hud.flash('CHAPA Y PINTURA', `Son $${GARAGE_COST.toLocaleString('es-AR')} y no te alcanza`, 'bad', 2.4);
          continue;
        }
        // adentro: el auto entra solo por el portón
        gar.state = 'in';
        gar.t = 0;
        gar.v = v;
        gar.from = { x: v.x, z: v.z, h: v.heading };
        this.active = gar;
        P.cutscene = true;
        v.speed = 0;
        v.vx = v.vz = 0;
        continue;
      }
      gar.t += dt;
      const car = gar.v;
      const inX = gar.fx - gar.nx * 3;
      const inZ = gar.fz - gar.nz * 3;
      if (gar.state === 'in') {
        // del marcador hasta adentro, de trompa
        const k = Math.min(1, gar.t / 1.6);
        const e = k * k * (3 - 2 * k);
        car.x = gar.from.x + (inX - gar.from.x) * e;
        car.z = gar.from.z + (inZ - gar.from.z) * e;
        let dh = Math.atan2(-gar.nx, -gar.nz) - gar.from.h;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        car.heading = gar.from.h + dh * Math.min(1, e * 1.6);
        car.speed = 3;
        car.sync(dt);
        // pasó el frente: ya no se ve
        const front = (car.x - gar.fx) * gar.nx + (car.z - gar.fz) * gar.nz;
        car.mesh.visible = front > -0.5;
        if (k >= 1) {
          gar.state = 'work';
          gar.t = 0;
          car.mesh.visible = false;
        }
      } else if (gar.state === 'work') {
        // baja la persiana, trabajan (soplete, compresor) y la vuelve a subir
        if (gar.t < 0.9) this.setShutter(gar, Math.min(1, gar.t / 0.9));
        gar.spark = (gar.spark || 0) - dt;
        if (gar.t > 1 && gar.t < 3.6 && gar.spark <= 0) {
          gar.spark = 0.25;
          audio.burst(0.22, R.chance(0.5) ? 2600 : 900, 'bandpass', 0.18, 0, 1.2);
          if (R.chance(0.3)) audio.metal(0.3);
          // chispas y pintura que se escapan por abajo de la persiana
          fx.sparks(gar.fx + gar.nx * 0.3 + gar.nz * R.range(-1.2, 1.2), 0.15, gar.fz + gar.nz * 0.3 - gar.nx * R.range(-1.2, 1.2), 3, 2);
        }
        gar.beacon.material.color.set(Math.sin(gar.t * 14) > 0 ? 0xffa000 : 0x5a3a10);
        if (gar.t >= 3.6 && !gar.done) {
          gar.done = true;
          this.fix(world, car);
        }
        if (gar.t > 3.8) this.setShutter(gar, Math.max(0, 1 - (gar.t - 3.8) / 0.9));
        if (gar.t > 4.7) {
          gar.state = 'out';
          gar.t = 0;
          gar.done = false;
          gar.beacon.material.color.set(0x5a3a10);
          // sale de trompa: lo damos vuelta adentro
          car.heading = Math.atan2(gar.nx, gar.nz);
          car.mesh.visible = true;
        }
      } else if (gar.state === 'out') {
        const k = Math.min(1, gar.t / 1.3);
        const e = k * k * (3 - 2 * k);
        car.x = inX + (gar.x + gar.nx * 1.5 - inX) * e;
        car.z = inZ + (gar.z + gar.nz * 1.5 - inZ) * e;
        car.speed = 3 * (1 - k);
        car.sync(dt);
        if (k >= 1) {
          gar.state = 'idle';
          gar.used = true;
          car.speed = 0;
          car.vx = car.vz = 0;
          this.active = null;
          P.cutscene = false;
          P.x = car.x;
          P.z = car.z;
        }
      }
    }
  }

  fix(world, v) {
    const { player: P, police, hud, audio } = world;
    const wanted = police.stars > 0;
    P.addMoney(-GARAGE_COST);
    police.clear();
    Object.assign(v, { damage: 0, burning: 0, flat: false, warned: false });
    repairCar(v);
    if (!['taxi', 'remis', 'patrullero'].includes(v.model)) {
      // un solo color para todo lo pintado (carrocería, puerta, capó)
      let mat = null;
      v.mesh.traverse((o) => {
        if (o.userData.paint) o.material = mat ??= paintMat(R.pick(CAR_COLORS.filter((c) => c !== o.material.color.getHex())));
      });
    }
    audio.plata();
    hud.flash('CHAPA Y PINTURA', wanted ? 'Color nuevo: la cana ya no te reconoce' : 'Quedó como nuevo', 'ok', 2.8);
  }
}
