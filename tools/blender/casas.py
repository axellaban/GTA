# Piezas de las casas hechas en Blender, sin abrir la interfaz:
#   pip install bpy        (Blender como módulo de Python; probado con 5.0)
#   python3 tools/blender/casas.py
# Sale public/models/houses/casas.glb con piezas que src/casas-kit.js pone en todos los frentes:
#   cornisa  tramo de 2 m de la cornisa moldurada del frente (filete, gola y corona, debajo del borde del
#            techo) y la albardilla que tapa el pretil (con su goterón). El juego estira cada tramo al largo
#            de la pared: el perfil es el mismo a lo largo, así que no se deforma. Origen en el borde del
#            techo, sobre la pared; x a lo largo, y para arriba, +z hacia la calle. Blanca: el color del
#            revoque lo pone el juego (uno por casa).
#   aire     equipo de afuera de un aire acondicionado split: gabinete de cantos redondos, rejilla del
#            ventilador, aletas al costado, ménsulas de hierro y los caños que entran a la pared. Origen
#            en el centro del gabinete; la espalda toca la pared (z = -0,14).
#   toldo    módulo de 1,2 m del toldo de brazos de los comercios: la lona que cae un poco en panza, la
#            barra de adelante y el faldón con festones de verdad. Origen donde se engancha a la pared
#            (y = 0); sale 1,5 m. Las rayas son la textura de los toldos de siempre (u: cuatro rayas).
#   brazo    brazo articulado del toldo (va en cada punta), del soporte en la pared a la barra.
# La sombra de contacto (contra la pared) va horneada en los colores de vértice.
import math
import os

import bpy  # tiene que ir antes que bmesh
import bmesh
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GLB = os.path.join(ROOT, 'public', 'models', 'houses', 'casas.glb')

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


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

    def profile(self, prof, x0, x1, col, caps=True):
        # perfil cerrado en (y, z) barrido a lo largo de x
        tmp = bmesh.new()
        a = [tmp.verts.new(B(x0, y, z)) for y, z in prof]
        b = [tmp.verts.new(B(x1, y, z)) for y, z in prof]
        n = len(prof)
        for i in range(n):
            j = (i + 1) % n
            tmp.faces.new((a[i], a[j], b[j], b[i]))
        if caps:
            tmp.faces.new(list(reversed(a)))
            tmp.faces.new(b)
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
        self._merge(tmp, col)

    def box(self, c, s, col, bevel=0.0):
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        bmesh.ops.scale(tmp, vec=(s[0], s[2], s[1]), verts=tmp.verts)
        bmesh.ops.translate(tmp, vec=B(*c), verts=tmp.verts)
        if bevel > 0:
            bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=bevel, segments=1, affect='EDGES', profile=0.5)
        self._merge(tmp, col)

    def tube(self, pts, r, sides, col, caps=False):
        tmp = bmesh.new()
        P = [Vector(p) for p in pts]
        ref = Vector((1, 0, 0))
        rings = []
        for i, p in enumerate(P):
            d = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
            u = ref - d * ref.dot(d)
            if u.length < 1e-4:
                u = Vector((0, 0, 1)) - d * d.z
            u.normalize()
            ref = u
            w = d.cross(u)
            rings.append([tmp.verts.new(B(*(p + (u * math.cos(t) + w * math.sin(t)) * r))) for t in (2 * math.pi * j / sides for j in range(sides))])
        for a, b in zip(rings, rings[1:]):
            for j in range(sides):
                k = (j + 1) % sides
                tmp.faces.new((a[j], a[k], b[k], b[j]))
        if caps:
            tmp.faces.new(list(reversed(rings[0])))
            tmp.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
        self._merge(tmp, col, smooth=True)

    def disc(self, c, r, sides, col):
        # disco de frente (mira a +z)
        tmp = bmesh.new()
        vs = [tmp.verts.new(B(c[0] + r * math.cos(t), c[1] + r * math.sin(t), c[2])) for t in (2 * math.pi * j / sides for j in range(sides))]
        tmp.faces.new(vs)
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
        f = tmp.faces[0]
        if f.normal.dot(Vector(B(0, 0, 1))) < 0:
            f.normal_flip()
        self._merge(tmp, col)

    def done(self):
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        ob = bpy.data.objects.new(self.name, me)
        scene.collection.objects.link(ob)
        ob['palette'] = [v for c in self.cols for v in c]
        return ob


# ---------------- cornisa ----------------
def cornisa():
    k = Kit('cornisa')
    # (y, z): y desde el borde del techo, z hacia afuera de la pared
    # escalonada, como las de las casas de los 50 y el art déco de Miami: faja, dos escalones, gola y corona
    band = [(-0.44, 0.0), (-0.44, 0.035), (-0.37, 0.035), (-0.37, 0.075), (-0.31, 0.085), (-0.25, 0.13),
            (-0.2, 0.2), (-0.17, 0.22), (-0.06, 0.22), (-0.04, 0.0)]
    k.profile(band, -1.0, 1.0, 0xffffff)
    # albardilla sobre el pretil (el pretil va de 0 a 0,55 y de -0,18 a 0 en z)
    cap = [(0.52, 0.0), (0.52, 0.06), (0.56, 0.075), (0.61, 0.06), (0.62, -0.1), (0.61, -0.21), (0.52, -0.21)]
    k.profile(cap, -1.0, 1.0, 0xffffff, caps=False)
    return k.done()


# ---------------- aire acondicionado ----------------
def aire():
    k = Kit('aire')
    W, H, D = 0.8, 0.5, 0.26
    k.box((0, 0, 0.0), (W, H, D), 0xeceae4, bevel=0.018)
    # rejilla del ventilador: disco oscuro, aro y cruz
    fx = -0.11
    k.disc((fx, 0, D / 2 + 0.004), 0.185, 10, 0x2a2c2e)
    k.box((fx, 0, D / 2 + 0.012), (0.38, 0.018, 0.012), 0xd8d5ce)
    k.box((fx, 0, D / 2 + 0.012), (0.018, 0.38, 0.012), 0xd8d5ce)
    # aletas del intercambiador (costado derecho) y la tapa de las conexiones
    k.box((W / 2 + 0.006, 0, -0.01), (0.012, H - 0.06, D - 0.05), 0x9a978f)
    k.box((W / 2 - 0.09, -0.08, D / 2 + 0.006), (0.14, 0.22, 0.012), 0xdedbd3)
    # ménsulas de hierro: brazo de la pared y diagonal
    for x in (-0.28, 0.28):
        k.box((x, -H / 2 - 0.02, -0.0), (0.035, 0.035, 0.38), 0x5a5f63)
        k.box((x, -H / 2 - 0.14, -0.1), (0.03, 0.26, 0.03), 0x5a5f63)
    # caños con cinta que entran a la pared
    for y in (-0.06, -0.14):
        k.tube([(W / 2 - 0.03, y, D / 2 - 0.04), (W / 2 + 0.07, y, D / 2 - 0.08), (W / 2 + 0.09, y - 0.05, -0.16)], 0.016, 4, 0xe2ded6)
    return k.done()


# ---------------- toldo ----------------
def toldo():
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    W = 0.6
    U = 0.5  # cuatro rayas por módulo (la textura tiene ocho a lo ancho)

    def quad(pts, uvs):
        f = bm.faces.new([bm.verts.new(B(*p)) for p in pts])
        for loop, t in zip(f.loops, uvs):
            loop[uv].uv = t
        return f

    # lona: de la pared (y = 0) a la barra (y = -0,52; z = 1,46), con un poco de panza
    segs = 3
    row = []
    for i in range(segs + 1):
        t = i / segs
        row.append((-0.52 * t - 0.05 * math.sin(math.pi * t), 0.02 + 1.44 * t, 1 - 0.85 * t))
    for (y0, z0, v0), (y1, z1, v1) in zip(row, row[1:]):
        quad([(-W, y0, z0), (W, y0, z0), (W, y1, z1), (-W, y1, z1)], [(0, v0), (U, v0), (U, v1), (0, v1)])
    # faldón: tira derecha y seis festones (medio círculo cada uno)
    zf = 1.49
    quad([(-W, -0.52, zf), (W, -0.52, zf), (W, -0.64, zf), (-W, -0.64, zf)], [(0, 0.15), (U, 0.15), (U, 0.06), (0, 0.06)])
    n = 6
    for k in range(n):
        x0 = -W + 2 * W * k / n
        x1 = x0 + 2 * W / n
        cx = (x0 + x1) / 2
        r = (x1 - x0) / 2
        pts = [(x0, -0.64, zf)] + [(cx - r * math.cos(math.pi * j / 4), -0.64 - r * 0.9 * math.sin(math.pi * j / 4), zf) for j in range(1, 4)] + [(x1, -0.64, zf)]
        f = bm.faces.new([bm.verts.new(B(*p)) for p in pts])
        for loop, (x, y, _) in zip(f.loops, pts):
            loop[uv].uv = ((x + W) / (2 * W) * U, 0.06 + (y + 0.64) * 0.5)
    ob = link_mesh('toldo', bm)
    # barra de adelante (aluminio): otra malla, se une abajo
    k = Kit('toldo_barra')
    k.tube([(-W, -0.53, 1.47), (W, -0.53, 1.47)], 0.03, 4, 0xb8bcc0)
    return ob, k.done()


def brazo():
    k = Kit('brazo')
    k.box((0, -0.62, 0.03), (0.08, 0.16, 0.06), 0x8c9094)
    k.tube([(0, -0.62, 0.05), (0.06, -0.78, 0.78), (0, -0.55, 1.45)], 0.022, 4, 0xa9adb1)
    return k.done()


def link_mesh(name, bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    ob['palette'] = list(hexc(0xffffff))
    return ob


def occluder(c, s):
    # caja (en coordenadas del juego) que hace sombra durante el horneado: la pared, el pretil, el techo
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=B(*c))
    o = bpy.context.active_object
    o.scale = (s[0], s[2], s[1])
    return o


def bake(ob, occluders):
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 64
    scene.world = scene.world or bpy.data.worlds.new('w')
    scene.world.light_settings.distance = 0.35
    walls = [occluder(c, s) for c, s in occluders]
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
    for w in walls:
        bpy.data.objects.remove(w)
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
lona, barra = toldo()
# la barra va en la misma malla que la lona (toma el color de la raya)
bpy.ops.object.select_all(action='DESELECT')
barra.select_set(True)
lona.select_set(True)
bpy.context.view_layer.objects.active = lona
bpy.ops.object.join()
parts = [cornisa(), aire(), brazo(), lona]
for ob in parts:
    for o in parts:
        o.hide_render = o is not ob
    if ob.name == 'cornisa':
        # la pared de abajo, el pretil (hasta la albardilla) y la losa del techo detrás del pretil
        occ = [((0, -1.5, -0.1), (8, 3.0, 0.2)), ((0, 0.265, -0.09), (8, 0.53, 0.18)), ((0, -0.1, -2.18), (8, 0.2, 4.0))]
    elif ob.name in ('toldo', 'brazo'):
        occ = [((0, 0, -0.1), (8, 8, 0.2))]
    else:
        occ = [((0, 0, -0.24), (6, 6, 0.2))]
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
