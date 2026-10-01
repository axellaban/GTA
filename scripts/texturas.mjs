// Baja texturas de foto CC0 para calles y veredas a public/textures/ (las usa usePhoto en src/textures.js).
// Fuente: la API pública de Poly Haven (https://api.polyhaven.com, todo CC0). Para cada nombre del juego
// busca una textura de esa categoría y baja la de 1K: color, normal (GL) y rugosidad.
// Uso: node scripts/texturas.mjs            (reproduce la selección verificada)
//      node scripts/texturas.mjs asfalto=asphalt_02 vereda=...   (fijar cuál)
// Necesita red hacia api.polyhaven.com y dl.polyhaven.org (en la nube: habilitarlas en Network access).
// Escalas verificadas: asfalto 3 m; baldosas 1,8 m (dimensiones de Poly Haven).
import { mkdir, writeFile } from 'node:fs/promises';

const WANT = {
  asfalto: { fixed: 'asphalt_02' },
  vereda: { fixed: 'concrete_pavement' },
};
for (const a of process.argv.slice(2)) {
  const [k, v] = a.split('=');
  if (WANT[k]) WANT[k].fixed = v;
}
const get = async (u) => {
  const r = await fetch(u, { headers: { 'User-Agent': 'gta-conurba-texturas' }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r;
};
await mkdir('public/textures', { recursive: true });
const got = [];
const all = await (await get('https://api.polyhaven.com/assets?t=textures')).json();
for (const [name, w] of Object.entries(WANT)) {
  const id = w.fixed;
  if (!all[id]) throw new Error(`Textura desconocida: ${id}`);
  const files = await (await get(`https://api.polyhaven.com/files/${id}`)).json();
  for (const [map, key] of [['color', 'Diffuse'], ['normal', 'nor_gl'], ['rough', 'Rough']]) {
    const url = files[key]?.['1k']?.jpg?.url;
    if (!url) throw new Error(`${id}: falta ${key} JPG 1K`);
    const buf = Buffer.from(await (await get(url)).arrayBuffer());
    await writeFile(`public/textures/${name}_${map}.jpg`, buf);
    got.push(`${name}_${map}.jpg`);
    console.log(`${name}_${map}.jpg  <- ${id} (${Math.round(buf.length / 1024)} KB)`);
  }
  console.log(`  crédito: "${all[id].name}" de Poly Haven (CC0): https://polyhaven.com/a/${id}`);
}
// el juego solo pide las que están en la lista
await writeFile('public/textures/list.json', JSON.stringify(got));
