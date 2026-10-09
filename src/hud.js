// HUD: tarjeta SUBE, plata, reloj, minimapa, zócalo, diálogos, globos y carteles.
import * as THREE from 'three';
import { X0, Z0, X1, Z1, AREA, DATA as D, TRACKS, nearestStreetName } from './map.js';
import gaspiUrl from './gaspi.webp';
import { WEAPONS, SLOT_OF } from './weapons.js';
import { VC } from './vc.js';
import { TOUCH } from './input.js';
import { updateAimHud, canAim } from './aim.js';
import { drawIcon, iconCanvas, ICONS, LEGEND, PICKUP_ICON } from './icons.js';
import { MapView, bindMapControls } from './map-view.js';

const MAPK = 1; // px del plano por metro
const MAP = VC ? {
  outside: '#18343f', road: '#fff6dd', block: '#dfd4ba', building: '#c0ae9f',
  edge: '#7c8d89', yard: '#b3c7c2', park: '#8ac7ad', pitch: '#6bac97',
  station: '#f19fba', platform: '#fff4dc', avenue: '#ffe4a6', track: '#547e80',
  route: '#ed68ac', ink: '#17343e', label: '#25414a', halo: '#fff7e8',
} : {
  outside: '#2d3328', road: '#c9c3b2', block: '#5b6152', building: '#4a4f44',
  edge: '#74776a', yard: '#4b453e', park: '#467a3a', pitch: '#4f8a3c',
  station: '#a3563b', platform: '#e3dccb', avenue: '#efe0a8', track: '#1d1b19',
  route: '#c86bff', ink: '#111418', label: '#f4efe4', halo: '#202628',
};

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
    this.mapView = new MapView([X0, Z0, X1, Z1]);
    const redraw = () => {
      if (this.mapWorld && !$('pausemap').hidden) this.drawBig(this.mapWorld);
    };
    this.clearMapPointers = bindMapControls($('bigmap'), this.mapView, redraw, {
      plus: $('map-plus'), minus: $('map-minus'), all: $('map-all'), player: $('map-player'),
      position: () => this.mapWorld.player,
    });
    globalThis.addEventListener('resize', redraw);
    document.fonts?.ready.then(redraw);
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
    for (const [color, label] of [['#ffe14a', 'Objetivo'], [MAP.route, 'Ruta del GPS']]) {
      const i = document.createElement('i');
      i.style.background = color;
      item(i, label);
    }
    for (const k of [...LEGEND, 'lavadero', 'bar', 'pizzeria']) {
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
      const icon = { kiosco: 'kiosco', bar: 'bar', correo: 'bar', pizza: 'pizzeria' }[d.room];
      if (icon) add(icon, d.outside);
    }
    if (world.carwash?.x != null) add('lavadero', world.carwash);
    for (const m of world.gangs?.markers() || []) add(m.kind, m);
    for (const m of world.races?.markers() || []) add('picada', m);
    for (const m of world.matanzas?.markers(P) || []) add('matanza', m);
    if (world.heli && world.heli.state === 'parked') add('heli', world.heli);
    // los tanques del Ejército (src/tank.js): siempre a la vista, pegados al borde si están lejos
    for (const v of world.tanks?.list || []) if (!v.wreck && P.vehicle !== v) add('tanque', v, { edge: true });
    if (world.tobogan?.t) add('tobogan', world.tobogan.t.door);
    if (world.aura) add('aura', world.aura.spot);
    if (world.seleccion) add('seleccion', world.seleccion.spot);
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
    // aire buceando
    {
      const P = world.player;
      const am = $('air-meter');
      const show = !!P.diving || (P.air ?? 1) < 0.999;
      if (am.hidden === show) am.hidden = !show;
      if (show) {
        $('air').style.width = `${Math.round(Math.max(0, P.air ?? 1) * 100)}%`;
        am.classList.toggle('low', (P.air ?? 1) < 0.25);
      }
    }
    const { player, time } = world;
    // arriba del plato volador la barra muestra cómo está la nave (la baleó el helicóptero)
    const hp = player.ufo ? (player.ufo.hp ?? 100) : player.health;
    $('health').style.width = `${Math.max(0, hp)}%`;
    if (VC) {
      $('vc-hp').textContent = String(Math.max(0, Math.ceil(hp)));
      $('vc-armor-wrap').hidden = !(player.armor > 0);
      if (player.armor > 0) $('vc-armor').textContent = String(Math.ceil(player.armor));
    }
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
    // Vice City: ocho cifras con ceros adelante ($00020000)
    m.textContent = VC ? `${this.moneyShown < 0 ? '-' : ''}$${String(Math.round(Math.abs(this.moneyShown))).padStart(8, '0')}` : fmt(this.moneyShown);
    m.className = diff < -1 ? 'lost' : '';
    $('clock').textContent = time.label;
    this.streetT = (this.streetT || 0) - dt;
    if (this.streetT <= 0) {
      const name = nearestStreetName(player.x, player.z);
      const st = $('street');
      if (st.textContent !== name) {
        st.textContent = name;
        // Vice City: el nombre aparece grande abajo a la derecha y se va solo
        if (VC) {
          st.classList.remove('vc-pop');
          void st.offsetWidth;
          st.classList.add('vc-pop');
        }
      }
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
    // en la compu, el número de su casillero (1 a 9)
    $('w-name').textContent = TOUCH ? w.name : `${SLOT_OF[w.id] ?? ''} · ${w.name}`;
    const a = player.ammo?.[w.id];
    $('w-ammo').textContent = w.gun ? (player.reloadT > 0 ? 'recargando' : `${a?.mag ?? 0} / ${a?.res ?? 0}`) : w.throw ? `${a?.mag ?? 0}` : '';
    // controles táctiles: a pie, en auto o en moto; el botón de ataque dice qué hace
    const v = player.vehicle;
    const heli = !!player.ufo?.isHeli;
    const mode = player.ufo ? (heli ? 'ufo heli' : 'ufo') : v ? (v.kind === 'moto' ? 'car moto' : 'car') : player.boat ? 'boat' : player.swimming ? (player.diving ? 'swim diving' : 'swim') : canAim(player, w, !!this.dialog) ? 'foot armed' : 'foot';
    // nadando: "Bucear" (y abajo del agua, "Bajar")
    if (player.swimming) {
      const dl = player.diving ? 'Bajar' : 'Bucear';
      if ($('btn-dive').textContent !== dl) $('btn-dive').textContent = dl;
    }
    const touch = $('touch');
    if (touch.className !== mode) touch.className = mode;
    // el helicóptero tira con la ametralladora; el plato, con el rayo
    const laser = $('btn-laser');
    const shoot = heli ? 'Disparar' : 'Rayo';
    if (laser.textContent !== shoot) laser.textContent = shoot;
    const verb = w.gun ? 'Disparar' : w.throw ? 'Tirar' : w.verb || 'Pegar';
    const atk = $('btn-attack');
    if (atk.textContent !== verb) atk.textContent = verb;
    updateAimHud(player, w, { crosshair: $('crosshair'), button: $('btn-aim'), hitmark: $('hitmark') }, !!this.dialog);
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
    // 1 px por metro: en iPhone los lienzos tienen tope de memoria (son ~11 MB solo para esto)
    const k = MAPK;
    const c = document.createElement('canvas');
    c.width = Math.ceil((X1 - X0) * k);
    c.height = Math.ceil((Z1 - Z0) * k);
    const g = c.getContext('2d');
    const X = (x) => (x - X0) * k;
    const Z = (z) => (z - Z0) * k;
    const path = (rings) => {
      for (const r of rings) {
        r.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
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
    // El área sin relevar queda transparente sobre el fondo oscuro del radar.
    fillPolys([[AREA]], MAP.road);
    fillPolys(D.yard, MAP.yard);
    fillPolys(D.blocks, MAP.block);
    g.strokeStyle = MAP.edge;
    g.lineWidth = 1.2;
    for (const p of D.blocks) {
      g.beginPath(); path(p); g.stroke();
    }
    // plazas y canchas
    for (const p of D.parks) fillPolys(p.r, p.c === 'pitch' ? MAP.pitch : MAP.park);
    // edificios: apenas más oscuros que la manzana
    g.fillStyle = MAP.building;
    g.beginPath();
    for (const b of D.buildings) path([b.r]);
    g.fill();
    g.fillStyle = MAP.station;
    g.beginPath();
    for (const b of D.buildings) if (b.k === 'estacion') path([b.r]);
    g.fill();
    // Calles crema con contorno; las avenidas se distinguen del tejido de manzanas.
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const outline of [true, false]) {
      for (const r of D.roads) {
        const av = ['primary', 'secondary', 'tertiary'].includes(r.c);
        g.strokeStyle = outline ? MAP.edge : av ? MAP.avenue : MAP.road;
        g.lineWidth = Math.max(3, r.w * k * 0.85) + (outline ? 2 : 0);
        g.beginPath();
        r.p.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
        g.stroke();
      }
    }
    // vías
    g.strokeStyle = MAP.track;
    g.lineWidth = 2.2;
    for (const t of TRACKS) {
      g.beginPath();
      t.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
      g.stroke();
    }
    fillPolys(D.platforms, MAP.platform);
    return c;
  }

  // Mapa de pausa: la misma cartografía que el radar, con una vista navegable.
  drawBig(world) {
    this.mapWorld = world;
    const cv = $('bigmap');
    const g = cv.getContext('2d');
    const S = cv.width;
    const { player } = world;
    const view = this.mapView;
    const k = view.scale;
    const ui = S / (cv.getBoundingClientRect().width || 560);
    const X = (x) => view.project(x, 0)[0];
    const Z = (z) => view.project(0, z)[1];
    g.fillStyle = MAP.outside;
    g.fillRect(0, 0, S, S);
    // Retícula del plano, solo visible fuera del área relevada.
    g.strokeStyle = 'rgba(176,218,219,0.055)';
    g.lineWidth = ui;
    for (let i = 0; i <= S; i += 48 * ui) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.moveTo(0, i); g.lineTo(S, i); g.stroke();
    }
    g.drawImage(this.baseMap, X(X0), Z(Z0), (X1 - X0) * k, (Z1 - Z0) * k);
    const pois = this.pois(world);
    // En la vista general, los lugares; al acercarse aparecen los objetos del piso.
    const pickups = view.zoom >= 1.6 ? world.pickups.markers(player, true) : [];
    const poiSize = (m) => (m.kind === 'mision' || m.kind === 'ovni' ? 29 : 23) * ui;
    const reserved = pois.map((m) => {
      const h = poiSize(m) / 2 + 3 * ui;
      return { x: X(m.x) - h, y: Z(m.z) - h, w: h * 2, h: h * 2 };
    });
    for (const m of [...pickups, player]) reserved.push({ x: X(m.x) - 12 * ui, y: Z(m.z) - 12 * ui, w: 24 * ui, h: 24 * ui });
    reserved.push({ x: S - 55 * ui, y: 0, w: 55 * ui, h: 55 * ui });
    const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const write = (name, x, y, angle, size, strong = false, available = Infinity) => {
      g.font = `${strong ? 800 : 600} ${size * ui}px 'Barlow Condensed', 'Arial Narrow', sans-serif`;
      const w = g.measureText(name).width;
      if (w > available) return;
      const h = (size + 5) * ui;
      const box = { x: x - (Math.abs(Math.cos(angle)) * w + Math.abs(Math.sin(angle)) * h) / 2,
        y: y - (Math.abs(Math.sin(angle)) * w + Math.abs(Math.cos(angle)) * h) / 2,
        w: Math.abs(Math.cos(angle)) * w + Math.abs(Math.sin(angle)) * h,
        h: Math.abs(Math.sin(angle)) * w + Math.abs(Math.cos(angle)) * h };
      if (box.x < 10 * ui || box.y < 10 * ui || box.x + box.w > S - 10 * ui || box.y + box.h > S - 10 * ui || reserved.some((r) => overlaps(box, r))) return;
      reserved.push(box);
      g.save(); g.translate(x, y); g.rotate(angle);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = 3.5 * ui;
      g.strokeStyle = MAP.halo; g.strokeText(name, 0, 0);
      g.fillStyle = MAP.label; g.fillText(name, 0, 0);
      g.restore();
      return true;
    };
    if (view.zoom >= 1.6) write('Estación Temperley', X(D.station[0] + 18), Z(D.station[1]), -Math.PI / 2, 12, true);
    // Un nombre por calle, priorizando las avenidas y evitando textos encimados.
    if (!this.labels) {
      const streets = new Map();
      for (const r of D.roads) {
        if (!r.n) continue;
        if (!streets.has(r.n)) streets.set(r.n, []);
        const candidates = streets.get(r.n);
        const av = ['primary', 'secondary', 'tertiary'].includes(r.c);
        const add = (a, b) => {
          const [ax, az] = a, [bx, bz] = b;
          const l = Math.hypot(bx - ax, bz - az);
          if (l > 60) candidates.push({ l, ax, az, bx, bz, av });
        };
        for (let i = 0; i < r.p.length - 1; i++) add(r.p[i], r.p[i + 1]);
        if (r.p.length > 2) {
          const a = r.p[0], b = r.p.at(-1);
          const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
          // Unir tramos casi rectos permite rotular una avenida sin torcer su nombre.
          if (l > 0 && r.p.every(([x, z]) => Math.abs((x - a[0]) * dz - (z - a[1]) * dx) / l < 5)) add(a, b);
        }
      }
      this.labels = [...streets].map(([name, candidates]) => ({ name, candidates: candidates.sort((a, b) => Number(b.av) - Number(a.av) || b.l - a.l) }))
        .filter((r) => r.candidates.length).sort((a, b) => Number(b.candidates[0].av) - Number(a.candidates[0].av) || b.candidates[0].l - a.candidates[0].l);
    }
    for (const { name, candidates } of this.labels) for (const v of candidates) {
      if (!v.av && view.zoom < 1.6) continue;
      let angle = Math.atan2(v.bz - v.az, v.bx - v.ax);
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;
      if (write(name, X((v.ax + v.bx) / 2), Z((v.az + v.bz) / 2), angle, v.av ? 12 : 10.5, v.av, v.l * k * 0.9)) break;
    }
    if (view.zoom >= 1.6) for (const p of D.parks) {
      if (!p.n || p.c !== 'park') continue;
      const ring = p.r[0]?.[0];
      if (!ring?.length) continue;
      const xs = ring.map(([x]) => x), zs = ring.map(([, z]) => z);
      write(p.n.replace(/^Plaza /, ''), X((Math.min(...xs) + Math.max(...xs)) / 2), Z((Math.min(...zs) + Math.max(...zs)) / 2), 0, 10);
    }
    const dot = (x, z, color, r, shape) => {
      r *= ui;
      g.fillStyle = color; g.strokeStyle = MAP.ink; g.lineWidth = 1.5 * ui;
      g.beginPath();
      if (shape === 'square') g.rect(X(x) - r, Z(z) - r, r * 2, r * 2);
      else g.arc(X(x), Z(z), r, 0, Math.PI * 2);
      g.fill(); g.stroke();
    };
    if (this.route?.length > 1) {
      g.lineJoin = g.lineCap = 'round';
      g.beginPath();
      this.route.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
      g.strokeStyle = MAP.ink; g.lineWidth = 6 * ui; g.stroke();
      g.strokeStyle = MAP.route; g.lineWidth = 3.5 * ui; g.stroke();
    }
    for (const m of world.police.markers()) dot(m.x, m.z, '#3060ff', 4, 'square');
    for (const m of pickups) {
      if (PICKUP_ICON[m.kind]) drawIcon(g, PICKUP_ICON[m.kind], X(m.x), Z(m.z), 16 * ui);
      else dot(m.x, m.z, '#6ec3ea', 3);
    }
    for (const m of pois) drawIcon(g, m.kind, X(m.x), Z(m.z), poiSize(m), m.letter);
    const o = this.objective;
    if (o?.target) dot(o.target.x, o.target.z, '#ffe14a', 6);
    // Gaspi se distingue de los servicios incluso al alejar el plano.
    g.save();
    g.translate(X(player.x), Z(player.z)); g.rotate(-player.heading + Math.PI); g.scale(ui, ui);
    g.fillStyle = '#ffffff'; g.strokeStyle = MAP.ink; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 8); g.lineTo(0, 4); g.lineTo(-8, 8); g.closePath();
    g.fill(); g.stroke(); g.restore();
    // Norte y escala en metros: no se alteran con el zoom ni con el tamaño de pantalla.
    g.save(); g.scale(ui, ui);
    const C = S / ui;
    g.fillStyle = MAP.outside; g.strokeStyle = '#9ddacc'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(C - 30, 31, 18, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#fff6e7'; g.font = "800 13px 'Barlow Condensed', sans-serif";
    g.textAlign = 'center'; g.fillText('N', C - 30, 29);
    g.beginPath(); g.moveTo(C - 30, 34); g.lineTo(C - 34, 42); g.lineTo(C - 26, 42); g.fill();
    const meters = [20, 50, 100, 200, 500].find((m) => m * k / ui >= 44) ?? 500;
    const bar = meters * k / ui;
    g.fillStyle = 'rgba(13,36,44,0.88)'; g.fillRect(12, C - 44, bar + 20, 32);
    g.strokeStyle = '#fff6e7'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(22, C - 29); g.lineTo(22, C - 23); g.lineTo(22 + bar, C - 23); g.lineTo(22 + bar, C - 29); g.stroke();
    g.textAlign = 'left'; g.font = "600 11px 'Barlow Condensed', sans-serif"; g.fillStyle = '#fff6e7';
    g.fillText(`${meters} m`, 22, C - 32); g.restore();
    $('pm-obj').textContent = o?.text ?? 'Recorré Temperley y buscá una misión.';
    $('map-zoom').textContent = `${view.zoom.toFixed(1)}×`;
    $('map-minus').disabled = view.zoom <= 1;
    $('map-plus').disabled = view.zoom >= 4;
  }

  drawMinimap(world) {
    const { player, events, crime } = world;
    const g = this.mctx;
    const W = this.mini.width;
    const k = MAPK;
    const scale = player.vehicle ? 0.55 : 0.8; // px de minimapa por metro
    g.save();
    g.clearRect(0, 0, W, W);
    g.beginPath();
    g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = MAP.outside;
    g.fillRect(0, 0, W, W);
    g.translate(W / 2, W / 2);
    // "arriba" es hacia donde mira la cámara
    g.rotate(player.camYaw);
    g.scale(scale / k, scale / k);
    g.translate(-(player.x - X0) * k, -(player.z - Z0) * k);
    g.drawImage(this.baseMap, 0, 0);
    // calles inundadas (src/agua.js): el radar se tiñe de agua
    const flood = world.agua?.streetDepth ?? 0;
    if (flood > 0.03) {
      g.fillStyle = `rgba(64, 128, 190, ${Math.min(0.42, 0.12 + flood * 0.25).toFixed(3)})`;
      g.fillRect(0, 0, this.baseMap.width, this.baseMap.height);
    }
    const mark = (x, z, color, r, shape = 'dot') => {
      const px = (x - X0) * k;
      const pz = (z - Z0) * k;
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
      g.strokeStyle = MAP.route;
      g.lineWidth = (5 * k) / scale;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.beginPath();
      this.route.forEach(([x, z], i) => (i ? g.lineTo((x - X0) * k, (z - Z0) * k) : g.moveTo((x - X0) * k, (z - Z0) * k)));
      g.strokeStyle = MAP.ink;
      g.lineWidth = (7 * k) / scale;
      g.stroke();
      g.strokeStyle = MAP.route;
      g.lineWidth = (4 * k) / scale;
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
      const size = m.kind === 'mision' || m.kind === 'ovni' || m.kind === 'tanque' ? 22 : 18;
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
    // Norte geográfico, aunque el radar acompañe la cámara.
    const northRadius = W / 2 - 13;
    const nx = W / 2 + Math.sin(player.camYaw) * northRadius;
    const ny = W / 2 - Math.cos(player.camYaw) * northRadius;
    g.fillStyle = MAP.ink;
    g.beginPath(); g.arc(nx, ny, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff7e8'; g.font = "900 12px 'Barlow Condensed', sans-serif";
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', nx, ny + 0.5);
    // Gaspi: flecha en el centro
    g.save();
    g.translate(W / 2, W / 2);
    g.rotate(player.camYaw - player.heading + Math.PI);
    g.fillStyle = '#ffffff';
    g.strokeStyle = MAP.ink;
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
