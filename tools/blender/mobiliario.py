# Mobiliario de la calle hecho en Blender, sin abrir la interfaz:
#   pip install bpy        (Blender como módulo de Python; probado con 5.0)
#   python3 tools/blender/mobiliario.py
# Sale public/models/street/mobiliario.glb con tres piezas que src/mobiliario-kit.js pone en lugar de las
# de cajas de src/props.js, en los mismos marcos (x y z del juego, y para arriba):
#   semaforo    caño redondo con brida, cabezal de cantos redondos con tres viseras y la placa negra de
#               contraste con borde blanco. Origen en la base; el frente mira a +z y las luces (las pone
#               props.js) quedan en (0; 3,35 / 3,07 / 2,79; 0,155), adentro de las viseras.
#   refugio     refugio de colectivo de 3,2 m: cuatro parantes, techo curvo, panel de atrás con marco, cartel
#               de publicidad en una punta y banco de listones. Origen en el piso, al medio; la calle queda
#               hacia -z.
#   contenedor  contenedor de basura de la muni: cuerpo que se abre hacia arriba, tapa abovedada, refuerzos,
#               muñones para el camión, banda reflectiva y cuatro ruedas. Origen en el piso, al medio.
#   tanque      tanque de agua tricapa de los techos: nervaduras, hombro redondeado, tapa a rosca. Gris claro
#               (el color de cada tanque lo pone el juego: negro, beige o fibrocemento). Origen en el centro,
#               1,2 m arriba del techo (como el cilindro de antes).
#   tanque_base la base: dos pilares de ladrillo con la losita arriba y el caño de bajada con la llave de paso.
#               Origen 0,25 m arriba del techo.
#   catenaria   mástil de la catenaria del Roca: perfil doble T de acero galvanizado sobre su dado de hormigón,
#               ménsula (tubo de abajo y tirante de arriba) con los aisladores y el brazo de atirantado que
#               sostiene el hilo de contacto a 5,6 m. Origen al pie del mástil; +x hacia la vía (2,6 m).
# Colores en los vértices con la sombra de contacto horneada (Cycles); el material del juego queda blanco.
import math
import os

import bpy  # tiene que ir antes que bmesh
import bmesh

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GLB = os.path.join(ROOT, 'public', 'models', 'street', 'mobiliario.glb')

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
        self.ci = self.bm.faces.layers.int.new('ci')
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

    def box(self, c, s, col, bevel=0.0, segs=1):
        # caja centrada en c (juego) de medidas s, con los cantos redondeados si bevel > 0
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        bmesh.ops.scale(tmp, vec=(s[0], s[2], s[1]), verts=tmp.verts)
        bmesh.ops.translate(tmp, vec=B(*c), verts=tmp.verts)
        if bevel > 0:
            bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=bevel, segments=segs, affect='EDGES', profile=0.5)
        self._merge(tmp, col, smooth=bevel > 0 and segs > 1)

    def tube(self, pts, r, sides, col, caps=True, smooth=True):
        # tubo por una lista de puntos (juego); r puede ser una lista (un radio por punto)
        tmp = bmesh.new()
        from mathutils import Vector
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
        self._merge(tmp, col, smooth)

    def shell(self, center, r0, r1, z0, z1, a0, a1, segs, col):
        # visera: pedazo de caño (de a0 a a1, en radianes, 0 = derecha, pi/2 = arriba) con espesor
        tmp = bmesh.new()
        cx, cy, _ = center
        outer, inner = [], []
        for i in range(segs + 1):
            a = a0 + (a1 - a0) * i / segs
            ca, sa = math.cos(a), math.sin(a)
            outer.append((tmp.verts.new(B(cx + ca * r1, cy + sa * r1, z0)), tmp.verts.new(B(cx + ca * r1, cy + sa * r1, z1))))
            inner.append((tmp.verts.new(B(cx + ca * r0, cy + sa * r0, z0)), tmp.verts.new(B(cx + ca * r0, cy + sa * r0, z1))))
        for i in range(segs):
            tmp.faces.new((outer[i][0], outer[i + 1][0], outer[i + 1][1], outer[i][1]))
            tmp.faces.new((inner[i][1], inner[i + 1][1], inner[i + 1][0], inner[i][0]))
            tmp.faces.new((outer[i][1], outer[i + 1][1], inner[i + 1][1], inner[i][1]))  # canto de adelante
        for e in (0, segs):
            tmp.faces.new((outer[e][0], outer[e][1], inner[e][1], inner[e][0]))
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
        self._merge(tmp, col)

    def lathe(self, center, prof, sides, col, smooth=True, bottom=True):
        # sólido de revolución alrededor del eje vertical; prof: [(radio, y)] de abajo para arriba
        tmp = bmesh.new()
        cx, cy, cz = center
        rings = [[tmp.verts.new(B(cx + r * math.cos(t), cy + y, cz + r * math.sin(t))) for t in (2 * math.pi * j / sides for j in range(sides))] for r, y in prof]
        for a, b in zip(rings, rings[1:]):
            for j in range(sides):
                k = (j + 1) % sides
                tmp.faces.new((a[j], a[k], b[k], b[j]))
        if bottom:
            tmp.faces.new(list(reversed(rings[0])))
        tmp.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
        self._merge(tmp, col, smooth)

    def done(self):
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        ob = bpy.data.objects.new(self.name, me)
        scene.collection.objects.link(ob)
        ob['palette'] = [v for c in self.cols for v in c]
        return ob


# ---------------- semáforo ----------------
def semaforo():
    k = Kit('semaforo')
    POLE = 0x2d3236
    k.lathe((0, 0, 0), [(0.13, 0), (0.13, 0.03), (0.085, 0.07), (0.065, 0.16)], 10, POLE)  # brida
    k.tube([(0, 0.1, 0), (0, 2.66, 0)], 0.06, 10, POLE)
    k.lathe((0, 2.55, 0), [(0.085, 0), (0.085, 0.1)], 10, POLE)  # collar donde calza el cabezal
    # placa de contraste (negra con borde blanco) y el cabezal
    k.box((0, 3.07, -0.105), (0.6, 1.2, 0.012), 0xe8e4d4)
    k.box((0, 3.07, -0.098), (0.54, 1.14, 0.012), 0x141516)
    k.box((0, 3.07, 0.015), (0.32, 0.9, 0.23), 0x1c1f22, bevel=0.045, segs=2)
    for i, y in enumerate((3.35, 3.07, 2.79)):
        k.tube([(0, y, 0.11), (0, y, 0.135)], 0.118, 14, 0x0c0d0e)  # aro del lente
        k.shell((0, y, 0), 0.118, 0.13, 0.125, 0.33, math.radians(-25), math.radians(205), 9, 0x15171a)
    return k.done()


# ---------------- refugio ----------------
def refugio():
    k = Kit('refugio')
    FRAME = 0x2d5f78
    ROOF = 0x3b7f99
    PANEL = 0x8fb5c2
    W, D, H = 3.2, 1.3, 2.4
    for x in (-1.5, 1.5):
        for z in (-0.6, 0.6):
            k.box((x, H / 2, z), (0.07, H, 0.07), FRAME, bevel=0.012)
    # techo curvo (un arco a lo ancho), con el canto un poco más grueso
    segs = 6
    tmp = bmesh.new()
    rows = []
    for i in range(segs + 1):
        t = i / segs
        z = -0.75 + 1.5 * t
        y = H + 0.08 + 0.16 * math.sin(math.pi * t)
        rows.append((tmp.verts.new(B(-1.65, y, z)), tmp.verts.new(B(1.65, y, z)), tmp.verts.new(B(-1.65, y - 0.04, z)), tmp.verts.new(B(1.65, y - 0.04, z))))
    for a, b in zip(rows, rows[1:]):
        tmp.faces.new((a[0], a[1], b[1], b[0]))
        tmp.faces.new((a[3], a[2], b[2], b[3]))
        tmp.faces.new((a[2], a[0], b[0], b[2]))
        tmp.faces.new((a[1], a[3], b[3], b[1]))
    tmp.faces.new((rows[0][0], rows[0][2], rows[0][3], rows[0][1]))
    tmp.faces.new((rows[-1][1], rows[-1][3], rows[-1][2], rows[-1][0]))
    bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
    k._merge(tmp, ROOF, smooth=True)
    # vigas del techo y travesaños del panel de atrás
    for z in (-0.6, 0.6):
        k.box((0, H + 0.03, z), (3.1, 0.07, 0.06), FRAME)
    k.box((0, 0.35, 0.6), (3.0, 0.06, 0.05), FRAME)
    # panel de atrás (vidrio esmerilado celeste) y cartel de publicidad iluminado en una punta
    k.box((-0.35, 1.32, 0.6), (2.2, 1.9, 0.025), PANEL)
    k.box((1.05, 1.3, 0.6), (0.85, 1.95, 0.14), 0x1f2a30, bevel=0.02)
    k.box((1.05, 1.3, 0.53), (0.72, 1.78, 0.01), 0xf2c94c)
    k.box((1.05, 1.3, 0.67), (0.72, 1.78, 0.01), 0xe0566e)
    # banco: tres listones sobre dos patas
    for i in range(3):
        k.box((-0.35, 0.58, 0.18 + i * 0.13), (2.1, 0.035, 0.1), 0x9a6b3e, bevel=0.01)
    for x in (-1.25, 0.55):
        k.box((x, 0.29, 0.31), (0.05, 0.58, 0.32), 0x3a3f44)
    return k.done()


# ---------------- contenedor ----------------
def contenedor():
    k = Kit('contenedor')
    G = 0x2f6b3a
    GD = 0x245530
    L, Wd = 1.8, 1.1
    # cuerpo: más ancho arriba (para que se apilen), de 0,2 a 1,3 m
    tmp = bmesh.new()
    y0, y1 = 0.22, 1.3
    lo = [(-L / 2 + 0.06, -Wd / 2 + 0.06), (L / 2 - 0.06, -Wd / 2 + 0.06), (L / 2 - 0.06, Wd / 2 - 0.06), (-L / 2 + 0.06, Wd / 2 - 0.06)]
    hi = [(-L / 2, -Wd / 2), (L / 2, -Wd / 2), (L / 2, Wd / 2), (-L / 2, Wd / 2)]
    vb = [tmp.verts.new(B(x, y0, z)) for x, z in lo]
    vt = [tmp.verts.new(B(x, y1, z)) for x, z in hi]
    for i in range(4):
        j = (i + 1) % 4
        tmp.faces.new((vb[i], vb[j], vt[j], vt[i]))
    tmp.faces.new(list(reversed(vb)))
    tmp.faces.new(vt)
    bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
    bmesh.ops.bevel(tmp, geom=[e for e in tmp.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 0.5], offset=0.08, segments=2, affect='EDGES', profile=0.5)
    k._merge(tmp, G, smooth=True)
    # borde de arriba, refuerzos verticales y banda reflectiva
    k.box((0, 1.31, 0), (L + 0.06, 0.07, Wd + 0.06), GD, bevel=0.02)
    for x in (-0.55, 0, 0.55):
        for z in (-1, 1):
            k.box((x, 0.78, z * (Wd / 2 - 0.02)), (0.07, 1.0, 0.05), GD)
    for z in (-1, 1):
        k.box((0, 0.62, z * (Wd / 2 - 0.01)), (1.5, 0.08, 0.03), 0xe6e6e6)
    # tapa abovedada (bisagra atrás, en +z), con la manija
    tmp = bmesh.new()
    segs = 5
    rows = []
    for i in range(segs + 1):
        t = i / segs
        z = -Wd / 2 - 0.04 + (Wd + 0.08) * t
        y = 1.35 + 0.12 * math.sin(math.pi * t)
        rows.append((tmp.verts.new(B(-L / 2 - 0.03, y, z)), tmp.verts.new(B(L / 2 + 0.03, y, z))))
    for a, b in zip(rows, rows[1:]):
        tmp.faces.new((a[0], a[1], b[1], b[0]))
    bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
    bmesh.ops.solidify(tmp, geom=tmp.faces[:], thickness=0.03)
    k._merge(tmp, GD, smooth=True)
    k.tube([(-0.3, 1.36, -Wd / 2 - 0.08), (0.3, 1.36, -Wd / 2 - 0.08)], 0.018, 6, 0x1a1a1a)
    # muñones para que lo levante el camión
    for x in (-1, 1):
        k.tube([(x * (L / 2 - 0.02), 1.05, 0), (x * (L / 2 + 0.1), 1.05, 0)], 0.05, 8, 0x3a3f44)
    # ruedas: horquilla y rueda
    for x in (-0.7, 0.7):
        for z in (-0.38, 0.38):
            k.box((x, 0.19, z), (0.12, 0.06, 0.1), 0x3a3f44)
            k.tube([(x - 0.035, 0.09, z), (x + 0.035, 0.09, z)], 0.09, 10, 0x1b1b1b)
    return k.done()


# ---------------- tanque de agua ----------------
def tanque():
    k = Kit('tanque')
    # perfil (radio, y) desde el centro del tanque: apoya en -0,7 (arriba de la base) y la tapa llega a 0,74
    # (8 lados: hay 1.652 tanques; con las normales suaves no se notan las caras)
    prof = [(0.52, -0.7), (0.66, -0.56), (0.66, -0.1), (0.69, -0.04), (0.66, 0.02), (0.66, 0.38), (0.5, 0.6),
            (0.3, 0.71)]
    k.lathe((0, 0, 0), prof, 8, 0xd9d9d9, bottom=False)
    return k.done()


def tanque_base():
    k = Kit('tanque_base')
    BRICK = 0x9e5a3c
    # dos pilares de ladrillo y la losita (la base ocupa de -0,25 a 0,25)
    for x in (-0.5, 0.5):
        k.box((x, -0.06, 0), (0.28, 0.38, 1.2), BRICK)
    k.box((0, 0.19, 0), (1.45, 0.12, 1.45), 0xa6a29a)
    # caño de bajada: sale de abajo del tanque, baja al techo y dobla; llave de paso con manija roja
    P = 0x5b8a5e
    k.tube([(0.2, 0.25, 0.45), (0.2, -0.2, 0.76), (0.2, -0.24, 1.15)], 0.03, 4, P, caps=False)
    k.box((0.2, 0.0, 0.76), (0.16, 0.06, 0.06), 0xc0392b)
    return k.done()


# ---------------- mástil de la catenaria ----------------
def catenaria():
    k = Kit('catenaria')
    G = 0x8d9499
    H = 7.2
    # dado de hormigón y el perfil doble T (dos alas y el alma)
    k.box((0, 0.2, 0), (0.62, 0.5, 0.62), 0xa6a29a)
    for sx in (-1, 1):
        k.box((sx * 0.1, H / 2 + 0.2, 0), (0.02, H, 0.22), G)
    k.box((0, H / 2 + 0.2, 0), (0.18, H, 0.014), G)
    k.box((0, H + 0.22, 0), (0.26, 0.04, 0.26), G)
    # ménsula: tubo de abajo hasta pasar la vía y tirante de arriba, con los aisladores en el mástil
    k.tube([(0.14, 6.1, 0), (3.0, 6.1, 0)], 0.035, 6, G, caps=True)
    k.tube([(0.14, 7.05, 0), (2.7, 6.12, 0)], 0.028, 6, G, caps=True)
    for y in (6.1, 7.05):
        k.tube([(0.12, y, 0), (0.4, y - (0.0 if y < 7 else 0.1), 0)], 0.06, 8, 0x6b4a32, caps=True)
    # brazo de atirantado: del tubo al hilo de contacto (sobre el eje de la vía)
    k.tube([(2.3, 6.1, 0), (2.6, 5.62, 0)], 0.022, 5, G, caps=True)
    k.box((2.6, 5.6, 0), (0.12, 0.05, 0.08), 0x5a5f63)
    # el hilo portador apoya arriba de la ménsula
    k.box((2.6, 6.55, 0), (0.08, 0.5, 0.06), 0x5a5f63)
    return k.done()


def bake(ob):
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 64
    scene.world = scene.world or bpy.data.worlds.new('w')
    scene.world.light_settings.distance = 0.5
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
parts = [semaforo(), refugio(), contenedor(), tanque(), tanque_base(), catenaria()]
bpy.ops.mesh.primitive_plane_add(size=30)
floor = bpy.context.active_object
# dónde está el piso de cada pieza (el tanque apoya en su base y la base en el techo)
FLOOR = {'tanque': -0.7, 'tanque_base': -0.25}
for ob in parts:
    for o in parts:
        o.hide_render = o is not ob
    floor.location.z = FLOOR.get(ob.name, 0.0)
    bake(ob)
for o in parts:
    o.hide_render = False
bpy.data.objects.remove(floor)
for ob in scene.objects:
    ob.select_set(ob in parts)
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_vertex_color='ACTIVE', export_normals=True, export_texcoords=False, export_materials='NONE')
for ob in parts:
    print(f'{ob.name}: {sum(len(p.vertices) - 2 for p in ob.data.polygons)} triángulos')
print('listo:', GLB)
