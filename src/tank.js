// Tanque del Ejército (un TAM, el Tanque Argentino Mediano): con 6 estrellas sale uno a buscarte por
// las calles, aplastando autos y tirando cañonazos que voltean casas (src/destroy.js). Como en GTA,
// se lo podés robar: sacás al tanquista y lo manejás vos. Lento y pesado, gira sobre sí mismo,
// la torreta sigue a la cámara y con clic dispara el cañón. Aguanta tiros y cohetes.
import * as THREE from 'three';
import { BoxBuilder } from './builder.js';
import { Vehicle } from './traffic.js';
import { makeHuman } from './human.js';
import { makeLook } from './people.js';
import { R } from './rng.js';

const OLIVE = 0x4b5a2a;
const OLIVE_D = 0x3a4620;
const TRACK = 0x1e1e1e;
const SHELL_CD = 1.6; // el jugador
const AI_CD = 4.8; // la IA

const tankMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.25 });
let geos = null;
function buildGeos() {
  // casco: entre las orugas, con la proa inclinada y los guardabarros arriba
  const H = new BoxBuilder();
  H.box(2.5, 0.9, 6.2, OLIVE, 0, 1.05, -0.1);
  H.add(new THREE.BoxGeometry(2.5, 0.12, 1.5).rotateX(-0.45).translate(0, 1.42, 3.45), OLIVE);
  H.add(new THREE.BoxGeometry(2.5, 0.12, 0.8).rotateX(0.6).translate(0, 0.78, 3.42), OLIVE_D);
  for (const s of [-1, 1]) {
    H.box(0.75, 0.08, 6.9, OLIVE_D, s * 1.3, 1.52, 0);
    // cajas de herramientas sobre el guardabarros
    H.box(0.5, 0.28, 1.1, OLIVE, s * 1.35, 1.7, -1.6);
    H.box(0.5, 0.22, 0.8, OLIVE, s * 1.35, 1.67, 0.6);
    // orugas: la banda, los dientes y la tapa lateral
    H.box(0.62, 0.95, 6.6, TRACK, s * 1.32, 0.5, 0);
    for (let k = 0; k < 22; k++) H.box(0.66, 0.06, 0.12, 0x2c2c2c, s * 1.32, 0.03, -3.15 + k * 0.3);
    H.box(0.05, 0.42, 6.2, OLIVE_D, s * 1.66, 1.2, 0);
  }
  // escape y luces
  H.box(1.2, 0.2, 0.15, 0x2a2a2a, 0, 1.3, -3.2);
  for (const s of [-1, 1]) H.box(0.18, 0.12, 0.08, 0xfff3cf, s * 0.95, 1.38, 3.8);
  // torreta: base, frente redondeado, escotilla del jefe y la ametralladora
  const T = new BoxBuilder();
  T.box(2.3, 0.72, 2.6, OLIVE, 0, 0.36, -0.2);
  T.add(new THREE.CylinderGeometry(1.15, 1.25, 0.72, 16, 1, false, -Math.PI / 2, Math.PI).translate(0, 0.36, 1.1), OLIVE);
  T.box(2.5, 0.1, 2.8, OLIVE_D, 0, 0.02, -0.2);
  T.box(1.6, 0.5, 0.9, OLIVE, 0, 0.3, -1.8);
  T.add(new THREE.CylinderGeometry(0.36, 0.38, 0.22, 14).translate(0.55, 0.83, -0.4), OLIVE_D);
  T.add(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 14).translate(0.55, 0.96, -0.4), 0x2a2f1a);
  T.box(0.06, 0.06, 0.9, 0x1a1a1a, 0.55, 1.1, 0.0);
  T.box(0.12, 0.18, 0.3, 0x1a1a1a, 0.55, 1.03, -0.35);
  T.box(0.7, 0.6, 0.35, OLIVE_D, 0, 0.38, 1.85);
  // escarapela (celeste, blanco, celeste) a los costados
  for (const s of [-1, 1]) {
    T.add(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 20).rotateZ(Math.PI / 2).translate(s * 1.16, 0.4, -0.4), 0x75aadb);
    T.add(new THREE.CylinderGeometry(0.17, 0.17, 0.025, 20).rotateZ(Math.PI / 2).translate(s * 1.165, 0.4, -0.4), 0xf4f4f4);
    T.add(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 20).rotateZ(Math.PI / 2).translate(s * 1.17, 0.4, -0.4), 0x75aadb);
  }
  // cañón con su freno de boca
  const C = new BoxBuilder();
  C.add(new THREE.CylinderGeometry(0.09, 0.11, 4.2, 12).rotateX(Math.PI / 2).translate(0, 0, 2.1), OLIVE_D);
  C.add(new THREE.CylinderGeometry(0.15, 0.15, 0.7, 12).rotateX(Math.PI / 2).translate(0, 0, 1.6), OLIVE);
  C.add(new THREE.CylinderGeometry(0.14, 0.14, 0.32, 12).rotateX(Math.PI / 2).translate(0, 0, 4.25), 0x2a2f1a);
  // rueda de rodaje (gira con la marcha)
  const Wg = new BoxBuilder();
  Wg.add(new THREE.CylinderGeometry(0.34, 0.34, 0.66, 14).rotateZ(Math.PI / 2), 0x2c2c2c);
  Wg.add(new THREE.CylinderGeometry(0.2, 0.2, 0.68, 10).rotateZ(Math.PI / 2), OLIVE_D);
  geos = { hull: H.geometry(), turret: T.geometry(), cannon: C.geometry(), wheel: Wg.geometry() };
}

export function makeTank() {
  if (!geos) buildGeos();
  const g = new THREE.Group();
  const chassis = new THREE.Group();
  const hull = new THREE.Mesh(geos.hull, tankMat);
  hull.castShadow = true;
  hull.receiveShadow = true;
  chassis.add(hull);
  const turret = new THREE.Group();
  turret.position.set(0, 1.58, -0.3);
  const tm = new THREE.Mesh(geos.turret, tankMat);
  tm.castShadow = true;
  turret.add(tm);
  const barrel = new THREE.Group();
  barrel.position.set(0, 0.4, 1.9);
  const cm = new THREE.Mesh(geos.cannon, tankMat);
  cm.castShadow = true;
  barrel.add(cm);
  turret.add(barrel);
  chassis.add(turret);
  g.add(chassis);
  const wheels = [];
  for (const s of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      const w = new THREE.Mesh(geos.wheel, tankMat);
      w.position.set(s * 1.32, 0.38, -2.5 + k * 1.0);
      w.scale.setScalar(0.92);
      g.add(w);
      wheels.push(w);
    }
  }
  g.userData = { L: 7.4, W: 3.4, wheels, kind: 'tank', model: 'tanque', tall: 2.6, chassis, turret, barrel, spinSign: 1 };
  return g;
}

export class Tanks {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.cool = 0;
    this.fireCd = 0;
  }

  // un tanque nuevo en una calle a 140–220 m de Gaspi, que sale a buscarlo
  spawn(world) {
    const P = world.player;
    const edges = (world.traffic.spawnEdges || []).filter((e) => {
      const d = Math.hypot(e.from.x + e.dx * e.len * 0.5 - P.x, e.from.z + e.dz * e.len * 0.5 - P.z);
      return d > 130 && d < 230 && e.street.w >= 7;
    });
    if (!edges.length) return null;
    const e = R.pick(edges);
    const x = e.from.x + e.dx * e.len * 0.5;
    const z = e.from.z + e.dz * e.len * 0.5;
    const mesh = makeTank();
    this.scene.add(mesh);
    const v = new Vehicle(mesh, x, z, Math.atan2(P.x - x, P.z - z));
    v.tankAI = { stuckT: 0, lx: x, lz: z, back: 0, cd: AI_CD * 0.6 };
    v.police = false;
    // el tanquista que sacás al robarlo
    v.eject = (veh, w) => this.ejectCrew(veh, w);
    this.list.push(v);
    world.hud.flash('¡EL EJÉRCITO!', 'Sacaron un tanque a la calle. Escondete... o robátelo', 'bad', 3);
    world.audio.sirena?.(1);
    return v;
  }

  ejectCrew(v, world) {
    v.tankAI = null;
    v.eject = null;
    // (del lado del conductor: la izquierda)
    const lx = Math.cos(v.heading);
    const lz = -Math.sin(v.heading);
    const look = { skin: R.pick([0xd9a882, 0xc68b62]), hair: 0x1a1a1a, hairStyle: 'buzz', top: 'long', shirt: 0x4b5320, pants: 0x4b5320, shoes: 0x111111, helmet: 0x3a4620 };
    const h = makeLook(look) || makeHuman(look);
    const d = world.npcs.spawnWalker({ x: v.x + lx * (v.W / 2 + 1.3), z: v.z + lz * (v.W / 2 + 1.3), heading: v.heading + Math.PI / 2 }, null, 0, 0, null, h);
    if (d) {
      world.npcs.hurt(d, 5, lx, lz, { knock: true, knockT: 1.8, world });
      d.after = 'flee';
      d.say('¡Me robaron el tanque! ¡Mi general me mata!', 3);
    }
    world.police.crime('robo_auto', v.x, v.z);
  }

  // un cañonazo desde la boca del cañón hacia donde apunta la torreta
  fire(world, v, shooter) {
    const u = v.mesh.userData;
    u.barrel.updateWorldMatrix(true, false);
    const o = new THREE.Vector3(0, 0, 4.4).applyMatrix4(u.barrel.matrixWorld);
    const d = new THREE.Vector3(0, 0, 1).transformDirection(u.barrel.matrixWorld);
    world.combat.fireRocket(world, { x: o.x, y: o.y, z: o.z }, d, shooter, { shell: true });
    world.fx.muzzle(o.x, o.y, o.z, d.x, d.z, true);
    world.fx.smoke(o.x, o.y, o.z, 8, { s0: 1, s1: 4, vx: d.x * 4, vz: d.z * 4, life: 0.9 });
    world.fx.dust(v.x, 0.3, v.z, 10, [0.6, 0.56, 0.5], 3);
    const P = world.player;
    const dd = Math.hypot(v.x - P.x, v.z - P.z);
    world.audio.explosion(Math.max(0.2, 1 - dd / 200) * 0.8);
    world.fx.shake += Math.max(0, 0.6 - dd / 60);
    // retroceso: la torreta pega un saltito
    u.recoil = 1;
  }

  update(dt, world) {
    const P = world.player;
    const police = world.police;
    this.cool -= dt;
    this.fireCd -= dt;
    // con 6 estrellas: uno por vez (si lo destruís o te lo robás, al rato sale otro)
    const ai = this.list.filter((v) => v.tankAI && !v.wreck);
    if (police.stars >= 6 && !ai.length && this.cool <= 0 && !P.dead) {
      this.cool = 45;
      this.spawn(world);
    }
    for (const v of this.list) {
      const u = v.mesh.userData;
      if (u.recoil > 0) {
        u.recoil = Math.max(0, u.recoil - dt * 4);
        u.barrel.position.z = 1.9 - Math.sin(u.recoil * Math.PI) * 0.35;
      }
      if (v.wreck) continue;
      if (v === P.vehicle) continue;
      // mientras Gaspi lo está asaltando, se queda quieto
      if (P.jack?.v === v) {
        v.speed = 0;
        continue;
      }
      if (v.tankAI) this.brain(v, dt, world);
    }
    // los que quedan lejos y sin nadie, se van
    this.list = this.list.filter((v) => {
      const far = Math.hypot(v.x - P.x, v.z - P.z) > 420 && v !== P.vehicle;
      if (far && (v.wreck || police.stars < 5)) {
        this.scene.remove(v.mesh);
        world.traffic.parked = world.traffic.parked.filter((o) => o !== v);
        return false;
      }
      return true;
    });
  }

  // la IA: va derecho hacia Gaspi esquivando paredes, pasa por arriba de los autos y tira
  brain(v, dt, world) {
    const P = world.player;
    const A = v.tankAI;
    const tgt = P.vehicle ?? P;
    const dx = tgt.x - v.x;
    const dz = tgt.z - v.z;
    const d = Math.hypot(dx, dz);
    const leaving = world.police.stars < 5 || P.dead;
    let want = Math.atan2(dx, dz);
    if (leaving) want += Math.PI;
    let diff = want - v.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    // trabado contra algo: marcha atrás girando
    if (A.back > 0) {
      A.back -= dt;
      v.speed = Math.max(-3, v.speed - dt * 4);
      v.heading += 0.7 * dt * (A.side || 1);
    } else {
      v.heading += Math.max(-0.75 * dt, Math.min(0.75 * dt, diff));
      const vmax = d < 18 && !leaving ? 2 : Math.abs(diff) > 0.6 ? 3 : 9;
      v.speed += Math.max(-5 * dt, Math.min(3 * dt, vmax - v.speed));
    }
    this.moveAndCrush(v, dt, world, false);
    A.stuckT += dt;
    if (A.stuckT > 2.5) {
      if (Math.hypot(v.x - A.lx, v.z - A.lz) < 1.2 && A.back <= 0) {
        A.back = 1.6;
        A.side = R.chance(0.5) ? 1 : -1;
      }
      A.stuckT = 0;
      A.lx = v.x;
      A.lz = v.z;
    }
    // la torreta apunta y tira (aunque haya una casa en el medio: la voltea)
    const u = v.mesh.userData;
    let ty = Math.atan2(dx, dz) - v.heading - u.turret.rotation.y;
    while (ty > Math.PI) ty -= Math.PI * 2;
    while (ty < -Math.PI) ty += Math.PI * 2;
    u.turret.rotation.y += Math.max(-1.2 * dt, Math.min(1.2 * dt, ty));
    A.cd -= dt;
    if (!leaving && A.cd <= 0 && Math.abs(ty) < 0.06 && d < 110 && d > 9) {
      this.fire(world, v, v);
      A.cd = AI_CD + R.range(-0.8, 1.2);
    }
    v.vx = v.fx * v.speed;
    v.vz = v.fz * v.speed;
    v.sync(dt);
  }

  // avanza, choca con las paredes y aplasta lo que encuentra (autos, gente, postes)
  moveAndCrush(v, dt, world, byPlayer) {
    v.x += v.fx * v.speed * dt;
    v.z += v.fz * v.speed * dt;
    let bump = 0;
    for (const c of v.circles()) {
      const p = { x: c.x, z: c.z };
      const hit = world.colliders.resolveCircle(p, c.r);
      if (hit && hit.box?.kind !== 'tree') {
        v.x += p.x - c.x;
        v.z += p.z - c.z;
        bump = Math.max(bump, hit.pen);
      } else if (hit) {
        // los árboles y los postes no paran un tanque
        v.x += (p.x - c.x) * 0.3;
        v.z += (p.z - c.z) * 0.3;
      }
    }
    if (bump > 0.05) v.speed *= 0.6;
    const sp = Math.abs(v.speed);
    const P = world.player;
    for (const o of world.combat.vehicles(world)) {
      if (o === v || o.wreck || Math.abs(o.x - v.x) > 9 || Math.abs(o.z - v.z) > 9) continue;
      for (const a of v.circles()) {
        for (const b of o.circles()) {
          const ex = b.x - a.x;
          const ez = b.z - a.z;
          const dd = Math.hypot(ex, ez);
          const min = a.r + b.r;
          if (dd >= min || dd < 0.001) continue;
          // el otro sale empujado; con el tanque andando, aplastado
          const pen = min - dd;
          o.x += (ex / dd) * pen;
          o.z += (ez / dd) * pen;
          if (o.kind === 'tank') continue;
          if (sp > 1) {
            world.combat.damageVehicle(world, o, (12 + sp * 6) * dt * 10, byPlayer, b.x, b.z);
            if (o.ai) o.speed = 0;
            if (Math.random() < dt * 8) world.audio.metal(0.6);
          }
          if (o === P.vehicle && !byPlayer) P.hurt(sp * 1.2 * dt * 10, 'Te aplastó un tanque');
        }
      }
    }
    if (sp > 1) {
      for (const n of world.npcs.list) {
        if (n.down || Math.abs(n.x - v.x) > 5 || Math.abs(n.z - v.z) > 5) continue;
        const lx = (n.x - v.x) * v.fz - (n.z - v.z) * v.fx;
        const lz = (n.x - v.x) * v.fx + (n.z - v.z) * v.fz;
        if (Math.abs(lx) < v.W / 2 + 0.3 && Math.abs(lz) < v.L / 2 + 0.3) {
          const res = world.npcs.hurt(n, 90, v.fx, v.fz, { knock: true, knockT: 3, byPlayer, world });
          if (byPlayer && res === 'muerte') world.police.crime('muerte', n.x, n.z);
        }
      }
      if (!byPlayer && !P.vehicle && !P.dead) {
        const lx = (P.x - v.x) * v.fz - (P.z - v.z) * v.fx;
        const lz = (P.x - v.x) * v.fx + (P.z - v.z) * v.fz;
        if (Math.abs(lx) < v.W / 2 + 0.3 && Math.abs(lz) < v.L / 2 + 0.3) {
          P.hurt(60, 'Te pasó por arriba un tanque');
          P.knockDown?.(2, lx > 0 ? v.fz : -v.fz, lx > 0 ? -v.fx : v.fx);
        }
      }
    }
  }

  // ---- manejado por el jugador ----
  drive(dt, world, v) {
    const { input, player: P } = world;
    const ax = input.axis();
    const throttle = -ax.y;
    const steer = -ax.x;
    const vmax = 12 * (1 - (v.damage || 0) / 300);
    const want = throttle * (throttle > 0 ? vmax : 5);
    v.speed += Math.max(-6 * dt, Math.min(3.5 * dt, want - v.speed));
    if (!throttle) v.speed *= Math.exp(-dt * 1.5);
    v.throttle = Math.abs(throttle); // el diésel ruge también marcha atrás y girando
    v.vmax = vmax;
    // gira sobre sí mismo (las orugas), más despacio a toda marcha
    v.heading += steer * (1.0 - Math.min(0.5, Math.abs(v.speed) / 24)) * dt * (v.speed < -0.5 ? -1 : 1);
    v.steer = 0;
    this.moveAndCrush(v, dt, world, true);
    // la torreta sigue a la cámara y el cañón sube un poco si apuntás arriba
    const u = v.mesh.userData;
    let ty = P.camYaw + Math.PI - v.heading - u.turret.rotation.y;
    while (ty > Math.PI) ty -= Math.PI * 2;
    while (ty < -Math.PI) ty += Math.PI * 2;
    u.turret.rotation.y += Math.max(-1.6 * dt, Math.min(1.6 * dt, ty));
    u.barrel.rotation.x = Math.max(-0.25, Math.min(0.08, -(P.camPitch - 0.2) * 0.5));
    if (input.hit('mouse0', 'attack') && this.fireCd <= 0) {
      this.fire(world, v, P);
      this.fireCd = SHELL_CD;
      world.police.crime('explosion', v.x, v.z);
    }
    v.vx = v.fx * v.speed;
    v.vz = v.fz * v.speed;
    v.sync(dt);
  }
}
