// Teclado, mouse (con pointer lock si el navegador lo permite) y controles táctiles.
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
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.pressed.add('mouse0');
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
    document.addEventListener('pointerlockchange', () => (this.locked = document.pointerLockElement === canvas));
    this.setupTouch();
  }

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
    const R = 50;
    const onStart = (e) => {
      for (const t of e.changedTouches) {
        const target = t.target;
        if (target.closest && target.closest('[data-btn]')) continue;
        if (target.closest && target.closest('#dialog')) continue;
        if (t.clientX < innerWidth * 0.45 && stickId === null) {
          stickId = t.identifier;
          cx = t.clientX;
          cy = t.clientY;
          stick.style.left = `${cx - 60}px`;
          stick.style.top = `${cy - 60}px`;
          stick.hidden = false;
        } else if (lookId === null) {
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
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
        } else if (t.identifier === lookId) {
          this.look.dx += (t.clientX - lx) * 1.6;
          this.look.dy += (t.clientY - ly) * 1.6;
          lx = t.clientX;
          ly = t.clientY;
        }
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          stickId = null;
          this.move.x = this.move.y = 0;
          knob.style.transform = '';
          stick.hidden = true;
        }
        if (t.identifier === lookId) lookId = null;
      }
    };
    addEventListener('touchstart', onStart, { passive: true });
    addEventListener('touchmove', onMove, { passive: false });
    addEventListener('touchend', onEnd);
    addEventListener('touchcancel', onEnd);
    for (const b of document.querySelectorAll('[data-btn]')) {
      const key = b.dataset.btn;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.pressed.add(key);
        this.touchButtons.add(key);
      });
      b.addEventListener('touchend', () => this.touchButtons.delete(key));
      b.addEventListener('mousedown', () => this.pressed.add(key));
    }
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
  }
}
