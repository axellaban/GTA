// La Bonaerense: nivel de búsqueda (estrellas), patrulleros que persiguen con sirena y balizas,
// canas a pie que te quieren esposar (o te tiran si la cosa se pone fea) y el helicóptero.
import * as THREE from 'three';
import { makeCar } from './vehicles.js';
import { Vehicle } from './traffic.js';
import { handWeapon } from './weapons.js';
import { R } from './rng.js';
import { radialTexture } from './city.js';

const HEAT = { robo_negocio: 1.7, pina: 0.1, ko: 0.45, herido: 0.45, muerte: 0.9, tiros: 0.2, cana: 1.2, robo_auto: 0.6, atropello: 0.4, explosion: 1.1 };
const beaconMat = (c) => new THREE.MeshBasicMaterial({ color: c });

export class Police {
  constructor(scene, audio, nav) {
    this.scene = scene;
    this.audio = audio;
    this.nav = nav;
    this.heat = 0;
    this.stars = 0;
    this.cars = [];
    this.lostT = 0;
    this.seen = false;
    this.spawnT = 0;
    this.bustT = 0;
    this.tirosT = 0;
    this.heli = null;
    this.flash = 0;
    this.spikes = []; // tiras de clavos de los retenes
  }

  get wanted() {
    return this.stars > 0;
  }

  // Gaspi hizo algo: si alguien lo vio, sube la búsqueda
  crime(kind, x, z) {
    if (kind === 'tiros') {
      if (this.tirosT > 0) return;
      this.tirosT = 1.2;
    }
    let k = HEAT[kind] ?? 0.3;
    if (this.stars === 0 && !this.witnessed(x, z) && kind !== 'cana') k *= 0.5;
    const before = this.stars;
    this.heat = Math.min(6.99, this.heat + k);
    if (kind === 'cana' || kind === 'muerte') this.heat = Math.max(this.heat, 2);
    this.updateStars();
    this.lostT = 0;
    if (this.stars > before) {
      this.flash = 2;
      this.spawnT = Math.min(this.spawnT, before === 0 ? 3 : 1);
      if (before === 0) {
        this.hooks?.wanted?.(this.stars);
        this.world?.social?.('estrellas', x, z);
      }
    }
  }
  witnessed(x, z) {
    if (this.cars.length) return true;
    const w = this.world;
    if (!w) return true;
    // si hay un patrullero del tránsito cerca, seguro lo vio
    for (const v of w.traffic.cars) if (v.model === 'patrullero' && Math.hypot(v.x - x, v.z - z) < 60) return true;
    for (const n of w.npcs.list) if (!n.down && n.type !== 'zombie' && Math.hypot(n.x - x, n.z - z) < 30) return true;
    return R.chance(0.4);
  }
  updateStars() {
    this.stars = this.heat >= 1 ? Math.min(6, Math.floor(this.heat)) : 0;
  }
  clear() {
    this.heat = 0;
    this.stars = 0;
    this.lostT = 0;
    for (const v of this.cars) v.mode = 'leave';
    for (const n of this.world?.npcs.list || []) if (n.type === 'cana') n.state = 'leave';
  }

  // ---------- Patrulleros ----------
  spawnCar(world) {
    const { player, npcs } = world;
    let p = null;
    for (let i = 0; i < 10 && !p; i++) {
      const q = npcs.sidewalkPoint(player.x, player.z, 90, 170);
      if (q && q.edge.street.w >= 7) p = q;
    }
    if (!p) return;
    const e = p.edge;
    const s = Math.max(0, Math.min(e.len, (p.x - e.from.x) * e.dx + (p.z - e.from.z) * e.dz));
    // con 6 estrellas llega la Gendarmería: camionetas verde oliva
    const mesh = this.stars >= 6 ? makeCar('pickup', 0x3d4a2c) : makeCar('patrullero', 0x1d3f8c);
    const v = new Vehicle(mesh, e.from.x + e.dx * s + e.rx * e.lane, e.from.z + e.dz * s + e.rz * e.lane, Math.atan2(e.dx, e.dz));
    v.police = true;
    v.gendarmeria = this.stars >= 6;
    v.mode = 'chase';
    v.path = null;
    v.pathT = 0;
    v.stuckT = 0;
    v.crew = 2;
    v.damage = 0;
    // balizas: una roja y una azul que titilan
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.26), beaconMat(0xff2020));
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.26), beaconMat(0x2050ff));
    red.position.x = 0.24;
    blue.position.x = -0.24;
    bar.add(red, blue);
    bar.position.set(0, 1.52, -0.2);
    mesh.add(bar);
    v.beacons = { red, blue };
    this.scene.add(mesh);
    this.cars.push(v);
    return v;
  }
  // corta una calle adelante de Gaspi con dos patrulleros cruzados y canas armados
  roadblock(world) {
    const { player: P, traffic, npcs, hud } = world;
    const v0 = P.vehicle;
    const fx = v0.fx;
    const fz = v0.fz;
    const cand = traffic.graph.edges.filter((e) => {
      if (e.street.w < 7 || e.len < 20) return false;
      const mx = e.from.x + e.dx * e.len * 0.5 - P.x;
      const mz = e.from.z + e.dz * e.len * 0.5 - P.z;
      const d = Math.hypot(mx, mz);
      return d > 70 && d < 160 && (mx * fx + mz * fz) / d > 0.75;
    });
    if (!cand.length) return;
    const e = R.pick(cand);
    const cx = e.from.x + e.dx * e.len * 0.5;
    const cz = e.from.z + e.dz * e.len * 0.5;
    const q = e.street.w / 4;
    for (const s of [-1, 1]) {
      const v = this.spawnCar(world);
      if (!v) return;
      v.x = cx + e.rx * q * s;
      v.z = cz + e.rz * q * s;
      v.heading = Math.atan2(e.rx, e.rz) + (s > 0 ? 0 : Math.PI);
      v.speed = 0;
      v.mode = 'block';
      v.sync(0);
      // un cana atrás de cada patrullero
      const n = npcs.spawnCop(v.x - e.dx * 3, v.z - e.dz * 3);
      if (n) {
        n.heading = Math.atan2(-e.dx, -e.dz);
        this.arm(n);
      }
    }
    // tira de clavos del lado por donde llega Gaspi
    const side = (P.x - cx) * e.dx + (P.z - cz) * e.dz > 0 ? 1 : -1;
    this.addSpikes(cx + e.dx * side * 11, cz + e.dz * side * 11, e.rx, e.rz, e.dx, e.dz, e.street.w * 0.42);
    hud.flash('¡RETÉN!', 'La cana cortó la calle y tiró clavos. Esquivalos o te quedás en llanta', 'bad', 2.8);
  }

  // Tira de clavos (miguelitos) cruzada en la calle: a lo ancho (ax, az), media longitud half
  addSpikes(x, z, ax, az, dx, dz, half) {
    const g = new THREE.Group();
    const len = half * 2;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(len, 0.035, 0.42), new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.6, metalness: 0.5 }));
    belt.position.y = 0.04;
    g.add(belt);
    // franjas amarillas en las puntas para que se vean
    for (const k of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 0.44), new THREE.MeshStandardMaterial({ color: 0xf2c418, roughness: 0.5 }));
      tip.position.set(k * (half - 0.17), 0.045, 0);
      g.add(tip);
    }
    const n = Math.max(4, Math.floor(len / 0.18));
    const spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(0.025, 0.09, 4), new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.9 }), n * 2);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      for (let r = 0; r < 2; r++) spikes.setMatrixAt(i * 2 + r, m4.makeTranslation(-half + 0.09 + i * 0.18 + r * 0.09, 0.1, r ? 0.1 : -0.1));
    }
    g.add(spikes);
    g.position.set(x, 0.02, z);
    g.rotation.y = Math.atan2(ax, az) - Math.PI / 2;
    this.scene.add(g);
    this.spikes.push({ g, x, z, ax, az, dx, dz, half, life: 120 });
  }

  // ¿Gaspi pisó los clavos? Pincha las gomas (se manejan peor hasta pasar por chapa y pintura)
  updateSpikes(dt, world) {
    const v = world.player.vehicle;
    for (const s of this.spikes) {
      s.life -= dt;
      if (!v || v.flat || v.kind === 'carro' || Math.abs(v.speed) < 1) continue;
      const rx = v.x - s.x;
      const rz = v.z - s.z;
      const along = rx * s.ax + rz * s.az;
      const perp = rx * s.dx + rz * s.dz;
      if (Math.abs(along) < s.half + v.W * 0.4 && Math.abs(perp) < v.L * 0.5 + 0.2) {
        v.flat = true;
        world.audio.burst(0.25, 900, 'highpass', 0.6);
        world.audio.burst(0.18, 700, 'highpass', 0.5, 0.12);
        world.fx.sparks(v.x, 0.3, v.z, 14, 5);
        world.hud.flash('¡TE PINCHARON LAS GOMAS!', 'Andás en llanta: cambialas en chapa y pintura', 'bad', 2.8);
      }
    }
    this.spikes = this.spikes.filter((s) => {
      const far = Math.hypot(s.x - world.player.x, s.z - world.player.z) > 320;
      if (s.life > 0 && !far) return true;
      this.scene.remove(s.g);
      return false;
    });
  }

  dropCar(v) {
    if (!this.cars.includes(v)) return;
    this.cars = this.cars.filter((c) => c !== v);
    v.police = false;
  }

  drive(v, tx, tz, vmax, dt, world) {
    let diff = Math.atan2(tx - v.x, tz - v.z) - v.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (v.reverseT > 0) {
      v.reverseT -= dt;
      v.speed = Math.max(-5, v.speed - 10 * dt);
      v.heading -= Math.sign(diff) * 1.2 * dt;
    } else {
      const turn = Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
      v.heading += turn * Math.min(1, Math.abs(v.speed) / 4 + 0.2);
      let target = vmax;
      if (Math.abs(diff) > 0.7) target = Math.min(target, 7);
      v.speed += Math.sign(target - v.speed) * Math.min(Math.abs(target - v.speed), (target > v.speed ? 8 : 16) * dt);
    }
    v.steer = Math.max(-1, Math.min(1, diff * 2));
    v.x += v.fx * v.speed * dt;
    v.z += v.fz * v.speed * dt;
    this.collide(v, dt, world);
    if (Math.abs(v.speed) < 1 && vmax > 3) v.stuckT += dt;
    else v.stuckT = 0;
    if (v.stuckT > 1.8) {
      v.reverseT = 1.3;
      v.stuckT = 0;
    }
  }

  collide(v, dt, world) {
    let bump = 0;
    for (const c of v.circles()) {
      const p = { x: c.x, z: c.z };
      const hit = world.colliders.resolveCircle(p, c.r);
      if (hit) {
        v.x += p.x - c.x;
        v.z += p.z - c.z;
        bump = Math.max(bump, Math.abs(v.speed) * Math.abs(hit.nx * v.fx + hit.nz * v.fz));
      }
    }
    const P = world.player;
    const others = world.traffic.cars.concat(world.traffic.parked, this.cars);
    if (P.vehicle && !others.includes(P.vehicle)) others.push(P.vehicle);
    for (const o of others) {
      if (o === v || Math.abs(o.x - v.x) > 9 || Math.abs(o.z - v.z) > 9) continue;
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
            const rel = Math.abs(v.speed - (o.speed || 0));
            bump = Math.max(bump, rel * 0.6);
            if (o === P.vehicle && rel > 6) {
              o.damage = Math.min(100, o.damage + rel * 0.25);
              world.fx.shake += 0.15;
            }
          }
        }
      }
    }
    if (bump > 3) {
      v.speed *= 0.3;
      v.damage = Math.min(100, v.damage + bump * 0.2);
    }
    // atropella gente que se cruza (menos a otros canas)
    if (Math.abs(v.speed) > 4) {
      for (const n of world.npcs.list) {
        if (n.down || n.type === 'cana' || Math.abs(n.x - v.x) > 4 || Math.abs(n.z - v.z) > 4) continue;
        for (const c of v.circles()) {
          if (Math.hypot(n.x - c.x, n.z - c.z) < c.r + 0.4) {
            world.npcs.hurt(n, Math.abs(v.speed) * 3, v.fx, v.fz, { knock: true, world });
            v.speed *= 0.7;
            break;
          }
        }
      }
    }
  }

  // sigue el camino A* hacia (tx, tz); de cerca va directo
  chase(v, tx, tz, dt, world, vmax) {
    const d = Math.hypot(tx - v.x, tz - v.z);
    if (d < 45) {
      this.drive(v, tx, tz, Math.min(vmax, 4 + d * 0.5), dt, world);
      return;
    }
    v.pathT -= dt;
    if (!v.path || v.pathT <= 0 || v.pi >= v.path.length) {
      v.pathT = 2.5;
      const a = this.nav.nearestNode(v.x + v.fx * 8, v.z + v.fz * 8);
      const b = this.nav.nearestNode(tx, tz);
      v.path = this.nav.path(a, b) || [];
      v.pi = 0;
    }
    const e = v.path[v.pi];
    if (!e) {
      this.drive(v, tx, tz, vmax, dt, world);
      return;
    }
    const px = e.to.x + e.rx * e.lane * 0.6;
    const pz = e.to.z + e.rz * e.lane * 0.6;
    if (Math.hypot(px - v.x, pz - v.z) < 7) v.pi++;
    this.drive(v, px, pz, vmax, dt, world);
  }

  update(dt, world) {
    this.world = world;
    const { player: P, npcs, audio } = world;
    this.updateSpikes(dt, world);
    this.tirosT -= dt;
    this.flash = Math.max(0, this.flash - dt);
    // ---- ¿lo están viendo? ----
    this.seen = false;
    if (this.stars > 0) {
      const units = this.cars.map((v) => ({ x: v.x, z: v.z })).concat(npcs.list.filter((n) => n.type === 'cana' && !n.down));
      for (const u of units) {
        const d = Math.hypot(u.x - P.x, u.z - P.z);
        if (d < 25 || (d < 70 && world.colliders.blocked(u.x, u.z, P.x, P.z, 2.5) > 0.99)) {
          this.seen = true;
          break;
        }
      }
      if (this.heli && this.heli.y > 30) this.seen = this.seen || R.chance(0.02) || (P.speed < 8 && !P.vehicle);
      if (this.seen) this.lostT = 0;
      else {
        this.lostT += dt;
        if (this.lostT > 7 + this.stars * 3) {
          P.addRespeto(this.stars);
          this.clear();
          world.hud.flash('LA PERDISTE', 'La Bonaerense dejó de buscarte', 'ok', 2.6);
          world.social?.('perdio', P.x, P.z);
        }
      }
      // mandar más patrulleros
      this.spawnT -= dt;
      const want = this.stars >= 6 ? 8 : Math.min(6, this.stars + 1);
      const active = this.cars.filter((v) => v.mode === 'chase').length;
      if (this.spawnT <= 0 && active < want) {
        this.spawnCar(world);
        this.spawnT = R.range(3, 7) / this.stars;
      }
    }
    // ---- retenes: desde 3 estrellas, dos patrulleros cruzados en una calle adelante ----
    this.blockT = (this.blockT ?? 0) - dt;
    if (this.stars >= 3 && P.vehicle && this.blockT <= 0 && !this.cars.some((v) => v.mode === 'block')) {
      this.blockT = R.range(25, 40);
      this.roadblock(world);
    }
    // ---- patrulleros ----
    for (const v of this.cars) {
      const tx = P.vehicle ? P.vehicle.x + P.vehicle.fx * Math.max(0, P.vehicle.speed) * 0.4 : P.x;
      const tz = P.vehicle ? P.vehicle.z + P.vehicle.fz * Math.max(0, P.vehicle.speed) * 0.4 : P.z;
      const d = Math.hypot(P.x - v.x, P.z - v.z);
      if (v.wreck) continue;
      if (v.mode === 'chase') {
        if (!P.vehicle && d < 14) {
          // frena y bajan los canas
          v.mode = 'stop';
        } else this.chase(v, tx, tz, dt, world, 19 + this.stars);
      } else if (v.mode === 'stop') {
        v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 16 * dt);
        v.x += v.fx * v.speed * dt;
        v.z += v.fz * v.speed * dt;
        this.collide(v, dt, world);
        if (Math.abs(v.speed) < 0.5 && v.crew > 0) {
          for (const s of [-1, 1]) {
            if (v.crew <= 0) break;
            const n = npcs.spawnCop(v.x - v.fz * s * 1.6, v.z + v.fx * s * 1.6, v.gendarmeria);
            n.heading = v.heading;
            n.car = v;
            if (this.stars >= 2) this.arm(n);
            n.say(R.pick(['¡Alto, policía!', '¡Quieto ahí!', '¡Al piso!']), 2);
            v.crew--;
          }
          v.mode = 'parked';
        }
        if (P.vehicle && d > 20) v.mode = 'chase';
      } else if (v.mode === 'block') {
        // el retén se queda; se levanta cuando ya no te buscan o quedó lejos
        if (this.stars === 0 || d > 260) v.gone = true;
      } else if (v.mode === 'parked') {
        if (P.vehicle && d > 25 && this.stars > 0) {
          v.mode = 'chase';
          v.crew = 0;
        }
        if (d > 160) v.gone = true;
      } else if (v.mode === 'leave') {
        v.leaveT = (v.leaveT || 0) + dt;
        if (!v.path || v.pi >= v.path.length) {
          const a = this.nav.nearestNode(v.x, v.z);
          const far = world.traffic.graph.nodes.filter((n) => Math.hypot(n.x - P.x, n.z - P.z) > 220);
          v.path = this.nav.path(a, R.pick(far)) || [];
          v.pi = 0;
        }
        const e = v.path[v.pi];
        if (e) {
          if (Math.hypot(e.to.x - v.x, e.to.z - v.z) < 7) v.pi++;
          this.drive(v, e.to.x + e.rx * e.lane, e.to.z + e.rz * e.lane, 10, dt, world);
        }
        if (d > 170 || (v.leaveT > 30 && d > 90)) v.gone = true;
      }
      v.sync(dt);
      // balizas
      const on = v.mode !== 'leave' || v.leaveT < 5;
      const ph = (performance.now() / 120) | 0;
      v.beacons.red.material.color.setRGB(on && ph % 4 < 2 ? 4 : 0.25, 0.05, 0.05);
      v.beacons.blue.material.color.setRGB(0.05, 0.1, on && ph % 4 >= 2 ? 4 : 0.25);
      v.mesh.visible = Math.abs(v.x - P.x) < 280 && Math.abs(v.z - P.z) < 280;
    }
    this.cars = this.cars.filter((v) => {
      if (v.gone) this.scene.remove(v.mesh);
      return !v.gone;
    });
    // ---- esposas ----
    if (this.stars > 0 && !P.dead) {
      let adj = false;
      for (const n of npcs.list) if (n.type === 'cana' && !n.down && Math.hypot(n.x - P.x, n.z - P.z) < 1.5) adj = true;
      const still = P.vehicle ? Math.abs(P.vehicle.speed) < 1 : P.speed < 1.2 && !P.attack;
      if (adj && still) this.bustT += dt;
      else this.bustT = Math.max(0, this.bustT - dt * 2);
      if (this.bustT > 1.6) {
        this.bustT = 0;
        this.hooks?.busted?.();
      }
    } else this.bustT = 0;
    this.updateHeli(dt, world);
    // sirena: la del patrullero más cercano
    let near = Infinity;
    for (const v of this.cars) if (v.mode === 'chase' || v.mode === 'stop') near = Math.min(near, Math.hypot(v.x - P.x, v.z - P.z));
    audio.sirena(near < 150 ? 1 - near / 150 : 0);
    audio.helicoptero(this.heli ? Math.max(0, 1 - Math.hypot(this.heli.x - P.x, this.heli.z - P.z) / 120) * 0.6 : 0);
  }

  arm(n) {
    if (n.gun) return;
    n.gun = handWeapon('pistola');
    n.h.bones.handR.add(n.gun);
  }

  // ---------- Cana a pie ----------
  copBrain(n, dt, world, dp) {
    const P = world.player;
    if (n.state === 'leave' || this.stars === 0) {
      n.state = 'leave';
      if (!n.target || Math.hypot(n.target.x - n.x, n.target.z - n.z) < 1) n.target = { x: n.x + R.range(-30, 30), z: n.z + R.range(-30, 30) };
      if (dp > 70) n.dead = true;
      return { want: 1.4, pose: 'walk' };
    }
    if (this.stars >= 2) this.arm(n);
    n.shootCd = (n.shootCd ?? R.range(0.5, 1.5)) - dt;
    const armed = this.stars >= 2 && n.gun;
    const los = dp < 30 && world.colliders.blocked(n.x, n.z, P.x, P.z, 1.5) > 0.99;
    if (armed && los && dp > 4 && dp < 26 && !P.dead) {
      n.heading = Math.atan2(P.x - n.x, P.z - n.z);
      n.target = null;
      if (n.shootCd <= 0) {
        world.combat.enemyShoot(world, n, 0.12 + this.stars * 0.06);
        n.shootCd = R.range(0.8, 1.6) - this.stars * 0.08;
      }
      return { want: 0, pose: 'aim' };
    }
    n.target = { x: P.vehicle ? P.vehicle.x : P.x, z: P.vehicle ? P.vehicle.z : P.z };
    if (dp > 1.2) {
      if (n.cool <= 0 && dp < 20) {
        n.say(R.pick(['¡Alto, policía!', '¡Quieto ahí!', '¡Al piso, al piso!', '¡Las manos donde las vea!', '¡No te hagás el vivo!']), 2);
        n.cool = 6;
      }
      return { want: n.vmax, pose: armed ? 'holdGun' : 'flee' };
    }
    // al lado: lo quiere esposar; si se resiste, le pega
    n.heading = Math.atan2(P.x - n.x, P.z - n.z);
    if (P.attack && n.fightCd <= 0 && !n.act) {
      n.act = { pose: 'cross', t: 0, dur: 0.4 };
      n.fightCd = 1.1;
      P.hurt(8, 'La cana te cagó a palos');
      P.hitReact?.(n.x, n.z);
      world.audio.golpe(0.5);
    }
    if (n.cool <= 0) {
      n.say(R.pick(['¡Quedate quieto!', '¡Dame las manos!', '¡Estás detenido!']), 1.8);
      n.cool = 4;
    }
    return { want: 0, pose: 'guard' };
  }

  // ---------- Helicóptero ----------
  updateHeli(dt, world) {
    const P = world.player;
    if (this.stars >= 4 && !this.heli) this.makeHeli(P);
    const h = this.heli;
    if (!h) return;
    h.t += dt;
    const leaving = this.stars < 4;
    if (leaving) {
      h.y += dt * 8;
      h.x += dt * 20;
      if (h.y > 140) {
        this.scene.remove(h.g);
        this.scene.remove(h.cone);
        this.scene.remove(h.spot);
        this.heli = null;
        return;
      }
    } else {
      const a = h.t * 0.25;
      const tx = P.x + Math.cos(a) * 28;
      const tz = P.z + Math.sin(a) * 28;
      h.x += (tx - h.x) * Math.min(1, dt * 0.8);
      h.z += (tz - h.z) * Math.min(1, dt * 0.8);
      h.y += (42 - h.y) * Math.min(1, dt * 0.5);
    }
    h.g.position.set(h.x, h.y, h.z);
    h.g.rotation.y = Math.atan2(P.x - h.x, P.z - h.z);
    h.g.rotation.z = Math.sin(h.t * 0.7) * 0.05;
    h.rotor.rotation.y += dt * 30;
    h.tail.rotation.x += dt * 40;
    // reflector: cono hasta Gaspi y círculo de luz en el piso (de noche se nota)
    const night = world.time.night || world.time.glow > 0.3;
    h.cone.visible = h.spot.visible = night && !leaving;
    if (h.cone.visible) {
      const dx = P.x - h.x;
      const dy = -h.y;
      const dz = P.z - h.z;
      const len = Math.hypot(dx, dy, dz);
      h.cone.position.set((h.x + P.x) / 2, h.y / 2, (h.z + P.z) / 2);
      h.cone.scale.set(1, len, 1);
      h.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-dx / len, -dy / len, -dz / len));
      h.spot.position.set(P.x, 0.2, P.z);
    }
  }
  makeHeli(P) {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.4, metalness: 0.3 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x1d3f8c, roughness: 0.4, metalness: 0.3 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const glass = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1, metalness: 0.9 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.3, 14, 10).scale(1, 0.95, 1.7), white);
    g.add(body);
    const stripe = new THREE.Mesh(new THREE.SphereGeometry(1.32, 14, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.12).scale(1, 0.95, 1.7), blue);
    g.add(stripe);
    const front = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(Math.PI / 2).scale(1, 0.9, 1), glass);
    front.position.set(0, 0.2, 1.3);
    g.add(front);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 5, 8).rotateX(Math.PI / 2), white);
    boom.position.set(0, 0.35, -3.6);
    g.add(boom);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.7), blue);
    fin.position.set(0, 0.8, -6);
    g.add(fin);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.3, 0.12), dark);
    tail.position.set(0.15, 0.8, -6);
    g.add(tail);
    const rotor = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 5.6), dark);
      b.position.z = 2.6;
      const arm = new THREE.Group();
      arm.rotation.y = (i * Math.PI) / 2;
      arm.add(b);
      rotor.add(arm);
    }
    rotor.position.y = 1.55;
    g.add(rotor);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8), dark);
    mast.position.y = 1.3;
    g.add(mast);
    for (const s of [-1, 1]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 3), dark);
      skid.position.set(s * 0.9, -1.45, 0);
      g.add(skid);
      for (const z of [-0.8, 0.8]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), dark);
        leg.position.set(s * 0.8, -1.2, z);
        g.add(leg);
      }
    }
    body.castShadow = true;
    this.scene.add(g);
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 0.25, 1, 20, 1, true).translate(0, 0.5, 0).rotateX(Math.PI).translate(0, 0.5, 0),
      new THREE.MeshBasicMaterial({ color: 0xfff4d0, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    cone.frustumCulled = false;
    this.scene.add(cone);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(4, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff1c8, map: radialTexture(), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.scene.add(spot);
    this.heli = { g, rotor, tail, cone, spot, x: P.x - 120, y: 70, z: P.z - 60, t: 0 };
  }

  markers() {
    const out = [];
    for (const v of this.cars) if (v.mode !== 'leave') out.push({ x: v.x, z: v.z, kind: 'poli' });
    for (const n of this.world?.npcs.list || []) if (n.type === 'cana' && !n.down && n.state !== 'leave') out.push({ x: n.x, z: n.z, kind: 'cana' });
    if (this.heli) out.push({ x: this.heli.x, z: this.heli.z, kind: 'heli' });
    return out;
  }

  // todos a casa (después de caer preso o morir)
  reset(world) {
    this.heat = 0;
    this.stars = 0;
    this.lostT = 0;
    for (const v of this.cars) this.scene.remove(v.mesh);
    this.cars = [];
    for (const n of world.npcs.list) if (n.type === 'cana') n.dead = true;
  }
}
