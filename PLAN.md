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
- ✅ Luces demasiado fuertes en el celu (5053e46): menos bloom de noche (`setMood` en `src/post.js`),
  neón, carteles, halos de faroles y faros (`src/glow.js`), exposición nocturna y fuego de los cortes.
  Falta que el dueño confirme en el celu.
- ✅ Piqueteros y marcha: ahora son `Npc` de tipo `piquetero` en `npcs.list` (estado `protest`, su lugar lo
  da `Events.protestBrain`/`slot`): piñas, tiros y atropellos como cualquiera; los compañeros salen a
  pelear (`rally`); al terminar quedan como vecinos (`release`). Pasacalles que se caen (`knock`,
  `dropBanner`; lo llaman el auto en `drive`, `meleeHit` y `explode`). A más de 9 m/s el auto rompe el
  corte (`breakEv` en `src/player.js`).

**R2 — ✅ Gym El Kaiser en su dirección real: Rivadavia 321** (confirmada en el Instagram/Facebook
oficiales; el dueño aclaró que es la vereda de enfrente del Colegio Eccleston). `GYM_LOT` en
`src/map.js` reserva el frente (≈ 419, 21) antes de armar la ciudad y saca la huella de Overture que lo
pisaba (un local de 9 m, el galpón real); `src/gym.js` lo usa.

**R2b — ✅ Lugares que pidió el dueño**: Colegio Eccleston (escuelas con nombre en `src/map.js`: los
edificios dentro del predio de OSM pasan a `escuela` y el más grande lleva el cartel) y la Shell de
Av. Eva Perón y Almirante Brown (`NAFTA` en `src/map.js`, `src/nafta.js`; surtidores que explotan,
`blast`/`hit`; ícono `nafta`). Calles: `scripts/map/osm_streets.py` las compara con OSM (248 de 250
tramos ya coincidían) y corrigió 3 (Alemandri/Ituzaingó, 25 de Mayo/Péreuilh, un tramo de Guido).

**R3 — ✅ Misiones con lo nuevo** (`src/missions.js`, al final de `DEFS`):
- `panchos`: salchichas para el panchero antes de que baje el marciano (`Ufo.summon`); se cumple
  cuando el marciano come; falla si le robás la nave o le pegás.
- `nave`: el marciano espera en la estación; la nave está en un desarmadero a 260–420 m (`Ufo.openSpot`,
  `Ufo.parkAt` con `hold` para que no se vaya sola) con tres pibes que pelean (`spawnThugs`,
  `thugsFight`); se la traés y te bajás cerca del carrito. Después se la lleva (`Ufo.parked`).
- `desarmadero`: el Turco te da la bazuca con 6 cohetes; tres autos en el cordón (`yardSpots`) y dos
  pibes; volarlos y perder a la cana.
✅ Persecución del OVNI robado con helicóptero (ver R4).

**R4 — Policía más dura**: ✅ con 5 estrellas la cana tira con metra y los gendarmes (6) con
ametralladora, en ráfagas (`arm`/`copBrain` en `src/police.js`, `enemyShoot(..., wid)`); el gendarme
muerto suelta la ametralladora. ✅ Con el OVNI robado sale el helicóptero con cualquier estrella
(`updateHeli` en `src/police.js`): lo persigue a su altura y le tira ráfagas (`heliShoot` → `Ufo.hit`);
con la nave tocada humea y con 0 se cae (`Ufo.crash`). El rayo de la nave baja al helicóptero
(`Police.downHeli`, `heliFall`; vuelve otro a los 35 s). Arriba de la nave la barra de vida es la de la nave.

**R5 — Más destrucción**: ✅ semáforos que se caen (`TrafficLights` en `src/props.js`: cada cabezal es
una instancia de `posts` con colisionador `signal`; `knock` lo voltea, se apaga, deja obstáculos y
`stopAhead` ignora ese lado; el choque está en `drive` de `src/player.js`, junto al de los postes).
✅ Capó que se levanta con daño > 70 y flamea con la velocidad (`makeHood` en `src/cars.js`, lo mueve
`Combat.updateVehicles`; abajo se ve el motor). Chapa y pintura pinta todo de un solo color.
✅ Carteles con el nombre de la calle que se caen (`SIGNS` en `src/props.js`: siguen en dos mallas juntas; al chocar uno se esconden sus vértices y cae una copia suelta). ✅ El tránsito frena ante el OVNI apoyado y los postes caídos, toca bocina y pega la
vuelta (`obs` en `Traffic.update`, `ufo.block`, `smash.obstacles`); la nave apoyada tiene colisionador
(`groundBlock` en `src/ufo.js`).

**R6 — ✅ Lugares**: lavadero de autos (`src/carwash.js`: pórtico con rodillos sobre el carril frente
a un local con cartel de lavadero; $700, sale de otro color y con hasta 2 estrellas la cana te pierde;
no arregla golpes), bar y pizzería con interior (`buildBar`/`buildPizzeria` en `src/interiors.js`, en
el local real con cartel de bar/café o pizzería más cerca de la estación; se pide en el mostrador,
`MENUS`). Íconos `lavadero`, `bar` y `pizzeria` en `src/icons.js`.

**R7 — ✅ Guardado**: `saveGame` en `src/main.js` guarda `inv` y `ammo` enteros, así que ya incluye
ametralladora, bazuca y su munición.

**R8 — Look**: ✅ reflejos de neón en la calle mojada (`LAMPS.neonSpot`: mapa de los carteles visto
desde arriba, muestreado a 3,4 m en `WET_REFLECT` de `src/detail.js`); ✅ luna de borde suave con mares y
halo (`src/sky.js`); ✅ rejas. Falta: foto del relevamiento en las fachadas.
- ✅ Texturas de foto CC0 para calles y veredas (entrega 2026-10-01, Codex):
  Asphalt 02 (Rob Tuytel, 3 m) y Concrete Pavement (Charlotte Baglioni, 1,8 m), de Poly Haven.
  Color, normal GL y rugosidad de 1K en `public/textures/`, servidos junto con el juego.
  `node scripts/texturas.mjs` reproduce la selección; créditos en pausa, README y
  `public/textures/CREDITS.md`. Sin geometría extra. `usePhoto` conserva el material dibujado
  completo si falla una descarga. Prueba visual local: `/tools/graphics.html` con Vite
  (día, atardecer y noche con lluvia); no se incluye en el build de producción.
  Falta para otra entrega: prueba en iPhone real.
- ✅ 2026-10-02: ladrillo y revoque de foto en las fachadas (`src/facade-photo.js`). Fotos CC0 de
  Poly Haven (Red Bricks 04, Large Red Bricks, Plaster Grey 04; `python3 scripts/fachadas.py` →
  `public/textures/fachada_*.webp` + `fachada.json`): color en RGB y altura en la transparencia
  (0,5–1, por Safari), un solo archivo por material. Dónde va cada una: `markBrick` en
  `src/textures.js` guarda cómo quedó dibujado el ladrillo y al cerrar la celda marca en el mapa de
  aspereza (rojo 0; hueco con verde 226) lo que siga igual (no lo tapado por ventanas, pintadas o
  carteles). El shader apoya las fotos en metros sobre cada pared (a lo largo y en altura), tiñe el
  ladrillo con el atlas desenfocado (cada casa con su tono), suma manchas y grano al revoque, y
  saca el relieve de la altura (se apaga entre 25 y 60 m); en esas zonas el relieve dibujado del
  atlas cede (antes el revoque parecía un queso). 11 texturas en el shader de fachadas (límite 16).
  Prueba: capturas de paredes al sol (hora 17,5 para la estación).

**R9 — Mapa real (B1)**: ✅ negocios de OSM (`scripts/map/osm_pois.py` -> `src/data/osm.json`, 117
lugares; `src/map.js` los asigna a las huellas): 129 locales con cartel real (antes 60). Overpass:
overpass-api.de suele cortar; el script prueba también maps.mail.ru y overpass.kumi.systems. ✅ Más
negocios de Overture con confianza media (0,3–0,55, solo locales a la calle: `scripts/map/places_extra.py`
-> `src/data/places.json`), en huellas sin nombre: 146 carteles con nombre real (antes 126). Falta:
integrar el relevamiento del dueño cuando lo cargue (o fotos/listas que mande por el chat).

**R10 — Modelos de artista (A2)**: ✅ 13 personas de Quaternius (Ultimate Modular Men/Women, CC0;
se bajan de las carpetas de Google Drive de quaternius.com con `pip install gdown` y
`gdown --folder <url>`), convertidas con `tools/models/quat.mjs` a `public/models/people/q_*.glb` y
`qf_*.glb` (4.800 triángulos, una malla, colores de vértice, `_PART` para teñir ropa y piel en
`tintParts` de `src/people.js`). ✅ Gaspi, Ciro y Laban con modelo de artista (`makeStar` en
`src/people.js`, sobre `q_suit` y `q_beach`): la ropa se pinta cambiando colores de vértice (`STARS`);
Gaspi lleva la cara de la foto pegada en la cabeza (calcomanía colgada del hueso `head`, caja `FACE`;
la textura `src/gaspi-face.webp` se rehace con `tools/models/cara-gaspi.py`); Laban, sombrero y
anteojos; Ciro mide 3,5 m y es más ancho (`bulk`). Arrancan con el cuerpo nuestro y cambian apenas
cargan los modelos (`swapHuman` pasa armas y lo colgado de los huesos; `Npcs.reskin`,
`Gym.upgrade`, `Laban.upgrade`). Los retoques de pose que se hacen después de `animateHuman` necesitan
`h.rig?.apply()` (ya está para Gaspi en el loop y para Laban). Ojo: en los de Quaternius las
piernas cuelgan de `Body` (no de `Hips`) y los pies son controles colgados de `Root`; `rigHuman` recorre
desde el hueso de más arriba y reubica cada cuadro los huesos que cuelgan de otro lado (`follow`). Sin
eso caminaban sin mover las piernas (lo reportó el dueño: "se arrastra"). `q_suit.glb` venía con una pistola en
la mano: se sacó con `tools/models/sinarma.mjs`. ✅ Chicas del Ferrucho (`makeGirl('fiesta')`,
vestido de `qf_formal`) y del gym (`makeGirl('gym')`, top y calzas sobre `qf_casual`), con los colores
de su look; cambian al cargar (`Laban.upgrade`, `Gym.upgrade`). La pintura acepta una función de la
altura (pelo y zapatos tienen el mismo color en el original). ✅ Autos de artista: "Realistic Car Pack"
de Quaternius (CC0; quaternius.com/packs/cars.html, carpeta de Drive con `gdown --folder`). Se usan 5
(sedán, compacto, SUV y dos deportivos; el taxi y el patrullero yanquis no). `tools/models/qcars.mjs
<carpeta OBJ> public/models/vehicles/qcars.glb` los junta en un GLB (escala real, más altos ×1,08 y
angostos ×0,93, frente a +z; mallas `paint`, `glass`, `detail`, `lights`, `tail` y una `wheel`; en
`extras` dónde va cada rueda). `loadQCars` en `src/cars.js` los carga (suaviza la chapa con
`toCreasedNormals`) y `makeCar('q_sedan'...)` arma uno con el mismo `userData` que los nuestros (sin
puerta ni capó; vidrio opaco porque no tienen interior). Si no cargaron, `makeCar` cae en el Duna.
`Traffic.randomCar` saca uno de cada cuatro moderno y `Traffic.mixArtistCars` (lo llama `main.js` al
cargar) cambia el 30 % de los comunes ya armados (`Vehicle.reshape`), lejos de la cámara. Manejo en
`stats` de `src/player.js`. Prueba: `pj6.html` (fila de autos; `?cam=x,y,z&rot=`; copiar de la sesión, no se sube).

**R13 — ✅ Autos con más onda** (`src/cars.js`): vidrios polarizados que dejan ver tablero, volante y
butacas (`glassMat` transparente; interior en `detailGeo`); espejos con brazo; el capó suelto solo se ve
cuando salta (cerrado lo dibuja la carrocería). Tuning al azar (`makeCar(..., { tune })`: tránsito 22 %,
estacionados 18 %, picadas 85 %): franjas en capó y techo, alerón del color del auto, llantas doradas o
cromadas, bajado (`u.ride`, lo respeta la suspensión de `traffic.js`) y neón abajo que se prende de
noche (`setUnderglow`, lo llama `main.js` con la intensidad del neón). Prueba: `pj4.html?tune=1&view=noche`
(copiar de la sesión; no se sube).

**R14 — ✅ Tirarse del auto andando** (pedido del dueño): F a más de 3 m/s → `Player.bailOut`: sale por
la puerta con el 55 % del envión del auto, rueda de costado como un tronco (`roll`: gira el hueso `root`
del cuerpo acostado y termina boca arriba) y pierde salud según la velocidad (4 + 1,7 por m/s, tope 62).
El auto queda con `coast` y lo mueve `Combat.coastStep`: frena solo, choca paredes y autos (daño y
chispas) y voltea a la gente que se cruza.

**R15 — ✅ Bandas** (`src/gangs.js`, pedido del dueño): Arbolitos (5, ametralladoras) en el centro de
los bancos de `src/data/osm.json` y Jubilados (6: 2 molotov, 2 lanzallamas, 2 bazucas) en un local de
avenida a más de 420 m de los bancos, convertido en "ANSES" (cartel y pasacalle; no es la dirección
real: si el dueño la pasa, se ubica ahí). Son `Npc` de tipo `banda` (`n.gang`, `n.arm`); el cerebro es
`Gangs.brain` (lo llama `Npcs.update`). Calor: cerca (`fire`) o apuntándoles sube; a 1,8 s, guerra.
Tiros/golpes del jugador a uno (`Npcs.react`) o disparar cerca: guerra al toque. Se calman tras 9 s
lejos. Armas enemigas en `src/combat.js`: `enemyMolotov` (arco hasta el blanco, el fuego no quema a
los de su banda), `enemyRocket`, `flame` (cono de 8,5 m, también para el jugador: `WEAPONS.lanzallamas`).
Sueltan `dropGun`/`dropHealth`; reaparecen a los 90 s si Gaspi está a más de 160 m. Íconos
`arbolitos`/`jubilados` en `src/icons.js`. La noche dura menos: reloj ×3 de noche y ×1,7 en el
amanecer/atardecer oscuros (`updateTime` en `src/main.js`).

**R16 — ✅ Armería con interior** (pedido del dueño, a lo Ammu-Nation): `buildArmeria` en
`src/interiors.js` (ambiente en x 1740): 11 exhibiciones (`STOCK`) en paredes con cartel de precio;
parado enfrente, E compra (o "Llevarte ... gratis" si el armero está muerto: la exhibición queda vacía).
El Tano es un `Npc` de tipo `armero` (`spawnArmero`, lo llama `main.js`; cerebro `armeroBrain`): se
enoja si le apuntás 0,7 s o lo lastimás (`Npcs.react`) y tira 5 perdigones cada 1–1,5 s; culatazo de
cerca. Se calma a los 60 s afuera; si lo matan, a los 150 s (sin estrellas) aparece otro y reponen.
El marcador viejo de la calle y el diálogo se sacaron; `world.armeria` sigue para el ícono.
También: panchero en el carrito (`spawnPanchero`, tipo `panchero`; sin él no hay venta) y chorro de
agua de la autobomba (`Rescue.waterJet`: tubo en arco que se rehace cada cuadro, gotas y vapor).

**R17 — ✅ Tanque y casas destructibles** (pedido del dueño). `src/tank.js`: `makeTank` (TAM con
casco, orugas, ruedas que giran, torreta y cañón como grupos; `userData.kind = 'tank'`), `Tanks`:
con 6 estrellas aparece uno (cada 45 s si no hay) en una calle a 130–230 m; `brain` va derecho
hacia Gaspi, se destraba en marcha atrás, apunta la torreta y tira cada ~5 s (`fireRocket(...,
{ shell: true })`: más rápido, sin estela, explosión 1,8). `moveAndCrush` (IA y jugador) empuja y
rompe autos, atropella gente. Robo: `v.tankAI` fuerza la fase "pull" del asalto y `v.eject`
(`Traffic.ejectDriver`) saca al tanquista. Manejo: `Player.drive` deriva a `Tanks.drive` (orugas,
torreta con `camYaw`, clic = cañón). Blindaje en `damageVehicle` (balas ×0,04, resto ×0,35); un
cohete o el láser le hacen 34–45. Los tanques entran en `Combat.vehicles` y en las listas de
choque/robo del jugador. `src/destroy.js`: cada casa tiene vida (60 + área×0,35 + altura×6); los
impactos (`Destroy.hit`: cañonazo 80, láser 38, cohete 20) la bajan; al llegar a 0 se hunden los
vértices de su huella en las mallas fijas (y sus pedazos de `chunks.js`), las instancias del techo
desaparecen, las paredes dejan de chocar (`gone` en `Colliders.query`), polvo, escombros y fuego.
No se caen la estación ni los edificios con puerta de interior ni el gym.

**R18 — ✅ Chapa y pintura con portón** (`src/garage.js`, pedido del dueño): en el frente del local
(`pickups.shops[6]` y el del 60 %) hay boca oscura, marco, persiana de chapa que sube al acercarte con
un auto y cartel. En el marcador (despacio y con la persiana arriba) arranca la secuencia: el auto entra
solo y desaparece al pasar el frente, baja la persiana, trabajan 2,6 s (ruido, chispas, baliza), se
arregla y pinta (`fix`, igual que antes), sube la persiana y el auto sale de trompa. `Player.cutscene`
congela el control; `Garages.camera` pone la cámara en la calle. `main.js` saca los autos estacionados
a menos de 7,5 m del portón.

**R19 — ✅ Puente peatonal caminable** (pedido del dueño). `addStation` en `src/city.js`: a las
pasarelas a menos de 160 m de la estación les agrega descanso (3,4 m) y escalera en cada punta (hacia el
lado con menos colisiones; escalones de 18 cm, zancas y pasamanos), y registra `city.walkways` (tramos
con ancho y altura de inicio y fin). `walkwayHeight` en `src/physics.js` da el piso en (x, z) para quien
está a la altura y (solo cuenta si se sube de un paso, 0,7 m): `Player.groundAt` lo usa en `place`, el
salto y `airborne`. Barandas y costados de escalera son paredes con `y0` (`Colliders.add3d`): el
jugador las respeta según su altura; el resto (vecinos, autos, tiros) ignora las que arrancan arriba
de 1 m. ✅ Los vecinos cruzan (pedido del dueño): `addStation` guarda `city.bridgeRoutes` (pie,
escalón de abajo, de arriba, descanso y el puente con su punto `mid`); `Npcs.bridgeTraffic` (cada 0,5 s
desde `recycle`) desvía a alguien que pasa a menos de 40 m con vista libre al pie, o hace aparecer uno
ahí si Gaspi está a más de 60 m; hasta 5 a la vez de día y 2 de noche. Solo los puentes que bajan a la
calle en las dos puntas (`r.ok`; el que baja a un andén no). `bridgeStep` sigue los puntos; en la
mitad alguno se para a mirar el tren; si no se acerca en 8 s, abandona. `Npcs.place` suma
`walkwayHeight` (dentro de la caja de los puentes) para todos, así la cana también sube; arriba de
1,3 m chocan con `upFilter` (mismo criterio que Gaspi) y solo se esquivan con los de su altura.
`attach` con alguien arriba (después de un susto) lo baja por la escalera más cerca (`bridgeExit`).

**R20 — ✅ iPhone: "Jugar no anda"** (reporte del dueño, Safari y web app). Medido en Chromium con
UA de iPhone: el arranque creaba 220 MB de lienzos (canvas) y Safari del iPhone corta en ~224 MB
(en otros modelos 384): `getContext` devuelve null, el arranque se rompe y el botón queda muerto.
Ahora las texturas dibujadas fijas se marcan con `freeAfterUpload` (`src/textures.js`: atlas de
fachadas, relieves, carteles de calles, mapas de luz, carteles de interiores) y `flushTextures` las
sube a la placa (`renderer.initTexture`) y achica el lienzo a 1×1 en puntos seguros del arranque
(`city.js` después del atlas y del piso, `main.js` después de la ciudad, los carteles, los
interiores, los faroles y al final). El raster de alturas (`makeGround`) se suelta al leerlo y el
minimapa base pasó de 2048 a 1536. Pico de lienzos durante la carga: 50 MB (antes 220); vivos al
jugar: 32 MB. **Regla: textura de canvas nueva y fija → `freeAfterUpload`; no releer `.image` de una
textura después de un `flushTextures`.** Además, "Jugar" arranca deshabilitado ("Cargando…") hasta
que el juego terminó de armarse. Prueba: `canvasmem.mjs` (copiar de la sesión) y la emulación de
iPhone con `hasTouch`/`isMobile`. Falta probar en un iPhone de verdad.

**R21 — ✅ Relevamiento del dueño (por chat)**: en `src/data/relevamiento.json` (campo `fuente` con lo que
dijo): Morres (#2505, carnicería, esquina Cangallo y Santa María de Oro: pisa "Tienda de Mascotas" de
Overture), Escuela Media Tomás Espora (#1288, el galpón grande que da a Santa María de Oro antes de 14 de
Julio, pasa a escuela de 2 pisos con cartel) y Vaicrem (#1322, colores de cartel). `src/barrio.js`:
3 borrachos (`borracho`) en la puerta del cartel "Supermercado Luna" y 11 chicos (`chico`) en la del
Colegio Eccleston de 7:30 a 18:30. Los chicos no se pueden lastimar: `Npcs.hurt` los hace huir, las
balas los atraviesan (`Combat.trace`), no se apuntan y el rayo del OVNI no los levanta. Esquinas
calculadas con las calles de OSM (Cangallo y SMdO en 65.6,-12.5; SMdO y 14 de Julio en 58.3,-160.2).

**R22 — ✅ Matanzas** (pedido del dueño, los "Rampage" de Vice City): `src/matanzas.js`. Seis calaveras
fijas (en la vereda de la arista más cerca de puntos alrededor de `STATION`, a 140–465 m) con `DEFS`:
arma, objetivo (`zombis` = `spawnZombie(P, 20, 50)`; `barras` = vecinos con camiseta de Banfield,
`n.barra`, siempre pelean: ver `react`), cantidad, tiempo y premio ($25.000–$60.000). Se agarra a pie,
sin misión ni picada. `Npcs.hurt` ahora envuelve a `damage` y avisa `matanzas.onKill` cuando Gaspi
mata (`byPlayer`). Siempre hay 7 objetivos vivos cerca (los de más de 90 m se borran). `Police.crime`
topea en 2 estrellas mientras dura. Hechas en `player.matanzas` (se guardan), cuentan 10 % del
porcentaje de la pausa; ícono `matanza` (calavera) en mapa y minimapa. Si fallás, vuelve en 45 s.
Prueba: forzar `P.x/z` sobre una calavera, `matanzas.update` y matar con `npcs.hurt(..., {byPlayer})`.

**R23 — ✅ Delivery de PedidosYa y Rappi** (pedido del dueño): `DELIVERY` y `deliveryPack(human, brand)`
en `src/vehicles.js`; `makeMoto(color, { brand })` (PedidosYa: caja #EE2D43 con el nombre; Rappi: sin
caja, `model` igual 'delivery'). `Traffic.randomMoto`: 50 % delivery, mitad y mitad; campera y casco del
color de la app; Rappi con la mochila colgada del pecho (`v.brand`; `ejectRider` se la vuelve a poner al
que se baja). Sin logos: solo el nombre en letras nuestras. `startDelivery` titula con la app.

**R24 — ✅ Chofer de Uver** (pedido del dueño: "un Uber pervertido que te quiere subir y te secuestra";
se usa una marca trucha, como en los GTA, para no mostrar a la empresa real como secuestradora; las
frases son de chamuyo pesado, nada explícito). `src/uver.js`: cada 170–300 s (el primero a los 100 s)
con Gaspi a pie y tranquilo, `spawn` pone el auto (`v.keep`, `v.uver`) 28–50 m atrás en su carril, solo
si no hay autos en el medio (`clear`). Frena al lado (`ai.hold`), toca bocina y ofrece (`bubble` va a
`speakers`). E (`action`) → `board`: Gaspi oculto y `P.riding` (el tránsito no lo cuenta como peatón),
`riding` lo lleva con el auto; E suma `grip` (se afloja solo); a 1 → `escape` (golpe y al piso al
costado del auto); a los 14 s → `ransom` (30 % de la plata, mín. $5.000, lo larga a 300–480 m, +2 h).
Si te alejás más de 28 m o te busca la cana, se va. Si le robás el auto, queda como uno más.

**R25 — ✅ Cosas que los autos atravesaban** (reporte del dueño: "los andenes son como invisibles"). Toda
colisión es a mano (`Colliders`), así que lo que no se registra es fantasma. Ahora: andenes
(`addRing(rings[0], 1.1, 'platform')` en `addStation`; Gaspi a pie los ignora en `collide` para poder
subir caminando, NPC y autos chocan), paradas de colectivo (poste y refugio: pared de atrás y
parantes), canastos de basura (poste), contenedores (`boxCollider`: caja girada como 4 paredes) y
postes de la catenaria (`src/props.js`). Al sumar algo sólido nuevo: registrarle su colisión.

**R26 — ✅ Torres de Temperley: escalera y helicóptero** (pedido del dueño). `src/heli.js`:
`buildTower` toma la torre (h > 35, en H) más cerca de la estación; la "pared del callejón" es la arista
cuyo frente (0,8 y 3,3 m) queda fuera del anillo pero dentro de su caja (el patio entre alas), la más
cercana al centro. Escalera en zigzag: 2 carriles (0,95 y 2,35 m de la pared), tramos con
`city.walkways` (pendiente ≤ 0,62) y descansos que cruzan los carriles; barandas `add3d` desde 1,2 m (abajo
se entra por debajo). Terraza: `roofWalkway(ring, H)` (nuevo en `src/physics.js`: `walkwayHeight` acepta
`{ ring, box, y0 }`) y parapeto de 1 m menos en la pared de la escalera. Helipuerto en el punto más
lejos de los bordes. `Heli` usa el mismo enchufe que el OVNI (`P.ufo = heli`: `player.update` llama
`fly`, la cámara y el HUD lo tratan igual); `floorAt` = calle o terraza del edificio (`destroy.buildingAt`);
solo te bajás donde hay piso caminable. El ruido va por `world.heliVol` (lo mezcla `police.update`).
La torre está protegida en `Destroy.protectedBuilding`.

**R27 — ✅ El Viejo Correo** (Av. Meeks 1357, pedido del dueño): en el galpón #399 (ex "El Espejo"). El
número se ubicó con la numeración de OSM sobre Meeks (1307 y 1387 interpolados). El relevamiento
acepta ahora `frente` (índice de arista que da a la calle: manda sobre "el frente más largo" en
`addBuildings`) y `punto` ([x, z] donde va el cartel y la puerta en un frente largo; lo usan
`city.js` y `pickups.shops`). Interior `buildCorreo` en `src/interiors.js` (CORREO x 1810), menú
`correo`, ventiladores que giran en `update`.

**R28 — ✅ Cuadra de los bancos** (pedido del dueño): #1455 Banco Macro y #1456 Banco Provincia por
relevamiento (al Provincia le ganaba "La Casona" de OSM). El relevamiento acepta `puerta: { color, punto }`
(puerta con marco sobre el frente, en `addBuildings`): la puertita azul va en #1454, pegada al Macro.

**R29 — ✅ Torre del tobogán** (Alte. Brown 2973, pedido del dueño). En los datos no había edificio en
ese tramo de la vereda oeste: el relevamiento acepta `nuevos` ([{ ring, tipo, pisos, frente, extra }],
`src/map.js` los agrega al final de `D.buildings`). 32 pisos (99,5 m). `src/tobogan.js`: marco local
(s a lo largo del frente, d hacia adentro), pileta con borde (`add3d`) y su piso caminable (la terraza es
`roofWalkway` con `hole`; nuevo en `walkwayHeight`), torrecita, tobogán = `TubeGeometry` sobre una
`CatmullRomCurve3` (sale por el costado, hélice de 1,5 vueltas de radio 4 alrededor de un poste con
ménsulas a la pared, vuelve a la pileta). El viaje usa `P.cutscene` y acelera con la pendiente.
Ascensor: fundido entre la vereda y la casilla de la terraza. Protegida en `Destroy`.

**R30 — ✅ Final en el cielo** (pedido del dueño). `FINAL` en `src/missions.js` (`nextDef`: cuando
`done >= DEFS.length` y no se jugó; `finale` se guarda). Etapas: subir a la terraza de la torre del tobogán,
meterse en la luz (`Cielo.beamOn/inBeam`), `ascend` (fundido blanco, la nube a 420 m arriba de la torre:
`roofWalkway` ovalado + barandas `add3d` invisibles que se apagan con `gone` al volver), encontrar al
Comandante (`near`) y `hug` (cutscene, `hugPose` sobre la pose quieta, cámara que orbita en
`Cielo.camera`, que `main.js` consulta antes de la de Gaspi). `ending`: créditos y vuelta a la terraza.
El Comandante: `makeHuman` con lentes y cadenita colgados de los huesos; sin fotos.

**R31 — ✅ Bajo nivel** (pedido del dueño). `scripts/map/preprocess.py` descartaba las calles que se
llaman "bajo nivel"; en vez de regenerar el mapa (cambiaría los números de edificio del relevamiento),
se suma al cargar. `src/bajo-geo.js` (sin imports): las dos manos de OSM, el eje del túnel y `depthAt(s)`
(5,4 m en |s| ≤ 24, rampas coseno de 72 m). `src/map.js`: agrega las manos a `D.roads` (`bajo: true`;
el grafo empalma con Eva Perón y 9 de Julio por las puntas), saca árboles/faroles/alambrados/senderos
de encima y baja `heightAt` en la franja. `src/bajonivel.js`: calzada en cinta (mismo material del
asfalto), líneas, paredes con baranda y colisión `trench` (cortadas bajo los puentes), cordones a nivel,
puentes detectados donde una calle o vía cruza lo hondo (losa abajo, barandas `over`, pasarela a nivel en
`BAJO.walk` + `city.walkways`), techo del túnel (|s| ≤ 21), máscara que recorta el piso (`cutGround` en
los materiales de `addGround`; los puentes quedan). `vehicleY` (en `Vehicle.sync`, con cabeceo en la
rampa) elige entre puente y trinchera según la altura que traía; Gaspi en auto usa `vehicle.y`.
`markOver` marca lo de arriba que cae sobre lo hondo: los de abajo (auto, Gaspi, NPC con y < -1) no lo
chocan (`lowFilter`). Sin veredas: los NPC no caminan por ahí (`walkEdges`) ni se estaciona.

**R32 — Personas al nivel de San Andreas / Vice City** (pedido del dueño, prioridad: "todos los
personajes", iterar con capturas). En curso. Hecho:
- Tubería MakeHuman (CC0: malla base, proxies, morfos, esqueleto y pesos, pieles, pelo, ropa; ver
  LICENSE.md §C de makehumancommunity/makehuman) en `tools/models/mh/`:
  `fetch.py` baja todo a `cache/` (no se sube: ~320 MB), `cast.py` es el elenco (morfos 0..1 como los
  deslizadores, cara al azar con `seed`, piel, ropa, pelo, repintado), `build.py` arma cada personaje
  (morfos macro con las fórmulas de `humanmodifier.py`, cara con ~45 modificadores de detalle, proxy
  liviano y prendas ajustadas por sus 3 vértices de referencia, cuerpo tapado por la ropa afuera,
  esqueleto de 19 huesos con nombres de Mixamo sumando los pesos del esqueleto completo, atlas 2048
  con la cabeza ampliada aparte), `paint.py` repinta la ropa (sin los logos de MakeHuman: mapa de
  posiciones 3D → rayas, franja, banda, liso; sombreado de oclusión + pliegues + costuras) y `skin.py`
  hornea las cavidades de la cara en la piel (curvatura a 3 escalas en la malla de 13 mil vértices).
  `pack.mjs` simplifica cada pieza (meshoptimizer) a ≤ 5.000 triángulos en total, normales suaves, una
  malla, un material (alphaTest para el pelo, doble cara) y atlas WebP 1024 → `public/models/people/mh_*.glb`
  (~330 KB). `_PART` por vértice: 1 piel, 2 ropa que cambia de color, 3 pelo y cejas (gris neutro: el
  juego le da color), 4 ropa fija (camisetas, uniformes, pantalones), 0 lo demás. `userData.hair` (extras
  de la escena) limita los colores de pelo (morochos: negro u oscuro); `_old` en el nombre: canosos.
  `cd tools/models && python3 mh/fetch.py && python3 mh/build.py && node mh/pack.mjs`.
- Elenco: 13 varones (camisetas de Banfield, Temperley, Boca, River y Argentina sin escudos, laburante de
  overol, oficinista, gordo pelado, flaco, musculoso, camisa rayada, dos jubilados), 7 mujeres (remera y
  jean, short, deportiva, vestido, madre, afro, abuela) y policía Bonaerense (camisa celeste, pantalón
  azul) varón y mujer. Reemplazan a los de elbolilloduro y Quaternius (quedan `swat_male` y los
  Quaternius de Gaspi, Laban, Ciro y las chicas, en `SETS.stars`).
- Juego: `tintMH` (`src/people.js`) con tono de piel suave, ropa de arriba de otro color y pelo
  negro/castaño/rubio/canoso; altura natural del modelo ±3 %; en celular la textura baja a 512
  (`halve` + `freeAfterUpload`). `src/rig.js`: esfera de recorte holgada en vez de `frustumCulled = false`
  (antes se dibujaban todos los vecinos aunque estuvieran atrás de la cámara). `src/npcs.js`: los vecinos
  hechos por código antes de que cargaran los modelos pasan a uno de a poco cuando están a más de 35 m
  (`n.plain`). `world.people` expone `PEOPLE`, `makePerson` y `animateHuman` para las pruebas.
- Gaspi (`mh_gaspi`, `STARS.gaspi` en `src/people.js`): traje de `male_elegantsuit01` con la corbata
  pasada a roja (`recolor` en `paint.py`: lo saturado de un rectángulo de la textura, conservando la luz),
  sin cejas de malla y con la cara de `src/gaspi-face.webp` horneada en la piel (`photo` en `skin.py`:
  cada texel de la cabeza se proyecta de frente; ojos = hueso `eye.L`, mentón = punta de `jaw`; pesa por
  la normal, el alfa de la foto y nada debajo del mentón; la piel entera toma el tono de la foto).
- Detalles: `pad` en `paint.py` corre el color de cada pieza de ropa hacia el fondo de la textura (los
  bordes del cuello y los puños no se manchan al achicar); el cuerpo se esconde solo donde la ropa lo tapa
  entero (con "algún vértice tapado" se abrían agujeros en el cuello).
- Todos los personajes (salvo el SWAT y el marciano): `makeLook(look)` en `src/people.js` traduce un
  look de `human.js` (el que arman trapitos, linyeras, vendedores de medias, panchero, zombis, armero,
  bandas, borrachos, chicos del colegio, barras de Banfield, piqueteros, motos, el carro del cartonero y el
  soldado del tanque) al modelo MakeHuman que más se parece (chico/a, mujer, viejo, panza, bigote,
  barba, musculoso, camiseta de club) y le impone colores (`top`, `vest` solo el torso, `bottom`, pelo y
  piel relativos a los de human.js) y accesorios (`src/wear.js`: gorra con visera e insignia, casco,
  anteojos, cadenita, franela, vasito; se calzan con `userData.head`). Si todavía no cargaron, el sistema
  usa makeHuman y `npcs.update` lo cambia después (cuando está a más de 35 m: `n.plain` o `n.look`).
  Pelado o con gorra/casco/sombrero: `baldGeometry` (la misma malla sin los triángulos del pelo,
  compartida). Personajes: `makeStar('gaspi'|'laban'|'ciro'|'comandante')`, `makeGirl('fiesta'|'gym')`;
  el Comandante del cielo pasa al modelo nuevo cuando carga (`Cielo.plainFort`). Se fueron los Quaternius
  de personas y el código de la cara pegada (`faceDecal`).
- `_part` ahora: 1 piel, 2 torso, 5 mangas, 6 pantalón, 3 pelo, 7 cejas, 0 lo demás. Extras del glb:
  `fixed`, `lum`, `hair`, `head`. Elenco especial (`SETS.special`): linyera (barba pintada: `beard` en
  `skin.py`), armero, chicos (edad 0,3); `SETS.stars`: Gaspi, Laban (traje blanco + `fedora01`), Ciro (en
  cuero: `drop: top`), Comandante, chicas de fiesta y de gym. Con sombrero el presupuesto se reparte
  (`TOTAL` en `pack.mjs`).
- La piel se esconde si tiene un vértice tapado por la ropa o queda a menos de 1,8 cm debajo de la tela
  (axilas y hombros), salvo en el cuello (ahí solo si está tapada entera).
- De lejos (más de 28 m, `setLod` en `src/rig.js` desde `npcs.update`): cada glb trae una segunda malla
  'lejos' (~1.100–2.000 triángulos, mismo esqueleto y material; el pelo se queda con las tiras más grandes:
  `bigCards` en `pack.mjs`). Normales, uv y pesos cuantizados (KHR_mesh_quantization) y WebP 84: el elenco
  bajó de 14 a 9,6 MB.
Falta (en orden): carga diferida de `special` y `stars`; SWAT propio con casco y chaleco; más ropa (buzos con capucha, shorts, vestidos: assets de la
comunidad de MakeHuman con licencia CC0).
Prueba: casting en el escenario (800, 800) mirando al este a las 9:30 (`mhcast.mjs` del scratchpad:
fila de cuerpo entero, caras y primer plano).

**R33 — ✅ Sonido en el celu, motores y lentitud** (reporte del dueño: "anda lento en el celu", "se pone
lento cuando empezás a jugar más", "el sonido no anda en el celu", "más potencia, mejores motores").
- Lentitud que crecía: `swapHuman` le copiaba al modelo nuevo la marca `plainParts` del viejo y el
  Comandante del cielo (`Cielo.update`) se rehacía en cada cuadro, anidado en el anterior. Se borra la
  marca antes del cambio. Además `disposeHuman` (src/people.js) libera lo propio de cada personaje que se
  va (textura de huesos, material teñido, mallas de los hechos por código: `forgetHuman` en human.js).
  Prueba: `fuga.mjs` del scratchpad (4 min saltando por el mapa): memoria plana ~225 MB (antes 250 → 460).
  `fuga3.mjs` dice qué raíces de la escena juntan mallas con esqueleto y quién las agregó.
- Sonido en el iPhone: `navigator.audioSession.type = 'playback'` (suena con la llave de silencio),
  `<audio>` mudo en bucle para Safari viejo y `resume()` en cada toque o al volver (src/audio.js).
- Motores (`src/motores.js`): bucles sintetizados al arrancar (pulsos de escape por cilindro, desparejo,
  ruido de combustión, golpeteo diésel, resonancias del caño), dos por motor (vueltas bajas y altas) que se
  mezclan con el tono de las vueltas; la carga satura y abre el filtro. `Gearbox`: marchas, corte al
  pasar de marcha, embrague que patina parado. Perfiles: `seis`, `cuatro`, `sport`, `diesel`, `moto`
  (`motorOf(v)`). Suenan el del jugador (`v.throttle` y `v.vmax` desde `player.drive`/`tank.drive`) y los
  3 autos o motos más cercanos con paneo y Doppler. Compresor al final. Prueba: `motor.mjs` (WAV con
  OfflineAudioContext) y `spec.py` (espectro y cuánto cae en la banda del parlante del celu).

**R11 — Pruebas en celu real**: el dueño prueba en iPhone/Android y manda capturas; se ajusta.

**R12 — Acercarse al look del video de Higgsfield** (Gaspi de traje y corbata roja en una vereda a lo
GTA V; el video es IA pre-renderizada, no se puede generar así en tiempo real en un celu). Pasos:
1. Cinemáticas con videos de Higgsfield del dueño (intro, entre misiones), comprimidos a 1–2 MB.
   ✅ Intro: `public/cine/intro.mp4` (H.264) + `.webm` (VP9), `playCine` en `src/cine.js` (franjas, título,
   saltear; se ve la primera vez al tocar Jugar y desde la pausa con "Ver la intro"). Para sumar otra:
   `ffmpeg -i video.mp4 -vf scale=720:-2 -c:v libx264 -crf 26 -movflags +faststart -an cine/x.mp4` y lo
   mismo con `-c:v libvpx-vp9 -b:v 0 -crf 38` a `.webm`. Antes de gastar créditos en Higgsfield, el dueño
   aprueba cada escena.
2. Gaspi en 3D desde una imagen suya en pose A (Higgsfield `generate_3d`), simplificado a ≤ 5.000
   triángulos con textura de 1024 y animado con `src/rig.js` (hay que pesarle los huesos).
3. Más texturas de foto CC0 en fachadas, veredas y asfalto (ya empezado: Poly Haven).
4. ✅ Luz de día más nítida y cálida, sombras más definidas y menos bruma (pedido del dueño). En
   `updateTime` (`src/main.js`) hay un factor `clear` (día × sin atardecer × sin lluvia): con sol pleno
   la bruma baja a la mitad (y la niebla lineal se aleja ~110 m), el sol pega más fuerte y más dorado y
   el cielo rellena menos (sombras más oscuras). `Post.setMood(k, dusk, rain, clear)` sube contraste,
   saturación y nitidez, calienta el gain y baja el bloom. Sombras con `PCFShadowMap` + `radius` 1,6
   (borde definido; antes `PCFSoftShadowMap`) y caja de ±62 m (antes ±70: más resolución). Prueba:
   capturas antes/después a las 10:30, 13 y 16 desde la vereda.

**R12 — ✅ Rendimiento en la compu** (el dueño la notó lenta). Medido con un cuadro en la vereda de
Meeks (`onBeforeRender`/`onBeforeShadow` por malla): antes 4,77 M triángulos y 1.057 dibujos por cuadro
(cámara + sombra); ahora 2,19 M y 1.087. Qué se hizo:
- `src/chunks.js`: al final de `main.js` (`chunkScene`) las mallas fijas grandes (casas, cornisas,
  techos: hasta 436 k triángulos cada una) se parten en cuadrados de 200 m y las instancias fijas
  (árboles, palmeras, tanques, antenas, parabólicas, canastos…) en cuadrados de 320 m. Así la cámara
  y la sombra del sol solo dibujan lo cercano. **Instancias nuevas que no se muevan: envolverlas en
  `fixed(...)` de `src/city.js`** (con un número adelante, ej. `fixed(120, m)`, ni se dibujan más allá
  de esos metros: `updateChunks`). Las que cambian en el juego (postes de `smash.js`, luces de semáforo,
  efectos) no se marcan.
- Autos (`carLod` en `src/cars.js`, lo llama `Traffic.update`): a más de 45 m se apagan cromados y
  detalles y la sombra la tira solo la carrocería; a más de 140 m tampoco ruedas ni sombra.
- Vecinos (`src/npcs.js`): se dibujan hasta 150 m (antes 190) y tiran sombra real solo a menos de 40 m.
- ✅ Postes, brazos y cabezales de los faroles también en pedazos (`userData.movable`: `setMatrixAt`
  con el índice de siempre va al pedazo que corresponde, así `smash.js` los sigue volteando).
- ✅ Autos a media distancia: las cuatro ruedas en una sola malla quieta (`farWheels`/`wheelsFar` en
  `src/cars.js`): 5 dibujos por auto en vez de 8.
- ✅ 2026-10-01: `ScaledBloomPass` (`src/bloom.js`) conserva `bloomScale` cuando
  `EffectComposer` llama a `setSize`: antes anulaba la media resolución de `post.js`.
  Con calidad alta, los buffers del resplandor tienen aproximadamente 75 % menos píxeles.
  Prueba de integración con el compositor real, resize y DPR: `node --test tools/bloom.test.mjs`.

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
  la calle. ✅ Rejas en las ventanas de planta baja (`windowGrilleTexture`, `arr.grilles` en
  `addFrames`): lo que diga `rel.rejas`; si no hay dato, 2 de cada 3 casas. Falta: foto como textura,
  puerta/vidriera según datos.
- **B3 — Construcción (resto)**: por cada local, arma el frente con
  piezas (vidriera, persiana, puerta, toldo, cartel con el nombre real; foto como textura si hay),
  con los pisos reales. Prioridad: la cuadra de la estación sobre Av. Meeks y el centro comercial.
- **B4 — ✅ El gym El Kaiser a su dirección real**: Rivadavia 321 (ver R2, `GYM_LOT` en `src/map.js`).

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

- ✅ 2026-10-01, segunda tanda Codex: profundidad pintada en dinteles y jambas,
  tanto en color como en emisión nocturna (`src/facade-depth.js`). Se aplica después
  de calcular las normales para no convertir las sombras en relieve. Misma resolución
  de atlas, sin geometría ni texturas GPU nuevas. Se corrigió el ruido que se dibujaba
  siempre en la primera celda y se recortó cada fachada para que no invada las vecinas.
  Prueba de píxeles y atlas real: `/tools/facades.html` con Vite. Commit de esta entrega
  en la PR «Dar profundidad a las aberturas y aislar las celdas del atlas».

- ✅ 2026-10-01, Codex: carga atómica de materiales fotográficos (`usePhoto`): mantiene
  el material dibujado si alguna descarga falla, libera las texturas incompletas y respeta
  la rugosidad del clima. Prueba: `node --test tools/texturas.test.mjs`; build verificado.
  Commit `fc2a730`, integrado por PR #1 (merge `3fa7bde`). Texturas: `34955d0`, PR #2
  (merge `ea8e245`). Tercera entrega: escala de bloom corregida, con prueba de resize y DPR.

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
Lo que espera al dueño: relevamiento cargado (JSON) (ver §7).

## 7. Preguntas abiertas para el dueño

1. ✅ Red habilitada (2026-10-02). Andan: quaternius.com, drive.google.com, kenney.nl, opengameart.org,
   polyhaven.com y api.polyhaven.com, ambientcg.com, overpass.kumi.systems y maps.mail.ru. No andan:
   poly.pizza (403; su API pide clave) ni overpass-api.de.
2. ✅ Dirección del gym: Rivadavia 321 (sacada de sus redes oficiales).
3. Cuando cargue el relevamiento, subir el JSON exportado (o pasarlo) para integrarlo.
