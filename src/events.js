// Cortes de calle, marchas y el zócalo de noticias.
import * as THREE from 'three';
import { makeHuman, randomCivilian } from './human.js';
import { Npc } from './npcs.js';
import { bannerTexture } from './textures.js';
import { ROADS, NAMED, project, pointAt, withCum, cornerName } from './map.js';
import { radialTexture } from './city.js';
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

// Calle transversal más cercana a un punto (distinta de `name`)
function crossName(x, z, name) {
  const c = cornerName(x, z).split(' y ');
  return c.find((n) => n !== name) || null;
}

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _o = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Events {
  constructor(scene, traffic, audio, npcs) {
    this.scene = scene;
    this.traffic = traffic;
    this.audio = audio;
    this.npcs = npcs;
    this.list = [];
    this.news = [...TICKER_BASE];
    this.nextCorte = 16;
    this.nextMarcha = 150;
    this.beat = 0;
    this.beatN = 0;
    this.smokeGeo = new THREE.PlaneGeometry(2.2, 2.2);
    this.smokeTex = radialTexture('rgba(255,255,255,0.9)');
    this.glowMat = new THREE.SpriteMaterial({ map: radialTexture(), color: 0xff8a2a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 });
    this.fireMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.9 });
    this.fireMat2 = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85 });
    // fuego apenas sobreexpuesto: brilla con el bloom sin quemarse en una mancha blanca
    this.fireMat.color.setRGB(1.5, 0.55, 0.12);
    this.fireMat2.color.setRGB(1.6, 1.15, 0.3);
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
    // un punto sobre una calle real (preferentemente avenida), lejos de las esquinas
    const cands = ROADS.filter((r) => r.len > 40 && r.w >= 8.5);
    let pick = null;
    for (let tries = 0; tries < 60 && !pick; tries++) {
      const avs = cands.filter((r) => r.avenue);
      const r = avs.length && R.chance(0.7) ? R.pick(avs) : R.pick(cands);
      const at = R.range(18, r.len - 18);
      const p = pointAt(r.pts, r.cum, at);
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (this.list.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 120)) continue;
      if (forced ? d < 45 || d > 240 : d < 70 || d > 420) continue;
      pick = { r, at, p };
    }
    if (!pick) return null;
    const s = pick.r;
    const x = pick.p.x;
    const z = pick.p.z;
    const e = { from: pointAt(s.pts, s.cum, 0), to: pointAt(s.pts, s.cum, s.len) };
    const reclamo = R.pick(RECLAMOS);
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(pick.p.dx, pick.p.dz); // el eje local z corre a lo largo de la calle
    this.scene.add(g);
    const ev = { type: 'corte', street: s, x, z, dx: pick.p.dx, dz: pick.p.dz, half: 7, g, people: [], banners: [], loose: [], fires: [], smoke: [], t: 0, dur: R.range(150, 260), reclamo };
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
      const glow = new THREE.Sprite(this.glowMat);
      glow.scale.set(3.6, 3.6, 1);
      glow.position.y = 1.6;
      pile.add(f1, f2, glow);
      pile.position.set(lx, 0, 0);
      g.add(pile);
      ev.fires.push(f1, f2);
      for (let i = 0; i < 6; i++) {
        const sm = new THREE.Mesh(this.smokeGeo, new THREE.MeshBasicMaterial({ map: this.smokeTex, color: 0x262626, transparent: true, opacity: 0.5, depthWrite: false }));
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
      const role = i < 2 ? 'drum' : i < 6 ? 'banner' : R.pick(['fist', 'walk', 'fist']);
      const n = this.recruit(ev, h, role, lx, lz, side > 0 ? 0 : Math.PI);
      if (role === 'drum') this.addDrum(n);
    }
    // pasacalles en cada frente
    for (const side of [-1, 1]) {
      const tex = bannerTexture(reclamo.banner, rng);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(s.w * 0.85, 1.3), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
      b.position.set(0, 2.2, side * 6.4);
      if (side < 0) b.rotation.y = Math.PI;
      g.add(b);
      const parts = [b];
      for (const px of [-s.w * 0.43, s.w * 0.43]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3), new THREE.MeshLambertMaterial({ color: 0x6b4a2b }));
        pole.position.set(px, 1.5, side * 6.4);
        g.add(pole);
        parts.push(pole);
      }
      // si lo choca un auto, lo patean o le cae una explosión, se viene abajo
      ev.banners.push({ parts, lx: 0, lz: side * 6.4, half: s.w * 0.45, holders: null, fallen: null });
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
    const a = crossName(e.from.x, e.from.z, s.name);
    const b = crossName(e.to.x, e.to.z, s.name);
    ev.label = s.name && a && b && a !== b ? `${s.name} entre ${a} y ${b}` : s.name ? `${s.name} y ${a || b || 'la estación'}` : cornerName(x, z);
    this.list.push(ev);
    this.pushNews(`ÚLTIMO MOMENTO · Corte total en ${ev.label}: ${reclamo.quien.toLowerCase()} ${reclamo.por}`);
    return ev;
  }

  // ---------- Marchas ----------
  spawnMarcha(player) {
    const avNames = Object.keys(NAMED).filter((n) => ROADS.some((r) => r.name === n && r.avenue));
    const name = avNames.length ? R.pick(avNames) : Object.keys(NAMED)[0];
    const line = NAMED[name].reduce((a, b) => (b.length > a.length ? b : a));
    const path = withCum(line);
    const pp = project(path.pts, path.cum, player.x, player.z);
    // arrancan en la punta más lejana y avanzan hacia la zona del jugador
    const startAlong = pp.s > path.len / 2 ? 0 : path.len;
    const endAlong = Math.max(10, Math.min(path.len - 10, pp.s + (startAlong === 0 ? -40 : 40)));
    const dir = Math.sign(endAlong - startAlong) || 1;
    const road = ROADS.find((r) => r.name === name) || ROADS[0];
    const s = { name, w: road.w };
    const reclamo = R.pick(RECLAMOS);
    const g = new THREE.Group();
    this.scene.add(g);
    const ev = { type: 'marcha', street: s, path, along: startAlong, end: endAlong, dir, half: 0, g, people: [], banners: [], loose: [], fires: [], smoke: [], t: 0, dur: 9999, reclamo, len: 30 };
    this.placeMarcha(ev);
    const rows = 9;
    const holders = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 5; c++) {
        const h = makeHuman({ ...randomCivilian(), cap: R.chance(0.3) ? R.pick([0x1a237e, 0xc62828]) : null });
        const lx = (c - 2) * (s.w / 5.5) + R.range(-0.3, 0.3);
        const lz = -r * 3.2 + R.range(-0.5, 0.5);
        const role = r === 0 && (c === 0 || c === 4) ? 'banner' : r === 3 && c % 2 === 0 ? 'drum' : R.pick(['walk', 'fist', 'walk']);
        const n = this.recruit(ev, h, role, lx, lz);
        if (role === 'drum') this.addDrum(n);
        if (role === 'banner') holders.push(n);
      }
    }
    const tex = bannerTexture(reclamo.banner, this.rng);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(s.w * 0.8, 1.4), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    banner.position.set(0, 2.3, 0.6);
    g.add(banner);
    // la bandera la llevan los dos de las puntas: si cae uno, se viene abajo
    ev.banners.push({ parts: [banner], lx: 0, lz: 0.6, half: s.w * 0.42, holders, fallen: null });
    const endP = pointAt(path.pts, path.cum, endAlong);
    const st = crossName(endP.x, endP.z, name) ?? 'la estación';
    ev.label = s.name;
    this.list.push(ev);
    this.pushNews(`EN VIVO · Marcha por ${s.name} rumbo a ${st}: ${reclamo.quien.toLowerCase()} ${reclamo.por}`);
    return ev;
  }

  // ---------- Manifestantes ----------
  // Son gente de verdad (están en npcs.list): se les puede pegar, tirar y pisar con el auto, y se
  // defienden o salen corriendo como cualquiera. Mientras dura el corte o la marcha, `protestBrain`
  // (lo llama npcs.update en el estado 'protest') los lleva a su lugar en el grupo.
  recruit(ev, h, role, lx, lz, face = 0) {
    const n = new Npc('piquetero', h, 0, 0);
    n.ev = ev;
    n.role = role;
    n.lx = lx;
    n.lz = lz;
    n.face = face;
    n.state = 'protest';
    n.hp = 75;
    n.vmax = 1.3;
    n.brave = role === 'drum' ? 0.2 : 0.55;
    n.money = R.int(1, 6) * 200;
    n.target = { x: 0, z: 0 };
    this.slot(ev, n, n.target);
    n.x = n.target.x;
    n.z = n.target.z;
    n.heading = n.target.heading;
    this.npcs.add(n);
    this.npcs.place(n);
    ev.people.push(n);
    return n;
  }

  addDrum(n) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.45, 12).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf5f5f5 }));
    drum.position.set(0, 1.0, 0.3);
    n.h.root.add(drum);
    n.drum = drum;
  }

  // su lugar en el mundo: la posición en el marco del evento (el eje local z corre por la calle)
  slot(ev, n, out) {
    const r = ev.g.rotation.y;
    const c = Math.cos(r);
    const s = Math.sin(r);
    let lx = n.lx;
    // en el corte, los que no tienen nada en la mano van y vienen
    if (ev.type === 'corte' && n.role === 'walk') lx += Math.sin(ev.t * 0.3 + n.lz * 3) * 1.4;
    lx = Math.max(-ev.street.w / 2 + 0.5, Math.min(ev.street.w / 2 - 0.5, lx));
    out.x = ev.x + lx * c + n.lz * s;
    out.z = ev.z - lx * s + n.lz * c;
    out.heading = r + n.face;
    return out;
  }

  protestBrain(n, dt) {
    const ev = n.ev;
    const p = this.slot(ev, n, n.target);
    const d = Math.hypot(p.x - n.x, p.z - n.z);
    // lejos de su lugar (se levantó, volvió de correr): va trotando
    if (d > 4) return { want: 3.6, pose: 'walk' };
    if (ev.type === 'marcha') return { want: 1.6, pose: n.role };
    if (n.role === 'walk') return { want: 1.2, pose: 'walk' };
    if (d > 0.4) return { want: 1.2, pose: 'walk' };
    // en su lugar: mira para afuera del corte, al tránsito
    let dh = p.heading - n.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    n.heading += dh * Math.min(1, dt * 3);
    return { want: 0, pose: n.role, anim: 0.2 };
  }

  // termina el corte o la marcha: cada uno sigue su vida como un vecino más
  release(ev) {
    for (const n of ev.people) {
      if (n.ev !== ev) continue;
      n.ev = null;
      n.type = 'vecino';
      if (n.drum) n.drum.visible = false;
      if (n.state === 'protest') {
        n.state = 'walk';
        this.npcs.attach(n);
      }
    }
  }

  // le pegaron a un compañero: los de al lado salen a pelear (o a correr)
  rally(n, world) {
    const ev = n.ev;
    if (!ev || ev.leaving) return;
    let k = 0;
    for (const o of ev.people) {
      if (o === n || o.ev !== ev || o.state !== 'protest' || k >= 4) continue;
      if (Math.hypot(o.x - n.x, o.z - n.z) > 9) continue;
      if (R.chance(o.brave)) {
        this.npcs.setState(o, 'fight');
        if (!o.bubble) o.say(R.pick(['¡Le pegó a un compañero!', '¡Vení, gil!', '¡Facho!', '¡Dale que es uno solo!']), 2);
        k++;
      }
    }
  }

  // algo golpea en (x, z) con radio r (un auto, una patada, una explosión): los pasacalles que
  // alcanza se vienen abajo. fx, fz: hacia dónde empuja (null: para afuera del centro)
  knock(x, z, r, fx = null, fz = null) {
    for (const ev of this.list) {
      if (Math.abs(x - ev.x) > 40 + r || Math.abs(z - ev.z) > 40 + r) continue;
      const rx = x - ev.x;
      const rz = z - ev.z;
      const lz = rx * ev.dx + rz * ev.dz;
      const lx = rx * ev.dz - rz * ev.dx;
      for (const bn of ev.banners) {
        if (bn.fallen || Math.abs(lz - bn.lz) > r + 0.3 || Math.abs(lx - bn.lx) > bn.half + r) continue;
        let px = fx;
        let pz = fz;
        if (px === null) {
          // empuja desde la explosión hacia el pasacalles (o a lo largo de la calle)
          const s = Math.sign(bn.lz - lz) || 1;
          px = ev.dx * s;
          pz = ev.dz * s;
        }
        this.dropBanner(ev, bn, px, pz);
      }
    }
  }

  dropBanner(ev, bn, px, pz) {
    if (bn.fallen) return;
    ev.g.updateMatrixWorld(true);
    const parts = [];
    for (const m of bn.parts) {
      this.scene.attach(m);
      ev.loose.push(m);
      // gira sobre la línea donde toca el piso, con la punta hacia donde empujan
      const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(m.quaternion);
      axis.y = 0;
      axis.normalize();
      _a.crossVectors(axis, UP);
      const s = _a.x * px + _a.z * pz >= 0 ? 1 : -1;
      // (queda apenas arriba del asfalto para que no titile)
      parts.push({ m, axis, s, q0: m.quaternion.clone(), base: new THREE.Vector3(m.position.x, 0, m.position.z), y0: m.position.y, lift: 0.05 });
    }
    bn.fallen = { t: 0, parts };
    this.audio.golpe?.(0.35);
  }

  updateBanners(dt, ev) {
    for (const bn of ev.banners) {
      // la bandera de la marcha: si se cae (o se va) uno de los que la llevan, se viene abajo
      if (!bn.fallen && bn.holders?.some((n) => n.state !== 'protest' || n.dead)) this.dropBanner(ev, bn, ev.dx, ev.dz);
      const f = bn.fallen;
      if (!f || f.t >= 0.8) continue;
      f.t = Math.min(0.8, f.t + dt);
      // cae acelerando y rebota apenas al final
      const k = f.t / 0.8;
      const a = (Math.PI / 2) * Math.min(1, k * k * 1.08) - (k > 0.9 ? Math.sin((k - 0.9) * 31) * 0.04 : 0);
      for (const p of f.parts) {
        _q.setFromAxisAngle(p.axis, p.s * a);
        p.m.quaternion.copy(_q).multiply(p.q0);
        _o.set(0, p.y0, 0).applyQuaternion(_q);
        p.m.position.copy(p.base).add(_o);
        p.m.position.y = Math.max(p.lift, p.m.position.y + p.lift * k);
      }
    }
  }

  placeMarcha(ev) {
    const p = pointAt(ev.path.pts, ev.path.cum, ev.along);
    ev.x = p.x;
    ev.z = p.z;
    ev.dx = p.dx * ev.dir;
    ev.dz = p.dz * ev.dir;
    ev.g.position.set(p.x, 0.02, p.z);
    // el eje local +z apunta al sentido de marcha
    ev.g.rotation.y = Math.atan2(ev.dx, ev.dz);
  }

  // Zona bloqueada en el marco local del evento: a lo largo [a, b], ancho medio
  span(ev) {
    if (ev.type === 'corte') return [-7, 7];
    return [-ev.len, 2];
  }

  local(ev, x, z) {
    const rx = x - ev.x;
    const rz = z - ev.z;
    return { along: rx * ev.dx + rz * ev.dz, lat: -rx * ev.dz + rz * ev.dx };
  }

  blockAhead(x, z, fx, fz, look) {
    let best = null;
    for (const ev of this.list) {
      if (ev.leaving) continue;
      if (Math.abs(x - ev.x) > look + 40 || Math.abs(z - ev.z) > look + 40) continue;
      const { along, lat } = this.local(ev, x, z);
      if (Math.abs(lat) > ev.street.w / 2 + 1) continue;
      const fd = fx * ev.dx + fz * ev.dz;
      if (Math.abs(fd) < 0.5) continue;
      const [a, b] = this.span(ev);
      let d;
      if (along >= a && along <= b) d = 0;
      else if (fd > 0 && along < a) d = a - along;
      else if (fd < 0 && along > b) d = along - b;
      else continue;
      if (d < look && (best === null || d < best)) best = d;
    }
    return best;
  }

  // ¿El punto está dentro de un bloqueo? (para el auto de Gaspi)
  inside(x, z, pad = 0) {
    for (const ev of this.list) {
      if (ev.leaving) continue;
      if (Math.abs(x - ev.x) > 50 || Math.abs(z - ev.z) > 50) continue;
      const { along, lat } = this.local(ev, x, z);
      if (Math.abs(lat) > ev.street.w / 2 + 0.5 + pad) continue;
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
          this.release(ev);
          this.pushNews(`${ev.street.name}: terminó la marcha, se normaliza el tránsito`);
        }
      }
      if (ev.type === 'corte' && !ev.leaving && ev.t > ev.dur) {
        ev.leaving = true;
        ev.t = 0;
        this.release(ev);
        this.pushNews(`Se levantó el corte en ${ev.label}`);
      }
      // se desconcentran (cada uno ya se fue caminando como un vecino más)
      if (ev.leaving && ev.t > 14) ev.dead = true;
      this.updateBanners(dt, ev);
      if (!vis) continue;
      // el bombo solo se ve mientras lo tocan (tirado en el piso quedaría flotando)
      for (const n of ev.people) if (n.drum) n.drum.visible = n.ev === ev && n.state === 'protest';
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
      if (e.dead) {
        this.scene.remove(e.g);
        for (const m of e.loose) this.scene.remove(m);
        this.release(e);
      }
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
