# Interiores de los comercios (lo que se ve por la vidriera) hechos en Blender, sin abrir la interfaz:
#   pip install bpy        (Blender como módulo de Python; probado con 5.0)
#   python3 tools/blender/locales.py
# Sale public/textures/locales.webp (1536x768, con alfa) para el "interior mapping" de src/aberturas-kit.js:
# el juego no dibuja el local; para cada punto del vidrio calcula dónde pega la mirada adentro (el piso, el
# cielorraso o la pared del fondo) y busca ese punto en la foto. Por eso las fotos se sacan desde un punto
# fijo (CAM metros delante del vidrio, a media altura) y el shader repite la misma proyección: al caminar
# por la vereda el local se ve con su fondo, no como una calcomanía pegada al vidrio.
#   fila de arriba   el cuarto: piso, cielorraso con tubos y la pared del fondo con estanterías. No tiene
#                    paredes a los costados: se repite cada W metros a lo largo de la vidriera (mida lo que mida)
#   fila de abajo    los muebles (mostrador, góndola, vitrina, percheros, maniquí y el que atiende) con su
#                    sombra en el piso y el resto transparente: el shader los pone en un plano a YF metros del
#                    vidrio, espejados cada W metros
#   columnas         almacén / kiosco, farmacia, ropa / zapatería, panadería / rotisería
# (W, H, D, CAM, YF y M tienen que ser los mismos que en src/aberturas-kit.js)
import math
import os
import random

import bpy  # tiene que ir antes que bmesh
import bmesh
import numpy as np
from mathutils import Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TEX = os.path.join(ROOT, 'public', 'textures', 'locales.webp')
W, H, D = 3.0, 3.0, 5.0  # un tramo del local: ancho (cada cuánto se repite), alto del cielorraso y fondo
CAM = 4.0  # la cámara: CAM metros delante del vidrio, a media altura
YF = 1.0  # el plano de los muebles, a YF metros del vidrio
M = 1.06  # la foto abarca un poco más que el tramo (margen para el filtrado de la textura)
RES = 384
REP = (-2, -1, 0, 1, 2)  # copias del cuarto a los costados (así la luz y las sombras también se repiten)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def lin(c):
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


def hexc(h):
    return lin((((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255))


MATS = {}
# las piezas de cada escena se juntan en una malla por capa y material (miles de objetos sueltos hacían que
# Blender se comiera la memoria). Capas: 'cuarto' y 'piso' (se repiten a los costados) y 'muebles'
GEO = {}
LAYER = ['cuarto']


def layer(name):
    LAYER[0] = name


def mat(col, rough=0.6, emit=0.0):
    key = (col, rough, emit)
    if key not in MATS:
        m = bpy.data.materials.new(f'm{len(MATS)}')
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*hexc(col), 1)
        b.inputs['Roughness'].default_value = rough
        if emit:
            b.inputs['Emission Color'].default_value = (*hexc(col), 1)
            b.inputs['Emission Strength'].default_value = emit
        MATS[key] = m
    return key


def _mesh(col, rough, emit):
    return GEO.setdefault((LAYER[0], mat(col, rough, emit)), bmesh.new())


def _offsets():
    return [k * W for k in REP] if LAYER[0] in ('cuarto', 'piso') else [0.0]


FACES = ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3))


def box(c, s, col, rough=0.6, emit=0.0):
    # caja en coordenadas de Blender: x a lo largo de la vidriera, y hacia el fondo, z para arriba (0: el piso)
    bm = _mesh(col, rough, emit)
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    for ox in _offsets():
        v = [bm.verts.new((c[0] + ox + i * hx, c[1] + j * hy, c[2] + k * hz)) for i in (-1, 1) for j in (-1, 1) for k in (-1, 1)]
        for f in FACES:
            bm.faces.new([v[i] for i in f])


def cyl(c, r, h, col, rough=0.5, emit=0.0, n=10, r2=None, axis='Z'):
    # cilindro (o cono, con r2) centrado en c, parado o acostado a lo largo de x / y
    bm = _mesh(col, rough, emit)
    rot = {'Z': Matrix.Identity(4), 'X': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'Y': Matrix.Rotation(math.pi / 2, 4, 'X')}[axis]
    for ox in _offsets():
        bmesh.ops.create_cone(bm, cap_ends=True, segments=n, radius1=r, radius2=r if r2 is None else r2, depth=h, matrix=Matrix.Translation((c[0] + ox, c[1], c[2])) @ rot)


def sph(c, r, col, rough=0.5, sc=(1, 1, 1), emit=0.0):
    bm = _mesh(col, rough, emit)
    for ox in _offsets():
        m = Matrix.Translation((c[0] + ox, c[1], c[2])) @ Matrix.Diagonal((*sc, 1))
        bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=9, radius=r, matrix=m)


def flush():
    # una malla por capa y material
    out = {'cuarto': [], 'piso': [], 'muebles': []}
    for (lay, key), bm in GEO.items():
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        me = bpy.data.meshes.new('m')
        bm.to_mesh(me)
        bm.free()
        me.materials.append(MATS[key])
        ob = bpy.data.objects.new(lay, me)
        scene.collection.objects.link(ob)
        out[lay].append(ob)
    GEO.clear()
    return out


# ---------------------------------------------------------------- el cuarto (se repite cada W metros)


def piso(y):
    # (en la foto de los muebles el piso de adelante junta su sombra; el del fondo no, que ahí la sombra
    # de la estantería ya está en la del cuarto)
    return 'piso' if y < 3.3 else 'cuarto'


def cuarto(pared, piso_a, piso_b, tablas=False, techo=0xe8e6e0, zocalo=0x707070):
    # piso (desde un poco delante del vidrio hasta el fondo), pared del fondo, cielorraso y los tubos
    if tablas:
        # tablas de madera de 0,25 x 1,2 m, trabadas
        for i in range(int(round(W / 0.25))):
            off = (i % 3) * 0.4
            for j in range(-2, int(D / 1.2) + 2):
                y0 = j * 1.2 - off
                layer(piso(y0 + 0.6))
                box((-W / 2 + (i + 0.5) * 0.25, y0 + 0.6, -0.005), (0.245, 1.19, 0.01), piso_a if (i * 7 + j) % 3 else piso_b, 0.45)
    else:
        t = 0.3
        for i in range(int(round(W / t))):
            for j in range(-4, int(D / t) + 1):
                layer(piso((j + 0.5) * t))
                box((-W / 2 + (i + 0.5) * t, (j + 0.5) * t, -0.005), (t, t, 0.01), piso_a if (i + j) % 2 else piso_b, 0.35)
    layer('cuarto')
    box((0, D + 0.025, H / 2), (W, 0.05, H), pared)
    box((0, D - 0.01, 0.06), (W, 0.02, 0.12), zocalo)
    box((0, (D - 1.2) / 2, H + 0.025), (W, D + 1.2, 0.05), techo)
    for y in (0.9, 2.5, 4.1):
        box((0, y, H - 0.03), (1.42, 0.2, 0.03), 0xc9c9c9, 0.5)
        box((0, y, H - 0.06), (1.3, 0.12, 0.035), 0xffffff, 0.3, 7.0)


def estante(x0, x1, y, rnd, pal, depth=0.4, levels=5, top=2.1, wood=0xd9dcde, kinds=('caja',)):
    # estantería contra la pared del fondo, llena de productos
    cx = (x0 + x1) / 2
    box((cx, y - 0.015, top / 2), (x1 - x0, 0.03, top), wood)
    box((cx, y - depth / 2, top), (x1 - x0, depth, 0.03), wood)
    hmax = (top - 0.12) / levels - 0.06
    for k in range(levels):
        z = 0.1 + k * (top - 0.12) / levels
        box((cx, y - depth / 2, z), (x1 - x0, depth, 0.025), wood)
        x = x0 + 0.04
        while x < x1 - 0.1:
            kind = rnd.choice(kinds)
            if kind == 'botella':
                r = rnd.uniform(0.03, 0.042)
                h = rnd.uniform(0.2, max(0.21, min(0.32, hmax)))
                c = rnd.choice(pal)
                cyl((x + r, y - depth * 0.6, z + 0.013 + h * 0.36), r, h * 0.72, c, 0.25)
                cyl((x + r, y - depth * 0.6, z + 0.013 + h * 0.86), r * 0.45, h * 0.28, c, 0.25, r2=r * 0.35)
                x += 2 * r + rnd.uniform(0.004, 0.012)
            elif kind == 'frasco':
                r = rnd.uniform(0.035, 0.05)
                h = rnd.uniform(0.1, min(0.16, hmax))
                cyl((x + r, y - depth * 0.6, z + 0.013 + h / 2), r, h, rnd.choice(pal), 0.3)
                cyl((x + r, y - depth * 0.6, z + 0.013 + h + 0.012), r * 0.9, 0.025, 0xd0a020, 0.3)
                x += 2 * r + rnd.uniform(0.004, 0.012)
            elif kind == 'pan':
                r = rnd.uniform(0.05, 0.07)
                L = rnd.uniform(0.18, 0.3)
                cyl((x + L / 2, y - depth * 0.55, z + 0.013 + r * 0.8), r, L, rnd.choice(pal), 0.75, axis='X', n=12)
                x += L + rnd.uniform(0.01, 0.03)
            else:
                w = rnd.uniform(0.05, 0.14)
                h = rnd.uniform(0.1, max(0.11, hmax))
                box((x + w / 2, y - depth * 0.6, z + h / 2 + 0.013), (w, depth * 0.7, h), rnd.choice(pal), 0.5)
                x += w + rnd.uniform(0.005, 0.02)
    for xx in (x0, cx, x1):
        box((xx, y - depth / 2, top / 2), (0.035, depth, top), wood)


def reloj(x, z):
    cyl((x, D - 0.03, z), 0.17, 0.03, 0x37474f, 0.4, axis='Y', n=20)
    cyl((x, D - 0.05, z), 0.15, 0.02, 0xfafafa, 0.4, axis='Y', n=20)
    box((x + 0.04, D - 0.065, z + 0.02), (0.1, 0.01, 0.018), 0x212121)
    box((x, D - 0.066, z + 0.05), (0.016, 0.01, 0.1), 0x212121)


def heladera(x0, x1, rnd):
    # heladera de bebidas contra el fondo: marco blanco, luz adentro y botellas en los estantes
    cx = (x0 + x1) / 2
    w = x1 - x0
    y = D - 0.36
    box((cx, D - 0.03, 1.0), (w, 0.06, 2.0), 0xcfe8f7, 0.2, 1.6)
    for xx in (x0 + 0.04, x1 - 0.04):
        box((xx, y, 1.0), (0.08, 0.72, 2.0), 0xf2f2f2, 0.3)
    box((cx, y, 0.06), (w, 0.72, 0.12), 0x3a3a3a, 0.5)
    box((cx, y, 1.96), (w, 0.72, 0.08), 0xf2f2f2, 0.3)
    box((cx, D - 0.73, 2.12), (w, 0.04, 0.24), 0xd32f2f, 0.4, 2.5)
    for k in range(5):
        z = 0.14 + k * 0.36
        box((cx, y, z), (w - 0.16, 0.6, 0.015), 0xbdbdbd, 0.3)
        x = x0 + 0.1
        while x < x1 - 0.12:
            r = rnd.uniform(0.032, 0.04)
            c = rnd.choice([0xd32f2f, 0x2e7d32, 0x1565c0, 0xffa000, 0x6d4c41, 0xfafafa])
            cyl((x + r, y - 0.15, z + 0.12), r, 0.22, c, 0.2)
            cyl((x + r, y - 0.15, z + 0.27), r * 0.5, 0.08, c, 0.2, r2=r * 0.35)
            x += 2 * r + 0.01


# ---------------------------------------------------------------- los muebles (un tramo, se espeja)


def persona(x, y, ropa, piel, pelo, pantalon=None, delantal=None, gorro=None, cabeza=None):
    # el que atiende (atrás del mostrador alcanza de la cintura para arriba); con pantalón, entero
    if pantalon is not None:
        for sx in (-1, 1):
            cyl((x + sx * 0.095, y, 0.46), 0.075, 0.86, pantalon, 0.8)
            box((x + sx * 0.095, y - 0.05, 0.04), (0.11, 0.24, 0.08), 0x2b2b2b, 0.5)
    box((x, y, 1.18), (0.4, 0.22, 0.6), ropa, 0.8)
    box((x, y, 0.92), (0.36, 0.2, 0.14), pantalon if pantalon is not None else ropa, 0.8)
    cyl((x, y, 1.47), 0.11, 0.44, ropa, 0.8, axis='X', n=12)
    for sx in (-1, 1):
        cyl((x + sx * 0.25, y, 1.2), 0.058, 0.52, ropa, 0.8, r2=0.05)
        sph((x + sx * 0.255, y, 0.91), 0.05, piel)
    if delantal is not None:
        box((x, y - 0.115, 1.0), (0.34, 0.012, 0.62), delantal, 0.7)
    cyl((x, y, 1.6), 0.05, 0.12, piel)
    sph((x, y, 1.75), 0.115, cabeza or piel, sc=(0.88, 0.95, 1.1))
    if cabeza is None:
        sph((x, y + 0.03, 1.79), 0.118, pelo, sc=(0.92, 0.95, 1.0))
        for sx in (-1, 1):
            box((x + sx * 0.04, y - 0.105, 1.76), (0.024, 0.01, 0.024), 0x202020)
        box((x, y - 0.105, 1.69), (0.05, 0.01, 0.012), 0x8d4a3a)
    if gorro is not None:
        cyl((x, y + 0.01, 1.9), 0.105, 0.13, gorro, 0.7)


def mostrador(x0, x1, y, cuerpo, tapa, frente=None, h=0.95, dy=0.55):
    cx = (x0 + x1) / 2
    box((cx, y + dy / 2, h / 2), (x1 - x0, dy, h), cuerpo, 0.5)
    box((cx, y + dy / 2 - 0.03, h + 0.025), (x1 - x0 + 0.06, dy + 0.08, 0.05), tapa, 0.3)
    if frente is not None:
        box((cx, y - 0.005, h * 0.5), (x1 - x0 - 0.12, 0.01, h * 0.7), frente, 0.5)
    box((cx, y + 0.02, 0.05), (x1 - x0 - 0.02, 0.05, 0.1), 0x333333, 0.6)


def almacen(rnd):
    pal = [0xe53935, 0xfdd835, 0x43a047, 0x1e88e5, 0xfb8c00, 0xffffff, 0x8e24aa, 0x00acc1, 0xd81b60, 0x6d4c41]
    cuarto(0xf1ead8, 0xd8d2c4, 0x9a948a)
    estante(-1.5, 0.45, D, rnd, pal, levels=6, top=2.2, kinds=('caja', 'caja', 'botella', 'frasco'))
    heladera(0.5, 1.5, rnd)
    # carteles de ofertas y el reloj
    box((-0.55, D - 0.01, 2.56), (1.2, 0.02, 0.34), 0xe53935, 0.4)
    box((-0.55, D - 0.025, 2.56), (1.0, 0.02, 0.12), 0xfdd835, 0.4)
    reloj(1.0, 2.6)
    layer('muebles')
    # mostrador a la izquierda con frente de vidrio lleno de golosinas (zócalo, costados, tapa y el fondo con
    # luz), la caja, la balanza y los frascos; el almacenero atrás
    x0, x1, y = -1.45, -0.05, 0.85
    cx, w = (x0 + x1) / 2, x1 - x0
    box((cx, y + 0.275, 0.17), (w, 0.55, 0.34), 0x8d6e63, 0.5)
    box((cx, y + 0.02, 0.05), (w - 0.02, 0.05, 0.1), 0x333333, 0.6)
    box((cx, y + 0.245, 0.975), (w + 0.06, 0.63, 0.05), 0xcfd8dc, 0.3)
    box((cx, y + 0.5, 0.64), (w, 0.04, 0.62), 0xfff3e0, 0.3, 0.6)
    for xx in (x0 + 0.02, cx, x1 - 0.02):
        box((xx, y + 0.275, 0.64), (0.04, 0.55, 0.62), 0x6d4c41, 0.5)
    for k in range(2):
        z = 0.36 + k * 0.29
        box((cx, y + 0.27, z), (w - 0.06, 0.5, 0.012), 0xbdbdbd, 0.2)
        x = x0 + 0.05
        while x < x1 - 0.1:
            bw = rnd.uniform(0.05, 0.1)
            h = rnd.uniform(0.07, 0.18)
            box((x + bw / 2, y + 0.15 + rnd.uniform(0, 0.15), z + 0.006 + h / 2), (bw, 0.1, h), rnd.choice(pal), 0.45)
            x += bw + 0.012
    box((-0.4, 1.2, 1.06), (0.34, 0.3, 0.14), 0x263238, 0.35)
    box((-0.4, 1.3, 1.2), (0.28, 0.04, 0.16), 0x37474f, 0.3)
    box((-0.4, 1.28, 1.2), (0.22, 0.01, 0.1), 0x80deea, 0.2, 1.5)
    box((-0.95, 1.1, 1.03), (0.3, 0.26, 0.06), 0xeceff1, 0.3)
    box((-0.95, 1.2, 1.2), (0.26, 0.05, 0.22), 0xeceff1, 0.3)
    for k in range(4):
        cyl((-1.32 + k * 0.1, 1.0, 1.1), 0.045, 0.16, 0xf5f5f5, 0.1)
        for j in range(5):
            sph((-1.32 + k * 0.1 + rnd.uniform(-0.02, 0.02), 1.0, 1.04 + j * 0.025), 0.018, rnd.choice(pal), 0.4)
        cyl((-1.32 + k * 0.1, 1.0, 1.19), 0.04, 0.02, 0xd32f2f, 0.4)
    persona(-0.75, 1.75, 0x455a64, 0xe0ac69, 0x3e2723)
    # góndola baja a la derecha
    cx, y = 0.75, 1.15
    box((cx, y + 0.28, 0.68), (1.2, 0.05, 1.36), 0xcfd3d6, 0.4)
    box((cx, y + 0.15, 0.06), (1.2, 0.3, 0.12), 0x9e9e9e, 0.5)
    for k in range(4):
        z = 0.14 + k * 0.32
        box((cx, y + 0.12, z), (1.2, 0.32, 0.02), 0xcfd3d6, 0.4)
        x = cx - 0.57
        while x < cx + 0.5:
            w = rnd.uniform(0.06, 0.13)
            h = rnd.uniform(0.12, 0.26)
            box((x + w / 2, y + 0.12, z + 0.01 + h / 2), (w, 0.22, h), rnd.choice(pal), 0.5)
            x += w + 0.012
    for xx in (cx - 0.6, cx + 0.6):
        box((xx, y + 0.15, 0.68), (0.03, 0.3, 1.36), 0xb0b6ba, 0.4)
    box((cx, y + 0.27, 1.45), (0.5, 0.02, 0.16), 0xfdd835, 0.4)


def farmacia(rnd):
    pal = [0xffffff, 0xe3f2fd, 0x80cbc4, 0x90caf9, 0xf8bbd0, 0xc5e1a5, 0xfff59d, 0xffffff]
    cosm = [0xf06292, 0xba68c8, 0x4fc3f7, 0xffd54f, 0xffffff, 0x81c784, 0xff8a65, 0x9575cd]
    cuarto(0xf7f9fa, 0xeceff1, 0xcfd8dc)
    estante(-1.5, 1.5, D, rnd, pal, levels=6, top=2.3, wood=0xffffff, kinds=('caja', 'caja', 'frasco'))
    box((0, D - 0.01, 2.44), (W, 0.02, 0.06), 0x00a86b, 0.4)
    # la cruz verde iluminada
    box((0, D - 0.05, 2.7), (0.42, 0.04, 0.13), 0x00c853, 0.3, 8.0)
    box((0, D - 0.05, 2.7), (0.13, 0.04, 0.42), 0x00c853, 0.3, 8.0)
    layer('muebles')
    # el mostrador a la izquierda (frente verde agua, tapa blanca) con la compu y la farmacéutica de guardapolvo
    mostrador(-1.6, 0.35, 0.95, 0xfafafa, 0xffffff, 0x4db6ac, h=1.0)
    box((-0.625, 0.94, 0.5), (1.83, 0.012, 0.08), 0x00897b, 0.4)
    box((-0.2, 1.3, 1.21), (0.38, 0.03, 0.26), 0x263238, 0.3)
    box((-0.2, 1.285, 1.21), (0.34, 0.01, 0.22), 0x90caf9, 0.2, 1.2)
    box((-0.2, 1.35, 1.07), (0.06, 0.06, 0.1), 0x263238, 0.3)
    for k in range(7):
        box((-1.45 + k * 0.13, 1.1 + rnd.uniform(0, 0.15), 1.1), (0.08, 0.06, rnd.uniform(0.08, 0.16)), rnd.choice(pal[1:]), 0.3)
    persona(-0.75, 1.85, 0xfafafa, 0xf1c27d, 0x5d4037)
    # vitrina baja de perfumería a la derecha: marco blanco y estantes de vidrio con productos de colores
    cx, y, w = 0.95, 1.0, 0.9
    box((cx, y + 0.22, 0.06), (w, 0.44, 0.12), 0xe0e0e0, 0.4)
    box((cx, y + 0.42, 0.55), (w, 0.03, 1.0), 0xfafafa, 0.4)
    box((cx, y + 0.22, 1.02), (w + 0.04, 0.46, 0.04), 0xfafafa, 0.3)
    for xx in (cx - w / 2, cx + w / 2):
        box((xx, y + 0.22, 0.54), (0.04, 0.46, 0.96), 0xfafafa, 0.3)
    for k in range(3):
        z = 0.14 + k * 0.29
        box((cx, y + 0.22, z), (w - 0.06, 0.4, 0.012), 0xcfe8e6, 0.1)
        x = cx - w / 2 + 0.05
        while x < cx + w / 2 - 0.09:
            if rnd.random() < 0.5:
                r = rnd.uniform(0.025, 0.035)
                h = rnd.uniform(0.1, 0.2)
                cyl((x + r, y + 0.2, z + 0.007 + h / 2), r, h, rnd.choice(cosm), 0.25)
                x += 2 * r + 0.015
            else:
                bw = rnd.uniform(0.05, 0.09)
                h = rnd.uniform(0.08, 0.2)
                box((x + bw / 2, y + 0.2, z + 0.007 + h / 2), (bw, 0.08, h), rnd.choice(cosm), 0.4)
                x += bw + 0.015
    box((cx, y - 0.01, 1.15), (0.5, 0.02, 0.2), 0x00a86b, 0.4)


def ropa(rnd):
    pal = [0x263238, 0xd32f2f, 0x1976d2, 0xfafafa, 0xf06292, 0x7cb342, 0xffb300, 0x5e35b1, 0x8d6e63]
    cuarto(0xeae2f0, 0x8d6e63, 0x795548, tablas=True)
    # abajo cajas de zapatos, arriba un caño con ropa colgada
    estante(-1.5, 1.5, D, rnd, [0xf5f5f5, 0xffcc80, 0x90a4ae, 0xef9a9a, 0xd7ccc8], levels=3, top=1.25, wood=0xeeeeee)
    box((0, D - 0.25, 2.2), (W, 0.03, 0.03), 0xb0bec5, 0.3)
    x = -1.45
    while x < 1.42:
        c = rnd.choice(pal)
        L = rnd.uniform(0.55, 0.85)
        box((x, D - 0.25, 2.18 - L / 2), (0.05, 0.42, L), c, 0.85)
        x += rnd.uniform(0.055, 0.075)
    box((0, D - 0.01, 2.55), (1.4, 0.02, 0.3), 0x5e35b1, 0.4)
    layer('muebles')
    # perchero con camisas y camperas
    y = 1.3
    for xx in (-1.4, -0.2):
        box((xx, y, 0.75), (0.03, 0.03, 1.5), 0x9e9e9e, 0.3)
        box((xx, y, 0.02), (0.06, 0.45, 0.04), 0x9e9e9e, 0.3)
    box((-0.8, y, 1.5), (1.25, 0.025, 0.025), 0x9e9e9e, 0.3)
    x = -1.33
    while x < -0.28:
        c = rnd.choice(pal)
        L = rnd.uniform(0.6, 0.9)
        box((x, y, 1.47 - L / 2), (0.05, 0.44, L), c, 0.85)
        box((x, y, 1.47 - 0.04), (0.055, 0.34, 0.08), c, 0.85)
        x += rnd.uniform(0.06, 0.08)
    # mesa con ropa doblada y el maniquí en la vidriera
    box((0.25, 1.0, 0.38), (0.55, 0.45, 0.76), 0xd7ccc8, 0.5)
    for k in range(3):
        z = 0.78
        for j in range(rnd.randint(3, 6)):
            box((0.08 + k * 0.17, 1.0, z + 0.025), (0.15, 0.3, 0.045), rnd.choice(pal), 0.85)
            z += 0.05
    persona(0.95, 0.8, 0xf06292, 0xfafafa, 0xfafafa, pantalon=0x1565c0, cabeza=0xf5f5f5)
    # la vendedora, atrás
    persona(-0.45, 2.3, 0x263238, 0xd8a47f, 0x212121, pantalon=0x37474f)


def panaderia(rnd):
    pal = [0xc68642, 0xd4a056, 0xe3b875, 0xa5652e, 0xf0d5a0]
    cuarto(0xfff3e0, 0xc8a27a, 0xb08964)
    estante(-1.5, 1.5, D, rnd, pal, levels=4, top=1.9, wood=0x8d6e63, kinds=('pan', 'pan', 'caja'))
    # pizarrón con los precios y el reloj
    box((-0.6, D - 0.02, 2.35), (1.1, 0.03, 0.62), 0x5d4037, 0.6)
    box((-0.6, D - 0.035, 2.35), (1.0, 0.02, 0.52), 0x2e3b32, 0.7)
    for k in range(5):
        L = rnd.uniform(0.4, 0.8)
        box((-1.0 + L / 2, D - 0.05, 2.53 - k * 0.09), (L, 0.01, 0.025), 0xf5f5f5, 0.8)
        box((-0.18, D - 0.05, 2.53 - k * 0.09), (0.12, 0.01, 0.025), 0xfff59d, 0.8)
    reloj(0.9, 2.5)
    layer('muebles')
    # vitrina corrida: base baja de madera y el vidrio con luz, con facturas en tres bandejas; canastos de pan
    # arriba (la vidriera de la calle se ve sobre todo de la cintura para abajo)
    y0, dy = 0.85, 0.6
    box((0, y0 + dy / 2, 0.2), (3.2, dy, 0.4), 0x795548, 0.5)
    box((0, y0 - 0.005, 0.21), (3.1, 0.01, 0.28), 0x8d6e63, 0.5)
    box((0, y0 + dy - 0.02, 0.72), (3.2, 0.04, 0.64), 0x8d6e63, 0.5)
    box((0, y0 + dy / 2, 1.05), (3.2, dy, 0.03), 0x6d4c41, 0.4)
    box((0, y0 + dy / 2, 1.025), (3.0, dy - 0.1, 0.012), 0xffffff, 0.3, 2.5)
    for xx in (-1.5, 0.0, 1.5):
        box((xx, y0 + 0.02, 0.72), (0.03, 0.04, 0.64), 0x6d4c41, 0.4)
    for tz in (0.41, 0.6, 0.79):
        box((0, y0 + 0.3, tz), (3.0, 0.45, 0.012), 0xd7ccc8, 0.2)
        x = -1.45
        while x < 1.42:
            r = rnd.uniform(0.04, 0.06)
            sph((x + r, y0 + 0.16 + rnd.uniform(0, 0.12), tz + 0.03), r, rnd.choice(pal), 0.7, sc=(1.4, 1.0, 0.55))
            x += 2.6 * r + rnd.uniform(0.01, 0.03)
    for k in range(3):
        bx = -1.0 + k * 1.0
        box((bx, y0 + 0.3, 1.14), (0.55, 0.38, 0.15), 0xa1887f, 0.85)
        for j in range(5):
            cyl((bx - 0.2 + j * 0.1, y0 + 0.3, 1.24), 0.045, 0.3, rnd.choice(pal), 0.75, axis='Y', n=10)
    persona(0.55, 1.85, 0xfafafa, 0xe0ac69, 0x4e342e, delantal=0xffffff, gorro=0xfafafa)


# ---------------------------------------------------------------- render


def render(objs, muebles):
    # el cuarto: sin los muebles. Los muebles: el cuarto no se ve (pero alumbra) y el piso solo junta sombra
    scene.render.film_transparent = muebles
    scene.render.image_settings.color_mode = 'RGBA' if muebles else 'RGB'
    for o in objs['cuarto']:
        o.visible_camera = not muebles
    for o in objs['piso']:
        o.is_shadow_catcher = muebles
    for o in objs['muebles']:
        o.hide_render = not muebles
    tmp = TEX.replace('.webp', '.png')
    scene.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    from PIL import Image

    im = np.array(Image.open(tmp).convert('RGBA'))
    os.remove(tmp)
    return im


def dilate(im, n=16):
    # el color de los bordes de los muebles se corre a lo transparente (si no, el filtrado los oscurece)
    rgb = im[..., :3].astype(np.float32)
    have = im[..., 3] > 0
    for _ in range(n):
        acc = np.zeros_like(rgb)
        cnt = np.zeros(have.shape, np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            h = np.roll(have, (dy, dx), (0, 1))
            acc += np.roll(rgb, (dy, dx), (0, 1)) * h[..., None]
            cnt += h
        new = ~have & (cnt > 0)
        rgb[new] = acc[new] / cnt[new][:, None]
        have |= new
    out = im.copy()
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return out


def variant(fn, seed):
    for o in list(scene.objects):
        if o.type == 'MESH':
            bpy.data.objects.remove(o)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)
    layer('cuarto')
    fn(random.Random(seed))
    objs = flush()
    room = render(objs, False)
    room[..., 3] = 255
    furn = dilate(render(objs, True))
    return room, furn


scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 48
scene.cycles.max_bounces = 6
# (el quitarruido de Cycles, si esta versión de bpy lo trae)
try:
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'
except Exception:
    scene.cycles.use_denoising = False
scene.view_settings.view_transform = 'Standard'
scene.render.resolution_x = scene.render.resolution_y = RES
scene.render.image_settings.file_format = 'PNG'
world = bpy.data.worlds.new('w')
scene.world = world
world.node_tree.nodes['Background'].inputs[0].default_value = (0.6, 0.62, 0.65, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 0.25
# la cámara: CAM metros delante del vidrio, a media altura, abarcando el tramo (más el margen)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
scene.collection.objects.link(cam)
cam.location = (0, -CAM, H / 2)
cam.rotation_euler = (math.radians(90), 0, 0)
cam.data.lens_unit = 'FOV'
cam.data.sensor_fit = 'HORIZONTAL'
cam.data.angle = 2 * math.atan(M * W / 2 / CAM)
scene.camera = cam
# la luz de la calle que entra por la vidriera (larga, como la vidriera)
sun = bpy.data.objects.new('afuera', bpy.data.lights.new('afuera', 'AREA'))
sun.data.shape = 'RECTANGLE'
sun.data.size = 15
sun.data.size_y = 1.6
sun.data.energy = 220
sun.location = (0, -1.2, 2.4)
sun.rotation_euler = (math.radians(65), 0, 0)
scene.collection.objects.link(sun)

rooms, furns = [], []
for i, f in enumerate((almacen, farmacia, ropa, panaderia)):
    r, m = variant(f, 10 + i)
    rooms.append(r)
    furns.append(m)
    print('listo', f.__name__, flush=True)
atlas = np.concatenate([np.concatenate(rooms, axis=1), np.concatenate(furns, axis=1)], axis=0)
from PIL import Image  # noqa: E402

Image.fromarray(atlas, 'RGBA').save(TEX, 'WEBP', quality=86, alpha_quality=90, method=6)
print('listo:', TEX, atlas.shape)
