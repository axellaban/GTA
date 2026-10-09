// Rueda de armas, como en los GTA de ahora (pedido del dueño): en la compu, mantené Tab y mové el mouse hacia
// el arma; en el celu, mantené apretado el nombre del arma (arriba a la derecha) y arrastrá. Mientras está
// abierta el tiempo va en cámara lenta. Al soltar queda el arma elegida. Un casillero por tipo de arma (los
// mismos de los números 1 a 9); si en uno tenés dos, la rueda del mouse pasa de una a la otra.
import { WEAPONS, SLOTS } from './weapons.js';

const N = SLOTS.length;

export class Rueda {
  constructor() {
    this.open = false;
    this.sel = -1;
    this.ax = 0;
    this.ay = 0;
    this.pick = {}; // qué arma de cada casillero se eligió por última vez
    this.el = null;
  }

  build() {
    const el = document.createElement('div');
    el.id = 'rueda';
    el.hidden = true;
    const ring = document.createElement('div');
    ring.className = 'r-ring';
    this.items = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const it = document.createElement('div');
      it.className = 'r-it';
      it.style.left = `${50 + Math.sin(a) * 38}%`;
      it.style.top = `${50 - Math.cos(a) * 38}%`;
      it.innerHTML = `<b></b><span></span><em>${i + 1}</em>`;
      ring.appendChild(it);
      this.items.push(it);
    }
    const c = document.createElement('div');
    c.className = 'r-c';
    c.innerHTML = '<b></b><span></span>';
    ring.appendChild(c);
    this.center = c;
    el.appendChild(ring);
    (document.getElementById('hud') || document.body).appendChild(el);
    this.el = el;
  }

  // el arma de un casillero: la que está en la mano, la última elegida o la primera que tenés
  slotWeapon(P, i) {
    const owned = SLOTS[i].filter((id) => P.inv?.[id]);
    if (!owned.length) return null;
    if (owned.includes(P.weapon)) return this.pick[i] && owned.includes(this.pick[i]) ? this.pick[i] : P.weapon;
    return this.pick[i] && owned.includes(this.pick[i]) ? this.pick[i] : owned[0];
  }

  // cada cuadro: devuelve true si está abierta (el juego va en cámara lenta y la cámara no gira)
  update(world) {
    const { input, player: P, combat } = world;
    const can = !P.dead && !P.ufo && !P.cutscene && !world.hud?.dialog;
    const want = can && (input.down('tab') || input.wheelHold);
    if (want && !this.open) {
      if (!this.el) this.build();
      this.open = true;
      this.el.hidden = false;
      this.ax = this.ay = 0;
      this.sel = -1;
      world.audio?.whoosh?.(0.12);
    }
    if (!this.open) return false;
    // la dirección: el mouse (se come el movimiento de la cámara) o el dedo desde el centro de la rueda
    if (input.wheelPos) {
      const r = this.el.firstChild.getBoundingClientRect();
      this.ax = input.wheelPos.x - (r.left + r.width / 2);
      this.ay = input.wheelPos.y - (r.top + r.height / 2);
    } else {
      this.ax += input.look.dx;
      this.ay += input.look.dy;
      const l = Math.hypot(this.ax, this.ay);
      if (l > 120) {
        this.ax *= 120 / l;
        this.ay *= 120 / l;
      }
    }
    input.look.dx = input.look.dy = 0;
    if (Math.hypot(this.ax, this.ay) > 28) {
      const a = Math.atan2(this.ax, -this.ay);
      this.sel = ((Math.round(a / ((Math.PI * 2) / N)) % N) + N) % N;
    }
    // la ruedita del mouse: la otra arma del mismo casillero
    if (this.sel >= 0 && input.wheel) {
      const owned = SLOTS[this.sel].filter((id) => P.inv?.[id]);
      if (owned.length > 1) {
        const cur = this.slotWeapon(P, this.sel);
        this.pick[this.sel] = owned[(owned.indexOf(cur) + (input.wheel > 0 ? 1 : owned.length - 1)) % owned.length];
      }
      input.wheel = 0;
    }
    // dibujar
    for (let i = 0; i < N; i++) {
      const it = this.items[i];
      const id = this.slotWeapon(P, i);
      const w = id ? WEAPONS[id] : null;
      const a = id ? P.ammo?.[id] : null;
      const name = w ? w.name : '—';
      const ammo = w?.gun ? `${(a?.mag ?? 0) + (a?.res ?? 0)}` : w?.throw ? `${a?.mag ?? 0}` : '';
      const cls = `r-it${id ? '' : ' off'}${i === this.sel ? ' sel' : ''}${id && id === P.weapon ? ' cur' : ''}`;
      if (it.className !== cls) it.className = cls;
      if (it.firstChild.textContent !== name) it.firstChild.textContent = name;
      if (it.children[1].textContent !== ammo) it.children[1].textContent = ammo;
    }
    const sid = this.sel >= 0 ? this.slotWeapon(P, this.sel) : P.weapon;
    const sw = sid ? WEAPONS[sid] : null;
    this.center.firstChild.textContent = sw ? sw.name : 'No la tenés';
    this.center.lastChild.textContent = this.sel >= 0 && SLOTS[this.sel].filter((id) => P.inv?.[id]).length > 1 ? 'Ruedita: la otra' : '';
    if (!want) {
      // al soltar: el arma elegida
      this.open = false;
      this.el.hidden = true;
      const id = this.sel >= 0 ? this.slotWeapon(P, this.sel) : null;
      if (id && id !== P.weapon) {
        P.weapon = id;
        P.attack = null;
        P.reloadT = 0;
        combat.syncHand(P);
        world.audio?.recarga?.();
      }
      input.wheelPos = null;
      return false;
    }
    return true;
  }
}
