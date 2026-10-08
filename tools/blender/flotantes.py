# Lo que flota en una inundación del conurbano, hecho en Blender sin abrir la interfaz:
#   pip install bpy        (Blender como módulo de Python; probado con 5.2)
#   python3 tools/blender/flotantes.py
# Sale public/models/agua/flotantes.glb, una malla por pieza. Cada pieza tiene el origen en la línea de
# flotación (y = 0 es la superficie del agua: lo que está abajo queda sumergido) y mira a +z:
#   botella      botella de gaseosa de 1,5 L acostada, verde clara, con tapita
#   bidon        bidón de agua de 6 L, medio hundido
#   bolsa        bolsa de súper (de las de manijas), arrugada y medio inflada
#   telgopor     bandeja de telgopor de la verdulería
#   cubierta     goma de auto (flota de canto, apenas asoma)
#   pallet       pallet de madera de 1,2 x 1 m
#   pelota       pelota de fútbol de gajos blancos y negros
#   conservadora conservadora roja con tapa blanca
#   rama         rama con hojas (de los árboles de la vereda)
#   lata         lata de gaseosa acostada
#   ojota        ojota de goma azul
#   silla        silla de plástico blanca (la del patio), dada vuelta y flotando
#   caja         caja de cartón empapada, medio desarmada
# Colores en los vértices con la sombra de contacto horneada (Cycles); el material del juego queda blanco.
import math
import os
import random

import bpy  # tiene que ir antes que bmesh
import bmesh
from mathutils import Vector, noise

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GLB = os.path.join(ROOT, 'public', 'models', 'agua', 'flotantes.glb')

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
random.seed(14)


def lin(c):
    # color sRGB (como se elige a ojo) a lineal (lo que guardan los colores de vértice)
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


def hexc(h):
    return lin((((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255))


def B(x, y, z):
    return (x, -z, y)  # juego (y arriba) -> Blender (z arriba)


class Kit:
    # una pieza armada con primitivas; cada cara guarda el índice de su color
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.cols = []

    def color(self, h):
        c = hexc(h)
        if c not in self.cols:
            self.cols.append(c)
        return self.cols.index(c)

    def merge(self, tmp, col, smooth=False, colfn=None):
        layer = tmp.faces.layers.int.get('ci') or tmp.faces.layers.int.new('ci')
        ci = self.color(col)
        for f in tmp.faces:
            f[layer] = self.color(colfn(f)) if colfn else ci
            f.smooth = smooth
        me = bpy.data.meshes.new('tmp')
        tmp.to_mesh(me)
        tmp.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)

    def box(self, c, s, col, bevel=0.0, segs=1, rot=0.0):
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        bmesh.ops.scale(tmp, vec=(s[0], s[2], s[1]), verts=tmp.verts)
        if rot:
            bmesh.ops.rotate(tmp, verts=tmp.verts, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(rot, 3, 'Z'))
        bmesh.ops.translate(tmp, vec=B(*c), verts=tmp.verts)
        if bevel > 0:
            bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=bevel, segments=segs, affect='EDGES', profile=0.5)
        self.merge(tmp, col, smooth=bevel > 0 and segs > 1)

    def lathe_x(self, prof, sides, col, smooth=True, caps=(True, True), center=(0, 0, 0)):
        # sólido de revolución acostado sobre el eje x; prof: [(radio, x)]
        tmp = bmesh.new()
        cx, cy, cz = center
        rings = [[tmp.verts.new(B(cx + x, cy + r * math.cos(t), cz + r * math.sin(t))) for t in (2 * math.pi * j / sides for j in range(sides))] for r, x in prof]
        for a, b in zip(rings, rings[1:]):
            for j in range(sides):
                k = (j + 1) % sides
                tmp.faces.new((a[j], a[k], b[k], b[j]))
        if caps[0] and prof[0][0] > 1e-4:
            tmp.faces.new(list(reversed(rings[0])))
        if caps[1] and prof[-1][0] > 1e-4:
            tmp.faces.new(rings[-1])
        bmesh.ops.remove_doubles(tmp, verts=tmp.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
        self.merge(tmp, col, smooth)

    def tube(self, pts, r, sides, col, caps=True, smooth=True):
        tmp = bmesh.new()
        P = [Vector(p) for p in pts]
        ref = Vector((0, 1, 0))
        rings = []
        for i, p in enumerate(P):
            d = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
            u = ref - d * ref.dot(d)
            if u.length < 1e-4:
                u = Vector((1, 0, 0)) - d * d.x
            u.normalize()
            ref = u
            w = d.cross(u)
            rr = r[i] if isinstance(r, (list, tuple)) else r
            rings.append([tmp.verts.new(B(*(p + (u * math.cos(t) + w * math.sin(t)) * rr))) for t in (2 * math.pi * j / sides for j in range(sides))])
        for a, b in zip(rings, rings[1:]):
            for j in range(sides):
                k = (j + 1) % sides
                tmp.faces.new((a[j], a[k], b[k], b[j]))
        if caps:
            tmp.faces.new(list(reversed(rings[0])))
            tmp.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
        self.merge(tmp, col, smooth)

    def done(self, crumple=0.0, seed=0.0):
        me = bpy.data.meshes.new(self.name)
        if crumple > 0:
            # arrugado: cada vértice se corre según un ruido (las piezas blandas)
            for v in self.bm.verts:
                n = noise.noise_vector(v.co * 9.0 + Vector((seed, seed * 1.7, seed * 0.3)))
                v.co += n * crumple
        self.bm.to_mesh(me)
        self.bm.free()
        ob = bpy.data.objects.new(self.name, me)
        scene.collection.objects.link(ob)
        ob['palette'] = [v for c in self.cols for v in c]
        return ob


# ---------------- piezas ----------------
def botella():
    k = Kit('botella')
    # acostada sobre x; flota con un tercio afuera (el aire de adentro)
    L = 0.33
    prof = [(0.0, -L / 2), (0.035, -L / 2), (0.046, -L / 2 + 0.012), (0.047, -L / 2 + 0.04), (0.044, -0.03), (0.047, 0.0),
            (0.047, 0.08), (0.04, 0.115), (0.02, 0.15), (0.0145, 0.158), (0.0145, L / 2)]
    k.lathe_x(prof, 12, 0x9fd8b4, center=(0, 0.012, 0))
    k.lathe_x([(0.0, L / 2), (0.016, L / 2), (0.016, L / 2 + 0.018), (0.0, L / 2 + 0.018)], 10, 0xd23a2a, center=(0, 0.012, 0))
    # etiqueta
    k.lathe_x([(0.0478, -0.02), (0.0478, 0.07)], 12, 0xd8462b, caps=(False, False), center=(0, 0.012, 0))
    return k.done()


def bidon():
    k = Kit('bidon')
    k.box((0, 0.0, 0), (0.24, 0.18, 0.16), 0xc9dde6, bevel=0.03, segs=2)
    k.lathe_x([(0.0, 0.12), (0.035, 0.12), (0.035, 0.17), (0.0, 0.17)], 10, 0x2a62b8, center=(0, 0.04, 0))
    k.tube([(-0.05, 0.1, 0), (-0.02, 0.135, 0), (0.03, 0.135, 0), (0.06, 0.1, 0)], 0.012, 6, 0xc9dde6)
    return k.done()


def bolsa():
    k = Kit('bolsa')
    # cuerpo inflado de la bolsa (una esfera achatada y arrugada) y las dos manijas
    tmp = bmesh.new()
    bmesh.ops.create_uvsphere(tmp, u_segments=12, v_segments=8, radius=1.0)
    for v in tmp.verts:
        x, y, z = v.co  # blender: z arriba
        v.co = Vector((x * 0.17, y * 0.13, z * 0.07 + (0.02 if z > 0 else -0.01)))
    k.merge(tmp, 0xf2f2ef, smooth=True)
    for s in (-1, 1):
        k.tube([(s * 0.06, 0.05, -0.05), (s * 0.075, 0.1, -0.12), (s * 0.06, 0.08, -0.18), (s * 0.04, 0.05, -0.12)], 0.008, 5, 0xf2f2ef)
    return k.done(crumple=0.018, seed=3.0)


def telgopor():
    k = Kit('telgopor')
    W, D, H = 0.22, 0.14, 0.025
    k.box((0, -0.004, 0), (W, H * 0.4, D), 0xf4f3ee)
    for sx in (-1, 1):
        k.box((sx * (W / 2 - 0.006), 0.004, 0), (0.012, H, D), 0xf4f3ee, rot=0)
    for sz in (-1, 1):
        k.box((0, 0.004, sz * (D / 2 - 0.006)), (W, H, 0.012), 0xf4f3ee)
    return k.done(crumple=0.002, seed=5.0)


def cubierta():
    k = Kit('cubierta')
    tmp = bmesh.new()
    R, r = 0.29, 0.1
    S, T = 20, 8
    rings = []
    for i in range(S):
        a = 2 * math.pi * i / S
        ring = []
        for j in range(T):
            b = 2 * math.pi * j / T
            # sección cuadrada redondeada (banda de rodamiento ancha)
            cb, sb = math.cos(b), math.sin(b)
            rr = r * (1 + 0.18 * (abs(cb) ** 4 + abs(sb) ** 4))
            x = (R + rr * cb * 0.9) * math.cos(a)
            z = (R + rr * cb * 0.9) * math.sin(a)
            y = rr * sb * 0.85
            ring.append(tmp.verts.new(B(x, y - 0.04, z)))
        rings.append(ring)
    for i in range(S):
        a, b = rings[i], rings[(i + 1) % S]
        for j in range(T):
            m = (j + 1) % T
            tmp.faces.new((a[j], a[m], b[m], b[j]))
    bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
    k.merge(tmp, 0x1d1d1f, smooth=True)
    return k.done()


def pallet():
    k = Kit('pallet')
    wood = 0x9a7a52
    wood2 = 0x86683f
    # tablas de arriba (7), tacos (9) y tablas de abajo (3)
    for i in range(7):
        x = -0.55 + i * (1.1 / 6)
        k.box((x, 0.06, 0), (0.1, 0.022, 1.0), wood if i % 2 else wood2, bevel=0.004)
    for ix in (-0.55, 0, 0.55):
        for iz in (-0.42, 0, 0.42):
            k.box((ix, 0.0, iz), (0.1, 0.09, 0.12), wood2, bevel=0.004)
    for iz in (-0.42, 0, 0.42):
        k.box((0, -0.055, iz), (1.2, 0.022, 0.1), wood, bevel=0.004)
    return k.done()


def pelota():
    k = Kit('pelota')
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=3, radius=0.11)
    # los gajos negros: las caras cerca de los 12 vértices del icosaedro
    ico = bmesh.new()
    bmesh.ops.create_icosphere(ico, subdivisions=1, radius=1.0)
    tips = [v.co.normalized() for v in ico.verts if len(v.link_edges) == 5]
    ico.free()

    def col(f):
        c = f.calc_center_median().normalized()
        return 0x161616 if max(c.dot(t) for t in tips) > 0.94 else 0xf4f4f0
    for v in tmp.verts:
        v.co.z += 0.05  # bien afuera del agua
    k.merge(tmp, 0xf4f4f0, smooth=True, colfn=col)
    return k.done()


def conservadora():
    k = Kit('conservadora')
    k.box((0, 0.02, 0), (0.46, 0.24, 0.3), 0xc8242b, bevel=0.03, segs=2)
    k.box((0, 0.165, 0), (0.48, 0.05, 0.32), 0xf2f0ea, bevel=0.02, segs=2)
    k.tube([(-0.16, 0.19, 0), (-0.12, 0.23, 0), (0.12, 0.23, 0), (0.16, 0.19, 0)], 0.014, 6, 0xf2f0ea)
    return k.done()


def rama():
    k = Kit('rama')
    bark = 0x5a4532
    k.tube([(-0.6, 0.0, 0.0), (-0.2, 0.02, 0.05), (0.2, 0.0, -0.03), (0.6, 0.02, 0.02)], [0.03, 0.026, 0.02, 0.012], 6, bark)
    k.tube([(-0.1, 0.02, 0.04), (0.05, 0.03, 0.22), (0.15, 0.03, 0.38)], [0.015, 0.011, 0.006], 5, bark)
    k.tube([(0.25, 0.01, -0.03), (0.35, 0.02, -0.2), (0.4, 0.02, -0.32)], [0.012, 0.009, 0.005], 5, bark)
    # hojas: cuadraditos doblados que flotan
    tmp = bmesh.new()
    rng = random.Random(7)
    for _ in range(26):
        t = rng.random()
        cx = -0.4 + t * 1.0 + rng.uniform(-0.05, 0.05)
        cz = rng.uniform(-0.35, 0.4)
        a = rng.uniform(0, math.pi)
        s = rng.uniform(0.05, 0.08)
        ca, sa = math.cos(a), math.sin(a)
        pts = [(-s, 0), (0, -s * 0.45), (s, 0), (0, s * 0.45)]
        vs = [tmp.verts.new(B(cx + px * ca - pz * sa, 0.012 + (0.01 if i % 2 == 0 else 0.0), cz + px * sa + pz * ca)) for i, (px, pz) in enumerate(pts)]
        tmp.faces.new(vs)
    k.merge(tmp, 0x4f7a2e, colfn=lambda f: rng.choice([0x4f7a2e, 0x6a8a34, 0x7a6a2a]))
    return k.done()


def lata():
    k = Kit('lata')
    L = 0.122
    prof = [(0.0, -L / 2), (0.026, -L / 2), (0.033, -L / 2 + 0.01), (0.033, L / 2 - 0.012), (0.027, L / 2 - 0.002), (0.0, L / 2)]
    k.lathe_x(prof, 12, 0xc41d24, center=(0, 0.008, 0))
    k.lathe_x([(0.0332, -0.012), (0.0332, 0.02)], 12, 0xf2f2f2, caps=(False, False), center=(0, 0.008, 0))
    return k.done()


def ojota():
    k = Kit('ojota')
    # suela con forma de pie (extruida) y las tiras
    tmp = bmesh.new()
    pts = []
    for i in range(16):
        a = 2 * math.pi * i / 16
        w = 0.045 if math.sin(a) < 0 else 0.052
        pts.append((math.cos(a) * 0.13, math.sin(a) * w * (1.0 + 0.25 * math.cos(a))))
    top = [tmp.verts.new(B(x, 0.012, z)) for x, z in pts]
    bot = [tmp.verts.new(B(x, -0.008, z)) for x, z in pts]
    tmp.faces.new(top)
    tmp.faces.new(list(reversed(bot)))
    for i in range(16):
        j = (i + 1) % 16
        tmp.faces.new((bot[i], bot[j], top[j], top[i]))
    bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
    k.merge(tmp, 0x2a6fc0, smooth=False)
    k.tube([(0.07, 0.012, 0.0), (0.03, 0.04, 0.035), (-0.03, 0.013, 0.05)], 0.008, 5, 0xf2f2f2)
    k.tube([(0.07, 0.012, 0.0), (0.03, 0.04, -0.035), (-0.03, 0.013, -0.05)], 0.008, 5, 0xf2f2f2)
    return k.done()


def silla():
    k = Kit('silla')
    W = 0xf3f2ee
    # dada vuelta: el asiento abajo (sumergido apenas) y las patas para arriba
    k.box((0, 0.0, 0), (0.44, 0.03, 0.42), W, bevel=0.012, segs=2)
    for sx in (-1, 1):
        for sz in (-1, 1):
            k.tube([(sx * 0.19, 0.0, sz * 0.18), (sx * 0.22, 0.2, sz * 0.22), (sx * 0.24, 0.42, sz * 0.25)], [0.022, 0.019, 0.016], 6, W, smooth=True)
    # respaldo hacia abajo-atrás (bajo el agua) con sus tablitas
    k.box((0, -0.18, -0.24), (0.42, 0.36, 0.025), W, bevel=0.01, segs=2)
    for sx in (-1, 1):
        k.box((sx * 0.215, -0.05, 0.0), (0.03, 0.06, 0.4), W, bevel=0.008)
    return k.done()


def caja():
    k = Kit('caja')
    C = 0xa98058
    k.box((0, 0.0, 0), (0.42, 0.14, 0.32), C, bevel=0.01)
    # solapas abiertas
    k.box((0, 0.08, 0.2), (0.4, 0.012, 0.16), 0x9a7048, rot=0)
    k.box((0.25, 0.07, 0), (0.14, 0.012, 0.3), 0xb48a62)
    return k.done(crumple=0.012, seed=9.0)


def bake(ob):
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.world = scene.world or bpy.data.worlds.new('w')
    scene.world.light_settings.distance = 0.3
    me = ob.data
    me.materials.append(bpy.data.materials.new(ob.name))
    ca = me.color_attributes.new('ao', 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = ca
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    ao = [0.45 + 0.55 * d.color[0] for d in ca.data]
    me.color_attributes.remove(ca)
    pal = list(ob['palette'])
    pal = [tuple(pal[i:i + 3]) for i in range(0, len(pal), 3)]
    ci = me.attributes['ci']
    col = me.color_attributes.new('col', 'BYTE_COLOR', 'CORNER')
    for poly in me.polygons:
        c = pal[ci.data[poly.index].value]
        for li in poly.loop_indices:
            col.data[li].color = (c[0] * ao[li], c[1] * ao[li], c[2] * ao[li], 1)
    me.color_attributes.active_color = col
    me.attributes.remove(me.attributes['ci'])


os.makedirs(os.path.dirname(GLB), exist_ok=True)
parts = [botella(), bidon(), bolsa(), telgopor(), cubierta(), pallet(), pelota(), conservadora(), rama(), lata(), ojota(), silla(), caja()]
for ob in parts:
    for o in parts:
        o.hide_render = o is not ob
    bake(ob)
for o in parts:
    o.hide_render = False
for ob in scene.objects:
    ob.select_set(ob in parts)
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_vertex_color='ACTIVE', export_normals=True, export_texcoords=False, export_materials='NONE')
total = 0
for ob in parts:
    n = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    total += n
    print(f'{ob.name}: {n} triángulos')
print('total:', total, 'triángulos')
print('listo:', GLB)
