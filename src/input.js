// Teclado, mouse (con pointer lock si el navegador lo permite) y controles táctiles.

// celular o tablet: los textos hablan de botones en vez de teclas
export const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent) && !TOUCH;
export class Input {
  constructor(canvas) {
    this.rightT = -1e9;
    this.keys = new Set();
    this.pressed = new Set(); // teclas apretadas en este frame
    this.look = { dx: 0, dy: 0 };
    this.move = { x: 0, y: 0 }; // joystick táctil
    this.touchButtons = new Set();
    this.canvas = canvas;
    this.dragging = false;
    this.locked = false;
    this.aimToggled = false;

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
    addEventListener('blur', () => this.releaseAll());

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mouseup', (e) => {
      let b = e.button;
      if (b === 0 && this.ctrlClick) b = 2;
      this.ctrlClick = false;
      this.keys.delete(`mouse${b}`);
      // un clic derecho corto (en el trackpad: tocar con dos dedos) deja la mira prendida hasta el próximo:
      // con el trackpad no se puede mantener el derecho y a la vez hacer clic para tirar. Mantenido sigue
      // apuntando solo mientras se aprieta, como en los GTA.
      if (b === 2 && performance.now() - this.rightT < 300 && !this.rightShot) this.pressed.add('aim');
      this.dragging = this.down('mouse0', 'mouse2');
    });
    canvas.addEventListener('mousedown', (e) => {
      // en la Mac, Ctrl + clic es el clic derecho
      const b = e.button === 0 && e.ctrlKey && MAC ? 2 : e.button;
      this.ctrlClick = b !== e.button;
      // (si el izquierdo se usó mientras el derecho estaba apretado, fue apuntar mantenido y tirar: al
      // soltar no deja la mira prendida)
      if (b === 2) {
        this.rightT = performance.now();
        this.rightShot = this.keys.has('mouse0');
      }
      if (b === 0 && this.keys.has('mouse2')) this.rightShot = true;
      this.pressed.add(`mouse${b}`);
      this.keys.add(`mouse${b}`);
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
    document.addEventListener('pointerlockchange', () => {
      const wasLocked = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (wasLocked && !this.locked) this.releaseAll();
    });
    this.setupTouch();
  }

  // Controles táctiles: joystick flotante en la mitad izquierda
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
    const releaseButtons = [];
    this.cancelTouch = () => {
      stickId = lookId = null;
      this.move.x = this.move.y = 0;
      this.sprint = false;
      stick.classList.remove('sprint');
      rest();
      for (const release of releaseButtons) release();
    };
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
      let finger = null;
      let bx = 0;
      let by = 0;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (held !== null) return;
        const touch = e.changedTouches[0];
        if (!touch) return;
        finger = touch.identifier;
        bx = touch.clientX;
        by = touch.clientY;
        held = b.dataset.btn;
        this.pressed.add(held);
        this.touchButtons.add(held);
        b.classList.add('down');
      });
      b.addEventListener('touchmove', (e) => {
        if (held !== 'attack') return;
        const touch = [...e.changedTouches].find((t) => t.identifier === finger);
        if (!touch) return;
        e.preventDefault();
        this.look.dx += (touch.clientX - bx) * 1.6;
        this.look.dy += (touch.clientY - by) * 1.6;
        bx = touch.clientX;
        by = touch.clientY;
      }, { passive: false });
      const release = () => {
        if (held) this.touchButtons.delete(held);
        held = null;
        finger = null;
        b.classList.remove('down');
      };
      const up = (e) => {
        if ([...e.changedTouches].some((t) => t.identifier === finger)) release();
      };
      releaseButtons.push(release);
      b.addEventListener('touchend', up);
      b.addEventListener('touchcancel', up);
      b.addEventListener('mousedown', (e) => { if (e.button === 0) this.pressed.add(b.dataset.btn); });
    }
    // tocar el arma la cambia; mantenerla abre la rueda de armas (src/rueda.js) y se elige arrastrando
    const wn = document.getElementById('w-name');
    if (wn) {
      let timer = null;
      let fid = null;
      wn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const t = e.changedTouches[0];
        fid = t.identifier;
        this.wheelPos = null;
        timer = setTimeout(() => {
          timer = null;
          this.wheelHold = true;
        }, 300);
      });
      wn.addEventListener('touchmove', (e) => {
        const t = [...e.changedTouches].find((o) => o.identifier === fid);
        if (!t || !this.wheelHold) return;
        e.preventDefault();
        this.wheelPos = { x: t.clientX, y: t.clientY };
      }, { passive: false });
      const end = (e) => {
        if (![...e.changedTouches].some((o) => o.identifier === fid)) return;
        if (timer) {
          clearTimeout(timer);
          timer = null;
          this.pressed.add('weapon');
        }
        this.wheelHold = false;
        fid = null;
      };
      wn.addEventListener('touchend', end);
      wn.addEventListener('touchcancel', end);
    }
    // tocar las balas recarga; el menú pausa (como en GTA mobile)
    const tap = (id, key) =>
      document.getElementById(id)?.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.pressed.add(key);
      });
    tap('w-ammo', 'r');
    tap('btn-menu', 'p');
    document.getElementById('btn-menu')?.addEventListener('click', () => this.pressed.add('p'));
  }

  releaseAll() {
    this.keys.clear();
    this.pressed.clear();
    this.touchButtons.clear();
    this.aimToggled = false;
    this.wheelHold = false;
    this.dragging = false;
    this.look.dx = this.look.dy = this.wheel = 0;
    this.move.x = this.move.y = 0;
    this.sprint = false;
    this.cancelTouch?.();
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
