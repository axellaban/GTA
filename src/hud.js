// HUD: tarjeta SUBE, plata, reloj, minimapa, zócalo, diálogos, globos y carteles.
import * as THREE from 'three';
import { HALF, STREETS, TRACKS, ISLANDS, PLATFORM, nearestStreetName } from './map.js';
import gaspiUrl from './gaspi.webp';

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
  }

  show() {
    this.root.hidden = false;
  }

  // ---------- Estado ----------
  update(dt, world) {
    const { player, time } = world;
    $('health').style.width = `${Math.max(0, player.health)}%`;
    $('health').style.backgroundColor = player.health < 35 ? 'var(--alerta)' : player.health < 65 ? 'var(--sodio)' : 'var(--pasto)';
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
    $('street').textContent = nearestStreetName(player.x, player.z);

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
    const S = 1024;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const k = S / (HALF * 2);
    const X = (x) => (x + HALF) * k;
    g.fillStyle = '#3a4234';
    g.fillRect(0, 0, S, S);
    // manzanas
    g.fillStyle = '#5b5f55';
    g.fillRect(0, 0, S, S);
    // playa de vías
    g.fillStyle = '#4b453e';
    g.fillRect(X(-73), 0, 146 * k, (HALF + 175) * k);
    // calles
    for (const s of STREETS) {
      g.fillStyle = s.avenue ? '#e9e2d0' : '#bdb7a8';
      if (s.axis === 'ns') g.fillRect(X(s.c - s.w / 2), X(s.a), s.w * k, (s.b - s.a) * k);
      else g.fillRect(X(s.a), X(s.c - s.w / 2), (s.b - s.a) * k, s.w * k);
    }
    // vías
    g.strokeStyle = '#1d1b19';
    g.lineWidth = 1.4;
    for (const t of TRACKS) {
      g.beginPath();
      t.forEach(([x, z], i) => (i ? g.lineTo(X(x), X(z)) : g.moveTo(X(x), X(z))));
      g.stroke();
    }
    // andenes y estación
    g.fillStyle = '#d9d2c3';
    for (const x of ISLANDS) g.fillRect(X(x - 3), X(PLATFORM.z0), 6 * k, (PLATFORM.z1 - PLATFORM.z0) * k);
    g.fillStyle = '#a3563b';
    g.fillRect(X(-69), X(-32), 12 * k, 64 * k);
    return c;
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
    for (const m of events.markers()) mark(m.x, m.z, m.kind === 'corte' ? '#ff7a1a' : '#ffb23e', 6, 'square');
    for (const m of crime.markers()) mark(m.x, m.z, m.kind === 'moto' ? '#e5484d' : '#6ec3ea', 5);
    const o = this.objective;
    if (o?.target) mark(o.target.x, o.target.z, '#ffe14a', 6);
    g.restore();
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
