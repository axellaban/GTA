// Combate: combos de piñas y patada, palazos, tiros con mira o apuntado automático,
// balas de la cana, autos que se prenden fuego y explotan.
import * as THREE from 'three';
import { WEAPONS, ORDER, handWeapon } from './weapons.js';
import { dentCar } from './cars.js';
import { R } from './rng.js';
import { TOUCH } from './input.js';

const COMBO = [
  { pose: 'jab', dur: 0.3, dmg: 9, reach: 1.5 },
  { pose: 'cross', dur: 0.34, dmg: 13, reach: 1.55 },
  { pose: 'hook', dur: 0.46, dmg: 20, reach: 1.5 },
  { pose: 'kick', dur: 0.58, dmg: 30, reach: 1.8, knock: true },
];

const charred = new THREE.MeshStandardMaterial({ color: 0x1b1816, roughness: 1, metalness: 0.1 });
const camDir = new THREE.Vector3();

// rayo (en 3D, d normalizado) contra un cilindro vertical: devuelve t o null
function rayCircle(o, d, cx, cz, r) {
  const ox = o.x - cx;
  const oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  const c = ox * ox + oz * oz - r * r;
  if (c < 0) return 0;
  if (a < 1e-8) return null;
  const b = 2 * (ox * d.x + oz * d.z);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 ? t : null;
}

export class Combat {
  constructor(scene, fx, audio) {
    this.scene = scene;
    this.fx = fx;
    this.audio = audio;
    this.fireCd = 0;
    this.flying = []; // molotovs en el aire
    this.fires = []; // fuego en el piso
  }

  // ---------- Arsenal de Gaspi ----------
  setupPlayer(P) {
    P.inv = { punos: true, motosierra: true };
    P.ammo = {};
    P.weapon = 'punos';
    P.armor = 0;
    P.reloadT = 0;
    P.handMeshes = {};
    for (const id of ORDER) {
      if (id === 'punos') continue;
      const m = handWeapon(id);
      m.visible = false;
      P.h.bones.handR.add(m);
      P.handMeshes[id] = m;
    }
  }
  give(P, id) {
    const w = WEAPONS[id];
    const isNew = !P.inv[id];
    P.inv[id] = true;
    if (w.gun) {
      const a = (P.ammo[id] ??= { mag: 0, res: 0 });
      const add = w.ammoPickup;
      const fill = Math.min(w.mag - a.mag, add);
      a.mag += fill;
      a.res += add - fill;
    }
    if (w.throw) (P.ammo[id] ??= { mag: 0, res: 0 }).mag += w.ammoPickup;
    if (isNew || P.weapon === 'punos') P.weapon = id;
    this.syncHand(P);
  }
  cycle(P, dir = 1) {
    const owned = ORDER.filter((id) => P.inv[id]);
    const i = owned.indexOf(P.weapon);
    P.weapon = owned[(i + dir + owned.length) % owned.length];
    P.reloadT = 0;
    P.attack = null;
    this.syncHand(P);
  }
  syncHand(P) {
    for (const [id, m] of Object.entries(P.handMeshes)) m.visible = id === P.weapon && !P.vehicle;
  }
  strip(P) {
    P.inv = { punos: true, motosierra: true };
    P.ammo = {};
    P.weapon = 'punos';
    this.syncHand(P);
  }
  reload(P) {
    const w = WEAPONS[P.weapon];
    const a = P.ammo[P.weapon];
    if (!w.gun || !a || a.res <= 0 || a.mag >= w.mag || P.reloadT > 0) return;
    P.reloadT = w.reload;
    this.audio.recarga();
  }

  update(dt, world) {
    const P = world.player;
    this.fireCd -= dt;
    P.hitMarker = Math.max(0, (P.hitMarker || 0) - dt);
    if (!P.vehicle && !P.dead && !P.jack) this.playerCombat(dt, world);
    else {
      P.aiming = false;
      P.attack = null;
    }
    this.updateVehicles(dt, world);
    this.updateMolotovs(dt, world);
  }

  playerCombat(dt, world) {
    const { player: P, input, hud } = world;
    if (input.hit('q', 'weapon')) this.cycle(P, 1);
    if (!hud.dialog) {
      for (let i = 0; i < ORDER.length; i++) {
        if (input.hit(String(i + 1)) && P.inv[ORDER[i]]) {
          P.weapon = ORDER[i];
          P.attack = null;
          this.syncHand(P);
        }
      }
    }
    const w = WEAPONS[P.weapon];
    P.aiming = !!w.gun && input.down('mouse2');
    if (P.reloadT > 0) {
      P.reloadT -= dt;
      if (P.reloadT <= 0) {
        const a = P.ammo[P.weapon];
        const n = Math.min(w.mag - a.mag, a.res);
        a.mag += n;
        a.res -= n;
      }
    }
    if (w.gun && input.hit('r')) this.reload(P);
    if (hud.dialog) return;
    if (w.melee) {
      if (input.hit('mouse0', 'attack') || (w.auto && input.down('mouse0', 'attack') && !P.attack)) this.melee(P, world);
      this.meleeUpdate(dt, world);
    } else if (w.throw) {
      if (input.hit('mouse0', 'attack') && this.fireCd <= 0 && !P.attack) this.throwMolotov(world);
      this.meleeUpdate(dt, world);
    } else {
      P.attack = null;
      const fire = input.hit('mouse0', 'attack') || (w.auto && input.down('mouse0', 'attack'));
      if (fire && P.reloadT <= 0 && this.fireCd <= 0) this.playerShoot(world);
    }
  }

  // ---------- Piñas y palo ----------
  melee(P, world) {
    if (P.attack) {
      P.attack.queued = true;
      return;
    }
    this.startMelee(P, world, 0);
  }
  startMelee(P, world, step) {
    const w = WEAPONS[P.weapon];
    const move = w.id !== 'punos' ? { pose: 'swing', dur: w.dur, dmg: w.dmg, reach: w.range, knock: w.knock ?? R.chance(0.45), saw: !!w.saw } : COMBO[step % COMBO.length];
    const tgt = this.meleeTarget(P, world, 3);
    if (tgt) P.heading = Math.atan2(tgt.x - P.x, tgt.z - P.z);
    P.attack = { ...move, step, t: 0, hitDone: false, queued: false };
    if (move.saw) this.audio.motosierra?.();
    else this.audio.whoosh(move.pose === 'kick' || move.pose === 'swing' ? 0.5 : 0.3);
  }
  meleeUpdate(dt, world) {
    const P = world.player;
    const a = P.attack;
    if (!a) return;
    a.t += dt;
    if (!a.hitDone && a.t > a.dur * 0.45) {
      a.hitDone = true;
      this.meleeHit(P, world, a);
    }
    if (a.t >= a.dur) {
      P.attack = null;
      if (a.queued) this.startMelee(P, world, P.weapon === 'punos' ? (a.step + 1) % COMBO.length : 0);
    }
  }
  meleeTarget(P, world, r) {
    let best = null;
    let bs = Infinity;
    const fx = Math.sin(P.heading);
    const fz = Math.cos(P.heading);
    const consider = (x, z, obj, kind) => {
      const dx = x - P.x;
      const dz = z - P.z;
      const d = Math.hypot(dx, dz);
      if (d > r || d < 0.01) return;
      const cos = (dx * fx + dz * fz) / d;
      if (cos < -0.1) return;
      const score = d - cos * 0.8;
      if (score < bs) {
        bs = score;
        best = { x, z, obj, kind, d, cos };
      }
    };
    for (const n of world.npcs.list) if (n.state !== 'ko') consider(n.x, n.z, n, 'npc');
    // si no hay nadie parado, se puede rematar al que está tirado
    if (!best) for (const n of world.npcs.list) if (n.state === 'ko' && !n.killed) consider(n.x, n.z, n, 'npc');
    for (const m of world.crime.motos) if (m.state !== 'down' && m.v.speed < 4) consider(m.v.x, m.v.z, m, 'moto');
    for (const v of world.traffic.motos()) if (v.rider && Math.abs(v.speed) < 4) consider(v.x, v.z, v, 'rider');
    return best;
  }
  meleeHit(P, world, a) {
    const t = this.meleeTarget(P, world, a.reach + 0.35);
    if (!t || t.cos < 0.35) return;
    const fx = Math.sin(P.heading);
    const fz = Math.cos(P.heading);
    const heavy = a.pose === 'kick' || a.pose === 'swing' || a.pose === 'hook';
    this.fx.shake += a.saw ? 0.1 : heavy ? 0.24 : 0.12;
    if (!a.saw) this.audio.golpe(a.pose === 'swing' ? 0.9 : 0.6);
    P.hitMarker = 0.15;
    // el golpe "pega": el tiempo se congela un instante (con la motosierra, apenas)
    world.hitStop = a.saw ? 0.03 : heavy ? 0.1 : 0.07;
    if (t.kind === 'npc') {
      const n = t.obj;
      const down = n.down;
      const lying = n.state === 'ko';
      // sangre de la boca o la nariz (y más con el palo)
      const bh = lying ? 0.25 : 1.55;
      if (a.pose === 'swing' || R.chance(0.65)) this.fx.blood(t.x - fx * 0.15, bh, t.z - fz * 0.15, fx, fz, a.saw ? 24 : a.pose === 'swing' ? 12 : 6, a.saw ? 4 : a.pose === 'swing' ? 3 : 2);
      else this.fx.hit(t.x - fx * 0.3, 1.3, t.z - fz * 0.3);
      const px = n.x;
      const pz = n.z;
      const res = world.npcs.hurt(n, down ? a.dmg * 0.7 : a.dmg, fx, fz, { byPlayer: true, knock: a.knock, world });
      // la motosierra no suelta: el que corta queda enganchado en el lugar
      if (a.saw) {
        n.x = px;
        n.z = pz;
      }
      world.police.crime(n.type === 'cana' ? 'cana' : res === 'muerte' ? 'muerte' : res === 'ko' ? 'ko' : 'pina', n.x, n.z);
      if (res === 'ko' && !down) {
        world.hud.toast(R.pick(['¡Nocaut!', '¡A dormir!', '¡Fuera!']), 1.2);
        world.social?.('ko', n.x, n.z);
      }
      if (res === 'muerte') world.social?.('muerte', n.x, n.z);
    } else if (t.kind === 'moto') {
      world.crime.knockDown(t.obj, world);
    } else if (t.kind === 'rider') {
      world.traffic.ejectRider(t.obj, world, fx, fz);
      world.police.crime('pina', t.x, t.z);
    }
  }

  // ---------- Molotov: la botella vuela en arco y deja fuego en el piso ----------
  throwMolotov(world) {
    const P = world.player;
    const a = P.ammo.molotov;
    if (!a || a.mag <= 0) return;
    a.mag--;
    this.fireCd = 0.7;
    const fx = Math.sin(P.heading);
    const fz = Math.cos(P.heading);
    const m = handWeapon('molotov');
    m.position.set(P.x + fx * 0.5, 1.7, P.z + fz * 0.5);
    this.scene.add(m);
    this.flying.push({ m, vx: fx * 13, vy: 4.2, vz: fz * 13 });
    P.attack = { pose: 'swing', dur: 0.4, t: 0, hitDone: true, queued: false, step: 0 };
    this.audio.whoosh(0.5);
    if (a.mag <= 0) {
      delete P.inv.molotov;
      setTimeout(() => P.weapon === 'molotov' && ((P.weapon = 'punos'), this.syncHand(P)), 450);
    }
  }
  updateMolotovs(dt, world) {
    const ground = (x, z) => world.heightAt?.(x, z) ?? 0;
    for (const b of this.flying) {
      const p = b.m.position;
      b.vy -= 9.8 * dt;
      p.x += b.vx * dt;
      p.y += b.vy * dt;
      p.z += b.vz * dt;
      b.m.rotation.x += dt * 14;
      const gy = ground(p.x, p.z);
      if (p.y > gy + 0.05 && world.colliders.blocked(p.x - b.vx * dt, p.z - b.vz * dt, p.x, p.z, 0.2) > 0.98) continue;
      // se rompe: fogonazo y fuego que dura unos segundos
      b.done = true;
      this.scene.remove(b.m);
      this.fx.fire(p.x, gy + 0.3, p.z, 30, 1.6);
      this.fx.smoke(p.x, gy + 0.8, p.z, 6);
      this.audio.metal?.(0.5);
      this.audio.explosion?.(0.35);
      this.fires.push({ x: p.x, z: p.z, y: gy, t: 7, tick: 0 });
      world.police.crime('tiros', p.x, p.z);
      world.npcs.scare?.(p.x, p.z, 25, world);
    }
    this.flying = this.flying.filter((b) => !b.done);
    const P = world.player;
    for (const f of this.fires) {
      f.t -= dt;
      f.tick -= dt;
      if (R.chance(dt * 25)) this.fx.fire(f.x + R.range(-1.4, 1.4), f.y + 0.15, f.z + R.range(-1.4, 1.4), 2, 0.5);
      if (f.tick > 0) continue;
      f.tick = 0.35;
      for (const n of world.npcs.list) {
        const d = Math.hypot(n.x - f.x, n.z - f.z);
        if (d < 2.6 && !n.killed) {
          const res = world.npcs.hurt(n, 14, (n.x - f.x) / (d || 1), (n.z - f.z) / (d || 1), { byPlayer: true, world });
          if (res === 'muerte') world.police.crime('muerte', n.x, n.z);
        }
      }
      if (!P.vehicle && Math.hypot(P.x - f.x, P.z - f.z) < 1.8) P.hurt(9, 'Te quemaste con tu propio molotov');
      for (const v of this.vehicles(world)) if (Math.hypot(v.x - f.x, v.z - f.z) < 3) this.damageVehicle(world, v, 8, true);
    }
    this.fires = this.fires.filter((f) => f.t > 0);
  }

  // ---------- Tiros ----------
  vehicles(world) {
    const list = world.traffic.cars.concat(world.traffic.parked, world.police.cars);
    if (world.player.vehicle && !list.includes(world.player.vehicle)) list.push(world.player.vehicle);
    return list;
  }

  trace(world, o, d, range, shooter) {
    let best = { t: range, type: null };
    const P = world.player;
    const f = world.colliders.blocked(o.x, o.z, o.x + d.x * range, o.z + d.z * range, 1.2);
    if (f < 1) best = { t: f * range, type: 'wall' };
    if (d.y < -1e-4) {
      const t = -o.y / d.y;
      if (t < best.t) best = { t, type: 'ground' };
    }
    const near = (x, z) => Math.abs(x - o.x) < range + 3 && Math.abs(z - o.z) < range + 3;
    const test = (x, z, r, y0, y1, type, obj) => {
      const t = rayCircle(o, d, x, z, r);
      if (t === null || t >= best.t) return;
      const y = o.y + d.y * t;
      if (y < y0 - 0.1 || y > y1) return;
      best = { t, type, obj };
    };
    for (const n of world.npcs.list) {
      if (n === shooter || !near(n.x, n.z)) continue;
      const h = n.down ? 0.45 : n.state === 'cower' || n.state === 'sit' ? 1.1 : 1.8;
      test(n.x, n.z, n.down ? 0.6 : 0.36, n.y, n.y + h, 'npc', n);
    }
    for (const m of world.crime.motos) if (near(m.v.x, m.v.z)) test(m.v.x, m.v.z, 0.75, 0, 1.9, 'moto', m);
    for (const v of this.vehicles(world)) {
      if (v === shooter?.vehicle || !near(v.x, v.z)) continue;
      const h = v.kind === 'bus' ? 3.2 : v.kind === 'moto' ? 1.7 : v.tall ?? 1.5;
      for (const c of v.circles()) test(c.x, c.z, c.r, 0, h, 'veh', v);
    }
    if (shooter !== P && !P.dead && !P.vehicle) test(P.x, P.z, 0.38, P.y, P.y + 1.8, 'player', P);
    best.x = o.x + d.x * best.t;
    best.y = o.y + d.y * best.t;
    best.z = o.z + d.z * best.t;
    return best;
  }

  // el mejor blanco en el cono de la mirada (apuntado automático)
  autoTarget(world, P, fx, fz, range) {
    let best = null;
    let bs = Infinity;
    const consider = (x, y, z, hostile) => {
      const dx = x - P.x;
      const dz = z - P.z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 0.5) return;
      const cos = (dx * fx + dz * fz) / d;
      if (cos < 0.88) return;
      if (world.colliders.blocked(P.x, P.z, x, z, 1.5) < 0.98) return;
      const score = d * (1.2 - cos) * (hostile ? 0.3 : 1);
      if (score < bs) {
        bs = score;
        best = { x, y, z };
      }
    };
    for (const n of world.npcs.list) if (!n.down) consider(n.x, n.y + 1.25, n.z, n.state === 'fight' || n.type === 'cana' || n.type === 'zombie');
    for (const m of world.crime.motos) if (m.state !== 'down') consider(m.v.x, 1.2, m.v.z, true);
    return best;
  }

  playerShoot(world) {
    const { player: P, camera } = world;
    const w = WEAPONS[P.weapon];
    const a = P.ammo[P.weapon];
    if (!a || a.mag <= 0) {
      if (a && a.res > 0) this.reload(P);
      else {
        this.audio.click();
        world.hud.toast('Sin balas', 1);
      }
      this.fireCd = 0.3;
      return;
    }
    a.mag--;
    this.fireCd = w.rate;
    P.shootT = 0.16;
    // dirección: mira (cámara) o apuntado automático hacia adelante
    let aim;
    if (P.aiming) {
      camera.getWorldDirection(camDir);
      const hit = this.trace(world, camera.position, camDir, w.range + 10, P);
      aim = { x: hit.x, y: hit.y, z: hit.z };
    } else {
      const fx = -Math.sin(P.camYaw);
      const fz = -Math.cos(P.camYaw);
      const moving = P.speed > 0.5;
      const hx = moving ? Math.sin(P.heading) : fx;
      const hz = moving ? Math.cos(P.heading) : fz;
      aim = this.autoTarget(world, P, hx, hz, w.range) ?? { x: P.x + hx * 30, y: P.y + 1.3, z: P.z + hz * 30 };
    }
    P.heading = Math.atan2(aim.x - P.x, aim.z - P.z);
    const hx = Math.sin(P.heading);
    const hz = Math.cos(P.heading);
    const o = { x: P.x + hx * 0.55 - hz * 0.12, y: P.y + 1.42, z: P.z + hz * 0.55 + hx * 0.12 };
    const base = new THREE.Vector3(aim.x - o.x, aim.y - o.y, aim.z - o.z).normalize();
    const moveSpread = P.speed > 3 ? 2 : 1;
    for (let i = 0; i < w.pellets; i++) {
      const d = base.clone();
      d.x += R.range(-1, 1) * w.spread * moveSpread;
      d.y += R.range(-1, 1) * w.spread * 0.6 * moveSpread;
      d.z += R.range(-1, 1) * w.spread * moveSpread;
      d.normalize();
      this.shot(world, o, d, w, P, w.dmg);
    }
    this.fx.muzzle(o.x, o.y, o.z, hx, hz, w.id === 'escopeta');
    this.audio.disparo(w.sound, 1);
    this.fx.shake += w.id === 'escopeta' ? 0.3 : w.id === 'revolver' ? 0.16 : 0.08;
    P.recoil = w.id === 'escopeta' ? 1 : 0.5;
    world.npcs.panic(o.x, o.z, 45, P);
    world.police.crime('tiros', o.x, o.z);
    if (a.mag === 0 && a.res > 0) setTimeout(() => this.reload(P), 250);
  }

  shot(world, o, d, w, shooter, dmg) {
    const hit = this.trace(world, o, d, w.range, shooter);
    this.fx.tracer(o.x, o.y, o.z, hit.x, hit.y, hit.z);
    const byPlayer = shooter === world.player;
    const hl = Math.hypot(d.x, d.z) || 1;
    const fx = d.x / hl;
    const fz = d.z / hl;
    if (hit.type === 'npc') {
      const n = hit.obj;
      const res = world.npcs.hurt(n, dmg, fx, fz, { byPlayer, gun: true, knock: w.knock || dmg >= 45, knockT: 3, world });
      // la bala sale por atrás con sangre
      this.fx.blood(hit.x, hit.y, hit.z, fx, fz, w.id === 'escopeta' ? 7 : 10, 4);
      if (byPlayer) {
        world.player.hitMarker = 0.2;
        world.police.crime(n.type === 'cana' ? 'cana' : res === 'muerte' || res === 'ko' ? 'muerte' : 'herido', n.x, n.z);
        if (res === 'muerte') world.social?.('muerte', n.x, n.z);
      }
    } else if (hit.type === 'moto') {
      this.fx.sparks(hit.x, hit.y, hit.z, 5, 4);
      if (hit.obj.state !== 'down') world.crime.knockDown(hit.obj, world);
    } else if (hit.type === 'veh') {
      const v = hit.obj;
      this.fx.sparks(hit.x, hit.y, hit.z, 6, 5);
      this.audio.metal(0.5);
      if (v.kind === 'moto' && v.rider) world.traffic.ejectRider(v, world, fx, fz);
      this.damageVehicle(world, v, dmg * 0.45, byPlayer, hit.x, hit.z);
      if (v === world.player.vehicle && !byPlayer) world.player.hurt(dmg * 0.12, 'Te balearon el auto');
    } else if (hit.type === 'player') {
      world.player.hurt(dmg, 'Te dieron un tiro');
      world.player.hitReact?.(o.x, o.z);
      this.fx.blood(hit.x, hit.y, hit.z, fx, fz, 8, 3);
    } else if (hit.type === 'wall') {
      this.fx.sparks(hit.x, hit.y, hit.z, 4, 3);
      this.fx.dust(hit.x, hit.y, hit.z, 3, [0.7, 0.66, 0.6], 0.5);
    } else if (hit.type === 'ground') {
      this.fx.dust(hit.x, 0.1, hit.z, 3, [0.5, 0.48, 0.44], 0.5);
    }
    return hit;
  }

  // la cana tira: acierta menos de lejos y si Gaspi corre
  enemyShoot(world, shooter, accuracy = 0.5) {
    const P = world.player;
    const hx = Math.sin(shooter.heading);
    const hz = Math.cos(shooter.heading);
    const o = { x: shooter.x + hx * 0.55, y: shooter.y + 1.42, z: shooter.z + hz * 0.55 };
    const tx = P.vehicle ? P.vehicle.x : P.x;
    const tz = P.vehicle ? P.vehicle.z : P.z;
    const ty = P.vehicle ? 0.9 : P.y + 1.2;
    const dist = Math.hypot(tx - o.x, tz - o.z);
    const miss = (1 - accuracy) * (0.4 + dist * 0.05) * (1 + Math.min(2, Math.abs(P.speed) * 0.25));
    const d = new THREE.Vector3(tx + R.range(-miss, miss) - o.x, ty + R.range(-miss, miss) * 0.4 - o.y, tz + R.range(-miss, miss) - o.z).normalize();
    this.shot(world, o, d, WEAPONS.pistola, shooter, 6);
    this.fx.muzzle(o.x, o.y, o.z, hx, hz);
    this.audio.disparo('pistola', Math.max(0.1, 1 - Math.hypot(o.x - P.x, o.z - P.z) / 120));
    world.npcs.panic(o.x, o.z, 30, shooter);
  }

  // ---------- Autos: humo, fuego y explosión ----------
  // hx, hz: dónde pegó (si se sabe), para abollar ahí
  damageVehicle(world, v, dmg, byPlayer, hx = null, hz = null) {
    if (v.wreck) return;
    v.damage = Math.min(100, (v.damage || 0) + dmg);
    if (hx != null) dentCar(v, hx, hz, dmg);
    if (byPlayer) v.lastHitByPlayer = true;
    // auto estacionado: salta la alarma
    if (!v.ai && !v.driver && v.kind === 'car' && !v.police) v.alarmT = 12;
    if (v.damage >= 100 && !(v.burning > 0)) v.burning = R.range(4.5, 7);
    if (v.ai && byPlayer) v.ai.panic = 10;
  }
  updateVehicles(dt, world) {
    const P = world.player;
    for (const v of this.vehicles(world)) {
      const vis = Math.abs(v.x - P.x) < 160 && Math.abs(v.z - P.z) < 160;
      const hx = v.x + v.fx * v.L * 0.32;
      const hz = v.z + v.fz * v.L * 0.32;
      if (v.alarmT > 0) {
        v.alarmT -= dt;
        v.beepT = (v.beepT || 0) - dt;
        if (v.beepT <= 0) {
          v.beepT = 0.42;
          v.beepHi = !v.beepHi;
          const d = Math.hypot(v.x - P.x, v.z - P.z);
          if (d < 90) this.audio.tone([v.beepHi ? 1450 : 1050], 0.3, 'square', 0.12 * (1 - d / 90));
        }
      }
      if (v.wreck) {
        v.wreckT = (v.wreckT || 0) + dt;
        if (vis && v.wreckT < 40 && Math.random() < dt * 4) this.fx.smoke(v.x, 1.4, v.z, 1, { black: true, s0: 1.2, s1: 5 });
        continue;
      }
      if (vis && v.damage > 55 && Math.random() < dt * (v.damage - 50) * 0.15) this.fx.smoke(hx, 1.1, hz, 1, { black: v.damage > 82, s0: 0.5, s1: 2.5, vx: -v.fx * v.speed * 0.3, vz: -v.fz * v.speed * 0.3 });
      if (v.burning > 0) {
        v.burning -= dt;
        if (vis) {
          this.fx.fire(hx, 1.0, hz, 2, 0.5);
          if (Math.random() < dt * 8) this.fx.smoke(hx, 1.6, hz, 1, { black: true, s0: 1, s1: 4 });
        }
        if (v === P.vehicle && v.burning < 3 && !v.warned) {
          v.warned = true;
          world.hud.flash('¡SE PRENDE FUEGO!', TOUCH ? '¡Bajate ya!' : 'Bajate ya (F)', 'bad', 2);
        }
        if (v.burning <= 0) this.explodeVehicle(world, v);
      }
    }
  }
  explodeVehicle(world, v) {
    v.wreck = true;
    v.burning = 0;
    v.speed = 0;
    v.mesh.traverse((o) => {
      if (o.isMesh) o.material = charred;
    });
    v.mesh.rotation.z = R.range(-0.05, 0.05);
    const P = world.player;
    if (v.rider) world.traffic.ejectRider(v, world, 0, 0);
    if (P.vehicle === v) {
      P.exitVehicle(world, true);
      P.hurt(200, 'VOLASTE POR EL AIRE');
    }
    world.police.dropCar?.(v);
    if (v.ai || world.traffic.cars.includes(v)) {
      world.traffic.release(v);
      v.parked = true;
      world.traffic.parked.push(v);
    }
    this.explode(world, v.x, v.z, 1, v.lastHitByPlayer);
  }
  explode(world, x, z, power = 1, byPlayer = false) {
    const P = world.player;
    this.fx.explosion(x, z, power);
    const d = Math.hypot(P.x - x, P.z - z);
    this.audio.explosion(Math.max(0.15, 1 - d / 160));
    this.fx.shake += Math.max(0, 1.2 - d / 35);
    for (const n of world.npcs.list) {
      const dd = Math.hypot(n.x - x, n.z - z);
      if (dd > 8 || n.state === 'ko') continue;
      const l = dd || 1;
      world.npcs.hurt(n, (1 - dd / 8) * 130, (n.x - x) / l, (n.z - z) / l, { knock: true, knockT: 3.5, world, byPlayer });
    }
    if (!P.dead && d < 8) {
      if (P.vehicle) this.damageVehicle(world, P.vehicle, (1 - d / 8) * 40, false);
      else {
        P.hurt((1 - d / 8) * 90, 'Te agarró la explosión');
        P.knockDown?.(1.6, (P.x - x) / (d || 1), (P.z - z) / (d || 1));
      }
    }
    for (const v of this.vehicles(world)) {
      if (v.wreck) continue;
      const dd = Math.hypot(v.x - x, v.z - z);
      if (dd < 7) this.damageVehicle(world, v, (1 - dd / 7) * 75, byPlayer, x, z);
    }
    for (const m of world.crime.motos) if (m.state !== 'down' && Math.hypot(m.v.x - x, m.v.z - z) < 7) world.crime.knockDown(m, world);
    world.npcs.panic(x, z, 70);
    if (byPlayer) world.police.crime('explosion', x, z);
    world.social?.('boom', x, z);
  }
}
