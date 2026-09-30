// Cortes de calle, marchas y el zócalo de noticias.
import * as THREE from 'three';
import { makeHuman, animateHuman, randomCivilian } from './human.js';
import { bannerTexture } from './textures.js';
import { STREETS } from './map.js';
import { R, Rng } from './rng.js';

const RECLAMOS = [
  { quien: 'Vecinos', por: 'hace tres días que no tienen luz', banner: 'QUEREMOS LUZ YA' },
  { quien: 'Organizaciones sociales', por: 'reclaman trabajo y alimentos', banner: 'PAN Y TRABAJO' },
  { quien: 'Vecinos', por: 'piden más seguridad tras una ola de robos', banner: 'BASTA DE INSEGURIDAD' },
  { quien: 'Vecinos', por: 'no tienen agua desde el lunes', banner: 'AGUA POTABLE YA' },
  { quien: 'Usuarios del Roca', por: 'se quejan de las demoras del ramal Haedo', banner: 'NO AL CIERRE DEL RAMAL' },
  { quien: 'Trabajadores de una fábrica', por: 'denuncian despidos', banner: 'NO A LOS DESPIDOS' },
  { quien: 'Jubilados', por: 'reclaman por sus haberes', banner: 'JUBILACIÓN DIGNA' },
  { quien: 'Vecinos', por: 'exigen que tapen los baches', banner: 'ARREGLEN LAS CALLES' },
];

const TICKER_BASE = [
  'Roca: servicio normal a Glew, Ezeiza y Bosques',
  'Ramal Haedo: el diésel sale cada 40 minutos',
  'Temperley: se esperan tormentas fuertes para la noche',
  'Liga: el Celeste juega el domingo en el Beranger',
  'Precios: el pancho de la estación ya cuesta $1.500',
  'Consejo: no uses el celu en la esquina de la estación',
];

function streetNameAtNode(node, street) {
  // nombre de la calle perpendicular que pasa por el nodo
  for (const s of STREETS) {
    if (s.axis === street.axis) continue;
    if (Math.abs(s.c - (street.axis === 'ns' ? node.z : node.x)) < 0.5) return s.name;
  }
  return null;
}

export class Events {
  constructor(scene, traffic, audio) {
    this.scene = scene;
    this.traffic = traffic;
    this.audio = audio;
    this.list = [];
    this.news = [...TICKER_BASE];
    this.nextCorte = 16;
    this.nextMarcha = 150;
    this.beat = 0;
    this.beatN = 0;
    this.smokeGeo = new THREE.PlaneGeometry(1.6, 1.6);
    this.fireMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.9 });
    this.fireMat2 = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85 });
    this.tireGeo = new THREE.TorusGeometry(0.42, 0.18, 6, 12).rotateX(Math.PI / 2);
    this.tireMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
    this.rng = new Rng(Date.now() % 100000);
  }

  pushNews(text) {
    this.news.unshift(text);
    if (this.news.length > 9) this.news.pop();
    this.onNews?.(text);
  }

  // ---------- Cortes ----------
  spawnCorte(player, forced) {
    const edges = this.traffic.graph.edges.filter((e) => {
      if (e.len < 60) return false;
      if (e.dx < 0 || e.dz < 0) return false; // una sola dirección por tramo
      const mx = (e.from.x + e.to.x) / 2;
      const mz = (e.from.z + e.to.z) / 2;
      const d = Math.hypot(mx - player.x, mz - player.z);
      if (this.list.some((o) => Math.hypot(o.x - mx, o.z - mz) < 120)) return false;
      return forced ? d > 45 && d < 220 : d > 70 && d < 380;
    });
    if (!edges.length) return null;
    const avenues = edges.filter((e) => e.street.avenue);
    const e = avenues.length && R.chance(0.7) ? R.pick(avenues) : R.pick(edges);
    const s = e.street;
    const mid = (s.axis === 'ns' ? (e.from.z + e.to.z) / 2 : (e.from.x + e.to.x) / 2) + R.range(-15, 15);
    const x = s.axis === 'ns' ? s.c : mid;
    const z = s.axis === 'ns' ? mid : s.c;
    const reclamo = R.pick(RECLAMOS);
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    if (s.axis === 'ew') g.rotation.y = Math.PI / 2; // el eje local z corre a lo largo de la calle
    this.scene.add(g);
    const ev = { type: 'corte', street: s, x, z, along: mid, half: 7, g, people: [], fires: [], smoke: [], t: 0, dur: R.range(150, 260), reclamo, from: e.from, to: e.to };
    // gomas quemándose en el medio
    for (const lx of [-s.w / 4, s.w / 4]) {
      const pile = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const t = new THREE.Mesh(this.tireGeo, this.tireMat);
        t.position.set(R.range(-0.3, 0.3), 0.18 + i * 0.3, R.range(-0.3, 0.3));
        t.rotation.z = R.range(-0.2, 0.2);
        pile.add(t);
      }
      const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.8, 7), this.fireMat);
      f1.position.y = 1.6;
      const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 6), this.fireMat2);
      f2.position.y = 1.4;
      pile.add(f1, f2);
      pile.position.set(lx, 0, 0);
      g.add(pile);
      ev.fires.push(f1, f2);
      for (let i = 0; i < 6; i++) {
        const sm = new THREE.Mesh(this.smokeGeo, new THREE.MeshBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.5, depthWrite: false }));
        sm.userData = { base: [lx, 0], t: R.range(0, 4) };
        g.add(sm);
        ev.smoke.push(sm);
      }
    }
    // gente cortando, mirando para ambos lados
    const n = R.int(12, 18);
    const rng = this.rng;
    for (let i = 0; i < n; i++) {
      const h = makeHuman({ ...randomCivilian(), cap: R.chance(0.3) ? R.pick([0x1a237e, 0xc62828, 0x2e7d32]) : null });
      const side = i % 2 ? 1 : -1;
      const lx = R.range(-s.w / 2 + 0.6, s.w / 2 - 0.6);
      const lz = side * R.range(2.2, 5.5);
      h.root.position.set(lx, 0, lz);
      h.root.rotation.y = side > 0 ? 0 : Math.PI;
      const role = i < 2 ? 'drum' : i < 6 ? 'banner' : R.pick(['fist', 'walk', 'fist']);
      if (role === 'drum') {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.45, 12).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf5f5f5 }));
        drum.position.set(0, 1.0, 0.3);
        h.root.add(drum);
      }
      g.add(h.root);
      ev.people.push({ h, role, lx, lz });
    }
    // pasacalles en cada frente
    for (const side of [-1, 1]) {
      const tex = bannerTexture(reclamo.banner, rng);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(s.w * 0.85, 1.3), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
      b.position.set(0, 2.2, side * 6.4);
      if (side < 0) b.rotation.y = Math.PI;
      g.add(b);
      for (const px of [-s.w * 0.43, s.w * 0.43]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3), new THREE.MeshLambertMaterial({ color: 0x6b4a2b }));
        pole.position.set(px, 1.5, side * 6.4);
        g.add(pole);
      }
    }
    // banderas
    for (let i = 0; i < 3; i++) {
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshLambertMaterial({ color: R.pick([0x6ec3ea, 0xc62828, 0x2e7d32, 0xf9a825, 0x1a237e]), side: THREE.DoubleSide }));
      flag.position.set(R.range(-s.w / 2, s.w / 2), 3.2, R.range(-3, 3));
      g.add(flag);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.4), new THREE.MeshLambertMaterial({ color: 0x777777 }));
      pole.position.set(flag.position.x - 0.6, 1.7, flag.position.z);
      g.add(pole);
      ev.fires.push(flag);
      flag.userData.flag = true;
    }
    const a = streetNameAtNode(e.from, s);
    const b = streetNameAtNode(e.to, s);
    ev.label = a && b ? `${s.name} entre ${a} y ${b}` : s.name;
    this.list.push(ev);
    this.pushNews(`ÚLTIMO MOMENTO · Corte total en ${ev.label}: ${reclamo.quien.toLowerCase()} ${reclamo.por}`);
    return ev;
  }

  // ---------- Marchas ----------
  spawnMarcha(player) {
    const avenues = STREETS.filter((s) => s.avenue);
    const s = R.pick(avenues);
    const toward = player.z; // van hacia la zona del jugador/estación
    const startAlong = toward > 0 ? -400 : 400;
    const endAlong = Math.max(-380, Math.min(380, toward > 0 ? toward - 40 : toward + 40));
    const dir = Math.sign(endAlong - startAlong);
    const reclamo = R.pick(RECLAMOS);
    const g = new THREE.Group();
    this.scene.add(g);
    const ev = { type: 'marcha', street: s, along: startAlong, end: endAlong, dir, half: 0, g, people: [], fires: [], smoke: [], t: 0, dur: 9999, reclamo, len: 30 };
    const rows = 9;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 5; c++) {
        const h = makeHuman({ ...randomCivilian(), cap: R.chance(0.3) ? R.pick([0x1a237e, 0xc62828]) : null });
        const lx = (c - 2) * (s.w / 5.5) + R.range(-0.3, 0.3);
        const lz = -r * 3.2 + R.range(-0.5, 0.5);
        const role = r === 0 && (c === 0 || c === 4) ? 'banner' : r === 3 && c % 2 === 0 ? 'drum' : R.pick(['walk', 'fist', 'walk']);
        if (role === 'drum') {
          const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.45, 12).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf5f5f5 }));
          drum.position.set(0, 1.0, 0.3);
          h.root.add(drum);
        }
        h.root.position.set(lx, 0, lz);
        g.add(h.root);
        ev.people.push({ h, role, lx, lz });
      }
    }
    const tex = bannerTexture(reclamo.banner, this.rng);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(s.w * 0.8, 1.4), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    banner.position.set(0, 2.3, 0.6);
    g.add(banner);
    const st = streetNameAtNode({ x: s.c, z: endAlong }, s) ?? 'la estación';
    ev.label = s.name;
    this.list.push(ev);
    this.pushNews(`EN VIVO · Marcha por ${s.name} rumbo a ${st}: ${reclamo.quien.toLowerCase()} ${reclamo.por}`);
    this.placeMarcha(ev);
    return ev;
  }

  placeMarcha(ev) {
    const s = ev.street;
    const x = s.axis === 'ns' ? s.c : ev.along;
    const z = s.axis === 'ns' ? ev.along : s.c;
    ev.x = x;
    ev.z = z;
    ev.g.position.set(x, 0.02, z);
    // el eje local +z apunta al sentido de marcha
    ev.g.rotation.y = s.axis === 'ns' ? (ev.dir > 0 ? 0 : Math.PI) : ev.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  // Zona bloqueada de un evento, en coordenada "a lo largo" de su calle
  span(ev) {
    if (ev.type === 'corte') return [ev.along - 7, ev.along + 7];
    const head = ev.along + ev.dir * 2;
    const tail = ev.along - ev.dir * ev.len;
    return [Math.min(head, tail), Math.max(head, tail)];
  }

  blockAhead(x, z, fx, fz, look) {
    let best = null;
    for (const ev of this.list) {
      if (ev.leaving) continue;
      const s = ev.street;
      const ns = s.axis === 'ns';
      const across = ns ? x : z;
      if (Math.abs(across - s.c) > s.w / 2 + 1) continue;
      const along = ns ? z : x;
      const dirAlong = ns ? fz : fx;
      if (Math.abs(dirAlong) < 0.5) continue;
      const [a, b] = this.span(ev);
      let d;
      if (along >= a && along <= b) d = 0;
      else if (dirAlong > 0 && a > along) d = a - along;
      else if (dirAlong < 0 && b < along) d = along - b;
      else continue;
      if (d < look && (best === null || d < best)) best = d;
    }
    return best;
  }

  // ¿El punto está dentro de un bloqueo? (para el auto de Gaspi)
  inside(x, z, pad = 0) {
    for (const ev of this.list) {
      if (ev.leaving) continue;
      const s = ev.street;
      const ns = s.axis === 'ns';
      const across = ns ? x : z;
      if (Math.abs(across - s.c) > s.w / 2 + 0.5 + pad) continue;
      const along = ns ? z : x;
      const [a, b] = this.span(ev);
      if (along > a - pad && along < b + pad) return ev;
    }
    return null;
  }

  update(dt, world) {
    const { player, hud } = world;
    this.nextCorte -= dt;
    this.nextMarcha -= dt;
    const cortes = this.list.filter((e) => e.type === 'corte' && !e.leaving).length;
    if (this.nextCorte <= 0 && cortes < 2) {
      const first = !this.firstDone;
      const ev = this.spawnCorte(player, first);
      if (ev) {
        this.firstDone = true;
        hud.flash('CORTE DE CALLE', ev.label, 'warn');
      }
      this.nextCorte = R.range(80, 140);
    }
    if (this.nextMarcha <= 0 && !this.list.some((e) => e.type === 'marcha')) {
      this.spawnMarcha(player);
      this.nextMarcha = R.range(220, 320);
    }
    let nearest = Infinity;
    for (const ev of this.list) {
      ev.t += dt;
      const d = Math.hypot(player.x - ev.x, player.z - ev.z);
      nearest = Math.min(nearest, d);
      const vis = d < 260;
      ev.g.visible = vis;
      if (ev.type === 'marcha' && !ev.leaving) {
        ev.along += ev.dir * dt * 1.05;
        this.placeMarcha(ev);
        if ((ev.along - ev.end) * ev.dir > 0) {
          ev.leaving = true;
          ev.t = 0;
          this.pushNews(`${ev.street.name}: terminó la marcha, se normaliza el tránsito`);
        }
      }
      if (ev.type === 'corte' && !ev.leaving && ev.t > ev.dur) {
        ev.leaving = true;
        ev.t = 0;
        this.pushNews(`Se levantó el corte en ${ev.label}`);
      }
      if (ev.leaving) {
        // se desconcentran
        for (const p of ev.people) {
          p.h.root.position.z += (p.lz > 0 ? 1 : -1) * dt * 1.5;
          p.h.root.position.x += (p.lx > 0 ? 1 : -1) * dt * 0.8;
        }
        if (ev.t > 14) ev.dead = true;
      }
      if (!vis) continue;
      for (const p of ev.people) animateHuman(p.h, dt, ev.type === 'marcha' || ev.leaving ? 1.1 : p.role === 'walk' ? 0.4 : 0.2, ev.leaving ? 'walk' : p.role);
      for (const f of ev.fires) {
        if (f.userData.flag) f.rotation.y = Math.sin(ev.t * 3 + f.position.x) * 0.4;
        else f.scale.set(1 + Math.sin(ev.t * 17 + f.id) * 0.12, 1 + Math.sin(ev.t * 23 + f.id) * 0.25, 1);
      }
      const inv = ev.g.quaternion.clone().invert();
      for (const sm of ev.smoke) {
        const u = sm.userData;
        u.t += dt;
        const k = (u.t % 4) / 4;
        sm.position.set(u.base[0] + Math.sin(u.t) * 0.6, 2.2 + k * 9, u.base[1] + k * 2);
        sm.scale.setScalar(1 + k * 3);
        sm.material.opacity = 0.55 * (1 - k);
        if (world.camera) sm.quaternion.copy(inv).multiply(world.camera.quaternion);
      }
    }
    this.list = this.list.filter((e) => {
      if (e.dead) this.scene.remove(e.g);
      return !e.dead;
    });
    // bombos de murga si hay un corte o una marcha cerca
    if (nearest < 150) {
      this.beat -= dt;
      if (this.beat <= 0) {
        const v = Math.max(0, 1 - nearest / 150);
        const pattern = [1, 0, 1, 1, 1, 0, 1, 0];
        if (pattern[this.beatN % 8]) this.audio.bombo(v);
        if (this.beatN % 8 === 4) this.audio.platillo(v * 0.7);
        this.beatN++;
        this.beat = 0.24;
      }
    }
    this.nearest = nearest;
  }

  markers() {
    return this.list.filter((e) => !e.leaving).map((e) => ({ x: e.x, z: e.z, kind: e.type }));
  }
}
