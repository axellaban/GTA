# Materiales de calles y veredas

Descargados de la API oficial de Poly Haven el 2026-10-01. Licencia de los assets:
CC0 (https://polyhaven.com/license). Se distribuyen localmente con el juego;
no se consulta ningún servicio externo mientras se juega.

| Archivos | Material y autor | Superficie cubierta |
| --- | --- | --- |
| asfalto_color.jpg, asfalto_normal.jpg, asfalto_rough.jpg | [Asphalt 02](https://polyhaven.com/a/asphalt_02), Rob Tuytel | 3 × 3 m |
| vereda_color.jpg, vereda_normal.jpg, vereda_rough.jpg | [Concrete Pavement](https://polyhaven.com/a/concrete_pavement), Charlotte Baglioni | 1,8 × 1,8 m |

Todos son JPG 1024 × 1024, sin modificar: Diffuse, nor_gl y Rough. Solo el color
se interpreta en sRGB; normales y rugosidad son datos lineales. Sin desplazamiento
ni geometría extra. Memoria de las seis texturas RGBA8 con mipmaps: aproximadamente
32 MiB (reemplazan cuatro texturas dibujadas). Se reproducen con `node scripts/texturas.mjs`.

# Ladrillo y revoque de las fachadas

Descargados de la API oficial de Poly Haven el 2026-10-02 con `python3 scripts/fachadas.py`.
Licencia CC0 (https://polyhaven.com/license).

| Archivo | Material y autor | Superficie cubierta |
| --- | --- | --- |
| fachada_visto.webp | [Red Bricks 04](https://polyhaven.com/a/red_bricks_04), Rob Tuytel | 2,5 × 2,5 m |
| fachada_hueco.webp | [Large Red Bricks](https://polyhaven.com/a/large_red_bricks), Rob Tuytel | 2 × 2 m (el juego lo agranda a 1,56 m) |
| fachada_revoque.webp | [Plaster Grey 04](https://polyhaven.com/a/plaster_grey_04), Rob Tuytel | 1,5 × 1,5 m |

Cada WebP junta el color (Diffuse 1K, en RGB) y la altura (Displacement 1K, en la
transparencia, de 0,5 a 1). El visto queda en 1024 × 1024; el hueco y el revoque, en
512 × 512. `fachada.json` guarda los metros y el color promedio (lineal) de cada foto.
Memoria en la placa: unos 8,4 MiB (RGBA8 con mipmaps).
