// HUD: tarjeta SUBE, plata, reloj, minimapa, zócalo, diálogos, globos y carteles.
import * as THREE from 'three';
import { HALF, DATA as D, TRACKS, nearestStreetName } from './map.js';
import gaspiUrl from './gaspi.webp';
import { WEAPONS } from './weapons.js';
import { drawIcon, iconCanvas, ICONS, LEGEND, PICKUP_ICON } from './icons.js';

// inicial de quien da la misión (como las letras de los GTA): "El Turco del kiosco" → T
const initial = (who = '') => (who.split(/[\s,]+/).find((w) => w && !['El', 'La', 'Los', 'Las', 'Don', 'Doña'].includes(w)) ?? 'M')[0].toUpperCase();

const $ = (id) => document.getElementById(id);
const fmt = (n) => `$ ${Math.round(n).toLocaleString('es-AR')}`;

export class Hud {
  constructor() {
    this.root = $('hud');
    this.dialogEl = $('dialog');
    this.dialog = null;
    this.flashT = 0;
    this.toastT = 0;
    this.bubbleEls = [];
    this.moneyShown = null;
    // la foto de Gaspi recortada a la cara para la tarjeta SUBE
    for (const el of [$('portrait'), document.querySelector('.big-photo')]) {
      if (!el) continue;
      el.style.backgroundImage = `url(${gaspiUrl})`;
    }
    $('portrait').style.backgroundSize = '500%';
    $('portrait').style.backgroundPosition = '38% 7%';
    const big = document.querySelector('.big-photo');
    if (big) {
      big.style.backgroundSize = '260%';
      big.style.backgroundPosition = '35% 0%';
    }
    this.mini = $('minimap');
    this.mctx = this.mini.getContext('2d');
    this.baseMap = this.drawBaseMap();
    this.buildLegend();
  }

  // leyenda del mapa de pausa con los mismos íconos
  buildLegend() {
    const ul = $('pm-legend');
    if (!ul) return;
    ul.textContent = '';
    const item = (el, label) => {
      const li = document.createElement('li');
      li.append(el, document.createTextNode(label));
      ul.append(li);
    };
    for (const [color, label] of [['#ffe14a', 'Objetivo'], ['#c86bff', 'Ruta del GPS']]) {
      const i = document.createElement('i');
      i.style.background = color;
      item(i, label);
    }
    for (const k of LEGEND) {
      const img = document.createElement('img');
      img.src = iconCanvas(k).toDataURL();
      img.alt = '';
      item(img, ICONS[k].label);
    }
  }

  // Lugares con ícono: tiendas, changas, misiones y lo que se mueve (OVNI, ambulancia...).
  // edge: si queda afuera del minimapa, se pega al borde (como en GTA).
  pois(world) {
    const out = [];
    const add = (kind, p, o) => {
      if (p && Number.isFinite(p.x)) out.push({ kind, x: p.x, z: p.z, ...o });
    };
    const P = world.player;
    const mi = world.missions;
    if (mi?.offer && !mi.m) add('mision', mi.offer.origin, { letter: initial(mi.offer.def.giver), edge: true });
    add('armeria', world.armeria);
    for (const g of world.garages || []) add('pintura', g);
    if (world.gym?.x != null) add('gym', world.gym);
    if (world.nafta?.x != null) add('nafta', world.nafta);
    add('comisaria', world.comisaria);
    for (const h of world.rescue?.hospitals || []) add('hospital', h);
    add('tren', world.city?.spots.stationDoor);
    add('pancho', world.city?.spots.pancho);
    for (const n of world.npcs?.vendors || []) if (!n.dead && !n.killed) add('medias', n);
    for (const d of world.interiors?.doors || []) {
      const icon = { kiosco: 'kiosco', bar: 'bar', pizza: 'pizzeria' }[d.room];
      if (icon) add(icon, d.outside);
    }
    if (world.carwash?.x != null) add('lavadero', world.carwash);
    for (const m of world.gangs?.markers() || []) add(m.kind, m);
    for (const m of world.races?.markers() || []) add('picada', m);
    for (const m of world.events?.markers() || []) add('corte', m);
    const r = world.rescue;
    if (r?.ambulance && !r.ambulance.wreck && P.vehicle !== r.ambulance) add('ambulancia', r.ambulance);
    if (r?.firetruck && !r.firetruck.wreck && P.vehicle !== r.firetruck) add('bombero', r.firetruck);
    for (const v of world.traffic?.parked || []) if (v.model === 'delivery' && !v.wreck && Math.abs(v.x - P.x) < 300 && Math.abs(v.z - P.z) < 300) add('delivery', v);
    const u = world.ufo;
    if (u && u.state !== 'away' && u.state !== 'player') add('ovni', u, { edge: true });
    return out;
  }

  show() {
    this.root.hidden = false;
  }

  // ---------- Estado ----------
  update(dt, world) {
    const { player, time } = world;
    // arriba del plato volador la barra muestra cómo está la nave (la baleó el helicóptero)
    const hp = player.ufo ? (player.ufo.hp ?? 100) : player.health;
    $('health').style.width = `${Math.max(0, hp)}%`;
    $('health').style.backgroundColor = player.ufo ? (hp < 35 ? 'var(--alerta)' : '#7dffb0') : hp < 35 ? 'var(--alerta)' : hp < 65 ? 'var(--sodio)' : 'var(--pasto)';
    $('respeto').textContent = player.respeto > 0 ? `+${player.respeto}` : String(player.respeto);
    const ph = $('phone');
    ph.textContent = player.phone ? 'Con celu' : 'Sin celu';
    ph.className = player.phone ? 'ok' : 'bad';
    // la plata sube o baja de a poco, como en los GTA
    if (this.moneyShown === null) this.moneyShown = player.money;
    const diff = player.money - this.moneyShown;
    this.moneyShown += Math.sign(diff) * Math.min(Math.abs(diff), Math.max(50, Math.abs(diff) * dt * 4));
    const m = $('money');
    m.textContent = fmt(this.moneyShown);
    m.className = diff < -1 ? 'lost' : '';
    $('clock').textContent = time.label;
    this.streetT = (this.streetT || 0) - dt;
    if (this.streetT <= 0) {
      $('street').textContent = nearestStreetName(player.x, player.z);
      this.streetT = 0.3;
    }
    // chaleco
    const ab = $('armor-bar');
    ab.hidden = !(player.armor > 0);
    if (player.armor > 0) $('armor').style.width = `${player.armor}%`;
    // estrellas de búsqueda
    const pol = world.police;
    const stars = $('stars').children;
    for (let i = 0; i < stars.length; i++) stars[i].className = i < pol.stars ? 'on' : '';
    $('stars').className = pol.stars && !pol.seen ? 'search' : pol.flash > 0 ? 'hot' : '';
    // arma y balas
    const w = WEAPONS[player.weapon || 'punos'];
    $('w-name').textContent = w.name;
    const a = player.ammo?.[w.id];
    $('w-ammo').textContent = w.gun ? (player.reloadT > 0 ? 'recargando' : `${a?.mag ?? 0} / ${a?.res ?? 0}`) : w.throw ? `${a?.mag ?? 0}` : '';
    // controles táctiles: a pie, en auto o en moto; el botón de ataque dice qué hace
    const v = player.vehicle;
    const mode = player.ufo ? 'ufo' : v ? (v.kind === 'moto' ? 'car moto' : 'car') : 'foot';
    const touch = $('touch');
    if (touch.className !== mode) touch.className = mode;
    const verb = w.gun || w.throw ? 'Tirar' : w.verb || 'Pegar';
    const atk = $('btn-attack');
    if (atk.textContent !== verb) atk.textContent = verb;
    // mira: círculo al apuntar, punto si tiene un arma de fuego en la mano
    const ch = $('crosshair');
    ch.hidden = !((w.gun && !player.vehicle && !player.dead) || player.ufo);
    ch.className = player.aiming || player.ufo ? '' : 'dot';
    $('hitmark').hidden = !(player.hitMarker > 0);
    if (this.radioT > 0) {
      this.radioT -= dt;
      if (this.radioT <= 0) $('radio').hidden = true;
    }

    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) $('flash').hidden = true;
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) $('toast').hidden = true;
    }
    if (this.dialog) {
      this.dialog.t -= dt;
      $('dialog-timer').firstElementChild.style.width = `${Math.max(0, (this.dialog.t / this.dialog.total) * 100)}%`;
      if (this.dialog.t <= 0) this.choose(this.dialog.def);
    }
    this.drawMinimap(world);
  }

  showRadio(st) {
    $('radio').hidden = false;
    $('radio-name').textContent = st.name;
    $('radio-sub').textContent = st.sub;
    const r = $('radio');
    r.style.animation = 'none';
    void r.offsetWidth;
    r.style.animation = '';
    this.radioT = 2.8;
  }
  // posteo de un vecino (arriba a la izquierda, se va solo)
  post(handle, text) {
    const feed = $('feed');
    const el = document.createElement('div');
    el.className = 'post';
    const b = document.createElement('b');
    b.textContent = `@${handle}`;
    el.append(b, document.createTextNode(text));
    feed.prepend(el);
    while (feed.children.length > 3) feed.lastElementChild.remove();
    setTimeout(() => el.classList.add('out'), 6500);
    setTimeout(() => el.remove(), 7000);
  }
  setRoute(pts) {
    this.route = pts;
  }

  setObjective(text, target) {
    this.objective = { text, target };
    $('objective').hidden = !text;
    $('obj-text').textContent = text || '';
  }
  updateObjective(player) {
    const o = this.objective;
    if (!o || !o.target) {
      $('obj-dist').textContent = '';
      return;
    }
    const d = Math.hypot(o.target.x - player.x, o.target.z - player.z);
    $('obj-dist').textContent = `${Math.round(d)} m`;
  }

  flash(title, sub = '', kind = 'ok', dur = 3.4) {
    const f = $('flash');
    f.hidden = false;
    f.className = kind;
    $('flash-title').textContent = title;
    $('flash-sub').textContent = sub;
    // reinicia la animación de entrada
    f.style.animation = 'none';
    void f.offsetWidth;
    f.style.animation = '';
    this.flashT = dur;
  }
  toast(text, dur = 2) {
    const t = $('toast');
    t.hidden = false;
    t.textContent = text;
    this.toastT = dur;
  }
  prompt(key, text) {
    const p = $('prompt');
    // en el celu la acción es un botón que dice qué hace (solo aparece cuando se puede)
    const b = $('btn-ctx');
    if (b && (b.hidden !== !text || b.textContent !== (text || ''))) {
      b.hidden = !text;
      b.textContent = text || '';
      if (key) b.dataset.btn = key.toLowerCase();
    }
    if (!text) {
      p.hidden = true;
      return;
    }
    p.hidden = false;
    p.innerHTML = '';
    const k = document.createElement('kbd');
    k.textContent = key;
    p.append(k, document.createTextNode(text));
  }

  setTicker(items) {
    const text = items.join('   ·   ');
    const el = $('tk-text');
    if (el.textContent !== text) {
      el.textContent = text;
      el.style.animationDuration = `${Math.max(30, text.length * 0.22)}s`;
    }
  }

  // ---------- Diálogos ----------
  ask(question, options, timeout = 6, def = options.length - 1) {
    if (this.dialog) this.choose(this.dialog.def);
    this.dialog = { options, t: timeout, total: timeout, def };
    this.dialogEl.hidden = false;
    $('dialog-q').textContent = question;
    const box = $('dialog-opts');
    box.innerHTML = '';
    options.forEach((o, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      const n = document.createElement('b');
      n.textContent = String(i + 1);
      b.append(n, document.createTextNode(o.label));
      b.addEventListener('click', () => this.choose(i));
      b.addEventListener('touchstart', (e) => {
        e.stopPropagation();
      }, { passive: true });
      box.append(b);
    });
  }
  choose(i) {
    const d = this.dialog;
    if (!d) return;
    this.dialog = null;
    this.dialogEl.hidden = true;
    d.options[i]?.run();
  }
  handleKeys(input) {
    if (!this.dialog) return false;
    for (let i = 0; i < this.dialog.options.length; i++) {
      if (input.hit(String(i + 1))) {
        this.choose(i);
        return true;
      }
    }
    return false;
  }

  // ---------- Globos sobre la gente ----------
  bubbles(camera, speakers) {
    const host = $('bubbles');
    const w = innerWidth;
    const h = innerHeight;
    const v = new THREE.Vector3();
    let i = 0;
    for (const s of speakers) {
      if (i >= 6) break;
      v.set(s.x, s.y, s.z).project(camera);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) continue;
      let el = this.bubbleEls[i];
      if (!el) {
        el = document.createElement('div');
        el.className = 'bubble';
        host.append(el);
        this.bubbleEls[i] = el;
      }
      el.hidden = false;
      el.textContent = s.text;
      el.classList.toggle('bad', !!s.bad);
      el.style.left = `${((v.x + 1) / 2) * w}px`;
      el.style.top = `${((1 - v.y) / 2) * h}px`;
      i++;
    }
    for (; i < this.bubbleEls.length; i++) this.bubbleEls[i].hidden = true;
  }

  // ---------- Minimapa ----------
  drawBaseMap() {
    // 1536: en iPhone los lienzos tienen tope de memoria (2048 eran 16 MB solo para esto)
    const S = 1536;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const k = S / (HALF * 2);
    const X = (x) => (x + HALF) * k;
    const path = (rings) => {
      for (const r of rings) {
        r.forEach(([x, z], i) => (i ? g.lineTo(X(x), X(z)) : g.moveTo(X(x), X(z))));
        g.closePath();
      }
    };
    const fillPolys = (polys, color) => {
      g.fillStyle = color;
      for (const p of polys) {
        g.beginPath();
        path(p);
        g.fill('evenodd');
      }
    };
    // calles de fondo (todo lo que no es manzana es calle)
    g.fillStyle = '#c9c3b2';
    g.fillRect(0, 0, S, S);
    fillPolys(D.yard, '#4b453e');
    fillPolys(D.blocks, '#5b6152');
    // plazas y canchas
    for (const p of D.parks) fillPolys(p.r, p.c === 'pitch' ? '#4f8a3c' : '#467a3a');
    // edificios: apenas más oscuros que la manzana
    g.fillStyle = '#4a4f44';
    g.beginPath();
    for (const b of D.buildings) path([b.r]);
    g.fill();
    g.fillStyle = '#a3563b';
    g.beginPath();
    for (const b of D.buildings) if (b.k === 'estacion') path([b.r]);
    g.fill();
    // avenidas en amarillo claro
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const r of D.roads) {
      if (r.c !== 'primary' && r.c !== 'secondary') continue;
      g.strokeStyle = '#efe0a8';
      g.lineWidth = r.w * k * 0.9;
      g.beginPath();
      r.p.forEach(([x, z], i) => (i ? g.lineTo(X(x), X(z)) : g.moveTo(X(x), X(z))));
      g.stroke();
    }
    // vías
    g.strokeStyle = '#1d1b19';
    g.lineWidth = 2.2;
    for (const t of TRACKS) {
      g.beginPath();
      t.forEach(([x, z], i) => (i ? g.lineTo(X(x), X(z)) : g.moveTo(X(x), X(z))));
      g.stroke();
    }
    fillPolys(D.platforms, '#e3dccb');
    return c;
  }

  // Mapa completo para la pausa: el plano, los nombres de las calles y los marcadores
  drawBig(world) {
    const cv = $('bigmap');
    const g = cv.getContext('2d');
    const S = cv.width;
    const { player } = world;
    const k = S / (HALF * 2);
    const X = (x) => (x + HALF) * k;
    g.drawImage(this.baseMap, 0, 0, S, S);
    // nombres de calles: uno por calle, en su tramo más largo
    if (!this.labels) {
      const best = new Map();
      for (const r of D.roads) {
        if (!r.n) continue;
        for (let i = 0; i < r.p.length - 1; i++) {
          const [ax, az] = r.p[i];
          const [bx, bz] = r.p[i + 1];
          const l = Math.hypot(bx - ax, bz - az);
          if (!best.has(r.n) || l > best.get(r.n).l) best.set(r.n, { l, ax, az, bx, bz, av: r.c === 'primary' || r.c === 'secondary' || r.c === 'tertiary' });
        }
      }
      this.labels = [...best.entries()].filter(([, v]) => v.l > 60);
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const [name, v] of this.labels) {
      let a = Math.atan2(v.bz - v.az, v.bx - v.ax);
      if (a > Math.PI / 2) a -= Math.PI;
      if (a < -Math.PI / 2) a += Math.PI;
      g.save();
      g.translate(X((v.ax + v.bx) / 2), X((v.az + v.bz) / 2));
      g.rotate(a);
      g.font = `${v.av ? 700 : 600} ${v.av ? 15 : 12}px 'Barlow Condensed', 'Arial Narrow', sans-serif`;
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(20,22,24,0.85)';
      g.strokeText(name, 0, 0);
      g.fillStyle = v.av ? '#ffe7a3' : '#f4efe4';
      g.fillText(name, 0, 0);
      g.restore();
    }
    const dot = (x, z, color, r, shape) => {
      g.fillStyle = color;
      g.strokeStyle = '#111';
      g.lineWidth = 2;
      g.beginPath();
      if (shape === 'square') g.rect(X(x) - r, X(z) - r, r * 2, r * 2);
      else g.arc(X(x), X(z), r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    };
    if (this.route && this.route.length > 1) {
      g.strokeStyle = '#c86bff';
      g.lineWidth = 5;
      g.lineJoin = 'round';
      g.beginPath();
      this.route.forEach(([x, z], i) => (i ? g.lineTo(X(x), X(z)) : g.moveTo(X(x), X(z))));
      g.stroke();
    }
    for (const m of world.police.markers()) dot(m.x, m.z, '#3060ff', 5, 'square');
    // íconos a lo GTA (los objetos del piso, más chicos)
    for (const m of world.pickups.markers({ x: player.x, z: player.z }, true)) {
      if (PICKUP_ICON[m.kind]) drawIcon(g, PICKUP_ICON[m.kind], X(m.x), X(m.z), 26);
      else dot(m.x, m.z, '#6ec3ea', 5);
    }
    for (const m of this.pois(world)) drawIcon(g, m.kind, X(m.x), X(m.z), m.kind === 'mision' || m.kind === 'ovni' ? 46 : 38, m.letter);
    const o = this.objective;
    if (o?.target) dot(o.target.x, o.target.z, '#ffe14a', 9);
    // Gaspi
    g.save();
    g.translate(X(player.x), X(player.z));
    g.rotate(-player.heading + Math.PI);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#0f5fa8';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, -13);
    g.lineTo(9, 10);
    g.lineTo(0, 5);
    g.lineTo(-9, 10);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    $('pm-obj').textContent = o?.text ?? '';
  }

  drawMinimap(world) {
    const { player, events, crime } = world;
    const g = this.mctx;
    const W = this.mini.width;
    const S = this.baseMap.width;
    const k = S / (HALF * 2);
    const scale = player.vehicle ? 0.55 : 0.8; // px de minimapa por metro
    g.save();
    g.clearRect(0, 0, W, W);
    g.beginPath();
    g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#2d3328';
    g.fillRect(0, 0, W, W);
    g.translate(W / 2, W / 2);
    // "arriba" es hacia donde mira la cámara
    g.rotate(player.camYaw);
    g.scale(scale / k, scale / k);
    g.translate(-(player.x + HALF) * k, -(player.z + HALF) * k);
    g.drawImage(this.baseMap, 0, 0);
    const mark = (x, z, color, r, shape = 'dot') => {
      const px = (x + HALF) * k;
      const pz = (z + HALF) * k;
      const rr = (r * k) / scale;
      g.fillStyle = color;
      g.strokeStyle = '#111';
      g.lineWidth = (1.5 * k) / scale;
      g.beginPath();
      if (shape === 'square') g.rect(px - rr, pz - rr, rr * 2, rr * 2);
      else g.arc(px, pz, rr, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    };
    // ruta del GPS
    if (this.route && this.route.length > 1) {
      g.strokeStyle = '#c86bff';
      g.lineWidth = (5 * k) / scale;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.beginPath();
      this.route.forEach(([x, z], i) => (i ? g.lineTo((x + HALF) * k, (z + HALF) * k) : g.moveTo((x + HALF) * k, (z + HALF) * k)));
      g.stroke();
    }
    for (const m of crime.markers()) mark(m.x, m.z, m.kind === 'moto' ? '#e5484d' : '#6ec3ea', 5);
    for (const m of world.pickups.markers(player)) if (!PICKUP_ICON[m.kind]) mark(m.x, m.z, '#6ec3ea', 3.5);
    const blink = ((performance.now() / 250) | 0) % 2;
    for (const m of world.police.markers()) mark(m.x, m.z, m.kind === 'heli' ? '#ffffff' : blink ? '#ff3030' : '#3060ff', m.kind === 'poli' ? 5 : 3.5, m.kind === 'poli' ? 'square' : 'dot');
    const o = this.objective;
    if (o?.target) mark(o.target.x, o.target.z, '#ffe14a', 6);
    // íconos derechos aunque el mapa gire (en coordenadas de pantalla)
    g.setTransform(1, 0, 0, 1, 0, 0);
    const cy = Math.cos(player.camYaw);
    const sy = Math.sin(player.camYaw);
    const R0 = W / 2;
    const toScreen = (x, z) => {
      const dx = (x - player.x) * scale;
      const dz = (z - player.z) * scale;
      return [R0 + dx * cy - dz * sy, R0 + dx * sy + dz * cy];
    };
    const edgeIcons = [];
    for (const m of world.pickups.markers(player)) {
      if (!PICKUP_ICON[m.kind]) continue;
      const [x, y] = toScreen(m.x, m.z);
      if (Math.hypot(x - R0, y - R0) < R0 - 4) drawIcon(g, PICKUP_ICON[m.kind], x, y, 13);
    }
    for (const m of this.pois(world)) {
      const [x, y] = toScreen(m.x, m.z);
      const size = m.kind === 'mision' || m.kind === 'ovni' ? 22 : 18;
      const d = Math.hypot(x - R0, y - R0);
      const lim = R0 - size / 2 - 2;
      if (d <= lim) drawIcon(g, m.kind, x, y, size, m.letter);
      else if (m.edge) edgeIcons.push({ m, x: R0 + ((x - R0) / d) * lim, y: R0 + ((y - R0) / d) * lim, size });
    }
    g.restore();
    // los importantes, pegados al borde aunque estén lejos
    for (const e of edgeIcons) drawIcon(this.mctx, e.m.kind, e.x, e.y, e.size, e.m.letter);
    // con la cana atrás, el borde titila rojo y azul
    if (world.police.stars > 0) {
      g.strokeStyle = blink ? 'rgba(255,48,48,0.9)' : 'rgba(48,96,255,0.9)';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(W / 2, W / 2, W / 2 - 3, 0, Math.PI * 2);
      g.stroke();
    }
    // borde: si el objetivo queda fuera, flecha en el borde
    if (o?.target) {
      const dx = o.target.x - player.x;
      const dz = o.target.z - player.z;
      const d = Math.hypot(dx, dz) * scale;
      if (d > W / 2 - 8) {
        const cy = Math.cos(player.camYaw);
        const sy = Math.sin(player.camYaw);
        const rx = dx * cy - dz * sy;
        const ry = dx * sy + dz * cy;
        const l = Math.hypot(rx, ry) || 1;
        const ex = W / 2 + (rx / l) * (W / 2 - 10);
        const ez = W / 2 + (ry / l) * (W / 2 - 10);
        g.fillStyle = '#ffe14a';
        g.beginPath();
        g.arc(ex, ez, 6, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Gaspi: flecha en el centro
    g.save();
    g.translate(W / 2, W / 2);
    g.rotate(player.camYaw - player.heading + Math.PI);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#0f5fa8';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(6, 7);
    g.lineTo(0, 3);
    g.lineTo(-6, 7);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
