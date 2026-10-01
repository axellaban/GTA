// Motochorros: aparecen, te apuntan el celu y se rajan. Se los puede voltear con el auto.
import * as THREE from 'three';
import { makeMoto } from './vehicles.js';
import { makeHuman, animateHuman } from './human.js';
import { makePerson, PEOPLE } from './people.js';
import { Vehicle } from './traffic.js';
import { cornerName } from './map.js';
import { R } from './rng.js';
import { TOUCH } from './input.js';

// Casco de moto: calota brillante con visera oscura, colgado del hueso de la cabeza
const HELMET_GEO = (() => {
  const shell = new THREE.SphereGeometry(0.155, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62);
  shell.scale(1, 1.05, 1.12);
  return shell;
})();
const VISOR_GEO = new THREE.SphereGeometry(0.158, 12, 6, -Math.PI * 0.36, Math.PI * 0.72, Math.PI * 0.32, Math.PI * 0.2).scale(1, 1.05, 1.12);
const VISOR_MAT = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.08, metalness: 0.6 });
// el esqueleto fantasma mide siempre lo mismo y los modelos no: se calza a la altura real de la cabeza
const _hb = new THREE.Box3();
const _hv = new THREE.Vector3();
function wearHelmet(h, color) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(HELMET_GEO, new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.1 }));
  const v = new THREE.Mesh(VISOR_GEO, VISOR_MAT);
  m.castShadow = true;
  g.add(m, v);
  h.root.updateMatrixWorld(true);
  const top = _hb.setFromObject(h.rig.model).max.y - h.root.position.y;
  const headY = h.bones.head.getWorldPosition(_hv).y - h.root.position.y;
  g.position.set(0, top - 0.14 - headY, 0.01);
  h.bones.head.add(g);
}

export class Crime {
  constructor(scene, traffic, colliders, audio) {
    this.scene = scene;
    this.traffic = traffic;
    this.colliders = colliders;
    this.audio = audio;
    this.motos = [];
    this.timer = 38;
    this.stats = { robos: 0, recuperados: 0 };
  }

  nearestMoto(x, z, r) {
    let best = null;
    let bd = r;
    for (const m of this.motos) {
      if (m.state === 'down' || m.state === 'gone') continue;
      const d = Math.hypot(m.v.x - x, m.v.z - z);
      if (d < bd) {
        bd = d;
        best = m.v;
      }
    }
    return best;
  }

  nearestNode(x, z) {
    let best = null;
    let bd = Infinity;
    for (const n of this.traffic.graph.nodes) {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  spawn(player) {
    // arranca en una esquina a 70-120 m de Gaspi
    const nodes = this.traffic.graph.nodes.filter((n) => {
      const d = Math.hypot(n.x - player.x, n.z - player.z);
      return d > 70 && d < 130;
    });
    if (!nodes.length) return;
    const n = R.pick(nodes);
    const mesh = makeMoto(R.pick([0x1c1c1c, 0xb71c1c, 0x0d47a1, 0x333333]));
    const v = new Vehicle(mesh, n.x, n.z, 0);
    this.scene.add(mesh);
    const looks = [
      { shirt: 0x222222, pants: 0x1a1a3a, helmet: R.pick([0x111111, 0xc62828, 0xf5f5f5]), longSleeves: true },
      { shirt: R.pick([0x1565c0, 0x333333, 0xc62828]), pants: 0x2a2a2a, hood: 0x2a2a2a, longSleeves: true },
    ];
    // con los personajes de artista (CC0) si ya cargaron: el que maneja con casco, el de atrás a veces
    const riders = looks.map((l, i) => {
      const h = PEOPLE.ready && makePerson('male');
      if (!h) return makeHuman(l);
      if (i === 0 || R.chance(0.35)) wearHelmet(h, i === 0 ? l.helmet : R.pick([0x111111, 0x1565c0, 0xf5f5f5]));
      return h;
    });
    riders[0].root.position.set(0, 0.36, -0.08);
    riders[1].root.position.set(0, 0.46, -0.55);
    for (const r of riders) mesh.add(r.root);
    const m = { v, riders, looks, state: 'hunt', t: 0, node: n, target: null, loot: null, bubble: null, life: 0 };
    this.motos.push(m);
    return m;
  }

  say(m, text, dur = 3) {
    m.bubble = { text, t: dur };
  }

  update(dt, world) {
    const { player, hud, events } = world;
    this.timer -= dt;
    const active = this.motos.filter((m) => m.state !== 'gone').length;
    if (this.timer <= 0 && active === 0 && !player.vehicle && !player.dead) {
      this.spawn(player);
      this.timer = R.range(55, 95);
    }
    for (const m of this.motos) {
      if (m.state === 'down') continue;
      m.t += dt;
      m.life += dt;
      if (m.bubble) {
        m.bubble.t -= dt;
        if (m.bubble.t <= 0) m.bubble = null;
      }
      const v = m.v;
      const dp = Math.hypot(player.x - v.x, player.z - v.z);
      let target = null;
      let vmax = 0;
      if (m.state === 'hunt') {
        if (player.vehicle || player.riding || player.dead || m.life > 70) {
          m.state = 'flee';
          m.t = 0;
        } else if (dp < 28) {
          target = { x: player.x, z: player.z };
          vmax = dp < 8 ? 4 : 9;
          if (dp < 2.6) this.startRobbery(m, world);
        } else {
          target = this.route(m, player.x, player.z, true);
          vmax = 12.5;
        }
      } else if (m.state === 'rob') {
        vmax = 0;
      } else if (m.state === 'chase') {
        target = { x: player.x, z: player.z };
        vmax = 5.6;
        if (dp < 2.2) {
          m.state = 'rob';
          this.resolve(m, world, 'golpe');
        } else if (m.t > 5.5) {
          if (dp > 9) {
            this.say(m, '¡Uh, se nos rajó!', 2.5);
            hud.flash('ZAFASTE', 'Los motochorros te perdieron de vista', 'ok');
            player.addRespeto(1);
            m.state = 'flee';
            m.t = 0;
          } else this.resolve(m, world, 'golpe');
        }
      } else if (m.state === 'flee') {
        target = this.route(m, player.x, player.z, false);
        vmax = 13;
        if (m.life > 90 || (dp > 230 && m.t > 8)) {
          if (m.loot) hud.flash('SE ESCAPARON', `Los motochorros se perdieron por ${cornerName(v.x, v.z)}`, 'bad');
          this.remove(m);
          continue;
        }
      }
      // un corte o marcha también los frena
      let blocked = null;
      if (target) blocked = events.blockAhead(v.x, v.z, v.fx, v.fz, 6);
      if (blocked !== null) vmax = Math.min(vmax, 1);
      // conducción
      if (target && vmax > 0) {
        const want = Math.atan2(target.x - v.x, target.z - v.z);
        let diff = want - v.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        v.heading += Math.max(-3 * dt, Math.min(3 * dt, diff));
        if (Math.abs(diff) > 1.2) vmax = Math.min(vmax, 4);
      }
      v.speed += Math.sign(vmax - v.speed) * Math.min(Math.abs(vmax - v.speed), (vmax > v.speed ? 5 : 12) * dt);
      v.x += v.fx * v.speed * dt;
      v.z += v.fz * v.speed * dt;
      const p = { x: v.x, z: v.z };
      this.colliders.resolveCircle(p, 0.5);
      v.x = p.x;
      v.z = p.z;
      v.sync(dt);
      for (const r of m.riders) animateHuman(r, dt, 0, m.state === 'rob' ? 'fist' : 'ride');
      // el auto de Gaspi los voltea
      const pv = player.vehicle;
      if (pv && m.state !== 'down' && Math.abs(pv.speed) > 3.5) {
        // la moto ocupa ~1,9 m: se chequean dos círculos a lo largo
        let hit = false;
        for (const c of pv.circles()) {
          for (const k of [-0.55, 0.55]) {
            if (Math.hypot(c.x - (v.x + v.fx * k), c.z - (v.z + v.fz * k)) < c.r + 0.55) hit = true;
          }
        }
        if (hit) {
          this.knockDown(m, world);
          pv.speed *= 0.6;
        }
      }
    }
    const pv = player.vehicle;
    void pv;
  }

  // navegación codiciosa por el grafo de calles: hacia (o lejos de) un punto
  route(m, px, pz, toward) {
    const v = m.v;
    if (!m.target || Math.hypot(m.target.x - v.x, m.target.z - v.z) < 4) {
      const here = m.target?.node ?? this.nearestNode(v.x, v.z);
      if (!m.target) {
        m.target = { x: here.x, z: here.z, node: here };
        return m.target;
      }
      let best = null;
      let bs = -Infinity;
      for (const e of here.out) {
        const d = Math.hypot(e.to.x - px, e.to.z - pz);
        const score = (toward ? -d : d) + R.range(0, 25) - (m.prev === e.to ? 60 : 0);
        if (score > bs) {
          bs = score;
          best = e;
        }
      }
      m.prev = here;
      m.target = { x: best.to.x + best.rx * 1.5, z: best.to.z + best.rz * 1.5, node: best.to };
    }
    return m.target;
  }

  startRobbery(m, world) {
    const { player, hud, audio } = world;
    m.state = 'rob';
    m.t = 0;
    this.say(m, '¡Dame el celu, dame el celu! ¡Rápido!', 4.5);
    audio.alerta();
    hud.ask(
      'Dos en una moto te apuran. ¿Qué hacés?',
      [
        { label: 'Darles el celu', run: () => this.resolve(m, world, 'entregar') },
        { label: 'Resistirse', run: () => this.resolve(m, world, 'resistir') },
        { label: 'Salir corriendo', run: () => this.resolve(m, world, 'correr') },
      ],
      4.5,
      0,
    );
    void player;
  }

  resolve(m, world, how) {
    const { player, hud } = world;
    if (how === 'correr') {
      m.state = 'chase';
      m.t = 0;
      this.say(m, '¡Vení para acá!', 2);
      return;
    }
    if (how === 'resistir' && R.chance(0.45)) {
      hud.flash('¡LOS VOLTEASTE!', 'Un empujón y la moto al piso', 'ok');
      this.knockDown(m, world, true);
      player.addRespeto(3);
      return;
    }
    const took = { phone: player.phone, money: 0 };
    if (how === 'resistir' || how === 'golpe') {
      player.hurt(how === 'golpe' ? 20 : 35, 'Te bajaron de una piña');
    }
    took.money = Math.min(player.money, Math.max(2000, Math.round(player.money * 0.3)));
    player.addMoney(-took.money);
    player.phone = false;
    m.loot = took;
    m.state = 'flee';
    m.t = 0;
    this.stats.robos++;
    this.say(m, '¡Gracias, rey!', 2);
    hud.flash(took.phone ? 'TE ROBARON EL CELU' : 'TE ROBARON', `Se llevaron ${took.phone ? 'el celu y ' : ''}$${took.money.toLocaleString('es-AR')}. Perseguilos con un auto.`, 'bad');
  }

  knockDown(m, world, pushed = false) {
    const { hud, player, audio, npcs, traffic, pickups } = world;
    if (m.state === 'down') return;
    m.state = 'down';
    m.v.speed = 0;
    audio.golpe(0.9);
    const loot = m.loot ?? { phone: false, money: 0 };
    loot.money += R.int(4, 12) * 1000;
    pickups.loot(m.v.x - m.v.fz * 1.8, m.v.z + m.v.fx * 1.8, loot);
    m.loot = null;
    // los dos salen volando y después se rajan corriendo
    m.riders.forEach((r, i) => {
      m.v.mesh.remove(r.root);
      const s = i ? 1 : -1;
      // el mismo personaje (con su casco) se levanta y sale corriendo
      r.root.position.set(0, 0, 0);
      r.root.rotation.set(0, 0, 0);
      const n = npcs.spawnWalker({ x: m.v.x + m.v.fz * s * 1.3, z: m.v.z - m.v.fx * s * 1.3, heading: m.v.heading }, null, 0, 0, m.looks[i], r);
      if (!n) return;
      n.money = 0;
      n.brave = 0;
      npcs.hurt(n, 10, m.v.fz * s, -m.v.fx * s, { knock: true, knockT: 2.5, world });
      n.after = 'flee';
      if (i === 0) n.say(R.pick(['¡Aaah! ¡La moto!', '¡Corré, corré!']), 2.5);
    });
    m.riders = [];
    // la moto queda tirada: Gaspi se la puede llevar
    m.v.fallen = true;
    m.v.parked = true;
    m.v.sync(0);
    traffic.parked.push(m.v);
    this.motos = this.motos.filter((o) => o !== m);
    if (!pushed) {
      hud.flash('¡MOTOCHORROS AL PISO!', TOUCH ? 'Agarrá lo que se les cayó. La moto es tuya.' : 'Agarrá lo que se les cayó. La moto es tuya (F).', 'ok');
      player.addRespeto(2);
    }
  }

  // Gaspi aprieta E al lado de una moto frenada
  tryShove(world) {
    const { player } = world;
    for (const m of this.motos) {
      if (m.state === 'down' || m.state === 'gone') continue;
      if (Math.hypot(player.x - m.v.x, player.z - m.v.z) < 2.2 && m.v.speed < 2.5) {
        this.knockDown(m, world, false);
        return true;
      }
    }
    return false;
  }

  remove(m) {
    m.state = 'gone';
    this.scene.remove(m.v.mesh);
    this.motos = this.motos.filter((o) => o !== m);
  }

  markers() {
    const out = [];
    for (const m of this.motos) if (m.loot) out.push({ x: m.v.x, z: m.v.z, kind: 'moto' });
    return out;
  }
}
