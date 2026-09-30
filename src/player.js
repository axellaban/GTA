// Gaspi: caminar, correr, manejar, bajarse, pagar, empujar.
import * as THREE from 'three';
import { makeGaspi, animateHuman } from './human.js';
import { R } from './rng.js';

const WALK = 2.3;
const RUN = 6.3;

export class Player {
  constructor(scene, city, heightAt) {
    this.h = makeGaspi();
    scene.add(this.h.root);
    this.scene = scene;
    this.city = city;
    this.heightAt = heightAt;
    // vereda oeste de Av. Meeks, enfrente de la estación
    this.spawn = { x: -88.5, z: 18 };
    this.x = this.spawn.x;
    this.z = this.spawn.z;
    this.y = 0.15;
    this.heading = Math.PI / 2;
    this.speed = 0;
    this.camYaw = Math.PI / 2 + Math.PI; // la cámara mira hacia la estación
    this.camPitch = 0.28;
    this.vehicle = null;
    this.money = 20000;
    this.health = 100;
    this.respeto = 0;
    this.phone = true;
    this.grabbed = 0;
    this.dead = false;
    this.deadT = 0;
    this.lastLook = 0;
    this.r = 0.35;
    this.hooks = {};
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
    if (this.dead) return;
    this.health -= n;
    this.hooks.hurt?.(n, msg);
    if (this.health <= 0) this.die(msg || 'Te bajaron');
  }
  die(msg) {
    if (this.dead) return;
    this.dead = true;
    this.deadT = 5;
    this.health = 0;
    if (this.vehicle) this.exitVehicle(null, true);
    this.hooks.die?.(msg);
  }
  respawn() {
    this.dead = false;
    this.health = 100;
    const lost = Math.round(this.money / 2);
    this.addMoney(-lost);
    this.x = this.spawn.x;
    this.z = this.spawn.z;
    this.hooks.respawn?.(lost);
  }

  enterVehicle(v, world) {
    const { traffic, npcs, hud, audio } = world;
    if (v.ai) {
      // le sacás el auto al que manejaba
      traffic.release(v);
      const d = npcs.spawnWalker({ x: v.x - Math.cos(v.heading) * 1.8, z: v.z + Math.sin(v.heading) * 1.8, block: npcs.nearestBlock(v.x, v.z) });
      d.state = 'angry';
      d.angryT = 7;
      d.say('¡Eh! ¡Chorro! ¡Devolveme el auto!', 3.5);
      this.addRespeto(-2);
      audio.alerta();
    } else traffic.release(v);
    this.vehicle = v;
    v.driver = this;
    this.h.root.visible = false;
    if (v.revenge) {
      v.revenge = false;
      v.flat = true;
      v.damage = Math.min(100, v.damage + 15);
      hud.flash('TE RAYARON EL AUTO', 'Y te pincharon una goma. El trapito se ríe desde la esquina.', 'bad');
    }
    this.hooks.enter?.(v);
  }

  exitVehicle(world, forced = false) {
    const v = this.vehicle;
    if (!v) return;
    // se baja del lado del conductor (izquierda)
    const lx = -Math.cos(v.heading);
    const lz = Math.sin(v.heading);
    this.x = v.x + lx * (v.W / 2 + 0.7);
    this.z = v.z + lz * (v.W / 2 + 0.7);
    this.heading = v.heading;
    this.vehicle = null;
    v.driver = null;
    v.parked = true;
    v.steer = 0;
    this.h.root.visible = true;
    if (world) {
      world.traffic.parked.push(v);
      if (!forced && Math.abs(v.speed) < 2) world.npcs.onPark(v);
    }
    v.speed = 0;
    this.hooks.exit?.(v);
  }

  nearestVehicle(world, r = 3.4) {
    let best = null;
    let bd = r;
    for (const v of world.traffic.all()) {
      if (v.kind === 'bus') continue;
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
    const { input, colliders, trains, events, npcs, audio, hud } = world;
    if (this.dead) {
      this.deadT -= dt;
      animateHuman(this.h, dt, 0, 'knocked');
      if (this.deadT <= 0) this.respawn();
      this.place();
      return;
    }
    // cámara
    const sens = 0.0028;
    if (input.look.dx || input.look.dy) this.lastLook = 0;
    else this.lastLook += dt;
    this.camYaw -= input.look.dx * sens;
    this.camPitch = Math.max(-0.1, Math.min(1.1, this.camPitch + input.look.dy * sens));

    if (input.hit('f')) {
      if (this.vehicle) {
        if (Math.abs(this.vehicle.speed) < 3) this.exitVehicle(world);
      } else {
        const v = this.nearestVehicle(world);
        if (v) this.enterVehicle(v, world);
      }
    }

    if (this.vehicle) this.drive(dt, world);
    else this.walk(dt, world);

    // trenes: si te agarra uno en movimiento, fin
    const hit = trains.hitTest(this.x, this.z, this.vehicle ? 1.2 : 0.35);
    if (hit) {
      if (hit.moving && hit.speed > 2) {
        audio.golpe(1);
        this.die('TE PASÓ POR ENCIMA EL ROCA');
      } else {
        // empujar fuera del tren parado
        const s = Math.sin(hit.box.h);
        const c = Math.cos(hit.box.h);
        const push = (hit.lx >= 0 ? 1 : -1) * (1.5 + (this.vehicle ? 1.2 : 0.35) - Math.abs(hit.lx));
        this.x += c * push;
        this.z -= s * push;
      }
    }
    void events;
    void npcs;
    void hud;
    this.place();
  }

  walk(dt, world) {
    const { input, colliders, npcs, traffic } = world;
    const ax = input.axis();
    const run = input.down('shift') || input.touchButtons.has('run');
    let vx = 0;
    let vz = 0;
    if (ax.x || ax.y) {
      // relativo a la cámara
      const fx = -Math.sin(this.camYaw);
      const fz = -Math.cos(this.camYaw);
      const rx = -fz;
      const rz = fx;
      vx = fx * -ax.y + rx * ax.x;
      vz = fz * -ax.y + rz * ax.x;
      const l = Math.hypot(vx, vz);
      vx /= l;
      vz /= l;
      const mag = Math.min(1, Math.hypot(ax.x, ax.y));
      const sp = (run ? RUN : WALK) * mag * (this.grabbed > 0 ? 0.45 : 1);
      vx *= sp;
      vz *= sp;
      const want = Math.atan2(vx, vz);
      let diff = want - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * Math.min(1, dt * 12);
    }
    this.grabbed = Math.max(0, this.grabbed - dt);
    this.speed = Math.hypot(vx, vz);
    this.x += vx * dt;
    this.z += vz * dt;
    const p = { x: this.x, z: this.z };
    colliders.resolveCircle(p, this.r);
    // autos como obstáculos
    for (const v of traffic.all()) {
      if (Math.abs(v.x - p.x) > 8 || Math.abs(v.z - p.z) > 8) continue;
      for (const c of v.circles()) {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const d = Math.hypot(dx, dz);
        if (d < c.r + this.r && d > 0.001) {
          const pen = c.r + this.r - d;
          p.x += (dx / d) * pen;
          p.z += (dz / d) * pen;
          if (v.ai && Math.abs(v.speed) > 5) world.player.hurt(Math.abs(v.speed) * 3, 'Te llevó puesto un auto');
        }
      }
    }
    // la gente se corre un poco
    for (const n of npcs.list) {
      if (n.knockT > 0) continue;
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
    const pose = this.punchT > 0 ? 'punch' : this.phoneT > 0 ? 'phone' : 'walk';
    this.punchT = (this.punchT || 0) - dt;
    this.phoneT = (this.phoneT || 0) - dt;
    animateHuman(this.h, dt, this.speed, pose);
  }

  drive(dt, world) {
    const { input, colliders, traffic, npcs, events, audio, hud } = world;
    const v = this.vehicle;
    const ax = input.axis();
    const throttle = -ax.y;
    const steerIn = -ax.x;
    const vmax = (v.kind === 'bus' ? 16 : 27) * (v.flat ? 0.55 : 1) * (1 - v.damage / 250);
    if (throttle > 0) v.speed += (v.speed < 0 ? 14 : 8) * dt * throttle;
    else if (throttle < 0) v.speed += (v.speed > 0 ? -14 : -5) * dt * -throttle;
    else v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 2.5 * dt);
    if (input.down(' ')) v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 16 * dt);
    v.speed = Math.max(-6, Math.min(vmax, v.speed));
    v.steer += (steerIn - v.steer) * Math.min(1, dt * 6);
    const grip = input.down(' ') ? 1.6 : 1;
    const turn = v.steer * 1.9 * grip * Math.min(1, Math.abs(v.speed) / 5) * Math.sign(v.speed);
    v.heading += turn * dt * (v.flat ? 0.8 : 1) + (v.flat ? Math.sin(performance.now() / 300) * 0.002 : 0);
    v.x += v.fx * v.speed * dt;
    v.z += v.fz * v.speed * dt;

    // choques con casas
    let bump = 0;
    for (const c of v.circles()) {
      const p = { x: c.x, z: c.z };
      const hit = colliders.resolveCircle(p, c.r);
      if (hit) {
        v.x += p.x - c.x;
        v.z += p.z - c.z;
        bump = Math.max(bump, Math.abs(v.speed) * Math.abs(hit.nx * v.fx + hit.nz * v.fz));
      }
    }
    // choques con otros autos
    for (const o of traffic.all()) {
      if (o === v || Math.abs(o.x - v.x) > 12 || Math.abs(o.z - v.z) > 12) continue;
      for (const a of v.circles()) {
        for (const b of o.circles()) {
          const dx = a.x - b.x;
          const dz = a.z - b.z;
          const d = Math.hypot(dx, dz);
          const min = a.r + b.r;
          if (d < min && d > 0.001) {
            const pen = (min - d) / 2;
            v.x += (dx / d) * pen;
            v.z += (dz / d) * pen;
            o.x -= (dx / d) * pen;
            o.z -= (dz / d) * pen;
            bump = Math.max(bump, Math.abs(v.speed - (o.speed || 0)) * 0.7);
            if (o.ai) o.speed *= 0.5;
          }
        }
      }
    }
    // cortes y marchas: no se pasa
    const ev = events.inside(v.x + v.fx * v.L * 0.5, v.z + v.fz * v.L * 0.5, 0.3);
    if (ev) {
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
      v.speed = 0;
    }
    this.noPasaT = (this.noPasaT || 0) - dt;
    if (bump > 2) {
      if (bump > 6) {
        v.damage = Math.min(100, v.damage + bump * 0.6);
        audio.golpe(Math.min(1, bump / 15));
        if (bump > 11) hud.toast('¡Qué palo!');
      }
      v.speed *= -0.25;
    }
    // atropellar gente: se caen y se levantan puteando
    if (Math.abs(v.speed) > 3) {
      for (const n of npcs.list) {
        if (n.knockT > 0 || Math.abs(n.x - v.x) > 4 || Math.abs(n.z - v.z) > 4) continue;
        for (const c of v.circles()) {
          if (Math.hypot(n.x - c.x, n.z - c.z) < c.r + 0.4) {
            npcs.knock(n, v.fx, v.fz, Math.abs(v.speed));
            v.speed *= 0.7;
            this.addRespeto(-1);
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
    v.sync(dt);
    this.x = v.x;
    this.z = v.z;
    this.heading = v.heading;
    this.speed = v.speed;
  }

  place() {
    const y = this.vehicle ? 0 : this.heightAt(this.x, this.z);
    this.y += (y - this.y) * 0.35;
    this.h.root.position.set(this.x, this.y, this.z);
    this.h.root.rotation.y = this.heading;
  }

  // Cámara en tercera persona con un poco de retardo
  updateCamera(camera, dt, colliders) {
    const inCar = !!this.vehicle;
    if (inCar && this.lastLook > 1.2) {
      let target = this.heading + Math.PI;
      if (this.vehicle.speed < -1) target = this.heading;
      let diff = target - this.camYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.camYaw += diff * Math.min(1, dt * 2.5);
    }
    const dist = inCar ? (this.vehicle.kind === 'bus' ? 14 : 8.5) : 5;
    const hgt = inCar ? 2.2 : 1.7;
    const cx = this.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cz = this.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cy = this.y + hgt + Math.sin(this.camPitch) * dist;
    // si hay una pared en el medio, acercar la cámara
    const t = cy < 12 ? colliders.blocked(this.x, this.z, cx, cz, Math.max(2, cy - 0.5)) : 1;
    const k = Math.max(0.25, t * 0.95);
    const tx = this.x + (cx - this.x) * k;
    const tz = this.z + (cz - this.z) * k;
    const ty = this.y + hgt + (cy - this.y - hgt) * k;
    if (!this.camPos) this.camPos = new THREE.Vector3(tx, ty, tz);
    this.camPos.lerp(new THREE.Vector3(tx, ty, tz), Math.min(1, dt * 10));
    camera.position.copy(this.camPos);
    camera.lookAt(this.x, this.y + (inCar ? 1.4 : 1.55), this.z);
  }
}
