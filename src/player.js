// Gaspi: caminar, correr, saltar, pelear, apuntar, robar autos y motos, manejar con derrape.
import * as THREE from 'three';
import { makeGaspi, animateHuman } from './human.js';
import { WEAPONS } from './weapons.js';
import { R } from './rng.js';
import { carEffects } from './carfx.js';
import { SIGNS } from './props.js';
import { walkwayHeight } from './physics.js';
import { safeCamera } from './camera-safe.js';
import { lowFilter } from './bajonivel.js';
import { turnRollover, recoverRollover, sideImpactRollover } from './vehicle-physics.js';
import { NADAR, VADEO } from './agua.js';
import { carWake } from './traffic.js';
import { TOUCH } from './input.js';
import { CANASTOS } from './canastos.js';
import { subirAuto, pasoSubirAuto, bajarAuto, pasoBajarAuto, subirMoto, pasoSubirMoto, bajarMoto, pasoBajarMoto, asiento, carroceria, posMundo } from './subir.js';

// la izquierda de un vehículo (la del conductor en la Argentina): con el rumbo h, adelante es (sen h, cos h)
// y la izquierda (cos h, -sen h). (Antes la puerta, el volante y la bajada estaban a la derecha, a la inglesa.)
export const izquierda = (v) => ({ x: Math.cos(v.heading), z: -Math.sin(v.heading) });

const WALK = 2.3;
const RUN = 6.3;
// nadando (m/s): pecho tranquilo y crol a fondo
const SWIM = 1.5;
const SWIM_FAST = 2.7;
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
  // los de alta gama (src/cars.js, hechos en Blender): el Furia es el más rápido del juego
  if (v.model === 'l_furia') return { acc: 16.5, vmax: 50, rev: 5, turn: 2.25, grip: 11.5, brake: 20 };
  if (v.model === 'l_gt') return { acc: 14, vmax: 45, rev: 5, turn: 2.1, grip: 10, brake: 18 };
  if (v.model === 'l_sedan') return { acc: 11, vmax: 40, rev: 5, turn: 1.9, grip: 9, brake: 16 };
  if (v.model === 'l_suv') return { acc: 10, vmax: 37, rev: 5, turn: 1.8, grip: 8.5, brake: 15 };
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
    // los techos de las casas y edificios (src/techos.js; lo pone main.js cuando está todo armado)
    this.techos = null;
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
    this.hitFrom(x, z);
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
    this.cancelarSubida();
    this.hooks.die?.(msg);
  }
  respawn(at = this.spawn, cause = 'hospital') {
    this.mvx = this.mvz = 0;
    this.cancelarSubida();
    this.jack = null;
    this.yOff = 0;
    this.dead = false;
    this.health = 100;
    this.armor = 0;
    this.downT = 0;
    this.getupT = 0;
    // (si se ahogó buceando o lo agarraron en el agua o en un bote: vuelve seco y con aire)
    this.swimming = this.diving = false;
    if (this.boat) this.boat.mine = false;
    this.boat = null;
    this.air = 1;
    this.vy = 0;
    this.x = at.x;
    this.z = at.z;
    this.y = this.heightAt(at.x, at.z);
    this.heading = at.face ?? this.heading;
    this.camYaw = this.heading + Math.PI;
    this.hooks.respawn?.(cause);
  }

  // ---------- Subirse, robar y bajarse ----------
  doorPoint(v) {
    // del lado del conductor (en la Argentina, la izquierda), al lado de la manija; en la moto, al costado
    // izquierdo (el de la pata). Es donde arranca la animación de subir (src/subir.js)
    const side = v.kind === 'moto' ? 0.55 : v.W / 2 + 0.5;
    const { x: lx, z: lz } = izquierda(v);
    const f = v.kind === 'moto' ? -0.1 : v.kind === 'car' ? asiento(v).z - 0.25 : v.L * 0.08;
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
        j.phase = v.ai || v.rider || v.tankAI || v.deadDriver ? 'pull' : 'enter';
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
    if (j.phase === 'pull') v.openDoor?.(0.7);
    if (j.phase === 'pull') {
      // abre la puerta y saca al que maneja
      animateHuman(this.h, dt, 0, j.t < 0.35 ? 'swing' : 'cross', Math.min(1, j.t / 0.6));
      if (!j.pulled && j.t > 0.3) {
        j.pulled = true;
        world.audio.golpe(0.6);
        if (v.kind === 'moto') world.traffic.ejectRider(v, world, izquierda(v).x, izquierda(v).z);
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
      // se sube como en los GTA (src/subir.js): abre la puerta, se sienta y la cierra; a la moto le pasa la pierna
      if (!this.subida) this.subida = v.kind === 'moto' ? subirMoto(this, v) : subirAuto(this, v);
      const fin = v.kind === 'moto' ? pasoSubirMoto(this, this.subida, dt) : pasoSubirAuto(this, this.subida, dt);
      this.seguirSubida();
      if (fin) {
        this.subida = null;
        this.jack = null;
        this.yOff = 0;
        this.enterVehicle(v, world);
      }
    }
  }

  // Gaspi colgado del vehículo (subiendo o bajando): la cámara y el juego lo siguen donde está
  seguirSubida() {
    const p = posMundo(this);
    this.x = p.x;
    this.z = p.z;
    this.y = p.y;
    const v = this.subida?.v;
    if (v) this.heading = v.heading + this.h.root.rotation.y;
    this.speed = 0;
    this.mvx = this.mvz = 0;
  }
  // corta una subida o bajada a medias (muerte, cana, reaparecer): Gaspi vuelve a la escena, parado
  cancelarSubida() {
    if (this.h.root.parent && this.h.root.parent !== this.scene && !(this.vehicle && this.h.root.parent === this.vehicle.mesh)) {
      const p = posMundo(this);
      this.scene.add(this.h.root);
      this.h.root.rotation.set(0, this.heading, 0);
      this.h.root.position.copy(p);
    }
    this.subida = null;
    this.exitAnim = null;
    this.h.root.visible = true;
  }

  // asiento del conductor (del lado de la puerta)
  seatPoint(v) {
    const { x: lx, z: lz } = izquierda(v);
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
    if (v.rider) traffic.ejectRider(v, world, izquierda(v).x, izquierda(v).z);
    traffic.release(v);
    world.police.dropCar(v);
    this.swimming = this.diving = false;
    this.vehicle = v;
    v.driver = this;
    // (la puerta la abrió y la cerró la animación de subir: src/subir.js)
    v.doorStay = false;
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
    } else if (v.kind === 'car') {
      // sentado al volante, a la vista (en los autos de vidrio negro, adentro sin verse)
      const s = asiento(v);
      carroceria(v).add(this.h.root);
      this.h.root.position.set(s.x, s.y, s.z);
      this.h.root.rotation.set(0, 0, 0);
      this.h.root.visible = s.visible;
      animateHuman(this.h, 0, 0, 'manejar', 0);
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
    const { x: lx, z: lz } = izquierda(v);
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
    const { x: lx, z: lz } = izquierda(v);
    const side = v.kind === 'moto' ? 0.8 : v.W / 2 + 0.7;
    if (v.kind === 'moto') {
      v.lean = forced ? 0 : v.lean; // (bajando tranquilo la apoya en la pata en la animación)
      v.wheelie = 0;
    }
    this.x = v.x + lx * side;
    this.z = v.z + lz * side;
    this.heading = v.heading;
    // bajando tranquilo, como en los GTA (src/subir.js): abre la puerta, se baja y la cierra; de la moto pasa
    // la pierna y la deja en la pata. Si no (se tiró, explotó, lo agarró la cana), sale de una.
    this.subida = null;
    this.exitAnim = null;
    if (!forced && v.kind === 'car' && !v.rollover && !v.overturned) this.exitAnim = this.subida = bajarAuto(this, v);
    else if (!forced && v.kind === 'moto' && !v.fallen) this.exitAnim = this.subida = bajarMoto(this, v);
    else if (this.h.root.parent !== this.scene) {
      this.scene.add(this.h.root);
      this.h.root.rotation.set(0, v.heading, 0);
    }
    if (this.subida) this.seguirSubida();
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
    this.agua = world.agua;
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
    // botes (src/botes.js): F para subirse (o sacárselo al que rema) y para bajarse
    const botes = world.botes;
    if (botes && !this.vehicle && !this.jack && !this.diving && input.hit('f')) {
      if (this.boat) {
        botes.leave(world);
        input.pressed.delete('f');
      } else {
        const b = botes.near(this);
        const v = b && this.nearestVehicle(world);
        if (b && (!v || Math.hypot(v.x - this.x, v.z - this.z) > b.d)) {
          botes.board(b, world);
          input.pressed.delete('f');
        }
      }
    }
    // buceando no se sube a ningún auto
    if (this.diving) input.pressed.delete('f');
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

    // sin estar buceando (a pie, nadando arriba, en un auto o en un bote) se recupera el aire
    if (!this.diving && this.air < 1) this.air = Math.min(1, this.air + dt * 0.5);
    if (this.subida && this.subida.tipo.startsWith('subir') && !this.jack) this.cancelarSubida();
    if (this.jack) this.updateJack(dt, world);
    else if (this.exitAnim) this.updateExit(dt, world);
    else if (this.auto) this.updateAuto(dt);
    else if (this.boat) botes.ride(dt, world);
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

  updateExit(dt, world) {
    const a = this.subida;
    if (!a) {
      this.exitAnim = null;
      return;
    }
    const fin = a.tipo === 'bajarMoto' ? pasoBajarMoto(this, a, dt) : pasoBajarAuto(this, a, dt);
    this.seguirSubida();
    // ya afuera: si el jugador quiere irse caminando, corta lo que falta (la puerta se cierra sola)
    const ax = world.input.axis();
    if (fin || (a.corta && (ax.x || ax.y))) this.terminarBajada();
  }
  terminarBajada() {
    const a = this.subida;
    const p = posMundo(this).clone();
    const h = (a?.v?.heading ?? this.heading) + this.h.root.rotation.y;
    this.scene.add(this.h.root);
    this.x = p.x;
    this.z = p.z;
    this.heading = h;
    this.h.root.position.set(p.x, this.groundAt(), p.z);
    this.h.root.rotation.set(0, h, 0);
    this.subida = null;
    this.exitAnim = null;
    this.yOff = 0;
  }
  walk(dt, world) {
    const { input } = world;
    // en el agua (src/agua.js): sin hacer pie se nada; con agua a la rodilla o a la cintura se camina lento
    const ag = world.agua;
    this.wade = 0;
    if (ag) {
      const wd = ag.depth(this.x, this.z, this.groundAt());
      this.waterDepth = wd;
      if (!this.swimming && wd > NADAR && this.y < ag.level + 0.25) this.startSwim(world);
      else if (this.swimming && !this.diving && wd < NADAR - 0.18) this.stopSwim(world);
      if (this.swimming) return this.swim(dt, world);
      this.wade = smooth(VADEO, NADAR, wd);
      if (wd > 0.04) this.wading(dt, world, wd);
    }
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
    // agacharse (C o el botón): más chico para las balas, tira más preciso, camina despacio; correr lo para
    if (input.hit('c', 'crouch') && this.wade < 0.6) {
      this.crouch = !this.crouch;
      if (this.crouch) this.fightT = 0;
    }
    const run = (input.down('shift') || input.sprint) && !this.aiming;
    if (run && this.crouch && (input.move.x || input.move.y || input.down('w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'))) this.crouch = false;
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
      // el agua frena: a la cintura se camina a la mitad y correr casi no sirve
      if (this.wade > 0) sp *= 1 - this.wade * (run ? 0.72 : 0.55);
      if (this.aiming) sp = Math.min(sp, 2.2);
      if (this.crouch) sp = Math.min(sp, 1.6);
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
    if (input.hit(' ', 'jump') && this.y <= ground + 0.05 && !this.attack && this.wade < 0.6) {
      // contra un pretil o el parapeto de una terraza: se trepa (salta lo justo para pasar por arriba)
      const top = this.pretilCerca(world);
      this.vy = top !== null ? Math.max(4.6, Math.sqrt(2 * 13 * (top - this.y + 0.35))) : 4.6;
      if (top !== null) this.trepaT = 0.5;
      world.audio.whoosh(0.15);
    }
    this.trepaT = Math.max(0, (this.trepaT || 0) - dt);
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
    } else if (this.cieloT > 0 && this.speed < 0.3) {
      // mirando el show de drones con la Selección (src/seleccion.js)
      pose = 'cielo';
      t = this.cieloClock ?? 0;
    }
    this.danceT = (this.danceT || 0) - dt;
    this.cieloT = (this.cieloT || 0) - dt;
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
    this.cayendo(dt, ground);
    this.agachado(dt, world);
    if (this.wade > 0 && pose === 'walk') {
      // con el agua a la cintura: los brazos se abren para hacer equilibrio y el cuerpo empuja adelante
      const b = this.h.bones;
      const w = this.wade;
      b.uaR.rotation.z -= 0.45 * w;
      b.uaL.rotation.z += 0.45 * w;
      b.faR.rotation.x -= 0.35 * w;
      b.faL.rotation.x -= 0.35 * w;
      b.spine.rotation.x += 0.12 * w * Math.min(1, this.speed);
      b.thR.rotation.x -= 0.2 * w * Math.min(1, this.speed);
      b.thL.rotation.x -= 0.2 * w * Math.min(1, this.speed);
    }
    this.drip(dt, world);
  }

  // agachado: rodillas dobladas, la cadera baja y el torso adelante (también apuntando). Al lado de algo
  // que tapa (una pared, una reja, un auto), queda "a cubierto": las balas pegan en eso
  agachado(dt, world) {
    if (this.vehicle || this.swimming || this.dead) this.crouch = false;
    this.crouchK = (this.crouchK || 0) + ((this.crouch ? 1 : 0) - (this.crouchK || 0)) * Math.min(1, dt * 10);
    const k = this.crouchK;
    this.cover = false;
    if (k < 0.01) return;
    const b = this.h.bones;
    b.hips.position.y -= 0.36 * k;
    b.thR.rotation.x -= 0.95 * k;
    b.thL.rotation.x -= 0.75 * k;
    b.shR.rotation.x += 1.55 * k;
    b.shL.rotation.x += 1.35 * k;
    b.ftR.rotation.x -= 0.45 * k;
    b.ftL.rotation.x -= 0.4 * k;
    b.spine.rotation.x += 0.28 * k;
    b.head.rotation.x -= 0.2 * k;
    // a cubierto: algo alto como para taparlo a menos de un metro
    if (this.crouch && world) {
      for (const c of world.colliders.query(this.x, this.z, 1)) {
        if (c.gone || (c.y0 ?? 0) > this.y + 0.5 || c.h < this.y + 0.9) continue;
        let d;
        if (c.c) d = Math.hypot(c.x - this.x, c.z - this.z) - c.r;
        else {
          const dx = c.bx - c.ax;
          const dz = c.bz - c.az;
          const l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((this.x - c.ax) * dx + (this.z - c.az) * dz) / l2));
          d = Math.hypot(c.ax + dx * t - this.x, c.az + dz * t - this.z);
        }
        if (d < 0.9) {
          this.cover = true;
          break;
        }
      }
      if (!this.cover) for (const v of this.nearCars || []) if (Math.hypot(v.x - this.x, v.z - this.z) < v.L / 2 + 1) this.cover = true;
    }
  }

  // de dónde vino un golpe o un tiro (el indicador rojo en el borde de la pantalla, src/hud.js)
  hitFrom(x, z) {
    this.dmgFrom ??= [];
    const old = this.dmgFrom.find((d) => Math.hypot(d.x - x, d.z - z) < 3);
    if (old) old.t = 1.4;
    else {
      if (this.dmgFrom.length >= 4) this.dmgFrom.shift();
      this.dmgFrom.push({ x, z, t: 1.4 });
    }
  }

  // tirando desde el auto o la moto (src/combat.js driveBy): el brazo del arma, estirado hacia la mira
  brazoDriveBy(v) {
    if (!(this.aiming || this.shootT > 0) || !WEAPONS[this.weapon]?.gun) return;
    const b = this.h.bones;
    const c = this.camYaw;
    const firing = this.shootT > 0.2 && this.aimYaw != null;
    let a = (firing ? this.aimYaw : Math.atan2(-Math.sin(c), -Math.cos(c))) - v.heading;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    // para atrás no llega: hasta el costado
    a = Math.max(-2.2, Math.min(2.2, a));
    const p = Math.max(-0.6, Math.min(0.6, firing ? this.aimPitch ?? 0 : -(this.camPitch - 0.2) * 0.6));
    const tw = a * 0.3;
    b.chest.rotation.y += tw;
    b.head.rotation.y += a * 0.4;
    b.uaR.rotation.set(-Math.PI / 2 - p, 0, a - tw);
    b.faR.rotation.set(0, 0, 0);
  }

  // trepando un pretil, o cayendo de lo alto: brazos y piernas (como en los GTA al tirarse de un edificio)
  cayendo(dt, ground) {
    const b = this.h.bones;
    const free = !this.vehicle && !this.swimming && !(this.downT > 0) && this.vy < -4 && this.y > ground + 1.2;
    const k0 = free ? Math.min(1, (-this.vy - 4) / 6) : 0;
    this.caerK = (this.caerK || 0) + (k0 - (this.caerK || 0)) * Math.min(1, dt * 5);
    this.caerClock = (this.caerClock || 0) + dt;
    const k = this.caerK;
    if (k > 0.01) {
      // los brazos arriba y abiertos, agitándose; las piernas sueltas, una adelante y otra atrás
      const f = this.caerClock * 7;
      b.uaR.rotation.x = b.uaR.rotation.x * (1 - k) + (-2.3 + Math.sin(f) * 0.5) * k;
      b.uaL.rotation.x = b.uaL.rotation.x * (1 - k) + (-2.3 + Math.sin(f + 2) * 0.5) * k;
      b.uaR.rotation.z = b.uaR.rotation.z * (1 - k) - 0.6 * k;
      b.uaL.rotation.z = b.uaL.rotation.z * (1 - k) + 0.6 * k;
      b.faR.rotation.x = b.faR.rotation.x * (1 - k) + (-0.5 + Math.sin(f * 1.3) * 0.3) * k;
      b.faL.rotation.x = b.faL.rotation.x * (1 - k) + (-0.5 + Math.cos(f * 1.3) * 0.3) * k;
      b.thR.rotation.x = b.thR.rotation.x * (1 - k) + (-0.5 + Math.sin(f * 0.8) * 0.45) * k;
      b.thL.rotation.x = b.thL.rotation.x * (1 - k) + (0.2 + Math.sin(f * 0.8 + 2.5) * 0.45) * k;
      b.shR.rotation.x = b.shR.rotation.x * (1 - k) + 0.7 * k;
      b.shL.rotation.x = b.shL.rotation.x * (1 - k) + 0.9 * k;
      b.spine.rotation.x += 0.25 * k;
      b.head.rotation.x -= 0.35 * k;
    }
    if (this.trepaT > 0 && this.vy > -1) {
      // trepando: las manos adelante, apoyadas en el borde, y una rodilla arriba
      const t = Math.min(1, this.trepaT / 0.25);
      b.uaR.rotation.x -= 1.5 * t;
      b.uaL.rotation.x -= 1.5 * t;
      b.thR.rotation.x -= 1.1 * t;
      b.shR.rotation.x += 1.3 * t;
    }
  }

  // ---------- En el agua ----------
  startSwim(world) {
    const ag = world.agua;
    const fall = Math.max(0, -(this.vy || 0));
    this.swimming = true;
    this.downT = this.getupT = 0;
    this.roll = null;
    this.attack = null;
    this.aiming = false;
    this.vy = 0;
    this.y = Math.max(this.y, ag.level - 0.4);
    this.swimT = 0;
    this.swimY = ag.level;
    // chapuzón: más grande si cayó de arriba
    const k = Math.min(1.5, 0.35 + fall * 0.12);
    splash(world.fx, this.x, ag.level, this.z, 10 + fall * 4, 1.2 + fall * 0.25);
    ag.ripple(this.x, this.z, k);
    world.audio.chapuzon?.(k);
  }
  // ---------- Buceando ----------
  startDive(world) {
    const ag = world.agua;
    this.diving = true;
    this.vy = -1.2;
    this.air ??= 1;
    this.y = ag.level - 0.55;
    this.divePitch = -0.6;
    splash(world.fx, this.x, ag.level, this.z, 8, 0.8);
    ag.ripple(this.x, this.z, 0.9);
    world.audio.chapuzon?.(0.6);
  }
  surface(world) {
    const ag = world.agua;
    this.diving = false;
    this.vy = 0;
    this.y = ag.level - 0.3;
    this.swimY = ag.level;
    splash(world.fx, this.x, ag.level, this.z, 6, 0.6);
    ag.ripple(this.x, this.z, 0.7);
    world.audio.bocanada?.(this.air < 0.4 ? 1.3 : 0.8);
  }
  dive(dt, world) {
    const { input, fx } = world;
    const ag = world.agua;
    const ax = input.axis();
    const fast = input.down('shift') || input.sprint;
    this.aiming = false;
    this.attack = null;
    // para donde mira la cámara: con la cámara mirando hacia abajo, adelante es hacia el fondo
    const pitch = Math.max(-1.2, Math.min(1.2, (this.camPitch - 0.12) * 1.3));
    let tx = 0;
    let ty = 0;
    let tz = 0;
    if (ax.x || ax.y) {
      const fx0 = -Math.sin(this.camYaw);
      const fz0 = -Math.cos(this.camYaw);
      let hx = fx0 * -ax.y + -fz0 * ax.x;
      let hz = fz0 * -ax.y + fx0 * ax.x;
      const l = Math.hypot(hx, hz) || 1;
      hx /= l;
      hz /= l;
      const fwd = -ax.y > 0 ? Math.cos(pitch) : 1;
      tx = hx * fwd;
      tz = hz * fwd;
      if (-ax.y > 0) ty = -Math.sin(pitch);
    }
    // Subir (Espacio o el botón) manda: sube derecho aunque el joystick apunte hacia abajo
    if (input.down(' ', 'jump')) ty = Math.max(ty, 0) + 1.2;
    else if (input.down('c', 'control')) ty -= 1;
    const tl = Math.hypot(tx, ty, tz);
    const sp = fast ? 2.4 : 1.45;
    if (tl > 1e-3) {
      tx = (tx / tl) * sp;
      ty = (ty / tl) * sp;
      tz = (tz / tl) * sp;
    }
    // agua: inercia y un poco de flotación (sin moverse, sube despacio)
    if (tl < 1e-3) ty = 0.12;
    this.mvx ??= 0;
    this.mvz ??= 0;
    const k = Math.min(1, dt * (tl > 1e-3 ? 1.8 : 1.1));
    this.mvx += (tx - this.mvx) * k;
    this.mvz += (tz - this.mvz) * k;
    this.vy += (ty - this.vy) * k;
    const hs = Math.hypot(this.mvx, this.mvz);
    if (hs > 0.2) {
      let diff = Math.atan2(this.mvx, this.mvz) - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * Math.min(1, dt * 3);
    }
    this.x += this.mvx * dt;
    this.z += this.mvz * dt;
    this.collide(world);
    this.y += this.vy * dt;
    const floor = this.groundAt() + 0.35;
    if (this.y < floor) {
      this.y = floor;
      this.vy = Math.max(0, this.vy);
    }
    this.speed = Math.hypot(hs, this.vy);
    // arriba: sale a respirar
    if (this.y > ag.level - 0.35 && this.vy > -0.05) return this.surface(world);
    // pose: pecho bajo el agua, el cuerpo inclinado hacia donde va
    const want = this.speed > 0.2 ? Math.atan2(this.vy, Math.max(hs, 0.01)) : 0;
    this.divePitch += (want - this.divePitch) * Math.min(1, dt * 3);
    this.h.divePitch = this.divePitch;
    this.swimT = (this.swimT || 0) + dt * (this.speed > 0.2 ? 0.5 + this.speed * 0.25 : 0.32);
    animateHuman(this.h, dt, this.speed, 'dive', this.swimT);
    // aire: unos 30 segundos; después se ahoga de a poco
    this.air = (this.air ?? 1) - dt / 32;
    if (this.air <= 0) {
      this.air = 0;
      this.drownT = (this.drownT || 0) - dt;
      if (this.drownT <= 0) {
        this.drownT = 1;
        this.hurt(9, 'TE AHOGASTE');
        for (let i = 0; i < 8; i++) this.burbuja(fx, ag, 1);
      }
    }
    // burbujas que salen de la boca cada tanto (más seguidas con poco aire)
    this.bubT = (this.bubT || 0) - dt;
    if (this.bubT <= 0) {
      this.bubT = (0.7 + Math.random() * 0.9) * (0.4 + this.air * 0.6);
      const n = 2 + ((Math.random() * 4) | 0);
      for (let i = 0; i < n; i++) this.burbuja(fx, ag);
      if (Math.random() < 0.5) world.audio.burbuja?.(500 + Math.random() * 400, 0.025);
    }
  }
  // una burbuja desde la cabeza: sube bamboleando y revienta en la superficie
  // (no se llama "bubble": así se llama el globo de diálogo de Gaspi en src/main.js)
  burbuja(fx, ag, big = 0) {
    const f = Math.sin(this.heading);
    const g = Math.cos(this.heading);
    const c = Math.cos(this.divePitch || 0);
    const hx = this.x + f * 0.85 * c;
    const hz = this.z + g * 0.85 * c;
    const hy = this.y + Math.sin(this.divePitch || 0) * 0.85 + 0.1;
    fx.alpha.add({ x: hx + (Math.random() - 0.5) * 0.1, y: hy, z: hz + (Math.random() - 0.5) * 0.1, vx: (Math.random() - 0.5) * 0.3, vy: 0.5 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.3, grav: 2.2, drag: 0.8, life: 0, max: 6, s0: 0.035 + big * 0.03 + Math.random() * 0.03, s1: 0.06 + big * 0.04, c0: [0.85, 0.95, 1], a: 0.7, ceil: ag.level - 0.02 });
  }

  stopSwim(world) {
    this.swimming = false;
    this.diving = false;
    this.wetT = 40;
    this.y = Math.min(this.y, this.groundAt() + 0.29);
    world.audio.chapoteo?.(0.5);
  }
  swim(dt, world) {
    const { input } = world;
    const ag = world.agua;
    const deep = ag.level - this.groundAt() > 1.35;
    // la primera vez que nada en lo hondo, cómo se bucea (en la compu no había forma de saberlo)
    if (deep && !this.diving && !this.tipBuceo) {
      this.tipBuceo = true;
      world.hud.flash('A BUCEAR', TOUCH ? 'Tocá Bucear para meterte abajo del agua. Abajo: el joystick nada para donde mira la cámara; Subir te saca.' : 'C, Ctrl o clic para meterte abajo del agua. Abajo: W nada para donde mirás con el mouse, Espacio sube y C baja.', 'ok', 6);
    }
    // C, Control, clic (o el botón Bucear): para abajo, como en GTA, si hay lugar abajo
    if (!this.diving && input.hit('c', 'control', 'mouse0')) {
      if (deep) this.startDive(world);
      else world.hud.toast('Acá no hay hondura para bucear', 1.6);
    }
    if (this.diving) return this.dive(dt, world);
    const ax = input.axis();
    const fast = input.down('shift') || input.sprint;
    this.aiming = false;
    this.attack = null;
    let tvx = 0;
    let tvz = 0;
    let wantH = null;
    if (ax.x || ax.y) {
      const fx = -Math.sin(this.camYaw);
      const fz = -Math.cos(this.camYaw);
      tvx = fx * -ax.y + -fz * ax.x;
      tvz = fz * -ax.y + fx * ax.x;
      const l = Math.hypot(tvx, tvz);
      tvx /= l;
      tvz /= l;
      wantH = Math.atan2(tvx, tvz);
      const sp = (fast ? SWIM_FAST : SWIM) * Math.min(1, Math.hypot(ax.x, ax.y));
      // se nada para donde mira el cuerpo (no de costado): la velocidad va con el rumbo
      tvx = Math.sin(this.heading) * sp;
      tvz = Math.cos(this.heading) * sp;
    }
    // el agua tiene inercia: cuesta arrancar y se sigue deslizando un poco
    this.mvx ??= 0;
    this.mvz ??= 0;
    const tgt = Math.hypot(tvx, tvz);
    const cur = Math.hypot(this.mvx, this.mvz);
    const acc = tgt > cur ? 2.4 : 1.6;
    const dvx = tvx - this.mvx;
    const dvz = tvz - this.mvz;
    const dl = Math.hypot(dvx, dvz);
    if (dl > 1e-4) {
      const st = Math.min(dl, acc * dt);
      this.mvx += (dvx / dl) * st;
      this.mvz += (dvz / dl) * st;
    }
    if (wantH != null) {
      let diff = wantH - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * Math.min(1, dt * 3.2);
    }
    const x0 = this.x;
    const z0 = this.z;
    this.x += this.mvx * dt;
    this.z += this.mvz * dt;
    this.collide(world);
    // a una pared o un andén de más de 45 cm sobre el agua no se trepa nadando
    if (this.groundAt() > ag.level + 0.45) {
      this.x = x0;
      this.z = z0;
      this.mvx *= 0.3;
      this.mvz *= 0.3;
    }
    this.speed = Math.hypot(this.mvx, this.mvz);
    const moving = this.speed > 0.35;
    // brazadas: más seguidas a fondo; flotando, las piernas siguen batiendo despacio
    const prev = this.swimT;
    this.swimT += dt * (moving ? 0.24 + this.speed * 0.24 : 0.45);
    this.swimY = ag.level;
    animateHuman(this.h, dt, this.speed, moving ? 'swim' : 'tread', this.swimT);
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    // cada vez que entra una mano: salpica adelante y abre una onda
    if (moving && Math.floor(prev * 2) !== Math.floor(this.swimT * 2)) {
      const side = Math.floor(this.swimT * 2) % 2 ? 1 : -1;
      const hx = this.x + fx * 1.0 + fz * side * 0.25;
      const hz = this.z + fz * 1.0 - fx * side * 0.25;
      splash(world.fx, hx, ag.level, hz, 4 + this.speed * 3, 0.7 + this.speed * 0.25);
      ag.ripple(hx, hz, 0.35 + this.speed * 0.2);
      world.audio.brazada?.(0.4 + this.speed * 0.2);
    }
    // la estela: ondas que quedan atrás y espuma de la patada
    this.ripT = (this.ripT || 0) - dt;
    if (this.ripT <= 0) {
      this.ripT = moving ? 0.32 : 1.1;
      ag.ripple(this.x - fx * (moving ? 0.6 : 0), this.z - fz * (moving ? 0.6 : 0), moving ? 0.25 + this.speed * 0.15 : 0.18);
      if (moving) splash(world.fx, this.x - fx * 0.9, ag.level, this.z - fz * 0.9, 2, 0.4);
    }
  }
  // caminando por el agua: salpica a cada paso y deja ondas
  wading(dt, world, wd) {
    const ag = world.agua;
    this.wetT = Math.max(this.wetT || 0, Math.min(40, wd * 60));
    this.wadeT = (this.wadeT || 0) - dt;
    const sp = this.speed || 0;
    if (this.wadeT > 0) return;
    this.wadeT = sp > 0.3 ? Math.max(0.16, 0.42 - sp * 0.05) : 1.2;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    ag.ripple(this.x + fx * 0.25, this.z + fz * 0.25, Math.min(1, 0.15 + sp * 0.12 + wd * 0.2));
    if (sp > 0.3) {
      splash(world.fx, this.x + fx * 0.35, ag.level, this.z + fz * 0.35, 2 + sp * 1.5, 0.35 + sp * 0.12 + wd * 0.3);
      world.audio.chapoteo?.(Math.min(1, 0.25 + sp * 0.12));
    }
  }
  // al salir del agua: gotea un rato (la ropa empapada)
  drip(dt, world) {
    if (!(this.wetT > 0) || this.swimming) return;
    this.wetT -= dt;
    this.dripT = (this.dripT || 0) - dt;
    if (this.dripT > 0) return;
    this.dripT = 0.05 + (1 - Math.min(1, this.wetT / 40)) * 0.25;
    const a = Math.random() * Math.PI * 2;
    const r = 0.12 + Math.random() * 0.12;
    const y = this.y + 0.3 + Math.random() * 1.1;
    world.fx.alpha.add({ x: this.x + Math.cos(a) * r, y, z: this.z + Math.sin(a) * r, vx: 0, vy: -0.5, vz: 0, grav: -9.8, drag: 0, life: 0, max: 0.5, s0: 0.02, s1: 0.015, c0: [0.75, 0.8, 0.85], a: 0.5 });
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
    // (el pretil de los techos y el parapeto de la terraza frenan al que camina; saltando se pasan por arriba)
    colliders.resolveCircle(p, this.r, (b) => (b.kind !== 'platform' || y < 0.6) && !(b.over && y < -1) && (b.kind === 'pretil' ? y > b.y0 - 0.6 && y < b.h - 0.3 : (b.y0 ? y > b.y0 - 0.6 && y < b.h : y < 1 || y < b.h - 0.3) && (!airborne || b.h > 1.3)));
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
    // al volante: las manos siguen lo que dobla
    if (v.kind === 'car' && this.h.root.parent !== this.scene) animateHuman(this.h, dt, 0, 'manejar', v.steer || 0);
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
    // inundación: el agua frena (más cuanto más hondo y más rápido), levanta olas y, si llega a la toma
    // de aire, el motor se ahoga. Si el agua tapa el auto, Gaspi sale nadando.
    const ag = world.agua;
    const wd = ag ? ag.depth(v.x, v.z, this.heightAt(v.x, v.z)) : 0;
    let throttleW = throttle;
    if (wd > 0.03) {
      const big = v.kind === 'bus' || v.model === 'camion' || v.model === 'firetruck';
      const intake = moto ? 0.45 : big ? 1.0 : 0.7;
      if (wd > intake && !v.ahogado) {
        v.ahogado = true;
        hud.flash('SE AHOGÓ EL MOTOR', moto ? 'La moto tragó agua. Bajate y seguí a pie (o nadando).' : 'El agua le entró al motor. Bajate y seguí a pie (o nadando).', 'bad', 3);
        audio.chapoteo?.(1);
      }
      vf -= Math.sign(vf) * Math.min(Math.abs(vf), (0.9 * wd * Math.abs(vf) + 0.06 * wd * vf * vf + wd * 1.5) * dt);
      if (Math.abs(vf) > 1.5) carWake(world, v, wd);
      // flotando (src/flote.js): las ruedas no tocan el piso y lo lleva la corriente
      if (v.floating && !v.avisoFlota) {
        v.avisoFlota = true;
        hud.flash('EL AUTO FLOTA', 'Lo lleva el agua. F para bajarte y nadar.', 'warn', 2.6);
      }
    } else if (v.ahogado && wd < 0.05) v.ahogado = false;
    if (v.ahogado || v.floating) throttleW = 0;
    if (throttleW > 0) vf += (vf < -0.5 ? st.brake : st.acc * (1 - Math.max(0, vf) / (vmax * 1.15))) * dt * throttleW;
    else if (throttleW < 0) vf -= (vf > 0.5 ? st.brake : st.rev) * dt * -throttleW;
    else vf -= Math.sign(vf) * Math.min(Math.abs(vf), (1.8 + Math.abs(vf) * 0.03) * dt);
    if (hb) vf -= Math.sign(vf) * Math.min(Math.abs(vf), (moto ? 12 : 7) * dt);
    vf = Math.max(-st.rev * 1.5, Math.min(vmax, vf));
    v.steer += (steerIn - v.steer) * Math.min(1, dt * (moto ? 8 : 6));
    const sp = Math.abs(vf);
    const yaw = (v.steer * st.turn * Math.min(1, sp / 4.5) * Math.sign(vf) * (hb && !moto ? 1.55 : 1)) / (1 + sp / 38);
    // velocidad en el mundo con el rumbo viejo
    const wx = fx * vf + fz * vl;
    const wz = fz * vf - fx * vl;
    // en llanta: tiembla y, si la goma la pinchó un tiro, tira para el lado de esa rueda
    v.heading += yaw * dt * (v.flat ? 0.8 : 1) + (v.flat ? Math.sin(performance.now() / 300) * 0.002 : 0) + (v.flatPull || 0) * dt * Math.min(1, sp / 12) * Math.sign(vf || 1);
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
    v.throttle = throttleW; // para el ruido del motor (src/audio.js)
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
    this.brazoDriveBy(v);

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
        // (un canasto de basura lo lleva puesto cualquiera, hasta una moto despacio: src/canastos.js)
        if (hit.box.kind === 'canasto' && vel > 1.5 && CANASTOS.knock(hit.box, v.vx, v.vz, world)) continue;
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
    const t = this.techos ? this.techos.floor(this.x, this.z, this.y) : -Infinity;
    return Math.max(g, w, t);
  }
  // un pretil (o el parapeto de la terraza) al alcance, adelante: la altura de arriba, si se puede trepar
  pretilCerca(world) {
    const mv = Math.hypot(this.mvx || 0, this.mvz || 0);
    const fx = mv > 0.3 ? this.mvx / mv : Math.sin(this.heading);
    const fz = mv > 0.3 ? this.mvz / mv : Math.cos(this.heading);
    let best = null;
    for (const b of world.colliders.query(this.x + fx * 0.5, this.z + fz * 0.5, 1)) {
      if (b.kind !== 'pretil' || b.y0 < this.y - 0.6 || b.y0 > this.y + 0.3) continue;
      const top = b.h - this.y;
      if (top < 0.2 || top > 1.3) continue;
      // cerca y por delante
      const dx = b.bx - b.ax;
      const dz = b.bz - b.az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((this.x - b.ax) * dx + (this.z - b.az) * dz) / l2));
      const px = b.ax + dx * t - this.x;
      const pz = b.az + dz * t - this.z;
      const d = Math.hypot(px, pz);
      if (d > this.r + 0.6 || (d > 0.05 && (px * fx + pz * fz) / d < 0.3)) continue;
      if (best === null || b.h > best) best = b.h;
    }
    return best;
  }
  // cae al piso a v m/s: de más de unos 5 m se lastima y queda tirado; de una terraza alta no se salva
  caida(v) {
    if (v < 11 || this.dead || this.swimming) return;
    const ag = this.agua;
    if (ag?.wet && ag.level > this.y + 0.3) return;
    const k = Math.min(1, (v - 11) / 18);
    this.hooks.caida?.(v);
    this.knockDown(1.2 + k * 1.6, 0, 0);
    this.hurt((v - 11) * 6, v > 26 ? 'Te tiraste de muy alto' : 'Caíste de muy alto');
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
    // sentado manejando o subiendo o bajando: va colgado del vehículo (src/subir.js)
    if (this.subida) return;
    if (this.vehicle && this.h.root.parent !== this.scene) {
      this.y = this.vehicle.floating ? this.vehicle.floatY : this.vehicle.y || 0;
      return;
    }
    const dt = this.dt || 1 / 60;
    const ground = this.vehicle ? (this.vehicle.floating ? this.vehicle.floatY : this.vehicle.y || 0) : this.groundAt();
    if (this.boat) {
      // sentado en el bote: lo ubica src/botes.js
      this.vy = 0;
      this.h.root.position.set(this.x, this.y, this.z);
      this.h.root.rotation.set(0, this.heading, 0);
      return;
    }
    if (this.diving && !this.vehicle) {
      // buceando: dive() ya movió a Gaspi (this.vy es su velocidad para arriba o abajo; antes se borraba acá
      // cada cuadro y subir o bajar iba diez veces más lento)
    } else if (this.swimming && !this.vehicle) {
      // flota: sube y baja apenas con el agua
      const bob = Math.sin((this.swimT || 0) * Math.PI * 2) * 0.025;
      this.y += (this.swimY + bob - this.y) * Math.min(1, dt * 5);
      this.vy = 0;
    } else if (!this.vehicle && (this.vy !== 0 || this.y > ground + 0.3)) {
      // gravedad
      this.vy -= 13 * dt;
      this.y += this.vy * dt;
      if (this.y <= ground) {
        this.y = ground;
        this.caida(-this.vy);
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
    if (inCar && this.lastLook > 1.2 && !this.aiming) {
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
    // apuntando a pie, la cámara se acerca sobre el hombro; desde el auto (drive-by) apenas, para ver la calle
    const dist = (base + sp * 0.06) * (this.zoom ?? 1) * (1 - this.aimK * (inCar ? 0.2 : 0.55));
    const hgt = ufo ? 3.2 : inCar ? (vk === 'moto' ? 1.8 : 2.2) : 1.7 - 0.45 * (this.crouchK || 0);
    const pitch = this.camPitch * (1 - this.aimK * 0.5);
    // hombro derecho
    const hombro = inCar ? 0 : 0.85 * this.aimK;
    const sx = Math.cos(this.camYaw) * hombro;
    const sz = -Math.sin(this.camYaw) * hombro;
    const cx = this.x + Math.sin(this.camYaw) * Math.cos(pitch) * dist + sx;
    const cz = this.z + Math.cos(this.camYaw) * Math.cos(pitch) * dist + sz;
    const cy = this.y + hgt + Math.sin(pitch) * dist;
    const anchor = { x: this.x, y: this.y + hgt, z: this.z };
    // la cámara no se mete abajo del agua (nadando queda más baja, a ras del agua)
    const ag = this.agua;
    const diving = this.diving && ag;
    const ground = diving ? this.heightAt : ag && ag.wet ? (x, z) => Math.max(this.heightAt(x, z), ag.level + 0.25) : this.heightAt;
    // (y los techos que quedan por debajo: parado en un techo, la cámara no se mete adentro de la casa)
    const T = this.techos;
    const headY = anchor.y;
    const floor = T && !diving ? (x, z) => Math.max(ground(x, z), T.floor(x, z, headY, 0)) : ground;
    if (this.swimming) anchor.y = this.y + (diving ? 0.35 : 1.05);
    let gy = this.swimming ? cy - hgt + (diving ? 0.35 : 1.05) : cy;
    // buceando, la cámara queda abajo del agua (no corta la superficie)
    if (diving) gy = Math.min(gy, ag.level - 0.25);
    const goal = safeCamera(anchor, { x: cx, y: gy, z: cz }, colliders, floor);
    if (diving) goal.y = Math.min(goal.y, ag.level - 0.2);
    const { x: tx, y: ty, z: tz } = goal;
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
    // Suavizar entre dos puntos seguros también puede cortar la esquina de una casa.
    safeCamera(anchor, camera.position, colliders, floor);
    if (diving) camera.position.y = Math.min(camera.position.y, ag.level - 0.2);
    this.camPos.copy(camera.position);
    // al apuntar se mira más lejos: la mira queda en el centro de la pantalla
    const lx = this.x + sx - Math.sin(this.camYaw) * this.aimK * 6;
    const lz = this.z + sz - Math.cos(this.camYaw) * this.aimK * 6;
    const ly = this.y + (ufo ? 1.6 : inCar ? 1.4 : this.diving ? 0.1 : this.swimming ? 0.35 : 1.55 - 0.45 * (this.crouchK || 0)) + this.aimK * (0.2 - pitch * 2.5);
    camera.lookAt(lx, ly, lz);
    // campo visual: más abierto a alta velocidad, más cerrado al apuntar
    const fov = 62 + Math.min(12, sp * 0.35) - this.aimK * 14;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
      camera.updateProjectionMatrix();
    }
  }
}

function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// salpicadura: gotas que saltan y vuelven al agua, y un poco de espuma
export function splash(fx, x, y, z, n = 6, s = 1) {
  if (!fx) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (0.4 + Math.random() * 1.2) * s;
    fx.alpha.add({ x: x + Math.cos(a) * 0.1, y: y + 0.03, z: z + Math.sin(a) * 0.1, vx: Math.cos(a) * v, vy: (1.2 + Math.random() * 2.2) * s, vz: Math.sin(a) * v, grav: -9.8, drag: 0.4, life: 0, max: 0.35 + Math.random() * 0.35, s0: 0.05 * s, s1: 0.025, c0: [0.82, 0.84, 0.82], a: 0.75, floor: y });
  }
  fx.alpha.add({ x, y: y + 0.05, z, vx: 0, vy: 0.15, vz: 0, grav: 0, drag: 3, life: 0, max: 0.5, s0: 0.25 * s, s1: 0.9 * s, c0: [0.85, 0.85, 0.8], a: 0.35, floor: y });
}
