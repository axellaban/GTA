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

## Controles

| Tecla | Acción |
| --- | --- |
| WASD / flechas | Moverse o manejar |
| Mouse | Mirar (clic para capturar el mouse) |
| Shift | Correr |
| E o clic | Acción: pagar, dar, empujar, voltear la moto |
| F | Subir o bajar del auto (también le sacás el auto a otro) |
| H / Espacio | Bocina / freno de mano |
| 1 2 3 | Elegir en los diálogos |
| M | Silenciar |

En celular aparecen un joystick y botones táctiles.

## Correrlo

```bash
npm install
npm run dev      # servidor de desarrollo
npm run build    # genera dist/index.html (un solo archivo) y dist/artifact.html
```

`dist/index.html` es autocontenido: se puede abrir directo o subir a GitHub Pages.

## Estructura

| Archivo | Qué hace |
| --- | --- |
| `src/map.js` | Calles, vías, andenes, manzanas y lotes (coordenadas en metros) |
| `src/city.js` | Construye la ciudad 3D a partir del mapa |
| `src/textures.js` | Fachadas, rejas, carteles, pasacalles (canvas) |
| `src/human.js`, `src/vehicles.js` | Personas, autos, colectivos, motos y trenes |
| `src/player.js` | Gaspi: caminar, manejar, cámara |
| `src/traffic.js` | Grafo de calles y autos con IA |
| `src/npcs.js` | Vecinos, trapitos, gente pidiendo, perdidos, perros |
| `src/crime.js` | Motochorros |
| `src/events.js` | Cortes, marchas y noticias |
| `src/trains.js` | Trenes, barreras y pasos a nivel |
| `src/hud.js`, `src/style.css` | Tarjeta SUBE, minimapa, zócalo, diálogos |

## Pendiente

- **Mapa real de OpenStreetMap**: la estación respeta los datos confirmados, pero la grilla de calles alrededor es aproximada. El entorno donde se armó no tenía acceso a `overpass-api.de`; con acceso, `src/map.js` se puede alimentar con las calles y edificios reales.
- Policía bonaerense y nivel de "quilombo" (estrellas).
- Misiones con historia para Gaspi.
- Subirse al tren y al colectivo.
