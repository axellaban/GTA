# GTA Conurbano · Temperley

Juego de mundo abierto en el navegador, ambientado alrededor de la estación Temperley (Línea Roca, Lomas de Zamora). Hecho con Three.js, sin motor ni assets externos: todo (casas, rejas, trenes, gente) se genera por código.

Jugás con **Gaspi** (saco, camisa blanca, corbata a rayas rojas y blancas).

## Qué hay en esta versión (0.1)

- **La estación**: edificio del Ferrocarril del Sud sobre Av. Meeks 1400, 10 andenes con techo, puente peatonal hacia Fray Justo Sta. María de Oro, carrito de panchos.
- **Trenes del Roca**: eléctricos a Glew y Ezeiza, el diésel del ramal Haedo (va y vuelve), paradas en andén, bocina, **barreras que bajan** y campana en los pasos a nivel. Si te agarra el tren, perdiste.
- **Rejas en las casas**: cada casa tiene fachada con rejas en ventanas y reja al frente con portón, tanque de agua en la terraza, pintadas, cables y zapatillas colgadas.
- **Trapitos**: si dejás el auto cerca, vienen a cobrarte $3.000. Si no pagás, al volver tenés el auto rayado y una goma pinchada (el auto tira y anda más lento).
- **Motochorros**: aparecen cada un rato, te apuran y te piden el celu. Podés dárselo, resistirte (sale bien a veces) o salir corriendo. Si se lo llevan, perseguilos con un auto y volteálos para recuperarlo.
- **Gente pidiendo** en la vereda (E para darles $500, suma respeto).
- **Perdidos que deambulan** medio zombies: se te pegan y te frenan; de noche hay más.
- **Cortes de calle y marchas** (lo central): cortes con gomas quemándose, pasacalles, bombos y gente que no te deja pasar con el auto. Las marchas avanzan por las avenidas. El tránsito se traba, toca bocina y pega la vuelta. Todo sale en el zócalo de noticias.
- Tránsito con IA, colectivos, perros que persiguen motos, ciclo de día y noche con faroles de sodio, minimapa, plata, salud y respeto.

## Gráficos (0.2)

- **Cielo** con nubes que se mueven, sol con halo, atardecer naranja, luna y estrellas.
- **Postprocesado**: resplandor (bloom), viñeta y un gradeo de color cálido, al estilo Vice City.
- **Personajes** con esqueleto (rodillas, codos, cuello), cuerpo con volumen y cara dibujada; Gaspi tiene su foto como cara.
- **Autos** con carrocería perfilada (Falcon, Duna, Gol, pickup, patrullero, remís), vidrios y cromados que reflejan el cielo, llantas, parrilla y patentes Mercosur.
- **Ciudad**: árboles con follaje de hojas, balcones con rejas, toldos a rayas en los locales, parapetos y cornisas, sendas peatonales, cordones y tapas de cloaca, estación de ladrillo.
- **Noche**: ventanas y vidrieras que se prenden, halos en faroles, faros y luces traseras, foco del auto de Gaspi y el fuego de los cortes brillando.
- Selector de calidad **Alto / Medio / Bajo** en la pantalla de inicio (en celulares arranca en Bajo). La rueda del mouse acerca o aleja la cámara.

## Temperley real (0.3)

- **Mapa real** de 1,2 km alrededor de la estación, sacado de Overture Maps (datos de OpenStreetMap y huellas de edificios): calles con su nombre y ancho, vías, andenes, la playa de maniobras, casi 3.000 edificios con su forma real, plazas, canchas, árboles, faroles y semáforos.
- Los negocios reales tienen su cartel; sobre Av. Meeks, Almirante Brown y alrededor de la estación la planta baja es comercial.
- La gente camina por las veredas reales, cruza en las esquinas y el tránsito sigue las calles de verdad.

## Estilo GTA (0.4)

- **Piñas**: combo de jab, directo, gancho y patada, con apuntado automático al más cercano. La gente se defiende, sale corriendo o queda nocaut (y se le cae la plata).
- **Armas**: palo, revólver 38, pistola 9 mm y tumbera. Clic derecho apunta sobre el hombro; sin apuntar, apunta solo. Fogonazo, trazas, chispas en las paredes, gente que se tira al piso o levanta las manos.
- **La Bonaerense**: estrellas de búsqueda según lo que hagas y quién te vea. Patrulleros con balizas y sirena que te persiguen por las calles (con GPS), canas a pie que te esposan o, desde dos estrellas, te tiran. Con cuatro estrellas aparece el helicóptero con reflector. Si te pierden de vista un rato, zafaste; si te agarran, comisaría, coima y te sacan los fierros.
- **Robar autos**: Gaspi va hasta la puerta, saca al conductor (que después se enoja o se raja) y arranca. Se pueden robar patrulleros.
- **Motos**: 20 motos en el tránsito (muchas de delivery con su caja). Se manejan con inclinación en las curvas, willy con Shift y, si chocás fuerte, volás.
- **Vehículos**: Duna, Gol, Falcon, 504, Fiat 600, pickup, remís, taxi, Trafic, camiones de fletes, colectivos perfilados con fileteado y carro de cartonero con caballo.
- **Manejo**: derrapes con freno de mano, marcas de frenada, humo de gomas, daño con humo; los autos se prenden fuego y explotan. Alarmas en los autos estacionados.
- **Radio del auto** (R): cumbia, rock nacional y tango generados en el momento.
- **Clima**: se larga a llover, las calles se mojan y brillan, relámpagos y truenos.
- **GPS** violeta en el minimapa y **mapa grande** con los nombres de las calles (P o tocando el minimapa).
- **Changas**: robás un negocio con un fierro en la mano, hacés deliveries en la moto con caja, levantás armas, milanesas (vida) y chalecos.
- **Los vecinos postean** lo que hacés: persecuciones, explosiones, willys.
- **El vendedor de medias** en la estación: tres pares $2.000 y corrés más rápido un rato.
- La partida se guarda sola en el navegador.

## Controles

| Tecla | Acción |
| --- | --- |
| WASD / flechas | Moverse o manejar |
| Mouse | Mirar (clic para capturar el mouse) |
| Clic | Pegar (combo) o tirar |
| Clic derecho | Apuntar |
| Q · 1 a 5 | Cambiar de arma |
| R | Recargar · cambiar la radio arriba del auto |
| Espacio | Saltar · freno de mano |
| Shift | Correr · willy en la moto · quemar gomas |
| E | Acción: pagar, comprar, dar, robar un negocio |
| F | Subir, robar o bajar de un vehículo |
| H | Bocina |
| P | Pausa y mapa |
| Rueda del mouse | Acercar o alejar la cámara |
| M | Silenciar |

En celular aparecen un joystick y botones táctiles (Pegar, Apuntar, Arma, Saltar, Subir, Correr).

## Correrlo

```bash
npm install
npm run dev      # servidor de desarrollo
npm run build    # genera dist/index.html (un solo archivo) y dist/artifact.html
```

`dist/index.html` es autocontenido: se puede abrir directo o subir a GitHub Pages.

## El mapa

`src/data/temperley.json` sale de dos scripts en `scripts/map/` (Python con `requests`, `pyarrow` y `shapely`):

```bash
cd scripts/map
python3 fetch.py                                   # baja de Overture Maps el cuadrado alrededor de la estación
python3 preprocess.py ../../src/data/temperley.json  # calles, veredas, manzanas, edificios, árboles, etc.
```

Datos del mapa: © colaboradores de OpenStreetMap (ODbL) y Overture Maps Foundation.

## Estructura

| Archivo | Qué hace |
| --- | --- |
| `src/map.js` | Carga el mapa real: calles, esquinas, búsquedas de calle cercana y altura del piso |
| `src/city.js` | Construye la ciudad 3D a partir del mapa |
| `src/props.js` | Semáforos, carteles de calle, paradas, canastos, contenedores, antenas |
| `src/textures.js` | Fachadas, rejas, carteles, pasacalles (canvas) |
| `src/human.js`, `src/vehicles.js`, `src/cars.js` | Personas, autos, colectivos, motos, camiones y trenes |
| `src/player.js` | Gaspi: caminar, saltar, robar vehículos, manejar con derrape, cámara |
| `src/combat.js`, `src/weapons.js` | Piñas, armas, tiros, explosiones |
| `src/police.js` | Estrellas, patrulleros, canas y helicóptero |
| `src/pickups.js` | Plata, armas, milanesas y chalecos para levantar |
| `src/traffic.js`, `src/nav.js` | Tránsito con IA y caminos por las calles (GPS) |
| `src/npcs.js` | Vecinos, trapitos, gente pidiendo, perdidos, vendedor de medias, perros |
| `src/crime.js` | Motochorros |
| `src/events.js` | Cortes, marchas y noticias |
| `src/trains.js` | Trenes, barreras y pasos a nivel |
| `src/radio.js`, `src/audio.js` | Radio y sonidos sintetizados |
| `src/fx.js` | Partículas, trazas, marcas de frenada, lluvia |
| `src/hud.js`, `src/style.css` | Tarjeta SUBE, estrellas, minimapa, mapa grande, zócalo, diálogos |
| `src/sky.js`, `src/post.js`, `src/glow.js` | Cielo, postprocesado y luces de noche |

## Pendiente

- Misiones con historia para Gaspi.
- Subirse al tren y al colectivo como pasajero.
- Interiores (el kiosco, la estación por dentro).
