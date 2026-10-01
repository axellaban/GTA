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
- `src/models.js`: modelos bajados (Car Kit de Kenney, CC0). La Ferrari se sacó (licencia sin
  confirmar): ahora es el **Ferrucho**, deportivo propio hecho por código (`makeFerrucho` en `src/cars.js`).
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
- Red del entorno de la nube: GitHub, npm y Overture (S3, `scripts/map/ov.py` lee por rangos HTTP).
  Bloqueados: overpass-api.de, nominatim.openstreetmap.org, quaternius.com, kenney.nl, poly.pizza,
  opengameart.org, itch.io, sketchfab, ambientcg.com, polyhaven.com (se habilitan en la configuración
  del entorno: menú del entorno en la barra de la sesión → Editar → Acceso a la red).

## 5. Hoja de ruta para terminar todo (en orden; cualquiera la puede seguir)

Marcas: ⬜ pendiente · 🔶 en curso · ✅ hecho (anotar commit). Cada ítem se prueba sin GPU (§4) y se
sube a `main` apenas anda, así si se corta la sesión otra IA sigue desde acá.

**R1 — Lo que reportó el dueño desde el celu (prioridad máxima)**
- ⬜ Luces demasiado fuertes en el celu: bajar el bloom de noche/atardecer (`setMood` en
  `src/post.js`), el brillo de los neones, los halos de faroles y faros (`src/glow.js`) y el fuego de
  los cortes (`src/events.js`).
- ⬜ Piqueteros y marcha: que se les pueda pegar, tirar y pisar con el auto (hoy son `ev.people`, fuera
  de `npcs.list`); el cartel se cae si lo chocan; un auto rápido rompe el corte (y suma estrellas).

**R2 — Gym El Kaiser en su dirección real: Rivadavia 321** (confirmada en el Instagram/Facebook
oficiales). Punto ≈ (414, 10), vereda impar. En `src/gym.js` está `ADDRESS` + `findAddressLot`, pero
ahí no hay lote libre: hay que reservar el lote en `src/map.js` (antes de armar la ciudad), que
`city.js` no levante los edificios que lo pisan y poner el gym ahí.

**R3 — Misiones con lo nuevo**: el marciano (llevarle panchos / devolverle la nave), destrucción con
bazuca (desarmadero del Turco), persecución del OVNI con la cana.

**R4 — Policía más dura**: gendarmes con ametralladora a 5–6 estrellas; helicóptero que sigue a Gaspi
(y al OVNI robado).

**R5 — Más destrucción**: semáforos y carteles que se caen (copiar `src/smash.js`); capó que se levanta
con mucho daño; el tránsito esquiva el OVNI estacionado y los postes caídos.

**R6 — Lugares**: lavadero de autos (cambia color y saca estrellas, como chapa y pintura), bar y
pizzería con interior (`src/interiors.js`).

**R7 — Guardado**: que el guardado incluya metra, bazuca, munición y estadísticas nuevas.

**R8 — Look**: reflejos de neón en los charcos; suavizar la mancha de luna; fachadas con rejas y foto
del relevamiento.

**R9 — Mapa real (B1)**: enriquecer nombres y rubros con Overture `places` (alcanzable); sumar OSM
cuando se habilite Overpass; integrar el relevamiento del dueño cuando lo cargue.

**R10 — Modelos de artista (A2)**: personajes y animales Quaternius CC0 cuando se habilite la red.

**R11 — Pruebas en celu real**: el dueño prueba en iPhone/Android y manda capturas; se ajusta.

## 5b. Detalle por área (historia y notas técnicas)

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
- **B3a — Importación (hecho)**: `src/map.js` lee `src/data/relevamiento.json` y pisa nombre, tipo,
  pisos y colores del cartel (`SIGN_COLORS_REAL`); los carteles ya no tienen tope de 104 nombres
  (atlas de hasta 256). Guarda el resto en `b.rel` (fachada, persiana, toldo, rejas, rubro).
- **B3b — Fachadas (hecho)**: `city.js` usa `b.rel`: color de fachada (tiñe el frente y la cornisa),
  toldo solo si está marcado, caja de persiana; si un local no tenía frente, elige la pared que da a
  la calle. Falta: rejas, foto como textura, puerta/vidriera según datos.
- **B3 — Construcción (resto)**: por cada local, arma el frente con
  piezas (vidriera, persiana, puerta, toldo, cartel con el nombre real; foto como textura si hay),
  con los pisos reales. Prioridad: la cuadra de la estación sobre Av. Meeks y el centro comercial.
- **B4 — El gym El Kaiser a su dirección real**: Rivadavia 321 (ver R2). Hoy sigue en un lote libre a
  ~70 m de la estación (`findLot` en `src/gym.js`).

### A5. Vehículos de artista (✅ ambulancia y autobomba integradas en `src/rescue.js`)

- `github.com/pmndrs/market-assets` (`files/models/<nombre>/model.gltf` + `info.json`): el **Car Kit
  de Kenney (CC0)**: `ambulance`, `firetruck`, `garbage-truck`, `delivery-truck`, `police-car`,
  `taxi`, `sedan`, `sports-sedan`, `van`, `truck`, `race-car`; también palmeras (`palm-*`). Los de
  "creativetrio" (`citroen-old-van`, `ice-cream-truck`) tienen licencia sin confirmar: no usar.
  Estilo juguete (colores planos): no reemplazan a nuestros clásicos; sirven para **ambulancia y
  bomberos** → changas de paramédico y bombero como en Vice City (copiar el patrón de `updateFare`
  en `src/main.js`). Clonar con `git clone --depth 1 --filter=blob:none --no-checkout` y
  `git checkout HEAD -- files/models/<nombre>`.

### C. Otros pendientes

- ✅ Colectivos con las líneas reales de Temperley (`BUS_LINES` en `src/vehicles.js`: 160, 74, 548, 549, 318, 266, 278).
- ✅ Picadas (`src/races.js`): largada en la avenida más larga, recorrido por `nav.path`, aros cada ~120 m,
  rivales con frenada en curvas, destrabe y ritmo que se ajusta a Gaspi. Ideas: más largadas, apuestas.

- ✅ Subirse al tren y al colectivo como pasajero (`src/transit.js`; el colectivo frena en las paradas: `busStops` en `src/traffic.js`).
- ✅ Interiores a lo GTA clásico (`src/interiors.js`): hall de la estación y el kiosco más cercano, armados
  fuera del mapa (x≈1500) con fundido al entrar; `focus()` mantiene la calle viva alrededor de la puerta.
  Para sumar otro: un `build...` con su `doors.push({ outside, inside, label, exit })`.
- ✅ Más misiones encadenadas: hay 6 en `src/missions.js` (`DEFS`; se prueban sin el llamado con
  `world.missions.defs`, `offer` y `begin()`).
- ✅ Policía: retenes (`roadblock` en `src/police.js`) con tira de clavos (`addSpikes`/`updateSpikes`) y 6 estrellas con Gendarmería.
- ✅ Autos que se abollan (`dentCar`/`repairCar` en `src/cars.js`; punto del golpe en `damageVehicle`).

### D. Rondas "nivel Vice City" (movimiento, armas, autos, efectos)

Hecho (cada ronda probada sin GPU y subida a `main`):
- ✅ Gaspi: inercia al arrancar y frenar, inclinación en curvas, cabeza que sigue a la cámara, piernas
  recogidas en el aire y amortiguación al caer (`walk`/`naturalize` en `src/player.js`); pasitos al
  girar en el lugar, agitado después de correr (`fatigue`) y gestos quieto (`fidget`: reloj,
  corbata, cuello). El ritmo del paso de todos (`poseHuman` en `src/human.js`) está medido para que
  el pie apoyado no patine (<6 % a cualquier velocidad; antes 60–80 % corriendo).
- ✅ Radio ochentosa original: Flash Conurbano 89.3 (`synth` en `src/radio.js`). Nada de temas de GTA
  (regla 1).
- ✅ Armas: casquillos que rebotan (`fx.casing`), recarga animada (pose `reload`), retroceso en la
  mira, agujeros de bala en paredes y veredas (`fx.bulletHole`; la traza usa `colliders.blockedHit`
  para saber la normal) y astillas (`fx.chips`).
- ✅ Autos: la carrocería va en `userData.chassis` sobre una suspensión (`Vehicle.suspend` en
  `src/traffic.js`: cabeceo, rolido, rebote, `kick` en los choques, `settle` al bajarse); luces de
  freno (`tailMat`/`brakeMat` en `src/cars.js`); escape, petardeo y rocío con la calle mojada
  (`src/carfx.js`); pedazos de chapa y vidrio en los choques (`fx.debris`).
- ✅ Gente: arrancan y frenan de a poco, se esquivan entre ellos y a Gaspi (`avoidance`), se paran en
  las esquinas, miran a Gaspi cuando pasa cerca (`lifeLook`; `animateHuman` acepta un `post`).
- ✅ Lluvia: salpicaduras en el piso alrededor de la cámara (`fx.setRain`).
- Rendimiento medido: los sistemas de CPU suman ~2,5 ms por frame, igual que antes de estas rondas.

- ✅ Puerta del conductor que se abre al subir y bajar, con portazo (`openDoor`/`swingDoor` en
  `src/traffic.js`, pieza en `buildModel` de `src/cars.js`); paragolpes que se cae con golpes
  acumulados (`dropBumper` + `fx.part`). Gaspi se agacha y se mete al asiento (fase `enter` de
  `updateJack`) y sale por la puerta (`exitAnim`/`updateExit`, `duck` en `src/player.js`).

- ✅ Grupitos charlando (`spawnGroup`/`updateGroups` en `src/npcs.js`, poses `talk`/`listen` en
  `src/human.js`): se turnan para hablar, con tiros se dispersan y al rato se despiden.

- ✅ Noche mojada: faros y luces de freno reflejados como rayas en el asfalto (`updateStreaks` en
  `src/glow.js`); el reflejo de los faroles ya no hace bandas (muestras con jitter en `src/detail.js`).

- ✅ Ametralladora y bazuca (`src/weapons.js`; cohetes en `fireRocket`/`updateRockets`/`rocketHit` de
  `src/combat.js`; truco FIERROS en `checkCheats` de `src/main.js`).
- ✅ Explosiones: `fx.explosion` (bola de fuego, onda, brasas, escombros con humo, quemadura `fx.burn`);
  autos que vuelan (`blastStep`, `v.tilt` en `Vehicle.sync`), piezas sueltas (`flyParts`), empujón
  (`shoveStep`) y cadena de fuego en `explode`; gente que vuela (`flyStep` en `src/npcs.js`).

- ✅ Choques: trompo por golpe descentrado (`v.spin` en `drive`), chispas al raspar, el otro auto
  empujado y girando, postes de luz que se voltean y se apagan (`src/smash.js`, colisionadores
  `lamp` en `addLamps`).

- ✅ Plato volador (`src/ufo.js`): llega cada 7–10 min (la primera a los 2,5) al lado del carrito
  de panchos; el marciano (`makeAlien`, cara `alien` con celda propia en el atlas, pose `eat`) compra y
  come; se roba con F mientras come; vuelo relativo a la cámara, rayo (`shoot`, usa `combat.trace`, que
  ahora deja pasar tiros por encima de las paredes) y tractor (`tractor`/`updateHeld`/`dropAll`: los autos
  caen con `blastStep` y `b.drop`, la gente con `fly.land`). Botones táctiles `on-ufo`. Truco OVNI.

Ideas para seguir: capó que se levanta con mucho daño; semáforos y carteles que se caen; reacción al ver un auto que se acerca rápido
(ya se tiran a un costado); reflejos de luces en los charcos de noche más marcados.

## 6. Estado (actualizar al avanzar)

- ✅ Look Vice City: filtro PS2 (estelas + color por hora), atardecer rosa, neón, destellos en
  estrella, palmeras, fachadas pastel, ropa con textura pintada, autos de los 80.
- ✅ Gameplay: misiones, changas (delivery, remís, patrullero), chapa y pintura, armería, armas
  (motosierra siempre, bastón presidencial, metra, molotov), coimas, figuritas, saltos, voces,
  radio con locutor, muerte a lo GTA.
- ✅ Gym El Kaiser con Ciro (el profe gigante que busca pelea), musculosos y chicas fit.
- ✅ Ferrucho de Ciro (rojo, estacionado en el gym) y Laban the Creator (Ferrucho amarillo
  descapotable con tres chicas, se puede robar). Nombre del juego: **GTA VI Conurba**.
- ✅ Arreglo del cuelgue en iPhone (sin modelos pesados ni Draco).
- ✅ Íconos a lo GTA en el minimapa y el mapa de pausa (`src/icons.js`, leyenda en la pausa).
- ✅ B2 página de relevamiento: `public/relevamiento.html` (en el sitio: `/relevamiento.html`), base
  generada con `node scripts/relevamiento-base.mjs` (edificios, plazas/escuelas/canchas y calles a 600 m).
  Tipos: negocio, casa, edificio, colegio, iglesia, plaza/club, otro. Falta que el dueño cargue datos.
- ✅ A1 retarget: `src/rig.js` → `rigHuman(gltf.scene, { height, female })` devuelve un `h` que
  `animateHuman` mueve igual que a los nuestros (probado con Xbot y Michelle de three.js: caminar,
  piñas, sentarse, sentadilla, muerto). La mano real para colgar armas: `h.rig.map.handR`.
  Prueba: `tools/rigtest.html`.
- ✅ A2/A4 (primer paso) personas CC0: `src/people.js` carga 11 modelos de elbolilloduro (CC0, vía
  Mesh2Motion: github.com/scottpetrovic/mesh2motion-app, `static/models-variation/human`) en
  `public/models/people/`. Vecinos (75 %) y cana (85 %) los usan; armas en la mano vía el esqueleto
  fantasma. Falta: motochorros (`crime.js`), gym, Laban, Gaspi; más variedad (tintes por material);
  ✅ perros: `dog.glb` (CC0) + animaciones del zorro recortadas (`public/models/animals/quadruped-anims.glb`,
  `tools/models/anims.mjs`), con AnimationMixer (`makeAnimal`/`animalPlay` en `src/people.js`). ✅ caballo del
  carro (`horse.glb`, mismo esqueleto y animaciones; reemplazo en `Vehicle.sync`, `src/traffic.js`);
  en Mesh2Motion hay más modelos (killer_*, hazmat_*, swat) y otros con CC-BY/CC-SA (no usados).
- ⛔ A2 / B1: esperan red o archivos del dueño.

## 6b. Última sesión (para quien siga)

Hecho y subido a `main` (cada cosa probada en Chromium sin GPU): PLAN.md y tools/, página de
relevamiento + importación al juego (nombres, tipos, pisos, colores de cartel y fachada, toldo,
persiana), retarget `src/rig.js`, vecinos y cana con modelos CC0 (`src/people.js`), perros y caballo
CC0 con animaciones, autos que se abollan (`dentCar`), changas de paramédico y bombero
(`src/rescue.js`, ambulancia y autobomba de Kenney CC0), 6 estrellas + retenes + Gendarmería.

**Próximos pasos sugeridos, en orden** (ninguno necesita al dueño):
1. ✅ Motochorros con `makePerson('male')` y casco (`wearHelmet` en `src/crime.js`, colgado del hueso
   `head` del fantasma y calzado a la altura real de la cabeza). Al voltearlos se levantan los mismos
   personajes (`spawnWalker(..., human)` en `src/npcs.js`).
2. ✅ Más variedad: cada vecino con modelo CC0 tiene la ropa de otro tono (`tintClothes` en
   `src/people.js`: gira el tono de lo saturado que no es piel, un material por persona y un solo
   programa). Los gendarmes (6 estrellas) bajan con el modelo `swat_male` (CC0, pasamontañas).
   Del resto de Mesh2Motion: `male`/`female` de Quaternius son maniquíes sin cara, `zombie` de Kenney
   es caricatura y `killer_*`/`monster*`/`hazmat_*` son de terror: no sirven para la calle.
3. ✅ Clavos en los retenes: `addSpikes`/`updateSpikes` en `src/police.js` (la tira va del lado por donde
   llega Gaspi; pisarla pone `v.flat = true`: menos velocidad, el auto tira, chispas de las llantas en
   `src/player.js`; chapa y pintura las cambia).
4. ✅ Tren y colectivo de pasajero (`src/transit.js`): E con el tren parado en el andén o el colectivo
   frenado; el tren lleva hasta la próxima estación (fundido, media hora después, la cana pierde el
   rastro) y el colectivo frena en las paradas reales (`busStops` en `src/traffic.js`).
5. ✅ Tres misiones más (`src/missions.js`): la recaudación del Turco (motochorros), el Roca de las seis
   (escaparse de la cana en tren) y la proteína de Ciro (ida y vuelta a una dietética; `ciroPeace`
   evita que Ciro pelee mientras dura).
Lo que espera al dueño: relevamiento cargado (JSON) y red para Quaternius / Overpass (ver §7).

## 7. Preguntas abiertas para el dueño

1. ¿Habilita en el entorno `quaternius.com`, `kenney.nl`, `opengameart.org`, `poly.pizza` y
   `overpass-api.de`, o sube él los archivos?
2. ✅ Dirección del gym: Rivadavia 321 (sacada de sus redes oficiales).
3. Cuando cargue el relevamiento, subir el JSON exportado (o pasarlo) para integrarlo.
