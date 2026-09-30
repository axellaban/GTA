// Motochorros: aparecen, te apuntan el celu y se rajan. Se los puede voltear con el auto.
import * as THREE from 'three';
import { makeMoto } from './vehicles.js';
import { makeHuman, animateHuman } from './human.js';
import { Vehicle } from './traffic.js';
import { cornerName } from './map.js';
import { R } from './rng.js';

export class Crime {
  constructor(scene, traffic, colliders, audio) {
    this.scene = scene;
    this.traffic = traffic;
    this.colliders = colliders;
    this.audio = audio;
    this.motos = [];
    this.pickups = [];
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
    const riders = [
      makeHuman({ shirt: 0x222222, pants: 0x1a1a3a, helmet: R.pick([0x111111, 0xc62828, 0xf5f5f5]) }),
      makeHuman({ shirt: R.pick([0x1565c0, 0x333333, 0xc62828]), pants: 0x2a2a2a, hood: 0x2a2a2a }),
    ];
    riders[0].root.position.set(0, 0.35, 0.1);
    riders[1].root.position.set(0, 0.45, -0.45);
    for (const r of riders) mesh.add(r.root);
    const m = { v, riders, state: 'hunt', t: 0, node: n, target: null, loot: null, bubble: null, life: 0 };
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
        if (player.vehicle || player.dead || m.life > 70) {
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
      } else if (m.state === 'down') {
        vmax = 0;
        m.downT -= dt;
        if (m.downT < 0 && !m.ranOff) {
          m.ranOff = true;
          for (const r of m.riders) r.root.visible = false;
          this.say(m, '¡Corré, corré!', 2);
        }
        if (m.downT < -12 && dp > 60) {
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
      if (m.state === 'down') v.mesh.rotation.z = 1.35;
      for (const r of m.riders) animateHuman(r, dt, 0, m.state === 'down' ? 'knocked' : m.state === 'rob' ? 'fist' : 'ride');
      if (m.state === 'down') for (const r of m.riders) r.root.position.y = -0.2;
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
    this.updatePickups(dt, world);
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
    const { hud, player, audio } = world;
    m.state = 'down';
    m.downT = 4;
    m.v.speed = 0;
    audio.golpe(0.9);
    const loot = m.loot ?? { phone: false, money: 0 };
    loot.money += R.int(4, 12) * 1000;
    this.dropPickup(m.v.x - m.v.fz * 1.8, m.v.z + m.v.fx * 1.8, loot);
    m.loot = null;
    this.say(m, '¡Aaah! ¡La moto!', 2.5);
    if (!pushed) {
      hud.flash('¡MOTOCHORROS AL PISO!', 'Agarrá lo que se les cayó', 'ok');
      player.addRespeto(2);
    }
  }

  dropPickup(x, z, loot) {
    const g = new THREE.Group();
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.05, 16), new THREE.MeshBasicMaterial({ color: 0x6ec3ea, transparent: true, opacity: 0.55 }));
    glow.position.y = 0.2;
    g.add(glow);
    const item = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.55), new THREE.MeshBasicMaterial({ color: loot.phone ? 0x222222 : 0x2e7d32 }));
    item.position.y = 0.7;
    g.add(item);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.pickups.push({ g, item, x, z, loot, t: 0 });
  }

  updatePickups(dt, world) {
    const { player, hud, audio } = world;
    for (const p of this.pickups) {
      p.t += dt;
      p.item.rotation.y += dt * 2.5;
      p.item.position.y = 0.7 + Math.sin(p.t * 3) * 0.12;
      if (!player.vehicle && Math.hypot(player.x - p.x, player.z - p.z) < 2.3) {
        p.taken = true;
        this.scene.remove(p.g);
        player.addMoney(p.loot.money);
        audio.plata();
        if (p.loot.phone) {
          player.phone = true;
          this.stats.recuperados++;
          hud.flash('¡RECUPERASTE EL CELU!', `Y $${p.loot.money.toLocaleString('es-AR')} que tenían encima`, 'ok');
        } else hud.flash(`+$${p.loot.money.toLocaleString('es-AR')}`, 'Lo que se les cayó a los motochorros', 'ok');
      }
      if (p.t > 120) {
        p.taken = true;
        this.scene.remove(p.g);
      }
    }
    this.pickups = this.pickups.filter((p) => !p.taken);
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
    for (const p of this.pickups) out.push({ x: p.x, z: p.z, kind: 'pickup' });
    return out;
  }
}
