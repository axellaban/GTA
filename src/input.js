// Teclado, mouse (con pointer lock si el navegador lo permite) y controles táctiles.

// celular o tablet: los textos hablan de botones en vez de teclas
export const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // teclas apretadas en este frame
    this.look = { dx: 0, dy: 0 };
    this.move = { x: 0, y: 0 }; // joystick táctil
    this.touchButtons = new Set();
    this.canvas = canvas;
    this.dragging = false;
    this.locked = false;

    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.key.toLowerCase();
      // últimas letras tecleadas (para los trucos, como en los GTA de antes)
      if (k.length === 1 && /[a-zñ]/.test(k)) this.typed = ((this.typed || '') + k).slice(-16);
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mouseup', (e) => this.keys.delete(`mouse${e.button}`));
    canvas.addEventListener('mousedown', (e) => {
      this.pressed.add(`mouse${e.button}`);
      this.keys.add(`mouse${e.button}`);
      this.dragging = true;
      if (!this.locked && this.wantLock && canvas.requestPointerLock) {
        try {
          const p = canvas.requestPointerLock();
          if (p && p.catch) p.catch(() => {});
        } catch {
          /* sin pointer lock: se usa arrastre */
        }
      }
    });
    addEventListener('mouseup', () => (this.dragging = false));
    addEventListener('mousemove', (e) => {
      if (this.locked || this.dragging) {
        this.look.dx += e.movementX || 0;
        this.look.dy += e.movementY || 0;
      }
    });
    this.wheel = 0;
    canvas.addEventListener('wheel', (e) => {
      this.wheel += e.deltaY;
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => (this.locked = document.pointerLockElement === canvas));
    this.setupTouch();
  }

  // Controles táctiles como en GTA mobile y Fortnite: joystick flotante en la mitad izquierda
  // (a fondo corre solo), arrastrar en la derecha para mirar y botones que cambian según el caso.
  setupTouch() {
    const stick = document.getElementById('stick');
    const knob = document.getElementById('knob');
    if (!stick) return;
    let stickId = null;
    let cx = 0;
    let cy = 0;
    let lookId = null;
    let lx = 0;
    let ly = 0;
    const R = 52;
    this.sprint = false;
    // el joystick queda dibujado en su lugar de siempre para que se sepa dónde está
    const rest = () => {
      stick.classList.add('rest');
      stick.style.left = '';
      stick.style.top = '';
      knob.style.transform = '';
    };
    rest();
    const ui = (el) => el.closest && el.closest('button, [data-btn], #dialog, #minimap, #weapon, #pausemap, #start, #install, #wasted');
    const onStart = (e) => {
      for (const t of e.changedTouches) {
        if (ui(t.target)) continue;
        if (t.clientX < innerWidth * 0.45 && stickId === null) {
          stickId = t.identifier;
          cx = t.clientX;
          cy = t.clientY;
          stick.classList.remove('rest');
          stick.style.left = `${cx - 64}px`;
          stick.style.top = `${cy - 64}px`;
        } else if (lookId === null && t.clientX >= innerWidth * 0.45) {
          lookId = t.identifier;
          lx = t.clientX;
          ly = t.clientY;
        }
      }
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          let dx = t.clientX - cx;
          let dy = t.clientY - cy;
          const d = Math.hypot(dx, dy);
          if (d > R) {
            dx = (dx / d) * R;
            dy = (dy / d) * R;
          }
          this.move.x = dx / R;
          this.move.y = dy / R;
          this.sprint = d >= R * 0.92;
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          stick.classList.toggle('sprint', this.sprint);
        } else if (t.identifier === lookId) {
          this.look.dx += (t.clientX - lx) * 1.6;
          this.look.dy += (t.clientY - ly) * 1.6;
          lx = t.clientX;
          ly = t.clientY;
        }
      }
      if (stickId !== null || lookId !== null) e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          stickId = null;
          this.move.x = this.move.y = 0;
          this.sprint = false;
          stick.classList.remove('sprint');
          rest();
        }
        if (t.identifier === lookId) lookId = null;
      }
    };
    addEventListener('touchstart', onStart, { passive: true });
    addEventListener('touchmove', onMove, { passive: false });
    addEventListener('touchend', onEnd);
    addEventListener('touchcancel', onEnd);
    // botones: la tecla se lee al tocar (el botón contextual cambia entre E y F)
    for (const b of document.querySelectorAll('[data-btn]')) {
      let held = null;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        held = b.dataset.btn;
        this.pressed.add(held);
        this.touchButtons.add(held);
        b.classList.add('down');
      });
      const up = () => {
        if (held) this.touchButtons.delete(held);
        held = null;
        b.classList.remove('down');
      };
      b.addEventListener('touchend', up);
      b.addEventListener('touchcancel', up);
      b.addEventListener('mousedown', () => this.pressed.add(b.dataset.btn));
    }
    // tocar el arma la cambia; tocar las balas recarga; el menú pausa (como en GTA mobile)
    const tap = (id, key) =>
      document.getElementById(id)?.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.pressed.add(key);
      });
    tap('w-name', 'weapon');
    tap('w-ammo', 'r');
    tap('btn-menu', 'p');
    document.getElementById('btn-menu')?.addEventListener('click', () => this.pressed.add('p'));
  }

  down(...ks) {
    return ks.some((k) => this.keys.has(k) || this.touchButtons.has(k));
  }
  hit(...ks) {
    return ks.some((k) => this.pressed.has(k));
  }
  axis() {
    let x = (this.down('d', 'arrowright') ? 1 : 0) - (this.down('a', 'arrowleft') ? 1 : 0);
    let y = (this.down('s', 'arrowdown') ? 1 : 0) - (this.down('w', 'arrowup') ? 1 : 0);
    if (this.move.x || this.move.y) {
      x = this.move.x;
      y = this.move.y;
    }
    return { x, y };
  }
  endFrame() {
    this.pressed.clear();
    this.look.dx = 0;
    this.look.dy = 0;
    this.wheel = 0;
  }
}
