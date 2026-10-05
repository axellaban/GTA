// Las medidas para los impactos y el apuntado salen del tamaño del personaje.
// Ciro conserva su cuerpo gigante también mientras carga su modelo de artista.
export function npcBody(n) {
  const fullHeight = n.h?.height ?? n.bodyHeight ?? 1.8;
  const scale = fullHeight / 1.8;
  const height = n.down ? 0.45 * scale : n.state === 'cower' || n.state === 'sit' ? 1.1 * scale : fullHeight;
  return {
    height,
    radius: n.down ? Math.max(0.6, n.r ?? 0) : Math.max(0.36, n.r ?? 0),
    aimHeight: height * (1.25 / 1.8),
  };
}
