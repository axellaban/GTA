# GTA VI Conurba · Temperley

Juego de mundo abierto en el navegador, ambientado alrededor de la estación Temperley (Línea Roca, Lomas de Zamora). Hecho con Three.js, sin motor ni assets externos: todo (casas, rejas, trenes, gente) se genera por código.

Jugás con **Gaspi** (saco, camisa blanca, corbata a rayas rojas y blancas).

Al tocar **Jugar** aparece una presentación cinematográfica de 36,875 segundos con nueve planos y tres segundos de cierre negro de
Gaspi y el barrio, música de **Los Pibes Chorros — Sentimiento villero** suministrada por el dueño
y el cierre **TRIBUTO A GASPI**. El diálogo original de la señora, cuarto plano, se escucha con música de fondo ajustada;
la última escena conserva su audio y la música. La canción empieza desde su segundo 9.
Podés saltearla con el botón, una tecla o un toque, y repetirla desde **Ver la intro** en la pausa.
La opción **Sin sonido** también silencia la presentación. El video se carga al reproducirlo.


> **¿Seguís el proyecto (persona o IA)?** Empezá por [`PLAN.md`](PLAN.md): reglas, cómo probar sin GPU y qué falta, en orden.

## Qué hay en esta versión (0.1)

- **La estación**: edificio del Ferrocarril del Sud sobre Av. Meeks 1400, 10 andenes con techo, puente peatonal hacia Fray Justo Sta. María de Oro, carrito de panchos.
- **Trenes del Roca**: eléctricos a Glew y Ezeiza, el diésel del ramal Haedo (va y vuelve), paradas en andén, bocina, **barreras que bajan** y campana en los pasos a nivel. Si te agarra el tren, perdiste.
- **Rejas en las casas**: cada casa tiene fachada con rejas en ventanas y reja al frente con portón, tanque de agua en la terraza, pintadas, cables y zapatillas colgadas.
- **Trapitos**: si dejás el auto cerca, vienen a cobrarte $3.000. Si no pagás, al volver tenés el auto rayado y una goma pinchada (el auto tira y anda más lento).
- **Motochorros**: aparecen cada un rato, te apuran y te piden el celu. Podés dárselo, resistirte (sale bien a veces) o salir corriendo. Si se lo llevan, perseguilos con un auto y volteálos para recuperarlo.
- **Gente pidiendo** en la vereda (E para darles $500, suma respeto).
- **Perdidos que deambulan** medio zombies: se te pegan y te frenan; de noche hay más.
- **Cortes de calle y marchas** (lo central): cortes con gomas quemándose, pasacalles, bombos y gente que no te deja pasar con el auto (despacio te golpean el capot; a toda velocidad rompés el corte, pisás a los que no se corren y suben las estrellas). A los manifestantes se les puede pegar y tirar como a cualquiera, y los compañeros salen a defenderlos. El pasacalles se cae si lo choca un auto, lo patean o le cae una explosión; la bandera de la marcha se viene abajo si voltean a uno de los que la llevan. Las marchas avanzan por las avenidas. El tránsito se traba, toca bocina y pega la vuelta. Todo sale en el zócalo de noticias.
- Tránsito con IA, colectivos, perros que persiguen motos, ciclo de día y noche con faroles de sodio, minimapa, plata, salud y respeto.

## Gráficos (0.2)

- **Cielo** con nubes que se mueven, sol con halo, atardecer naranja, luna y estrellas.
- **Postprocesado**: resplandor (bloom), viñeta y un gradeo de color cálido, al estilo Vice City.
- **Personajes** con esqueleto (rodillas, codos, cuello), cuerpo con volumen y cara dibujada; Gaspi tiene su foto como cara.
- **Autos** con carrocería perfilada (Falcon, Duna, Gol, pickup, patrullero, remís), vidrios y cromados que reflejan el cielo, llantas, parrilla y patentes Mercosur.
- **Ciudad**: árboles con follaje de hojas, balcones con rejas, toldos a rayas en los locales, parapetos y cornisas, sendas peatonales, cordones y tapas de cloaca, estación de ladrillo.
- **Noche**: ventanas y vidrieras que se prenden, halos en faroles, faros y luces traseras, foco del auto de Gaspi y el fuego de los cortes brillando.
- Gráficos siempre en calidad alta. Para que ande fluido también en pantallas grandes, se dibuja como máximo lo equivalente a Full HD, y la resolución baja o sube sola según los cuadros por segundo (resolución dinámica, como en GTA V o Fortnite). Si agregás `?fps` al final del link aparece un contador. Si el navegador no usa la placa de video, el juego avisa. La rueda del mouse acerca o aleja la cámara.

### Modo Vice City

El juego se ve como Vice City:
HUD clásico (reloj celeste, plata con ocho cifras, corazón rosa, recuadro rosa del arma y radar con borde
rosa), el nombre de la calle en cursiva que aparece y se va, filtro de la PS2 más marcado (resplandor,
colores pastel, atardecer rosa y noche violeta), casas pastel, palmeras en las veredas y autos ochentosos.
Todo hecho por código para este juego. Para ver el look anterior, agregá `?vc=0` al final del link
(https://gta-6-conurba.vercel.app/?vc=0).

### Piezas hechas en Blender

Las columnas de hierro fundido (con capitel y ménsulas), la puntilla de madera del borde de los techos y el
relieve de la chapa acanalada se modelan en Blender con un script (`python3 tools/blender/anden.py`, con
`pip install bpy`), con la sombra de contacto horneada. También la palmera (hoja modelada y renderizada como
textura, `tools/blender/palmera.py`) y el farol de la calle (palo de madera con cruceta, brazo curvo y
carcasa tipo cobra, `tools/blender/farol.py`) y las molduras del edificio de la estación: arcos con clave,
jambas, alféizares, cornisa, guarda entre pisos y zócalo (`tools/blender/estacion.py`). Los árboles de la vereda
(fresno, tipa, jacarandá y palo borracho) tienen tronco con ramas y copa de ramilletes con las hojas y las flores
modeladas y renderizadas en Blender (`tools/blender/arboles.py`), y el semáforo, el refugio de colectivo, el
contenedor de basura y los tanques de agua de los techos salen de `tools/blender/mobiliario.py`, y los canastos
de basura de metal desplegado, de `tools/blender/canasto.py`. La parroquia tiene su campanario y las capillas su
espadaña (`tools/blender/iglesia.py`). En los terrenos, jardines y plazas hay matas de pasto, yuyos y flores
modeladas en Blender (`tools/blender/pasto.py`) que se reparten alrededor de la cámara (`src/pasto.js`). Los
coches del Roca tienen carrocería redondeada, bogies con ruedas, pantógrafo y cabina con parabrisas
(`tools/blender/tren.py`). Las casas
tienen cornisa moldurada y aires acondicionados split, los techos de tejas su cumbrera y sus cenefas, y los
comercios toldos de brazos con festones, hechos en Blender (`tools/blender/casas.py`), y las
ventanas y puertas, alféizar, guardapolvo, jambas, umbral y persianas de enrollar (`tools/blender/aberturas.py`).
Por las vidrieras de los locales se ve el negocio por dentro, con fondo y perspectiva al pasar: almacén con
mostrador de golosinas y góndola, farmacia u óptica, ropa con percheros y maniquí, y panadería con la vitrina de
facturas, según el rubro del cartel, cada uno con el que atiende (`tools/blender/locales.py`, "interior mapping":
el vidrio sigue la mirada hacia adentro y la busca en las fotos de Blender). Cada pieza cuesta los mismos
triángulos que la de antes o poco más, y si no carga queda la anterior.

### Materiales de calles y veredas

El asfalto y las baldosas usan fotos de 1K con mapas de relieve y rugosidad, a escala real,
sin sumar polígonos. Se sirven con el juego y, si falla una descarga, quedan las texturas
dibujadas. Materiales CC0 de Poly Haven: [Asphalt 02](https://polyhaven.com/a/asphalt_02)
de Rob Tuytel y [Concrete Pavement](https://polyhaven.com/a/concrete_pavement) de Charlotte
Baglioni. Fuentes y presupuesto de memoria en `public/textures/CREDITS.md`.

### Ladrillo y revoque de foto en las fachadas

Las paredes de ladrillo a la vista (la estación, las casas de ladrillo, las sin revocar) usan una
foto de ladrillo de verdad, apoyada en metros sobre cada pared y con el tono de cada casa; las
revocadas suman las manchas y el grano de un revoque gastado. El relieve sale de la misma foto
(el sol marca las juntas). Las ventanas, puertas, carteles y pintadas siguen dibujadas encima.
Fotos CC0 de Poly Haven, todas de Rob Tuytel: [Red Bricks 04](https://polyhaven.com/a/red_bricks_04),
[Large Red Bricks](https://polyhaven.com/a/large_red_bricks) y
[Plaster Grey 04](https://polyhaven.com/a/plaster_grey_04). Pesan 820 KB en total
(`python3 scripts/fachadas.py` las rearma); si no cargan, las fachadas quedan como antes.

Para comparar la misma calle de día, al atardecer y con lluvia: `npm run dev` y abrir
`/tools/graphics.html`. La herramienta es solo de desarrollo.

## Temperley real (0.3)

- **Mapa real** de 1,2 km alrededor de la estación (y desde la 0.38 dos franjas más: al norte por Almirante Brown hasta Cerrito y al este por Eva Perón hasta Emilio Castro), sacado de Overture Maps (datos de OpenStreetMap y huellas de edificios): calles con su nombre y ancho, vías, andenes, la playa de maniobras, casi 3.000 edificios con su forma real, plazas, canchas, árboles, faroles y semáforos.
- Los negocios reales tienen su cartel; sobre Av. Meeks, Almirante Brown y alrededor de la estación la planta baja es comercial.
- **Gaspi se mueve como una persona**: el ritmo del paso está medido para que el pie apoyado no patine, se inclina en las curvas, da pasitos al girar en el lugar, queda agitado después de correr y, si está quieto un rato, mira el reloj, se acomoda la corbata o estira el cuello.
- La gente camina por las veredas reales, cruza en las esquinas y el tránsito sigue las calles de verdad. Arrancan y frenan de a poco, se esquivan entre ellos (y a Gaspi), a veces se paran en la esquina o a mirar el celu, y giran la cabeza para mirar a Gaspi cuando pasa cerca. Hay grupitos charlando en la vereda: se turnan para hablar, gesticulan, asienten, y con los tiros se dispersan.

## Estilo GTA (0.4)

- **Piñas**: combo de jab, directo, gancho y patada, con apuntado automático al más cercano. La gente se defiende, sale corriendo o queda nocaut (y se le cae la plata).
- **Lugares del barrio**: el **Colegio Eccleston** (Almirante Brown 3342: los edificios dentro del predio de OSM son la escuela, con su cartel; lo mismo para cualquier escuela con nombre) y la **estación de servicio Shell** de Av. Eva Perón y Almirante Brown (`src/nafta.js`): marquesinas con la banda amarilla y roja sobre columnas, surtidores, el cartel alto con los precios, minimercado y luces de noche. Como en GTA, los surtidores explotan si les tirás, los chocás fuerte o les cae una explosión, y prenden al de al lado. Del nombre real va solo el texto, sin logo.
- **Mapa con íconos a lo GTA**: armería, chapa y pintura, gym, comisaría, hospitales, estación, panchos, medias, kiosco, picadas, cortes, changas (paramédico, bombero, delivery), el plato volador y los objetos del piso, cada uno con su ícono. En el minimapa quedan derechos aunque el mapa gire, y la misión ofrecida (con la inicial de quien la da) y el OVNI se pegan al borde si están lejos. El mapa de pausa (P) trae la leyenda.
- **Plato volador**: cada tanto baja un OVNI al lado del carrito de panchos de la estación (luces que giran, zumbido de theremin, la gente lo filma). Se baja un marciano verde, pide "dos completos" y se pone a comer. Mientras come, acercate y robale la nave (F): volás con WASD (o el joystick) mirando con el mouse, Espacio sube, Shift baja; clic tira un rayo que hace volar lo que toca y clic derecho (o R) prende el rayo tractor, que levanta autos y gente: soltalos desde arriba. Para bajarte, aterrizá y F. El marciano te putea y, si dejás la nave, se la lleva. ¿Apurado? Escribí OVNI.
- **Armas**: palo, revólver 38, pistola 9 mm, tumbera, ametralladora (cinta de 100, patea y voltea) y bazuca (cohete con estela que hace volar autos). En la armería, escondidas en el mapa o con el truco: escribí FIERROS. Mantené clic derecho para apuntar sobre el hombro: aparece la mira y baja la dispersión. Clic izquierdo dispara con o sin apuntado; sin apuntar conserva la asistencia hacia enemigos cercanos, sin mira permanente. Fogonazo, trazas, chispas en las paredes, gente que se tira al piso o levanta las manos. Casquillos que rebotan en el piso, recarga animada, la mira que salta con cada tiro, agujeros de bala que quedan en paredes y veredas y astillas de revoque.
- **La Bonaerense**: estrellas de búsqueda según lo que hagas y quién te vea. Patrulleros con balizas y sirena que te persiguen por las calles (con GPS), canas a pie que te esposan o, desde dos estrellas, te tiran. Con cuatro estrellas aparece el helicóptero con reflector. Si te pierden de vista un rato, zafaste; si te agarran, comisaría, coima y te sacan los fierros.
- **Robar autos**: Gaspi va hasta la puerta, saca al conductor (que después se enoja o se raja) y arranca. Se pueden robar patrulleros.
- **Motos**: 20 motos en el tránsito (muchas de delivery con su caja). Se manejan con inclinación en las curvas, willy con Shift y, si chocás fuerte, volás.
- **Vehículos**: Duna, Gol, Falcon, 504, Fiat 600, pickup, remís, taxi, Trafic, camiones de fletes, colectivos perfilados con fileteado y carro de cartonero con caballo.
- **Colisiones y vuelcos**: las carrocerías de todos los vehículos son sólidas, incluso con centros idénticos, en cruces y choques rápidos. Los autos del puente no chocan con los del bajo nivel. El tránsito intenta destrabarse sin atravesar otros autos. Un giro cerrado sostenido a alta velocidad o un golpe lateral fuerte puede volcar un auto, y el vuelco tiene física de verdad: el auto sale despedido para el lado de afuera girando sobre su sección (ruedas, puertas, parabrisas y techo, que es más angosto), cada golpe contra el asfalto rebota, larga chispas y polvo, abolla y te sacude, y se arrastra frenando hasta quedar apoyado de lleno sobre un lado: sobre el techo, de costado o sobre el parabrisas. Si cae parado sobre las ruedas, seguís manejando. Volcado, soltá la dirección y después mantené A/D o el joystick hacia un lado para enderezarlo; también podés bajarte con F o el botón contextual.
- **Manejo**: los choques descentrados te hacen pegar un trompo y al otro auto lo corren girando; raspando paredes saltan chispas; los postes de luz se voltean (y se apagan) si los llevás puestos rápido. Los **canastos de basura** de las casas se rompen: un auto (o una moto) los lleva puestos, el caño se dobla hasta el piso y el canasto sale volando dando vueltas, la bolsa revienta y la basura queda desparramada; con una piña se sacude y con la segunda (o una patada, un palazo o un tiro) se suelta del caño y cae, y una explosión los vuela. Derrapes con freno de mano, marcas de frenada, humo de gomas, daño con humo; los autos se prenden fuego y explotan: vuelan dando vueltas (a veces caen dados vuelta), sueltan rueda, puerta y capó, empujan a los autos de al lado, que se prenden y revientan en cadena, y tiran a la gente por el aire. Bola de fuego, onda expansiva, brasas, escombros humeantes y la quemadura que queda en el piso. Alarmas en los autos estacionados. La carrocería va sobre la suspensión (se clava al frenar, se inclina en las curvas, rebota en los choques), luces de freno, humo de escape (negro en los colectivos al arrancar), petardeos, rocío con la calle mojada y pedazos de chapa y vidrio en los choques. De noche con la calle mojada, los faros y las luces de freno se reflejan estirados en el asfalto. El que maneja sube y baja **por la izquierda** (como en la Argentina): el volante, el asiento y la puerta del conductor están de ese lado en todos los autos, y el que sacás de un auto robado cae de ese lado. Gaspi agarra la manija, abre la puerta, se agacha, mete una pierna y se sienta (se lo ve adentro por la ventanilla, también en la Ferrari, con las manos en el volante, que gira con la dirección) y cierra; al bajar empuja la puerta, saca las piernas, se para y la cierra. En la moto pasa la pierna por arriba del asiento y agarra el manubrio, y al bajar la deja con la pata. Si apretás F andando, se tira: sale rodando por el piso, se lastima según la velocidad y el auto sigue de largo hasta frenar o chocar. La puerta se cierra de un portazo (y queda abierta si saliste volando) y con muchos golpes se cae el paragolpes.
- **Radio del auto** (R): cumbia, rock nacional, tango y **Flash Conurbano 89.3**, synthpop ochentoso a lo Vice City (caja de ritmos con redoblante gateado, bajo de sinte en octavas, colchones, arpegios y estribillo). Todo compuesto en el momento: no usa temas con derechos.
- **Clima**: se larga a llover, las calles se mojan y brillan, relámpagos y truenos.
- **Radar y mapa de pausa Vice City**: plano crema, parques menta, estación coral y GPS rosa, íconos claros y norte. El mapa grande (P o tocando el radar) permite arrastrar, acercar hasta 4× y ubicar a Gaspi, con nombres de calles sin encimarse y escala en metros. Al acercarse aparecen los objetos del piso. Menú adaptable al celular en vertical y horizontal.
- **Changas**: robás un negocio con un fierro en la mano, hacés deliveries en la moto con caja, levantás armas, milanesas (vida) y chalecos.
- **Los vecinos postean** lo que hacés: persecuciones, explosiones, willys.
- **El vendedor de medias** en la estación: tres pares $2.000 y corrés más rápido un rato.
- **El panchero** atiende el carrito de la puerta de la estación: un pancho $1.500 (vida). Si lo asustás o lo bajás, no hay panchos.
- La partida se guarda sola en el navegador.

## Controles

| Tecla | Acción |
| --- | --- |
| WASD / flechas | Moverse o manejar |
| Mouse | Mirar (clic para capturar el mouse) |
| Clic izquierdo | Pegar (combo) o disparar, con o sin apuntado |
| Clic derecho | Apuntar: mira, cámara sobre el hombro y mayor precisión. Mantenido, apunta mientras lo apretás; un toque corto (dos dedos en el trackpad, o Ctrl + clic en la Mac) deja la mira prendida hasta otro toque, y con la mira prendida el clic tira |
| Q · 1 a 9 | Cambiar de arma: 1 piñas, 2 motosierra / bastón / palo, 3 revólver / pistola, 4 tumbera, 5 metra, 6 ametralladora, 7 molotov, 8 bazuca, 9 lanzallamas (apretando de nuevo el mismo número se pasa a la otra de ese grupo) |
| R | Recargar · cambiar la radio arriba del auto |
| Espacio | Saltar · freno de mano |
| Shift | Correr · nadar a fondo (crol) · willy en la moto · quemar gomas |
| C · Ctrl · clic | Nadando en lo hondo: bucear (abajo del agua W nada para donde mirás con el mouse, Espacio sube y C baja) |
| E | Acción: pagar, comprar, dar, robar un negocio, subirse al tren o al colectivo (y bajarse), mirar el show de drones, sacarte una foto con Messi |
| F | Subir, robar o bajar de un vehículo |
| H | Bocina |
| P | Pausa y mapa |
| Rueda del mouse | Acercar o alejar la cámara |
| M | Silenciar |

En el mapa: arrastrá para recorrer, acercá con la rueda, los botones **+ / −** o una pinza con dos dedos. **Ubicar a Gaspi** centra su zona y **Ver todo** vuelve al plano completo. Con el mapa enfocado, las flechas desplazan y **+ / −** cambian el zoom; **Escape** o **Seguir jugando** vuelven a la partida.

En el celular los controles son como en GTA mobile y Fortnite: joystick a la izquierda (aparece donde apoyás el dedo; a fondo, Gaspi corre solo) y arrastrar a la derecha para mirar. A pie están Pegar y Saltar; con un arma, **Apuntar** activa o desactiva la mira y **Disparar** funciona en ambos modos. Arrastrar desde Disparar permite dirigir el tiro con el mismo dedo; en el auto, Freno de mano y Bocina, y Willy en la moto. Un botón celeste aparece solo cuando hay algo para hacer y dice qué hace (Subir al auto, Comprar medias, Bajarse). El arma se cambia tocándola arriba a la derecha, y ☰ abre la pausa con el mapa.

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
python3 fetch.py                                   # baja de Overture Maps la zona del mapa (area.py)
python3 preprocess.py ../../src/data/temperley.json  # calles, veredas, manzanas, edificios, árboles, etc.
# o, para sumar franjas nuevas sin tocar lo que ya está:
python3 preprocess.py --ext ext.json && python3 merge.py ext.json
python3 osm_pois.py                                # negocios con nombre de OpenStreetMap -> src/data/osm.json
python3 places_extra.py                            # más negocios de Overture (confianza media) -> src/data/places.json
python3 osm_streets.py                             # revisa los nombres de las calles contra OSM y los corrige
```

`src/map.js` le pone a cada local el nombre real de OSM (la huella que contiene el punto, o la más
cercana con frente a la calle); lo cargado a mano en el relevamiento tiene prioridad. Los de
`places.json` solo van a huellas que todavía no tienen nombre.

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

Dos talleres marcados con un cuadrado verde en el radar y en el mapa, cada uno con su portón verde y el cartel. Cuando te acercás con un auto sube la persiana; entrás despacio al marcador y el auto se mete solo en el taller, la cámara queda en la calle, baja la persiana y se escucha el soplete y el compresor (con chispas que se escapan por abajo). Al rato sube la persiana y sale el auto arreglado (daño, fuego y gomas pinchadas) y de otro color, por $1.500, y la cana te pierde: se van todas las estrellas. Es el Pay 'n' Spray del conurbano.

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
- **Armería "El Tano"** (cuadrado rojo en el mapa), a lo Ammu-Nation: entrás a pie al local y las armas están colgadas en las paredes con el precio; te parás enfrente y la comprás (revólver, pistola, tumbera, metra, molotovs, ametralladora, lanzallamas, bazuca, bastón, chaleco y balas). El Tano atiende atrás del mostrador con la escopeta: si le apuntás, le pegás o le tirás, es bravo y te recaga a escopetazos (y culatazos de cerca). Si lo bajás, te llevás lo que quieras gratis; al rato ponen otro y reponen.

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

- **El Ferrucho de Ciro**: superdeportivo italiano de los 80 (parodia, como los autos de los GTA), rojo, estacionado frente al gym El Kaiser. Modelado en Blender (`tools/blender/autos.py`): cuña baja y ancha con los costados redondeados, faros escamoteables, aletas laterales hasta la toma de aire, rejilla negra de punta a punta atrás con las luces detrás, escapes cromados, llantas de 5 rayos con tuerca central y el interior de cuero a la vista (butacas, tablero y volante). El amarillo descapotable de Laban es la versión sin techo. Reemplazó a una Ferrari bajada de internet cuya licencia no se podía confirmar.
- **Autos de alta gama** (también de Blender, parodias sin marcas): el **Furia** (superdeportivo de ahora, bajísimo, con tomas enormes, alerón y llantas negras de 10 rayos: el auto más rápido del juego), el **GT** (gran turismo de capó larguísimo y cola fastback), el **sedán ejecutivo** (parrilla y molduras cromadas, cuatro puertas) y la **4x4 de lujo** (techo negro "flotante" y barras en el techo). Uno de cada ocho autos de la calle es de alta gama, con colores de su clase.
- **Los autos de la calle, también de Blender** (`tools/blender/clasicos.py`, con las mismas herramientas que los de alta gama; parodias sin marcas ni logos): el **Duna** (tres cajas de los 80 con faros rectangulares y paragolpes negros envolventes), el **Gol** (hatchback de tres puertas), el **Falcon** (capó larguísimo, parrilla cromada con cuatro faros redondos, paragolpes y molduras cromadas y cubiertas con banda blanca), el **504** (faros trapezoidales y la luneta larga), el **600** (redondito, faros en los guardabarros y el motor atrás con sus rejillas), la **pickup** (con la caja abierta, forrada y con los pasarruedas adentro), la **Trafic** (de carga, sin ventanillas atrás, con la puerta corrediza y las dos de atrás), el **patrullero** de la Bonaerense (azul con las puertas y el techo blancos, baliza y burro), el **taxi** porteño (negro con techo amarillo y el cartelito) y el **remís**. Todos tienen el interior a la vista, la puerta del conductor y el capó que se abren de verdad (el capó se levanta y deja ver el motor), los paragolpes que se caen enteros con los golpes, patentes de su época (la negra, la blanca del 95 o la del Mercosur) y el kit de tuning con franjas y alerón. Cada uno, con las cuatro ruedas, entre 8.600 y 12.600 triángulos. Mientras cargan andan los hechos por código, y el tránsito pasa a los nuevos cuando terminan.

## Laban the Creator (0.19)

Por las calles de la estación pasea **Laban the Creator** en un Ferrucho amarillo descapotable: traje y sombrero blancos (estilo Alan Faena) y anteojos, con tres chicas fit arriba (una de acompañante y dos sentadas en la cola, saludando). Va despacio tirando facha, toca bocina y grita cosas cuando pasa cerca de Gaspi. Se la podés robar: Laban cae al piso gritando "¡Mi Ferrucho! ¡Esto lo creé yo!" y las chicas salen corriendo.

## Policía que escala (0.23)

Ahora hay **6 estrellas**. Desde 3, si vas en auto, la cana arma **retenes**: dos patrulleros cruzados en una calle adelante tuyo, con canas armados (esquivalo o rompelo). Con 6 estrellas llega la **Gendarmería** en camionetas verde oliva, más rápido y en más cantidad.

## Changas de paramédico y bombero (0.22)

Como las misiones de ambulancia y bomberos de Vice City. La **ambulancia** está estacionada frente a un centro de salud real del mapa: subite y te avisan dónde hay un herido; frená al lado para subirlo y llevalo al centro de salud más cercano antes de que se acabe el tiempo. La **autobomba** está a una cuadra de la estación: te avisan de un auto prendido fuego; frená cerca y quedate unos segundos para apagarlo con el cañón de agua (se ve el chorro en arco, las gotas y el vapor; si no llegás, explota). Cada viaje seguido sube el nivel y paga más. Vehículos del Car Kit de Kenney (CC0), sacados de [pmndrs/market-assets](https://github.com/pmndrs/market-assets).

## Autos que se abollan (0.21)

Como en Vice City, la chapa se hunde donde pega el golpe (choques, tiros, explosiones) y queda arrugada; con mucho daño se rompen los vidrios, sale humo del motor y al final se prende fuego. Chapa y pintura (o que el auto vuelva al tránsito) lo deja como nuevo.

**A los tiros, como en los GTA**: un tiro bajo, en una rueda, pincha esa goma (se baja, el auto se ladea para ese lado, anda en llanta, tira para ese costado y saca chispas); a la altura de los vidrios, el primer tiro los astilla y el segundo los hace volar; y si le das al que maneja un auto del tránsito (o el colectivo), se muere: el auto sigue sin control, con la bocina pegada, hasta que se va de la calle o se la da contra algo. Si después lo robás, sacás el cuerpo. La cana también te puede pinchar las gomas a tiros.

## Messi, la Selección y el show de drones (0.40)

Por la despedida de Messi de la Selección (Monumental, 6 de octubre de 2026, 3-0 a Benín): **de noche, en la
punta norte de la Plaza Comandante Tomás Espora**, están Messi y los 26 campeones del mundo de Qatar 2022 (en el
mapa: la camiseta albiceleste con el 10). Desde las 19 h llegan y charlan; cuando oscurece, **mil drones**
despegan arriba de las vías, del otro lado de la estación, y todos miran para arriba: primero **SANCOR SEGUROS**
(la publicidad que se ligó la silbatina en el estadio: silbidos, "¡Chiqui, la con...!", "¿S de Súper Messi? No:
de Sancor Seguros" y Messi esperando con cara de nada), después el **10 y MESSI**, la **camiseta**, un
**jugador pateando con la derecha** (el otro meme de la noche: Leo es zurdo, y él mismo lo aclara), la **Copa**,
el **Obelisco** y **¡GRACIAS LEO!** con las tres estrellas, con aplausos y el "olé, olé, olé, Leo, Leo". Al
final bajan, y a los 35 segundos arranca otro. Se ve desde todo Temperley.

- **E** cerca del grupo durante el show: **mirarlo con la Selección** (cámara atrás de ellos, como filmando con
  el celu, con las espaldas y los números abajo y el cielo arriba). Moverse o E de nuevo para dejar de mirar.
- **E** al lado de Messi: **sacarte una foto con él** (+5 de respeto la primera vez).
- No se los puede lastimar: si hay lío salen corriendo y vuelven.

Están hechos acá con MakeHuman (CC0), **sin fotos** (como el Comandante): camiseta a rayas, pantalón corto negro
(el pantalón largo cortado arriba de la rodilla), medias blancas pintadas en la piel, los arqueros de verde, y
Messi bajito, con barba castaña y la cinta de capitán. El nombre y el número de cada uno van en la espalda,
dibujados en el shader de la camiseta desde un solo atlas (`src/people.js`). Las figuras de los drones se
dibujan con canvas (letras y trazos propios: sin el logo de la aseguradora, solo el nombre) y los drones se
reparten en una grilla pareja; entre figura y figura cada uno vuela al punto libre más cercano y el vuelo, el
color y el brillo los calcula la placa (`src/drones.js`). La luz de los drones se mezcla por máximo y no por
suma, así lo que se pisa no se quema en una mancha blanca.

## Inundaciones: Temperley bajo el agua (0.39)

Cuando llueve fuerte **el agua se junta**: primero se llena el **bajo nivel** (10 m de hondo, queda como una
pileta), después **sube por las calles**, pasa el cordón, tapa las veredas y entra a los pulmones de manzana.
Con lluvia común el agua llega a la rodilla; con **tormenta** (casi la mitad de las veces que llueve) llega al
pecho y **Gaspi nada**. Cuando para, el agua baja despacio y el bajo nivel es lo último que se vacía (tiene
bombas). El zócalo de noticias va contando cómo está y el radar se tiñe de agua.

**Hecho sobre trabajo de otros (con licencia abierta)**, no desde cero:

- **Las ondas y las cáusticas salen de Blender**: el modificador Ocean (simulación de océano por FFT, el método
  de Tessendorf que se usa en el cine) genera 16 cuadros de olas cortas de agua encerrada; de ahí se hornean
  las **normales animadas con la espuma** de Blender y las **cáusticas** (la luz del sol refractada por esas
  mismas ondas y juntada en el fondo, calculada como en *WebGL Water* de Evan Wallace, MIT). Script:
  `tools/blender/agua.py` → `public/textures/agua_normal.webp` y `agua_causticas.webp`.
- **La vista bajo el agua, los rayos de luz, la superficie vista desde abajo (ventana de Snell) y la
  flotación** son de [WaterThreeJS](https://github.com/achrefelouafi/WaterThreeJS) de Mohamed Achref Elouafi
  (MIT), adaptados al juego.
- **Botes de remo** del [Watercraft Kit](https://kenney.nl/assets/watercraft-kit) de Kenney (CC0), con sus remos.
- **Víbora**: la [cobra](https://opengameart.org/content/cobra-0) de Micket en OpenGameArt (CC0), estirada y
  con cabeza de yarará en Blender (`tools/blender/vibora.py`).
- **Lo que flota** (modelado en Blender, `tools/blender/flotantes.py`): botellas, bolsas del súper, bandejas
  de telgopor, latas, ramas con hojas, ojotas, bidones, cajas empapadas, una pelota, gomas, pallets, una
  conservadora y la silla de plástico del patio.

Qué hay:

- **El agua**: **reflejo de verdad** (la ciudad se dibuja otra vez desde abajo del agua, a media resolución)
  con la mezcla de Fresnel del agua: mirando para abajo se ve el agua marrón de las inundaciones del conurbano,
  al ras es un espejo. Donde hay dos dedos de agua se ve el asfalto; pasando los 40 cm, ya no. **Espuma** en los
  cordones, contra las paredes y donde algo se mueve; **gotas de lluvia** que abren anillos, la corriente, el sol
  que brilla en las ondas y la sombra de las casas sobre el agua. De noche, las **rayas de luz de los faroles y
  los neones** sobre el agua.
- **Nadar**: sin hacer pie (desde 1,12 m) Gaspi nada **crol** (brazadas alternadas, patada y la cabeza que gira
  para respirar) y, quieto, **flota pataleando**. Shift: a fondo. Salpica, deja estela y al salir **gotea**.
- **Bucear, como en GTA**: nadando donde es hondo, **C**, **Ctrl** o **clic** (o el botón **Bucear** en el celu) y Gaspi se sumerge (en la compu lo dice abajo, al lado de la acción); abajo nada
  **pecho** hacia donde mira la cámara, **Espacio** sube y **C** baja. Bajo el agua: el agua turbia se come el
  color con la distancia, **rayos de sol** que bajan dibujando las cáusticas, **cáusticas** bailando en el
  fondo, los autos y las paredes, la superficie vista desde abajo con el cielo en la **ventana de Snell**,
  **burbujas** que salen de la boca, mugre en suspensión y el sonido apagado. Tiene **aire para unos 30
  segundos** (barra celeste): después se ahoga.
- **Autos que flotan**: con el agua alta los autos (estacionados, del tránsito, patrulleros y el de Gaspi) se
  levantan, se mecen y **los lleva la corriente** hasta trabarse contra una pared. Antes, el agua los frena,
  levantan **olas** y, si llega a la toma de aire, **se ahoga el motor**.
- **Botes de remo con vecinos** que pasan por las calles inundadas, doblan en las esquinas y dejan estela.
  **Gaspi se puede subir a uno** (F; si tiene dueño, se lo saca y el vecino cae al agua puteando) y **remar**:
  W/S adelante y atrás, A/D para girar, Shift más fuerte, F para bajarse. Encalla donde hay poca agua.
- **Vecinos varados** arriba de los autos que flotan, haciendo señas y gritando "¡AYUDA!": pasá al lado en
  bote y se suben (**$4.000 y respeto** por cada uno; hay lugar para dos).
- **Lo que se llevó el agua**: con el bajo nivel lleno, en el fondo quedan billeteras, una mochila y un
  celular que brillan apenas en el agua turbia; se agarran **buceando** (como los paquetes escondidos de GTA).
- **La marca del agua**: cuando baja, las paredes quedan mojadas hasta donde llegó, con la línea de mugre
  arriba, y las calles embarradas; se seca en unos minutos.
- **Víboras (yararás) nadando** en S. Si Gaspi está en el agua, alguna se le acerca y **lo pica**.
- **La gente** camina lenta con el agua a la cintura y nada si no hace pie. Caminar en el agua es más lento,
  con los brazos abiertos y chapoteando.
- **Sonido**: el chapuzón, las brazadas, los pasos en el agua, las burbujas, la bocanada al salir y el agua
  corriendo.
- La plata, las armas y lo que se levanta **flotan** arriba del agua.
- Truco **DILUVIO** (escribirlo jugando): tormenta ya mismo y el agua sube rápido. Con `?diluvio` al final del
  link el juego arranca inundado.

## Mapa más grande: todo en su lugar real (0.38)

El mapa creció hacia el norte por Almirante Brown hasta Cerrito y hacia el este por Av. Eva Perón hasta Emilio Castro, con las calles, los edificios y los negocios reales de OpenStreetMap y Overture. Sobre Almirante Brown, en la esquina de Juncal, está el **Sanatorio Juncal**: enorme, blanco, de ocho pisos, con el nombre arriba, la cruz roja, la H y la entrada de la guardia. En Cerrito las vías cruzan la calle en un **paso a nivel** con barreras y campana, como el de la estación. En la esquina de Cerrito y Almirante Brown hay un **puesto de flores** con la florista: con E le comprás un ramo. Y la casa de Clau ahora está en su esquina real.

## La casa de Clau (0.37)

En la esquina de Av. Eva Perón y Emilio Castro está la casa de Clau, de dos pisos, con el cartel en el frente. En la terraza Clau, Pablo el alto, Ale con su vincha de call center y Laban el creador de traje y sombrero amarillos juegan al truco en una mesa de plástico; Gonza toca la guitarra, Martín acuna a los mellizos y Nico está con su caballo. Se sube con E en la puerta y en la mesa se puede jugar una mano.

## La estación con gente (0.36)

El Roca viene lleno: se ve la gente parada y sentada detrás de las ventanillas. En los andenes espera gente yendo a trabajar (mucha más en hora pico), amontonada donde paran las puertas; cuando el tren para, suben, baja otra gente que camina hacia la estación y en la plaza se ve salir gente de la estación. Al andén ya no se sube caminando desde la calle: se entra a la estación y se pasa el molinete con la SUBE ($650, y con eso el tren no te cobra de nuevo) o te colás saltándolo, y si te ve el de seguridad tenés una estrella. Desde el andén se vuelve a entrar por la puerta de la estación y se sale libre por el molinete.

## Piñas y apuntado (0.35)

Las piñas se pegan con todo el cuerpo: Gaspi se pone en guardia de boxeo, carga, el golpe sale rápido, gira la cadera, pivotea el pie de atrás y vuelve a la guardia. El combo es directo, cruzado, gancho, uppercut y patada frontal, y da medio paso hacia el rival. Al que le pegan se le va la cabeza para el lado del golpe. Al apuntar, el torso sigue la mira arriba y abajo, el arma patea al tirar y se puede caminar de costado o para atrás sin dejar de apuntar. Todo pasa de una pose a otra sin saltos.

## Chicos farmeando aura (0.34)

En la Plaza Comandante Tomás Espora, de 10 a 23 h (en el mapa: el ícono violeta con un destello), hay una ronda de 30 chicos "farmeando aura": de a uno pasan al medio y hacen el baile del nene del bote, con cara seria, mientras los demás aplauden y filman con el celu. Al final le ponen puntaje ("¡+4.200 de aura!" o "Ese es un NPC: −800") y queda el récord. Si Gaspi se para quieto en el medio, baila él y gana respeto. A los chicos no se los puede lastimar.

## Motores y sonido en el celu (0.33)

Cada auto suena a lo que es: el Falcon y el patrullero con un seis cilindros grueso, el Gol y el 504 con un cuatro, la Ferrari que grita arriba, el colectivo y el camión con su diésel y las motos de delivery con su 150. El motor sube de vueltas, pasa los cambios (se nota el corte), ruge a fondo y queda opaco al soltar. Los autos y motos que pasan cerca también se oyen, de un lado o del otro, y con el "ñeeeooo" al pasar. Todo sintetizado en el momento (no hay grabaciones). En el iPhone ahora suena aunque esté la llave de silencio.

## Personas con modelo de artista (0.20, rehecho en 0.32)

Los vecinos, vecinas y la policía están hechos con [MakeHuman](http://www.makehumancommunity.org) (malla, morfos, esqueleto, pieles, pelo y ropa: todo CC0): cuerpos con proporciones reales, cada uno con su cara (nariz, mentón, ojos y orejas distintos), piel con las cavidades de la cara horneadas, pelo y ropa de verdad. Hay 22: hinchas con la camiseta de Banfield, Temperley, Boca, River y Argentina (rayas y franjas pintadas sobre la prenda, sin escudos), laburante de overol, oficinista de traje, gordo pelado, flaco, musculoso, jubilados y abuela, chicas de remera, short, deportiva o vestido, y la Bonaerense de camisa celeste. En la calle cada uno sale con la ropa de otro color, otro tono de piel y pelo negro, castaño, rubio o canoso. Se arman con `tools/models/mh/` (Python + meshoptimizer): ≤ 5.000 triángulos y una sola textura de 1024 (512 en el celular) por persona.

Se animan con las mismas poses de siempre (caminar, piñas, celular, sentarse, caerse) gracias a `src/rig.js`, que traduce nuestro esqueleto a cualquier esqueleto humanoide estándar. Las armas de la cana se cuelgan de su mano. Gaspi también es de MakeHuman: traje negro, camisa blanca, corbata roja a rayas y la cara de su foto horneada en la textura de la cabeza. Y todos los demás: Laban de traje blanco con sombrero y anteojos, Ciro gigante en cuero, el Comandante platinado con su cadenita, las chicas del Ferrucho y del gym, los trapitos con chaleco flúor y gorra, el linyera barbudo con su vasito, el panchero bigotudo, los chicos del colegio, la cana con gorra e insignia, las barras, las bandas, los zombis verdosos y el soldado del tanque con casco. Messi, los jugadores de la Selección y los arqueros también (se cargan aparte, cuando se acerca la noche). Los gendarmes siguen con el modelo CC0 de elbolilloduro ([Mesh2Motion](https://github.com/scottpetrovic/mesh2motion-app)).

Los perros también son un modelo CC0 de Mesh2Motion, con animaciones de verdad (quieto, caminar, correr, ladrar) y distintos tonos de pelo, y el caballo del carro del cartonero también.

## Matanzas (0.29)

Como los "Rampage" de Vice City: seis **calaveras** rojas por el barrio (se ven en el mapa). Pasás caminando por arriba y arranca: te dan un arma con munición de sobra y tenés que bajar a una cantidad de **zombis** o de **barras de Banfield** antes de que se acabe el tiempo (motosierra, metra, tumbera, lanzallamas, molotov y bazuca). Pagan de **$25.000 a $60.000**. Mientras dura, la cana no pasa de dos estrellas. Si no llegás, la calavera vuelve al rato. Cuentan para el porcentaje de la pausa.

**Repartidores de PedidosYa y Rappi**: la mitad de las motos son de delivery. Los de PedidosYa llevan campera y casco rojos y la caja roja atrás de la moto; los de Rappi, campera naranja (o negra) y la mochila-caja naranja en la espalda. Colores tomados de cómo andan en la calle; letras y cajas dibujadas en el juego (sin logos). Si te subís a una, la changa dice de qué app es.

**El chofer de Uver** (app trucha, como las marcas de los GTA): cada tanto, si andás a pie, un sedán negro con el cartelito UVER en el techo se arrima al cordón, toca bocina y el chofer (demasiado simpático) te ofrece llevarte gratis. Si te subís (E), traba las puertas y sale a toda velocidad: **apretá E repetido para forcejear** hasta que se le escapa el volante y te tirás del auto. Si no llegás, te lleva lejos, se queda con el 30 % de tu plata de rescate y te larga en cualquier calle.

**Helicóptero en las torres de Temperley**: en la torre más cercana a la estación (las de 43 m en forma de H), una **escalera de incendio en zigzag** sube desde el patio angosto entre las alas (el callejón) hasta la terraza. Arriba hay un **helipuerto con un helicóptero**: F para subirte, WASD vuela hacia donde mira la cámara, Espacio sube, Shift baja, clic tira con la ametralladora de la trompa y F para bajarte cuando tocás la calle, la terraza de la torre o el techo de una casa. Aparece en el mapa. Volando (en el helicóptero o en el plato), la mira va un poco más arriba que el centro, sobre la nave, como en los GTA, y los tiros salen hacia ella: la trompa gira hacia donde mira la cámara (se puede volar de costado o para atrás sin dejar de apuntar) y las balas frenan en la primera pared o el primer techo que encuentran (de arriba pasan por encima de las casas bajas). Desde la terraza se puede **tirar**: contra el parapeto, saltá (Espacio) y Gaspi lo trepa; la caída libre es con los brazos al aire y desde 43 m no se salva nadie ("TE ESTROLASTE").

Además: los **vecinos cruzan las vías por el puente de la estación** (suben, cruzan y bajan; alguno se para en el medio a mirar el tren), y la **luz de día** es más nítida y cálida, con sombras marcadas y menos bruma.

## El bajo nivel de Temperley (0.31)

El **Paso bajo nivel Manuel Belgrano**, la avenida de dos manos que une Av. Eva Perón con Av. 9 de Julio, ahora existe: la calzada **baja en rampa 10 m (el real tiene 5,4; lo pidió el dueño más hondo, para bucear con la inundación), pasa por debajo de las vías** del Roca (con el techo del túnel y luces en las paredes) y vuelve a subir. Tiene paredes de hormigón con baranda, y García del Río y 9 de Julio la cruzan por arriba como **puentes** (los autos y la gente de arriba siguen arriba). El tránsito la usa sola. Geometría de OpenStreetMap.

## El final: el cielo del Comandante (0.30)

Cuando ganaste las nueve misiones, te llama un número desconocido: es **el Comandante** (Ricardo Fort), que te espera "arriba de todo". Subís en el ascensor a la terraza de la torre del tobogán, baja una **luz dorada**, te metés y aparecés en el **cielo, arriba de una nube enorme**, al atardecer. En la otra punta te espera el Comandante (pelo platinado, bronceado, traje blanco, lentes negros y cadenita) y **se dan un abrazo** mientras la cámara gira alrededor. Después, los créditos ("FIN"), $1.000.000 y de vuelta a la terraza: el juego sigue. Es un personaje hecho en el juego, sin fotos.

## Lo que cargó el dueño (relevamiento, 0.28)

- **Morres**, la carnicería de la esquina de Cangallo y Santa María de Oro (cartel rojo y toldo).
- **Escuela Media Tomás Espora**, sobre Santa María de Oro, a mitad de cuadra antes de 14 de Julio.
- **Vaicrem**, la heladería de Av. Almirante Brown y 14 de Julio.
- Sobre **Almirante Brown, entre Anchorena y 14 de Julio**, a mitad de cuadra: la **puertita azul**, al lado el **Banco Macro** y al lado el **Banco Provincia** (con sus colores; el Provincia aparecía con otro nombre).
- **La torre del tobogán**, Almirante Brown 2973 (casi esquina Esmeralda): 32 pisos, la más alta de Temperley (más del doble que las torres de la estación). En la vereda, E para subir en el **ascensor** a la terraza; arriba hay **pileta** con reposeras y un **tobogán gigante** amarillo que sale de una torrecita, da una vuelta y media por afuera del edificio a cien metros de la calle y cae en la pileta (E al pie de la torrecita). E en el borde para meterte o salir de la pileta.
- **El Viejo Correo**, Av. Meeks 1357: se entra. Bar clásico y antiguo: boiserie de madera, piso de damero, barra larga de estaño con caja registradora, espejo con botellas, ventiladores de techo, mesas de mármol con sillas de Viena, la pared de casilleros de bronce del correo y el buzón rojo. Atiende Don Manolo (vermú con soda, café en jarrito, ginebra, picada) y hay parroquianos jugando al truco.
- **Borrachos** en la puerta del Supermercado Luna, con el porrón y la camiseta del Celeste, tambaleándose y pidiendo para el vino.
- **Chicos** en la puerta del Colegio Eccleston a la hora del colegio (de 7:30 a 18:30), con uniforme y mochila, jugando a la mancha. Como en los GTA, a los chicos no se los puede lastimar: si hay lío, salen corriendo.

## El puente de la estación (0.27)

**Los techos se caminan**: todas las casas y edificios tienen su techo firme (si caés del helicóptero o de un salto, quedás parado arriba): los planos con su pretil de medio metro, que frena al caminar y se salta o se trepa con Espacio para pasar al techo de al lado o tirarse a la vereda; los de tejas a dos aguas y las bóvedas de chapa de los galpones, con su pendiente. Caer de más de unos 5 m lastima (y deja tirado un momento); de muy alto, mata, salvo que caigas al agua.

La pasarela que cruza las vías frente a la estación Temperley (y las otras de la estación) se puede subir: en cada punta hay un descanso y una escalera hasta la calle. Arriba se camina a 7 m sobre los trenes, con barandas a los costados (y si te tirás por la punta, caés).

## Tanque y casas que se derrumban (0.26)

- **Tanque del Ejército** (un TAM): con **6 estrellas** sale uno a buscarte. Pasa por arriba de los autos, voltea postes y árboles, atropella a la gente y tira cañonazos (que pueden voltear la casa que haya en el medio). Como en GTA, **se lo podés robar**: acercate y apretá F para sacar al tanquista. Lo manejás con las orugas (gira sobre sí mismo), la torreta sigue a la cámara y con **clic** disparás el cañón. Aguanta tiros; con cohetes o cañonazos se rompe. Se ve en el mapita con su ícono verde oliva (pegado al borde si está lejos, para saber de dónde viene) y en el mapa de la pausa.
- **Casas que se vienen abajo**: los cañonazos del tanque y el láser del plato volador (y, de a poco, la bazuca) le sacan vida a la casa donde pegan; cuando no aguanta más, se derrumba con una nube de polvo y quedan los escombros humeando (y se puede pasar por arriba). La estación y los locales donde se entra no se caen.

## Bandas (0.25)

Como las pandillas de GTA, dos bandas con su territorio (íconos en el mapa):

- **Los Arbolitos** (US$, verde): los del dólar blue, en la vereda de los bancos de Almirante Brown. Patrullan la cuadra con ametralladoras gritando "¡Cambio, cambio!". Si te acercás te miran y te avisan; si te quedás (o pasás despacio con el auto), te cagan a tiros en ráfagas.
- **Los Jubilados** (bastón, violeta): hartos de que les saquen el descuento de la farmacia, plantados en la puerta de la ANSES (en la otra punta del mapa) con un pasacalle. Tienen molotovs, lanzallamas y bazucas: son lentos, pero pegan mucho más fuerte.

Si le pegás o le tirás a uno, salen todos; si apuntás o tirás cerca, también. Se calman si te vas lejos un rato. Muertos sueltan plata y el arma (el **lanzallamas** lo podés usar vos: chorro de fuego que quema gente y prende autos) y los jubilados, a veces, los remedios. Al rato, si no estás cerca, vuelven.

## Autos de artista (0.24)

Entre los clásicos hechos por código (Duna, Falcon, Gol, 504...) ahora andan autos modernos del [Realistic Car Pack de Quaternius](https://quaternius.com/packs/cars.html) (CC0): un sedán, un compacto, una SUV y dos deportivos. Son uno de cada cuatro en el tránsito y algunos de los estacionados, con el color del auto al azar, la chapa con laca, vidrios polarizados, ruedas que giran y doblan, abolladuras, luces de freno y el mismo nivel de detalle por distancia que los demás. Los deportivos tiran más y la SUV es más pesada. `tools/models/qcars.mjs` arma `public/models/vehicles/qcars.glb` desde los OBJ del pack (escala real, piso en 0, frente a +z y las partes separadas); unos 3.000 triángulos por auto.

## Gym El Kaiser (0.13)

Box de CrossFit en su dirección real, **Rivadavia 321**, en la vereda de enfrente del Colegio Eccleston (a unas cuatro cuadras de la estación; ícono en el mapa). El lote se reserva en `src/map.js` (`GYM_LOT`) y la huella de Overture que lo pisaba no se levanta: galpón negro con el portón levantado, el cartel del lobo arriba y el mismo logo en la pared del fondo, racks rojos, discos, cajones y kettlebells. Adentro entrenan los musculosos (dominadas, sentadilla y press) y El Kaiser te recibe en la puerta. Si les pegás, se defienden, y aguantan más que un vecino.

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
| `src/laban.js` | Laban the Creator y su Ferrucho descapotable |
| `src/models.js` | Modelos bajados de internet (ambulancia y autobomba de Kenney, CC0) |
| `public/models/vehicles/qcars.glb` | Autos modernos de Quaternius (CC0), los carga `loadQCars` en `src/cars.js` |
| `src/palms.js` | Palmeras de las plazas (instanciadas) |
| `src/stunts.js` | Rampas y saltos insólitos con cámara lenta |
| `src/matanzas.js` | Matanzas contra reloj (calaveras, zombis y barras, premio en plata) |
| `src/gym.js` | Gym El Kaiser: galpón, cartel, racks y los musculosos entrenando |
| `src/missions.js` | Misiones: llamadas, marcador, etapas, premio |
| `src/transit.js` | Tren y colectivo de pasajero |
| `src/interiors.js` | Interiores: hall de la estación y kiosco |
| `src/races.js` | Picadas: carreras callejeras con aros y rivales |
| `src/trains.js` | Trenes, barreras y pasos a nivel |
| `src/radio.js`, `src/audio.js` | Radio y sonidos sintetizados |
| `src/motores.js` | Ruido de motor sintetizado: cilindros, cambios, carga, Doppler |
| `src/moves.js` | Pelea y armas: guardia, golpes por fases, patada, reacción, apuntado con la cámara |
| `src/andenes.js` | Gente en los andenes: espera, sube y baja del Roca, sale por la estación |
| `src/clau.js` | La casa de Clau: terraza, truco y los amigos |
| `src/norte.js` | La franja norte: Sanatorio Juncal y el puesto de flores de Cerrito |
| `src/aura.js` | Ronda de chicos farmeando aura en la plaza (turnos, puntaje, Gaspi baila) |
| `src/seleccion.js` | Messi y la Selección en la plaza: lugares, reacciones, foto con Messi, cámara para mirar el show |
| `src/drones.js` | Show de drones: figuras dibujadas con canvas, reparto de drones y vuelo en la placa |
| `src/agua.js`, `src/agua-nivel.js` | Inundación: nivel del agua según la lluvia, superficie con reflejo plano, espuma, gotas y ondas |
| `src/flotantes.js` | Lo que flota en el agua (modelos de `tools/blender/flotantes.py`) |
| `src/flote.js` | Autos que flotan (flotación de WaterThreeJS, MIT) |
| `src/botes.js` | Botes de remo con vecinos (Kenney, CC0) |
| `src/viboras.js` | Víboras nadando (cobra de OpenGameArt, CC0) |
| `src/fx.js` | Partículas, trazas, marcas de frenada, casquillos, agujeros de bala, restos de choque, lluvia y salpicaduras |
| `src/carfx.js` | Escape, petardeos y rocío de los autos andando |
| `src/icons.js` | Íconos del mapa (dibujados por código) y la leyenda |
| `src/map-view.js` | Vista del mapa, zoom anclado, límites, arrastre, pinza y controles |
| `src/ufo.js` | Plato volador: llegada, el marciano de los panchos, robarlo, volar, rayo y tractor |
| `src/smash.js` | Postes de luz que se caen al chocarlos |
| `src/hud.js`, `src/style.css` | Tarjeta SUBE, estrellas, minimapa, mapa grande, zócalo, diálogos |
| `src/sky.js`, `src/atmosphere.js`, `src/post.js`, `src/glow.js` | Cielo, bruma con altura y sol, oclusión ambiental (N8AO), gradeo de color y luces de noche |

## Relevamiento de las 5 cuadras

En `/relevamiento.html` (por ejemplo https://gta-6-conurba.vercel.app/relevamiento.html) hay un mapa de los edificios, plazas y escuelas a unas 5 cuadras de la estación. Tocás cada uno y cargás cómo es en la realidad: nombre como dice el cartel, rubro, dirección, colores, persiana/toldo, pisos y una foto propia del frente. Queda guardado en el celu y se exporta a JSON para sumarlo al juego (`src/data/relevamiento.json`). El botón 📍 muestra dónde estás parado.

## Pendiente

El plan completo y ordenado está en [`PLAN.md`](PLAN.md).


- Interiores (el kiosco, la estación por dentro).
