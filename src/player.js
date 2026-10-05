// Gaspi: caminar, correr, saltar, pelear, apuntar, robar autos y motos, manejar con derrape.
import * as THREE from 'three';
import { makeGaspi, animateHuman } from './human.js';
import { WEAPONS } from './weapons.js';
import { R } from './rng.js';
import { carEffects } from './carfx.js';
import { SIGNS } from './props.js';
import { walkwayHeight } from './physics.js';
import { lowFilter } from './bajonivel.js';
import { turnRollover, recoverRollover, sideImpactRollover } from './vehicle-physics.js';

const WALK = 2.3;
const RUN = 6.3;
const tmpV = new THREE.Vector3();

// cómo anda cada vehículo
function stats(v) {
  if (v.kind === 'moto') return { acc: 11, vmax: 29, rev: 4, turn: 2.7, grip: 13, brake: 16 };
  if (v.kind === 'bus') return { acc: 3.5, vmax: 16, rev: 3, turn: 1.1, grip: 10, brake: 10 };
  if (v.kind === 'carro') return { acc: 1.4, vmax: 4.8, rev: 1, turn: 1.1, grip: 20, brake: 6 };
  if (v.model === 'camion') return { acc: 4, vmax: 19, rev: 3, turn: 1.2, grip: 9, brake: 11 };
  if (v.model === 'trafic') return { acc: 6, vmax: 24, rev: 4, turn: 1.6, grip: 8.5, brake: 13 };
  if (v.model === 'fiat600') return { acc: 6, vmax: 22, rev: 4, turn: 2.2, grip: 8, brake: 13 };
  if (v.model === 'firetruck') return { acc: 4.5, vmax: 24, rev: 3, turn: 1.3, grip: 9, brake: 12 };
  if (v.model === 'ambulance') return { acc: 7, vmax: 31, rev: 4, turn: 1.7, grip: 8.5, brake: 14 };
  if (v.model?.startsWith('ferrucho')) return { acc: 15, vmax: 47, rev: 5, turn: 2.2, grip: 10.5, brake: 19 };
  if (v.model === 'falcon' || v.model === 'patrullero') return { acc: 9.5, vmax: 33, rev: 5, turn: 1.9, grip: 7.5, brake: 15 };
  // los modernos de artista: los deportivos tiran más, la SUV es más pesada
  if (v.model === 'q_coupe' || v.model === 'q_sport') return { acc: 12, vmax: 39, rev: 5, turn: 2.1, grip: 9.5, brake: 17 };
  if (v.model === 'q_suv') return { acc: 8, vmax: 31, rev: 5, turn: 1.75, grip: 8, brake: 14 };
  return { acc: 8.5, vmax: 30, rev: 5, turn: 2.0, grip: 8.5, brake: 15 };
}

export class Player {
  constructor(scene, city, heightAt) {
    this.h = makeGaspi();
    this.h.root.rotation.order = 'YXZ';
    scene.add(this.h.root);
    this.scene = scene;
    this.city = city;
    this.heightAt = heightAt;
    // pisos en altura (el puente peatonal de la estación y sus escaleras)
    this.walkways = city.walkways || [];
    this.spawn = { x: 0, z: 0, face: 0 };
    this.x = 0;
    this.z = 0;
    this.y = 0.15;
    this.vy = 0;
    this.heading = 0;
    this.speed = 0;
    this.camYaw = Math.PI;
    this.camPitch = 0.28;
    this.vehicle = null;
    this.money = 20000;
    this.health = 100;
    this.armor = 0;
    this.figus = new Set(); // figuritas encontradas (ids)
    this.saltos = new Set(); // saltos insólitos hechos (ids de rampa)
    this.respeto = 0;
    this.phone = true;
    this.grabbed = 0;
    this.dead = false;
    this.deadT = 0;
    this.lastLook = 0;
    this.r = 0.35;
    this.hooks = {};
    this.aimK = 0;
    this.downT = 0;
    this.getupT = 0;
    this.blockT = 0;
    this.buffs = {};
  }

  setSpawn(p) {
    this.spawn = p;
    this.x = p.x;
    this.z = p.z;
    this.heading = p.face ?? 0;
    this.camYaw = this.heading + Math.PI; // la cámara atrás, mirando hacia donde mira Gaspi
  }

  addMoney(n) {
    this.money = Math.max(0, this.money + n);
    this.hooks.money?.(n);
  }
  addRespeto(n) {
    this.respeto = Math.max(-20, Math.min(99, this.respeto + n));
    this.hooks.respeto?.(n);
  }
  hurt(n, msg) {
    if (this.ufo) return;
    if (this.dead) return;
    // el chaleco se come la mayor parte
    if (this.armor > 0) {
      const a = Math.min(this.armor, n * 0.7);
      this.armor -= a;
      n -= a;
    }
    this.health -= n;
    this.hurtT = 0.4;
    this.hooks.hurt?.(n, msg);
    if (this.health <= 0) this.die(msg || 'Te bajaron');
  }
  hitReact(x, z) {
    if (this.vehicle || this.downT > 0) return;
    this.reactT = 0.45;
    this.fightT = 3.5; // le pegaron: se pone en guardia
    // la cabeza se va para el lado contrario al golpe (src/moves.js)
    const a = Math.atan2(x - this.x, z - this.z) - this.heading;
    this.h.hitSide = Math.sin(a) > 0 ? -1 : 1;
    const d = Math.hypot(this.x - x, this.z - z) || 1;
    this.x += ((this.x - x) / d) * 0.25;
    this.z += ((this.z - z) / d) * 0.25;
  }
  knockDown(dur, fx = 0, fz = 0) {
    if (this.vehicle) return;
    if (this.downT <= 0) this.fallT = 0.3;
    this.downT = dur;
    this.getupT = 0;
    this.attack = null;
    this.jack = null;
    this.pushX = fx * 5;
    this.pushZ = fz * 5;
    if (fx || fz) this.heading = Math.atan2(-fx, -fz);
  }
  die(msg) {
    if (this.dead) return;
    this.dead = true;
    this.deadT = 2; // en cámara lenta: unos 6 segundos de verdad
    this.health = 0;
    this.jack = null;
    this.attack = null;
    if (this.vehicle) this.exitVehicle(null, true);
    this.hooks.die?.(msg);
  }
  respawn(at = this.spawn, cause = 'hospital') {
    this.mvx = this.mvz = 0;
    this.exitAnim = null;
    this.jack = null;
    this.yOff = 0;
    this.dead = false;
    this.health = 100;
    this.armor = 0;
    this.downT = 0;
    this.getupT = 0;
    this.x = at.x;
    this.z = at.z;
    this.heading = at.face ?? this.heading;
    this.camYaw = this.heading + Math.PI;
    this.hooks.respawn?.(cause);
  }

  // ---------- Subirse, robar y bajarse ----------
  doorPoint(v) {
    // del lado del conductor (izquierda); en la moto, al costado
    const side = v.kind === 'moto' ? 0.9 : v.W / 2 + 0.55;
    const lx = -Math.cos(v.heading);
    const lz = Math.sin(v.heading);
    const f = v.kind === 'moto' ? 0 : v.L * 0.08;
    return { x: v.x + lx * side + v.fx * f, z: v.z + lz * side + v.fz * f };
  }
  startJack(v) {
    if (v.ai) v.ai.hold = true;
    this.jack = { v, t: 0, phase: 'go' };
    this.attack = null;
  }
  updateJack(dt, world) {
    const j = this.jack;
    const v = j.v;
    j.t += dt;
    if (v.wreck || (v.driver && v.driver !== this)) {
      this.jack = null;
      return;
    }
    const door = this.doorPoint(v);
    if (j.phase === 'go') {
      const dx = door.x - this.x;
      const dz = door.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.35 || j.t > 1.4) {
        j.phase = v.ai || v.rider || v.tankAI ? 'pull' : 'enter';
        j.t = 0;
        this.heading = Math.atan2(v.x - this.x, v.z - this.z);
      } else {
        const sp = Math.min(RUN, d * 6);
        this.x += (dx / d) * sp * dt;
        this.z += (dz / d) * sp * dt;
        this.heading = Math.atan2(dx, dz);
        this.speed = sp;
        animateHuman(this.h, dt, sp, 'walk');
      }
      return;
    }
    if (j.phase !== 'go') v.openDoor?.(0.7);
    if (j.phase === 'pull') {
      // abre la puerta y saca al que maneja
      animateHuman(this.h, dt, 0, j.t < 0.35 ? 'swing' : 'cross', Math.min(1, j.t / 0.6));
      if (!j.pulled && j.t > 0.3) {
        j.pulled = true;
        world.audio.golpe(0.6);
        if (v.kind === 'moto') world.traffic.ejectRider(v, world, -Math.cos(v.heading), Math.sin(v.heading));
        else world.traffic.ejectDriver(v, world);
        world.police.crime('robo_auto', v.x, v.z);
        world.social?.('robo_auto', v.x, v.z);
        this.addRespeto(-1);
      }
      if (j.t > 0.6) {
        j.phase = 'enter';
        j.t = 0;
      }
      return;
    }
    if (j.phase === 'enter') {
      if (v.kind === 'moto') {
        animateHuman(this.h, dt, 0, 'walk');
        if (j.t > 0.25) {
          this.jack = null;
          this.enterVehicle(v, world);
        }
        return;
      }
      // se da vuelta de espaldas al asiento, se agacha y se mete
      j.from ??= { x: this.x, z: this.z, h: this.heading };
      const dur = 0.6;
      const k = Math.min(1, j.t / dur);
      const seat = this.seatPoint(v);
      const e = k * k * (3 - 2 * k);
      this.x = j.from.x + (seat.x - j.from.x) * e;
      this.z = j.from.z + (seat.z - j.from.z) * e;
      let dh = v.heading - j.from.h;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.heading = j.from.h + dh * Math.min(1, k * 2);
      animateHuman(this.h, dt, k < 0.4 ? 1 : 0, 'walk');
      this.duck(Math.max(0, (k - 0.25) / 0.75));
      if (j.t > dur) {
        this.jack = null;
        this.yOff = 0;
        this.enterVehicle(v, world);
      }
    }
  }

  // asiento del conductor (del lado de la puerta)
  seatPoint(v) {
    const lx = -Math.cos(v.heading);
    const lz = Math.sin(v.heading);
    const f = v.L * 0.08 - 0.15;
    return { x: v.x + lx * (v.W / 2 - 0.45) + v.fx * f, z: v.z + lz * (v.W / 2 - 0.45) + v.fz * f };
  }
  // agachado para entrar o salir del auto: cabeza gacha, rodillas dobladas, se hunde en el asiento
  duck(k) {
    const b = this.h.bones;
    const q = Math.sin(Math.min(1, k) * Math.PI * 0.5);
    b.spine.rotation.x += 0.55 * q;
    b.neck.rotation.x += 0.25 * q;
    b.hips.position.y -= 0.32 * q;
    for (const [th, sh, ft] of [
      [b.thR, b.shR, b.ftR],
      [b.thL, b.shL, b.ftL],
    ]) {
      th.rotation.x -= 1.0 * q;
      sh.rotation.x += 1.25 * q;
      ft.rotation.x -= 0.25 * q;
    }
    b.uaR.rotation.x -= 0.35 * q;
    b.uaL.rotation.x -= 0.25 * q;
    this.yOff = 0.12 * q;
  }
  enterVehicle(v, world) {
    const { traffic, hud } = world;
    if (v.rider) traffic.ejectRider(v, world, -Math.cos(v.heading), Math.sin(v.heading));
    traffic.release(v);
    world.police.dropCar(v);
    this.vehicle = v;
    v.driver = this;
    // se sienta y cierra la puerta
    v.doorStay = false;
    v.openDoor?.(0.35);
    v.vx = v.fx * v.speed;
    v.vz = v.fz * v.speed;
    if (v.fallen) {
      v.fallen = false;
      v.lean = 0;
    }
    this.attack = null;
    this.aiming = false;
    world.input.aimToggled = false;
    if (v.kind === 'moto') {
      // Gaspi va arriba de la moto, a la vista
      v.lean = 0;
      v.mesh.add(this.h.root);
      this.h.root.position.set(0, 0.36, -0.12);
      this.h.root.rotation.set(0, 0, 0);
      this.h.root.visible = true;
      animateHuman(this.h, 0, 0, 'ride');
    } else this.h.root.visible = false;
    world.combat.syncHand(this);
    if (v.revenge) {
      v.revenge = false;
      v.flat = true;
      v.damage = Math.min(100, v.damage + 15);
      hud.flash('TE RAYARON EL AUTO', 'Y te pincharon una goma. El trapito se ríe desde la esquina.', 'bad');
    }
    this.hooks.enter?.(v);
  }

  // Tirarse del auto andando: sale por la puerta con el envión del auto, rueda por el piso y se
  // golpea más cuanto más rápido iba. El auto sigue de largo sin nadie (Combat.coastStep).
  bailOut(world) {
    const v = this.vehicle;
    if (!v) return;
    if (v.kind === 'moto') return this.exitVehicle(world, true);
    const sp = Math.abs(v.speed);
    const vx = v.vx ?? v.fx * v.speed;
    const vz = v.vz ?? v.fz * v.speed;
    this.exitVehicle(world, true, true);
    // la puerta del conductor da a la izquierda del auto
    const lx = -Math.cos(v.heading);
    const lz = Math.sin(v.heading);
    const mx = vx * 0.55 + lx * 2.6;
    const mz = vz * 0.55 + lz * 2.6;
    const m = Math.hypot(mx, mz) || 1;
    this.knockDown(Math.min(2.6, 1.3 + sp * 0.035), mx / 5, mz / 5);
    // rueda de costado: acostado a lo ancho del camino que lleva
    this.heading = Math.atan2(-mz / m, mx / m);
    this.roll = { a: 0, settle: false };
    world.audio.golpe(Math.min(1, 0.4 + sp * 0.025));
    world.fx.dust(this.x, 0.2, this.z, 6, [0.55, 0.52, 0.47], 1.2);
    this.hurt(Math.min(62, 4 + sp * 1.7), 'Te tiraste del auto andando');
  }

  exitVehicle(world, forced = false, rolling = false) {
    const v = this.vehicle;
    if (!v) return;
    this.mvx = this.mvz = 0;
    const lx = -Math.cos(v.heading);
    const lz = Math.sin(v.heading);
    const side = v.kind === 'moto' ? 0.8 : v.W / 2 + 0.7;
    if (v.kind === 'moto') {
      this.scene.add(this.h.root);
      this.h.root.rotation.set(0, v.heading, 0);
      v.lean = forced ? 0 : 0.12; // queda con la pata
      v.wheelie = 0;
    }
    this.x = v.x + lx * side;
    this.z = v.z + lz * side;
    this.heading = v.heading;
    // bajando tranquilo: arranca sentado y sale por la puerta
    if (!forced && v.kind === 'car' && !v.rollover && !v.overturned) {
      const seat = this.seatPoint(v);
      this.exitAnim = { t: 0, dur: 0.55, from: seat, to: { x: this.x, z: this.z }, h: v.heading };
      this.x = seat.x;
      this.z = seat.z;
    } else this.exitAnim = null;
    this.vehicle = null;
    v.driver = null;
    v.parked = true;
    v.steer = 0;
    v.settle?.();
    // al bajarse abre la puerta y la cierra; si salió volando, queda abierta
    v.openDoor?.(0.75, forced && v.kind === 'car');
    this.h.root.visible = true;
    if (world) {
      if (!world.traffic.parked.includes(v)) world.traffic.parked.push(v);
      if (!forced && Math.abs(v.speed) < 2) world.npcs.onPark(v);
      world.combat.syncHand(this);
      world.audio.chirrido?.(0);
    }
    if (rolling) {
      // sin conductor sigue de largo, frenando solo, hasta que pare o se la dé contra algo
      v.coast = true;
      v.vx = v.fx * v.speed;
      v.vz = v.fz * v.speed;
    } else {
      v.speed = 0;
      v.vx = v.vz = 0;
    }
    v.sync(0);
    this.hooks.exit?.(v);
  }

  nearestVehicle(world, r = 3.4) {
    let best = null;
    let bd = r;
    const list = world.traffic.all().concat(world.police.cars, world.tanks?.list ?? []);
    for (const v of list) {
      if (v.kind === 'bus' || v.wreck || v.rollover || v.overturned) continue;
      for (const c of v.circles()) {
        const d = Math.hypot(c.x - this.x, c.z - this.z) - c.r;
        if (d < bd) {
          bd = d;
          best = v;
        }
      }
    }
    return best;
  }

  update(dt, world) {
    const { input, trains, audio } = world;
    this.dt = dt;
    if (this.dead) {
      this.deadT -= dt;
      animateHuman(this.h, dt, 0, 'knocked');
      if (this.deadT <= 0) this.respawn();
      this.place();
      return;
    }
    this.fareT = Math.max(0, (this.fareT || 0) - dt); // pasaje pagado en el molinete
    for (const k of Object.keys(this.buffs)) {
      this.buffs[k] -= dt;
      if (this.buffs[k] <= 0) delete this.buffs[k];
    }
    // cámara
    const sens = this.aiming ? 0.0018 : 0.0028;
    if (input.look.dx || input.look.dy) this.lastLook = 0;
    else this.lastLook += dt;
    this.camYaw -= input.look.dx * sens;
    this.camPitch = Math.max(-0.35, Math.min(1.1, this.camPitch + input.look.dy * sens));
    if (input.wheel) this.zoom = Math.max(0.45, Math.min(1.8, (this.zoom ?? 1) * (1 + input.wheel * 0.001)));

    // en el taller de chapa y pintura: el auto lo mueve src/garage.js
    if (this.cutscene) {
      this.place();
      return;
    }
    // a bordo del plato volador: lo maneja src/ufo.js
    if (this.ufo) {
      this.ufo.fly(dt, world);
      this.place();
      return;
    }
    if (input.hit('f') && !this.jack && !this.exitAnim && this.downT <= 0 && this.getupT <= 0) {
      if (this.vehicle) {
        if (Math.abs(this.vehicle.speed) < 3) this.exitVehicle(world);
        // andando: se tira y sale rodando (como en GTA); el auto sigue solo
        else this.bailOut(world);
      } else {
        const v = this.nearestVehicle(world);
        if (v) this.startJack(v);
      }
    }

    if (this.jack) this.updateJack(dt, world);
    else if (this.exitAnim) this.updateExit(dt);
    else if (this.auto) this.updateAuto(dt);
    else if (this.vehicle) this.drive(dt, world);
    else this.walk(dt, world);

    // trenes: si te agarra uno en movimiento, fin
    const hit = trains.hitTest(this.x, this.z, this.vehicle ? 1.2 : 0.35);
    if (hit) {
      if (hit.moving && hit.speed > 2) {
        audio.golpe(1);
        this.die('TE PASÓ POR ENCIMA EL ROCA');
      } else {
        const push = (hit.lx >= 0 ? 1 : -1) * (1.5 + (this.vehicle ? 1.2 : 0.35) - Math.abs(hit.lx));
        this.x += Math.cos(hit.box.h) * push;
        this.z -= Math.sin(hit.box.h) * push;
      }
    }
    this.place();
  }

  // caminata guiada (pasar el molinete, colarse de un salto): va derecho al punto y devuelve el control
  updateAuto(dt) {
    const a = this.auto;
    a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    this.x = a.from.x + (a.to.x - a.from.x) * k;
    this.z = a.from.z + (a.to.z - a.from.z) * k;
    this.heading = Math.atan2(a.to.x - a.from.x, a.to.z - a.from.z);
    this.speed = 0;
    this.mvx = this.mvz = 0;
    if (a.jump) {
      // salta el molinete: sube con las piernas recogidas y cae del otro lado
      this.yOff = -Math.sin(k * Math.PI) * 0.7;
      animateHuman(this.h, dt, 3.2, 'walk');
    } else animateHuman(this.h, dt, 1.3, 'walk');
    if (k >= 1) {
      this.auto = null;
      this.yOff = 0;
      a.done?.();
    }
  }

  updateExit(dt) {
    const a = this.exitAnim;
    a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    const e = k * k * (3 - 2 * k);
    this.x = a.from.x + (a.to.x - a.from.x) * e;
    this.z = a.from.z + (a.to.z - a.from.z) * e;
    // gira hacia afuera mientras sale y después vuelve a mirar para adelante
    this.heading = a.h - Math.sin(k * Math.PI) * 1.1;
    this.speed = 0;
    animateHuman(this.h, dt, k > 0.5 ? 1 : 0, 'walk');
    this.duck(1 - k);
    if (k >= 1) {
      this.exitAnim = null;
      this.yOff = 0;
    }
  }
  walk(dt, world) {
    const { input } = world;
    const ax = input.axis();
    this.reactT = (this.reactT || 0) - dt;
    this.shootT = (this.shootT || 0) - dt;
    this.recoil = Math.max(0, (this.recoil || 0) - dt * 5);
    // tirado en el piso
    if (this.downT > 0) {
      this.downT -= dt;
      this.x += (this.pushX || 0) * dt;
      this.z += (this.pushZ || 0) * dt;
      // rodando frena más despacio que cayéndose de una piña
      const fr = Math.exp(-dt * (this.roll ? 2.4 : 4));
      this.pushX = (this.pushX || 0) * fr;
      this.pushZ = (this.pushZ || 0) * fr;
      if (this.roll) {
        // se acuesta de una y gira sobre sí mismo como un tronco; al frenar termina boca arriba
        const sp = Math.hypot(this.pushX, this.pushZ);
        const r = this.roll;
        if (!r.settle && sp < 2.2) r.settle = true;
        if (r.settle) {
          const end = Math.ceil(r.a / (Math.PI * 2) - 0.05) * Math.PI * 2;
          r.a = Math.min(end, r.a + dt * 7);
        } else r.a += (sp * dt) / 0.2;
        if (sp > 3 && Math.random() < dt * 10) world.fx.dust(this.x, 0.15, this.z, 1, [0.55, 0.52, 0.47], 0.6);
        this.fallT = 0;
        animateHuman(this.h, dt, 0, 'knocked');
        this.h.bones.root.rotation.y += r.a;
        if (r.settle && r.a >= Math.ceil(r.a / (Math.PI * 2) - 0.05) * Math.PI * 2 - 1e-3) this.roll = null;
      } else if (this.fallT > 0) {
        this.fallT -= dt;
        animateHuman(this.h, dt, 0, 'getup', Math.max(0, this.fallT / 0.3));
      } else animateHuman(this.h, dt, 0, 'knocked');
      if (this.downT <= 0) this.getupT = 0.6;
      this.speed = 0;
      this.collide(world);
      return;
    }
    if (this.getupT > 0) {
      this.getupT -= dt;
      animateHuman(this.h, dt, 0, 'getup', 1 - this.getupT / 0.6);
      this.speed = 0;
      return;
    }
    const w = WEAPONS[this.weapon || 'punos'];
    const buff = this.buffs.medias ? 1.12 : 1;
    const run = (input.down('shift') || input.sprint) && !this.aiming;
    // velocidad que pide el jugador
    let tvx = 0;
    let tvz = 0;
    let wantH = null;
    if (ax.x || ax.y) {
      const fx = -Math.sin(this.camYaw);
      const fz = -Math.cos(this.camYaw);
      const rx = -fz;
      const rz = fx;
      tvx = fx * -ax.y + rx * ax.x;
      tvz = fz * -ax.y + rz * ax.x;
      const l = Math.hypot(tvx, tvz);
      tvx /= l;
      tvz /= l;
      wantH = Math.atan2(tvx, tvz);
      const mag = Math.min(1, Math.hypot(ax.x, ax.y));
      let sp = (run ? RUN : WALK) * mag * buff * (this.grabbed > 0 ? 0.45 : 1);
      if (this.aiming) sp = Math.min(sp, 2.2);
      if (this.attack) sp *= 0.25;
      tvx *= sp;
      tvz *= sp;
    }
    // inercia: arrancar y frenar lleva un instante (más al correr) y pegar la vuelta en seco cuesta más
    this.mvx ??= 0;
    this.mvz ??= 0;
    const cur = Math.hypot(this.mvx, this.mvz);
    const tgt = Math.hypot(tvx, tvz);
    const dot = cur > 0.1 && tgt > 0.1 ? (this.mvx * tvx + this.mvz * tvz) / (cur * tgt) : 1;
    const acc = tgt > cur ? (run ? 15 : 10) : dot < -0.2 ? 24 : 14;
    const dvx = tvx - this.mvx;
    const dvz = tvz - this.mvz;
    const dl = Math.hypot(dvx, dvz);
    if (dl > 1e-4) {
      const st = Math.min(dl, acc * dt);
      this.mvx += (dvx / dl) * st;
      this.mvz += (dvz / dl) * st;
    }
    // el cuerpo gira hacia donde va: rápido si está casi parado, más abierto corriendo
    const h0 = this.heading;
    if (wantH != null && !this.aiming && !this.attack) {
      let diff = wantH - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const rate = 15 - Math.min(8, cur * 1.4);
      this.heading += diff * Math.min(1, dt * rate);
    }
    // apuntando: mira hacia donde mira la cámara
    if (this.aiming) this.heading = this.camYaw + Math.PI;
    // salto
    const ground = this.groundAt();
    if (input.hit(' ', 'jump') && this.y <= ground + 0.05 && !this.attack) {
      this.vy = 4.6;
      world.audio.whoosh(0.15);
    }
    this.grabbed = Math.max(0, this.grabbed - dt);
    const x0 = this.x;
    const z0 = this.z;
    this.x += this.mvx * dt;
    this.z += this.mvz * dt;
    this.collide(world);
    // un escalón de más de medio metro (el borde del andén) no se sube caminando: hay que saltar
    if (this.vy <= 0 && this.y < ground + 0.3 && this.groundAt() - ground > 0.6) {
      this.x = x0;
      this.z = z0;
    }
    // contra una pared no sigue "patinando": la velocidad es la que de verdad avanzó
    if (dt > 0) {
      const rvx = (this.x - x0) / dt;
      const rvz = (this.z - z0) / dt;
      if (Math.hypot(rvx, rvz) < cur * 0.6) {
        this.mvx = rvx;
        this.mvz = rvz;
      }
    }
    const prevSpeed = this.speed || 0;
    this.speed = Math.hypot(this.mvx, this.mvz);
    // giro y aceleración suavizados (para inclinarse en las curvas y al arrancar o frenar)
    let dh = this.heading - h0;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const k = Math.min(1, dt * 8);
    this.turnW = (this.turnW || 0) + ((dt > 0 ? dh / dt : 0) - (this.turnW || 0)) * k;
    this.accF = (this.accF || 0) + ((dt > 0 ? (this.speed - prevSpeed) / dt : 0) - (this.accF || 0)) * k;
    // pose: golpe > tiro > apuntar > arma en mano > reacción > celu > caminar
    let pose = 'walk';
    let t = 0;
    if (this.attack) {
      pose = this.attack.pose;
      t = this.attack.t / this.attack.dur;
    } else if (w.gun && this.reloadT > 0) {
      pose = 'reload';
      t = 1 - this.reloadT / w.reload;
    } else if (w.gun && (this.aiming || this.shootT > 0)) {
      pose = w.pose;
      t = this.recoil;
    } else if (this.reactT > 0) {
      pose = 'hit';
      t = 1 - this.reactT / 0.45;
    } else if (w.gun) pose = 'holdGun';
    else if (this.fightT > 0 && !w.gun && !w.throw && w.id === 'punos') pose = 'fight';
    else if (this.phoneT > 0) pose = 'phone';
    else if (this.danceT > 0 && this.speed < 0.3) {
      // en el medio de la ronda de los chicos (src/aura.js): farmeando aura
      pose = 'aura';
      t = this.danceClock ?? 0;
    }
    this.danceT = (this.danceT || 0) - dt;
    // después de pelear queda en guardia un rato (src/moves.js)
    this.fightT = (this.fightT || 0) - dt;
    // apuntando: el torso sigue la mira arriba/abajo y camina de costado o para atrás sin dejar de apuntar
    const mv = Math.hypot(this.mvx, this.mvz);
    let rel = mv > 0.3 ? Math.atan2(this.mvx, this.mvz) - this.heading : 0;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const aimingNow = w.gun && (this.aiming || this.shootT > 0);
    this.h.aimPitch = -(this.camPitch - 0.2) * 0.6;
    this.h.walkBack = aimingNow && Math.abs(rel) > 2.0;
    this.h.strafe = aimingNow ? (this.h.walkBack ? rel - Math.sign(rel) * Math.PI : rel) : 0;
    this.phoneT = (this.phoneT || 0) - dt;
    // girando en el lugar da pasitos (si no, gira como una estatua)
    const stepIn = this.speed < 0.6 ? Math.min(1.1, Math.abs(this.turnW || 0) * 0.3) : 0;
    animateHuman(this.h, dt, Math.max(this.speed, stepIn), pose, t);
    this.naturalize(dt, ground, pose === 'walk');
  }

  // Lo que hace que Gaspi se mueva como una persona y no como un muñeco: se inclina en las curvas,
  // se tira para adelante al arrancar y para atrás al frenar, la cabeza acompaña a la cámara,
  // recoge las piernas en el aire y amortigua al caer.
  naturalize(dt, ground, calm = false) {
    const b = this.h.bones;
    const free = !this.attack && !this.aiming;
    const still = 1 - Math.min(1, this.speed / 0.6);
    // después de correr un buen rato queda agitado: se dobla un poco y respira fuerte
    this.fatigue = Math.max(0, Math.min(1, (this.fatigue || 0) + (this.speed > 4.5 ? dt * 0.07 : this.speed < 0.5 ? -dt * 0.09 : -dt * 0.02)));
    const tired = this.fatigue * still * (free ? 1 : 0.3);
    if (tired > 0.01) {
      this.breathT = (this.breathT || 0) + dt * (2.4 + this.fatigue * 2.6);
      const br = Math.sin(this.breathT);
      b.spine.rotation.x += 0.2 * tired + br * 0.025 * tired;
      b.chest.rotation.x += br * 0.05 * tired;
      b.neck.rotation.x -= 0.12 * tired;
      b.head.rotation.x -= 0.06 * tired - br * 0.03 * tired;
      b.hips.position.y -= 0.035 * tired;
      for (const [th, sh] of [
        [b.thR, b.shR],
        [b.thL, b.shL],
      ]) {
        th.rotation.x -= 0.16 * tired;
        sh.rotation.x += 0.3 * tired;
      }
      b.uaR.rotation.x -= br * 0.04 * tired;
      b.uaL.rotation.x -= br * 0.04 * tired;
    }
    this.fidget(dt, calm && this.speed < 0.15 && this.fatigue < 0.2);
    if (free) {
      const lean = Math.max(-0.26, Math.min(0.26, -(this.turnW || 0) * this.speed * 0.028));
      b.spine.rotation.z += lean * 0.75;
      b.hips.rotation.z += lean * 0.3;
      b.spine.rotation.x += Math.max(-0.14, Math.min(0.16, (this.accF || 0) * 0.022));
    }
    // la cabeza mira para donde mira la cámara (menos cuanto más rápido va)
    let look = this.camYaw + Math.PI - this.heading;
    while (look > Math.PI) look -= Math.PI * 2;
    while (look < -Math.PI) look += Math.PI * 2;
    look = Math.max(-1.1, Math.min(1.1, look)) * (1 - Math.min(1, Math.max(0, (this.speed - 1) / 4)));
    if (!free) look = 0;
    this.headYaw = (this.headYaw || 0) + (look - (this.headYaw || 0)) * Math.min(1, dt * 5);
    b.neck.rotation.y += this.headYaw * 0.35;
    b.head.rotation.y += this.headYaw * 0.5;
    // en el aire y al caer
    const air = this.y > ground + 0.1;
    if (air) {
      this.airT = (this.airT || 0) + dt;
      const a = Math.min(1, this.airT * 6);
      b.thR.rotation.x = b.thR.rotation.x * (1 - a) - 0.9 * a;
      b.shR.rotation.x = b.shR.rotation.x * (1 - a) + 1.2 * a;
      b.thL.rotation.x = b.thL.rotation.x * (1 - a) - 0.35 * a;
      b.shL.rotation.x = b.shL.rotation.x * (1 - a) + 0.8 * a;
      b.uaR.rotation.z -= 0.35 * a;
      b.uaL.rotation.z += 0.35 * a;
    } else if (this.airT > 0) {
      this.landT = Math.min(0.28, 0.12 + this.airT * 0.25);
      this.landMax = this.landT;
      this.airT = 0;
    }
    if (this.landT > 0) {
      this.landT -= dt;
      const k = Math.max(0, this.landT / this.landMax);
      const q = Math.sin(k * Math.PI * 0.5);
      b.hips.position.y -= 0.13 * q;
      for (const [th, sh, ft] of [
        [b.thR, b.shR, b.ftR],
        [b.thL, b.shL, b.ftL],
      ]) {
        th.rotation.x -= 0.55 * q;
        sh.rotation.x += 1.0 * q;
        ft.rotation.x -= 0.45 * q;
      }
      b.spine.rotation.x += 0.18 * q;
    }
  }

  // quieto un rato: mira el reloj, se acomoda la corbata o estira el cuello
  fidget(dt, calm) {
    if (!calm) {
      this.idleT = 0;
      this.fid = null;
      return;
    }
    this.idleT = (this.idleT || 0) + dt;
    if (!this.fid && this.idleT > 8 && Math.random() < dt * 0.12) {
      this.fid = { kind: R.pick(['reloj', 'corbata', 'cuello']), t: 0, dur: R.range(1.8, 2.6) };
      this.idleT = 0;
    }
    const f = this.fid;
    if (!f) return;
    f.t += dt;
    if (f.t >= f.dur) {
      this.fid = null;
      return;
    }
    // entra y sale suave
    const e = Math.min(1, Math.min(f.t, f.dur - f.t) / 0.4);
    const k = e * e * (3 - 2 * e);
    const b = this.h.bones;
    const to = (o, ax, v) => (o.rotation[ax] += (v - o.rotation[ax]) * k);
    const wig = Math.sin(f.t * 11) * 0.08 * k;
    if (f.kind === 'reloj') {
      // el brazo gira hacia adentro y el antebrazo cruza el cuerpo con la muñeca a la vista
      to(b.uaL, 'x', -0.55);
      to(b.uaL, 'y', -1.25);
      to(b.uaL, 'z', -0.12);
      to(b.faL, 'x', -1.65);
      b.head.rotation.x += 0.42 * k;
      b.head.rotation.y += 0.12 * k;
      b.neck.rotation.x += 0.12 * k;
    } else if (f.kind === 'corbata') {
      // la mano sube al nudo de la corbata y lo acomoda
      to(b.uaR, 'x', -0.4);
      to(b.uaR, 'y', 0.7);
      to(b.uaR, 'z', 0.22);
      to(b.faR, 'x', -2.2 + wig);
      b.head.rotation.x -= 0.2 * k;
      b.head.rotation.z += 0.06 * k;
    } else {
      // estira el cuello: inclina la cabeza a un lado y al otro, con los hombros sueltos
      const side = Math.sin((f.t / f.dur) * Math.PI * 2);
      b.neck.rotation.z += side * 0.28 * k;
      b.head.rotation.z += side * 0.22 * k;
      b.head.rotation.x += 0.1 * k;
      b.chest.rotation.x -= 0.04 * k;
    }
  }

  collide(world) {
    const { colliders, npcs, traffic, police } = world;
    this.nearCars = traffic.parked;
    const p = { x: this.x, z: this.z };
    // en el aire se pueden saltar rejas bajas
    const airborne = this.y > this.groundAt() + 0.6;
    // las barandas del puente frenan solo arriba; abajo, las paredes comunes (y no las de más bajas que uno)
    const y = this.y;
    // al andén no se sube caminando desde la calle o las vías (se entra por la estación y los molinetes, se baja
    // del puente o se trepa de un salto); arriba del andén su borde no frena. Abajo en el bajo nivel no chocan los de arriba
    colliders.resolveCircle(p, this.r, (b) => (b.kind !== 'platform' || y < 0.6) && !(b.over && y < -1) && (b.y0 ? y > b.y0 - 0.6 && y < b.h : y < 1 || y < b.h - 0.3) && (!airborne || b.h > 1.3));
    const cars = traffic.all().concat(police.cars, world.tanks?.list ?? []);
    for (const v of cars) {
      if (Math.abs(v.x - p.x) > 8 || Math.abs(v.z - p.z) > 8) continue;
      for (const c of v.circles()) {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const d = Math.hypot(dx, dz);
        if (d < c.r + this.r && d > 0.001) {
          const pen = c.r + this.r - d;
          p.x += (dx / d) * pen;
          p.z += (dz / d) * pen;
          if (Math.abs(v.speed) > 5 && this.downT <= 0 && this.getupT <= 0) {
            this.hurt(Math.abs(v.speed) * 2.5, 'Te llevó puesto un auto');
            this.knockDown(1.8, (dx / d) * 0.8 + v.fx * 0.5, (dz / d) * 0.8 + v.fz * 0.5);
          }
        }
      }
    }
    // la gente se corre un poco
    for (const n of npcs.list) {
      if (n.down) continue;
      const dx = p.x - n.x;
      const dz = p.z - n.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.65 && d > 0.001) {
        const pen = (0.65 - d) / 2;
        p.x += (dx / d) * pen;
        p.z += (dz / d) * pen;
        if (n.state !== 'sit') {
          n.x -= (dx / d) * pen;
          n.z -= (dz / d) * pen;
        }
      }
    }
    this.x = p.x;
    this.z = p.z;
  }

  // ---------- Manejo: velocidad separada del rumbo para poder derrapar ----------
  drive(dt, world) {
    const { input, colliders, traffic, npcs, events, audio, hud, police, combat } = world;
    const effects = world.fx;
    const v = this.vehicle;
    const st = stats(v);
    const moto = v.kind === 'moto';
    const ax = input.axis();
    const throttle = -ax.y;
    const steerIn = -ax.x;
    const hb = input.down(' ');
    if (v.wreck) {
      this.exitVehicle(world, true);
      return;
    }
    if (v.rollover || v.overturned) {
      v.throttle = 0;
      v.brakeIn = true;
      recoverRollover(v, dt, steerIn);
      audio.chirrido(0);
      v.sync(0);
      this.x = v.x; this.z = v.z; this.heading = v.heading;
      return;
    }
    // el tanque se maneja aparte (src/tank.js): orugas, torreta y cañón
    if (v.kind === 'tank') {
      world.tanks.drive(dt, world, v);
      return;
    }
    const vmax = st.vmax * (v.flat ? 0.55 : 1) * (1 - (v.damage || 0) / 260) * (v.burning > 0 ? 0.7 : 1);
    v.vx ??= 0;
    v.vz ??= 0;
    let fx = v.fx;
    let fz = v.fz;
    let vf = v.vx * fx + v.vz * fz;
    let vl = v.vx * fz - v.vz * fx;
    if (throttle > 0) vf += (vf < -0.5 ? st.brake : st.acc * (1 - Math.max(0, vf) / (vmax * 1.15))) * dt * throttle;
    else if (throttle < 0) vf -= (vf > 0.5 ? st.brake : st.rev) * dt * -throttle;
    else vf -= Math.sign(vf) * Math.min(Math.abs(vf), (1.8 + Math.abs(vf) * 0.03) * dt);
    if (hb) vf -= Math.sign(vf) * Math.min(Math.abs(vf), (moto ? 12 : 7) * dt);
    vf = Math.max(-st.rev * 1.5, Math.min(vmax, vf));
    v.steer += (steerIn - v.steer) * Math.min(1, dt * (moto ? 8 : 6));
    const sp = Math.abs(vf);
    const yaw = (v.steer * st.turn * Math.min(1, sp / 4.5) * Math.sign(vf) * (hb && !moto ? 1.55 : 1)) / (1 + sp / 38);
    // velocidad en el mundo con el rumbo viejo
    const wx = fx * vf + fz * vl;
    const wz = fz * vf - fx * vl;
    v.heading += yaw * dt * (v.flat ? 0.8 : 1) + (v.flat ? Math.sin(performance.now() / 300) * 0.002 : 0);
    fx = v.fx;
    fz = v.fz;
    vf = wx * fx + wz * fz;
    vl = wx * fz - wz * fx;
    // agarre lateral: con freno de mano la cola se va
    const grip = st.grip * (hb && !moto ? 0.12 : 1) * (world.weather?.slick ? 0.7 : 1);
    vl *= Math.exp(-grip * dt);
    vf -= Math.sign(vf) * Math.min(Math.abs(vf), Math.abs(vl) * 0.35 * dt);
    v.vx = fx * vf + fz * vl;
    v.vz = fz * vf - fx * vl;
    v.x += v.vx * dt;
    v.z += v.vz * dt;
    v.speed = vf;
    v.throttle = throttle; // para el ruido del motor (src/audio.js)
    v.vmax = vmax;
    v.brakeIn = hb || (throttle < 0 && vf > 0.5) || (throttle > 0 && vf < -0.5) || (throttle === 0 && Math.abs(vf) < 0.3);
    const slip = Math.abs(vl);
    // en llanta: las ruedas raspan el asfalto y saltan chispas
    if (v.flat && !moto && sp > 6 && Math.random() < Math.min(0.8, sp / 30)) {
      const s = Math.random() < 0.5 ? -1 : 1;
      effects.sparks(v.x - fx * v.L * 0.32 + fz * s * v.W * 0.45, 0.12, v.z - fz * v.L * 0.32 - fx * s * v.W * 0.45, 2, 3);
    }
    // humo de gomas y marcas en el asfalto
    const burnout = throttle > 0 && sp < 6 && input.down('shift');
    if (!moto && v.kind !== 'carro' && (slip > 2.2 || burnout || (hb && sp > 8))) {
      const k = Math.min(1, slip / 8 + 0.3);
      for (const s of [-1, 1]) {
        const rx = v.x - fx * v.L * 0.32 + fz * s * v.W * 0.42;
        const rz = v.z - fz * v.L * 0.32 - fx * s * v.W * 0.42;
        const key = s < 0 ? 'skL' : 'skR';
        if (v[key]) effects.skidMark(v[key].x, v[key].z, rx, rz);
        v[key] = { x: rx, z: rz };
        if (Math.random() < k * 0.6) effects.tireSmoke(rx, rz, k);
      }
      audio.chirrido(Math.min(1, slip / 6 + (burnout ? 0.5 : 0)));
    } else {
      v.skL = v.skR = null;
      audio.chirrido(0);
    }
    // moto: se inclina en las curvas; con Shift hace willy
    if (moto) {
      v.lean = (v.lean || 0) + (-v.steer * Math.min(1, sp / 9) * 0.5 - (v.lean || 0)) * Math.min(1, dt * 6);
      const wantW = input.down('shift') && throttle > 0 && sp > 4 && sp < 20 ? 0.45 : 0;
      v.wheelie = (v.wheelie || 0) + (wantW - (v.wheelie || 0)) * Math.min(1, dt * 4);
      animateHuman(this.h, dt, 0, 'ride');
      this.h.bones.spine.rotation.x = 0.3 + sp * 0.006;
    }

    // choques con casas
    let bump = 0;
    let hitAt = null; // dónde fue el golpe más fuerte (para abollar ahí)
    v.spin = (v.spin || 0) * Math.exp(-dt * 2.6);
    this.scrapeT = (this.scrapeT || 0) - dt;
    for (const c of v.circles()) {
      const p = { x: c.x, z: c.z };
      const hit = colliders.resolveCircle(p, c.r, (v.y || 0) < -1 ? lowFilter : undefined);
      if (hit) {
        // un poste de luz a velocidad: lo voltea y sigue (frenado)
        const vel = Math.hypot(v.vx, v.vz);
        // (y un semáforo también)
        const knocked =
          vel > 5 &&
          !moto &&
          ((hit.box.kind === 'lamp' && world.smash?.knock(hit.box, v.vx, v.vz)) ||
            (hit.box.kind === 'signal' && world.lights?.knock(hit.box, v.vx, v.vz)) ||
            (hit.box.kind === 'sign' && SIGNS.knock(hit.box, v.vx, v.vz, world)));
        if (knocked) {
          v.vx *= 0.62;
          v.vz *= 0.62;
          effects.shake += 0.35;
          combat.damageVehicle(world, v, 9, false, c.x - hit.nx * c.r, c.z - hit.nz * c.r);
          police.crime('choque', v.x, v.z);
          continue;
        }
        // un surtidor de nafta: el golpe le saca vida (fuerte, revienta)
        if (hit.box.kind === 'pump' && hit.box.pump && vel > 3) world.nafta?.hit(world, hit.box.pump, vel * 6, true);
        v.x += p.x - c.x;
        v.z += p.z - c.z;
        const into = v.vx * hit.nx + v.vz * hit.nz;
        const cx = c.x - hit.nx * c.r;
        const cz = c.z - hit.nz * c.r;
        if (into < 0) {
          sideImpactRollover(v, hit.nx, hit.nz, -into);
          if (-into > bump) hitAt = { x: cx, z: cz };
          bump = Math.max(bump, -into);
          v.vx -= hit.nx * into * 1.25;
          v.vz -= hit.nz * into * 1.25;
          // golpe descentrado: el auto pega un trompo
          const rx = cx - v.x;
          const rz = cz - v.z;
          const jx = -hit.nx * into;
          const jz = -hit.nz * into;
          v.spin -= ((rx * jz - rz * jx) / (v.L * 0.5)) * (moto ? 0.1 : 0.32);
        }
        // raspando contra la pared: chispas y chirrido de chapa
        const along = Math.abs(v.vx * -hit.nz + v.vz * hit.nx);
        if (along > 4 && !moto) {
          if (Math.random() < 0.7) effects.sparks(cx, 0.45, cz, 2, 3 + along * 0.15);
          if (this.scrapeT <= 0) {
            this.scrapeT = 0.14;
            audio.metal(Math.min(0.5, along / 40));
          }
        }
      }
    }
    v.heading += v.spin * dt;
    // Los choques entre vehículos se resuelven juntos al terminar el frame.
    // cortes y marchas: despacio no se pasa (te golpean el capot); a toda velocidad se rompe el corte
    const ev = events.inside(v.x + v.fx * v.L * 0.5, v.z + v.fz * v.L * 0.5, 0.3);
    if (ev && (this.breakEv === ev || Math.abs(v.speed) > 9)) {
      if (this.breakEv !== ev) {
        this.breakEv = ev;
        hud.flash('¡ROMPISTE EL CORTE!', `Pasaste por arriba de ${ev.type === 'marcha' ? 'la marcha' : 'el corte'} en ${ev.label}`, 'warn');
        police.crime('atropello', v.x, v.z);
        effects.shake += 0.3;
      }
    } else if (ev) {
      v.x -= v.fx * Math.max(0.5, Math.abs(v.speed) * dt * 2);
      v.z -= v.fz * Math.max(0.5, Math.abs(v.speed) * dt * 2);
      if (Math.abs(v.speed) > 1.5) {
        bump = Math.max(bump, 4);
        if (!this.noPasaT || this.noPasaT <= 0) {
          hud.flash('¡NO SE PASA!', `Te golpean el capot en ${ev.label}. Buscá otra calle.`, 'warn');
          v.damage = Math.min(100, v.damage + 4);
          audio.golpe(0.8);
          this.noPasaT = 4;
        }
      }
      v.vx = v.vz = 0;
      v.speed = 0;
    }
    if (!ev) this.breakEv = null;
    // el pasacalles se cae si lo lleva puesto el auto
    if (Math.abs(v.speed) > 2 && events.list.length) {
      const s = Math.sign(v.speed);
      for (const c of v.circles()) events.knock(c.x, c.z, c.r, v.fx * s, v.fz * s);
    }
    this.noPasaT = (this.noPasaT || 0) - dt;
    if (bump > 2) {
      if (bump > 6) {
        combat.damageVehicle(world, v, bump * (moto ? 0.3 : 0.55), false, hitAt?.x, hitAt?.z);
        audio.golpe(Math.min(1, bump / 15));
        effects.shake += Math.min(0.9, bump / 18);
        // golpe fuerte: humo de gomas y polvo en el punto del choque
        if (bump > 12 && hitAt) {
          effects.dust(hitAt.x, 0.5, hitAt.z, 8, [0.5, 0.48, 0.44], 1.2);
          for (let i = 0; i < 3; i++) effects.tireSmoke(hitAt.x, hitAt.z, 1);
        }
        if (bump > 11) hud.toast(R.pick(['¡Qué palo!', '¡Uh, la chapa!', '¡Pará, loco!']));
        if (bump > 8) effects.sparks(v.x + v.fx * v.L * 0.5, 0.6, v.z + v.fz * v.L * 0.5, 8, 5);
      }
      // de la moto se sale volando
      if (moto && bump > 8.5) {
        const dx = v.fx;
        const dz = v.fz;
        this.exitVehicle(world, true);
        v.fallen = true;
        v.lean = 1.35;
        v.sync(0);
        this.hurt(bump * 1.6, 'Te diste un palo con la moto');
        this.knockDown(2, dx, dz);
        this.vy = 3;
        hud.toast('¡Volaste de la moto!', 1.6);
        return;
      }
    }
    // la gente que ve venir el auto a toda velocidad se tira a un costado
    this.dodgeT = (this.dodgeT || 0) - dt;
    if (sp > 9 && this.dodgeT <= 0) {
      this.dodgeT = 0.25;
      for (const n of npcs.list) {
        if (n.down || n.state === 'flee' || n.type === 'mendigo' || n.type === 'cana') continue;
        const ox = n.x - v.x;
        const oz = n.z - v.z;
        const ahead = ox * v.fx + oz * v.fz;
        if (ahead < 2 || ahead > 16 || Math.abs(ox * v.fz - oz * v.fx) > 3) continue;
        // los del corte se plantan: casi ninguno se corre
        if (Math.random() < (n.state === 'protest' ? 0.12 : 0.7)) {
          npcs.setState(n, 'flee', { x: v.x, z: v.z });
          n.fleeT = 1.6;
          const side = ox * v.fz - oz * v.fx >= 0 ? 1 : -1;
          n.from = { x: n.x - v.fz * side * 5, z: n.z + v.fx * side * 5 };
        }
      }
    }
    // willy largo: alguien lo filma
    if (moto && v.wheelie > 0.3) {
      this.wheelieT = (this.wheelieT || 0) + dt;
      if (this.wheelieT > 2.5) {
        world.social?.('willy', v.x, v.z);
        this.wheelieT = -20;
      }
    } else if (this.wheelieT > 0) this.wheelieT = 0;
    // atropellar gente: se caen (y a veces no se levantan)
    if (Math.abs(v.speed) > 3) {
      for (const n of npcs.list) {
        if (n.down || Math.abs(n.x - v.x) > 4 || Math.abs(n.z - v.z) > 4) continue;
        for (const c of v.circles()) {
          if (Math.hypot(n.x - c.x, n.z - c.z) < c.r + 0.4) {
            const hitSpeed = Math.abs(v.speed);
            const res = npcs.hurt(n, hitSpeed * (moto ? 2.5 : 4), v.fx, v.fz, { knock: true, knockT: 2.5, world, byPlayer: true });
            if (hitSpeed > 8) effects.blood(n.x, 0.9, n.z, v.fx, v.fz, Math.min(16, 4 + hitSpeed * 0.6), Math.min(5, hitSpeed * 0.3));
            else effects.hit(n.x, 1, n.z);
            v.vx *= 0.8;
            v.vz *= 0.8;
            this.addRespeto(-1);
            police.crime(n.type === 'cana' ? 'cana' : res === 'ko' || res === 'muerte' ? 'muerte' : 'atropello', n.x, n.z);
            if (res === 'muerte') world.social?.('muerte', n.x, n.z);
            break;
          }
        }
      }
    }
    if (input.hit('h')) {
      audio.bocina(0.8);
      for (const n of npcs.list) {
        if (n.type === 'vecino' && Math.hypot(n.x - v.x, n.z - v.z) < 12 && R.chance(0.4)) n.say(R.pick(['¡Tranqui, loco!', '¿Qué tocás bocina?', '¡Andá a cantarle a Gardel!']), 2);
      }
    }
    turnRollover(v, dt, yaw, { handbrake: hb, slick: !!world.weather?.slick });
    v.sync(dt);
    carEffects(v, dt, world, { throttle, player: true });
    this.x = v.x;
    this.z = v.z;
    this.heading = v.heading;
    this.speed = v.speed;
  }

  // el piso bajo los pies: el terreno o, si está subido, el puente peatonal y sus escaleras
  groundAt() {
    const g = this.heightAt(this.x, this.z);
    const w = walkwayHeight(this.walkways, this.x, this.z, this.y);
    return Math.max(g, w);
  }
  place() {
    if (this.ufo) {
      this.h.root.visible = false;
      return;
    }
    if (this.vehicle?.kind === 'moto') {
      this.y = 0;
      return;
    }
    const dt = this.dt || 1 / 60;
    const ground = this.vehicle ? this.vehicle.y || 0 : this.groundAt();
    if (!this.vehicle && (this.vy !== 0 || this.y > ground + 0.3)) {
      // gravedad
      this.vy -= 13 * dt;
      this.y += this.vy * dt;
      if (this.y <= ground) {
        this.y = ground;
        this.vy = 0;
      }
    } else this.y += (ground - this.y) * 0.35;
    this.h.root.position.set(this.x, this.y - (this.yOff || 0), this.z);
    this.h.root.rotation.set(0, this.heading, 0);
  }

  // Cámara en tercera persona; al apuntar, sobre el hombro
  updateCamera(camera, dt, colliders, fx) {
    const inCar = !!this.vehicle;
    this.aimK += ((this.aiming ? 1 : 0) - this.aimK) * Math.min(1, dt * 10);
    if (inCar && this.lastLook > 1.2) {
      let target = this.heading + Math.PI;
      if (this.vehicle.speed < -1) target = this.heading;
      let diff = target - this.camYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.camYaw += diff * Math.min(1, dt * 2.5);
    }
    const vk = this.vehicle?.kind;
    const ufo = !!this.ufo;
    const base = ufo ? 17 : inCar ? (vk === 'bus' ? 14 : vk === 'moto' ? 5.5 : this.vehicle.model === 'camion' ? 12 : 8.5) : 5;
    const sp = inCar ? Math.abs(this.vehicle.speed) : 0;
    const dist = (base + sp * 0.06) * (this.zoom ?? 1) * (1 - this.aimK * 0.55);
    const hgt = ufo ? 3.2 : inCar ? (vk === 'moto' ? 1.8 : 2.2) : 1.7;
    const pitch = this.camPitch * (1 - this.aimK * 0.5);
    // hombro derecho
    const sx = Math.cos(this.camYaw) * 0.85 * this.aimK;
    const sz = -Math.sin(this.camYaw) * 0.85 * this.aimK;
    const cx = this.x + Math.sin(this.camYaw) * Math.cos(pitch) * dist + sx;
    const cz = this.z + Math.cos(this.camYaw) * Math.cos(pitch) * dist + sz;
    const cy = this.y + hgt + Math.sin(pitch) * dist;
    // si hay una pared en el medio, acercar la cámara
    const t = cy < 12 ? colliders.blocked(this.x, this.z, cx, cz, Math.max(2, cy - 0.5)) : 1;
    const k = Math.max(0.25, t * 0.95);
    const tx = this.x + (cx - this.x) * k;
    const tz = this.z + (cz - this.z) * k;
    const ty = this.y + hgt + (cy - this.y - hgt) * k;
    if (!this.camPos) this.camPos = new THREE.Vector3(tx, ty, tz);
    this.camPos.lerp(tmpV.set(tx, ty, tz), Math.min(1, dt * (this.aiming ? 18 : 10)));
    camera.position.copy(this.camPos);
    // si la cámara queda adentro de un auto estacionado, subirla por encima
    for (const v of this.nearCars || []) {
      if (v === this.vehicle || Math.abs(v.x - camera.position.x) > 6 || Math.abs(v.z - camera.position.z) > 6) continue;
      for (const c of v.circles()) {
        if (Math.hypot(c.x - camera.position.x, c.z - camera.position.z) < c.r + 0.5) {
          const top = (v.tall ?? 1.6) + 0.7;
          if (camera.position.y < top) camera.position.y = top;
        }
      }
    }
    const sh = fx ? Math.min(0.8, fx.shake) : 0;
    if (sh > 0.001) camera.position.add(tmpV.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
    // al apuntar se mira más lejos: la mira queda en el centro de la pantalla
    const lx = this.x + sx - Math.sin(this.camYaw) * this.aimK * 6;
    const lz = this.z + sz - Math.cos(this.camYaw) * this.aimK * 6;
    const ly = this.y + (ufo ? 1.6 : inCar ? 1.4 : 1.55) + this.aimK * (0.2 - pitch * 2.5);
    camera.lookAt(lx, ly, lz);
    // campo visual: más abierto a alta velocidad, más cerrado al apuntar
    const fov = 62 + Math.min(12, sp * 0.35) - this.aimK * 14;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
      camera.updateProjectionMatrix();
    }
  }
}
