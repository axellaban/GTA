// Combate: combos de piñas y patada, palazos, tiros con mira o apuntado automático,
// balas de la cana, autos que se prenden fuego y explotan.
import * as THREE from 'three';
import { WEAPONS, ORDER, handWeapon, rocketMesh } from './weapons.js';
import { dentCar, dropBumper, looseBumper } from './cars.js';
import { R } from './rng.js';
import { TOUCH } from './input.js';

// combo de piñas: directo de izquierda, cruzado de derecha, gancho, uppercut y patada (poses en
// src/moves.js; el golpe cuenta cerca de la mitad, cuando el brazo llega estirado)
const COMBO = [
  { pose: 'jab', dur: 0.32, dmg: 9, reach: 1.5, hitAt: 0.34 },
  { pose: 'cross', dur: 0.4, dmg: 13, reach: 1.55, hitAt: 0.42 },
  { pose: 'hook', dur: 0.48, dmg: 18, reach: 1.45, hitAt: 0.48 },
  { pose: 'uppercut', dur: 0.5, dmg: 22, reach: 1.4, hitAt: 0.5 },
  { pose: 'kick', dur: 0.66, dmg: 30, reach: 1.85, knock: true, hitAt: 0.47 },
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
    this.rockets = []; // cohetes de la bazuca
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
    // la tumbera se quiebra y tira los dos cartuchos vacíos
    if (w.id === 'escopeta') {
      const hx = Math.sin(P.heading);
      const hz = Math.cos(P.heading);
      for (let i = 0; i < 2; i++) this.fx.casing(P.x + hx * 0.4, P.y + 1.2, P.z + hz * 0.4, -hz, hx, true);
    }
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
    this.updateRockets(dt, world);
  }

  playerCombat(dt, world) {
    const { player: P, input, hud } = world;
    if (input.hit('q', 'weapon')) this.cycle(P, 1);
    if (!hud.dialog) {
      for (let i = 0; i < ORDER.length; i++) {
        if (input.hit(String(i + 1)) && P.inv[ORDER[i]] && P.weapon !== ORDER[i]) {
          P.weapon = ORDER[i];
          P.attack = null;
          P.reloadT = 0;
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
    P.attack = { ...move, step, t: 0, hitDone: false, queued: false, tgt };
    P.fightT = 3.5; // queda en guardia un rato
    if (move.saw) this.audio.motosierra?.();
    else this.audio.whoosh(move.pose === 'kick' || move.pose === 'swing' ? 0.5 : move.pose === 'hook' || move.pose === 'uppercut' ? 0.4 : 0.3);
  }
  meleeUpdate(dt, world) {
    const P = world.player;
    const a = P.attack;
    if (!a) return;
    a.t += dt;
    // se acerca medio paso al que le pega (como en los GTA): mientras el golpe sale, si está a tiro
    const tg = a.tgt;
    if (tg && a.t < a.dur * (a.hitAt ?? 0.45)) {
      const ox = tg.obj?.x ?? tg.obj?.v?.x ?? tg.x;
      const oz = tg.obj?.z ?? tg.obj?.v?.z ?? tg.z;
      const d = Math.hypot(ox - P.x, oz - P.z);
      if (d > 1.0 && d < 2.6) {
        const step = Math.min(d - 0.95, 3.2 * dt);
        P.x += ((ox - P.x) / d) * step;
        P.z += ((oz - P.z) / d) * step;
        P.heading = Math.atan2(ox - P.x, oz - P.z);
      }
    }
    if (!a.hitDone && a.t > a.dur * (a.hitAt ?? 0.45)) {
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
    // una patada o un palazo al pasacalles del corte lo tira abajo
    world.events?.knock(P.x + Math.sin(P.heading) * 0.8, P.z + Math.cos(P.heading) * 0.8, a.reach * 0.6, Math.sin(P.heading), Math.cos(P.heading));
    const t = this.meleeTarget(P, world, a.reach + 0.35);
    if (!t || t.cos < 0.35) return;
    const fx = Math.sin(P.heading);
    const fz = Math.cos(P.heading);
    const heavy = a.pose === 'kick' || a.pose === 'swing' || a.pose === 'hook' || a.pose === 'uppercut';
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
      const byPlayer = b.byPlayer !== false;
      this.fires.push({ x: p.x, z: p.z, y: gy, t: 7, tick: 0, byPlayer, gang: b.gang });
      if (byPlayer) world.police.crime('tiros', p.x, p.z);
      world.npcs.panic(p.x, p.z, 25, b.shooter ?? world.player);
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
        // los de la banda pisan con cuidado su propio fuego
        if (f.gang && n.gang === f.gang) continue;
        const d = Math.hypot(n.x - f.x, n.z - f.z);
        if (d < 2.6 && !n.killed) {
          const res = world.npcs.hurt(n, 14, (n.x - f.x) / (d || 1), (n.z - f.z) / (d || 1), { byPlayer: f.byPlayer, world });
          if (res === 'muerte' && f.byPlayer) world.police.crime('muerte', n.x, n.z);
        }
      }
      if (!P.vehicle && Math.hypot(P.x - f.x, P.z - f.z) < 1.8) P.hurt(9, f.byPlayer ? 'Te quemaste con tu propio molotov' : 'Te prendieron fuego con un molotov');
      for (const v of this.vehicles(world)) if (Math.hypot(v.x - f.x, v.z - f.z) < 3) this.damageVehicle(world, v, 8, f.byPlayer);
    }
    this.fires = this.fires.filter((f) => f.t > 0);
  }

  // un enemigo tira un molotov en arco hasta (tx, tz)
  enemyMolotov(world, shooter, tx, tz) {
    const dx = tx - shooter.x;
    const dz = tz - shooter.z;
    const d = Math.hypot(dx, dz) || 1;
    const T = Math.max(0.5, d / 12);
    const y0 = (shooter.y || 0) + 1.7;
    const m = handWeapon('molotov');
    m.position.set(shooter.x + (dx / d) * 0.5, y0, shooter.z + (dz / d) * 0.5);
    this.scene.add(m);
    this.flying.push({ m, vx: dx / T, vy: (4.9 * T * T - y0) / T, vz: dz / T, byPlayer: false, gang: shooter.gang, shooter });
    this.audio.whoosh(0.45);
  }
  // un enemigo dispara la bazuca hacia (tx, ty, tz), con algo de error
  enemyRocket(world, shooter, tx, ty, tz, miss = 1.5) {
    const hx = Math.sin(shooter.heading);
    const hz = Math.cos(shooter.heading);
    const o = { x: shooter.x + hx * 0.9, y: (shooter.y || 0) + 1.55, z: shooter.z + hz * 0.9 };
    const d = new THREE.Vector3(tx + R.range(-miss, miss) - o.x, ty + R.range(-0.4, 0.6) - o.y, tz + R.range(-miss, miss) - o.z).normalize();
    this.fireRocket(world, o, d, shooter);
    this.fx.smoke(o.x - hx * 1.2, o.y, o.z - hz * 1.2, 6, { s0: 0.6, s1: 2.6, vx: -hx * 3, vz: -hz * 3, life: 0.8 });
    this.fx.muzzle(o.x - hx * 0.9, o.y + 0.1, o.z - hz * 0.9, -hx, -hz, true);
    const P = world.player;
    this.audio.disparo('bazuca', Math.max(0.15, 1 - Math.hypot(o.x - P.x, o.z - P.z) / 140));
  }

  // ---------- Lanzallamas: un chorro de fuego en cono que quema gente y autos ----------
  // shooter: Gaspi o un enemigo (con .x, .z, .y y .heading); se llama cada cuadro mientras tira
  flame(world, shooter, dt) {
    const P = world.player;
    const byPlayer = shooter === P;
    const hd = shooter.heading;
    const fx = Math.sin(hd);
    const fz = Math.cos(hd);
    const ox = shooter.x + fx * 0.95;
    const oz = shooter.z + fz * 0.95;
    const oy = (shooter.y || 0) + 1.3;
    // lenguas de fuego que salen de la boquilla, se abren y suben
    const n = Math.min(6, Math.max(1, Math.round(dt * 80)));
    for (let i = 0; i < n; i++) {
      const sp = R.range(8.5, 12.5);
      const a = hd + R.range(-0.12, 0.12);
      this.fx.add.add({ x: ox, y: oy, z: oz, vx: Math.sin(a) * sp, vy: R.range(0.1, 1.2), vz: Math.cos(a) * sp, grav: -2, drag: 1.6, life: 0, max: R.range(0.45, 0.7), s0: 0.22, s1: 1.7, c0: [1, 0.86, 0.5], c1: [1, 0.28, 0.04], a: 0.95 });
    }
    if (Math.random() < dt * 6) this.fx.smoke(ox + fx * 6, oy + 0.8, oz + fz * 6, 1, { black: true, s0: 0.8, s1: 3 });
    shooter.flameTick = (shooter.flameTick || 0) - dt;
    if (shooter.flameTick > 0) return;
    shooter.flameTick = 0.15;
    const RANGE = 8.5;
    const cone = (x, z) => {
      const dx = x - shooter.x;
      const dz = z - shooter.z;
      const d = Math.hypot(dx, dz);
      if (d > RANGE || d < 0.2) return 0;
      if ((dx * fx + dz * fz) / d < 0.92) return 0;
      if (world.colliders.blocked(shooter.x, shooter.z, x, z, 1.5) < 0.98) return 0;
      return 1 - d / (RANGE + 3);
    };
    for (const t of world.npcs.list) {
      if (t === shooter || t.killed || (shooter.gang && t.gang === shooter.gang)) continue;
      const k = cone(t.x, t.z);
      if (!k) continue;
      const res = world.npcs.hurt(t, 7 + 9 * k, fx, fz, { byPlayer, world });
      this.fx.fire(t.x, (t.y || 0) + 1, t.z, 2, 0.45);
      if (byPlayer && res === 'muerte') world.police.crime('muerte', t.x, t.z);
    }
    if (!byPlayer && !P.dead) {
      const tv = P.vehicle;
      const k = cone(tv ? tv.x : P.x, tv ? tv.z : P.z);
      if (k && tv) {
        this.damageVehicle(world, tv, 4 + 5 * k, false);
        if (tv.damage > 65 && !(tv.burning > 0)) tv.burning = R.range(4, 7);
      } else if (k) {
        P.hurt(2.5 + 3.5 * k, 'Te prendieron fuego con un lanzallamas');
        this.fx.fire(P.x, (P.y || 0) + 1, P.z, 2, 0.45);
      }
    }
    for (const v of this.vehicles(world)) {
      if (v.wreck || (v === P.vehicle && !byPlayer) || v === shooter.vehicle) continue;
      const k = cone(v.x, v.z);
      if (!k) continue;
      this.damageVehicle(world, v, 4 + 6 * k, byPlayer);
      if (v.damage > 70 && !(v.burning > 0)) {
        v.burning = R.range(3, 6);
        v.lastHitByPlayer = v.lastHitByPlayer || byPlayer;
      }
    }
    this.audio.burst(0.22, 520, 'lowpass', byPlayer ? 0.28 : 0.2 * Math.max(0, 1 - Math.hypot(shooter.x - P.x, shooter.z - P.z) / 60), 0, 0.5);
    world.npcs.panic(shooter.x, shooter.z, 30, shooter);
    if (byPlayer) world.police.crime('tiros', shooter.x, shooter.z);
  }

  // ---------- Bazuca ----------
  // shell: cañonazo del tanque (más rápido, sin estela de cohete, explota más fuerte y voltea casas)
  fireRocket(world, o, d, shooter, { shell = false } = {}) {
    const m = rocketMesh();
    m.position.set(o.x, o.y, o.z);
    m.lookAt(o.x + d.x, o.y + d.y, o.z + d.z);
    if (shell) m.scale.setScalar(1.3);
    this.scene.add(m);
    this.rockets.push({ m, x: o.x, y: o.y, z: o.z, dx: d.x, dy: d.y, dz: d.z, speed: shell ? 85 : 30, max: shell ? 90 : 55, life: 0, shooter, trail: 0, shell, power: shell ? 1.8 : 1.3, bdmg: shell ? 80 : 20 });
  }
  updateRockets(dt, world) {
    for (const r of this.rockets) {
      r.life += dt;
      // el motor lo va acelerando; tiembla un poquito en el aire
      r.speed = Math.min(r.max ?? 55, r.speed + dt * 40);
      const step = r.speed * dt;
      const hit = this.trace(world, { x: r.x, y: r.y, z: r.z }, { x: r.dx, y: r.dy, z: r.dz }, step, r.shooter);
      if (hit.type || r.life > 4 || r.y < -1) {
        this.rocketHit(world, r, hit.type ? hit : { x: r.x + r.dx * step, y: r.y + r.dy * step, z: r.z + r.dz * step });
        r.done = true;
        continue;
      }
      const px = r.x;
      const py = r.y;
      const pz = r.z;
      r.x += r.dx * step;
      r.y += r.dy * step;
      r.z += r.dz * step;
      r.m.position.set(r.x + R.range(-0.02, 0.02), r.y + R.range(-0.02, 0.02), r.z);
      r.m.lookAt(r.x + r.dx, r.y + r.dy, r.z + r.dz);
      r.m.rotateZ(r.life * 18);
      // estela: bocanadas de humo cada 40 cm y la llama del motor atrás
      r.trail += r.shell ? 0 : step;
      while (r.trail >= 0.4) {
        r.trail -= 0.4;
        const k = r.trail / step;
        const sx = r.x + (px - r.x) * k - r.dx * 0.3;
        const sy = r.y + (py - r.y) * k - r.dy * 0.3;
        const sz = r.z + (pz - r.z) * k - r.dz * 0.3;
        this.fx.alpha.add({ x: sx, y: sy, z: sz, vx: R.range(-0.3, 0.3), vy: R.range(0.1, 0.5), vz: R.range(-0.3, 0.3), grav: 0, drag: 1.2, life: 0, max: R.range(1.6, 2.6), s0: 0.35, s1: 2.2, c0: [0.78, 0.77, 0.75], a: 0.42, fadeIn: 0.05 });
      }
      this.fx.add.add({ x: r.x - r.dx * 0.32, y: r.y - r.dy * 0.32, z: r.z - r.dz * 0.32, vx: -r.dx * 3, vy: 0, vz: -r.dz * 3, grav: 0, drag: 6, life: 0, max: 0.09, s0: 0.75, s1: 0.2, c0: [1, 0.85, 0.5], c1: [1, 0.4, 0.1], a: 1 });
    }
    for (const r of this.rockets) if (r.done) this.scene.remove(r.m);
    this.rockets = this.rockets.filter((r) => !r.done);
  }
  rocketHit(world, r, hit) {
    const byPlayer = r.shooter === world.player;
    // pegó en un auto: vuela por el aire en el acto
    if (hit.type === 'veh' && !hit.obj.wreck) {
      const v = hit.obj;
      v.lastHitByPlayer = v.lastHitByPlayer || byPlayer;
      // el tanque aguanta unos cuantos
      if (v.kind === 'tank') {
        this.damageVehicle(world, v, r.shell ? 45 : 34, byPlayer, hit.x, hit.z);
        this.fx.explosion(hit.x, hit.z, 0.8, hit.y);
        this.audio.explosion(0.8);
        return;
      }
      v.damage = 100;
      this.explodeVehicle(world, v);
      return;
    }
    // cañonazos y cohetes le pegan a la casa donde explotan (src/destroy.js)
    if (hit.type === 'wall' || hit.type === 'ground' || !hit.type) world.destroy?.hit(world, hit.x, hit.z, r.bdmg ?? 20);
    if (hit.type === 'moto' && hit.obj.state !== 'down') world.crime.knockDown(hit.obj, world);
    if (hit.type === 'wall') {
      this.fx.chips(hit.x, hit.y, hit.z, hit.nx, hit.nz, [0.62, 0.58, 0.52], 14);
      this.fx.dust(hit.x + hit.nx * 0.3, hit.y, hit.z + hit.nz * 0.3, 10, [0.6, 0.56, 0.5], 1.6);
    }
    this.explode(world, hit.x, hit.z, r.power ?? 1.3, byPlayer, hit.y);
  }

  // ---------- Tiros ----------
  vehicles(world) {
    const list = world.traffic.cars.concat(world.traffic.parked, world.police.cars, world.tanks?.list.filter((t) => !world.traffic.parked.includes(t)) ?? []);
    if (world.player.vehicle && !list.includes(world.player.vehicle)) list.push(world.player.vehicle);
    return list;
  }

  trace(world, o, d, range, shooter) {
    let best = { t: range, type: null };
    const P = world.player;
    const wall = world.colliders.blockedHit(o.x, o.z, o.x + d.x * range, o.z + d.z * range, 1.2);
    // la pared frena el tiro solo si pasa por debajo de su altura (desde arriba se tira por encima)
    if (wall && o.y + d.y * wall.t * range <= wall.h + 0.1) best = { t: wall.t * range, type: 'wall', nx: wall.nx, nz: wall.nz, kind: wall.kind, h: wall.h };
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
      // a los chicos no les pegan las balas (pasan de largo)
      if (n === shooter || n.type === 'chico' || !near(n.x, n.z)) continue;
      const h = n.down ? 0.45 : n.state === 'cower' || n.state === 'sit' ? 1.1 : 1.8;
      test(n.x, n.z, n.down ? 0.6 : 0.36, n.y, n.y + h, 'npc', n);
    }
    for (const m of world.crime.motos) if (near(m.v.x, m.v.z)) test(m.v.x, m.v.z, 0.75, 0, 1.9, 'moto', m);
    for (const p of world.nafta?.pumps || []) if (!p.dead && near(p.x, p.z)) test(p.x, p.z, 0.45, 0, 2.1, 'pump', p);
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
  autoTarget(world, P, fx, fz, range, cars = false) {
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
    for (const n of world.npcs.list) if (!n.down && n.type !== 'chico') consider(n.x, n.y + 1.25, n.z, n.state === 'fight' || n.type === 'cana' || n.type === 'zombie' || (n.type === 'banda' && n.gang?.war));
    for (const m of world.crime.motos) if (m.state !== 'down') consider(m.v.x, 1.2, m.v.z, true);
    // con la bazuca también los autos (al medio de la carrocería); los patrulleros primero
    if (cars) for (const v of this.vehicles(world)) if (!v.wreck && v !== P.vehicle && v.kind !== 'moto') consider(v.x, 0.75, v.z, !!v.police);
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
    if (w.flame) {
      // el chorro sale para donde mira la cámara (o adonde camina)
      if (P.speed < 0.5 || P.aiming) P.heading = Math.atan2(-Math.sin(P.camYaw), -Math.cos(P.camYaw));
      this.flame(world, P, w.rate);
      if (a.mag === 0 && a.res > 0) setTimeout(() => this.reload(P), 250);
      return;
    }
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
      aim = this.autoTarget(world, P, hx, hz, Math.min(w.range, 70), !!w.rocket) ?? { x: P.x + hx * 30, y: P.y + (w.rocket ? 0.9 : 1.3), z: P.z + hz * 30 };
    }
    P.heading = Math.atan2(aim.x - P.x, aim.z - P.z);
    const hx = Math.sin(P.heading);
    const hz = Math.cos(P.heading);
    const o = { x: P.x + hx * 0.55 - hz * 0.12, y: P.y + 1.42, z: P.z + hz * 0.55 + hx * 0.12 };
    const base = new THREE.Vector3(aim.x - o.x, aim.y - o.y, aim.z - o.z).normalize();
    const moveSpread = (P.speed > 3 ? 2 : 1) * (w.heavy && P.speed > 1 ? 1.5 : 1);
    if (w.rocket) {
      // el cohete sale de la boca del tubo, sobre el hombro
      const ro = { x: o.x + hx * 0.5, y: o.y + 0.12, z: o.z + hz * 0.5 };
      this.fireRocket(world, ro, base, P);
      // contragolpe del tubo: humo y fogonazo para atrás
      this.fx.smoke(o.x - hx * 1.2, o.y, o.z - hz * 1.2, 6, { s0: 0.6, s1: 2.6, vx: -hx * 3, vz: -hz * 3, life: 0.8 });
      this.fx.muzzle(o.x - hx * 0.9, o.y + 0.1, o.z - hz * 0.9, -hx, -hz, true);
    }
    for (let i = 0; i < (w.rocket ? 0 : w.pellets); i++) {
      const d = base.clone();
      d.x += R.range(-1, 1) * w.spread * moveSpread;
      d.y += R.range(-1, 1) * w.spread * 0.6 * moveSpread;
      d.z += R.range(-1, 1) * w.spread * moveSpread;
      d.normalize();
      this.shot(world, o, d, w, P, w.dmg);
    }
    const long = w.pose === 'aimLong';
    const mz = { x: o.x + hx * (long ? 0.55 : 0), y: o.y, z: o.z + hz * (long ? 0.55 : 0) };
    if (!w.rocket) this.fx.muzzle(mz.x, mz.y, mz.z, hx, hz, w.id === 'escopeta' || w.id === 'ametralladora');
    // la pistola, la metra y la ametralladora escupen el casquillo (el revólver lo guarda; la tumbera, al recargar)
    if (w.id === 'pistola' || w.id === 'metra' || w.id === 'ametralladora') this.fx.casing(o.x - hx * 0.25, o.y + 0.05, o.z - hz * 0.25, hx, hz, w.id === 'ametralladora');
    this.audio.disparo(w.sound, 1);
    const kick = { escopeta: [0.3, 1, 0.05], revolver: [0.16, 0.5, 0.032], metra: [0.08, 0.5, 0.008], ametralladora: [0.13, 0.7, 0.012], bazuca: [0.55, 1, 0.07] }[w.id] ?? [0.08, 0.5, 0.014];
    this.fx.shake += kick[0];
    P.recoil = kick[1];
    // la mira sube con el golpe del tiro (y la ametralladora tiembla para los costados)
    P.camPitch = Math.max(-0.35, P.camPitch - kick[2]);
    if (w.id === 'ametralladora') P.camYaw += R.range(-0.006, 0.006);
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
    } else if (hit.type === 'pump') {
      this.audio.metal(0.6);
      world.nafta.hit(world, hit.obj, w.rocket ? 999 : dmg, byPlayer);
    } else if (hit.type === 'moto') {
      this.fx.sparks(hit.x, hit.y, hit.z, 5, 4);
      if (hit.obj.state !== 'down') world.crime.knockDown(hit.obj, world);
    } else if (hit.type === 'veh') {
      const v = hit.obj;
      this.fx.sparks(hit.x, hit.y, hit.z, 6, 5);
      this.audio.metal(0.5);
      if (v.kind === 'moto' && v.rider) world.traffic.ejectRider(v, world, fx, fz);
      this.damageVehicle(world, v, dmg * 0.45, byPlayer, hit.x, hit.z, true);
      if (v === world.player.vehicle && !byPlayer) world.player.hurt(dmg * 0.12, 'Te balearon el auto');
    } else if (hit.type === 'player') {
      world.player.hurt(dmg, 'Te dieron un tiro');
      world.player.hitReact?.(o.x, o.z);
      this.fx.blood(hit.x, hit.y, hit.z, fx, fz, 8, 3);
    } else if (hit.type === 'wall') {
      // revoque: chispa, polvo, astillas que saltan para afuera y el agujero que queda
      const fence = hit.kind === 'fence';
      this.fx.sparks(hit.x, hit.y, hit.z, fence ? 6 : 3, 3);
      if (!fence) {
        this.fx.dust(hit.x + hit.nx * 0.05, hit.y, hit.z + hit.nz * 0.05, 3, [0.7, 0.66, 0.6], 0.5);
        this.fx.chips(hit.x, hit.y, hit.z, hit.nx, hit.nz, [0.62, 0.58, 0.52], 4);
        if (hit.y > 0.1 && hit.y < hit.h) this.fx.bulletHole(hit.x + hit.nx * 0.012, hit.y, hit.z + hit.nz * 0.012, hit.nx, 0, hit.nz);
      }
    } else if (hit.type === 'ground') {
      this.fx.dust(hit.x, 0.1, hit.z, 3, [0.5, 0.48, 0.44], 0.5);
      this.fx.chips(hit.x, this.fx.ground(hit.x, hit.z) + 0.03, hit.z, 0, 0, [0.35, 0.34, 0.33], 3);
      this.fx.bulletHole(hit.x, this.fx.ground(hit.x, hit.z) + 0.03, hit.z, 0, 1, 0);
    }
    return hit;
  }

  // la cana tira: acierta menos de lejos y si Gaspi corre (wid: pistola, metra o ametralladora)
  enemyShoot(world, shooter, accuracy = 0.5, wid = 'pistola') {
    const W = WEAPONS[wid] ?? WEAPONS.pistola;
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
    const heavy = W.id === 'ametralladora';
    this.shot(world, o, d, W, shooter, heavy ? 6 : W.id === 'metra' ? 4 : 6);
    this.fx.muzzle(o.x + hx * (heavy ? 0.5 : 0), o.y, o.z + hz * (heavy ? 0.5 : 0), hx, hz, heavy);
    this.fx.casing(o.x - hx * 0.25, o.y + 0.05, o.z - hz * 0.25, hx, hz, heavy);
    this.audio.disparo(W.sound, Math.max(0.1, 1 - Math.hypot(o.x - P.x, o.z - P.z) / 120));
    world.npcs.panic(o.x, o.z, 30, shooter);
  }

  // ---------- Autos: humo, fuego y explosión ----------
  // hx, hz: dónde pegó (si se sabe), para abollar ahí
  damageVehicle(world, v, dmg, byPlayer, hx = null, hz = null, bullet = false) {
    if (v.wreck) return;
    // blindado: las balas casi no le hacen nada
    if (v.kind === 'tank') dmg *= bullet ? 0.04 : 0.35;
    const before = v.damage || 0;
    v.damage = Math.min(100, before + dmg);
    if (hx != null) {
      dentCar(v, hx, hz, dmg);
      v.kick?.(hx, hz, bullet ? dmg * 0.15 : dmg);
      // golpes acumulados adelante o atrás: se cae el paragolpes
      if (!bullet && v.kind === 'car') {
        const u = v.mesh.userData;
        const lz = (hx - v.x) * v.fx + (hz - v.z) * v.fz;
        const front = lz > 0;
        if (Math.abs(lz) > v.L / 2 - 0.7) {
          const key = front ? 'hitF' : 'hitR';
          u[key] = (u[key] || 0) + dmg;
          if (u[key] > 30) this.loseBumper(v, front);
        }
      }
      // choque: saltan pedazos de pintura y, si pega fuerte, vidrio
      if (!bullet && dmg > 4 && v.kind !== 'moto') {
        const c = v.mesh.userData.body?.material.color;
        const glass = dmg > 9 || (before < 45 && v.damage >= 45);
        this.fx.debris(hx, 0.75, hz, c ? [c.r, c.g, c.b] : [0.3, 0.3, 0.3], Math.min(14, 3 + dmg * 0.6), glass ? Math.min(22, 6 + dmg) : 0);
      }
    }
    if (byPlayer) v.lastHitByPlayer = true;
    // auto estacionado: salta la alarma
    if (!v.ai && !v.driver && v.kind === 'car' && !v.police) v.alarmT = 12;
    if (v.damage >= 100 && !(v.burning > 0)) v.burning = R.range(4.5, 7);
    if (v.ai && byPlayer) v.ai.panic = 10;
  }
  loseBumper(v, front) {
    const b = dropBumper(v, front);
    if (!b) return;
    // de coordenadas del auto al mundo (contando la suspensión no: la diferencia es de centímetros)
    const c = Math.cos(v.heading);
    const s = Math.sin(v.heading);
    const wx = v.x + b.x * c + b.z * s;
    const wz = v.z - b.x * s + b.z * c;
    const m = looseBumper(b.w);
    m.rotation.y = v.heading;
    const sp = v.speed || 0;
    const out = front ? 1 : -1;
    this.fx.part(m, wx, b.y, wz, v.fx * (sp * 0.6 + out * 1.5), 1.8, v.fz * (sp * 0.6 + out * 1.5), 0.05);
    this.audio.metal(0.7);
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
      // capó: con mucho daño se levanta y, andando, flamea con el viento
      const hd = v.mesh.userData.hood;
      if (hd && vis && (hd.k > 0.001 || v.damage > 70)) {
        v.hoodT = (v.hoodT || 0) + dt;
        const sp = Math.abs(v.speed || 0);
        const want = v.damage > 70 ? 0.42 + Math.min(0.5, sp * 0.03) + Math.sin(v.hoodT * 19) * Math.min(0.1, sp * 0.006) : 0;
        if (want > 0 && hd.k < 0.05) this.audio.metal(0.4);
        hd.k += (want - hd.k) * Math.min(1, dt * (want > hd.k ? 9 : 4));
        hd.pivot.rotation.x = -hd.k;
        hd.pivot.visible = hd.bay.visible = hd.k > 0.03;
      }
      if (v.wreck) {
        v.wreckT = (v.wreckT || 0) + dt;
        if (v.blast) this.blastStep(v, dt, world);
        if (vis && v.wreckT < 40 && Math.random() < dt * 4) this.fx.smoke(v.x, 1.4 + (v.tilt?.y || 0), v.z, 1, { black: true, s0: 1.2, s1: 5 });
        // sigue ardiendo un rato después de explotar
        if (vis && v.wreckT < 14 && Math.random() < dt * 10) this.fx.fire(v.x + R.range(-0.8, 0.8), 0.8 + (v.tilt?.y || 0), v.z + R.range(-0.8, 0.8), 1, 0.4);
        continue;
      }
      // soltado por el rayo tractor: cae y se hace pelota según la altura
      if (v.blast) {
        this.blastStep(v, dt, world);
        continue;
      }
      if (v.shove) this.shoveStep(v, dt);
      if (v.coast) this.coastStep(v, dt, world);
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
    // salta por el aire dando vueltas; a veces cae dado vuelta
    const flip = v.kind === 'car' && R.chance(0.3);
    v.tilt = { x: 0, y: 0, z: 0 };
    v.blast = { vy: R.range(6, 9) * (v.kind === 'bus' ? 0.4 : 1), wx: R.range(-2, 2), wz: (flip ? 1 : R.range(-0.4, 0.4)) * R.range(4, 7) * (R.chance(0.5) ? 1 : -1), flip, vx: R.range(-1.5, 1.5), vz: R.range(-1.5, 1.5) };
    this.flyParts(world, v);
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
  // el auto que explotó vuela, gira y cae (derecho o dado vuelta); rebota una vez
  blastStep(v, dt, world) {
    const b = v.blast;
    const t = v.tilt;
    b.vy -= 9.8 * dt;
    t.y += b.vy * dt;
    t.x += b.wx * dt;
    t.z += b.wz * dt;
    v.x += b.vx * dt;
    v.z += b.vz * dt;
    const rest = b.flip ? (v.tall ?? 1.4) - 0.1 : 0;
    if (t.y <= rest && b.vy < 0 && b.drop) {
      // cayó desde el rayo tractor: más alto, peor
      const h = b.drop;
      b.drop = 0;
      this.fx.dust(v.x, 0.2, v.z, 12, [0.45, 0.42, 0.38], 1.8);
      this.fx.sparks(v.x, 0.3, v.z, 14, 6);
      this.audio.golpe(1);
      this.fx.shake += Math.min(0.6, h / 20);
      if (!v.wreck) {
        if (h > 9) {
          v.damage = 100;
          v.lastHitByPlayer = true;
          this.explodeVehicle(world, v);
          return;
        }
        this.damageVehicle(world, v, h * 9, true, v.x + v.fx * 1.5, v.z + v.fz * 1.5);
        // dado vuelta se prende fuego
        if (b.flip) {
          v.damage = 100;
          v.burning = Math.min(v.burning > 0 ? v.burning : 99, R.range(3, 5));
        }
      }
    }
    if (t.y <= rest && b.vy < 0) {
      if (b.vy < -4 && !b.bounced) {
        b.bounced = true;
        b.vy *= -0.3;
        b.wx *= 0.4;
        b.wz *= 0.4;
        this.fx.sparks(v.x, 0.3, v.z, 16, 6);
        this.fx.dust(v.x, 0.2, v.z, 8, [0.4, 0.38, 0.35], 1.4);
        this.audio.golpe(0.7);
      } else {
        // se acomoda: derecho o con el techo en el piso
        t.y = rest;
        t.x = 0;
        t.z = b.flip ? Math.PI : 0;
        v.blast = null;
        this.audio.metal(0.6);
        if (!v.wreck && !b.flip) v.tilt = null;
      }
    }
    v.sync(0);
  }
  // empujón de una explosión cercana: se corre, salta un poco y se sacude
  // El auto del que se tiró Gaspi: sigue de largo frenando solo; si se la da contra una pared,
  // otro auto o alguien, choca como si lo manejaran.
  coastStep(v, dt, world) {
    if (v.driver || v.ai || v.wreck || v.blast) {
      v.coast = false;
      return;
    }
    const sp = Math.abs(v.speed);
    const s = Math.sign(v.speed) || 1;
    if (sp < 0.25) {
      v.coast = false;
      v.speed = 0;
      v.vx = v.vz = 0;
      v.settle?.();
      return;
    }
    const step = v.speed * dt;
    // la trompa (o la cola, si iba marcha atrás) contra las paredes
    const ax = v.x + v.fx * (v.L / 2) * s;
    const az = v.z + v.fz * (v.L / 2) * s;
    const wall = world.colliders.blockedHit(ax, az, ax + v.fx * step, az + v.fz * step, 0.9);
    let crash = wall ? { x: ax, z: az, k: 2.4 } : null;
    if (!crash) {
      for (const o of world.traffic.cars.concat(world.traffic.parked, world.police.cars)) {
        if (o === v || o.wreck || Math.abs(o.x - ax) > 6 || Math.abs(o.z - az) > 6) continue;
        if (o.circles().some((c) => Math.hypot(c.x - ax, c.z - az) < c.r + 0.3)) {
          crash = { x: ax, z: az, k: 2, other: o };
          break;
        }
      }
    }
    if (crash) {
      const dmg = sp * crash.k;
      this.damageVehicle(world, v, dmg, true, crash.x, crash.z);
      if (crash.other) {
        this.damageVehicle(world, crash.other, dmg * 0.8, true, crash.x, crash.z);
        crash.other.lastHitByPlayer = true;
        if (crash.other.ai) crash.other.speed *= 0.2;
      }
      this.fx.sparks(crash.x, 0.6, crash.z, Math.min(16, 4 + sp), 5);
      this.audio.metal(Math.min(1, sp / 14));
      this.audio.golpe(Math.min(1, sp / 18));
      this.fx.shake += Math.min(0.5, sp * 0.02) * Math.max(0, 1 - Math.hypot(world.player.x - v.x, world.player.z - v.z) / 40);
      v.speed = -v.speed * 0.12;
      if (Math.abs(v.speed) < 0.6) v.speed = 0;
    } else {
      v.x += v.fx * step;
      v.z += v.fz * step;
      // la gente que está en el medio sale volando
      for (const n of world.npcs.list) {
        if (n.down || Math.abs(n.x - ax) > 2.5 || Math.abs(n.z - az) > 2.5) continue;
        const lx = (n.x - v.x) * v.fz - (n.z - v.z) * v.fx;
        const lz = (n.x - v.x) * v.fx + (n.z - v.z) * v.fz;
        if (Math.abs(lx) < v.W / 2 + 0.3 && lz * s > 0 && Math.abs(lz) < v.L / 2 + 0.5 && sp > 2.5) {
          const res = world.npcs.hurt(n, sp * 3.2, v.fx * s, v.fz * s, { knock: true, knockT: 3, byPlayer: true, world, blast: Math.min(6, sp * 0.3) });
          if (res === 'muerte') world.police.crime('muerte', n.x, n.z);
          v.speed *= 0.85;
        }
      }
    }
    // sin nadie al volante frena de a poco (motor y rozamiento)
    v.speed = Math.sign(v.speed) * Math.max(0, Math.abs(v.speed) - (2.4 + Math.abs(v.speed) * 0.04) * dt);
    v.vx = v.fx * v.speed;
    v.vz = v.fz * v.speed;
    v.sync(dt);
  }
  shoveStep(v, dt) {
    const s = v.shove;
    s.t += dt;
    v.x += s.vx * dt;
    v.z += s.vz * dt;
    s.vx *= Math.exp(-dt * 3);
    s.vz *= Math.exp(-dt * 3);
    s.vy -= 9.8 * dt;
    v.lift = Math.max(0, (v.lift || 0) + s.vy * dt);
    if (v.lift <= 0 && s.vy < 0) s.vy = 0;
    if (s.t > 1.2) {
      v.shove = null;
      v.lift = 0;
    }
    if (!v.ai && !v.driver) v.sync(dt);
  }
  // al explotar salen volando una rueda, la puerta y el capó (encendidos)
  flyParts(world, v) {
    const u = v.mesh.userData;
    if (v.kind !== 'car') return;
    const out = (lx, lz) => ({ x: v.x + lx * Math.cos(v.heading) + lz * Math.sin(v.heading), z: v.z - lx * Math.sin(v.heading) + lz * Math.cos(v.heading) });
    const toss = (mesh, lx, lz, y, half) => {
      const p = out(lx, lz);
      const dx = p.x - v.x;
      const dz = p.z - v.z;
      const l = Math.hypot(dx, dz) || 1;
      const sp = R.range(4, 8);
      mesh.rotation.y = v.heading;
      this.fx.part(mesh, p.x, y, p.z, (dx / l) * sp, R.range(6, 10), (dz / l) * sp, half, { smoke: true, life: 60 });
    };
    // una rueda (se esconde la del auto)
    const w = u.wheels?.[Math.floor(Math.random() * 4)];
    if (w && w.visible) {
      w.visible = false;
      const m = new THREE.Mesh(w.geometry, charred);
      m.castShadow = true;
      toss(m, w.position.x * 2, w.position.z, 0.5, 0.11);
    }
    // la puerta del conductor y el capó, como chapas quemadas
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 1.0), charred);
    door.castShadow = true;
    toss(door, -v.W / 2 - 0.4, 0.3, 0.9, 0.03);
    if (R.chance(0.6)) {
      const hood = new THREE.Mesh(new THREE.BoxGeometry(v.W * 0.85, 0.04, 1.0), charred);
      hood.castShadow = true;
      toss(hood, 0, v.L / 2 - 0.6, 1.0, 0.03);
    }
  }
  explode(world, x, z, power = 1, byPlayer = false, y = 0) {
    const P = world.player;
    this.fx.explosion(x, z, power, y);
    const d = Math.hypot(P.x - x, P.z - z);
    this.audio.explosion(Math.max(0.15, 1 - d / 160));
    this.fx.shake += Math.max(0, 1.2 - d / 35);
    for (const n of world.npcs.list) {
      const dd = Math.hypot(n.x - x, n.z - z);
      if (dd > 8 || n.state === 'ko') continue;
      const l = dd || 1;
      world.npcs.hurt(n, (1 - dd / 8) * 130, (n.x - x) / l, (n.z - z) / l, { knock: true, knockT: 3.5, world, byPlayer, blast: (1 - dd / 8) * 9 * power });
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
      if (dd < 7) {
        this.damageVehicle(world, v, (1 - dd / 7) * 75 * power, byPlayer, x, z);
        // explosión en cadena: el de al lado se prende fuego y revienta a los pocos segundos
        const near = dd < 4 || (dd < 6.5 && R.chance(0.55));
        if (near && v.kind !== 'moto' && v.kind !== 'tank' && (v !== P.vehicle || dd < 4)) {
          v.damage = 100;
          v.burning = Math.min(v.burning > 0 ? v.burning : 99, R.range(1.2, 3.5));
          v.lastHitByPlayer = v.lastHitByPlayer || byPlayer;
        } else if (v.damage >= 100 && v.burning > 1.6) v.burning = R.range(0.5, 1.4);
      }
      if (dd < 10 && v.kind !== 'bus') {
        const l = dd || 1;
        const k = (1 - dd / 10) * power;
        v.shove = { t: 0, vx: ((v.x - x) / l) * 6 * k, vz: ((v.z - z) / l) * 6 * k, vy: 3.5 * k };
        if (v.ai) v.speed *= 0.3;
      }
    }
    for (const m of world.crime.motos) if (m.state !== 'down' && Math.hypot(m.v.x - x, m.v.z - z) < 7) world.crime.knockDown(m, world);
    world.events?.knock(x, z, 7);
    world.nafta?.blast(x, z, byPlayer);
    world.npcs.panic(x, z, 70);
    if (byPlayer) world.police.crime('explosion', x, z);
    world.social?.('boom', x, z);
  }
}
