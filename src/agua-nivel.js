// El nivel de la inundación (sin three ni el mapa, para poder probarlo con node --test):
// un solo nivel para todo el mapa (el agua busca su nivel) que sube con la lluvia y baja por los desagües.
// ---------- El nivel del agua ----------
const FONDO = -5.38; // el fondo del bajo nivel (la calzada más honda del mapa)
const SECO = -6; // sin agua
const CALLE = 0.02; // la calzada
// cuánto "cuesta" subir un metro según dónde está el agua: el bajo nivel es angosto (se llena rápido),
// las calles son la mitad del mapa y desde las veredas para arriba está todo
function area(L) {
  if (L < CALLE - 0.01) return 0.035;
  if (L < 0.15) return 0.55;
  return 1;
}
// lo que llueve (m/s sobre todo el mapa) y lo que tragan los desagües
const LLUVIA = 0.0098;
const DESAGUE = 0.0012;
const DESBORDE = 0.0046; // con agua en la calle se escurre más rápido (más altura, más salida)

// Un paso del nivel: el agua entra con la lluvia (más que proporcional: la tormenta desborda los
// desagües) y sale por los desagües (más rápido cuanto más alta está). El bajo nivel tiene bombas.
export function stepLevel(level, rain, dt, diluvio = false) {
  const into = LLUVIA * rain * rain * (diluvio ? 3.5 : 1);
  const out = DESAGUE + DESBORDE * Math.max(0, level - CALLE);
  const net = into - (level < CALLE - 0.01 ? out * 0.6 : out);
  if (level <= SECO + 0.01 && net <= 0) return SECO;
  const L = level + (net / area(level)) * dt;
  if (L < FONDO) return net > 0 ? FONDO : SECO;
  return L;
}
export const LEVELS = { SECO, FONDO, CALLE };

export const NADAR = 1.12; // desde esta profundidad Gaspi (1,82 m) ya no hace pie: nada
export const VADEO = 0.22; // desde acá el agua frena al caminar

