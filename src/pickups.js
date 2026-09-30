// Cosas para levantar del piso: plata, armas, milanesas (salud), chalecos y el celu robado.
// Las fijas reaparecen al rato; las que se caen de alguien desaparecen solas.
import * as THREE from 'three';
import { DATA as D } from './map.js';
import { WEAPONS, pickupWeapon } from './weapons.js';
import { BoxBuilder } from './builder.js';
import { R } from './rng.js';
import { outward } from './city.js';

const COLORS = { money: 0x6fdc6f, weapon: 0xffa726, health: 0xff5a5a, armor: 0x5aa9ff, loot: 0x6ec3ea };

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
    const ring = new THREE.Mesh(this.ringGeo, this.mat(kind, false));
    ring.position.y = 0.05;
    g.add(ring);
    if (kind !== 'money') {
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
      if (p.life <= 0) {
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
        hud.flash(w.name.toUpperCase(), w.gun ? 'Clic para tirar · clic derecho para apuntar · Q cambia de arma' : 'Clic para pegar · Q cambia de arma', 'ok', 2.6);
        audio.recarga?.();
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

  markers(player) {
    const out = [];
    for (const p of this.list) {
      if (p.taken || p.kind === 'money') continue;
      if (Math.abs(p.x - player.x) > 160 || Math.abs(p.z - player.z) > 160) continue;
      out.push({ x: p.x, z: p.z, kind: p.kind });
    }
    return out;
  }
}
