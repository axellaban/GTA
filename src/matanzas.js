// Matanzas a lo Vice City (los "Rampage"): calaveras en distintos puntos del barrio. Pasás a pie
// por arriba y arranca: te dan un arma con munición de sobra y tenés que bajar a tantos de un
// tipo (zombis o barras de Banfield) antes de que se acabe el tiempo. Si llegás, mucha plata;
// si no, la calavera vuelve al rato. Mientras dura, la cana no pasa de dos estrellas.
import * as THREE from 'three';
import { makeHuman, SKINS, HAIRS } from './human.js';
import { Npc } from './npcs.js';
import { STATION } from './map.js';
import { WEAPONS } from './weapons.js';
import { R } from './rng.js';

export const DEFS = [
  { weapon: 'motosierra', who: 'zombis', n: 15, t: 120, pay: 25000, text: 'Hacé picadillo a 15 zombis con la motosierra' },
  { weapon: 'metra', who: 'barras', n: 20, t: 120, pay: 35000, text: 'Bajá a 20 barras de Banfield con la metra' },
  { weapon: 'escopeta', who: 'barras', n: 15, t: 100, pay: 30000, text: 'Bajá a 15 barras de Banfield con la tumbera' },
  { weapon: 'lanzallamas', who: 'zombis', n: 25, t: 120, pay: 40000, text: 'Prendé fuego a 25 zombis con el lanzallamas' },
  { weapon: 'molotov', who: 'barras', n: 15, t: 120, pay: 45000, text: 'Bajá a 15 barras de Banfield a puro molotov' },
  { weapon: 'bazuca', who: 'barras', n: 30, t: 120, pay: 60000, text: 'Volá a 30 barras de Banfield con la bazuca' },
];
const ALIVE = 7; // objetivos vivos a la vez alrededor de Gaspi
const RETRY = 45; // segundos hasta que vuelve la calavera si fallaste

const boneMat = new THREE.MeshStandardMaterial({ color: 0xf3eee2, roughness: 0.45, emissive: 0x3a2a1a, emissiveIntensity: 0.6 });
const holeMat = new THREE.MeshBasicMaterial({ color: 0x120808 });
const glowMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });

// la calavera que flota y gira (piezas simples, compartidas entre las seis)
const SKULL = {
  head: new THREE.SphereGeometry(0.3, 18, 14).scale(1, 0.95, 1.05),
  jaw: new THREE.BoxGeometry(0.34, 0.14, 0.28),
  eye: new THREE.SphereGeometry(0.075, 10, 8),
  nose: new THREE.ConeGeometry(0.04, 0.08, 3),
  ring: new THREE.RingGeometry(0.9, 1.3, 32).rotateX(-Math.PI / 2),
};
function skullMesh() {
  const g = new THREE.Group();
  const s = new THREE.Group();
  s.add(new THREE.Mesh(SKULL.head, boneMat));
  const jaw = new THREE.Mesh(SKULL.jaw, boneMat);
  jaw.position.set(0, -0.26, 0.06);
  s.add(jaw);
  for (const x of [-0.11, 0.11]) {
    const e = new THREE.Mesh(SKULL.eye, holeMat);
    e.position.set(x, 0.0, 0.25);
    s.add(e);
  }
  const nose = new THREE.Mesh(SKULL.nose, holeMat);
  nose.position.set(0, -0.11, 0.29);
  nose.rotation.x = Math.PI;
  s.add(nose);
  s.position.y = 1.1;
  s.scale.setScalar(1.6);
  s.traverse((o) => (o.castShadow = o.isMesh));
  g.add(s);
  const ring = new THREE.Mesh(SKULL.ring, glowMat);
  ring.position.y = 0.2;
  g.add(ring);
  g.userData.skull = s;
  return g;
}

export class Matanzas {
  constructor(scene, npcs) {
    this.scene = scene;
    this.npcs = npcs;
    this.active = null;
    this.list = [];
    // seis lugares fijos alrededor de la estación, cada vez más lejos (en la vereda)
    DEFS.forEach((def, i) => {
      const a = (i / DEFS.length) * Math.PI * 2 + 0.4;
      const r = 140 + i * 65;
      const e = npcs.nearestEdge(STATION.x + Math.cos(a) * r, STATION.z + Math.sin(a) * r);
      const t = Math.max(4, Math.min(e.len - 4, e.len / 2));
      const off = e.street.w / 2 + 1.4;
      const x = e.from.x + e.dx * t + e.rx * off;
      const z = e.from.z + e.dz * t + e.rz * off;
      const mesh = skullMesh();
      mesh.position.set(x, 0, z);
      scene.add(mesh);
      this.list.push({ id: i, def, x, z, mesh, wait: 0 });
    });
  }

  // calaveras para el mapa y el minimapa
  markers(player) {
    if (this.active) return [];
    return this.list.filter((m) => !player.matanzas?.has(m.id) && m.wait <= 0);
  }

  objective() {
    const a = this.active;
    if (!a) return null;
    const s = Math.max(0, Math.ceil(a.t));
    return { text: `MATANZA: ${a.count}/${a.def.n} ${a.def.who === 'zombis' ? 'zombis' : 'barras'} · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, target: null };
  }

  start(world, m) {
    const { player: P, combat, hud, audio } = world;
    const def = m.def;
    this.active = { m, def, t: def.t, count: 0, spawnT: 0, targets: [] };
    m.mesh.visible = false;
    // el arma de la matanza, con munición de sobra
    combat.give(P, def.weapon);
    const w = WEAPONS[def.weapon];
    if (w.gun) P.ammo[def.weapon] = { mag: w.mag, res: w.mag * 40 };
    if (w.throw) P.ammo[def.weapon] = { mag: 40, res: 0 };
    P.weapon = def.weapon;
    combat.syncHand(P);
    hud.flash('¡MATANZA!', `${def.text} en ${def.t} segundos`, 'bad', 3.6);
    audio.metal?.(0.6);
    // los primeros, ya cerca
    for (let i = 0; i < 4; i++) this.spawn(world);
  }

  spawn(world) {
    const P = world.player;
    const a = this.active;
    const p = this.npcs.sidewalkPoint(P.x, P.z, 20, 50);
    if (!p) return;
    let n;
    if (a.def.who === 'zombis') {
      n = this.npcs.spawnZombie(P, 20, 50);
      if (!n) return;
      n.vmax = R.range(1.1, 1.6);
    } else {
      // barra de Banfield: camiseta verde y blanca, gorrito, ganas de pelear
      const h = makeHuman({ skin: R.pick(SKINS), hair: R.pick(HAIRS), hairStyle: R.pick(['buzz', 'short', 'curly']), jersey: 'banfield', pants: R.pick([0x1a1a1a, 0x2c3e5c, 0x3a3a40]), shoes: 0xf2f2f2, cap: R.chance(0.4) ? 0x0a7a3b : null, stubble: R.chance(0.7), scale: R.range(0.98, 1.07) });
      n = this.npcs.add(new Npc('vecino', h, p.x, p.z));
      n.barra = true;
      n.hp = 70;
      n.brave = 1;
      n.vmax = 1.4;
      n.chaseV = R.range(4.2, 5);
      n.money = R.int(1, 4) * 500;
      n.heading = Math.atan2(P.x - p.x, P.z - p.z);
      this.npcs.setState(n, 'fight');
      if (R.chance(0.5)) n.say(R.pick(['¡Vení, gaspi, vení!', '¡Dale que te cagamos a palos!', '¡El Taladro, papá!', '¡Ahí está, ahí está!']), 2.5);
    }
    n.mission = true;
    n.rampage = true;
    a.targets.push(n);
  }

  // lo llama Npcs.hurt cuando Gaspi mata a alguien
  onKill(n) {
    const a = this.active;
    if (!a) return;
    if (a.def.who === 'zombis' ? n.type !== 'zombie' : !n.barra) return;
    a.count++;
  }

  end(world, ok) {
    const { player: P, hud, audio } = world;
    const a = this.active;
    this.active = null;
    for (const n of a.targets) {
      n.mission = false;
      n.rampage = false;
    }
    if (ok) {
      P.matanzas ??= new Set();
      P.matanzas.add(a.m.id);
      P.addMoney(a.def.pay);
      audio.plata();
      hud.flash('¡MATANZA COMPLETA!', `+$${a.def.pay.toLocaleString('es-AR')} · Matanzas ${P.matanzas.size}/${DEFS.length}`, 'ok', 4);
      world.save?.();
    } else {
      a.m.wait = RETRY;
      a.m.mesh.visible = true;
      hud.flash('MATANZA FALLIDA', `Bajaste ${a.count} de ${a.def.n}. La calavera vuelve en un rato`, 'bad', 3.4);
    }
  }

  update(dt, world) {
    const P = world.player;
    const a = this.active;
    for (const m of this.list) {
      const done = P.matanzas?.has(m.id);
      if (m.wait > 0) m.wait -= dt;
      const show = !done && !a && m.wait <= 0 && Math.abs(m.x - P.x) < 200 && Math.abs(m.z - P.z) < 200;
      m.mesh.visible = show;
      if (!show) continue;
      m.mesh.userData.skull.rotation.y += dt * 1.8;
      m.mesh.userData.skull.position.y = 1.3 + Math.sin(performance.now() / 400 + m.id) * 0.12;
      // se agarra a pie, sin otra changa ni misión en curso
      if (!P.vehicle && !P.dead && !world.missions?.m && !world.races?.race && Math.hypot(m.x - P.x, m.z - P.z) < 1.3) this.start(world, m);
    }
    if (!a) return;
    a.t -= dt;
    if (P.dead || P.busted) return this.end(world, false);
    if (a.count >= a.def.n) return this.end(world, true);
    if (a.t <= 0) return this.end(world, false);
    // siempre hay gente para bajar cerca; los que quedaron lejos se van
    a.targets = a.targets.filter((n) => !n.dead && !n.killed);
    for (const n of a.targets) {
      const d = Math.hypot(n.x - P.x, n.z - P.z);
      if (d > 90) {
        n.dead = true;
        continue;
      }
      // vienen a buscarte (los zombis, de más lejos que de costumbre)
      if (d < 45 && (n.state === 'walk' || n.state === 'flee') && !n.down) this.npcs.setState(n, 'fight');
    }
    a.spawnT -= dt;
    if (a.spawnT <= 0 && a.targets.filter((n) => !n.dead).length < ALIVE) {
      a.spawnT = 0.7;
      this.spawn(world);
    }
  }
}
