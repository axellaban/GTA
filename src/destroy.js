// Casas que se vienen abajo: los cañonazos del tanque, el láser del plato volador (y, de a poco, la
// bazuca) le sacan "vida" a la casa donde pegan; cuando se le acaba, se derrumba: la geometría de esa
// huella se hunde hasta el piso en un par de segundos, sale una nube de polvo, quedan escombros
// humeando y las paredes dejan de chocar. No se caen la estación ni los locales con interior.
import * as THREE from 'three';
import { FastBoxes } from './builder.js';
import { pointInRing } from './city.js';
import { R } from './rng.js';

const tmp = new THREE.Matrix4();
const pos = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function distToRing(x, z, r) {
  let best = Infinity;
  for (let i = 0; i < r.length; i++) {
    const [ax, az] = r[i];
    const [bx, bz] = r[(i + 1) % r.length];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

export class Destroy {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.anims = [];
    this.fires = [];
    this.count = 0;
    for (const b of city.buildingList || []) {
      let x0 = Infinity;
      let x1 = -Infinity;
      let z0 = Infinity;
      let z1 = -Infinity;
      let area = 0;
      const r = b.ring;
      for (let i = 0; i < r.length; i++) {
        const [x, z] = r[i];
        const [x2, z2] = r[(i + 1) % r.length];
        area += x * z2 - x2 * z;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        z0 = Math.min(z0, z);
        z1 = Math.max(z1, z);
      }
      b.box = { x0, x1, z0, z1 };
      b.area = Math.abs(area) / 2;
      b.hp = 60 + b.area * 0.35 + b.h * 6;
    }
  }

  // la casa en (x, z) (o la de pared más cerca, a menos de 1,2 m)
  buildingAt(x, z) {
    let best = null;
    let bd = 1.2;
    for (const b of this.city.buildingList || []) {
      if (b.down) continue;
      const k = b.box;
      if (x < k.x0 - 1.5 || x > k.x1 + 1.5 || z < k.z0 - 1.5 || z > k.z1 + 1.5) continue;
      if (pointInRing(x, z, b.ring)) return b;
      const d = distToRing(x, z, b.ring);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  protectedBuilding(b, world) {
    // la estación y la torre del helipuerto (src/heli.js) no se caen
    if (b.kind === 'estacion' || b === world.tower?.building || b.b?.extra === 'tobogan' || b.b?.extra === 'clau') return true;
    const doors = world.interiors?.doors || [];
    for (const d of doors) if (distToRing(d.outside.x, d.outside.z, b.ring) < 3.5 || pointInRing(d.outside.x, d.outside.z, b.ring)) return true;
    if (world.gym?.x != null && pointInRing(world.gym.x, world.gym.z, b.ring)) return true;
    return false;
  }

  // un impacto de fuerza `dmg` en (x, z)
  hit(world, x, z, dmg) {
    const b = this.buildingAt(x, z);
    if (!b || this.protectedBuilding(b, world)) return false;
    b.hp -= dmg;
    // se va rajando: polvo y cascotes en cada golpe
    world.fx.dust(x, 1.5, z, 10, [0.62, 0.58, 0.52], 2.2);
    if (b.hp > 0) return false;
    this.collapse(world, b);
    return true;
  }

  collapse(world, b) {
    b.down = true;
    this.count++;
    const ring = b.ring;
    const k = b.box;
    const inside = (x, z) => x > k.x0 - 0.6 && x < k.x1 + 0.6 && z > k.z0 - 0.6 && z < k.z1 + 0.6 && (pointInRing(x, z, ring) || distToRing(x, z, ring) < 0.45);
    // las paredes dejan de chocar
    for (const s of b.segs || []) s.gone = true;
    const parts = [];
    // la ciudad fija: las mallas sueltas de la escena y sus pedazos (src/chunks.js los cuelga de la original)
    const list = [];
    this.scene.traverse((o) => {
      if (o.isMesh && !o.isSkinnedMesh && (o.parent === this.scene || o.userData.chunk)) list.push(o);
    });
    for (const o of list) {
      if (o.isInstancedMesh) {
        if (!o.userData.static && !o.userData.chunk) continue;
        // tanques de agua, antenas y aires del techo: desaparecen
        let changed = false;
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, tmp);
          pos.setFromMatrixPosition(tmp);
          if (pos.y > 1.2 && inside(pos.x, pos.z)) {
            o.setMatrixAt(i, ZERO);
            changed = true;
          }
        }
        if (changed) o.instanceMatrix.needsUpdate = true;
        continue;
      }
      const g = o.geometry;
      const p = g?.attributes?.position;
      if (!p || (!o.userData.chunk && p.count < 300)) continue;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox;
      if (bb.max.x < k.x0 - 1 || bb.min.x > k.x1 + 1 || bb.max.z < k.z0 - 1 || bb.min.z > k.z1 + 1) continue;
      const idx = [];
      const y0 = [];
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y < 0.4) continue;
        if (!inside(p.getX(i), p.getZ(i))) continue;
        idx.push(i);
        y0.push(y);
      }
      if (idx.length) parts.push({ g, idx, y0, yt: y0.map((y) => 0.15 + Math.random() * Math.min(1.4, y * 0.15)) });
    }
    this.anims.push({ parts, t: 0, dur: 2.2, b });
    // ruido, polvo y escombros
    let cx = 0;
    let cz = 0;
    for (const [x, z] of ring) {
      cx += x;
      cz += z;
    }
    cx /= ring.length;
    cz /= ring.length;
    b.center = { x: cx, z: cz };
    const P = world.player;
    const d = Math.hypot(P.x - cx, P.z - cz);
    world.audio.explosion(Math.max(0.2, 1 - d / 160));
    world.audio.trueno?.(0.6);
    world.fx.shake += Math.max(0, 1.4 - d / 40);
    for (let i = 0; i < 6; i++) world.fx.dust(cx + R.range(-3, 3), R.range(1, b.h), cz + R.range(-3, 3), 14, [0.66, 0.62, 0.56], 4 + b.h * 0.4);
    world.fx.smoke(cx, b.h * 0.6, cz, 14, { s0: 3, s1: 9, life: 2.5, rise: 1.2, a: 0.55 });
    this.rubble(b, cx, cz);
    this.fires.push({ x: cx, z: cz, t: 14, r: Math.min(6, Math.sqrt(b.area) * 0.4) });
    // la gente de alrededor sale disparada
    for (const n of world.npcs.list) {
      const dn = Math.hypot(n.x - cx, n.z - cz);
      if (dn < Math.sqrt(b.area) * 0.7 + 3 && !n.killed) world.npcs.hurt(n, 60, (n.x - cx) / (dn || 1), (n.z - cz) / (dn || 1), { knock: true, knockT: 3, world });
    }
    world.npcs.panic(cx, cz, 70);
    world.police.crime('explosion', cx, cz);
    world.hud.toast(b.kind === 'casa' ? '¡Se vino abajo la casa!' : '¡Se vino abajo el edificio!', 2);
  }

  // montaña de cascotes, ladrillos y chapas en la huella
  rubble(b, cx, cz) {
    const F = new FastBoxes();
    const n = Math.min(120, 20 + Math.round(b.area * 0.25));
    const cols = [0xa45a3a, 0x8f8a80, 0xb9ad98, 0x6b625a, 0xc9a882, 0x5a5550];
    for (let i = 0; i < n; i++) {
      let x = cx;
      let z = cz;
      for (let t = 0; t < 8; t++) {
        x = R.range(b.box.x0, b.box.x1);
        z = R.range(b.box.z0, b.box.z1);
        if (pointInRing(x, z, b.ring)) break;
      }
      const s = R.range(0.3, 1.3);
      F.rbox(s, R.range(0.15, 0.6) * s, s * R.range(0.5, 1), R.pick(cols), x, R.range(0.1, 0.5) + Math.max(0, 0.6 - Math.hypot(x - cx, z - cz) * 0.05), z, R.range(0, Math.PI));
    }
    const m = F.mesh(new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = true;
    m.receiveShadow = true;
    this.scene.add(m);
  }

  update(dt, world) {
    for (const a of this.anims) {
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      // cae con aceleración (como con gravedad), los de arriba primero
      const e = k * k;
      for (const p of a.parts) {
        const at = p.g.attributes.position;
        for (let j = 0; j < p.idx.length; j++) {
          const y0 = p.y0[j];
          const kk = Math.min(1, e * (1 + y0 * 0.04));
          at.setY(p.idx[j], y0 + (p.yt[j] - y0) * kk);
        }
        at.needsUpdate = true;
      }
      if (Math.random() < dt * 20 && a.b.center) world.fx.dust(a.b.center.x + R.range(-4, 4), R.range(0.5, 3), a.b.center.z + R.range(-4, 4), 4, [0.66, 0.62, 0.56], 3);
      if (k >= 1) {
        a.done = true;
        for (const p of a.parts) {
          p.g.computeVertexNormals();
          p.g.computeBoundingSphere();
          p.g.computeBoundingBox();
        }
      }
    }
    this.anims = this.anims.filter((a) => !a.done);
    // los escombros siguen ardiendo un rato
    for (const f of this.fires) {
      f.t -= dt;
      if (Math.random() < dt * 8) world.fx.fire(f.x + R.range(-f.r, f.r), 0.6, f.z + R.range(-f.r, f.r), 2, 0.8);
      if (Math.random() < dt * 3) world.fx.smoke(f.x + R.range(-f.r, f.r), 1.5, f.z + R.range(-f.r, f.r), 1, { black: true, s0: 1.5, s1: 6 });
    }
    this.fires = this.fires.filter((f) => f.t > 0);
  }
}
