# GTA VI Conurba · Temperley

Juego de mundo abierto en el navegador, ambientado alrededor de la estación Temperley (Línea Roca, Lomas de Zamora). Hecho con Three.js, sin motor ni assets externos: todo (casas, rejas, trenes, gente) se genera por código.

Jugás con **Gaspi** (saco, camisa blanca, corbata a rayas rojas y blancas).


> **¿Seguís el proyecto (persona o IA)?** Empezá por [`PLAN.md`](PLAN.md): reglas, cómo probar sin GPU y qué falta, en orden.

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
- Gráficos siempre en calidad alta. Para que ande fluido también en pantallas grandes, se dibuja como máximo lo equivalente a Full HD, y la resolución baja o sube sola según los cuadros por segundo (resolución dinámica, como en GTA V o Fortnite). Si agregás `?fps` al final del link aparece un contador. Si el navegador no usa la placa de video, el juego avisa. La rueda del mouse acerca o aleja la cámara.

## Temperley real (0.3)

- **Mapa real** de 1,2 km alrededor de la estación, sacado de Overture Maps (datos de OpenStreetMap y huellas de edificios): calles con su nombre y ancho, vías, andenes, la playa de maniobras, casi 3.000 edificios con su forma real, plazas, canchas, árboles, faroles y semáforos.
- Los negocios reales tienen su cartel; sobre Av. Meeks, Almirante Brown y alrededor de la estación la planta baja es comercial.
- **Gaspi se mueve como una persona**: el ritmo del paso está medido para que el pie apoyado no patine, se inclina en las curvas, da pasitos al girar en el lugar, queda agitado después de correr y, si está quieto un rato, mira el reloj, se acomoda la corbata o estira el cuello.
- La gente camina por las veredas reales, cruza en las esquinas y el tránsito sigue las calles de verdad. Arrancan y frenan de a poco, se esquivan entre ellos (y a Gaspi), a veces se paran en la esquina o a mirar el celu, y giran la cabeza para mirar a Gaspi cuando pasa cerca.

## Estilo GTA (0.4)

- **Piñas**: combo de jab, directo, gancho y patada, con apuntado automático al más cercano. La gente se defiende, sale corriendo o queda nocaut (y se le cae la plata).
- **Armas**: palo, revólver 38, pistola 9 mm y tumbera. Clic derecho apunta sobre el hombro; sin apuntar, apunta solo. Fogonazo, trazas, chispas en las paredes, gente que se tira al piso o levanta las manos. Casquillos que rebotan en el piso, recarga animada, la mira que salta con cada tiro, agujeros de bala que quedan en paredes y veredas y astillas de revoque.
- **La Bonaerense**: estrellas de búsqueda según lo que hagas y quién te vea. Patrulleros con balizas y sirena que te persiguen por las calles (con GPS), canas a pie que te esposan o, desde dos estrellas, te tiran. Con cuatro estrellas aparece el helicóptero con reflector. Si te pierden de vista un rato, zafaste; si te agarran, comisaría, coima y te sacan los fierros.
- **Robar autos**: Gaspi va hasta la puerta, saca al conductor (que después se enoja o se raja) y arranca. Se pueden robar patrulleros.
- **Motos**: 20 motos en el tránsito (muchas de delivery con su caja). Se manejan con inclinación en las curvas, willy con Shift y, si chocás fuerte, volás.
- **Vehículos**: Duna, Gol, Falcon, 504, Fiat 600, pickup, remís, taxi, Trafic, camiones de fletes, colectivos perfilados con fileteado y carro de cartonero con caballo.
- **Manejo**: derrapes con freno de mano, marcas de frenada, humo de gomas, daño con humo; los autos se prenden fuego y explotan. Alarmas en los autos estacionados. La carrocería va sobre la suspensión (se clava al frenar, se inclina en las curvas, rebota en los choques), luces de freno, humo de escape (negro en los colectivos al arrancar), petardeos, rocío con la calle mojada y pedazos de chapa y vidrio en los choques.
- **Radio del auto** (R): cumbia, rock nacional, tango y **Flash Conurbano 89.3**, synthpop ochentoso a lo Vice City (caja de ritmos con redoblante gateado, bajo de sinte en octavas, colchones, arpegios y estribillo). Todo compuesto en el momento: no usa temas con derechos.
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
| E | Acción: pagar, comprar, dar, robar un negocio, subirse al tren o al colectivo (y bajarse) |
| F | Subir, robar o bajar de un vehículo |
| H | Bocina |
| P | Pausa y mapa |
| Rueda del mouse | Acercar o alejar la cámara |
| M | Silenciar |

En el celular los controles son como en GTA mobile y Fortnite: joystick a la izquierda (aparece donde apoyás el dedo; a fondo, Gaspi corre solo) y arrastrar a la derecha para mirar. A pie hay dos botones, Pegar o Tirar (apunta solo) y Saltar; en el auto, Freno de mano y Bocina, y Willy en la moto. Un botón celeste aparece solo cuando hay algo para hacer y dice qué hace (Subir al auto, Comprar medias, Bajarse). El arma se cambia tocándola arriba a la derecha, y ☰ abre la pausa con el mapa.

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

## Noche (0.5)

- Los faroles de sodio iluminan de verdad el piso, las paredes, los autos y la gente, con una mancha que cae como la de un farol real a 7,7 m de altura.
- Luz de las vidrieras sobre la vereda y resplandor anaranjado de la ciudad en el horizonte.
- Con lluvia, los faroles se reflejan en la calle mojada en rayas, como en el asfalto de verdad.
- Haces de luz de los faros de los autos y conos bajo los faroles cuando hay bruma o lluvia.
- Las intensidades se prueban en vivo desde la consola del navegador, por ejemplo `__gta.night.faroles = 3` (también `reflejo`, `haces` y `conos`). Los valores por defecto están en `NIGHT`, en `src/atmosphere.js`.

## Gente, animales y autos (0.6)

- **Personas** con cuerpo continuo que se dobla sin cortes en codos, rodillas y hombros, cabeza esculpida con la cara pintada, manos, zapatos y peinados. La mitad son mujeres. Hay remeras, buzos, camperas, trajes, polleras, jeans, shorts y camisetas de Argentina, Boca, River, Banfield, Temperley e Independiente. La Bonaerense tiene camisa celeste, chaleco con POLICÍA atrás y gorra. Lejos de la cámara se usa un cuerpo más liviano.
- **Movimiento**: al caminar, la rodilla se dobla en el vuelo de la pierna, se apoya el talón y la cadera sube, baja y gira. Al correr, el cuerpo se inclina y los codos van a 90°. Quietos, respiran y pasan el peso de una pierna a la otra.
- **Perros callejeros y el caballo del cartonero** con forma real y patas que se doblan en la rodilla.
- **Autos** con pintura con laca, cantos redondeados, vidrios polarizados y llantas con rayos.

## Misiones (0.7)

Después del tutorial te llaman al celu (si los motochorros te lo robaron, no te pueden llamar). Si atendés, aparece un marcador amarillo en el mapa y la misión empieza al entrar en él. Se falla si te bajan, te agarra la cana o se acaba el tiempo, y se puede volver a intentar.

- **La encomienda del Turco**: conseguí un auto y llevá la encomienda a tiempo sin romperla.
- **El celu de Doña Marta**: encontrá a los chorros, bajalos a piñas y devolvele el celu a la señora.
- **El bolso del Negro**: buscá el bolso en la estación, perdé a la Bonaerense (te caen tres estrellas) y llevalo al taller.
- **La recaudación del Turco**: dos en una moto le afanaron la caja al Turco; conseguí un auto, chocales la moto y juntá la plata que se les cae.
- **El Roca de las seis**: la cana te encuentra (dos estrellas); corré a la estación, subite al tren y viajá hasta que se calme.
- **La proteína de Ciro**: Ciro, el profe del gym, necesita un tarro de proteína de la dietética; ida y vuelta en dos minutos (mientras tanto no te busca pelea).

Al cumplirlas: plata, respeto y la próxima llamada. Cuando se terminan, vuelven a empezar con otros destinos. El avance se guarda.

## Chapa y pintura (0.8)

Dos talleres marcados con un cuadrado verde en el radar y en el mapa. Entrás despacio con el auto y por $1.500 te lo arreglan (daño, fuego y gomas pinchadas), te lo pintan de otro color y la cana te pierde: se van todas las estrellas. Es el Pay 'n' Spray del conurbano.

## Changa de remís (0.9)

Subite a un taxi o a un remís y te sale un pasajero que te llama desde la vereda ("¡Remís!"). Frená al lado para que suba y llevalo a destino antes de que se acabe el tiempo. Cada viaje seguido paga un extra que va creciendo, y cada tres viajes sumás respeto. Si te bajás, llegás tarde o le pasa algo al pasajero, se cae el viaje. No arranca si tenés una misión en curso.

## Voces (0.10)

La gente dice en voz alta lo que aparece en los globitos: vecinos, la cana, los motochorros, el corte y Gaspi. Habla uno a la vez, el más cercano (a menos de 24 m), con voz de hombre o de mujer y un tono distinto para cada uno. Las llamadas de las misiones también se escuchan. Usa la voz en español que traiga el celu o la compu (argentina si la tiene); si no hay ninguna, quedan solo los globitos. El botón de sonido también las calla.

## Coimas, figuritas y porcentaje (0.11)

- **Coimas**: estrellas amarillas en la calle (también en el radar). Si te busca la cana, agarrás una y se va una estrella. Reaparecen a los 4 minutos.
- **Figuritas**: 30 escondidas por Temperley, sin luz ni marca en el mapa. A las 10: $15.000 y chaleco; a las 20: la tumbera; a las 30: $50.000 y +5 de respeto. Se guardan.
- **Porcentaje**: en la pausa, cuánto del juego completaste (tutorial, misiones y figuritas).
- **Picadas**: en una avenida hay una largada marcada con un aro rojo (cuadradito rojo en el mapa). Llegá en auto, frená adentro y apretá E: tres autos del barrio largan con vos, con cuenta regresiva. Hay que pasar por los aros rojos en orden; el primero en llegar cobra $5.000 ($8.000 de noche) y el segundo, una parte. Los autos rivales quedan estacionados donde frenan.
- **Interiores**: E en la puerta de la estación te mete al hall (boletería, molinetes, bancos y el cartel de próximos trenes), con salida a la calle o a los andenes. El kiosco más cercano a la estación también se puede visitar: en el mostrador comprás un alfajor o una gaseosa que te suben la vida. Con la cana atrás no te dejan entrar.
- **Tren y colectivo de pasajero**: con el tren parado en el andén, E te sube (SUBE $650) y viajás hasta la próxima estación; volvés en el de la vuelta media hora después y, si te buscaba la cana, te perdió el rastro. El colectivo frena en las paradas reales del mapa: E para subirte (SUBE $700) y E para bajarte cuando frena.
- **Muerte a lo GTA**: cámara lenta, la imagen se va a blanco y negro y entra el "TE BAJARON".

## Armas nuevas y armería (0.12)

- **Motosierra**: la tenés siempre (se elige como cualquier arma). Mientras apretás, corta sin parar y el que agarra queda enganchado.
- **Bastón presidencial**: puño de oro con borlas celeste y blanca, y hoja de espada. Hay uno en una plaza cerca de la estación y se compra en la armería.
- **Metra**: automática, 30 balas por cargador.
- **Molotov**: la botella vuela en arco y deja fuego en el piso unos segundos (quema gente y autos, y a vos si te quedás adentro).
- **Armería "El Tano"** (cuadrado rojo en el mapa): entrás a pie y comprás metra, molotovs, balas para todas tus armas o el bastón.

## Changa de patrullero (0.14)

En la puerta de la comisaría hay un patrullero estacionado (o robale uno a la cana). Al subirte te avisan dónde andan unos motochorros: chocalos para bajarlos antes de que pasen 100 segundos. Cada nivel paga más ($3.500, $5.000, $6.500...) y suma respeto. Se corta si te bajás o se escapan.

## Look Vice City (0.15)

- **Atardecer**: el cielo se pone rosa coral en el horizonte y violeta arriba, el sol rojizo, y la imagen toma un toque magenta.
- **Filtro PS2**: como en la PlayStation 2, las luces fuertes dejan estela al moverte (sobre todo de noche), y la imagen tiene el filtro de color de Vice City: día dorado con resplandor suave, atardecer rosa, noche azul violácea.
- **Ropa pintada**: como los personajes de la PS2, la tela trae sombra pintada en los costados, pliegues con luz y sombra, y costuras con puntadas; el jean, gastado adelante.
- **Autos de los 80**: gomas con banda blanca en los clásicos (Falcon, 504, Fiat 600, Duna, pickup), colores pastel en el tránsito (rosa, turquesa, crema, celeste, menta, coral) y reflejos más fuertes en la pintura y los cromados.
- **Destellos y palmeras**: faroles y faros con destello en estrella de noche (las "coronas" de Vice City), palmeras en las plazas y fachadas con pasteles (rosa, agua, amarillo, lavanda, celeste, durazno).
- **Neón**: la mitad de los carteles de negocios tienen un marco de tubo de neón (rosa, celeste, violeta o verde) que se prende de noche.

## Radio con locutor (0.16)

Al prender la radio el locutor presenta la emisora, y entre tema y tema habla o pasa una publicidad trucha del barrio (la pizzería, El Turco, el gym El Kaiser, chapa y pintura, la armería...). La música baja mientras habla. Usa la misma voz del navegador que la gente.

## Saltos insólitos (0.17)

Ocho rampas amarillas con franjas negras en calles largas. Si entrás rápido (más de 40 km/h) por el lado bajo, el auto vuela en cámara lenta y al caer te pagan por largo y alto. El primer salto de cada rampa suma respeto y cuenta para el porcentaje de la pausa.

## Modelos de internet (0.18)

- **La Ferrari de Ciro**: Ferrari 458 Italia estacionada frente al gym El Kaiser, el auto más rápido del juego. Modelo de [vicent091036](https://sketchfab.com/models/57bf6cc56931426e87494f554df1dab6) en Sketchfab, tomado del ejemplo de autos de three.js. El original (359.000 triángulos, con Draco) colgaba Safari en el iPhone por memoria: se simplificó una vez con glTF-Transform a ~50.000 triángulos sin compresión, y las dos Ferrari comparten esa geometría.

## Laban the Creator (0.19)

Por las calles de la estación pasea **Laban the Creator** en una Ferrari amarilla descapotable: traje y sombrero blancos (estilo Alan Faena) y anteojos, con tres chicas fit arriba (una de acompañante y dos sentadas en la cola, saludando). Va despacio tirando facha, toca bocina y grita cosas cuando pasa cerca de Gaspi. Se la podés robar: Laban cae al piso gritando "¡Mi Ferrari! ¡Esto lo creé yo!" y las chicas salen corriendo.

## Policía que escala (0.23)

Ahora hay **6 estrellas**. Desde 3, si vas en auto, la cana arma **retenes**: dos patrulleros cruzados en una calle adelante tuyo, con canas armados (esquivalo o rompelo). Con 6 estrellas llega la **Gendarmería** en camionetas verde oliva, más rápido y en más cantidad.

## Changas de paramédico y bombero (0.22)

Como las misiones de ambulancia y bomberos de Vice City. La **ambulancia** está estacionada frente a un centro de salud real del mapa: subite y te avisan dónde hay un herido; frená al lado para subirlo y llevalo al centro de salud más cercano antes de que se acabe el tiempo. La **autobomba** está a una cuadra de la estación: te avisan de un auto prendido fuego; frená cerca y quedate unos segundos para apagarlo (si no llegás, explota). Cada viaje seguido sube el nivel y paga más. Vehículos del Car Kit de Kenney (CC0), sacados de [pmndrs/market-assets](https://github.com/pmndrs/market-assets).

## Autos que se abollan (0.21)

Como en Vice City, la chapa se hunde donde pega el golpe (choques, tiros, explosiones) y queda arrugada; con mucho daño se rompen los vidrios, sale humo del motor y al final se prende fuego. Chapa y pintura (o que el auto vuelva al tránsito) lo deja como nuevo.

## Personas con modelo de artista (0.20)

Los vecinos (3 de cada 4) y la policía ahora son modelos low-poly con textura pintada, al estilo de Vice City: 11 personas CC0 de elbolilloduro (varones, mujeres, médico, policía hombre y mujer), sacadas de [Mesh2Motion](https://github.com/scottpetrovic/mesh2motion-app). Se animan con las mismas poses de siempre (caminar, piñas, celular, sentarse, caerse) gracias a `src/rig.js`, que traduce nuestro esqueleto a cualquier esqueleto humanoide estándar. Las armas de la cana se cuelgan de su mano.

Los perros también son un modelo CC0 de Mesh2Motion, con animaciones de verdad (quieto, caminar, correr, ladrar) y distintos tonos de pelo, y el caballo del carro del cartonero también.

## Gym El Kaiser (0.13)

Box de CrossFit a unos 70 m de la estación (cuadrado amarillo en el mapa): galpón negro con el portón levantado, el cartel del lobo arriba y el mismo logo en la pared del fondo, racks rojos, discos, cajones y kettlebells. Adentro entrenan los musculosos (dominadas, sentadilla y press) y El Kaiser te recibe en la puerta. Si les pegás, se defienden, y aguantan más que un vecino.

**Las chicas fit**: cinco chicas entrenando entre los musculosos (sentadilla, press y dominadas), con musculosa, calzas de colores y colita o rodete.

**Ciro, el profe**: en cuero, el doble de grande que cualquiera y con ganas de pelear. Si pasás cerca a pie, te encara: pega desde más lejos, fuerte, y con el gancho te tira al piso. Aguanta muchísimo (la motosierra ayuda).

## Estructura

| Archivo | Qué hace |
| --- | --- |
| `src/map.js` | Carga el mapa real: calles, esquinas, búsquedas de calle cercana y altura del piso |
| `src/city.js` | Construye la ciudad 3D a partir del mapa |
| `src/props.js` | Semáforos, carteles de calle, paradas, canastos, contenedores, antenas |
| `src/textures.js` | Fachadas, rejas, carteles, pasacalles (canvas) |
| `src/body.js`, `src/human.js` | Cuerpos por perfiles con pesos suaves; personas, caras, ropa y animaciones |
| `src/animals.js` | Perros y el caballo del carro |
| `src/vehicles.js`, `src/cars.js` | Autos, colectivos, motos, camiones y trenes |
| `src/player.js` | Gaspi: caminar, saltar, robar vehículos, manejar con derrape, cámara |
| `src/combat.js`, `src/weapons.js` | Piñas, armas, tiros, explosiones |
| `src/police.js` | Estrellas, patrulleros, canas y helicóptero |
| `src/pickups.js` | Plata, armas, milanesas y chalecos para levantar |
| `src/traffic.js`, `src/nav.js` | Tránsito con IA y caminos por las calles (GPS) |
| `src/npcs.js` | Vecinos, trapitos, gente pidiendo, perdidos, vendedor de medias, perros |
| `src/crime.js` | Motochorros |
| `src/events.js` | Cortes, marchas y noticias |
| `src/rig.js`, `src/people.js` | Retarget a esqueletos estándar y personas con modelo CC0 |
| `src/rescue.js` | Changas de paramédico y bombero (ambulancia y autobomba) |
| `src/laban.js` | Laban the Creator y su Ferrari descapotable |
| `src/models.js` | Modelos bajados de internet (la Ferrari) |
| `src/palms.js` | Palmeras de las plazas (instanciadas) |
| `src/stunts.js` | Rampas y saltos insólitos con cámara lenta |
| `src/gym.js` | Gym El Kaiser: galpón, cartel, racks y los musculosos entrenando |
| `src/missions.js` | Misiones: llamadas, marcador, etapas, premio |
| `src/transit.js` | Tren y colectivo de pasajero |
| `src/interiors.js` | Interiores: hall de la estación y kiosco |
| `src/races.js` | Picadas: carreras callejeras con aros y rivales |
| `src/trains.js` | Trenes, barreras y pasos a nivel |
| `src/radio.js`, `src/audio.js` | Radio y sonidos sintetizados |
| `src/fx.js` | Partículas, trazas, marcas de frenada, casquillos, agujeros de bala, restos de choque, lluvia y salpicaduras |
| `src/carfx.js` | Escape, petardeos y rocío de los autos andando |
| `src/hud.js`, `src/style.css` | Tarjeta SUBE, estrellas, minimapa, mapa grande, zócalo, diálogos |
| `src/sky.js`, `src/atmosphere.js`, `src/post.js`, `src/glow.js` | Cielo, bruma con altura y sol, oclusión ambiental (N8AO), gradeo de color y luces de noche |

## Relevamiento de las 5 cuadras

En `/relevamiento.html` (por ejemplo https://gta-6-conurba.vercel.app/relevamiento.html) hay un mapa de los edificios, plazas y escuelas a unas 5 cuadras de la estación. Tocás cada uno y cargás cómo es en la realidad: nombre como dice el cartel, rubro, dirección, colores, persiana/toldo, pisos y una foto propia del frente. Queda guardado en el celu y se exporta a JSON para sumarlo al juego (`src/data/relevamiento.json`). El botón 📍 muestra dónde estás parado.

## Pendiente

El plan completo y ordenado está en [`PLAN.md`](PLAN.md).


- Interiores (el kiosco, la estación por dentro).
