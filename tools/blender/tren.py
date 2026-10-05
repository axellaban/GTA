# Coches del tren (línea Roca) hechos en Blender, sin abrir la interfaz:
#   pip install bpy        (Blender como módulo de Python; probado con 5.0)
#   python3 tools/blender/tren.py
# Sale public/models/vehicles/tren.glb con las piezas que src/tren-kit.js arma en cada coche (en el marco de
# makeTrainCar, src/vehicles.js: z a lo largo, con la cabina hacia +z; el riel queda en y = 0,13):
#   tren_caja      la carrocería de un coche del medio (19,6 m): costados con un poco de panza abajo, hombros
#                  redondeados y techo; la uv de los costados es la de la textura de siempre (ventanas con
#                  gente, puertas, franjas), así que el juego le pone la misma textura
#   tren_cabina    la del coche con cabina: la trompa se angosta y se inclina hacia +z
#   tren_bajo      bogies (bastidor, cajas de grasa, resortes y cuatro ruedas cada uno) y los equipos de abajo
#   tren_fuelle    el fuelle de la intercomunicación con su marco (va en cada punta sin cabina)
#   tren_frente_e  el frente de la cabina del eléctrico: parabrisas, faros, franja azul y celeste
#   tren_frente_d  el del diésel: franja naranja
#   tren_techo     los equipos de aire acondicionado del techo
#   pantografo     pantógrafo de un brazo con su base (el eléctrico)
# Colores en los vértices (menos la carrocería, que usa la textura) con la sombra de contacto horneada.
import math
import os

import bpy  # tiene que ir antes que bmesh
import bmesh
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GLB = os.path.join(ROOT, 'public', 'models', 'vehicles', 'tren.glb')

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

L = 19.6
RAIL = 0.13  # el tope del riel en el marco del coche
Y0, Y1 = 0.65, 4.05  # la textura del costado va de Y1 (arriba) a Y0 (abajo), como la caja de antes
V_WHITE_TOP = 0.03  # filas de arriba de la textura: color de la carrocería
V_WHITE_BOT = 0.96


def lin(c):
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


def hexc(h):
    return lin((((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255))


def B(x, y, z):
    return (x, -z, y)  # juego (y arriba) -> Blender (z arriba)


# ---------------- carrocería (con uv) ----------------
# medio perfil (x, y) de abajo para arriba; el otro lado es el espejo
HALF = [(1.36, 0.95), (1.44, 1.15), (1.46, 1.6), (1.46, 3.5), (1.41, 3.72), (1.27, 3.9), (1.0, 4.0), (0.5, 4.06), (0.0, 4.08)]


def profile(sx=1.0, top=0.0, bottom=0.0):
    # perfil cerrado completo (de abajo a la izquierda, por arriba, a abajo a la derecha)
    right = [(x * sx, y + (top if y > 3.4 else 0) + (bottom if y < 1.2 else 0)) for x, y in HALF]
    left = [(-x, y) for x, y in reversed(right[:-1])]
    return right + left  # de (1.36, 0.95) por el techo a (-1.36, 0.95)


def v_of(y, x):
    # la v de la textura: los costados con la textura; techo y panza, la fila blanca
    if y >= 3.55:
        return V_WHITE_TOP
    if y <= 1.0:
        return V_WHITE_BOT
    return (Y1 - y) / (Y1 - Y0)


def u_of(z, x):
    # de izquierda a derecha mirando el costado desde afuera
    return (L / 2 - z) / L if x > 0 else (z + L / 2) / L


def body(name, cab):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    rings = []
    if cab:
        zs = [(-L / 2, profile()), (L / 2 - 1.6, profile()), (L / 2 - 0.6, profile(0.97, -0.08, 0.04)), (L / 2, profile(0.9, -0.42, 0.1))]
    else:
        zs = [(-L / 2, profile()), (L / 2, profile())]
    for z, prof in zs:
        rings.append([(bm.verts.new(B(x, y, z)), x, y, z) for x, y in prof])
    n = len(rings[0])
    for ra, rb in zip(rings, rings[1:]):
        for i in range(n - 1):
            a0, a1, b1, b0 = ra[i], ra[i + 1], rb[i + 1], rb[i]
            f = bm.faces.new((a0[0], a1[0], b1[0], b0[0]))
            for loop, (vv, x, y, z) in zip(f.loops, (a0, a1, b1, b0)):
                loop[uv].uv = (u_of(z, (a0[1] + a1[1]) / 2), 1 - v_of(y, x))
        # panza (de un costado al otro, por abajo)
        a0, a1, b1, b0 = ra[-1], ra[0], rb[0], rb[-1]
        f = bm.faces.new((a0[0], a1[0], b1[0], b0[0]))
        for loop in f.loops:
            loop[uv].uv = (0.5, 1 - V_WHITE_BOT)
    # tapas de las puntas (color de la carrocería)
    for ring, sign in ((rings[0], -1), (rings[-1], 1)):
        f = bm.faces.new([r[0] for r in (ring if sign > 0 else list(reversed(ring)))])
        for loop in f.loops:
            loop[uv].uv = (0.5, 1 - V_WHITE_TOP)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        f.smooth = len(f.verts) == 4 and abs(f.normal.y) < 0.9
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    ob['palette'] = []
    return ob


# ---------------- piezas con color en los vértices ----------------
class Kit:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.cols = []

    def color(self, h):
        c = hexc(h)
        if c not in self.cols:
            self.cols.append(c)
        return self.cols.index(c)

    def _merge(self, tmp, col, smooth=False):
        ci = self.color(col)
        layer = tmp.faces.layers.int.get('ci') or tmp.faces.layers.int.new('ci')
        for f in tmp.faces:
            f[layer] = ci
            f.smooth = smooth
        me = bpy.data.meshes.new('tmp')
        tmp.to_mesh(me)
        tmp.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)

    def box(self, c, s, col):
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        bmesh.ops.scale(tmp, vec=(s[0], s[2], s[1]), verts=tmp.verts)
        bmesh.ops.translate(tmp, vec=B(*c), verts=tmp.verts)
        self._merge(tmp, col)

    def cyl_x(self, c, r, w, col, sides=12):
        # cilindro con el eje en x (ruedas, ejes)
        tmp = bmesh.new()
        ring0 = [tmp.verts.new(B(c[0] - w / 2, c[1] + r * math.cos(2 * math.pi * k / sides), c[2] + r * math.sin(2 * math.pi * k / sides))) for k in range(sides)]
        ring1 = [tmp.verts.new(B(c[0] + w / 2, c[1] + r * math.cos(2 * math.pi * k / sides), c[2] + r * math.sin(2 * math.pi * k / sides))) for k in range(sides)]
        for k in range(sides):
            j = (k + 1) % sides
            tmp.faces.new((ring0[k], ring0[j], ring1[j], ring1[k]))
        tmp.faces.new(list(reversed(ring0)))
        tmp.faces.new(ring1)
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
        self._merge(tmp, col, smooth=False)

    def cyl_y(self, c, r, h, col, sides=8):
        tmp = bmesh.new()
        ring0 = [tmp.verts.new(B(c[0] + r * math.cos(2 * math.pi * k / sides), c[1], c[2] + r * math.sin(2 * math.pi * k / sides))) for k in range(sides)]
        ring1 = [tmp.verts.new(B(c[0] + r * math.cos(2 * math.pi * k / sides), c[1] + h, c[2] + r * math.sin(2 * math.pi * k / sides))) for k in range(sides)]
        for k in range(sides):
            j = (k + 1) % sides
            tmp.faces.new((ring0[k], ring0[j], ring1[j], ring1[k]))
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
        self._merge(tmp, col, smooth=True)

    def poly(self, pts, col):
        tmp = bmesh.new()
        tmp.faces.new([tmp.verts.new(B(*p)) for p in pts])
        self._merge(tmp, col)

    def strut(self, a, b, w, col):
        # barra cuadrada de a a b
        a, b = Vector(a), Vector(b)
        d = (b - a)
        Ln = d.length
        d.normalize()
        ref = Vector((1, 0, 0)) if abs(d.x) < 0.9 else Vector((0, 1, 0))
        u = d.cross(ref).normalized() * w / 2
        v = d.cross(u).normalized() * w / 2
        tmp = bmesh.new()
        P = [tmp.verts.new(B(*(p + s1 * u + s2 * v))) for p in (a, b) for s1, s2 in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        for i in range(4):
            j = (i + 1) % 4
            tmp.faces.new((P[i], P[j], P[4 + j], P[4 + i]))
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
        self._merge(tmp, col)

    def done(self):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        ob = bpy.data.objects.new(self.name, me)
        scene.collection.objects.link(ob)
        ob['palette'] = [v for c in self.cols for v in c]
        return ob


DARK = 0x2a2d30
STEEL = 0x55595e
WHEEL = 0x3a3c3e


def bajo():
    k = Kit('tren_bajo')
    R = 0.45
    for zb in (-6.5, 6.5):
        # bastidor del bogie, traviesa, cajas de grasa y resortes
        for sx in (-1, 1):
            k.box((sx * 1.05, RAIL + R + 0.05, zb), (0.14, 0.32, 3.0), DARK)
            for za in (-1.25, 1.25):
                k.box((sx * 1.05, RAIL + R, zb + za), (0.24, 0.3, 0.34), STEEL)
                k.cyl_y((sx * 1.05, RAIL + R + 0.2, zb + za), 0.09, 0.22, 0x6b6f73)
        k.box((0, RAIL + R + 0.12, zb), (2.0, 0.22, 0.5), DARK)
        for za in (-1.25, 1.25):
            for sx in (-1, 1):
                k.cyl_x((sx * 0.84, RAIL + R, zb + za), R, 0.13, WHEEL)
            k.cyl_x((0, RAIL + R, zb + za), 0.08, 1.56, STEEL, sides=6)
    # equipos colgados entre los bogies (cajas de tracción, compresor, baterías)
    for z0, z1, w, col in ((-4.4, -1.2, 2.2, 0x3c4045), (-0.8, 1.6, 1.8, 0x34383c), (2.0, 4.6, 2.3, 0x41454a)):
        k.box((0, 0.78, (z0 + z1) / 2), (w, 0.36, z1 - z0), col)
    return k.done()


def fuelle():
    k = Kit('tren_fuelle')
    # marco de la puerta de intercomunicación y el fuelle de goma (pliegues)
    k.box((0, 2.25, 0.02), (1.3, 2.4, 0.04), 0x9aa0a6)
    for i in range(5):
        k.box((0, 2.25, 0.07 + i * 0.05), (1.18 - (i % 2) * 0.06, 2.3 - (i % 2) * 0.06, 0.05), 0x1c1d1f)
    return k.done()


def frente(name, stripe, stripe2=None):
    k = Kit(name)
    z = L / 2 + 0.005
    # la trompa (después de angostarse) mide x * 0.9 y llega hasta 3,66 de alto: el frente va ahí
    # parabrisas (apenas delante de la tapa de la trompa) con su marco
    k.box((0, 2.95, z + 0.01), (2.2, 1.12, 0.02), 0x2a2d30)
    k.poly([(-1.02, 2.47, z + 0.025), (1.02, 2.47, z + 0.025), (0.96, 3.42, z + 0.025), (-0.96, 3.42, z + 0.025)], 0x14202a)
    k.box((0, 2.42, z), (2.2, 0.08, 0.06), 0x2a2d30)  # borde de abajo del parabrisas
    k.box((0, 1.65, z + 0.01), (2.62, 0.42, 0.04), stripe)
    if stripe2:
        k.box((0, 1.32, z + 0.01), (2.62, 0.16, 0.04), stripe2)
    for sx in (-1, 1):
        k.box((sx * 0.9, 1.95, z + 0.02), (0.42, 0.22, 0.04), 0x1b1d20)
        k.box((sx * 0.9, 1.95, z + 0.045), (0.32, 0.14, 0.02), 0xfff3cf)  # faro
        k.box((sx * 0.55, 1.95, z + 0.045), (0.12, 0.1, 0.02), 0xd83a2e)  # luz roja
    # paragolpes, enganche y el cartel del destino arriba del parabrisas
    k.box((0, 1.08, z + 0.1), (2.4, 0.18, 0.2), DARK)
    k.box((0, 1.0, z + 0.32), (0.32, 0.28, 0.45), STEEL)
    k.box((0, 3.55, z - 0.07), (1.4, 0.16, 0.04), 0x1a1a1a)
    k.box((0, 3.55, z - 0.05), (1.2, 0.1, 0.02), 0xffb000)
    return k.done()


def techo():
    k = Kit('tren_techo')
    for zc in (-5.5, 5.5):
        k.box((0, 4.18, zc), (1.7, 0.28, 2.8), 0xd6d9dc)
        for i in range(6):
            k.box((0, 4.33, zc - 1.1 + i * 0.44), (1.3, 0.03, 0.18), 0x8a9095)
    return k.done()


def pantografo():
    k = Kit('pantografo')
    y = 4.12
    k.box((0, y + 0.08, 0), (1.2, 0.12, 1.0), 0x3a3d40)  # base
    for sx in (-0.45, 0.45):
        k.cyl_y((sx, y, 0), 0.06, 0.16, 0x9a8a5a, sides=6)  # aisladores
    # brazo de abajo, rodilla y brazo de arriba hasta el frotador
    k.strut((0, y + 0.15, -0.4), (0, y + 0.85, 0.55), 0.06, 0x4a4d50)
    k.strut((0, y + 0.85, 0.55), (0, y + 1.55, -0.1), 0.045, 0x4a4d50)
    k.box((0, y + 1.6, -0.1), (1.9, 0.05, 0.12), 0x2a2c2e)  # frotador
    for sx in (-0.95, 0.95):
        k.strut((sx * 0.9, y + 1.6, -0.1), (sx, y + 1.52, -0.1), 0.03, 0x2a2c2e)
    return k.done()


def bake(ob, occ=()):
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 32
    scene.world = scene.world or bpy.data.worlds.new('w')
    scene.world.light_settings.distance = 0.6
    occs = []
    for c, s in occ:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=B(*c))
        o = bpy.context.active_object
        o.scale = (s[0], s[2], s[1])
        occs.append(o)
    me = ob.data
    me.materials.append(bpy.data.materials.new(ob.name))
    ca = me.color_attributes.new('ao', 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = ca
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    ao = [0.5 + 0.5 * d.color[0] for d in ca.data]
    me.color_attributes.remove(ca)
    for o in occs:
        bpy.data.objects.remove(o)
    pal = list(ob['palette'])
    pal = [tuple(pal[i:i + 3]) for i in range(0, len(pal), 3)]
    ci = me.attributes.get('ci')
    col = me.color_attributes.new('col', 'BYTE_COLOR', 'CORNER')
    for poly in me.polygons:
        c = pal[ci.data[poly.index].value] if ci else (1, 1, 1)
        for li in poly.loop_indices:
            col.data[li].color = (c[0] * ao[li], c[1] * ao[li], c[2] * ao[li], 1)
    me.color_attributes.active_color = col
    if ci:
        me.attributes.remove(ci)


os.makedirs(os.path.dirname(GLB), exist_ok=True)
caja = body('tren_caja', False)
cabina = body('tren_cabina', True)
parts = [caja, cabina, bajo(), fuelle(), frente('tren_frente_e', 0x1b4f9c, 0x6ec3ea), frente('tren_frente_d', 0xe0712c), techo(), pantografo()]
# el piso (el riel) y, para lo de abajo y el techo, la carrocería
BODY = ((0, 2.5, 0), (2.9, 3.1, L))
FLOOR = ((0, RAIL - 0.1, 0), (6, 0.2, L + 4))
for ob in parts:
    for o in parts:
        o.hide_render = o is not ob
    occ = [FLOOR]
    if ob.name in ('tren_bajo', 'tren_techo', 'pantografo', 'tren_fuelle'):
        occ.append(BODY if ob.name != 'tren_fuelle' else ((0, 2.5, -0.6), (2.9, 3.1, 1.2)))
    bake(ob, occ)
for o in parts:
    o.hide_render = False
for ob in scene.objects:
    ob.select_set(ob in parts)
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_vertex_color='ACTIVE', export_normals=True, export_texcoords=True, export_materials='NONE')
for ob in parts:
    print(f'{ob.name}: {sum(len(p.vertices) - 2 for p in ob.data.polygons)} triángulos')
print('listo:', GLB)
