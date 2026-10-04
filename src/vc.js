// Modo Vice City: HUD clásico, nombre de zona en cursiva, filtro PS2 más marcado,
// fachadas pastel, palmeras en las veredas y autos de colores ochentosos. Todo hecho por
// código propio, sin nada sacado del juego original.
// Es el look normal del juego (lo eligió el dueño). ?vc=0 en el link vuelve al look anterior;
// un build con VITE_VC=0 sale con el look anterior.
const q = new URLSearchParams(globalThis.location?.search ?? '');
export const VC = q.has('vc') ? q.get('vc') !== '0' : import.meta.env?.VITE_VC !== '0';
if (VC) globalThis.document?.documentElement.classList.add('vc');

// Revoques de Ocean Drive: rosa, agua, lavanda, durazno, crema, celeste y menta
export const VC_PLASTER = ['#f7c3d6', '#a6e3d9', '#d6c6f2', '#f9cfae', '#f6ecd6', '#a9d9f2', '#c3f0dc', '#ffb0cb', '#f8e3a6', '#bfe9f4', '#e9d2f5', '#ffd3b8'];

// Autos: blancos, pasteles y algún color fuerte de los 80
export const VC_CAR_COLORS = [0xf4f1ea, 0xf4a6c6, 0x52c7c0, 0x9fd8e8, 0xb8e6c4, 0xff8a65, 0xe85d9c, 0x2f8fd8, 0xf2d16b, 0xc9a7ef, 0x1fa39a, 0xffffff, 0xd94f4f];

// Los árboles de vereda que pasan a ser palmeras (los planta src/palms.js)
export const vcPalmSpots = [];
