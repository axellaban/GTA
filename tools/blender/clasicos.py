# Los autos de todos los días del conurbano, hechos en Blender con las mismas herramientas que los de alta gama
# (tools/blender/autos.py): carrocería de cortes suavizados, pasarruedas, vidrios con el interior atrás, sombra
# horneada en los vértices, cromados, luces con su forma y paragolpes, puerta del conductor y capó sueltos (se
# abren en el juego) y el kit de tuning (franjas y alerón). Parodias sin marcas ni logos, como en los GTA:
#   python3 tools/blender/clasicos.py            sale public/models/vehicles/clasicos.glb
#   python3 tools/blender/clasicos.py --vista    además, las fotos (AUTOS_VISTA: carpeta; AUTOS_SOLO=duna,gol: algunos)
# Las medidas (largo y ancho) son las de los autos hechos por código de src/cars.js, que siguen andando hasta que
# carga este glb: así el tránsito, los choques y los estacionamientos no cambian.
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autos as A  # noqa: E402  (arma la escena vacía y trae todo lo de los autos)
from autos import hit, lerp, bumper, NH, ROOF, BELT  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

GLB = os.environ.get('AUTOS_GLB') or os.path.join(A.ROOT, 'public', 'models', 'vehicles', 'clasicos.glb')

CHROME = 0xdddddd  # (el mismo gris que el paragolpes cromado de los autos hechos por código)
BLACK = 0x111111
RUBBER = 0x161616
AMBER = 0xff9a00
LENS = 0xfff3cf
RED = 0xb01010
REV = 0xd8d8d2  # luz de retroceso (vidrio blanco, apagada)
AMBER_OFF = 0xc86a10  # giro de atrás (apagado: va en los detalles)


# ---------------------------------------------------------------- piezas que se repiten


def door_lines(c, cuts, z0, z1, sides=(-1, 1)):
    # los cortes de las puertas: rayitas oscuras verticales en el costado, del zócalo a la cintura
    for sx in sides:
        for y in cuts:
            c['vline'](c['D'], y, z0, z1, sx, 0x161616)


def rub_strip(c, y0, y1, z, col=RUBBER, w=0.045, h=0.008, P=None):
    # bagueta lateral (negra de goma o cromada)
    for sx in (-1, 1):
        pts, nrm = c['side_pts'](y0, y1, z, sx)
        if len(pts) > 1:
            (P or c['D']).strip(pts, nrm, w, h, col)


def round_light(c, x, z, r, front, lens=LENS, bezel=CHROME, part=None, depth=0.05):
    # faro redondo: aro cromado, el reflector y el vidrio un poco abombado
    L2 = c['spec']['L'] / 2 + 1
    loc, nr = hit(c['bvh'], (x, -L2 if front else L2, z), (0, 1 if front else -1, 0))
    if loc is None:
        return
    d = -1 if front else 1
    P = part or c['L']
    c['S'].cyl(loc + Vector((0, d * 0.006, 0)), r + 0.018, depth, bezel, axis='Y', n=16)
    c['D'].cyl(loc + Vector((0, d * (depth / 2 + 0.004), 0)), r + 0.004, 0.006, 0x8a8a8a, axis='Y', n=16)
    P.cyl(loc + Vector((0, d * (depth / 2 + 0.01), 0)), r, 0.012, lens, axis='Y', n=16)
    P.cyl(loc + Vector((0, d * (depth / 2 + 0.018), 0)), r * 0.55, 0.006, lens, axis='Y', n=12)


def grille_bars(c, x0, x1, z0, z1, n, col, part, w=0.012, h=0.012, front=True, vertical=False):
    # varillas de parrilla, horizontales (o verticales) sobre el fondo negro
    if vertical:
        for j in range(n):
            x = lerp(x0, x1, (j + 0.5) / n)
            pts, nrm = [], []
            for zz in (z0, (z0 + z1) / 2, z1):
                loc, nr = hit(c['bvh'], (x, -c['spec']['L'] / 2 - 1 if front else c['spec']['L'] / 2 + 1, zz), (0, 1 if front else -1, 0))
                if loc is not None:
                    pts.append(loc)
                    nrm.append(nr)
            if len(pts) > 1:
                part.strip(pts, nrm, w, h, col, up=Vector((1, 0, 0)))
        return
    for j in range(n):
        z = lerp(z0, z1, (j + 0.5) / n)
        pts, nrm = c['end_pts'](x0, x1, z, front, step=0.1)
        if len(pts) > 1:
            part.strip(pts, nrm, w, h, col)


def frame(c, x0, x1, z0, z1, front, col, part, w=0.016, h=0.01):
    # marco (de parrilla o de faro): cuatro tiras
    for z in (z0, z1):
        pts, nrm = c['end_pts'](x0 - w / 2, x1 + w / 2, z, front, step=0.1)
        if len(pts) > 1:
            part.strip(pts, nrm, w, h, col)
    grille_bars(c, x0 - w / 2, x0 + w / 2, z0, z1, 1, col, part, w=w, h=h, front=front, vertical=True)
    grille_bars(c, x1 - w / 2, x1 + w / 2, z0, z1, 1, col, part, w=w, h=h, front=front, vertical=True)


def window_chrome(c, y0, y1, z, sx_list=(-1, 1)):
    # moldura cromada abajo de las ventanillas
    for sx in sx_list:
        pts, nrm = c['side_pts'](y0, y1, z, sx)
        if len(pts) > 1:
            c['S'].strip(pts, nrm, 0.014, 0.006, CHROME)


def exhaust(c, x, z=0.24, r=0.032, ln=0.22):
    # caño de escape (abajo, atrás, del lado izquierdo: ahí lo pone el humo del juego)
    sp = c['spec']
    c['D'].cyl((x, sp['L'] / 2 - 0.08, z), r, ln, 0x2a2a2a, axis='Y', n=8)
    c['D'].cyl((x, sp['L'] / 2 + 0.02, z), r * 0.7, 0.02, 0x050505, axis='Y', n=8)


# ---------------------------------------------------------------- Duna: el sedán compacto de tres cajas de los 80/90
# Cajita prolija: trompa baja con los faros rectangulares y la parrilla negra finita entre los dos, paragolpes
# negros envolventes, bagueta de goma al costado, cuatro puertas y las luces de atrás anchas en tres colores.


def duna_details(c):
    sp, D, S, L, T, X = c['spec'], c['D'], c['S'], c['L'], c['T'], c['X']
    # trompa: faros rectangulares con su marco, la parrilla de varillas y los giros en las esquinas
    c['end_patch'](X, -0.78, 0.78, 0.52, 0.72, True, BLACK, off=0.003, nx=10, nz=2)
    for sx in (-1, 1):
        c['end_patch'](L, sx * 0.44, sx * 0.72, 0.555, 0.69, True, LENS, off=0.008, nx=4, nz=2)
        c['end_patch'](D, sx * 0.47, sx * 0.69, 0.6, 0.64, True, 0xb8b8b0, off=0.01, nx=2, nz=1)
        c['end_quad'](L, [(sx * 0.73, 0.555), (sx * 0.8, 0.565), (sx * 0.8, 0.68), (sx * 0.73, 0.69)], True, AMBER, off=0.008, nx=1, nz=1)
    grille_bars(c, -0.38, 0.38, 0.565, 0.68, 4, 0x2a2a2a, D, w=0.014, h=0.01)
    # paragolpes negros envolventes, con la goma de arriba
    bumper(c, True, 0.43, 0.16, 0.05, 0x1c1c1c, a=58, kind='detail')
    bumper(c, False, 0.46, 0.17, 0.05, 0x1c1c1c, a=58, kind='detail')
    # costado: bagueta de goma, cortes de puertas y el pilar del medio negro
    rub_strip(c, -1.62, 1.86, 0.55)
    door_lines(c, [-0.8, 0.18, 0.22, 0.98], 0.3, 0.9)
    # cola: luces anchas (giro, freno y retroceso) y el panel negro del medio
    for sx in (-1, 1):
        c['end_patch'](T, sx * 0.52, sx * 0.79, 0.68, 0.85, False, RED, off=0.006, nx=3, nz=2)
        c['end_patch'](D, sx * 0.43, sx * 0.52, 0.68, 0.85, False, AMBER_OFF, off=0.006, nx=1, nz=1)
        c['end_patch'](D, sx * 0.37, sx * 0.43, 0.68, 0.85, False, REV, off=0.006, nx=1, nz=1)
    c['end_patch'](X, -0.37, 0.37, 0.68, 0.85, False, 0x1a1a1a, off=0.004, nx=6, nz=1)
    exhaust(c, 0.45)


DUNA = {
    'name': 'duna',
    'L': 4.2, 'W': 1.66,
    'wheelR': 0.29, 'tireW': 0.18, 'rim': 0.64, 'spokes': 'taza', 'rimCol': 0xb8bcc0, 'wheelSegs': 18, 'whitewall': 0.025,
    'wheels': [(-0.71, -1.33, 0.29), (0.71, -1.33, 0.29), (-0.71, 1.12, 0.29), (0.71, 1.12, 0.29)],
    'seat': 0x4a4038, 'cabin': 0x3a3530, 'dash': 0x1e1e1e, 'plateZ': (0.43, 0.74), 'plateOff': (0.05, 0.0), 'plate': '95', 'mirror': 'black', 'seatY': 0.05,
    'handles': [-0.02, 0.86], 'pillars': [0.2], 'cpillar': 1, 'rearSeats': True, 'seatZ': 0.27, 'arch': 0.05,
    'door': (-0.8, 0.18), 'hood': (-2.0, -0.78), 'kit': {'trunk': True, 'spoiler': 0.22},
    'names': ['f0', 'f1', 'f2', 'fa', 'ws0', 'w2', 'w3', 'ws1', 'rr', 'ra', 'rw1', 'r1', 'r0'],
    'keys': [
        dict(y=-2.1, zb=0.3, zs=0.64, zt=0.66, wb=0.72, wm=0.76, ws=0.75, wt=0.7, cr=0.0),
        dict(y=-2.05, zb=0.22, zs=0.72, zt=0.74, wb=0.79, wm=0.815, ws=0.8, wt=0.75, cr=0.005),
        dict(y=-1.85, zb=0.2, zs=0.77, zt=0.79, wb=0.81, wm=0.83, ws=0.815, wt=0.765, cr=0.01),
        dict(y=-1.33, zb=0.2, zs=0.83, zt=0.85, wb=0.81, wm=0.83, ws=0.815, wt=0.765, cr=0.015),
        dict(y=-0.8, zb=0.2, zs=0.88, zt=0.9, wb=0.81, wm=0.83, ws=0.815, wt=0.76, cr=0.015),
        dict(y=-0.62, zb=0.2, zs=0.885, zt=1.02, wb=0.81, wm=0.83, ws=0.815, wt=0.73, cr=0.018, gs=0.4),
        dict(y=-0.28, zb=0.2, zs=0.9, zt=1.29, wb=0.81, wm=0.83, ws=0.81, wt=0.67, cr=0.022, gs=0.4),
        dict(y=-0.1, zb=0.2, zs=0.905, zt=1.38, wb=0.81, wm=0.83, ws=0.81, wt=0.645, cr=0.025, gs=0.4),
        dict(y=0.9, zb=0.2, zs=0.93, zt=1.37, wb=0.81, wm=0.83, ws=0.81, wt=0.645, cr=0.025, gs=0.4),
        dict(y=1.15, zb=0.2, zs=0.94, zt=1.19, wb=0.81, wm=0.83, ws=0.81, wt=0.7, cr=0.02),
        dict(y=1.38, zb=0.21, zs=0.95, zt=0.985, wb=0.81, wm=0.83, ws=0.81, wt=0.765, cr=0.015),
        dict(y=2.03, zb=0.24, zs=0.95, zt=0.975, wb=0.8, wm=0.82, ws=0.8, wt=0.76, cr=0.01),
        dict(y=2.1, zb=0.32, zs=0.9, zt=0.92, wb=0.74, wm=0.77, ws=0.76, wt=0.72, cr=0.0),
    ],
    'details': duna_details,
}


# ---------------------------------------------------------------- Gol: el hatchback chiquito de tres puertas
# Trompa corta con los faros rectangulares y la parrilla negra de varillas, paragolpes negros de plástico, una
# puerta grande por lado y la cola cortada con el portón y las luces altas.


def gol_details(c):
    sp, D, S, L, T, X = c['spec'], c['D'], c['S'], c['L'], c['T'], c['X']
    c['end_patch'](D, -0.74, 0.74, 0.5, 0.7, True, BLACK, off=0.003, nx=10, nz=2)
    for sx in (-1, 1):
        c['end_patch'](L, sx * 0.42, sx * 0.72, 0.53, 0.67, True, LENS, off=0.008, nx=4, nz=2)
        c['end_patch'](D, sx * 0.45, sx * 0.69, 0.58, 0.62, True, 0xb8b8b0, off=0.01, nx=2, nz=1)
        c['end_quad'](L, [(sx * 0.72, 0.53), (sx * 0.78, 0.54), (sx * 0.78, 0.66), (sx * 0.72, 0.67)], True, AMBER, off=0.008, nx=1, nz=1)
    grille_bars(c, -0.36, 0.36, 0.54, 0.66, 3, 0x2a2a2a, D, w=0.016, h=0.01)
    bumper(c, True, 0.4, 0.15, 0.05, 0x1c1c1c, a=58, kind='detail')
    bumper(c, False, 0.44, 0.16, 0.05, 0x1c1c1c, a=58, kind='detail')
    rub_strip(c, -1.25, 1.55, 0.52)
    door_lines(c, [-0.66, 0.5], 0.3, 0.9)
    # cola: el portón con el vidrio, las luces en las esquinas y la cerradura
    for sx in (-1, 1):
        c['end_patch'](T, sx * 0.48, sx * 0.76, 0.72, 0.9, False, RED, off=0.006, nx=3, nz=2)
        c['end_patch'](D, sx * 0.48, sx * 0.76, 0.66, 0.72, False, AMBER_OFF, off=0.006, nx=2, nz=1)
    c['end_patch'](D, -0.04, 0.04, 0.78, 0.82, False, 0x2a2a2a, off=0.007, nx=1, nz=1)
    exhaust(c, 0.42, z=0.25)


GOL = {
    'name': 'gol',
    'L': 3.85, 'W': 1.66,
    'wheelR': 0.29, 'tireW': 0.18, 'rim': 0.62, 'spokes': 'acero', 'steelCol': 0x3a3a3a, 'rimCol': 0x9a9a9a, 'wheelSegs': 18,
    'wheels': [(-0.71, -1.2, 0.29), (0.71, -1.2, 0.29), (-0.71, 1.25, 0.29), (0.71, 1.25, 0.29)],
    'seat': 0x3a3a3e, 'cabin': 0x2e2e32, 'dash': 0x1b1b1b, 'plateZ': (0.42, 0.62), 'plateOff': (0.05, 0.0), 'plate': '95', 'mirror': 'black',
    'handles': [0.35], 'pillars': [], 'cpillar': 1, 'rearSeats': True, 'seatZ': 0.27, 'seatY': 0.15, 'arch': 0.05,
    'door': (-0.66, 0.5), 'hood': (-1.85, -0.62), 'kit': {'spoiler': 0.06},
    'names': ['f0', 'f1', 'f2', 'fa', 'ws0', 'w2', 'w3', 'ws1', 'rr', 'rw1', 'r1', 'r0'],
    'keys': [
        dict(y=-1.925, zb=0.3, zs=0.62, zt=0.64, wb=0.72, wm=0.76, ws=0.75, wt=0.7, cr=0.0),
        dict(y=-1.87, zb=0.22, zs=0.7, zt=0.72, wb=0.79, wm=0.815, ws=0.8, wt=0.75, cr=0.005),
        dict(y=-1.65, zb=0.2, zs=0.76, zt=0.78, wb=0.81, wm=0.83, ws=0.815, wt=0.765, cr=0.01),
        dict(y=-1.2, zb=0.2, zs=0.82, zt=0.84, wb=0.81, wm=0.83, ws=0.815, wt=0.765, cr=0.012),
        dict(y=-0.62, zb=0.2, zs=0.88, zt=0.9, wb=0.81, wm=0.83, ws=0.815, wt=0.76, cr=0.015),
        dict(y=-0.45, zb=0.2, zs=0.885, zt=1.03, wb=0.81, wm=0.83, ws=0.815, wt=0.73, cr=0.018, gs=0.4),
        dict(y=-0.15, zb=0.2, zs=0.9, zt=1.3, wb=0.81, wm=0.83, ws=0.81, wt=0.67, cr=0.022, gs=0.4),
        dict(y=0.0, zb=0.2, zs=0.905, zt=1.41, wb=0.81, wm=0.83, ws=0.81, wt=0.645, cr=0.025, gs=0.4),
        dict(y=1.3, zb=0.2, zs=0.93, zt=1.38, wb=0.81, wm=0.83, ws=0.81, wt=0.65, cr=0.025, gs=0.4),
        dict(y=1.72, zb=0.21, zs=0.95, zt=1.0, wb=0.81, wm=0.83, ws=0.81, wt=0.74, cr=0.012),
        dict(y=1.88, zb=0.24, zs=0.95, zt=0.97, wb=0.8, wm=0.82, ws=0.8, wt=0.75, cr=0.008),
        dict(y=1.925, zb=0.32, zs=0.9, zt=0.92, wb=0.74, wm=0.77, ws=0.76, wt=0.72, cr=0.0),
    ],
    'details': gol_details,
}


# ---------------------------------------------------------------- Falcon: el sedán grande de los 60/70
# Capó larguísimo, parrilla cromada de punta a punta con los cuatro faros redondos, paragolpes cromados gruesos,
# molduras cromadas en las ventanillas y el costado, y las luces de atrás rectangulares.


def falcon_details(c):
    sp, D, S, L, T, X = c['spec'], c['D'], c['S'], c['L'], c['T'], c['X']
    c['end_patch'](D, -0.82, 0.82, 0.58, 0.8, True, BLACK, off=0.003, nx=12, nz=2)
    frame(c, -0.82, 0.82, 0.58, 0.8, True, CHROME, S)
    grille_bars(c, -0.42, 0.42, 0.6, 0.78, 5, CHROME, S, w=0.01, h=0.01)
    for sx in (-1, 1):
        for x in (0.52, 0.71):
            round_light(c, sx * x, 0.69, 0.075, True)
    bumper(c, True, 0.46, 0.13, 0.07, CHROME, a=55)
    bumper(c, False, 0.48, 0.13, 0.07, CHROME, a=55)
    window_chrome(c, -0.35, 0.9, 0.93)
    rub_strip(c, -1.9, 2.15, 0.62, col=CHROME, w=0.025, h=0.008, P=S)
    door_lines(c, [-0.98, 0.1, 0.15, 1.0], 0.32, 0.94)
    for sx in (-1, 1):
        c['end_patch'](T, sx * 0.46, sx * 0.76, 0.64, 0.8, False, RED, off=0.006, nx=4, nz=2)
        c['end_patch'](D, sx * 0.56, sx * 0.66, 0.66, 0.71, False, REV, off=0.009, nx=1, nz=1)
    c['end_patch'](S, -0.5, 0.5, 0.78, 0.82, False, CHROME, off=0.005, nx=6, nz=1)
    exhaust(c, 0.5, z=0.27)


FALCON = {
    'name': 'falcon',
    'L': 4.8, 'W': 1.82,
    'wheelR': 0.33, 'tireW': 0.2, 'rim': 0.62, 'spokes': 'taza', 'rimCol': 0xcfd2d6, 'wheelSegs': 18, 'whitewall': 0.03,
    'wheels': [(-0.78, -1.55, 0.33), (0.78, -1.55, 0.33), (-0.78, 1.23, 0.33), (0.78, 1.23, 0.33)],
    'seat': 0x6b4a32, 'cabin': 0x4a3828, 'dash': 0x2a2018, 'plateZ': (0.47, 0.62), 'plateOff': (0.07, 0.0), 'plate': 'negra', 'mirror': 'chrome', 'roundMirror': True,
    'handles': [-0.15, 0.75], 'chromeHandles': True, 'pillars': [0.12], 'cpillar': 1, 'rearSeats': True, 'seatZ': 0.3, 'seatY': -0.15, 'arch': 0.06,
    'door': (-0.98, 0.12), 'hood': (-2.32, -1.05), 'kit': {'trunk': True, 'spoiler': 0.18},
    'names': ['f0', 'f1', 'f2', 'fa', 'ws0', 'w2', 'w3', 'ws1', 'rr', 'w5', 'rw1', 'r1', 'r0'],
    'keys': [
        dict(y=-2.4, zb=0.34, zs=0.72, zt=0.74, wb=0.82, wm=0.86, ws=0.85, wt=0.8, cr=0.0),
        dict(y=-2.34, zb=0.24, zs=0.8, zt=0.82, wb=0.86, wm=0.9, ws=0.89, wt=0.84, cr=0.005),
        dict(y=-2.1, zb=0.22, zs=0.83, zt=0.85, wb=0.88, wm=0.91, ws=0.9, wt=0.85, cr=0.008),
        dict(y=-1.55, zb=0.22, zs=0.87, zt=0.89, wb=0.88, wm=0.91, ws=0.9, wt=0.85, cr=0.01),
        dict(y=-1.05, zb=0.22, zs=0.91, zt=0.93, wb=0.88, wm=0.91, ws=0.9, wt=0.84, cr=0.012),
        dict(y=-0.85, zb=0.22, zs=0.915, zt=1.07, wb=0.88, wm=0.91, ws=0.9, wt=0.8, cr=0.015, gs=0.4),
        dict(y=-0.55, zb=0.22, zs=0.92, zt=1.3, wb=0.88, wm=0.91, ws=0.89, wt=0.72, cr=0.02, gs=0.4),
        dict(y=-0.35, zb=0.22, zs=0.925, zt=1.38, wb=0.88, wm=0.91, ws=0.89, wt=0.7, cr=0.025, gs=0.4),
        dict(y=0.85, zb=0.22, zs=0.935, zt=1.37, wb=0.88, wm=0.91, ws=0.89, wt=0.7, cr=0.025, gs=0.4),
        dict(y=1.15, zb=0.22, zs=0.94, zt=1.18, wb=0.88, wm=0.91, ws=0.89, wt=0.76, cr=0.02),
        dict(y=1.4, zb=0.22, zs=0.945, zt=0.97, wb=0.88, wm=0.91, ws=0.89, wt=0.84, cr=0.012),
        dict(y=2.3, zb=0.26, zs=0.94, zt=0.96, wb=0.87, wm=0.9, ws=0.89, wt=0.84, cr=0.01),
        dict(y=2.4, zb=0.34, zs=0.88, zt=0.9, wb=0.8, wm=0.84, ws=0.83, wt=0.8, cr=0.0),
    ],
    'details': falcon_details,
}


# ---------------------------------------------------------------- 504: el sedán familiar de los 70/80
# Faros trapezoidales (más anchos abajo), parrilla cromada chica, paragolpes cromados finitos, la luneta larga
# y el baúl que cae, y las luces de atrás horizontales.


def p504_details(c):
    sp, D, S, L, T, X = c['spec'], c['D'], c['S'], c['L'], c['T'], c['X']
    c['end_patch'](D, -0.32, 0.32, 0.56, 0.72, True, BLACK, off=0.004, nx=6, nz=2)
    grille_bars(c, -0.3, 0.3, 0.57, 0.71, 4, CHROME, S, w=0.01, h=0.01)
    frame(c, -0.33, 0.33, 0.56, 0.72, True, CHROME, S, w=0.012)
    for sx in (-1, 1):
        c['end_quad'](L, [(sx * 0.37, 0.56), (sx * 0.8, 0.57), (sx * 0.78, 0.71), (sx * 0.41, 0.72)], True, LENS, off=0.008, nx=4, nz=2)
        c['end_quad'](D, [(sx * 0.4, 0.62), (sx * 0.75, 0.625), (sx * 0.745, 0.66), (sx * 0.42, 0.665)], True, 0xb8b8b0, off=0.011, nx=2, nz=1)
    bumper(c, True, 0.43, 0.09, 0.06, CHROME, a=58)
    bumper(c, False, 0.45, 0.09, 0.06, CHROME, a=58)
    window_chrome(c, -0.3, 0.6, 0.92)
    rub_strip(c, -1.7, 2.0, 0.55, col=0x1a1a1a)
    door_lines(c, [-0.95, 0.1, 0.14, 0.95], 0.3, 0.92)
    for sx in (-1, 1):
        c['end_patch'](T, sx * 0.46, sx * 0.74, 0.7, 0.83, False, RED, off=0.006, nx=4, nz=2)
        c['end_patch'](D, sx * 0.36, sx * 0.46, 0.7, 0.83, False, AMBER_OFF, off=0.006, nx=1, nz=1)
    c['end_patch'](S, -0.36, 0.36, 0.81, 0.83, False, CHROME, off=0.005, nx=4, nz=1)
    exhaust(c, 0.45, z=0.25)


P504 = {
    'name': 'p504',
    'L': 4.5, 'W': 1.69,
    'wheelR': 0.3, 'tireW': 0.19, 'rim': 0.62, 'spokes': 'taza', 'rimCol': 0xc4c8cc, 'wheelSegs': 18,
    'wheels': [(-0.72, -1.45, 0.3), (0.72, -1.45, 0.3), (-0.72, 1.29, 0.3), (0.72, 1.29, 0.3)],
    'seat': 0x5a4636, 'cabin': 0x3e3228, 'dash': 0x221a14, 'plateZ': (0.44, 0.6), 'plateOff': (0.06, 0.0), 'plate': 'negra', 'mirror': 'chrome', 'roundMirror': True,
    'handles': [-0.15, 0.7], 'chromeHandles': True, 'pillars': [0.12], 'cpillar': 1, 'rearSeats': True, 'seatZ': 0.29, 'seatY': -0.12, 'arch': 0.05,
    'door': (-0.95, 0.12), 'hood': (-2.18, -1.0), 'kit': {'trunk': True, 'spoiler': 0.2},
    'names': ['f0', 'f1', 'f2', 'fa', 'ws0', 'w2', 'w3', 'ws1', 'rr', 'w5', 'rw1', 'r1', 'r0'],
    'keys': [
        dict(y=-2.25, zb=0.3, zs=0.66, zt=0.68, wb=0.74, wm=0.78, ws=0.77, wt=0.72, cr=0.0),
        dict(y=-2.19, zb=0.22, zs=0.73, zt=0.75, wb=0.8, wm=0.835, ws=0.83, wt=0.78, cr=0.005),
        dict(y=-1.95, zb=0.2, zs=0.78, zt=0.8, wb=0.82, wm=0.845, ws=0.84, wt=0.79, cr=0.01),
        dict(y=-1.45, zb=0.2, zs=0.83, zt=0.85, wb=0.82, wm=0.845, ws=0.84, wt=0.79, cr=0.012),
        dict(y=-1.0, zb=0.2, zs=0.88, zt=0.9, wb=0.82, wm=0.845, ws=0.84, wt=0.78, cr=0.014),
        dict(y=-0.8, zb=0.2, zs=0.89, zt=1.05, wb=0.82, wm=0.845, ws=0.835, wt=0.76, cr=0.016, gs=0.4),
        dict(y=-0.5, zb=0.2, zs=0.9, zt=1.33, wb=0.82, wm=0.845, ws=0.83, wt=0.68, cr=0.02, gs=0.4),
        dict(y=-0.3, zb=0.2, zs=0.905, zt=1.42, wb=0.82, wm=0.845, ws=0.83, wt=0.655, cr=0.025, gs=0.4),
        dict(y=0.55, zb=0.2, zs=0.915, zt=1.41, wb=0.82, wm=0.845, ws=0.83, wt=0.655, cr=0.025, gs=0.4),
        dict(y=0.9, zb=0.2, zs=0.925, zt=1.2, wb=0.82, wm=0.845, ws=0.83, wt=0.72, cr=0.02),
        dict(y=1.2, zb=0.2, zs=0.935, zt=0.99, wb=0.82, wm=0.845, ws=0.83, wt=0.79, cr=0.012),
        dict(y=2.15, zb=0.24, zs=0.92, zt=0.95, wb=0.81, wm=0.84, ws=0.83, wt=0.78, cr=0.01),
        dict(y=2.25, zb=0.32, zs=0.86, zt=0.88, wb=0.74, wm=0.78, ws=0.77, wt=0.73, cr=0.0),
    ],
    'details': p504_details,
}


# ---------------------------------------------------------------- 600: el chiquito redondo con el motor atrás
# Sin parrilla adelante (el motor va atrás): los faros redondos en los guardabarros, el escudito, paragolpes
# cromados finitos con los colmillos; atrás la tapa del motor con las rejillas y las lucecitas.


def fiat600_details(c):
    sp, D, S, L, T, X = c['spec'], c['D'], c['S'], c['L'], c['T'], c['X']
    for sx in (-1, 1):
        round_light(c, sx * 0.47, 0.64, 0.075, True)
        c['end_patch'](L, sx * 0.3, sx * 0.4, 0.52, 0.56, True, AMBER, off=0.008, nx=1, nz=1)
    c['end_patch'](S, -0.05, 0.05, 0.62, 0.7, True, CHROME, off=0.008, nx=1, nz=2)
    bumper(c, True, 0.42, 0.05, 0.05, CHROME, a=60)
    bumper(c, False, 0.44, 0.05, 0.05, CHROME, a=60)
    for sx in (-1, 1):
        for front in (True, False):
            c['end_patch'](S, sx * 0.24, sx * 0.3, 0.38, 0.5, front, CHROME, off=0.04, nx=1, nz=1)
    window_chrome(c, -0.3, 0.45, 0.86)
    door_lines(c, [-0.55, 0.45], 0.32, 0.86)
    # atrás: la tapa del motor con las rejillas de ventilación y las luces chiquitas
    grille_bars(c, -0.3, 0.3, 0.62, 0.74, 5, 0x161616, D, w=0.012, h=0.006, front=False)
    for sx in (-1, 1):
        c['end_patch'](T, sx * 0.44, sx * 0.56, 0.6, 0.72, False, RED, off=0.006, nx=2, nz=2)
    exhaust(c, 0.32, z=0.26, r=0.028)


FIAT600 = {
    'name': 'fiat600',
    'L': 3.3, 'W': 1.38,
    'wheelR': 0.27, 'tireW': 0.15, 'rim': 0.62, 'spokes': 'taza', 'rimCol': 0xd6d8da, 'wheelSegs': 16,
    'wheels': [(-0.58, -0.98, 0.27), (0.58, -0.98, 0.27), (-0.58, 1.02, 0.27), (0.58, 1.02, 0.27)],
    'seat': 0x7a2a22, 'cabin': 0x4a2a24, 'dash': 0x2a2a2a, 'plateZ': (0.5, 0.52), 'plateOff': (0.05, 0.03), 'plate': 'negra', 'mirror': 'chrome', 'roundMirror': True,
    'mirrorY': 0.12, 'handles': [0.25], 'chromeHandles': True, 'pillars': [], 'cpillar': 1, 'rearSeats': False, 'seatZ': 0.28, 'seatY': 0.0, 'arch': 0.04,
    'door': (-0.55, 0.45), 'hood': (-1.55, -0.72), 'rearEngine': True, 'kit': {'trunk': False},
    'names': ['f0', 'f1', 'f2', 'fa', 'ws0', 'w2', 'ws1', 'rr', 'w5', 'rw1', 'r1', 'r0'],
    'keys': [
        dict(y=-1.65, zb=0.32, zs=0.58, zt=0.62, wb=0.5, wm=0.56, ws=0.54, wt=0.48, cr=0.02),
        dict(y=-1.58, zb=0.24, zs=0.66, zt=0.7, wb=0.6, wm=0.64, ws=0.63, wt=0.58, cr=0.03),
        dict(y=-1.35, zb=0.22, zs=0.74, zt=0.78, wb=0.64, wm=0.68, ws=0.67, wt=0.62, cr=0.04),
        dict(y=-0.98, zb=0.22, zs=0.8, zt=0.83, wb=0.65, wm=0.69, ws=0.68, wt=0.62, cr=0.04),
        dict(y=-0.72, zb=0.22, zs=0.83, zt=0.86, wb=0.65, wm=0.69, ws=0.68, wt=0.62, cr=0.04),
        dict(y=-0.55, zb=0.22, zs=0.84, zt=1.08, wb=0.65, wm=0.69, ws=0.68, wt=0.6, cr=0.04, gs=0.45),
        dict(y=-0.32, zb=0.22, zs=0.85, zt=1.36, wb=0.65, wm=0.69, ws=0.68, wt=0.54, cr=0.05, gs=0.45),
        dict(y=0.5, zb=0.22, zs=0.86, zt=1.37, wb=0.65, wm=0.69, ws=0.68, wt=0.54, cr=0.05, gs=0.45),
        dict(y=0.78, zb=0.22, zs=0.86, zt=1.2, wb=0.65, wm=0.69, ws=0.68, wt=0.58, cr=0.04),
        dict(y=0.95, zb=0.22, zs=0.86, zt=1.02, wb=0.65, wm=0.69, ws=0.68, wt=0.62, cr=0.04),
        dict(y=1.5, zb=0.26, zs=0.78, zt=0.82, wb=0.63, wm=0.67, ws=0.66, wt=0.6, cr=0.04),
        dict(y=1.65, zb=0.34, zs=0.6, zt=0.66, wb=0.54, wm=0.58, ws=0.57, wt=0.5, cr=0.02),
    ],
    'details': fiat600_details,
}


# ---------------------------------------------------------------- la pickup de trabajo
# Cabina simple, capó alto con la parrilla grande, paragolpes cromado adelante y negro atrás, la caja abierta con
# su forro, la tapa de atrás y los ganchos.


def pickup_details(c):
    sp, D, S, L, T, X = c['spec'], c['D'], c['S'], c['L'], c['T'], c['X']
    c['end_patch'](D, -0.62, 0.62, 0.66, 0.92, True, BLACK, off=0.004, nx=10, nz=2)
    frame(c, -0.62, 0.62, 0.66, 0.92, True, CHROME, S, w=0.02)
    grille_bars(c, -0.58, 0.58, 0.68, 0.9, 3, CHROME, S, w=0.016, h=0.012)
    for sx in (-1, 1):
        c['end_patch'](L, sx * 0.64, sx * 0.86, 0.74, 0.88, True, LENS, off=0.008, nx=3, nz=2)
        c['end_patch'](L, sx * 0.66, sx * 0.84, 0.62, 0.68, True, AMBER, off=0.008, nx=2, nz=1)
    bumper(c, True, 0.5, 0.16, 0.07, CHROME, a=55)
    bumper(c, False, 0.52, 0.14, 0.06, 0x1c1c1c, a=55, kind='detail')
    door_lines(c, [-0.92, 0.38], 0.38, 1.08)
    # la caja: paredes de adentro, el piso, el frente y la tapa (con el forro negro)
    W2 = c['W2']
    y0, y1 = sp['bed'][0] + 0.03, sp['bed'][1] - 0.03
    ym, ln = (y0 + y1) / 2, y1 - y0
    zf, zr = 0.62, 1.0
    for sx in (-1, 1):
        D.box((sx * (W2 - 0.05), ym, (zf + zr) / 2), (0.03, ln, zr - zf), 0x202020)
        D.box((sx * (W2 - 0.03), ym, zr + 0.01), (0.07, ln, 0.03), 0x1a1a1a)
    D.box((0, ym, zf), (W2 * 2 - 0.1, ln, 0.03), 0x1c1c1c)
    for j in range(5):
        D.box((-W2 * 0.7 + j * W2 * 0.35, ym, zf + 0.02), (0.04, ln, 0.015), 0x2a2a2a)
    D.box((0, y0, (zf + zr) / 2), (W2 * 2 - 0.1, 0.03, zr - zf), 0x202020)
    D.box((0, y1, (zf + zr) / 2), (W2 * 2 - 0.1, 0.03, zr - zf), 0x202020)
    for sx in (-1, 1):
        c['end_patch'](T, sx * 0.72, sx * 0.86, 0.66, 0.9, False, RED, off=0.006, nx=1, nz=3)
        D.box((sx * (W2 - 0.12), y0 + 0.25, zr + 0.03), (0.04, 0.04, 0.05), 0x777777)
    c['end_patch'](D, -0.08, 0.08, 0.86, 0.9, False, 0x2a2a2a, off=0.007, nx=1, nz=1)
    exhaust(c, 0.5, z=0.3)


PICKUP = {
    'name': 'pickup',
    'L': 4.95, 'W': 1.8,
    'wheelR': 0.36, 'tireW': 0.22, 'rim': 0.6, 'spokes': 'acero', 'steelCol': 0xd0d0d0, 'rimCol': 0xb0b0b0, 'wheelSegs': 18, 'holes': 5,
    'wheels': [(-0.76, -1.65, 0.36), (0.76, -1.65, 0.36), (-0.76, 1.35, 0.36), (0.76, 1.35, 0.36)],
    'seat': 0x3a3a3a, 'cabin': 0x2e2e2e, 'dash': 0x1b1b1b, 'plateZ': (0.5, 0.52), 'plateOff': (0.08, 0.0), 'plate': '95', 'mirror': 'black', 'mirrorZ': 0.1,
    'handles': [0.1], 'pillars': [], 'cpillar': 1, 'rearSeats': False, 'seatZ': 0.42, 'seatY': -0.1, 'arch': 0.07, 'tireCol': 0x141414,
    'bed': (0.66, 2.44), 'door': (-0.92, 0.38), 'hood': (-2.4, -1.0),
    'names': ['f0', 'f1', 'f2', 'fa', 'ws0', 'w2', 'ws1', 'rr', 'rw1', 'b0', 'r1', 'r0'],
    'keys': [
        dict(y=-2.475, zb=0.42, zs=0.9, zt=0.92, wb=0.8, wm=0.86, ws=0.85, wt=0.8, cr=0.0),
        dict(y=-2.41, zb=0.32, zs=0.99, zt=1.01, wb=0.86, wm=0.9, ws=0.89, wt=0.84, cr=0.005),
        dict(y=-2.15, zb=0.3, zs=1.03, zt=1.05, wb=0.88, wm=0.9, ws=0.9, wt=0.85, cr=0.008),
        dict(y=-1.65, zb=0.3, zs=1.06, zt=1.08, wb=0.88, wm=0.9, ws=0.9, wt=0.85, cr=0.01),
        dict(y=-1.0, zb=0.3, zs=1.08, zt=1.1, wb=0.88, wm=0.9, ws=0.9, wt=0.84, cr=0.012),
        dict(y=-0.82, zb=0.3, zs=1.09, zt=1.26, wb=0.88, wm=0.9, ws=0.895, wt=0.8, cr=0.015, gs=0.4),
        dict(y=-0.45, zb=0.3, zs=1.1, zt=1.62, wb=0.88, wm=0.9, ws=0.89, wt=0.72, cr=0.02, gs=0.4),
        dict(y=0.42, zb=0.3, zs=1.1, zt=1.61, wb=0.88, wm=0.9, ws=0.89, wt=0.72, cr=0.02, gs=0.4),
        dict(y=0.56, zb=0.3, zs=1.1, zt=1.13, wb=0.88, wm=0.9, ws=0.89, wt=0.86, cr=0.005),
        dict(y=0.62, zb=0.3, zs=1.02, zt=1.03, wb=0.88, wm=0.9, ws=0.9, wt=0.88, cr=0.0),
        dict(y=2.4, zb=0.34, zs=1.02, zt=1.03, wb=0.88, wm=0.9, ws=0.9, wt=0.88, cr=0.0),
        dict(y=2.475, zb=0.42, zs=0.98, zt=1.0, wb=0.82, wm=0.86, ws=0.86, wt=0.84, cr=0.0),
    ],
    'details': pickup_details,
}


# ---------------------------------------------------------------- Trafic: el utilitario
# Trompa corta y baja, parabrisas grande, la caja alta sin ventanillas atrás (de carga), la puerta corrediza
# marcada al costado, las dos puertas de atrás con sus vidrios y los paragolpes negros.


def trafic_rule(s, h, f, k, body):
    # de la puerta del conductor para atrás, sin ventanillas (es de carga)
    y = (body.st[s]['y'] + body.st[s + 1]['y']) / 2
    if BELT <= h < ROOF and y > -0.55:
        return 'paint'
    return None


def trafic_details(c):
    sp, D, S, L, T, X = c['spec'], c['D'], c['S'], c['L'], c['T'], c['X']
    c['end_patch'](D, -0.5, 0.5, 0.66, 0.84, True, BLACK, off=0.004, nx=8, nz=2)
    grille_bars(c, -0.48, 0.48, 0.68, 0.82, 3, 0x2a2a2a, D, w=0.016, h=0.01)
    for sx in (-1, 1):
        c['end_patch'](L, sx * 0.52, sx * 0.84, 0.7, 0.86, True, LENS, off=0.008, nx=4, nz=2)
        c['end_patch'](L, sx * 0.74, sx * 0.84, 0.62, 0.69, True, AMBER, off=0.008, nx=1, nz=1)
    bumper(c, True, 0.46, 0.2, 0.06, 0x1c1c1c, a=55, kind='detail')
    bumper(c, False, 0.44, 0.18, 0.06, 0x1c1c1c, a=55, kind='detail')
    rub_strip(c, -1.3, 2.2, 0.62, w=0.08)
    door_lines(c, [-1.5, -0.55], 0.36, 1.06)
    # la corrediza (del lado derecho, -x): los cortes y el riel
    door_lines(c, [-0.5, 0.75], 0.36, 1.85, sides=(-1,))
    c['hline'](D, -0.5, 1.9, 1.85, -1, 0x161616, w=0.02)
    # atrás: las dos puertas, sus vidrios y las luces altas en las esquinas
    c['end_patch'](D, -0.005, 0.005, 0.4, 1.9, False, 0x161616, off=0.004, nx=1, nz=4)
    for sx in (-1, 1):
        c['end_patch'](D, sx * 0.08, sx * 0.72, 1.25, 1.75, False, 0x0b1015, off=0.005, nx=3, nz=2)
        c['end_patch'](T, sx * 0.78, sx * 0.88, 0.7, 1.1, False, RED, off=0.006, nx=1, nz=3)
    exhaust(c, 0.55, z=0.3)


TRAFIC = {
    'name': 'trafic',
    'L': 4.65, 'W': 1.8,
    'wheelR': 0.32, 'tireW': 0.2, 'rim': 0.6, 'spokes': 'acero', 'steelCol': 0x2a2a2a, 'rimCol': 0x8a8a8a, 'wheelSegs': 18, 'holes': 5,
    'wheels': [(-0.77, -1.45, 0.32), (0.77, -1.45, 0.32), (-0.77, 1.5, 0.32), (0.77, 1.5, 0.32)],
    'seat': 0x2e2e33, 'cabin': 0x3a3a3e, 'dash': 0x1e1e1e, 'plateZ': (0.48, 0.48), 'plateOff': (0.07, 0.0), 'plate': '95', 'mirror': 'black', 'mirrorZ': 0.12,
    'handles': [-0.75], 'pillars': [], 'cpillar': 0, 'rearSeats': False, 'seatZ': 0.5, 'seatY': -0.72, 'arch': 0.05, 'rule': trafic_rule,
    'door': (-1.5, -0.55), 'rearGlass': False,
    'names': ['f0', 'f1', 'f2', 'fa', 'ws0', 'w2', 'ws1', 'rr', 'rw1', 'r1', 'r0'],
    'keys': [
        dict(y=-2.325, zb=0.34, zs=0.76, zt=0.78, wb=0.8, wm=0.84, ws=0.83, wt=0.78, cr=0.0),
        dict(y=-2.26, zb=0.26, zs=0.84, zt=0.86, wb=0.86, wm=0.89, ws=0.88, wt=0.83, cr=0.005),
        dict(y=-2.05, zb=0.26, zs=0.95, zt=0.98, wb=0.88, wm=0.9, ws=0.89, wt=0.84, cr=0.01),
        dict(y=-1.75, zb=0.26, zs=1.03, zt=1.05, wb=0.88, wm=0.9, ws=0.895, wt=0.85, cr=0.012),
        dict(y=-1.6, zb=0.26, zs=1.05, zt=1.08, wb=0.88, wm=0.9, ws=0.895, wt=0.85, cr=0.014),
        dict(y=-1.3, zb=0.26, zs=1.06, zt=1.55, wb=0.88, wm=0.9, ws=0.895, wt=0.84, cr=0.02, gs=0.45),
        dict(y=-0.95, zb=0.26, zs=1.07, zt=1.98, wb=0.88, wm=0.9, ws=0.895, wt=0.84, cr=0.03, gs=0.45),
        dict(y=2.2, zb=0.26, zs=1.1, zt=2.0, wb=0.88, wm=0.9, ws=0.895, wt=0.84, cr=0.03, gs=0.45),
        dict(y=2.28, zb=0.27, zs=1.1, zt=1.98, wb=0.88, wm=0.9, ws=0.895, wt=0.84, cr=0.02, gs=0.45),
        dict(y=2.3, zb=0.28, zs=1.1, zt=1.96, wb=0.87, wm=0.89, ws=0.885, wt=0.83, cr=0.01, gs=0.45),
        dict(y=2.325, zb=0.34, zs=1.08, zt=1.92, wb=0.84, wm=0.87, ws=0.86, wt=0.81, cr=0.0, gs=0.45),
    ],
    'details': trafic_details,
}


# ---------------------------------------------------------------- el sedán de los 90 (patrullero, taxi y remís)
# Un tres cajas prolijo de los 90: faros rectangulares con el giro al costado, parrilla del color del auto con
# una rejilla negra, paragolpes del color del auto, luces de atrás anchas. Las medidas salen del largo.


def sedan90_keys(Lc):
    f = Lc / 2
    k = lambda y, **v: dict(y=y, **v)
    return [
        k(-f, zb=0.3, zs=0.64, zt=0.66, wb=0.74, wm=0.78, ws=0.77, wt=0.72, cr=0.0),
        k(-f + 0.06, zb=0.22, zs=0.72, zt=0.74, wb=0.8, wm=0.84, ws=0.83, wt=0.78, cr=0.006),
        k(-f + 0.3, zb=0.2, zs=0.78, zt=0.8, wb=0.82, wm=0.85, ws=0.84, wt=0.79, cr=0.012),
        k(-f + 0.8, zb=0.2, zs=0.83, zt=0.86, wb=0.82, wm=0.85, ws=0.84, wt=0.79, cr=0.016),
        k(-f + 1.2, zb=0.2, zs=0.87, zt=0.9, wb=0.82, wm=0.85, ws=0.84, wt=0.78, cr=0.018),
        k(-f + 1.42, zb=0.2, zs=0.88, zt=1.06, wb=0.82, wm=0.85, ws=0.835, wt=0.75, cr=0.02, gs=0.4),
        k(-f + 1.75, zb=0.2, zs=0.89, zt=1.34, wb=0.82, wm=0.85, ws=0.83, wt=0.67, cr=0.025, gs=0.4),
        k(-f + 1.95, zb=0.2, zs=0.9, zt=1.41, wb=0.82, wm=0.85, ws=0.83, wt=0.65, cr=0.03, gs=0.4),
        k(f - 1.4, zb=0.2, zs=0.92, zt=1.4, wb=0.82, wm=0.85, ws=0.83, wt=0.65, cr=0.03, gs=0.4),
        k(f - 1.1, zb=0.2, zs=0.93, zt=1.18, wb=0.82, wm=0.85, ws=0.83, wt=0.73, cr=0.02),
        k(f - 0.85, zb=0.2, zs=0.94, zt=0.98, wb=0.82, wm=0.85, ws=0.83, wt=0.79, cr=0.014),
        k(f - 0.08, zb=0.24, zs=0.93, zt=0.96, wb=0.81, wm=0.84, ws=0.83, wt=0.78, cr=0.01),
        k(f, zb=0.32, zs=0.86, zt=0.89, wb=0.74, wm=0.78, ws=0.77, wt=0.73, cr=0.0),
    ]


def sedan90_details(c):
    sp, D, S, L, T, X = c['spec'], c['D'], c['S'], c['L'], c['T'], c['X']
    c['end_patch'](D, -0.34, 0.34, 0.58, 0.68, True, BLACK, off=0.004, nx=6, nz=1)
    grille_bars(c, -0.32, 0.32, 0.59, 0.67, 2, 0x2a2a2a, D, w=0.012, h=0.008)
    for sx in (-1, 1):
        c['end_patch'](L, sx * 0.38, sx * 0.72, 0.58, 0.7, True, LENS, off=0.008, nx=4, nz=2)
        c['end_patch'](D, sx * 0.42, sx * 0.62, 0.62, 0.66, True, 0xb8b8b0, off=0.01, nx=2, nz=1)
        c['end_quad'](L, [(sx * 0.72, 0.58), (sx * 0.8, 0.59), (sx * 0.79, 0.69), (sx * 0.72, 0.7)], True, AMBER, off=0.008, nx=1, nz=1)
    bumper(c, True, 0.42, 0.17, 0.05, 0xffffff, a=58, kind='paint')
    bumper(c, False, 0.45, 0.17, 0.05, 0xffffff, a=58, kind='paint')
    c['end_patch'](D, -0.5, 0.5, 0.33, 0.37, True, 0x1a1a1a, off=0.06, nx=4, nz=1)
    rub_strip(c, -1.4, 1.6, 0.56)
    f = sp['L'] / 2
    door_lines(c, [-f + 1.22, -f + 2.3, -f + 2.34, -f + 3.25], 0.3, 0.92)
    for sx in (-1, 1):
        c['end_patch'](T, sx * 0.48, sx * 0.8, 0.72, 0.86, False, RED, off=0.006, nx=4, nz=2)
        c['end_patch'](D, sx * 0.4, sx * 0.48, 0.72, 0.86, False, REV, off=0.006, nx=1, nz=1)
    exhaust(c, 0.45, z=0.25)
    extra = sp.get('sedanExtra')
    if extra:
        extra(c)


def sedan90(name, Lc, **over):
    f = Lc / 2
    spec = {
        'name': name,
        'L': Lc, 'W': 1.72,
        'wheelR': 0.3, 'tireW': 0.19, 'rim': 0.62, 'spokes': 'acero', 'steelCol': 0x2e2e2e, 'rimCol': 0x8a8a8a, 'wheelSegs': 18,
        'wheels': [(-0.74, -f + 0.82, 0.3), (0.74, -f + 0.82, 0.3), (-0.74, f - 0.9, 0.3), (0.74, f - 0.9, 0.3)],
        'seat': 0x3a3a3e, 'cabin': 0x2e2e32, 'dash': 0x1b1b1b, 'plateZ': (0.43, 0.6), 'plateOff': (0.07, 0.0), 'plate': 'mercosur', 'mirror': 'black',
        'handles': [-f + 2.1, -f + 3.05], 'pillars': [-f + 2.32], 'cpillar': 1, 'rearSeats': True, 'seatZ': 0.28, 'seatY': -f + 2.05, 'arch': 0.05,
        'door': (-f + 1.22, -f + 2.3), 'hood': (-f + 0.12, -f + 1.2),
        'names': ['f0', 'f1', 'f2', 'fa', 'ws0', 'w2', 'w3', 'ws1', 'rr', 'w5', 'rw1', 'r1', 'r0'],
        'keys': sedan90_keys(Lc),
        'details': sedan90_details,
    }
    spec.update(over)
    return spec


# el patrullero de la Bonaerense: azul con las puertas y el techo blancos, la baliza (las luces las prende el
# juego) y el burro adelante
def patrullero_livery(p, n):
    y, z = p.y, p.z
    if z > 1.25 and n.z > 0.5:
        return 0xf2f2f2
    # las puertas (de la del conductor a la de atrás), abajo de la ventanilla
    if -1.01 < y < 1.03 and 0.42 < z < 0.88:
        return 0xf2f2f2
    return 0x1d3f8c


def patrullero_extra(c):
    D, S = c['D'], c['S']
    sp = c['spec']
    # la baliza: la base negra y las dos lentes (roja y azul), apagadas; el juego le pone las luces encima
    loc, nr = hit(c['bvh'], (0, 0.15, 3), (0, 0, -1))
    if loc is not None:
        D.box(loc + Vector((0, 0, 0.03)), (1.05, 0.26, 0.05), 0x161616)
        D.box(loc + Vector((-0.28, 0, 0.09)), (0.46, 0.22, 0.09), 0x6a1010)
        D.box(loc + Vector((0.28, 0, 0.09)), (0.46, 0.22, 0.09), 0x10206a)
    # el burro (defensa) adelante
    yf = -sp['L'] / 2 - 0.08
    for x in (-0.36, 0.36):
        D.box((x, yf, 0.62), (0.05, 0.05, 0.42), 0x161616)
    D.box((0, yf, 0.78), (0.8, 0.05, 0.05), 0x161616)
    D.box((0, yf, 0.48), (0.8, 0.05, 0.05), 0x161616)


PATRULLERO = sedan90('patrullero', 4.45, livery=patrullero_livery, sedanExtra=patrullero_extra, seat=0x2a2a2a, plate='mercosur')


# el taxi porteño: negro con el techo amarillo y el cartelito de LIBRE (la lucecita roja)
def taxi_livery(p, n):
    if p.z > 1.2 and n.z > 0.55:
        return 0xf5c400
    return 0x151515


def taxi_extra(c):
    D, L = c['D'], c['L']
    loc, nr = hit(c['bvh'], (0, 0.2, 3), (0, 0, -1))
    if loc is not None:
        D.box(loc + Vector((0, 0, 0.08)), (0.5, 0.2, 0.16), 0xf5c400)
        D.box(loc + Vector((0, -0.105, 0.08)), (0.38, 0.01, 0.08), 0x111111)
        L.box(loc + Vector((0.2, -0.105, 0.12)), (0.05, 0.012, 0.03), 0xff3020)


TAXI = sedan90('taxi', 4.3, livery=taxi_livery, sedanExtra=taxi_extra, seat=0x2a2a2a)


# el remís: un sedán negro común, con la oblea en el parabrisas
def remis_extra(c):
    D = c['D']
    st, k = c['body'].st, c['body'].k
    loc, nr = hit(c['bvh'], (0.45, st[k['ws0']]['y'] + 0.12, 3), (0, 0, -1))
    if loc is not None:
        D.box(loc + nr * 0.006, (0.1, 0.08, 0.004), 0xffd600)


REMIS = sedan90('remis', 4.3, sedanExtra=remis_extra, seat=0x2a2a2a)


CARS = [DUNA, GOL, FALCON, P504, FIAT600, PICKUP, TRAFIC, PATRULLERO, TAXI, REMIS]

if __name__ == '__main__':
    A.main(CARS, GLB)
