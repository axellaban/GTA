# Plan de trabajo — GTA VI Conurba · Temperley

Este archivo es para que cualquier persona o IA pueda seguir el proyecto donde quedó.
Leelo entero antes de tocar código. Actualizalo cuando termines algo (marcá ✅ y anotá el commit).

## 1. Qué es

Juego de mundo abierto estilo GTA en el navegador (Vite + Three.js r170), en un recorte real de
Temperley (Lomas de Zamora, Buenos Aires) alrededor de la estación. Protagonista: Gaspi.
Se publica en Vercel desde la rama `main` (https://gta-6-conurba.vercel.app). Se juega en celu
(controles táctiles) y en compu. Todo el texto del juego y del código está en castellano rioplatense.

**Objetivo del dueño**: que se parezca lo más posible a GTA Vice City (look PS2: estelas, filtro de
color, atardecer rosa, neón, autos de los 80) y que las ~5 cuadras alrededor de la estación sean
iguales a la realidad (cada negocio en su lugar).

## 2. Reglas acordadas (no negociables)

1. **Nada con derechos de autor de terceros sin licencia**: ni modelos/texturas/sonidos sacados de
   Vice City u otros juegos (rips), ni código descompilado (re3/reVC). Aunque se pida. Si el dueño
   tiene una licencia real, que suba él los archivos al repo; recién ahí se integran.
2. **Modelos de internet: solo licencias abiertas** (CC0, CC-BY con crédito, MIT). El crédito va en
   la pausa (`index.html`, párrafo `.fine`) y en el README.
3. **Google Maps / Street View**: no se copian imágenes ni datos (sus términos lo prohíben). Sirven
   solo como referencia visual para quien carga datos a mano. Fotos propias del dueño: sí.
4. **Gráficos siempre en calidad alta**: no hay selector de calidad (lo pidió el dueño). La
   resolución dinámica y el tope de píxeles ya cuidan el rendimiento.
5. **Presupuesto para que no se cuelgue el iPhone** (Safari mata la pestaña por memoria):
   - personaje ≤ 5.000 triángulos, auto ≤ 15.000, edificio especial ≤ 10.000;
   - modelos grandes: simplificar antes de subir (ver `tools/models/`), sin Draco (los workers de
     WebAssembly suman memoria), una sola carga y clones que comparten geometría;
   - sombras solo en las piezas grandes.
   - Antecedente: la Ferrari original (359.000 triángulos con Draco) colgaba Safari (commit 1fba52d).
6. **Trabajo de a poco**: cada mejora probada y subida a `main` por separado (y a la rama de trabajo
   que se esté usando). Commits en castellano, explicando el porqué.
7. **La portada (imagen de Higgsfield) no se cambia.** El thumbnail para compartir es la portada.

## 3. Cómo está armado

Ver la tabla "Estructura" del README. Lo más importante:

- `src/main.js`: arma todo y tiene el loop (`frame`). Expone `window.__gta` (= `world`) para pruebas.
- `src/human.js` + `src/body.js`: personas hechas por código (perfiles "loft", atlas 2048² pintado
  en canvas, esqueleto propio con huesos `root, hips, spine, chest, neck, head, uaR/faR/handR,
  uaL/faL/handL, thR/shR/ftR, thL/shL/ftL`). `animateHuman(h, dt, speed, pose, t)` pone las poses
  (walk, run, jab, cross, hook, kick, swing, aim, sit, dead, press, squat, pullup, ...).
- `src/cars.js`: autos por código (Falcon, 504, Duna, Gol, Fiat 600, pickup, taxi, remís, patrullero...).
- `src/models.js`: modelos bajados (la Ferrari 458, simplificada) + `loadFerrari(color, {convertible})`.
- `src/city.js` + `src/textures.js`: ciudad desde `src/data/temperley.json` (Overture/OSM).
  Los locales (`kind === 'local'`) tienen cartel con el nombre real si Overture lo trae.
- `scripts/map/`: Python que baja Overture (`fetch.py`, incluye `places`) y arma el JSON (`preprocess.py`).
- `public/relevamiento.html`: herramienta para cargar a mano los negocios reales (ver §5).

## 4. Cómo probar (sin GPU)

El entorno de la nube no tiene placa de video: se usa Chromium con SwiftShader (lento: 1 cuadro
cada 1–6 s). Scripts en `tools/`:

```bash
npm run build && npx vite preview --port 4173 &        # servir dist/
node tools/shot.mjs shots/x '[{"name":"calle","hour":16,"play":true,"cam":{"x":-98,"y":1.8,"z":12,"lx":-108,"ly":3,"lz":-60}}]'
```

- `tools/shot.mjs`: capturas con cámara fija, hora y clima (lee `window.__gta`).
- Para probar lógica, usar `page.evaluate` sobre `window.__gta` y `page.waitForFunction` (polling).
- Ojo: el tiempo del juego corre muy lento en el emulador; no esperar segundos "reales".
- Ruta de Chromium en este entorno: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  (args: `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`).
- Red del entorno de la nube: solo GitHub y npm. kenney.nl, quaternius.com, itch.io, opengameart,
  sketchfab, overpass y Overture están bloqueados (se habilitan en la configuración del entorno:
  Editar → Acceso a la red).

## 5. Plan pendiente (en orden)

### A. Personajes, perros y autos "nivel Vice City"

La calidad de Vice City viene de modelos low-poly con buena silueta y texturas pintadas, no de
muchos polígonos. Los cuerpos por código tienen techo; el salto es usar modelos de artista con
licencia libre y animarlos con nuestro sistema.

- **A1 — Retarget** (`src/rig.js`): que `animateHuman` pueda mover cualquier esqueleto humanoide
  estándar (Mixamo / Quaternius / Mesh2Motion). Idea: se anima un "esqueleto proxy" con nuestros
  nombres de huesos y se copia la rotación en espacio mundo a los huesos reales respetando su pose
  de reposo (T_i = G_i · Wrest_i; local = T_padre⁻¹ · T_i). Las armas se cuelgan del hueso de la
  mano real. Estado: ver §6.
- **A2 — Bajar modelos CC0** (necesita red o que el dueño los suba a `public/models/`):
  - Quaternius *Universal Base Characters* + *Modular Character Outfits* (cuerpos realistas, ropa
    intercambiable), *Universal Animation Library* 1 y 2 (120+ animaciones), *Ultimate Animated
    Animal Pack* (perros, caballo). Todo CC0.
  - Autos clásicos argentinos (Falcon, 504, R12, Fiat 600, Duna) de Sketchfab con CC-BY (crédito
    obligatorio). Sketchfab pide cuenta: los baja el dueño.
- **A3 — Procesar**: `tools/models/lite.mjs` (glTF-Transform: saca UV/normales si no hay texturas,
  suelda, simplifica, sin Draco). Si hay texturas, NO sacar UV: usar `simplify` con `--error` bajo y
  achicar texturas a 512–1024 px. Normales con `toCreasedNormals` al cargar si se sacaron.
- **A4 — Integrar**: personas (vecinos, cana, chorros, Gaspi, Ciro, gym, Laban) con modelo + ropa +
  color; perros y caballo; autos con nuestra pintura, choques, fuego y chapa y pintura.
  Mantener LOD (versión liviana de lejos) y el presupuesto de §2.5.

### B. Las 5 cuadras alrededor de la estación, iguales a la realidad

Radio ≈ 550 m desde la estación (`STATION` en `src/map.js`). Hoy: 1.872 edificios, 153 locales,
155 nombres reales (de Overture `places`).

- **B1 — Base automática**: correr `scripts/map/fetch.py` con un release nuevo de Overture
  (`places` trae nombre, rubro, confianza) y sumar OSM (Overpass: `shop=*`, `amenity=*`,
  `addr:street`, `addr:housenumber`, `building:levels`). Necesita red a Overture/Overpass.
- **B2 — Relevamiento a mano** con `public/relevamiento.html` (en el sitio:
  `/relevamiento.html`): mapa de los edificios del radio; tocás uno y cargás nombre, rubro, color
  del cartel, persiana/toldo, pisos, notas y una foto propia del frente. Se guarda en el celu y se
  exporta a JSON. El JSON exportado se sube a `src/data/relevamiento.json`.
- **B3 — Construcción**: `city.js` lee `relevamiento.json` y, por cada local, arma el frente con
  piezas (vidriera, persiana, puerta, toldo, cartel con el nombre real; foto como textura si hay),
  con los pisos reales. Prioridad: la cuadra de la estación sobre Av. Meeks y el centro comercial.
- **B4 — El gym El Kaiser a su dirección real** (falta que el dueño pase calle y número; hoy está
  en un lote libre a ~70 m de la estación, ver `findLot` en `src/gym.js`).

### C. Otros pendientes

- Subirse al tren y al colectivo como pasajero.
- Interiores (kiosco, estación, el gym por dentro ya es visible desde la puerta).
- Más misiones encadenadas con historia (hoy hay 3 en `src/missions.js`).
- Policía: retenes, clavos en la calle, 6 estrellas.
- Autos que se abollan (hoy el daño no se ve hasta el fuego).

## 6. Estado (actualizar al avanzar)

- ✅ Look Vice City: filtro PS2 (estelas + color por hora), atardecer rosa, neón, destellos en
  estrella, palmeras, fachadas pastel, ropa con textura pintada, autos de los 80.
- ✅ Gameplay: misiones, changas (delivery, remís, patrullero), chapa y pintura, armería, armas
  (motosierra siempre, bastón presidencial, metra, molotov), coimas, figuritas, saltos, voces,
  radio con locutor, muerte a lo GTA.
- ✅ Gym El Kaiser con Ciro (el profe gigante que busca pelea), musculosos y chicas fit.
- ✅ Ferrari de Ciro (roja, estacionada) y Laban the Creator (Ferrari amarilla descapotable con
  tres chicas, se puede robar).
- ✅ Arreglo del cuelgue en iPhone (Ferrari simplificada, sin Draco).
- ✅ B2 página de relevamiento: `public/relevamiento.html` (en el sitio: `/relevamiento.html`), base
  generada con `node scripts/relevamiento-base.mjs` (edificios, plazas/escuelas/canchas y calles a 600 m).
  Tipos: negocio, casa, edificio, colegio, iglesia, plaza/club, otro. Falta que el dueño cargue datos.
- ⏳ A1 retarget: ver commit / notas en `src/rig.js`.
- ⛔ A2 / B1: esperan red o archivos del dueño.

## 7. Preguntas abiertas para el dueño

1. ¿Habilita en el entorno `quaternius.com`, `itch.io`, `opengameart.org`, Overture y Overpass, o
   sube él los archivos?
2. Calle y número reales del gym El Kaiser.
3. Cuando cargue el relevamiento, subir el JSON exportado (o pasarlo) para integrarlo.
