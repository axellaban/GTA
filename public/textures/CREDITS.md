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
