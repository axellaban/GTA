// Caminos por el grafo de calles (A*): para el GPS del minimapa y los patrulleros.
const CELL = 50;

export class Nav {
  constructor(graph) {
    this.graph = graph;
    this.grid = new Map();
    for (const n of graph.nodes) {
      const k = `${Math.floor(n.x / CELL)},${Math.floor(n.z / CELL)}`;
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(n);
    }
  }
  nearestNode(x, z, minW = 6) {
    const i0 = Math.floor(x / CELL);
    const j0 = Math.floor(z / CELL);
    let best = null;
    let bd = Infinity;
    for (let r = 1; r <= 4 && !best; r++) {
      for (let a = -r; a <= r; a++) {
        for (let b = -r; b <= r; b++) {
          for (const n of this.grid.get(`${i0 + a},${j0 + b}`) || []) {
            if (!n.out.some((e) => e.street.w >= minW)) continue;
            const d = Math.hypot(n.x - x, n.z - z);
            if (d < bd) {
              bd = d;
              best = n;
            }
          }
        }
      }
    }
    return best;
  }
  // devuelve la lista de aristas desde a hasta b (A* con montículo binario)
  path(a, b, maxIter = 8000) {
    if (!a || !b) return null;
    if (a === b) return [];
    const g = new Map([[a, 0]]);
    const came = new Map();
    const closed = new Set();
    const h = (n) => Math.hypot(n.x - b.x, n.z - b.z);
    const heap = [[h(a), a]];
    const push = (item) => {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    let it = 0;
    while (heap.length && it++ < maxIter) {
      const [, cur] = pop();
      if (closed.has(cur)) continue;
      if (cur === b) {
        const out = [];
        let n = b;
        while (came.has(n)) {
          const e = came.get(n);
          out.push(e);
          n = e.from;
        }
        return out.reverse();
      }
      closed.add(cur);
      for (const e of cur.out) {
        if (closed.has(e.to)) continue;
        const ng = g.get(cur) + e.len * (e.street.w < 6 ? 3 : 1);
        if (ng < (g.get(e.to) ?? Infinity)) {
          g.set(e.to, ng);
          came.set(e.to, e);
          push([ng + h(e.to), e.to]);
        }
      }
    }
    return null;
  }
}
