// Cosas para levantar del piso: plata, armas, milanesas (salud), chalecos y el celu robado.
// Las fijas reaparecen al rato; las que se caen de alguien desaparecen solas.
import * as THREE from 'three';
import { DATA as D } from './map.js';
import { WEAPONS, pickupWeapon } from './weapons.js';
import { BoxBuilder } from './builder.js';
import { R } from './rng.js';
import { outward } from './city.js';
import { TOUCH } from './input.js';

const COLORS = { money: 0x6fdc6f, weapon: 0xffa726, health: 0xff5a5a, armor: 0x5aa9ff, loot: 0x6ec3ea, coima: 0xffd23a, figu: 0xff4fd8 };
export const FIGUS = 30;

// estrella de la coima (la de la policía de los GTA)
function starGeo() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.12 : 0.28;
    const a = (i / 10) * Math.PI * 2;
    i ? s.lineTo(Math.sin(a) * r, Math.cos(a) * r) : s.moveTo(Math.sin(a) * r, Math.cos(a) * r);
  }
  return new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 }).translate(0, 0, -0.03);
}

// columna de luz que se ve de lejos, como en los GTA
function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 64, 0, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

function itemMesh(kind, data) {
  if (kind === 'weapon') return pickupWeapon(data.id);
  if (kind === 'coima') return new THREE.Mesh(starGeo(), new THREE.MeshStandardMaterial({ color: 0xffc81e, emissive: 0x6a4a00, metalness: 0.7, roughness: 0.3 }));
  if (kind === 'figu') {
    // figurita del álbum: sobre brillante que gira
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.36, 0.02), new THREE.MeshStandardMaterial({ color: 0xff4fd8, emissive: 0x551040, metalness: 0.4, roughness: 0.35 }));
    m.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.022), new THREE.MeshStandardMaterial({ color: 0xf6f0e0, roughness: 0.6 })));
    return m;
  }
  const B = new BoxBuilder();
  if (kind === 'money' || (kind === 'loot' && !data.phone)) {
    for (let i = 0; i < 3; i++) B.box(0.34, 0.05, 0.16, i % 2 ? 0x2e7d32 : 0x43a047, 0, i * 0.05, 0);
    B.box(0.06, 0.16, 0.17, 0xf2e6c8, 0, 0.05, 0);
  } else if (kind === 'loot') {
    B.box(0.18, 0.02, 0.36, 0x151515, 0, 0, 0);
    B.box(0.16, 0.021, 0.3, 0x3a6ea5, 0, 0.002, 0);
  } else if (kind === 'health') {
    // sánguche de milanesa
    B.box(0.42, 0.07, 0.26, 0xd9a55a, 0, 0, 0);
    B.box(0.44, 0.04, 0.28, 0x9c5a24, 0, 0.055, 0);
    B.box(0.43, 0.02, 0.27, 0x7cb342, 0, 0.085, 0);
    B.box(0.42, 0.07, 0.26, 0xe0b066, 0, 0.13, 0);
  } else if (kind === 'armor') {
    B.box(0.5, 0.6, 0.14, 0x283a5a, 0, 0, 0);
    B.box(0.52, 0.12, 0.15, 0x1c2a44, 0, -0.1, 0);
    B.box(0.3, 0.07, 0.16, 0xf2f2f2, 0, 0.14, 0);
  }
  return new THREE.Mesh(B.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 }));
}

export class Pickups {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.list = [];
    this.beamTex = beamTexture();
    this.beamGeo = new THREE.CylinderGeometry(0.35, 0.35, 6, 12, 1, true).translate(0, 3, 0);
    this.ringGeo = new THREE.RingGeometry(0.55, 0.8, 24).rotateX(-Math.PI / 2);
    this.mats = {};
  }

  mat(kind, beam) {
    const key = kind + (beam ? 'b' : 'r');
    if (!this.mats[key]) {
      this.mats[key] = new THREE.MeshBasicMaterial({ color: COLORS[kind], map: beam ? this.beamTex : null, transparent: true, opacity: beam ? 0.55 : 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    }
    return this.mats[key];
  }

  spawn(kind, x, z, data = {}, o = {}) {
    const g = new THREE.Group();
    // las figuritas están escondidas: sin aro ni columna de luz
    if (kind !== 'figu') {
      const ring = new THREE.Mesh(this.ringGeo, this.mat(kind, false));
      ring.position.y = 0.05;
      g.add(ring);
    }
    if (kind !== 'money' && kind !== 'figu') {
      const beam = new THREE.Mesh(this.beamGeo, this.mat(kind, true));
      g.add(beam);
    }
    const item = itemMesh(kind, data);
    item.position.y = 0.8;
    g.add(item);
    const y = o.y ?? 0.15;
    g.position.set(x, y, z);
    this.scene.add(g);
    const p = { kind, data, g, item, x, z, y, t: R.range(0, 6), life: o.life ?? Infinity, respawn: o.respawn ?? 0, taken: false, hideT: 0 };
    this.list.push(p);
    return p;
  }

  money(x, z, amount) {
    if (amount > 0) this.spawn('money', x, z, { amount }, { life: 45 });
  }
  weapon(x, z, id, drop = false) {
    return this.spawn('weapon', x, z, { id }, drop ? { life: 60 } : { respawn: 90 });
  }
  loot(x, z, loot) {
    return this.spawn('loot', x, z, loot, { life: 120 });
  }

  // armas, milanesas y chalecos repartidos por el barrio
  placeWorld(city, heightAt) {
    const door = city.spots.stationDoor;
    const dist = (p) => Math.hypot(p.x - door.x, p.z - door.z);
    const centroid = (ring) => {
      let x = 0;
      let z = 0;
      for (const [a, b] of ring) {
        x += a;
        z += b;
      }
      return { x: x / ring.length, z: z / ring.length };
    };
    const parks = D.parks.filter((p) => p.c === 'park' || p.c === 'garden' || p.c === 'village_green' || p.c === 'grass').map((p) => centroid(p.r[0][0]));
    parks.sort((a, b) => dist(a) - dist(b));
    const at = (p, kind, data, o) => this.spawn(kind, p.x, p.z, data, { y: heightAt(p.x, p.z), respawn: 90, ...o });
    const spots = {};
    // si faltan plazas, un cordón a la distancia pedida
    const curb = (d0, d1, k) => {
      const c = (city.curbSpots || []).filter((c) => c.d > d0 && c.d < d1);
      if (!c.length) return null;
      const p = c[Math.floor(c.length * k)];
      return { x: p.x - Math.cos(p.heading) * 2.4, z: p.z + Math.sin(p.heading) * 2.4 };
    };
    const where = (i, d0, d1, k) => parks[i] ?? curb(d0, d1, k);
    const put = (p, kind, data) => (p ? at(p, kind, data) : null);
    spots.palo = put(where(0, 40, 120, 0.3), 'weapon', { id: 'palo' });
    spots.revolver = put(where(1, 150, 300, 0.5), 'weapon', { id: 'revolver' });
    put(where(2, 100, 250, 0.7), 'health', {});
    spots.pistola = put(curb(260, 420, 0.4), 'weapon', { id: 'pistola' });
    put(curb(200, 380, 0.8), 'armor', {});
    // la tumbera, escondida en la playa de vías
    const yard = D.yard[0]?.[0];
    if (yard) {
      let best = null;
      for (const [x, z] of yard) {
        const d = Math.hypot(x - door.x, z - door.z);
        if (d > 180 && d < 320 && (!best || Math.abs(d - 250) < Math.abs(best.d - 250))) best = { x, z, d };
      }
      if (best) spots.escopeta = at({ x: best.x + (door.x - best.x) * 0.04, z: best.z + (door.z - best.z) * 0.04 }, 'weapon', { id: 'escopeta' });
    }
    // milanesas en la puerta de algunos negocios
    const shops = (city.buildingList || [])
      .filter((b) => b.kind === 'local' && b.b.fr?.length)
      .map((b) => {
        const o = outward(b.ring, b.b.fr[0]);
        return { x: (o.ax + o.bx) / 2 + o.nx * 1.6, z: (o.az + o.bz) / 2 + o.nz * 1.6, nx: o.nx, nz: o.nz, name: b.b.n, cool: 0 };
      })
      .sort((a, b) => dist(a) - dist(b));
    this.shops = shops;
    for (let i = 3; i < shops.length && i < 60; i += 11) at(shops[i], 'health', {});
    put(curb(420, 560, 0.5), 'armor', {});
    // coimas: una estrella menos si la cana te busca
    for (const [d0, d1, k] of [[70, 200, 0.2], [150, 300, 0.65], [250, 400, 0.3], [300, 500, 0.85], [400, 600, 0.5], [500, 800, 0.15], [600, 900, 0.7]]) {
      const p = curb(d0, d1, k);
      if (p) at(p, 'coima', {}, { respawn: 240 });
    }
    // figuritas escondidas: siempre en el mismo lugar (para poder guardar cuáles tenés)
    const cs = city.curbSpots || [];
    for (let i = 0; i < FIGUS; i++) {
      const pk = i % 3 === 0 ? parks[3 + i / 3] : null;
      let p = pk ? { x: pk.x + 3.5, z: pk.z - 2 } : null;
      if (!p && cs.length) {
        const c = cs[Math.floor(((i * 0.6180339) % 1) * cs.length)];
        p = { x: c.x - Math.cos(c.heading) * 2.8, z: c.z + Math.sin(c.heading) * 2.8 };
      }
      if (p) at(p, 'figu', { id: i }, { respawn: 0 });
    }
    this.spots = spots;
  }

  update(dt, world) {
    const { player, hud, audio, combat } = world;
    for (const p of this.list) {
      if (p.taken) {
        if (p.respawn > 0) {
          p.hideT -= dt;
          if (p.hideT <= 0) {
            p.taken = false;
            p.g.visible = true;
          }
        }
        continue;
      }
      p.t += dt;
      p.life -= dt;
      if (p.life <= 0 || (p.kind === 'figu' && player.figus.has(p.data.id))) {
        p.dead = true;
        continue;
      }
      const near = Math.abs(p.x - player.x) < 120 && Math.abs(p.z - player.z) < 120;
      p.g.visible = near;
      if (!near) continue;
      p.item.rotation.y += dt * 2;
      p.item.position.y = 0.8 + Math.sin(p.t * 2.6) * 0.1;
      const d = Math.hypot(player.x - p.x, player.z - p.z);
      const reach = player.vehicle ? (p.kind === 'money' || p.kind === 'loot' ? 2.6 : 0) : 1.3;
      if (d > reach || player.dead) continue;
      // levantar
      let ok = true;
      if (p.kind === 'money') {
        player.addMoney(p.data.amount);
        hud.toast(`+$${p.data.amount.toLocaleString('es-AR')}`, 1.4);
        audio.plata();
      } else if (p.kind === 'loot') {
        player.addMoney(p.data.money);
        audio.plata();
        if (p.data.phone) {
          player.phone = true;
          world.crime.stats.recuperados++;
          hud.flash('¡RECUPERASTE EL CELU!', `Y $${p.data.money.toLocaleString('es-AR')} que tenían encima`, 'ok');
        } else hud.flash(`+$${p.data.money.toLocaleString('es-AR')}`, 'Lo que se les cayó a los motochorros', 'ok');
      } else if (p.kind === 'weapon') {
        combat.give(player, p.data.id);
        const w = WEAPONS[p.data.id];
        hud.flash(w.name.toUpperCase(), TOUCH ? (w.gun ? 'Apunta solo. Tocá el arma arriba para cambiarla' : 'Tocá el arma arriba para cambiarla') : w.gun ? 'Clic para tirar · clic derecho para apuntar · Q cambia de arma' : 'Clic para pegar · Q cambia de arma', 'ok', 2.6);
        audio.recarga?.();
      } else if (p.kind === 'coima') {
        const { police } = world;
        if (!police.stars) ok = false;
        else {
          police.heat = Math.max(0, police.heat - 1);
          police.updateStars();
          if (!police.stars) police.clear();
          hud.flash('COIMA', 'Unos mangos para la cana: una estrella menos', 'ok', 2.2);
          audio.plata();
        }
      } else if (p.kind === 'figu') {
        player.figus.add(p.data.id);
        const n = player.figus.size;
        audio.cumplida?.();
        let sub = `Hay ${FIGUS} escondidas en Temperley. Cada 10, un premio`;
        if (n === 10) {
          player.addMoney(15000);
          player.armor = 100;
          sub = 'Premio: $15.000 y un chaleco';
        } else if (n === 20) {
          combat.give(player, 'escopeta');
          sub = 'Premio: la tumbera con balas';
        } else if (n === FIGUS) {
          player.addMoney(50000);
          player.addRespeto(5);
          sub = '¡Álbum lleno! $50.000 y +5 de respeto';
        }
        hud.flash(`FIGURITA ${n}/${FIGUS}`, sub, 'ok', 2.8);
      } else if (p.kind === 'health') {
        if (player.health >= 100) ok = false;
        else {
          player.health = Math.min(100, player.health + 45);
          hud.toast('¡Qué milanga! +45 de vida', 1.8);
          audio.plata();
        }
      } else if (p.kind === 'armor') {
        if (player.armor >= 100) ok = false;
        else {
          player.armor = 100;
          hud.toast('Chaleco antibalas puesto', 1.8);
          audio.recarga?.();
        }
      }
      if (!ok) continue;
      if (p.respawn > 0) {
        p.taken = true;
        p.hideT = p.respawn;
        p.g.visible = false;
      } else p.dead = true;
    }
    this.list = this.list.filter((p) => {
      if (p.dead) this.scene.remove(p.g);
      return !p.dead;
    });
  }

  markers(player, all = false) {
    const out = [];
    for (const p of this.list) {
      if (p.taken || p.kind === 'money' || p.kind === 'figu') continue;
      if (!all && (Math.abs(p.x - player.x) > 160 || Math.abs(p.z - player.z) > 160)) continue;
      out.push({ x: p.x, z: p.z, kind: p.kind });
    }
    return out;
  }
}
