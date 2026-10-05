// Vista del mapa: coordenadas reales en metros, zoom anclado y arrastre con límites.
// El lienzo conserva su tamaño: acercar no crea texturas nuevas en el celular.
export class MapView {
  constructor(bounds, size = 1024) {
    [this.x0, this.z0, this.x1, this.z1] = bounds;
    this.size = size;
    this.baseScale = (size - 64) / Math.max(this.x1 - this.x0, this.z1 - this.z0);
    this.reset();
  }
  get scale() { return this.baseScale * this.zoom; }
  project(x, z) {
    return [this.size / 2 + (x - this.x) * this.scale, this.size / 2 + (z - this.z) * this.scale];
  }
  unproject(x, y) {
    return [this.x + (x - this.size / 2) / this.scale, this.z + (y - this.size / 2) / this.scale];
  }
  reset() {
    this.zoom = 1;
    this.x = (this.x0 + this.x1) / 2;
    this.z = (this.z0 + this.z1) / 2;
  }
  constrain() {
    const half = (this.size / 2 - 32) / this.scale;
    const axis = (v, lo, hi) => hi - lo <= half * 2 ? (lo + hi) / 2 : Math.max(lo + half, Math.min(hi - half, v));
    this.x = axis(this.x, this.x0, this.x1);
    this.z = axis(this.z, this.z0, this.z1);
  }
  zoomAt(factor, px = this.size / 2, py = this.size / 2) {
    const [x, z] = this.unproject(px, py);
    this.zoom = Math.max(1, Math.min(4, this.zoom * factor));
    this.x = x - (px - this.size / 2) / this.scale;
    this.z = z - (py - this.size / 2) / this.scale;
    this.constrain();
  }
  pan(dx, dy) {
    this.x -= dx / this.scale;
    this.z -= dy / this.scale;
    this.constrain();
  }
  focus(x, z) {
    this.zoom = 2.5;
    this.x = x;
    this.z = z;
    this.constrain();
  }
}

export function bindMapControls(canvas, view, redraw, controls) {
  const pointers = new Map();
  const position = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * view.size / r.width, (e.clientY - r.top) * view.size / r.height];
  };
  const pinch = () => {
    const [a, b] = [...pointers.values()];
    return { distance: Math.hypot(a[0] - b[0], a[1] - b[1]), x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 };
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    pointers.set(e.pointerId, position(e));
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const old = pointers.get(e.pointerId);
    const previous = pointers.size === 2 ? pinch() : null;
    const next = position(e);
    pointers.set(e.pointerId, next);
    if (previous) {
      const current = pinch();
      if (previous.distance > 8) view.zoomAt(current.distance / previous.distance, previous.x, previous.y);
      view.pan(current.x - previous.x, current.y - previous.y);
    } else if (pointers.size === 1) view.pan(next[0] - old[0], next[1] - old[1]);
    redraw();
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    if (!pointers.size) canvas.classList.remove('dragging');
  };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, end);
  const clear = () => { pointers.clear(); canvas.classList.remove('dragging'); };
  globalThis.addEventListener('blur', clear);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [x, y] = position(e);
    view.zoomAt(Math.exp(-Math.max(-200, Math.min(200, e.deltaY)) * 0.003), x, y);
    redraw();
  }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80] }[e.key];
    if (d) view.pan(...d);
    else if (e.key === '+' || e.key === '=') view.zoomAt(1.4);
    else if (e.key === '-') view.zoomAt(1 / 1.4);
    else return;
    e.preventDefault();
    e.stopPropagation();
    redraw();
  });
  controls.plus.addEventListener('click', () => { view.zoomAt(1.4); redraw(); });
  controls.minus.addEventListener('click', () => { view.zoomAt(1 / 1.4); redraw(); });
  controls.all.addEventListener('click', () => { view.reset(); redraw(); });
  controls.player.addEventListener('click', () => { const p = controls.position(); view.focus(p.x, p.z); redraw(); });
  return clear;
}
