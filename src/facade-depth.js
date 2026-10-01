// Sombras pintadas en el atlas: dan espesor a las aberturas sin sumar geometría
// ni pasadas de render. También atenúan la emisión para que no desaparezcan de noche.
export function paintFacadeDepth(ctx, emissive, x, y, width, height, openings) {
  for (const o of openings) {
    if (!['window', 'shop', 'door', 'garage'].includes(o.kind)) continue;
    const left = x + o.x0 * width;
    const top = y + o.y0 * height;
    const w = (o.x1 - o.x0) * width;
    const h = (o.y1 - o.y0) * height;
    if (w <= 0 || h <= 0) continue;
    const depth = Math.min(5, w * 0.12, h * 0.16);
    for (const target of [ctx, emissive].filter(Boolean)) {
      target.save();
      target.beginPath();
      target.rect(left, top, w, h);
      target.clip();
      // Dintel: sombra más profunda arriba; jambas: oclusión suave a ambos lados.
      for (const [ax, ay, bx, by, opacity] of [
        [left, top, left, top + depth * 1.6, 0.52],
        [left, top, left + depth, top, 0.32],
        [left + w, top, left + w - depth, top, 0.32],
        [left, top + h, left, top + h - depth * 0.5, 0.18],
      ]) {
        const g = target.createLinearGradient(ax, ay, bx, by);
        g.addColorStop(0, `rgba(0,0,0,${opacity})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        target.fillStyle = g;
        target.fillRect(left, top, w, h);
      }
      target.restore();
    }
  }
}
