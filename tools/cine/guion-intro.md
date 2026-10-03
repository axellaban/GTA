# Cinemática de presentación de Gaspi — entrega aprobada (41 s)

Entregada el 2026-10-03: once planos 16:9, 1920×1080, 24 fps, a velocidad natural.
El usuario aprobó las variantes 4A, 4B, 5A, 6A, 6C, 7A, 7C y 8A, y pidió integrarlas
como presentación inmediatamente después de tocar **Jugar**. Se conservan las referencias
de cara, traje negro, camisa blanca y corbata roja a rayas de Gaspi.

| Inicio–fin (s) | Escena |
| --- | --- |
| 0–3,750 | Llegada del Roca a Temperley |
| 3,750–7,375 | Gaspi baja del tren |
| 7,375–10,875 | Gaspi se acomoda la corbata |
| 10,875–14,125 | 4A: farmea aura en la plaza |
| 14,125–17,625 | 4B: motochorros |
| 17,625–21,500 | 5A: peaje del carrito cartonero |
| 21,500–25,375 | 6C: escuadrón de jubilados, habla la señora |
| 25,375–29,250 | 6A: duelo frente a ANSES |
| 29,250–33,125 | 7A: persecución en Falcon |
| 33,125–37,000 | 7C: colectivo y SUBE |
| 37,000–41,000 | 8A: moneda pendiente; logo del juego y TRIBUTO A GASPI |

La música es el MP3 de **Sentimiento villero — Los Pibes Chorros** proporcionado por el usuario:
arranca en 0,333 s de la fuente, ganancia −6 dB, entrada de 0,5 s y salida de 1,1 s.
Se silencia entre 21,375 y 25,375 s para la voz original de 6C. El audio de ese clip
va desde 0 a 4 s y la imagen desde 0,125 a 4 s: su entrada anticipada de tres cuadros
conserva la primera palabra y mantiene el mismo reloj de origen cuando aparece la señora.
Sin voces superpuestas del juego; los demás audios de los clips quedan silenciados.
Los títulos principales usan ArtDeco de GTA VI y el cierre usa el logo de la portada del juego.

Distribución: `public/cine/intro.mp4` (H.264/AAC con faststart), `intro.webm` (VP9/Opus)
y `intro.jpg` como imagen de carga. Ambas versiones conservan el mismo montaje y mezcla.
La versión de la URL evita reproducir un archivo anterior guardado por el service worker.
El reproductor mantiene la imagen entera, respeta **Sin sonido**, pausa y libera el video
al terminar o saltear, y permite repetirlo desde la pausa.

## Guion inicial de 30 s (histórico, anterior a la revisión aprobada)

Pedido del dueño: intro de 30 s hecha con Higgsfield, con motochorros, piquete y jubilados. El dueño genera
los clips; acá se cortan, se les ponen títulos y música y se comprimen (`public/cine/`, `src/cine.js`).

Formato de cada clip: horizontal 16:9, 5 s, 1080p (o 720p), **sin textos ni subtítulos** (los títulos y los
nombres congelados a lo GTA los pone el juego, nítidos). Si el modelo genera sonido, dejarlo: se mezcla con la
música (un tema de la radio Flash Conurbano del juego).

Cómo se hace cada plano en Higgsfield:
1. **Imagen** (modelo de imagen, p. ej. Nano Banana Pro): subir la portada de Gaspi como referencia, pegar el
   prompt de IMAGEN, 16:9, sacar 2–4 variantes y quedarse con la mejor.
2. **Video** (modelo de video, p. ej. Kling 3.0; Seedance 2.0 si se quiere sonido): imagen a video con esa
   imagen como primer cuadro, pegar el prompt de VIDEO, 5 s, 16:9.
3. Bajar el MP4 y nombrarlo con el número del plano (1.mp4 … 8.mp4).

Si a Gaspi le cambia la cara entre planos: volver a generar, o entrenar un Soul ID con sus fotos (~20).

| # | Tiempo | Plano | Texto que pone el juego |
|---|--------|-------|--------------------------|
| 1 | 0–3,5 s | Hora pico: llega el tren del Roca lleno al andén de Temperley | GTA VI CONURBA |
| 2 | 3,5–7,5 s | Se abren las puertas, baja la multitud y Gaspi entre ellos | — |
| 3 | 7,5–11 s | Gaspi pasa los molinetes, sale y se acomoda la corbata | GASPI (congelado) |
| 4 | 11–14,5 s | Motochorros le arrancan el celu | MOTOCHORROS |
| 5 | 14,5–18,5 s | Piquete: gomas prendidas, bombos, humo | EL PIQUETE |
| 6 | 18,5–22 s | Jubilados en la ANSES con carteles | LOS JUBILADOS |
| 7 | 22–26 s | Persecución en el Falcon con la Bonaerense atrás | — |
| 8 | 26–30 s | Atardecer en el puente: recupera el celu | GTA VI CONURBA · Temperley |

(Pedido del dueño: que arranque con la gente amontonada llegando a la estación y bajando del tren, y
después Gaspi acomodándose la corbata. El plano aéreo de antes queda de repuesto.)

Estilo común (va al final de cada prompt): `GTA V style 3D video game graphics, realistic open-world game
cinematic, warm Vice City color palette, 16:9, no text, no logos`.

## 1 · Llega el tren lleno
IMAGEN: `Rush hour on the platform of an old British-style railway station in the Buenos Aires suburbs, red tiled roof, iron columns and green benches: a blue and white commuter train packed with people pulls in, passengers pressed against the windows and standing in the open doorways, a crowd of workers and students with backpacks waiting at the edge of the platform, morning sun coming through the roof. GTA V style 3D video game graphics, realistic open-world game cinematic, warm Vice City color palette, 16:9, no text, no logos`

VIDEO: `The packed train slowly pulls into the platform and stops, the waiting crowd steps forward, the camera tracks along the train at platform level. No text.`

## 2 · Bajan todos (y Gaspi entre ellos)
IMAGEN (con la portada de referencia): `The doors of a packed commuter train open at a busy suburban Buenos Aires station platform and a crowd of office workers and students pours out toward the exit turnstiles; in the middle of the crowd, the man from the reference image in a black suit, white shirt and red striped tie. GTA V style 3D video game graphics, realistic open-world game cinematic, warm Vice City color palette, 16:9, no text, no logos`

VIDEO: `The doors slide open and the crowd spills onto the platform, hurrying toward the turnstiles; the man in the black suit steps off among them and walks toward the camera, which moves backward in front of him. No text.`

## Repuesto · Temperley al amanecer (desde el aire)
IMAGEN: `Aerial drone shot at sunrise over a suburban Argentine town in Buenos Aires province: a long old British-style railway station with a red tiled roof and platforms, a blue and white commuter train arriving, low houses, purple jacaranda trees in bloom, a few palm trees, wide avenues with old cars, golden light and light haze. GTA V style 3D video game graphics, realistic open-world game cinematic, warm Vice City color palette, 16:9, no text, no logos`

VIDEO: `Slow cinematic drone push-in toward the station while the train pulls in, birds crossing the frame, sun flare, the camera gently rises. No text.`

## 3 · Gaspi: molinetes y corbata
IMAGEN (con la portada de referencia): `The man from the reference image: young man in a black suit, white shirt and red striped tie, walking through the exit turnstiles of an old red-roofed train station hall in the Buenos Aires suburbs, commuters with backpacks around him, morning sun through the doorway. Medium shot, slightly low angle. GTA V style 3D video game graphics, realistic open-world game cinematic, warm Vice City color palette, 16:9, no text, no logos`

VIDEO: `He passes the turnstile and steps out of the station into the sunlight, adjusts his red tie with one hand and looks straight into the camera with a confident half smile while the camera slowly dollies in. No text.`

## 4 · Motochorros
IMAGEN: `The same man in the black suit and red tie on the sidewalk of a busy suburban avenue, looking at his smartphone; behind him two young men in helmets on a small 150cc motorcycle approach along the curb. Small shops with awnings, jacaranda trees, parked cars. GTA V style 3D video game graphics, realistic open-world game cinematic, warm Vice City color palette, 16:9, no text, no logos`

VIDEO: `The motorcycle passes very close, the passenger snatches the phone from his hand and they speed away; he turns in shock and points at them. Handheld camera with a quick whip pan following the bike. No text.`

## 5 · Piquete
IMAGEN: `Street protest blocking a wide avenue in a Buenos Aires suburb: burning tires with thick black smoke, a crowd with big bass drums, flags and large banners, a line of stopped cars and a city bus behind them. Afternoon, dramatic backlight through the smoke. GTA V style 3D video game graphics, realistic open-world game cinematic, warm Vice City color palette, 16:9, banners without readable text, no logos`

VIDEO: `The protesters march toward the camera beating the bass drums and waving the flags, smoke drifts across the frame, a car honks and turns around. Slow tracking shot at street level. No text.`

## 6 · Jubilados
IMAGEN: `A group of elderly retirees, men and women over 70, protesting on the sidewalk in front of a government social security office, holding handmade cardboard signs that read "AUMENTO YA" and "QUEREMOS COBRAR"; an old man with a cane raises his fist. Warm afternoon light. GTA V style 3D video game graphics, realistic open-world game cinematic, warm Vice City color palette, 16:9, no logos`

VIDEO: `The old man shouts toward the camera and shakes his cane, the others raise their signs and clap, a police officer watches in the background. Slow push-in.`

## 7 · Persecución
IMAGEN: `A dark 1980s Argentine sedan, Ford Falcon style, drifting around a corner on a tree-lined suburban avenue at sunset, purple jacarandas, the man in the black suit and red tie at the wheel, a police car with blue and red lights chasing behind. GTA V style 3D video game graphics, realistic open-world game cinematic, warm Vice City color palette, 16:9, no text, no logos`

VIDEO: `The car drifts through the corner with tire smoke, the police car follows with flashing lights, the camera tracks low alongside and then the car speeds past the lens. No text.`

## 8 · Final en el puente
IMAGEN: `The same man in the black suit and red striped tie standing on a pedestrian footbridge over railway tracks at sunset, holding his recovered smartphone, the red-roofed station and the town behind him, pink and orange sky, palm trees. Medium wide shot. GTA V style 3D video game graphics, realistic open-world game cinematic, warm Vice City color palette, 16:9, no text, no logos`

VIDEO: `He looks at his phone, smiles, slips it into his jacket pocket and looks at the horizon while a train passes underneath; slow orbit around him, warm lens flare. No text.`

## Después (acá)
Cortar cada clip a su tiempo, títulos y nombres congelados a lo GTA en `src/cine.js`, música de la radio
Flash Conurbano (o el sonido de los clips), comprimir a ~4–5 MB (720p, H.264 + VP9) y reemplazar
`public/cine/intro.*`. Se baja solo cuando se reproduce; se puede saltear.
